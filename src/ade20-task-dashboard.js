
const { extend, keys, sum, get, isArray, find, groupBy, flatten, uniqBy } = require("lodash")
const moment = require("moment")

const EMPLOYEE_MANAGER = require("./workflow/utils/employee-manager")
const WORKFLOW = require("./workflow")

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
        console.log(e.toString(), e.stack)
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
        const workflowType = uniqBy(agents.map(agent => agent.WORKFLOW_TYPE))
        const taskType = uniqBy(agents.map(agent => agent.ALIAS)).filter(d => d !== "Deffered")
        res.send({
            workflowType,
            taskType
        })
    } catch (e) {
        console.log(e.toString(), e.stack)
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
        // console.log(JSON.stringify(chart, null, " "))
        res.send(chart)

    } catch (e) {
        console.log(e.toString(), e.stack)
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
        
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        
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
        
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        
        let result = await agentInstance.fastForward({
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

const getEmployes = async (req, res) => {
    try {
        const employeeManager = await EMPLOYEE_MANAGER()
        let result = await employeeManager.employes( emp => emp.schedule)
        res.send(result)
    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const setEmployesSchedule = async (req, res)=> {
    try {
        
        const { employes } = req.body
        const employeeManager = await EMPLOYEE_MANAGER()
        await employeeManager.setEmployesSchedule({employes})
        // let result = await employeeManager.employes( emp => emp.schedule)
        res.send({})
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
    rollback,
    fastForward,
    getEmployes,
    setEmployesSchedule,
}