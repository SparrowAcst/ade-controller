const { AmqpManager, Middlewares } = require('@molfar/amqp-client')

const config = require("../../.config")
const configRB = config.rabbitmq.TEST

let RPC_CONSUMER


const getRPCConsumer = async (name, consumerAlias, executor) => {
    if(!RPC_CONSUMER){
        
        RPC_CONSUMER = await AmqpManager.createConsumer(configRB.consumer[consumerAlias])
        await RPC_CONSUMER
                .use(Middlewares.Json.parse)

                .use( async (err, msg, next) => {
                    await executor(msg.content)
                    next()
                })
                
                .use(Middlewares.Error.Log)
                .use(Middlewares.Error.BreakChain)


                .use((err, msg, next)=> {
                    console.log(name, "receive:", msg.content)
                    msg.ack()
                })

                .start()

    }

    return RPC_CONSUMER
}



module.exports = getRPCConsumer