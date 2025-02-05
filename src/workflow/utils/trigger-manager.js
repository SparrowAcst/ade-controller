const uuid = require("uuid").v4

const { AmqpManager, Middlewares } = require('@molfar/amqp-client')

const docdb = require("../../utils/docdb")

const config = require("../../../.config")
const db = config.docdb
const configRB = config.rabbitmq.TEST
const normalize = configRB.normalize

const PUBLISHER_OPTIONS = normalize({
    exchange: {
        name: 'task_triggers_exchange',
        options: {
            durable: true,
            persistent: true
        }
    }
})

let PUBLISHER


const { isArray, isFunction, last } = require("lodash")

const getPublisher = async () => {
    if(!PUBLISHER) {

        PUBLISHER = await AmqpManager.createPublisher(PUBLISHER_OPTIONS)
        PUBLISHER
            .use(Middlewares.Json.stringify)
    }
    return PUBLISHER
}


const normalizeSelector = selector => {
    selector = selector || (() => true)
    selector = (isFunction(selector)) ? selector : (() => true)

    return selector
}


const select = async selector => {
    const pipeline = [{ $project: { _id: 0 } }]
    let triggers = await docdb.aggregate({
        db,
        collection: "ADE-SETTINGS.triggers",
        pipeline
    })

    return triggers.filter(normalizeSelector(selector))

}

const update = async options => {
    let publisher = await getPublisher()
    publisher.send(options)
}

module.exports = {
    select,
    update
}


