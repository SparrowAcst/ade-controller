const {
    extend,
    isFunction,
    find,
    remove,
    first,
    last,
    flatten,
    sortBy,
    uniqBy,
    keys,
    set,
    groupBy,
    isArray
} = require("lodash")

const jsondiffpatch = require('jsondiffpatch')

const Diff = jsondiffpatch.create({
    objectHash: (d, index)  => {
        let c = JSON.parse(JSON.stringify(d))
        delete c.grade
        return JSON.stringify(c)
    } 
})



const uuid = require("uuid").v4

const Moment = require('moment');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);


const EventEmitter = require("events")

const NodeCache = require("node-cache")
const CACHE = new NodeCache({
    useClones: false,
    stdTTL: 30 * 60,
    checkperiod: 5 * 60
}) // Time to Life = 30*60 s = 30 min, Check Period: 5*60 s = 5 min)


let DEFFERED_TIMEOUT = ["5", "mins"]

let DATAVIEW = {
    labels: d => ({
        id: d.id
    }),
    examinations: d => ({
        id: d.id
    })
}

const docdb = require("../../utils/docdb")

const config = require("../../../.config")
const db = config.docdb
const configRB = config.rabbitmq

const { getPublisher, getConsumer } = require("./data-version-messages")

const storeInDB = async event => {
    let publisher = await getPublisher()
    publisher.send(extend(event, { command: "store" }))
}

const delFromDB = async event => {
    let publisher = await getPublisher()
    publisher.send(extend(event, { command: "delete" }))
}

const createVersionChart = require("./data-version-chart")
const Key = require("./task-key")


const VersionManager = class extends EventEmitter {


    constructor(options) {

        super();

        this.key = options.managerKey;

        ([
            this.schema,
            this.dataCollection,
            this.dataId,
            this.savepointCollection
        ] = options.managerKey.split("."));

        this.versions = options.versions
        this.data = options.data
        this.on("store", storeInDB)
        this.on("delete", delFromDB)

    }


    getVersion(versionId) {
        return find(this.versions, v => v.id == versionId)
    }

    getData(versionId) {
        // console.log("GET DATA", versionId)
        let version = find(this.versions, v => v.id == versionId)
        let data = JSON.parse(JSON.stringify(this.data))
        if (version) {
            version.patches.forEach( patch => {
                let p = JSON.parse(JSON.stringify(patch))
                // console.log("BEFORE DATA", data.segmentation)
                // console.log("BEFORE PATCH", JSON.stringify(p, null, " "))
                Diff.patch(data, p)
                // console.log("AFTER PATCH", JSON.stringify(p, null, " "))
                // console.log("AFTER DATA", data.segmentation)
            })
        }
        return data
    }


    select(selector) {
        selector = selector || (() => true)
        return this.versions.filter(selector)
    }

    updateData(options) {
        // console.log("updateData")
        let { source, update } = options
        let version = this.getVersion(source.id)
        let prevData = JSON.parse(JSON.stringify(this.getData(source.id)))
        let data = JSON.parse(JSON.stringify(prevData))

        keys(update).forEach(key => {
            // console.log("----",key, update[key])
            set(data, key, JSON.parse(JSON.stringify(update[key])))
        })
        // console.log("BEFORE version.patches", JSON.stringify(version.patches, null, " "))
        version.patches = version.patches.concat([Diff.diff(prevData, data)]).filter(d => d)
        // console.log("AFTER version.patches", JSON.stringify(version.patches, null, " "))
        this.emit("store", {
            collection: `${this.schema}.${this.savepointCollection}`,
            data: [version]
        })

    }

    createBranch(options = {}) {

        try {
            let { user, source, metadata } = options
            let parent = this.getVersion(source.id)

            if (!parent) {
                let mainHead = this.select(v => v.type == "main" && !v.branch)[0]
                if (!mainHead) {
                    throw new Error(`Data Version Manager #createBranch: source ${source.id} not found`)
                }
                parent = this.getVersion(mainHead.id)
            }

            // if(parent.type == "main" && parent.branch && parent.branch.length > 0) throw new Error(`Data Version Manager #createBranch: source ${source.id}. Data is locked by another task`)

            let parentData = this.getData(source.id)

            const id = uuid()

            let newBranch = {
                id,
                key: `${this.key}.${id}`,
                dataId: this.dataId,
                user,
                prev: [{
                    id: parent.id
                }],
                head: true,
                patches: parent.patches,
                createdAt: new Date(),
                log: (parent.log || []).concat([{
                    user,
                    date: new Date(),
                    versionId: id,
                    metadata: (metadata || {})
                }]),
                readonly: false,
                dataView: parent.dataView,
                type: "branch"
            }

            parent.branch = (parent.branch || []).concat([newBranch.id])

            parent.readonly = true
            this.versions.push(newBranch)
            this.emit("store", {
                collection: `${this.schema}.${this.savepointCollection}`,
                data: [newBranch, parent]
            })


            return newBranch

        } catch (e) {

            throw e

        }
    }

    createSavepoint(options = {}) {

        try {

            let { user, source, data, metadata } = options

            let parent = this.getVersion(source.id)
            if (!parent) throw new Error(`Data Version Manager #createSavePoint: source ${source.id || source} not found`)
            let parentData = this.getData(source.id)

            const id = uuid()

            let newSavePoint = {
                id,
                key: `${this.key}.${id}`,
                dataId: this.dataId,
                user,
                prev: [{
                    id: parent.id
                }],
                log: (parent.log || []).concat([{
                    user,
                    date: new Date(),
                    versionId: id,
                    metadata: (metadata || {})
                }]),
                head: true,
                createdAt: new Date(),
                patches: parent.patches.concat([Diff.diff(parentData, data)]).filter(d => d),
                type: "save",
                dataView: DATAVIEW[this.dataCollection](data),
                readonly: false
            }

            parent.head = false
            parent.readonly = true
            parent.save = newSavePoint.id

            this.versions.push(newSavePoint)

            this.emit("store", {
                collection: `${this.schema}.${this.savepointCollection}`,
                data: [parent, newSavePoint]
            })

            return newSavePoint

        } catch (e) {

            throw e

        }
    }

    createSubmit(options = {}) {

        try {

            let { user, source, data, metadata, defferedTimeout, deffered } = options

            deffered = deffered || !!defferedTimeout
            defferedTimeout = defferedTimeout || DEFFERED_TIMEOUT


            let parent = this.getVersion(source.id)
            if (!parent) throw new Error(`Data Version Manager #createSubmit: source ${source.id || source} not found`)
            let parentData = this.getData(source.id)

            const id = uuid()

            let newSubmit = {
                id,
                key: `${this.key}.${id}`,
                dataId: this.dataId,
                user,
                prev: [{
                    id: parent.id
                }],
                log: (parent.log || []).concat([{
                    user,
                    date: new Date(),
                    versionId: id,
                    metadata: (metadata || {})
                }]),
                head: true,
                createdAt: new Date(),
                patches: parent.patches.concat([Diff.diff(parentData, data)]).filter(d => d),
                type: "submit",
                expiredAt: (deffered) ? moment(new Date()).add(...defferedTimeout).toDate() : new Date(),
                dataView: DATAVIEW[this.dataCollection](data),
                readonly: false
            }

            parent.head = false
            parent.readonly = true
            parent.submit = newSubmit.id

            this.versions.push(newSubmit)

            this.emit("store", {
                collection: `${this.schema}.${this.savepointCollection}`,
                data: [parent, newSubmit]
            })

            return newSubmit

        } catch (e) {

            throw e

        }
    }

    rollbackSubmit(options = {}) {
        try {

            let { user, source, metadata } = options

            let parent = this.getVersion(source.id)
            if (!parent) throw new Error(`Data Version Manager #createSavePoint: source ${source.id || source} not found`)
            let sourceData = this.getData(source.id)
            parent = this.getVersion((parent.prev[0]) ? parent.prev[0].id : undefined)
            if (!parent) throw new Error(`Data Version Manager #createSavePoint: source ${parent.id || parent} not found`)

            let parentData = this.getData(parent.id)

            const id = uuid()

            let newSavePoint = {
                id,
                key: `${this.key}.${id}`,
                dataId: this.dataId,
                user,
                prev: [{
                    id: parent.id
                }],
                log: (parent.log || []).concat([{
                    user,
                    date: new Date(),
                    versionId: id,
                    metadata: (metadata || {})
                }]),
                head: true,
                createdAt: new Date(),
                patches: parent.patches.concat([Diff.diff(sourceData, parentData)]).filter(d => d),
                type: "save",
                dataView: DATAVIEW[this.dataCollection](parentData),
                readonly: false
            }

            parent.head = false
            parent.readonly = true
            parent.save = newSavePoint.id

            this.versions.push(newSavePoint)

            this.emit("store", {
                collection: `${this.schema}.${this.savepointCollection}`,
                data: [parent, newSavePoint]
            })

            return newSavePoint

        } catch (e) {

            throw e

        }

    }

    createCommit(options = {}) {

        try {

            let { user, source, data, metadata } = options

            let parent = this.getVersion(source.id)
            if (!parent) throw new Error(`Data Version Manager #createCommit: source ${source.id || source} not found`)

            const id = uuid()

            let newCommit = {
                id,
                key: `${this.key}.${id}`,
                dataId: this.dataId,
                prev: [{
                    id: parent.id
                }],
                log: (parent.log || []).concat([{
                    user,
                    date: new Date(),
                    versionId: id,
                    metadata: (metadata || {})
                }]),
                patches: [],
                head: true,
                createdAt: new Date(),
                type: "main",
                readonly: true,
                dataView: DATAVIEW[this.dataCollection](data)
            }

            data.commits = data.commits || []
            data.commits.push({
                date: new Date(),
                workflow: metadata.workflow,
                log: newCommit.log
            })

            parent.commit = newCommit.id
            parent.head = false
            parent.readonly = true

            let headVersions = this.select(d => d.head == true)
            headVersions.forEach(v => {
                v.head = false
            })

            let mainVersions = this.select(d => !d.user)
            mainVersions.forEach(v => {
                let versionData = this.getData(v.id)
                v.patches = [Diff.diff(data, versionData)].filter(d => d)
                v.head = false
            })

            this.versions.push(newCommit)

            this.emit("store", {
                collection: `${this.schema}.${this.savepointCollection}`,
                data: [newCommit, parent].concat(headVersions).concat(mainVersions)
            })

            this.data = data

            this.emit("store", {
                collection: `${this.schema}.${this.dataCollection}`,
                data: [data]
            })

            return newCommit

        } catch (e) {

            throw e

        }
    }


    createMerge(options = {}) {

        try {


            let { user, altVersions, data, metadata } = options

            let parents = altVersions.map(s => this.getVersion(Key(s).versionId()))
            // console.log(parents)

            if (!parents) throw new Error(`Data Version Manager #merge: source list is empty`)

            let prev = []
            const id = uuid()

            parents.forEach(parent => {
                let parentData = this.getData(parent.id)
                prev.push({
                    id: parent.id,
                    patch: parent.patches.concat([Diff.diff(parentData, data)]).filter(d => d)
                })
                parent.head = false
                parent.merge = id
                parent.readonly = true
            })

            let newMerge = {
                id,
                key: `${this.key}.${id}`,
                dataId: this.dataId,
                user,
                prev,
                log: sortBy(uniqBy(flatten(parents.map(p => p.log)), d => d.id), d => d.date).concat([{
                    user,
                    date: new Date(),
                    versionId: id,
                    metadata: (metadata || {})
                }]),
                patches: prev[0].patch,
                head: true,
                createdAt: new Date(),
                type: "merge",
                dataView: DATAVIEW[this.dataCollection](data)
            }

            this.versions.push(newMerge)

            this.emit("store", {
                collection: `${this.schema}.${this.savepointCollection}`,
                data: [newMerge].concat(parents)
            })


            return newMerge

        } catch (e) {

            throw e

        }

    }

    getChart(options) {
        options = options || {}
        let versionsView = this.versions.map(v => extend({}, v))
        return createVersionChart({
            versions: versionsView,
            formatComment: options.formatComment,
            formatDate: options.formatDate
        })
    }

    getHistory(options = {}) {

        let { maxDepth, stopAt, version } = options


        if (!version) throw new Error((`Data Version Manager #getHistory: version undefined`))

        stopAt = stopAt || (() => false)
        stopAt = (isFunction(stopAt)) ? stopAt : (() => false)
        maxDepth = maxDepth || Infinity

        let res = [version]
        let current = version
        let f = find(this.versions, v => v.id == ((current.prev) ? (current.prev[0]) ? current.prev[0].id : null : null))
        let step = 1
        while (f && (step < maxDepth) && !stopAt(current)) {
            res.push(f)
            current = f
            step++
            f = find(this.versions, v => v.id == ((current.prev) ? (current.prev[0]) ? current.prev[0].id : null : null))
        }

        return res
    }






}


const initVersions = async settings => {

    let schema, dataCollection, savepointCollection, dataId

    // console.log("initVersions", settings)

    let { key } = settings

    if (key) {

        ([schema, dataCollection, dataId, savepointCollection] = key.split("."))

    } else {

        ({ schema, dataCollection, dataId, savepointCollection } = settings)

    }

    let data = await docdb.aggregate({
        db,
        collection: `${schema}.${dataCollection}`,
        pipeline: [{ $match: { id: dataId } }, { $project: { _id: 0 } }]
    })

    data = data[0]

    const id = uuid()

    // console.log("DATAVIEW", dataCollection)

    let initialCommit = {
        id,
        key: `${schema}.${dataCollection}.${dataId}.${savepointCollection}.${id}`,
        dataId,
        prev: [],
        log: [{
            id,
            date: new Date(),
            versionId: id,
            metadata: {
                state: "Initialize data versioning"
            }
        }],
        patches: [],
        head: true,
        createdAt: new Date(),
        type: "main",
        readonly: true,
        dataView: DATAVIEW[dataCollection](data)
    }

    await storeInDB({
        collection: `${schema}.${savepointCollection}`,
        data: [initialCommit]
    })

    return {
        versions: [initialCommit],
        data
    }

}

const getManager = async settings => {

    let schema, dataCollection, savepointCollection, dataId

    let { key } = settings

    if (key) {
        ([schema, dataCollection, dataId, savepointCollection] = key.split("."))
    } else {
        ({ schema, dataCollection, dataId, savepointCollection } = settings)
    }

    const managerKey = `${schema}.${dataCollection}.${dataId}.${savepointCollection}`


    if (CACHE.has(managerKey)) return CACHE.get(managerKey)

    let versions = await docdb.aggregate({
        db,
        collection: `${schema}.${savepointCollection}`,
        pipeline: [{ $match: { dataId } }, { $project: { _id: 0 } }]
    })

    if (versions.length == 0) {

        let initial = await initVersions(settings)

        CACHE.set(managerKey, new VersionManager({
            managerKey,
            versions: initial.versions,
            data: initial.data
        }))

    } else {

        let data = await docdb.aggregate({
            db,
            collection: `${schema}.${dataCollection}`,
            pipeline: [{ $match: { id: dataId } }, { $project: { _id: 0 } }]
        })

        data = data[0]

        CACHE.set(managerKey, new VersionManager({
            managerKey,
            versions,
            data
        }))

    }

    return CACHE.get(managerKey)

}

const select = selector => {
    selector = selector || (() => true)
    let result = CACHE.keys()
        .filter(selector)
        .map(key => CACHE.get(key))
}


const getTimeline = (data, options) => {
    
    const {startedAt, unit, format} = options
    const states = ["start", "submit", "save", "rollback", "reject"]

    const range = moment.range(startedAt, moment())
    let axis = Array.from(range.by(unit, { step: 1 }))
    let ranges = []
    for (let i = 0; i < axis.length - 1; i++) {
        ranges.push(moment.range(axis[i], axis[i + 1]))
    }
    ranges.push(moment.range(last(axis), new Date()))

    let result = {}
    states.forEach(state => {
    
        // let res = data.filter(d => d.description.taskState == state)
        let res = data.filter(d => d.metadata.status == state)

        result[state]  = ranges.map(r => ({
            date: r.start.toDate(), //format(format),
            value: res.filter(d => r.contains(moment(d.createdAt))).length
        }))
    
    })

    return result
}


const getEmployeeStats = async options => {

    const availableIntervals = ["year1", "month1", "day7", "hour24"]
    let { user, intervals } = options

    user = isArray(user) ? user : [user]

    intervals = intervals || ["hour24"]
    intervals = isArray(intervals) ? intervals : [intervals]
    intervals = intervals.filter( i => availableIntervals.includes(i))
    intervals = (intervals.length == 0) ? ["hour24"] : intervals

    const settings = {
        "year1": {
            priority: 1,
            unit: "month", 
            format: "MMM YYYY", 
            startedAt: moment()
                .subtract(1, 'years')
                .hours(0)
                .minutes(0)
                .seconds(0)
                .toDate()
        },
        "month1": {
            priority: 2,
            unit: "day", 
            format: "MMM DD", 
            startedAt: moment()
                .subtract(1, 'months')
                .hours(0)
                .minutes(0)
                .seconds(0)
                .toDate()
        },
        "day7": {
            priority: 3,
            unit: "day", 
            format: "MMM DD", 
            startedAt: moment()
                .subtract(7, 'days')
                .hours(0)
                .minutes(0)
                .seconds(0)
                .toDate()
        },
        "hour24": {
            priority: 4,
            unit: "hour", 
            format: "HH:mm", 
            startedAt: moment()
                .subtract(1, 'days')
                .minutes(0)
                .seconds(0)
                .toDate()
        },
        default: {
            priority: 6,
            unit: "hour", 
            format: "HH:mm", 
            startedAt: moment()
                .subtract(1, 'days')
                .minutes(0)
                .seconds(0)
                .toDate()
        }
    }

    let startedAt = sortBy(intervals.map(i => settings[i] || settings.default), d => d.priority)[0].startedAt

    let pipeline = [{
            $addFields: {
                createdAt: {
                    $dateFromString: {
                        dateString: "$createdAt",
                    },
                },
            },
        },
        {
            $match: {
                user: {
                    $in: user
                },
                createdAt: {
                    $gte: startedAt,
                },
            },
        },
        {
            $project: {
                _id: 0,
                createdAt: 1,
                user: 1,
                description: 1,
                metadata: 1
            },
        },
    ]

    let data = await docdb.aggregate({
        db,
        collection: `ADE-SETTINGS.task-log`,
        pipeline
    })

    let result = user.map(u => {
        let d = data.filter(d => d.user == u)
        let res = {
            user: u
        }
        intervals.forEach( i => {
            res[i] = getTimeline(d, settings[i])
        })

        return res

    })

    return result

}


module.exports = options => {

    DATAVIEW = (options || {}).dataView || DATAVIEW
    DEFFERED_TIMEOUT = (options || {}).defferedTimeout || DEFFERED_TIMEOUT

    return {
        getManager,
        getPublisher,
        getConsumer,
        select,
        getEmployeeStats
    }

}






