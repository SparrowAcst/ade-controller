const uuid = require("uuid").v4
const { extend, isArray, sample, isFunction, keys, find, remove } = require("lodash")

const log  = require("./logger")(__filename) //(path.basename(__filename))

const { AmqpManager, Middlewares } = require('@molfar/amqp-client')
const { agent, register } = require("./agent.class")
const config = require("../../../.config")
const normalize = config.rabbitmq.TEST.normalize
const moment = require("moment")

const CONSUMER_OPTIONS = normalize({
    queue: {
        name: "Deffered",
        exchange: {
            name: `Deffered_exchange`,
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


const FEEDBACK_OPTIONS = normalize({
    exchange: {
        name: `Deffered_exchange`,
        options: {
            durable: true,
            persistent: true
        }
    }
})


const NO_CREATE_OPTIONS = normalize({
    exchange: {
        name: 'no_create_task_exchange',
        options: {
            durable: true,
            persistent: true
        }
    }
})


const TIME_INTERVAL = 1 * 15 * 1000 // 10 min

let consumer
let feedbackPublisher
let noCreatePublisher



let TASK_BLACK_LIST = []

const processMessage = async (err, message, next) => {

    try {

        let ctx = message.content

        // log("DEFERRED", message.content)

        if(ctx.ignore){
            if(!find(TASK_BLACK_LIST, t => t == ctx.ignore)){
                log(`Deffered: black list add ${ctx.ignore}`)
                TASK_BLACK_LIST.push(ctx.ignore)
            }
            next()
            return
        }

        if(ctx.content && ctx.content.sourceKey){
            if( TASK_BLACK_LIST.includes(ctx.content.sourceKey)){
                log(`Deffered: ignore ${ctx.content.sourceKey}`)
                remove(TASK_BLACK_LIST, t => t == ctx.content.sourceKey)
                next()
                return
            }
        }


        if (ctx.expiredAt) {
            if (moment(new Date()).isSameOrBefore(moment(ctx.expiredAt))) {
                // log(`Deferred: ${ctx.content.sourceKey} postponed until ${JSON.stringify(ctx.expiredAt)} (${moment(ctx.expiredAt).toNow()})...`)
                let self = agent("Deferred")
                await self.feedback(ctx)
                next()
                return
            }
        }

        if (ctx.agent) {
            const respondent = agent(ctx.agent)
            if(respondent){
                if(respondent.state == "available"){
                    // log(`Deferred: ${ctx.content.sourceKey} continue with ${ctx.agent}`)
                    await respondent.commit(ctx.content)
                } else {
                    // log(`Deferred: Agent ${ctx.agent} state: ${respondent.state}. ${ctx.content.sourceKey} waits for an agent to become available.`)
                    let self = agent("Deferred")
                    await self.feedback(ctx)
                }
            } else {
                log(`Deffered: agent ${ctx.agent} not found`)
                let self = agent("Deferred")
                await self.sendToNoCreate(extend({}, ctx, {reason:`Deffered: agent ${ctx.agent} not found`}))
            }        
        }

        next()

    } catch (e) {

        throw e

    }
}



const Deferred_Agent = class {

    constructor() {
        // this.WORKFLOW_TYPE = "Basic_Labeling"
        this.ALIAS = "Deferred"
        register(this.ALIAS, this)
    }

    async start() {

        // log("CONSUMER_OPTIONS", CONSUMER_OPTIONS)
        // log("FEEDBACK_OPTIONS", FEEDBACK_OPTIONS)
        if(!consumer){
            consumer = await AmqpManager.createConsumer(CONSUMER_OPTIONS)

            feedbackPublisher = await AmqpManager.createPublisher(FEEDBACK_OPTIONS)
            feedbackPublisher.use(Middlewares.Json.stringify)

            noCreatePublisher = await AmqpManager.createPublisher(NO_CREATE_OPTIONS)
            noCreatePublisher.use(Middlewares.Json.stringify)


            await consumer
                .use(Middlewares.Json.parse)

                .use(processMessage)

                .use(Middlewares.Error.Log)
                // .use(Middlewares.Error.BreakChain)

                .use((err, msg, next) => {
                    msg.ack()
                })

                .start()
        }        
        
    }

    send(message) {
        feedbackPublisher.send(message)
    }

    async feedback(message) {
         if(!feedbackPublisher){
            await this.start()
        }
        setTimeout(() => {
            feedbackPublisher.send(message)
        }, TIME_INTERVAL)
    }


    async sendToNoCreate(message) {
        message.publisher = this.FEEDBACK_OPTIONS
        message.date = new Date()
        message.requestId = uuid()
        if(!noCreatePublisher){
            await this.start()
        }
        log("Send to No Created Task Storage:", message)
        noCreatePublisher.send(message)
    }
}


module.exports = Deferred_Agent