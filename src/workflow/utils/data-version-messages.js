const uuid = require("uuid").v4
const { extend } = require("lodash")
const { AmqpManager, Middlewares } = require('@molfar/amqp-client')

const log  = require("./logger")(__filename) //(path.basename(__filename))

const config = require("../../../.config")
const configRB = config.rabbitmq.TEST

let PUBLISHER
let CONSUMER

const getPublisher = async () => {
    if(!PUBLISHER) {
        PUBLISHER = await AmqpManager.createPublisher(configRB.publisher.versionDb)
        PUBLISHER
            .use((err, msg, next)=> {
                msg.content = extend(msg.content, {requestId: uuid()})
                // log(`Version Manager send ${msg.content.requestId}: ${msg.content.command} ${msg.content.collection} ${msg.content.data.length} items`)
                next()
            })
            .use(Middlewares.Json.stringify)
    }
    return PUBLISHER
}

const getConsumer = async () => {
    if(!CONSUMER){
        
        CONSUMER = await AmqpManager.createConsumer(configRB.consumer.versionDbReport)
        await CONSUMER
                .use(Middlewares.Json.parse)

                .use((err, msg, next) => {
                    msg.ack()
                    next()
                })

                // .use((err, msg, next)=> {
                //     // log("Version Manager receive:", msg.content)
                // })

                .start()

    }

    return CONSUMER
}


module.exports = {
    getConsumer,
    getPublisher
}