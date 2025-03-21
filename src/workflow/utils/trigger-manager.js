const uuid = require("uuid").v4
const { find } = require("lodash")

const log = require("./logger")(__filename) //(path.basename(__filename))

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
    if (!PUBLISHER) {

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
    // const pipeline = [{
    //         $match: {
    //             disabled: {
    //                 $ne: true
    //             }
    //         }
    //     }, {
    //         $project: {
    //             _id: 0
    //         }
    //     },
    //     {
    //         $sort: {
    //             workflow: 1,
    //             name: 1,
    //         },
    //     }
    // ]

    const pipeline = [{
            $match: {
                disabled: {
                    $ne: true,
                },
            },
        },
        {
            $project: {
                _id: 0,
            },
        },
        {
            $sort: {
                workflow: 1,
                name: 1,
            },
        },
        {
            $lookup: {
                from: "task-log",
                localField: "name",
                foreignField: "metadata.emitter",
                as: "taskLog",
            },
        },
    ]

    let triggers = await docdb.aggregate({
        db,
        collection: "ADE-SETTINGS.triggers",
        pipeline
    })

    return triggers.filter(normalizeSelector(selector))

}


const getTriggersInfo = async selector => {

    // const pipeline = [{
    //         $group: {
    //             _id: "$state",
    //             count: {
    //                 $sum: 1,
    //             },
    //         },
    //     },
    //     {
    //         $project: {
    //             _id: 0,
    //             state: "$_id",
    //             count: 1,
    //         },
    //     },
    // ]

    // const pipeline = [
    //     {
    //         $project: {
    //             _id: 0,
    //             state: 1
    //         }
    //     }    
    // ]

    let triggers = await select(selector)
    log("triggers", triggers)

    const loadCounts = async trigger => {
        let stat = await docdb.countDocuments({
            db,
            collection: trigger.collection
        })
        log(trigger.collection, stat)
        return stat
    }

    let docCounts = await Promise.all(triggers.map(trigger => loadCounts(trigger)))

    triggers = triggers.map( (trigger, index) => {
        
        trigger.stat = {
            emitted: trigger.taskLog.filter(task => (task.metadata) ? task.metadata.status == "emitted" : false).length,
            total: docCounts[index] //.length //map(s => s.count).reduce((a,b) => a+b, 0)
        }        
        return trigger
    
    })

    // for (let trigger of triggers) {

    //     let stat = await docdb.countDocuments({
    //         db,
    //         collection: trigger.collection
    //     })

    //     log("stat", stat)

    //     // let triggered = stat.filter(s => s.state == "triggered").length //find(stat, s => s.state == "triggered")

    //     trigger.stat = {
    //         emitted: trigger.taskLog.filter(task => (task.metadata) ? task.metadata.status == "emitted" : false).length,
    //         total: stat //.length //map(s => s.count).reduce((a,b) => a+b, 0)
    //     }
    // }

    return triggers

}

const update = async options => {
    let publisher = await getPublisher()
    publisher.send(options)
}

module.exports = {
    select,
    update,
    getTriggersInfo
}