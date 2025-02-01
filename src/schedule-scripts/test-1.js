const { AmqpManager, Middlewares } = require('@molfar/amqp-client')
const docdb = require("../utils/docdb")
const Key = require("../workflow/utils/task-key")
const uuid = require("uuid").v4

const config = require("../../.config")
const db = config.docdb

const normalize = config.rabbitmq.TEST.normalize


const PUBLISHER_OPTIONS = normalize({
    exchange: {
        name: `Basic_Labeling_1st_exchange`,
        options: {
            durable: true,
            persistent: true
        }
    }
})

console.log(PUBLISHER_OPTIONS)


const test = async () => {

    let publisher = await AmqpManager.createPublisher(PUBLISHER_OPTIONS)
    
    publisher
    .use((err, msg, next) => {
        console.log("send", msg.content)
        next()
    })
    .use(Middlewares.Json.stringify)


    const SCHEMA = "strazhesko-part-1"

    let data = await docdb.aggregate({
        db,
        collection: `${SCHEMA}.labels`,
        pipeline: [{
                $limit: 1
            },
            {
                $project: {
                    _id: 0,
                    id: 1
                }
            }
        ]
    })

    data = data.map(d => d.id)

    // for (const dataId of data) {

        const key = Key()
            .workflowType("Basic_Labeling")
            .workflowId(uuid())
            .taskType("Basic_Labeling_1st")
            .taskId(uuid())
            .schema(SCHEMA)
            .dataCollection("labels")
            .dataId("88969e24-3582-4459-89f4-4dcc1ed9585e")//.dataId(dataId)
            .savepointCollection("savepoints")
            .get()
        
        // console.log(key)

        await publisher.send({
          alias: "Basic_Labeling_1st",
          key,
          metadata:{
              comment: "Triggered by test 1"
          },
        })  

    // }

    // await publisher.close()

}

test()