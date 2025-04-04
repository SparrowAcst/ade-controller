const uuid = require("uuid").v4

const log  = require("./logger")(__filename) //(path.basename(__filename))

const docdb = require("../../utils/docdb")

const config = require("../../../.config")
const db = config.docdb

const { getPublisher } = require("./workflow-messages")

const Deferred_Agent_Class = require("./deferred-agent.class")
const AgentClassModule = require("./agent.class")

const { isArray, last, flatten, sortBy } = require("lodash")

const storeInDB = async event => {
    let publisher = await getPublisher()
    publisher.send(event)
}

const getChart = require("./workflow-chart")


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

    constructor(options) {

        this.options = options || {}
        this.options.WORKFLOW_TYPE = this.options.name.split(" ").join("_")
        log(`Init workflow: ${this.options.WORKFLOW_TYPE}...`)
        this.agents = []
        for (let agentOptions of this.options.agents) {
            // log("agentOptions", agentOptions)
            let agent = createAgent(extend({}, agentOptions, { WORKFLOW_TYPE: this.options.WORKFLOW_TYPE }))
            AGENTS[agent.alias] = agent
            this.agents.push(agent)
            // log(`Create agent: ${agent.alias}`)
        }
        // log.table(this.agents.map(a => a.alias))
        this.options.log = this.options.log || []
        this.options.log = (isArray(this.options.log)) ? this.options.log : [this.options.log]

        log(`Workflow: ${this.options.WORKFLOW_TYPE} initiated`)

    }

    async start() {
        log(`Start workflow: ${this.options.WORKFLOW_TYPE}...`)
        for (let agent of this.agents) {
            // log(`Start agent: ${agent.alias}`)
            await agent.start()
        }
        
        // log.table(this.agents.map(a => ({ agent: a.alias, state: a.state})))

        this.options.state = "available"
        this.options.updatedAt = new Date()

        this.options.log.push({
            date: new Date(),
            message: `Workflow ${this.options.WORKFLOW_TYPE} start successfuly.`
        })
        // log(last(this.options.log))

        await storeInDB(this.options)
        // log(`Workflow: ${this.options.WORKFLOW_TYPE} is available`)
    }

    async stop() {
        log(`Stop workflow: ${this.options.WORKFLOW_TYPE}...`)
        for (let agent of this.agents) {
            // log(`Stop agent: ${agent.alias}`)
            await agent.stop()
        }

        // log.table(this.agents.map(a => ({ agent: a.alias, state: a.state})))

        this.options.state = "stopped"
        this.options.updatedAt = new Date()
        this.options.log.push({
            date: new Date(),
            message: `Workflow ${this.options.WORKFLOW_TYPE} stop successfuly.`
        })
        // log(last(this.options.log))

        await storeInDB(this.options)
        // log(`Workflow: ${this.options.WORKFLOW_TYPE} is stopped`)    
    }

    getChart() {
        return getChart(this.options)
    }

    async getEmployeeStats(options) {
        let result = await AgentClassModule.getEmployeeStats(options)
        return result
    }



}

const select = selector => {
    selector = normalizeSelector(selector)
    return keys(AGENTS)
        .filter(key => selector(AGENTS[key]))
        .map(key => AGENTS[key])
}

const selectWorkflow = selector => {
    selector = normalizeSelector(selector)
    return sortBy(
        keys(WORKFLOWS)
            .filter(key => selector(WORKFLOWS[key]))
            .map(key => WORKFLOWS[key]),
        d => d.options.name
    )
}


const getAvailableAgents = () => {
    let workflows = selectWorkflow(w => w.options.state == "available")
    return flatten(workflows.map(w => w.agents.map(a => a.ALIAS)))
}


const init = async () => {

    await AgentClassModule.init()

    if (!AGENTS) {
        log("Workflow Manager init...")

        let workflows = await docdb.aggregate({
            db,
            collection: `ADE-SETTINGS.workflows`,
            pipeline: [{
                    $match: {
                        disabled: {
                            $ne: true
                        }
                    }
                },
                {
                    $project: {
                        _id: 0
                    }
                }
            ]
        })

        AGENTS = {}
        WORKFLOWS = {}

        // log(JSON.stringify(workflows, null, " "))

        for (const workflow of workflows) {
            workflowAlias = workflow.name.split(" ").join("_")
            WORKFLOWS[workflowAlias] = new Workflow(workflow)
            if (workflow.state == "available") {
                await WORKFLOWS[workflowAlias].start()
            } else {
                await WORKFLOWS[workflowAlias].stop()
            }
        }


        let deferredAgent = new Deferred_Agent_Class()
        AGENTS["Deffered"] = deferredAgent
        log("Start: ", deferredAgent.ALIAS)
        await deferredAgent.start()

        log(`WORKFLOWS:`) //\n${selectWorkflow().map(w => w.options.WORKFLOW_TYPE + ": " + w.options.state).join("\n")} `)
        log.table(selectWorkflow().map(w => ({workflow: w.options.WORKFLOW_TYPE, state: w.options.state})))
        log(`AGENTS:`) //\n${select().map(a => a.ALIAS).join("\n")}`)
        log.table(select().map(a => ({ agent:a.ALIAS, state: a.state})))
        log("Workflow Manager is available")
    }



    return {
        select,
        agent,
        selectWorkflow,
        getAvailableAgents,
        workflow,
        close,
        getEmployeeStats: async options => {
            let result = await AgentClassModule.getEmployeeStats(options)
            return result
        }

    }

}





module.exports = init