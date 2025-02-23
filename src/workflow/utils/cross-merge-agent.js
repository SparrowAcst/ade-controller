const { extend, find, isArray, sampleSize, uniqBy, flatten, keys } = require("lodash")

const { Agent } = require("./agent.class")
const { AmqpManager, Middlewares } = require('@molfar/amqp-client')
const segmentationAnalysis = require("../../utils/segmentation/segment-analysis")

const moment = require("moment")
const uuid = require("uuid").v4


const dataDiff = require("../../utils/segmentation/data-diff")


const DEFAULT_OPTIONS = {
    FEEDBACK_DELAY: 2 * 1000,
    DEFFERED_TIMEOUT: [1, "hours"],
    // DEFFERED_TIMEOUT: [15, "seconds"],
    dataCollection: "labels",
    savepointCollection: "savepoints",
    TASK_QUOTE: 10
}

const checkPretendentCriteria = (agent, user) => {

    if (agent.assignPretendent.includes("allways")) return true

    const employeeService = agent.getEmployeeService()
    const { Key } = employeeService
    user = (user.id) ? user : employeeService.employee(user)

    if (agent.assignPretendent.includes("according to schedule")) {
        if (!user.schedule) return false
        if (!isArray(user.schedule)) return false
        if (!user.schedule.includes(agent.ALIAS)) return false
    }

    if (agent.assignPretendent.includes("according to quota")) {
        user.taskList = user.taskList || []
        return user.taskList.filter(t => {
            return Key(t.key).taskState() != "submit" && t.disabled != true
        }).length <= agent.TASK_QUOTE
    }

    return true

}


const checkPossibilityOfCreating = async (agent, key) => {

    if (agent.canCreate == "allways") return true

    if (agent.canCreate == "for free data") {

        let manager = await agent.getDataManager(key)
        let mainHead = manager.select(v => v.type == "main" && !v.branch)[0]
        if (mainHead) return true
        return `Task ${key} cannot be created because the data is locked by another task.`
    }

    return false

}


const Cross_Merge_Agent = class extends Agent {

    constructor(options) {

        options = extend({}, DEFAULT_OPTIONS, options)
        options.ALIAS = `${options.WORKFLOW_TYPE}_${options.name.split(" ").join("_")}`

        super({
            alias: options.ALIAS,
            FEEDBACK_DELAY: options.FEEDBACK_DELAY
        })

        this.ALIAS = options.ALIAS
        this.WORKFLOW_TYPE = options.WORKFLOW_TYPE
        // this.FEEDBACK_DELAY = options.FEEDBACK_DELAY 
        this.DEFFERED_TIMEOUT = options.DEFFERED_TIMEOUT
        this.TASK_QUOTE = options.TASK_QUOTE
        this.NEXT_AGENT = options.NEXT_AGENT || (options.submitTo) ? `${options.WORKFLOW_TYPE}_${options.submitTo.split(" ").join("_")}` : undefined
        this.PREV_AGENT = options.PREV_AGENT || (options.rejectTo) ? `${options.WORKFLOW_TYPE}_${options.rejectTo.split(" ").join("_")}` : undefined
        this.dataCollection = options.dataCollection
        this.savepointCollection = options.savepointCollection
        this.decoration = options.decoration
        this.uiPermissions = options.availableCommands
        this.canCreate = options.canCreate
        this.assignPretendent = options.assignPretendent
        this.initialStatus = options.initialStatus || "start"
        this.noSyncAltVersions = true
        // console.log(this)
    }


    async create({ user, sourceKey, metadata, waitFor, release, altVersions }) {

        console.log(`${this.ALIAS} create...`)

        const { Task } = this.getEmployeeService()

        await super.create({
            user,
            key: sourceKey,
            initialStatus: this.initialStatus,
            altVersions,
            metadata: extend({}, metadata, {
                task: this.ALIAS,
                status: "start",
                decoration: this.decoration
            }),
            noSyncAltVersions: this.noSyncAltVersions,
            waitFor,
            release
        })

    }


    pretendentCriteria(user) {
        return checkPretendentCriteria(this, user)
    }

    async possibilityOfCreating(key) {
        let res = await checkPossibilityOfCreating(this, key)
        return res
    }

    uiPermissions() {
        return this.uiPermissions
    }


    async read(taskKey) {

        const { Task } = this.getEmployeeService()
        let result = await Task.context(taskKey)
        let altVersions = await Task.altVersions(taskKey)

        let diffs = altVersions.map(alt => {
            return dataDiff.getDifference(result.data, alt.data)
        })

        result = extend(result, {
            agent: this.alias,
            altVersions,
            dataDiff: uniqBy(flatten(diffs.map(d => d.formatted.map(d => d.key)))),
            uiPermissions: this.uiPermissions
        })

        return result
    }


    async getSegmentationAnalysis(sourceKey) {
        
        const { Key } = this.getEmployeeService()
        
        let data = await this.read(sourceKey)
        let result = await super.getSegmentationAnalysis(sourceKey)

        let segmentation = segmentationAnalysis.parse(data.data.segmentation).segments
        let altSegmentations = data.altVersions
            .map(a => a.data.segmentation)
            .map(d => (d) ? segmentationAnalysis.parse(d).segments : [])

        let segmentations =  [segmentation].concat(altSegmentations)   
        if (altSegmentations.length > 0) {
            result.diff = segmentationAnalysis.getSegmentsDiff(segmentations)
            let inconsistency = segmentationAnalysis.getNonConsistencyIntervalsForSegments(result.diff)
            result.charts = result.charts || {}
            let users = ["me"].concat(data.altVersions.map(d => d.version.user || ""))
            result.charts.segmentation = segmentationAnalysis.getMultiSegmentationChart(users, segmentations, inconsistency)
        }


        return result
    }

    async save({ user, sourceKey, data, metadata }) {

        console.log(`${this.ALIAS} save...`)
        const employeeService = this.getEmployeeService()
        const { Task } = employeeService

        let ctx = await this.read(sourceKey)
        let initiator = ctx.task.metadata.initiator

        let result = await Task.save({
            user,
            sourceKey,
            iteration: ctx.task.iteration,
            data,
            altVersions: ctx.task.altVersions,
            noSyncAltVersions: this.noSyncAltVersions,
            metadata: extend({}, metadata, {
                task: this.ALIAS,
                initiator,
                employee: user,
                status: "save",
                decoration: this.decoration
            })
        })

        return result

    }


    async submit({ user, sourceKey, data, metadata }) {

        console.log(`${this.ALIAS} submit...`)

        const employeeService = this.getEmployeeService()
        const { Task } = employeeService

        let ctx = await this.read(sourceKey)
        let initiator = ctx.task.metadata.initiator

        let result = await Task.submit({
            user,
            sourceKey,
            data,
            defferedTimeout: this.DEFFERED_TIMEOUT,
            metadata: extend({}, metadata, {
                task: this.ALIAS,
                initiator,
                employee: user,
                expiredAt: moment(new Date()).add(...this.DEFFERED_TIMEOUT).toDate(),
                status: "submit",
                decoration: this.decoration
            })
        })

        this.getAgent("Deferred").send({
            agent: this.ALIAS,
            expiredAt: moment(new Date()).add(...this.DEFFERED_TIMEOUT).toDate(),
            content: {
                user,
                sourceKey: result.key,
                data: data,
                metadata: extend({}, result.metadata, {
                    task: this.ALIAS,
                    initiator,
                    employee: user,
                    status: "commit"
                })
            }
        })

        return result

    }

    async rollback({ user, sourceKey }) {

        console.log(`${this.ALIAS} rollback...`)

        const employeeService = this.getEmployeeService()
        const { Task } = employeeService

        let ctx = await this.read(sourceKey)

        if (ctx.task && ctx.task.lock) return

        let initiator = ctx.task.metadata.initiator

        let result = await Task.rollback({
            user,
            sourceKey,
            metadata: {
                task: this.ALIAS,
                initiator,
                employee: user,
                status: "rollback",
                decoration: this.decoration
            }
        })

        return result

    }

    async fastForward({ user, sourceKey }) {

        console.log(`${this.ALIAS} fastForward...`)

        const employeeService = this.getEmployeeService()
        const { Task, employee } = employeeService

        const emp = employee(user)
        let f = find(emp.taskList || [], t => t.key == sourceKey)
        if (!f) {
            return
        }

        let ctx = await this.read(sourceKey)

        if (ctx.task && ctx.task.lock) return

        this.getAgent("Deferred").send({
            agent: this.ALIAS,
            ignore: sourceKey
        })   
        
        await this.commit({
                user,
                data: ctx.data,
                sourceKey,
                metadata: {
                    task: this.ALIAS,
                    employee: user,
                    status: "commit",
                    decoration: this.decoration
                }
            }
        )

    }


    async commit({ user, sourceKey, data, metadata }) {

        console.log(`${this.ALIAS} commit...`, metadata)

        metadata.expiredAt = null

        const employeeService = this.getEmployeeService()
        const { Task, employee } = employeeService

        const emp = employee(user)
        let f = find(emp.taskList || [], t => t.key == sourceKey)
        if (!f) {
            return
        }

        let ctx = await this.read(sourceKey)
        let initiator = ctx.task.metadata.initiator
        let rejector = ctx.task.metadata.rejector

        let result

        if (this.NEXT_AGENT) {

            console.log(`${this.ALIAS} create task with ${this.NEXT_AGENT}...`)

            await this.getAgent(this.NEXT_AGENT).lock({ user, sourceKey })

            result = await this.getAgent(this.NEXT_AGENT).create({
                user: rejector,
                sourceKey,
                metadata: extend({}, metadata, {
                    initiator: user,
                    decoration: this.decoration
                }),
                release: { user, sourceKey }
            })


        } else {
            console.log(`${this.ALIAS} commit changes...`)

            result = await Task.commit({
                user,
                data,
                sourceKey,
                metadata: {
                    task: this.ALIAS,
                    initiator,
                    employee: user,
                    status: "commit",
                    decoration: this.decoration
                }
            })
        }

        return result

    }


    async reject({ user, sourceKey, metadata }) {

        console.log(`${this.ALIAS} reject...`)

        if (!this.PREV_AGENT) return

        const employeeService = this.getEmployeeService()
        const { Task, employee } = employeeService

        let ctx = await this.read(sourceKey)
        let initiator = ctx.task.metadata.initiator

        let result = await this.getAgent(this.PREV_AGENT).create({
            user: initiator,
            sourceKey,
            altVersions: ctx.task.altVersions,
            metadata: extend({}, metadata, {
                rejector: user,
                initiator: user,
                decoration: this.decoration
            }),
            waitFor: user,
            release: { user, sourceKey }
        })

        return result

    }

    async getSegmentationRequestData(sourceKey) {

        let options = await this.read(sourceKey)
        if (!options) return {}
            
        let altSegmentations = options.altVersions
            .map(a => a.data.segmentation)
            .map(d => (d) ? segmentationAnalysis.parse(d).segments : [])

        let inconsistency = []
        if (altSegmentations.length > 0) {
            let diff = segmentationAnalysis.getSegmentsDiff(altSegmentations)
            inconsistency = segmentationAnalysis.getNonConsistencyIntervalsForSegments(diff)
            inconsistency = inconsistency.map(d => [d.start.toFixed(3), d.end.toFixed(3)])
        }    


        let segmentationData = (options.data.segmentation) ? {
            user: options.task.user,
            readonly: options.version.readonly,
            segmentation: options.data.segmentation
        } : (options.data.aiSegmentation) ? {
            user: options.task.user,
            readonly: options.version.readonly,
            segmentation: options.data.aiSegmentation
        } : undefined

        let requestData = {
            "patientId": options.data.examinationId,
            "recordId": options.data.id,
            "spot": options.data["Body Spot"],
            "position": options.data["Body Position"],
            "device": options.data.model,
            "path": options.data.id,
            "Systolic murmurs": options.data["Systolic murmurs"],
            "Diastolic murmurs": options.data["Diastolic murmurs"],
            "Other murmurs": options.data["Other murmurs"],
            inconsistency,
            "data": ((segmentationData) ? [segmentationData] : [])
                    .concat(options.altVersions.map((a, index) => ({
                        user: a.version.user +"-"+index,
                        readonly: true,
                        segmentation: altSegmentations[index]
                    })))
        }

        return requestData
    }

    async updateSegmentationData({ sourceKey, data }) {

        await this.updateData({
            sourceKey,
            update: {
                segmentation: data
            }
        })
    }

}


module.exports = Cross_Merge_Agent