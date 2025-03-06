const uuid = require("uuid").v4
const { extend } = require("lodash")

const log  = require("./logger")(__filename) //(path.basename(__filename))

const { AmqpManager, Middlewares } = require('@molfar/amqp-client')

const config = require("../../../.config")
const configRB = config.rabbitmq.TEST

let PUBLISHER
let CONSUMER
let LOG_PUBLISHER

const getPublisher = async () => {
    if(!PUBLISHER) {
        PUBLISHER = await AmqpManager.createPublisher(configRB.publisher.employeeDb)
        PUBLISHER
            .use((err, msg, next)=> {
                msg.content = extend(msg.content, {requestId: uuid()})
                // log(`Employee Manager send ${msg.content.requestId}: ${msg.content.command} ${msg.content.collection} ${msg.content.data.length} items`)
                next()
            })
            .use(Middlewares.Json.stringify)
    }
    return PUBLISHER
}

const getLogPublisher = async () => {
    if(!LOG_PUBLISHER) {
        LOG_PUBLISHER = await AmqpManager.createPublisher(configRB.publisher.taskLog)
        LOG_PUBLISHER
            .use((err, msg, next)=> {
                msg.content = extend(msg.content, {requestId: uuid()})
                // log(`Employee Manager send ${msg.content.requestId}: ${msg.content.command} ${msg.content.collection} ${msg.content.data.length} items`)
                next()
            })
            .use(Middlewares.Json.stringify)
    }
    return LOG_PUBLISHER
}

const getConsumer = async () => {
    if(!CONSUMER){
        
        CONSUMER = await AmqpManager.createConsumer(configRB.consumer.employeeDbReport)
        await CONSUMER
                .use(Middlewares.Json.parse)

                .use((err, msg, next) => {
                    msg.ack()
                    next()
                })

                // .use((err, msg, next)=> {
                //     log("Employee Manager receive:", msg.content)
                // })

                .start()

    }

    return CONSUMER
}


module.exports = {
    getConsumer,
    getPublisher,
    getLogPublisher
}