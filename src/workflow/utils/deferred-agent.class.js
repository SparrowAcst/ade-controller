const uuid = require("uuid").v4
const { extend, isArray, sample, isFunction, keys } = require("lodash")
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


const TIME_INTERVAL = 1 * 15 * 1000 // 10 min

let consumer
let feedbackPublisher

const processMessage = async (err, message, next) => {

    try {

        let ctx = message.content

        if (ctx.expiredAt) {
            if (moment(new Date()).isSameOrBefore(moment(ctx.expiredAt))) {
                console.log(`Deferred: ${ctx.content.sourceKey} postponed until ${JSON.stringify(ctx.expiredAt)} (${moment(ctx.expiredAt).toNow()})...`)
                let self = agent("Deferred")
                await self.feedback(ctx)
                next()
                return
            }
        }

        if (ctx.agent) {
            const respondent = agent(ctx.agent)
            console.log(`Deferred: ${ctx.content.sourceKey} continue with ${ctx.agent}`)
            await respondent.commit(ctx.content)
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

        console.log("CONSUMER_OPTIONS", CONSUMER_OPTIONS)
        console.log("FEEDBACK_OPTIONS", FEEDBACK_OPTIONS)
        
        consumer = await AmqpManager.createConsumer(CONSUMER_OPTIONS)

        feedbackPublisher = await AmqpManager.createPublisher(FEEDBACK_OPTIONS)
        feedbackPublisher.use(Middlewares.Json.stringify)

        await consumer
            .use(Middlewares.Json.parse)

            .use(processMessage)

            .use(Middlewares.Error.Log)
            .use(Middlewares.Error.BreakChain)

            .use((err, msg, next) => {
                msg.ack()
            })

            .start()

        
    }

    send(message) {
        feedbackPublisher.send(message)
    }

    async feedback(message) {
        setTimeout(() => {
            feedbackPublisher.send(message)
        }, TIME_INTERVAL)
    }

}


module.exports = Deferred_Agent