const { extend, find, isArray, sampleSize, uniqBy, flatten, keys } = require("lodash")


const log = require("./logger")(__filename)

const { Agent } = require("./agent.class")
const { AmqpManager, Middlewares } = require('@molfar/amqp-client')
const segmentationAnalysis = require("../../utils/segmentation/segment-analysis")

const moment = require("moment")
const uuid = require("uuid").v4

const dataDiff = require("../../utils/segmentation/data-diff")

const DEFAULT_OPTIONS = {
    FEEDBACK_DELAY: 2 * 1000,
    DEFFERED_TIMEOUT: [1, "minutes"],
    dataCollection: "labels",
    savepointCollection: "savepoints",
    TASK_QUOTE: 5
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

    return `Task ${key} cannot be created because the canCreate settings is undefined or not in available values`

}


const findPretendent = async (options, agent, altVersions) => {

    const { alias } = options
    const { employes, Task, Key } = agent.getEmployeeService()
    const collaborators = altVersions.map(v => Key(v).user())
    log("Collaborators:", collaborators)

    if (agent.requiredExperts) {
        let pretendents = employes(user => {
            return agent.requiredExperts.experts.includes(user.namedAs) && agent.pretendentCriteria(user)
        })
        let notInvolved = pretendents.filter(p => !collaborators.includes(p.namedAs))
        let involved = collaborators.filter(c => agent.requiredExperts.experts.includes(c))
        log("REQUIRED Pretendents:", pretendents)
        log("REQUIRED notInvolved:", notInvolved)
        log("REQUIRED involved:", involved)
        log("REQUIRED", involved.length, agent.requiredExperts.count)
            
        if (involved.length < agent.requiredExperts.count) {
            if (notInvolved.length > 0) {
                return notInvolved[0]
            } else if ((agent.altCount - collaborators.length) <= (agent.requiredExperts.count - involved.length)) {
                return
            }
        }

    }

    let pretendents = sampleSize(
        employes(user => !agent.requiredExperts.experts.includes(user.namedAs) &&
            agent.pretendentCriteria(user) &&
            !collaborators.includes(user.namedAs)
        ), 1)

    log("Pretendents:", pretendents)

    if (pretendents.length > 0) {
        return pretendents[0]
    }

    return
}

const createCommand = agent => async (error, message, next) => {

    try {

        // log("message.content", message.content)

        const { employes, Task, Key, updateEmployee, getVersionService } = agent.getEmployeeService()

        let {
            alias,
            key,
            user,
            initialStatus,
            altVersions,
            metadata,
            waitFor,
            release

        } = message.content

        initialStatus = initialStatus || "start"
        altVersions = altVersions || []

        let receivedAltVersions = JSON.parse(JSON.stringify(altVersions))

        let pretendent = await findPretendent(message.content, agent, altVersions)

        if (pretendent) {

             let index = altVersions.length

            let comparedVersions = metadata.baseVersions.slice(altVersions.length, altVersions.length + 2)
            if(comparedVersions.length < 2) comparedVersions.push(metadata.baseVersions[0]) 


            metadata = extend({}, metadata, {
                task: agent.ALIAS,
                baseKey: metadata.baseKey || key,
                comparedVersions,
                status: initialStatus,
                decoration: agent.decoration
            })

            let task = await Task.create({
                user: pretendent.namedAs,
                alias,
                sourceKey: metadata.baseKey,
                iteration: 0,
                altVersions,
                targetKey: Key(metadata.baseKey)
                    .user(pretendent.namedAs)
                    .agent(alias)
                    .taskId(uuid())
                    .taskState(initialStatus)
                    .get(),
                metadata,
                waitFor
            })

            let f = find(pretendent.taskList, t => t.key == task.key)

            if (f) {
                f.altVersions = (altVersions.includes(task.key)) ? altVersions : altVersions.concat([task.key])
            }

            await updateEmployee(pretendent)

        } else {

            log(`${agent.alias} > Not assigned ${key}`)
            await agent.sendToScheduler({
                data: message.content
            })

        }

        if (release) {
            log(`${Key(key).agent()} release > ${Key(key).get()} > ${release.user}`)
            await Task.release(release)
        }


        next()

    } catch (e) {
        throw e
    }
}


const hasDataInconsistency = dataDiff => dataDiff && dataDiff.length > 0

const hasSegmentationInconsistency = diff => {
    return (diff) ? diff
        .map(diff => keys(diff)
            .map(key => diff[key].length > 0)
            .reduce((a, b) => a || b, false)
        )
        .reduce((a, b) => a || b, false) : false
}

const hasPolygonsInconsistency = diff => diff && diff.length > 0


const getPolygonsInconsistency = polygonArray => {

    let result = []

    polygonArray[0].forEach(pa => {

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
        )

    })

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


const Cross_Merge_Pipeline_Agent = class extends Agent {

    constructor(options) {

        options = extend({}, DEFAULT_OPTIONS, options)
        options.ALIAS = `${options.WORKFLOW_TYPE}_${options.name.split(" ").join("_")}`

        super({
            alias: options.ALIAS,
            FEEDBACK_DELAY: options.FEEDBACK_DELAY
        })

        this.ALIAS = options.ALIAS
        this.WORKFLOW_TYPE = options.WORKFLOW_TYPE
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
        this.requiredExperts = options.requiredExperts || { count: 0, experts: [] }
    }

    async start() {

        this.setTaskDisabled(false)

        this.consumer = await AmqpManager.createConsumer(this.CONSUMER_OPTIONS)
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
            .use((err, msg, next) => {
                msg.ack()
            })
            .start()

        this.state = "available"

    }

    async create({ user, sourceKey, metadata, waitFor, altVersions, release }) {

        log(`${this.ALIAS} create...`, this.initialStatus)

        const { Task, Key } = this.getEmployeeService()

        await super.create({
            user,
            key: sourceKey,
            initialStatus: this.initialStatus,
            metadata: extend({}, metadata, {
                task: this.ALIAS,
                status: "start",
                decoration: this.decoration
            }),
            altVersions,
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


    async read(taskKey, mode) {
        const { Task } = this.getEmployeeService()
        let result = await Task.context(taskKey)
        mode = mode || "comparedVersions"
        let altVersions = await Task[mode](taskKey)

        let diffs = altVersions.map(alt => {
            return dataDiff.getDifference(result.data, alt.data)
        })

        result = extend(result, {
            agent: this.alias,
            altVersions,
            dataDiff: uniqBy(flatten(diffs.map(d => d.formatted.map(d => d.key)))),
            permissions: this.uiPermissions
        })

        return result
    }

   async getSegmentationAnalysis(sourceKey, mode) {
        
        const { Key } = this.getEmployeeService()
        
        let data = await this.read(sourceKey, mode)
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

    async hasInconsistency(sourceKey, mode) {
        let ctx = await this.read(sourceKey, mode)
        let segCtx = await this.getSegmentationAnalysis(sourceKey, mode)
        let di = hasDataInconsistency(ctx.dataDiff)
        let si = hasSegmentationInconsistency(segCtx.diff)
        let pi = hasPolygonsInconsistency(segCtx.polygonsDiff)
        return di || si || pi
    }

    async save({ user, sourceKey, data, metadata }) {

        log(`${this.ALIAS} save...`)
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
            metadata: extend({}, ctx.task.metadata, {
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
            log(`${this.ALIAS} submit...`)

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
                metadata: extend({}, ctx.task.metadata, metadata, {
                    task: this.ALIAS,
                    initiator,
                    employee: user,
                    expiredAt: moment(new Date()).add(...this.DEFFERED_TIMEOUT).toDate(),
                    status: "submit",
                    decoration: this.decoration
                }),
                waitFor: null
            })

            this.getAgent("Deferred").send({
                agent: this.ALIAS,
                expiredAt: moment(new Date()).add(...this.DEFFERED_TIMEOUT).toDate(),
                content: {
                    user,
                    sourceKey: result.key,
                    data: data,
                    metadata: extend({}, result.metadata, metadata, {
                        task: this.ALIAS,
                        initiator,
                        employee: user,
                        status: "commit"
                    }),
                    waitFor: null
                }
            })

            return result

        } catch (e) {
            log(e.toString(), e.stack)
            throw e
        }
    }

    async rollback({ user, sourceKey, metadata }) {

        log(`${this.ALIAS} rollback...`)

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
            metadata: extend({}, ctx.task.metadata, metadata, {
                task: this.ALIAS,
                initiator,
                employee: ctx.user.namedAs,
                status: "rollback",
                decoration: this.decoration
            }),
            waitFor: null
        })

        return result

    }

    async fastForward({ user, sourceKey }) {

        log(`${this.ALIAS} fastForward...`)

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
            user: user,
            data: ctx.data,
            sourceKey,
            altVersions: ctx.task.altVersions,
            metadata: extend({}, ctx.task.metadata, {
                task: this.ALIAS,
                employee: user,
                status: "commit",
                decoration: this.decoration
            }),
            waitFor: null
        })
    }


    async commit({ user, sourceKey, data, metadata }) {

        log(`${this.ALIAS} commit...`)
        const employeeService = this.getEmployeeService()
        const { Task, Key, updateEmployee } = employeeService

        let ctx = await this.read(sourceKey)

        let isPossibleMerge = ctx.task.altVersions
            .map(a => Key(a).taskState())
            .filter(s => s == "submit").length == this.altCount

        
        log("altVersions", JSON.stringify(ctx.task.altVersions, null, " "))    

        if (!isPossibleMerge) {

            await this.create({
                user,
                sourceKey: ctx.task.key,
                metadata: extend({}, ctx.task.metadata, metadata, {
                    task: this.ALIAS,
                    employee: user,
                    baseKey: ctx.task.metadata.baseKey,
                    baseVersions: ctx.task.metadata.baseVersions,
                    decoration: this.decoration
                }),
                altVersions: ctx.task.altVersions,
                noSyncAltVersions: true,
                release: { user, sourceKey },
                waitFor: null
            })
            // await Task.updateMetadata({ sourceKey, update: { subState: "Merger expected" } })
            return
        }

        const incst = await this.hasInconsistency(sourceKey, "altVersions")

        if (incst) {

                let mergedTask = await Task.merge({
                    user,
                    sourceKey: ctx.task.key,
                    metadata: extend({}, ctx.task.metadata, metadata, {
                        task: this.ALIAS,
                        employee: user,
                        status: "merge",
                        decoration: this.decoration
                    }),
                    data: ctx.data,
                    altVersions: ctx.task.altVersions,
                    noSyncAltVersions: true,
                    waitFor: null

                })

                ctx.task = mergedTask
                await this.reject({
                    user,
                    sourceKey: ctx.task.key,
                    altVersions: [],
                    metadata: extend({}, ctx.task.metadata, metadata, {
                        comment: "Data is not consistent.",
                        baseKey: ctx.task.key,
                        baseVersions: ctx.task.altVersions,
                    }),
                    waitFor: null

                })

                // ctx.task = mergedTask
                // await this.reject({
                //     user,
                //     sourceKey: ctx.task.key,
                //     altVersions: ctx.task.altVersions,
                //     metadata: extend({}, metadata, {
                //         comment: "Data is not consistent."
                //     }),

                // })
 
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
            metadata: extend({}, ctx.task.metadata, metadata, {
                task: this.ALIAS,
                employee: user,
                status: "merge",
                decoration: this.decoration
            }),
            data: mergedData,
            altVersions: ctx.task.altVersions,
            noSyncAltVersions: true,
            waitFor: null
        })

        if (this.NEXT_AGENT) {

            log(`${this.ALIAS} create task with ${this.NEXT_AGENT}...`)

            await this.getAgent(this.NEXT_AGENT).lock({ user, sourceKey })

            await this.getAgent(this.NEXT_AGENT).create({
                // user,
                sourceKey: mergedTask.key,
                altVersions: ctx.task.altVersions,
                metadata: extend({}, mergedTask.metadata, metadata, {
                    initiator: mergedTask.user,
                    decoration: this.decoration
                }),
                release: { user: mergedTask.user, sourceKey: mergedTask.sourceKey },
                waitFor: null
            })


        } else {
            log(`${this.ALIAS} commit changes...`)

            await Task.commit({
                user: mergedTask.user,
                data: mergedData,
                sourceKey: mergedTask.key,
                metadata: extend({}, ctx.task.metadata, metadata, {
                    task: this.ALIAS,
                    initiator: mergedTask.user,
                    employee: mergedTask.user,
                    status: "commit",
                    decoration: this.decoration
                })
            })
        }

    }

    async reject(options) {

        log(`${this.ALIAS} reject...`)

        if (!this.PREV_AGENT) return

        let result = await this.getAgent(this.PREV_AGENT).create({

            sourceKey: options.sourceKey,
            altVersions: options.altVersions,
            metadata: extend({}, options.metadata, {
                rejector: options.user,
                initiator: options.user,
                decoration: this.decoration
            }),
            waitFor: null,
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


module.exports = Cross_Merge_Pipeline_Agent