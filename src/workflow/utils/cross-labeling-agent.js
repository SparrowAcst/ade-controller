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
    // console.log("user", user)


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

    // console.log("checkPossibilityOfCreating", agent.alias, agent.canCreate, key)

    if (agent.canCreate == "allways") return true

    if (agent.canCreate == "for free data") {

        let manager = await agent.getDataManager(key)
        let mainHead = manager.select(v => v.type == "main" && !v.branch)[0]
        if (mainHead) return true
        return `Task ${key} cannot be created because the data is locked by another task.`
    }

    return false

}


const findPretendents = async (options, agent) => {

    let { user, alias } = options

    altCount = agent.altCount
    const { employes, Task, Key } = agent.getEmployeeService()
    
    let pretendents = []
    let reqCount = 0

    if(agent.requiredExperts){
        reqCount = agent.requiredExperts.length
        pretendents = employes(user => {
            console.log(user.namedAs, agent.requiredExperts.includes(user.namedAs) && agent.pretendentCriteria(user))
            return agent.requiredExperts.includes(user.namedAs) && agent.pretendentCriteria(user)
        })
    }

    console.log("Required experts:", agent.requiredExperts, pretendents.length)

    pretendents = pretendents.concat(sampleSize(employes(user => !agent.requiredExperts.includes(user.namedAs) && agent.pretendentCriteria(user)), altCount - reqCount))    

    if (pretendents.length == altCount) {
        return pretendents //.map(p => p.namedAs)
    }

    return []
}


const createCommand = agent => async (error, message, next) => {

    try {

        // console.log("message.content", message.content)

        const { employes, Task, Key, updateEmployee } = agent.getEmployeeService()

        let {
            alias,
            key,
            user,
            initialStatus,
            metadata,
            waitFor,
            release

        } = message.content

        // console.log("message.content", message.content)

        // console.log("createCommand initialStatus", initialStatus)
        initialStatus = initialStatus || "start"
        // const agent = AGENTS[alias]

        let isPossible = await agent.possibilityOfCreating(agent, key)
        if (isPossible != true) {
            console.log(`Impossble of creation task: ${key}`)
            // console.log(isPossible)
            agent.sendToNoCreate(extend({}, { data: message.content, reason: isPossible }))
            next()
            return
        }

        // console.log("CREATE COMMAND", key)
        let pretendents = await findPretendents(message.content, agent)

        metadata = extend({}, metadata, {
            task: agent.ALIAS,
            status: "start",
            decoration: agent.decoration
        })

        if (pretendents.length == agent.altCount) {

            
            if(Key(key).versionId() == "undefined"){
            
                // console.log("Key(key).versionId():", Key(key).versionId())
            
                let baseBranch = await Task.baseBranch({
                    user: "ADE",
                    sourceKey: Key(key).taskState(initialStatus).get(),
                    metadata: {
                        task: agent.alias,
                        status: "baseBranch",
                        decoration: agent.decoration
                    }
                })
                key = Key(key).versionId(baseBranch.id).get()
            
            }


            let altVersions = []
            for (let pretendent of pretendents) {
                let task = await Task.create({
                    user: pretendent.namedAs,
                    alias,
                    sourceKey: key,
                    iteration: 0,
                    targetKey: Key(key)
                        .agent(alias)
                        .taskId(uuid())
                        .taskState(initialStatus)
                        .get(),
                    metadata,
                    waitFor
                })

                pretendent.temp = task.key
                altVersions.push(task.key)
                console.log(`${Key(task.key).agent()} > ${Key(task.key).get()} > ${pretendent.namedAs}`)

            }

            for (let pretendent of pretendents) {
                let f = find(pretendent.taskList, t => {
                    return t.key == pretendent.temp
                })
                if (f) {
                    f.altVersions = altVersions.map(d => d)
                }
                delete pretendent.temp
                await updateEmployee(pretendent)
            }

        } else {

            console.log(`${agent.alias} > Not assigned ${key}`)
            await agent.sendToScheduler({
                data: message.content
            })

        }

        if (release) {
            console.log(`${Key(key).agent()} release > ${Key(key).get()} > ${release.user}`)
            await Task.release(release)
        }


        next()

    } catch (e) {
        throw e
    }
}


const hasDataInconsistency = dataDiff => dataDiff.length > 0

const hasSegmentationInconsistency = diff => {
    return (diff) ? diff
            .map(diff => keys(diff)
                .map(key => diff[key].length > 0)
                .reduce((a, b) => a || b, false)
            )
            .reduce((a, b) => a || b, false) : false
}

const hasPolygonsInconsistency = diff => diff.length > 0


const getPolygonsInconsistency = polygonArray => {

    let result = []

    polygonArray[0].forEach( pa => {

        let polygonSet = []
        polygonArray.forEach(p => {
            let f = find(p, p => p.name == pa.name)
            if (f) {
                polygonSet.push(f.shapes)
            }
        })
        result.push(
            segmentationAnalysis
            .getPolygonsDiff(polygonSet)
            // .map(d => !!d)
            // .reduce((a, b) => a || b, false)
        )

    })

    // result = result.reduce((a, b) => a || b, false)

    return result

}


const mergePolygons = polygonArray => {

    let res = polygonArray[0].map(pa => {

        let polygonSet = []
        polygonArray.forEach(p => {
            let f = find(p, p => p.name == pa.name)
            if (f) {
                polygonSet.push(f.shapes)
            }

        })

        return {
            name: pa.name,
            shapes: segmentationAnalysis.mergePolygons(polygonSet)
        }
    })

    return res
}


const Cross_Labeling_Agent = class extends Agent {

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
        this.altCount = options.altCount || 2
        this.maxIteration = options.maxIteration || 2
        this.initialStatus = options.initialStatus || "start"
        this.requiredExperts = options.requiredExperts || []
        // console.log("Cross_Labeling_Agent", this)
    }

    async start() {

        // if (!EMPOLOYEE_SERVICE) {
        //     EMPOLOYEE_SERVICE = await EmployeeManager()
        // }

        // console.log("CONSUMER_OPTIONS", this.CONSUMER_OPTIONS)
        // console.log("FEEDBACK_OPTIONS", this.FEEDBACK_OPTIONS)
        // console.log("SCHEDULER_OPTIONS", this.SCHEDULER_OPTIONS)
        // console.log("NO_CREATE_OPTIONS", this.NO_CREATE_OPTIONS)

        this.setTaskDisabled(false)

        this.consumer = await AmqpManager.createConsumer(this.CONSUMER_OPTIONS)

        // console.log(this.FEEDBACK_OPTIONS)

        this.feedbackPublisher = await AmqpManager.createPublisher(this.FEEDBACK_OPTIONS)
        this.feedbackPublisher.use(Middlewares.Json.stringify)

        this.schedulerPublisher = await AmqpManager.createPublisher(this.SCHEDULER_OPTIONS)
        this.schedulerPublisher.use(Middlewares.Json.stringify)

        this.noCreatePublisher = await AmqpManager.createPublisher(this.NO_CREATE_OPTIONS)
        this.noCreatePublisher.use(Middlewares.Json.stringify)


        await this.consumer
            .use(Middlewares.Json.parse)
            .use(createCommand(this))
            .use(Middlewares.Error.Log)
            // .use(Middlewares.Error.BreakChain)
            .use((err, msg, next) => {
                msg.ack()
            })
            .start()

        this.state = "available"

    }

    async create({ user, sourceKey, metadata, waitFor, release }) {

        console.log(`${this.ALIAS} create...`, this.initialStatus)

        const { Task, Key } = this.getEmployeeService()

        // console.log(Key(sourceKey).getDescription())

        await super.create({
            user,
            key: sourceKey,
            initialStatus: this.initialStatus,
            metadata: extend({}, metadata, {
                task: this.ALIAS,
                status: "start",
                decoration: this.decoration
            }),
            altCount: this.altCount,
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

        let data = await this.read(sourceKey)
        let result = await super.getSegmentationAnalysis(sourceKey)

        let altSegmentations = data.altVersions
            .map(a => a.data.segmentation)
            .map(d => (d) ? segmentationAnalysis.parse(d) : [])

        // console.log("PLYGONNS",altSegmentations.map( s => s.polygons))

        if (altSegmentations.length > 0) {
            result.diff = segmentationAnalysis.getSegmentsDiff(altSegmentations.map( s => s.segments))
            result.polygonsDiff = getPolygonsInconsistency(altSegmentations.map( s => s.polygons))//segmentationAnalysis.getPolygonsDiff(altSegmentations.map( s => s.polygons))
            // console.log("result.polygonsDiff", result.polygonsDiff)
            let inconsistency = segmentationAnalysis.getNonConsistencyIntervalsForSegments(result.diff)

            if (result && result.charts) {
                result.charts = result.charts || {}
                result.charts.segmentation = (result && result.segmentation.segments) ?
                    segmentationAnalysis.getSegmentationChart(result, inconsistency) :
                    undefined
            }
        }

        return result
    }

    async hasInconsistency(sourceKey){
        let ctx = await this.read(sourceKey)
        let segCtx = await this.getSegmentationAnalysis(sourceKey)
        let di = hasDataInconsistency(ctx.dataDiff)
        let si = hasSegmentationInconsistency(segCtx.diff)
        let pi = hasPolygonsInconsistency(segCtx.polygonsDiff)
        return di || si || pi
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
        try {
            console.log(`${this.ALIAS} submit...`)

            const employeeService = this.getEmployeeService()
            const { Task } = employeeService

            let ctx = await this.read(sourceKey)
            let initiator = ctx.task.metadata.initiator

            let result = await Task.submit({
                user,
                sourceKey,
                data,
                iteration: ctx.task.iteration + 1,
                altVersions: ctx.task.altVersions,
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

            // ctx = await this.read(result.key)    

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

        } catch (e) {
            console.log(e.toString(), e.stack)
            throw e
        }
    }

    async rollback({ user, sourceKey, metadata }) {

        console.log(`${this.ALIAS} rollback...`)

        const employeeService = this.getEmployeeService()
        const { Task } = employeeService

        let ctx = await this.read(sourceKey)

        if (ctx.task && ctx.task.lock) return

        let initiator = ctx.task.metadata.initiator

        let result = await Task.rollback({
            user: ctx.user.namedAs,
            sourceKey,
            iteration: ctx.task.iteration,
            altVersions: ctx.task.altVersions,
            metadata: extend({}, metadata, {
                task: this.ALIAS,
                initiator,
                employee: ctx.user.namedAs,
                status: "rollback",
                decoration: this.decoration
            })
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

        await this.commit({
            user: user,
            data: ctx.data,
            sourceKey,
            altVersions: ctx.task.altVersions,
            metadata: {
                task: this.ALIAS,
                employee: user,
                status: "commit",
                decoration: this.decoration
            }
        })
    }


    async commit({ user, sourceKey, data, metadata }) {

        console.log(`${this.ALIAS} commit...`)

        const employeeService = this.getEmployeeService()
        const { Task, Key, updateEmployee } = employeeService

        
        let ctx = await this.read(sourceKey)
        // let segCtx = await this.getSegmentationAnalysis(sourceKey)

        // console.log(ctx.altVersions)

        let isPossibleMerge = ctx.altVersions
            .map(a => Key(a.task.key).taskState())
            .filter(s => s == "submit").length == this.altCount

        // console.log(ctx.altVersions
        //     .map(a => Key(a.task.key).taskState())
        //     .filter(s => s == "submit"), this.altCount, isPossibleMerge)

        if (!isPossibleMerge) {
            await Task.updateMetadata({ sourceKey, update: { subState: "Merger expected" } })
            return
        }

        // let hasDataInconsistency = ctx.dataDiff.length > 0

        // let hasSegmentationInconsistency = (segCtx.diff) ?
        //     segCtx.diff
        //     .map(diff => keys(diff)
        //         .map(key => diff[key].length > 0)
        //         .reduce((a, b) => a || b, false)
        //     )
        //     .reduce((a, b) => a || b, false) :
        //     false


        // if (hasDataInconsistency || hasSegmentationInconsistency) {
        const incst =await this.hasInconsistency(sourceKey)
   
        if(incst){            

            if (ctx.task.iteration < this.maxIteration) {

                let altVersions = ctx.altVersions.map(a => Key(a.task.key).taskState("reject").get())

                for (let a of ctx.altVersions) {

                    let t = find(a.user.taskList, t => t.key == a.task.key)
                    t.key = Key(t.key).taskState("reject").get()
                    t.metadata = extend({}, t.metadata, {
                        comment: "Merge attempt failed. Data is not consistent."
                    })
                    t.altVersions = altVersions

                    await updateEmployee(a.user)

                }

            } else {

                let mergedTask = await Task.merge({
                    user,
                    sourceKey: ctx.task.key,
                    metadata: {
                        task: this.ALIAS,
                        employee: user,
                        status: "merge",
                        decoration: this.decoration
                    },
                    data: ctx.data,
                    altVersions: ctx.altVersions,
                    noSyncAltVersions: true
                })
                
                ctx.task = mergedTask
                await this.reject({
                    user,
                    sourceKey: ctx.task.key,
                    altVersions: ctx.altVersions.map(a => a.task.key),
                    metadata: extend({}, metadata, {
                        comment: "Data is not consistent."
                    })
                })
            }

            return

        }

//////////////////////////////////////////////////////////////////////////////////////////////////
        
        let mergedData = segmentationAnalysis.mergeData(ctx.altVersions.map(a => a.data))
        
        let parsedSegmentations = ctx.altVersions
                    .map(a => a.data.segmentation)
                    .map(d => (d) ? segmentationAnalysis.parse(d) : []) 
        
        mergedData.segmentation = segmentationAnalysis.mergeSegments(parsedSegmentations.map(d => d.segments)) || {}
        mergedData.segmentation.Murmur = segmentationAnalysis.polygons2v2(mergePolygons(parsedSegmentations.map(d => d.polygons)))

////////////////////////////////////////////////////////////////////////////////////////////////////
        
        let mergedTask = await Task.merge({
            user,
            sourceKey: ctx.task.key,
            metadata: {
                task: this.ALIAS,
                employee: user,
                status: "merge",
                decoration: this.decoration
            },
            data: mergedData,
            altVersions: ctx.altVersions,
            noSyncAltVersions: true
        })

        if (this.NEXT_AGENT) {

            console.log(`${this.ALIAS} create task with ${this.NEXT_AGENT}...`)

            await this.getAgent(this.NEXT_AGENT).lock({ user, sourceKey })

            await this.getAgent(this.NEXT_AGENT).create({
                // user,
                sourceKey: mergedTask.key,
                altVersions: ctx.altVersions,
                metadata: extend({}, mergedTask.metadata, {
                    initiator: mergedTask.user,
                    decoration: this.decoration
                }),
                release: { user: mergedTask.user, sourceKey: mergedTask.sourceKey }
            })


        } else {
            console.log(`${this.ALIAS} commit changes...`)

            await Task.commit({
                user: mergedTask.user,
                data: mergedData,
                sourceKey: mergedTask.key,
                metadata: {
                    task: this.ALIAS,
                    initiator: mergedTask.user,
                    employee: mergedTask.user,
                    status: "commit",
                    decoration: this.decoration
                }
            })
        }

    }

    async reject(options) {

        console.log(`${this.ALIAS} reject...`)

        if (!this.PREV_AGENT) return

        let result = await this.getAgent(this.PREV_AGENT).create({

            sourceKey: options.sourceKey,
            altVersions: options.altVersions,
            metadata: extend({}, options.metadata, {
                rejector: options.user,
                initiator: options.user,
                decoration: this.decoration
            }),
            waitFor: options.user,
            release: { user: options.user, sourceKey: options.sourceKey }

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
            "data": (segmentationData) ? [segmentationData] : []
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


module.exports = Cross_Labeling_Agent