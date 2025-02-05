
const uuid = require("uuid").v4

const docdb = require("../../utils/docdb")

const config = require("../../../.config")
const db = config.docdb

const { getPublisher } = require("./workflow-messages")

const Deferred_Agent_Class = require("./deferred-agent.class")
const AgentClassModule = require("./agent.class")

const { isArray, last } = require("lodash")

const storeInDB = async event => {
    let publisher = await getPublisher()
    publisher.send(event)
}



////////////////////////////////////////////////////////////////////////////////////////////////

const { keys, isFunction, extend, find } = require("lodash")
const createAgent = require("./agent-factory")

let AGENTS
let WORKFLOWS

const close = async () => {

    for (const agentAlias of keys(AGENTS)) {
        await AGENTS[agentAlias].close()
    }

}

const normalizeSelector = selector => {
    selector = selector || (() => true)
    selector = (isFunction(selector)) ? selector : (() => true)

    return selector
}

const workflow = alias => WORKFLOWS[alias]
const agent = alias => AGENTS[alias]

const Workflow = class {
  
  constructor(options){
    
    this.options = options || {}
    this.options.WORKFLOW_TYPE = this.options.name.split(" ").join("_")
    console.log(`Init workflow: ${this.options.WORKFLOW_TYPE}...`)
    this.agents = []
    for(let agentOptions of this.options.agents){
      let agent = createAgent(extend({}, agentOptions, { WORKFLOW_TYPE: this.options.WORKFLOW_TYPE}))
      AGENTS[agent.alias] = agent
      this.agents.push(agent)
      console.log(`Create agent: ${agent.alias}`)
    }
    
    this.options.log = this.options.log || []
    this.options.log = (isArray(this.options.log)) ? this.options.log : [this.options.log]

    console.log(`Workflow: ${this.options.WORKFLOW_TYPE} initiated`)
      
  }

  async start(){
    console.log(`Start workflow: ${this.options.WORKFLOW_TYPE}...`)
    for(let agent of this.agents){
      console.log(`Start agent: ${agent.alias}`)
      await agent.start()
    }
    this.options.state = "available"
    this.options.updatedAt = new Date()

    this.options.log.push({
        date: new Date(),
        message: `Workflow ${this.options.WORKFLOW_TYPE} start successfuly.`
    })
    console.log(last(this.options.log))

    await storeInDB(this.options)
    // console.log(`Workflow: ${this.options.WORKFLOW_TYPE} is available`)
  }

  async stop(){
    console.log(`Stop workflow: ${this.options.WORKFLOW_TYPE}...`)
    for(let agent of this.agents){
      console.log(`Stop agent: ${agent.alias}`)
      await agent.stop()
    }
    this.options.state = "stopped"
    this.options.updatedAt = new Date()
    this.options.log.push({
        date: new Date(),
        message: `Workflow ${this.options.WORKFLOW_TYPE} stop successfuly.`
    })
    console.log(last(this.options.log))

    await storeInDB(this.options)
    // console.log(`Workflow: ${this.options.WORKFLOW_TYPE} is stopped`)    
  }

}

const select = selector => {
            selector = normalizeSelector(selector)
            return  keys(AGENTS)
                        .filter(key => selector(AGENTS[key]))
                        .map( key => AGENTS[key])
        }

const selectWorkflow = selector => {
            selector = normalizeSelector(selector)
            return  keys(WORKFLOWS)
                        .filter(key => selector(WORKFLOWS[key]))
                        .map( key => WORKFLOWS[key])
        }        


const init = async () => {

    await AgentClassModule.init()
    
    if(!AGENTS){
        console.log("Workflow Manager init...")

        let workflows = await docdb.aggregate({
            db,
            collection: `ADE-SETTINGS.workflows`,
            pipeline: [{ $project: { _id: 0 } }]
        })

        AGENTS = {}
        WORKFLOWS = {}

        let deferredAgent = new Deferred_Agent_Class()
        AGENTS["Deffered"] =  deferredAgent
        console.log("Start: ", deferredAgent.ALIAS)
        await deferredAgent.start()   

        for (const workflow of workflows) {
            workflowAlias = workflow.name.split(" ").join("_")
            WORKFLOWS[workflowAlias] = new Workflow(workflow)
            if(workflow.state == "available"){
              await WORKFLOWS[workflowAlias].start()
            }
        }

        console.log(`WORKFLOWS:\n${selectWorkflow().map(w => w.options.WORKFLOW_TYPE + ": " + w.options.state).join("\n")} `)
        console.log(`AGENTS:\n${select().map(a => a.ALIAS).join("\n")}`)
   
    }    

    console.log("Workflow Manager is available")
  
    return {
        select,
        agent,
        selectWorkflow,
        workflow,
        close
    }

}





module.exports = init
