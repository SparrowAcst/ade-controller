const uuid = require("uuid").v4
const { extend } = require("lodash")
const { AmqpManager, Middlewares } = require('@molfar/amqp-client')

const config = require("../../../.config")
const configRB = config.rabbitmq.TEST
const normalize = configRB.normalize


let PUBLISHER

const getPublisher = async () => {
    if(!PUBLISHER) {

        const PUBLISHER_OPTIONS = normalize({
            exchange: {
                name: `workflow_db_exchange`,
                options: {
                    durable: true,
                    persistent: true
                }
            }
        })

        PUBLISHER = await AmqpManager.createPublisher(PUBLISHER_OPTIONS)
        PUBLISHER
            .use((err, msg, next)=> {
                msg.content = extend(msg.content, {requestId: uuid()})
                // console.log(`Employee Manager send ${msg.content.requestId}: ${msg.content.command} ${msg.content.collection} ${msg.content.data.length} items`)
                next()
            })
            .use(Middlewares.Json.stringify)
    }
    return PUBLISHER
}

module.exports = {
    getPublisher
}