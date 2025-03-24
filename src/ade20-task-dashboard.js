const { extend, keys, sum, get, isArray, find, groupBy, flatten, uniqBy } = require("lodash")
const moment = require("moment")

const log  = require("./workflow/utils/logger")(__filename) //(path.basename(__filename))

const EMPLOYEE_MANAGER = require("./workflow/utils/employee-manager")
const WORKFLOW = require("./workflow")
const TRIGGERS = require("./workflow/utils/trigger-manager")
const STAT = require("./workflow/utils/stat-manager")

const normalizeSelector = selectorObject => {
    selectorObject = selectorObject || {}

    if (keys(selectorObject).length == 0) {
        return (() => true)
    }

    keys(selectorObject).forEach(key => {
        selectorObject[key] = (isArray(selectorObject[key])) ? selectorObject[key] : [selectorObject[key]]
    })

    return (data => keys(selectorObject)
        .map(key => selectorObject[key].includes(get(data, key)))
        .reduce((v, a) => v && a, true)
    )
}


const getTaskList = async (req, res) => {

    try {

        const { user, selector } = req.body.options

        const employeeManager = await EMPLOYEE_MANAGER()
        const { employee, Key } = employeeManager
        let emp = employee(user.namedAs)
        if (!emp) throw new Error(`User ${user.namedAs} not found`)
        let taskList = emp.taskList || []
        taskList = taskList.map(t => extend({}, t, { description: Key(t.key).getDescription() }))
        taskList = taskList.filter(normalizeSelector(selector))

        let statistics = groupBy(taskList, t => t.description.taskState)

        keys(statistics).forEach(key => {
            statistics[key] = statistics[key].length
        })

        res.send({
            date: new Date(),
            taskList,
            statistics
        })

    } catch (e) {
        log(e.toString(), e.stack)
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const getMetadata = async (req, res) => {
    try {
        const workflow = await WORKFLOW()
        const agents = workflow.select()
        const workflowType = uniqBy(agents.map(agent => agent.WORKFLOW_TYPE)).filter(d => d)
        const taskType = uniqBy(agents.map(agent => agent.ALIAS)).filter(d => d && d !== "Deferred" )
        res.send({
            workflowType,
            taskType
        })
    } catch (e) {
        log(e.toString(), e.stack)
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const getChart = async (req, res) => {
    try {
        const { sourceKey } = req.body.options

        const employeeManager = await EMPLOYEE_MANAGER()
        const { Task } = employeeManager

        let chart = await Task.chart(sourceKey)
        // log(JSON.stringify(chart, null, " "))
        res.send(chart)

    } catch (e) {
        log(e.toString(), e.stack)
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }

}

const getChart1 = async (req, res) => {
    try {
        const { sourceKey } = req.body.options

        const employeeManager = await EMPLOYEE_MANAGER()
        const { Task } = employeeManager

        let chart = await Task.chart1(sourceKey)
        // log(JSON.stringify(chart, null, " "))
        res.send(chart)

    } catch (e) {
        log(e.toString(), e.stack)
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }

}

const rollback = async (req, res) => {
    try {

        let { user, sourceKey } = req.body.options

        const employeeManager = await EMPLOYEE_MANAGER()
        const { Key } = employeeManager

        const description = Key(sourceKey).getDescription()

        const workflow = await WORKFLOW()
        agentInstance = workflow.agent(description.taskType)

        if (!agentInstance) throw new Error(`Agent ${agent} not found`)

        let result = await agentInstance.rollback({
            user: user.altname,
            sourceKey
        })

        res.send(result)

    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const fastForward = async (req, res) => {
    try {

        let { user, sourceKey } = req.body.options

        const employeeManager = await EMPLOYEE_MANAGER()
        const { Key } = employeeManager

        const description = Key(sourceKey).getDescription()

        const workflow = await WORKFLOW()
        agentInstance = workflow.agent(description.taskType)

        if (!agentInstance) throw new Error(`Agent ${agent} not found`)

        let result = await agentInstance.fastForward({
            user: user.altname,
            sourceKey
        })

        res.send(result)

    } catch (e) {
        log(e.toString(), e.stack)
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const getEmployes = async (req, res) => {
    try {
        const employeeManager = await EMPLOYEE_MANAGER()
        let result = await employeeManager.employes(emp => emp.schedule)
        res.send(result)
    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const setEmployesSchedule = async (req, res) => {
    try {

        const { employes } = req.body
        const employeeManager = await EMPLOYEE_MANAGER()
        await employeeManager.setEmployesSchedule({ employes })
        // let result = await employeeManager.employes( emp => emp.schedule)
        res.send({})
    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const getEmployeeProfile = async (req, res) => {

    try {

        let { portalUsers } = req.body.cache
        let { user } = req.body

        const workflow = await WORKFLOW()
        // agentInstance = workflow.agent("Basic_Labeling_1st")
        // if (!agentInstance) throw new Error(`Agent ${agent} not found`)


        const employeeManager = await EMPLOYEE_MANAGER()
        const { employee, Key } = employeeManager
        let emp = employee(user)
        if (!emp) throw new Error(`User ${user.namedAs} not found`)

        let actualTaskList = emp.taskList || []
        actualTaskList = actualTaskList.map(t => extend({}, t, { description: Key(t.key).getDescription() }))

        let schedule = emp.schedule

        let f = find(portalUsers, pu => emp.email.includes(pu.email))

        let statistics = await workflow.getEmployeeStats({ user: [user], intervals: ["hour24", "day7", "month1", "year1"] })

        res.send({
            user: {
                name: user,
                photo: f.photo,
                email: f.email,
                role: emp.role,
                profile: emp.profile
            },
            schedule,
            actualTaskList,
            statistics
        })

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const getWorkflowChart = async (req, res) => {
    
    try {

        const { workflow } = req.body

        const workflowService = await WORKFLOW()
        let workflowInstance = workflowService.workflow(workflow)
        
        res.send(workflowInstance.getChart())

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const getWorkflows = async (req, res) => {
    
    try {
        let workflowName = req.params.workflowId
        
        const workflow = await WORKFLOW()
        let result = workflow.selectWorkflow((workflowName) ? t => t.options.name == workflowName : t => true)
        res.send(result)

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const getAvailableAgents = async (req, res) => {
    
    try {

        const workflow = await WORKFLOW()
        let result = workflow.getAvailableAgents()
        res.send(result)

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const startWorkflow = async (req, res) => {
    
    try {
        const { workflow } = req.body

        const workflowService = await WORKFLOW()
        let workflowInstance = workflowService.workflow(workflow)
        await workflowInstance.start()
        
        res.status(200).send()

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const stopWorkflow = async (req, res) => {
    
    try {
        const { workflow } = req.body

        const workflowService = await WORKFLOW()
        let workflowInstance = workflowService.workflow(workflow)
        await workflowInstance.stop()
        
        res.status(200).send()

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const getTriggers = async (req, res) => {
    
    try {
        let triggerId = req.params.triggerId
        let result = await TRIGGERS.getTriggersInfo((triggerId) ? t => t.id == triggerId : t => true)
        res.send(result)

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const stopTrigger = async (req, res) => {
    
    try {
        const { id } = req.body
        let result = await TRIGGERS.update({
            id,
            state: "stopped"
        })
        res.status(200).send()

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const startTrigger = async (req, res) => {
    
    try {
        const { id } = req.body
        let result = await TRIGGERS.update({
            id,
            state: "available"
        })
        res.status(200).send()

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const updateTrigger = async (req, res) => {
    
    try {
        const options = req.body
        let result = await TRIGGERS.update(options)
        res.status(200).send()

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const getPoolStat = async (req, res) => {
    
    try {
        const options = req.body
        let result = await STAT.getPoolStat(options)
        res.send(result)

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const getDeferredStat = async (req, res) => {
    
    try {
        const options = req.body
        let result = await STAT.getDeferredStat(options.emitter)
        res.send(result)

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const getAssignedStat = async (req, res) => {
    try {
        
        const employeeManager = await EMPLOYEE_MANAGER()
        const emitter = req.body.emitter
        let result = await employeeManager.employes(emp => emp.schedule)
        result = sum(result
                        .map( r => (r.taskList || []).filter(t => (emitter) ? t.metadata.emitter == emitter : true).length)
        )
        res.send([{
            emitter,
            count: result
        }])

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }    
}

const getTaskStat = async (req, res) => {
    
    try {
        const selector = req.body
        let result = await STAT.getTaskStat(selector)
        res.send(result)

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const getMetric = async (req, res) => {
    
    try {
        let result = await STAT.getMetric(req.body)
        res.send(result)

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const getTaskEvents = async (req, res) => {
    
    try {
        const options = req.body
        let result = await STAT.getTaskEvents(options)
        res.send(result)

    } catch (e) {
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}



 
module.exports = {
    getTaskList,
    getMetadata,
    getChart,
    getChart1,
    
    rollback,
    fastForward,
    getEmployes,
    setEmployesSchedule,
    getEmployeeProfile,

    getWorkflows,
    startWorkflow,
    stopWorkflow,
    getWorkflowChart,
    getAvailableAgents,

    getTriggers,
    startTrigger,
    stopTrigger,
    updateTrigger,

    getPoolStat,
    getDeferredStat,
    getTaskStat,
    getTaskEvents,
    getAssignedStat,
    getMetric


    
}