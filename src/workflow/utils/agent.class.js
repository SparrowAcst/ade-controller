const uuid = require("uuid").v4
const { extend, isArray, sample, isFunction, keys, findLast } = require("lodash")
const { AmqpManager, Middlewares } = require('@molfar/amqp-client')
const segmentationAnalysis = require("../../utils/segmentation/segment-analysis")

const log  = require("./logger")(__filename) //(path.basename(__filename))


const config = require("../../../.config")
const normalize = config.rabbitmq.TEST.normalize

const EmployeeManager = require("./employee-manager")

const DELAY = 15 * 1000 // 15 s
const AUTO_USER_NAME = "assigned automatically"

let EMPOLOYEE_SERVICE
let AGENTS = {}




const findPretendent = async options => {

    let { user, alias, key, metadata } = options

    log("findPretendent options", options)
    const { employes, Task, Key } = EMPOLOYEE_SERVICE

    const agent = AGENTS[alias]

    const assignTo = metadata.assignTo
    
    if(assignTo){
        log("assignTo", assignTo)
        let pretendent = employes(user => user.namedAs == assignTo)[0]
        if(pretendent && agent.pretendentCriteria(assignTo)){
            return pretendent
        }
    }

    // if (user && user != "AUTO_USER_NAME") {
    //     // log("Direct assigment for:", user)
    //     if (agent.pretendentCriteria(user)) {
    //         // log("Direct:", user)
    //         return user
    //     } else {
    //         // log(alias, ": No criteria for Direct assigement:", user)
    //         return
    //     }

    // }

    // log(alias, AGENTS[alias])

    const ctx = await agent.read(key)
    const task = (ctx) ? ctx.task || {} : {}

    if(task.waitFor){
        let pretendent = (task.waitFor || []).pop()
        if (pretendent) {
            log("Wait for", pretendent)
            return pretendent
        }
    }    

    pretendent = sample(employes(user => agent.pretendentCriteria(user)))

    if (pretendent) {
        log("Assign by settings:", pretendent.namedAs)
        return pretendent.namedAs
    }

    // log("Not found")
}


const createCommand = async (error, message, next) => {

    try {

        const { employes, Task, Key } = EMPOLOYEE_SERVICE

        let {
            alias,
            key,
            initialState,
            user,
            metadata,
            altVersions,
            waitFor,
            release,
            assignTo
        } = message.content

        const agent = AGENTS[alias]
        initialState = initialState || "start"

        let isPossible = await agent.possibilityOfCreating(key)
        if(isPossible != true){
            log(`Impossble of creation task: ${key}`)
            log(isPossible)
            agent.sendToNoCreate(extend({}, {data: message.content, reason: isPossible }))
            next()
            return
        }

        // log("CREATE COMMAND")
        let pretendent = await findPretendent(message.content)
        log("Create task for pretendent", pretendent)
        metadata = extend({}, metadata, {
            task: agent.ALIAS,
            status: "start",
            decoration: agent.decoration
        })

        if (pretendent) {

            let task = await Task.create({
                user: pretendent,
                alias,
                sourceKey: key,
                targetKey: Key(key)
                    .agent(alias)
                    .taskId(uuid())
                    .taskState(initialState)
                    .get(),
                altVersions: altVersions,    
                metadata,
                waitFor
            })

            log(`${Key(task.key).agent()} > ${Key(task.key).get()} > ${pretendent}`)

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



const Agent = class {

    constructor(options) {

        options = options || {}
        let { name, alias, FEEDBACK_DELAY, decoration } = options
        if (!alias) throw new Error(`Agent: alias required`)
        name = name || alias

        this.CONSUMER_OPTIONS = normalize({
            queue: {
                name: `${alias}`,
                exchange: {
                    name: `${alias}_exchange`,
                    options: {
                        durable: true,
                        persistent: true
                    }
                },
                options: {
                    noAck: false,
                    exclusive: false
                }
            }
        })


        this.FEEDBACK_OPTIONS = normalize({
            exchange: {
                name: `${alias}_exchange`,
                options: {
                    durable: true,
                    persistent: true
                }
            }
        })

        this.SCHEDULER_OPTIONS = normalize({
            exchange: {
                name: 'task_scheduler_exchange',
                options: {
                    durable: true,
                    persistent: true
                }
            }
        })

        this.NO_CREATE_OPTIONS = normalize({
            exchange: {
                name: 'no_create_task_exchange',
                options: {
                    durable: true,
                    persistent: true
                }
            }
        })


        this.consumer = null
        this.feedbackPublisher = null
        this.schedulerPublisher = null
        this.employeeService = null
        this.alias = alias
        this.name = name
        this.FEEDBACK_DELAY = FEEDBACK_DELAY || DELAY
        this.decoration = decoration
        this.uiPermissions = options.availableCommands
        this.state = "stopped"
        AGENTS[this.alias] = this
    }

    getAgent(alias) {
        return AGENTS[alias]
    }

    async start() {

        if (!EMPOLOYEE_SERVICE) {
            EMPOLOYEE_SERVICE = await EmployeeManager()
        }

        // log("CONSUMER_OPTIONS", this.CONSUMER_OPTIONS)
        // log("FEEDBACK_OPTIONS", this.FEEDBACK_OPTIONS)
        // log("SCHEDULER_OPTIONS", this.SCHEDULER_OPTIONS)
        // log("NO_CREATE_OPTIONS", this.NO_CREATE_OPTIONS)

        await this.setTaskDisabled(false)

        this.consumer = await AmqpManager.createConsumer(this.CONSUMER_OPTIONS)

        // log(this.FEEDBACK_OPTIONS)

        this.feedbackPublisher = await AmqpManager.createPublisher(this.FEEDBACK_OPTIONS)
        this.feedbackPublisher.use(Middlewares.Json.stringify)

        this.schedulerPublisher = await AmqpManager.createPublisher(this.SCHEDULER_OPTIONS)
        this.schedulerPublisher.use(Middlewares.Json.stringify)

        this.noCreatePublisher = await AmqpManager.createPublisher(this.NO_CREATE_OPTIONS)
        this.noCreatePublisher.use(Middlewares.Json.stringify)


        await this.consumer
            .use(Middlewares.Json.parse)
            .use(createCommand)
            .use(Middlewares.Error.Log)
            // .use(Middlewares.Error.BreakChain)
            .use((err, msg, next) => {
                msg.ack()
            })
            .start()

        this.state = "available"

    }

    async setTaskDisabled(value){

        const {Key, employes, updateEmployee} = this.getEmployeeService()

        const employesList = employes()
        // log(this.ALIAS, "set task disabled: ", value)
        for(let emp of employesList){
            (emp.taskList || []).forEach( task => {
                if(Key(task.key).taskType() == this.ALIAS){
                    // log(emp.namedAs,">", task.key, "> disabled: ", value)
                    task.disabled = value
                }
            })
            await updateEmployee(emp)
        }
    }

    async stop() {
        
        if(this.consumer){
            await this.consumer.close()
            await this.feedbackPublisher.close()
            await this.schedulerPublisher.close()
            await this.noCreatePublisher.close()
        }
        
        this.state = "stopped"
        await this.setTaskDisabled(true)

    }

    getEmployeeService() {
        return EMPOLOYEE_SERVICE
    }

    async getVersionService() {
        return (await EMPOLOYEE_SERVICE.getVersionService())
    }

    async getDataManager(key) {

        let taskKey = EMPOLOYEE_SERVICE.Key(key)
        // log("key", key)
        let result = await EMPOLOYEE_SERVICE.getVersionService()
        // log("SERVICE", result)
        // log("SERVICE", result.getManager)
        result = await result.getManager({ key: taskKey.getDataKey() })
        // log("SERVICE", result)
        
        // result = await EMPOLOYEE_SERVICE.getVersionService().getManager({ key: taskKey.getDataKey() })
        return result

    }

    async close() {

        await this.consumer.close()
        await this.feedbackPublisher.close()

        delete AGENTS[this.alias]

        if (keys(AGENTS).length == 0) {
            await EMPOLOYEE_SERVICE.close()
        }

    }

    pretendentCriteria() {
        return true
    }

    async possibilityOfCreating(key) {
        return true
    }

    async create(task) {
        this.feedbackPublisher.send(extend(task, { alias: this.alias }))
    }

   
    async feedback(message) {
        setTimeout(() => {
            this.feedbackPublisher.send(message)
        }, this.FEEDBACK_DELAY)
    }

    async sendToScheduler(message) {
        message.publisher = this.FEEDBACK_OPTIONS
        log("Send to task scheduler:", message.data.key)
        this.schedulerPublisher.send(message)
    }

    async sendToNoCreate(message) {
        message.publisher = this.FEEDBACK_OPTIONS
        message.date = new Date()
        message.requestId = uuid()
        log("Send to No Created Task Storage:", message.data.key)
        this.noCreatePublisher.send(message)
    }

    async read(taskKey) {
        const { Task } = this.getEmployeeService()
        let result = await Task.context(taskKey)
        result = extend(result, { agent: this.alias, permissions: this.uiPermissions })
        return result
    }


    async getSegmentationAnalysis(sourceKey){
        
        let data = await this.read(sourceKey)
        
        let segmentation = data.data.segmentation
        segmentation = segmentation || data.data.aiSegmentation
        
        let result
        if(segmentation){
            result = segmentationAnalysis.getSegmentationAnalysis(segmentation)
        } else {
            result = {}
        }

        return result

    }

    async lock({ user, sourceKey }) {
        const { Task } = this.getEmployeeService()
        await Task.lock({ user, sourceKey })
    }

    async chart(sourceKey) {
        const { Task } = this.getEmployeeService()
        let result = await Task.chart(sourceKey)
        return result
    }

    async chart1(sourceKey) {
        const { Task } = this.getEmployeeService()
        let result = await Task.chart1(sourceKey)
        return result
    }

    async updateData({ sourceKey, update }) {
        const { Task } = this.getEmployeeService()
        await Task.updateData({ sourceKey, update })
    }

    async save() {}

    async submit() {}

    async rollback() {}

    async fastForward() {}

    async release({ user, sourceKey, metadata }) {
        const { Task } = this.getEmployeeService()
        return (await Task.release({ user, sourceKey, metadata }))
    }


    async commit() {}

    async reject() {}

    async fastReject() {}

    async merge() {}

    async getEmployeeStats(options) {
        const { getEmployeeStats } = this.getEmployeeService()
        let result = await getEmployeeStats(options)
        return result
    }

}

const init = async () => {
    if (!EMPOLOYEE_SERVICE) {
        EMPOLOYEE_SERVICE = await EmployeeManager()
    }
}

const getEmployeeStats = async options => {
    if (!EMPOLOYEE_SERVICE) {
        EMPOLOYEE_SERVICE = await EmployeeManager()
    }
    let result = await EMPOLOYEE_SERVICE.getEmployeeStats(options)
    return result   
}

module.exports = {
    agent: alias => AGENTS[alias],
    register: (alias, instance) => {
        // log("Register", alias, instance)

        AGENTS[alias] = instance
    },
    Agent,
    init,
    getEmployeeStats
}

