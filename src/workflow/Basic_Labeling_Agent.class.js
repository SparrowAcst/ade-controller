// TODO DEFFERED_TIMEOUT
// TODO pretendentCriteria


const { extend, find, isArray } = require("lodash")
const { Agent } = require("./agent.class")
const moment = require("moment")
const uuid = require("uuid").v4

const DEFAULT_OPTIONS = {
    WORKFLOW_TYPE: "Basic_Labeling",
    FEEDBACK_DELAY: 2 * 1000,
    DEFFERED_TIMEOUT: [2, "hours"],
    dataCollection: "labels",
    savepointCollection: "savepoints",
    TASK_QUOTE: 10
}





const Basic_Labeling_Agent = class extends Agent {

    constructor(options) {

        options = extend({}, DEFAULT_OPTIONS, options)

        super({
            alias: options.ALIAS,
            FEEDBACK_DELAY: options.FEEDBACK_DELAY
        })

        this.ALIAS = options.ALIAS
        this.WORKFLOW_TYPE = options.WORKFLOW_TYPE
        // this.FEEDBACK_DELAY = options.FEEDBACK_DELAY 
        this.DEFFERED_TIMEOUT = options.DEFFERED_TIMEOUT
        this.TASK_QUOTE = options.TASK_QUOTE
        this.NEXT_AGENT = options.NEXT_AGENT
        this.PREV_AGENT = options.PREV_AGENT
        this.dataCollection = options.dataCollection
        this.savepointCollection = options.savepointCollection
        this.decoration = options.decoration
    }

    async create({ user, sourceKey, metadata, waitFor, release }) {

        console.log(`${this.ALIAS} create...`)

        const { Task } = this.getEmployeeService()

        await super.create({
            user,
            key: sourceKey,
            metadata: extend({}, metadata, {
                task: this.ALIAS,
                status: "start",
                decoration: this.decoration
            }),
            waitFor,
            release
        })

    }

    pretendentCriteria(user) {

        const employeeService = this.getEmployeeService()
        const { Key } = employeeService
        user = (user.id) ? user : employeeService.employee(user)
        // console.log(user)
        if(!user.schedule) return false
        if(!isArray(user.schedule)) return false
        if(!user.schedule.includes(this.ALIAS)) return false
        user.taskList = user.taskList || []    
        return user.taskList.filter(t => {
                return Key(t.key).taskState() != "submit"
            }).length <= this.TASK_QUOTE
    
    }

    async read(taskKey) {
        let result = await super.read(taskKey)
        result = extend(result, { uiPermissions: this.uiPermissions })
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
            data,
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

        // ctx = await this.read(result.key)    

        this.getAgent("Deffered").send({
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
        
        if(ctx.task && ctx.task.lock) return 
        
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

    async fastForward({ user, sourceKey}) {

        console.log(`${this.ALIAS} fastForward...`)

        const employeeService = this.getEmployeeService()
        const { Task, employee } = employeeService

        const emp = employee(user)
        let f = find(emp.taskList || [], t => t.key == sourceKey)
        if (!f) {
            return
        }
        
        let ctx = await this.read(sourceKey)
        
        if(ctx.task && ctx.task.lock) return 
        
        await this.commit({
            user,
            sourceKey,
            data: ctx.data,
            metadata: ctx.task.metadata 
        })        

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
            "inconsistency": [],
            "data": (segmentationData) ? [segmentationData] : []
        }

        return requestData
    }

    async updateSegmentationData({sourceKey, data}){
        
        await this.updateData({
            sourceKey, 
            update:{
                segmentation: data
            }
        })
    }

}

module.exports = Basic_Labeling_Agent