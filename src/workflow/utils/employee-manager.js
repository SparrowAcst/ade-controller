const { remove, isFunction, flatten, findIndex, find, extend } = require("lodash")
const moment = require("moment")
const uuid = require("uuid").v4

const NodeCache = require("node-cache")
const EMPLOYEE_CACHE = new NodeCache({
    useClones: false
})

const VERSION_SERVICE = require("./data-version-manager")({
    dataView: {
        labels: d => ({ id: d.id })
    }
})


const Key = require("./task-key")

let vs_consumer
let vs_publisher

let initiated = false

const docdb = require("../../utils/docdb")
const config = require("../../../.config")
const db = config.docdb

const { getPublisher, getConsumer, getLogPublisher } = require("./employee-messages")

const normalizeSelector = selector => {
    selector = selector || (() => true)
    selector = (isFunction(selector)) ? selector : (() => true)

    return selector
}


const employes = selector => {
    return EMPLOYEE_CACHE.keys().map(user => employee(user)).filter(normalizeSelector(selector))
}

const employee = user => {
    return EMPLOYEE_CACHE.get(user)
}

const priorities = selector => {
    let result = employes(selector)
        .map(user => ({
            user: user.namedAs,
            priority: user.taskList.length
        }))

    return result
}

const processEmployee = (emp, task, employeeOperation) => {
    if (employeeOperation == "insert") {
        emp.taskList.push(task)
        return emp
    }
    if (employeeOperation == "remove") {
        remove(emp.taskList, tl => Key(tl.key).getIdentity() == Key(task.key).getIdentity())
        return emp
    }
    if (employeeOperation == "update") {
        let index = findIndex(emp.taskList, tl => Key(tl.key).getIdentity() == Key(task.key).getIdentity())
        emp.taskList[index] = task
        return emp
    }

    return emp
}


const updateData = async options => {
    let {sourceKey, update } = options
    
    let key = Key(sourceKey)    
    let versionManager = await VERSION_SERVICE.getManager({key: key.getDataKey()})
    await versionManager.updateData({
        source: {id: key.versionId()},
        update
    })
}

const updateTask = async options => {

    let { 
        user, 
        sourceKey, 
        targetKey, 
        data, 
        metadata, 
        method, 
        defferedTimeout, 
        employeeOperation, 
        waitFor 
    } = options

    let prevCtx = await context(sourceKey)

    let key = Key(sourceKey)    

    let versionManager = await VERSION_SERVICE.getManager({key: key.getDataKey()})

    let version = versionManager[method]({
        user,
        source: { id: key.versionId() },
        data,
        defferedTimeout,
        metadata
    })

   
    let inheritedWaitFor = (prevCtx.task) ? prevCtx.task.waitFor || [] : []
    if(waitFor){
        inheritedWaitFor.push(waitFor)
    }


    targetKey = targetKey || sourceKey

    let task = {
        key: Key(targetKey).versionId(version.id).get(),
        user,
        metadata,
        waitFor: inheritedWaitFor,
        createdAt: new Date()
    }

    let emp = processEmployee(EMPLOYEE_CACHE.get(user), task, employeeOperation(version))

    EMPLOYEE_CACHE.set(user, emp)

    publisher = await getPublisher()
    publisher.send({
        command: "store",
        collection: "ADE-SETTINGS.app-grants",
        data: [emp]
    })

    let logPublisher = await getLogPublisher()
    logPublisher.send({
        command: "store",
        collection: "ADE-SETTINGS.task-log",
        data: [extend({}, task, { id: uuid(), description: Key(task.key).getDescription() })]
    })

    return task
}

const create = async options => {
    let { user, sourceKey, metadata, waitFor, targetKey } = options
    
    let task = await updateTask({
        user,
        sourceKey,
        targetKey,
        metadata,
        method: "createBranch",
        employeeOperation: () => "insert",
        waitFor
    })

    return task
}

const save = async options => {
    let { user, sourceKey, data, metadata } = options
    let task = await updateTask({
        user,
        sourceKey,
        targetKey: Key(sourceKey).taskState("save").get(),
        data,
        metadata,
        method: "createSavepoint",
        employeeOperation: () => "update"
    })

    return task
}

const submit = async options => {
    let { user, sourceKey, metadata, data, defferedTimeout} = options
    let task = await updateTask({
        user,
        sourceKey,
        targetKey: Key(sourceKey).taskState("submit").get(),
        data,
        defferedTimeout,
        metadata,
        method: "createSubmit",
        employeeOperation: () => "update" //version => (moment(new Date()).isSameOrBefore(moment(version.expiredAt))) ? "update" : "delete"
    })

    return task
}

const rollback = async options => {
    let { user, sourceKey, metadata } = options

    let ctx = await context(sourceKey)
    if(ctx.task && ctx.task.lock) throw new Error(`Cannot apply rollback for locked task ${sourceKey}`)
    
    let task = await updateTask({
        user,
        sourceKey,
        targetKey: Key(sourceKey).taskState("rollback").get(),
        metadata,
        method: "rollbackSubmit",
        employeeOperation: () => "update"
    })

    return task
}

const commit = async options => {
    let { user, sourceKey, metadata, data } = options

    metadata = (metadata || {})
    metadata.status = "commit"

    let task = await updateTask({
        user,
        sourceKey,
        targetKey: Key(sourceKey).taskState("commit").get(),
        data,
        metadata,
        method: "createCommit",
        employeeOperation: () => "update"
    })

    task = await release({ user, sourceKey: task.key })

    return task
}


const lock = async options => {

    let { user, sourceKey } = options
    let emp = EMPLOYEE_CACHE.get(user)
    let task = find(emp.taskList, t => Key(t.key).getIdentity() == Key(sourceKey).getIdentity())
    if(task){
        task.lock = true
    }

    EMPLOYEE_CACHE.set(user, emp)
    
    let publisher = await getPublisher()
    publisher.send({
        command: "store",
        collection: "ADE-SETTINGS.app-grants",
        data: [emp]
    })
 
}

const release = async options => {
    let { user, sourceKey } = options
    let emp = EMPLOYEE_CACHE.get(user)
    
    let task = remove(emp.taskList, tl => Key(tl.key).getIdentity() == Key(sourceKey).getIdentity())[0]
    
    EMPLOYEE_CACHE.set(user, emp)
    
    let publisher = await getPublisher()
    publisher.send({
        command: "store",
        collection: "ADE-SETTINGS.app-grants",
        data: [emp]
    })

    if(!task) {
        console.log("RELESE: task not found: > ",user," > ",sourceKey )
        // return
    }
    
    task = task || {}
    task.metadata = (task.metadata || {})
    task.metadata.status = "release"
    
    let logPublisher = await getLogPublisher()
    logPublisher.send({
        command: "store",
        collection: "ADE-SETTINGS.task-log",
        data: [extend({}, task, { id: uuid(), description: Key(task.key).getDescription() })]
    })

    return task
}

const context = async key => {
    
    let k = Key(key)
    let versionManager = await VERSION_SERVICE.getManager({key: k.getDataKey()})
   
    let version = versionManager.getVersion(k.versionId())
    let data = versionManager.getData(k.versionId())

    let user = employes(user => user.taskList.filter(t => k.getIdentity() == Key(t.key).getIdentity()).length > 0)[0]
    
    console.log(user, k.getIdentity())

    let task = find((user) ? user.taskList || [] : [], t => k.getIdentity() == Key(t.key).getIdentity())
    
    return {
        user,
        task,
        version,
        data
    }
}

const select = selector => {
    let result = EMPLOYEE_CACHE.keys()
    result = result.map(key => {
        let emp = EMPLOYEE_CACHE.get(key)
        return emp.taskList
    })

    return flatten(result).filter(normalizeSelector(selector))
}

const chart = async taskKey => {
    let versionManager = await VERSION_SERVICE.getManager({key: Key(taskKey).getDataKey()})
    return versionManager.getChart()
}


const getEmployeeStats = async options => {
    let result = await VERSION_SERVICE.getEmployeeStats(options)
    return result
}

const setEmployesSchedule = async options => {
    
    let { employes } = options
    
    let updates = employes.map( e => {
        let emp = EMPLOYEE_CACHE.get(e.namedAs)
        if(emp){
            emp.schedule = e.schedule
            EMPLOYEE_CACHE.set(e.namedAs, emp)
            return emp
        }        
    }).filter( e => e)

    if(updates.length > 0){
        let publisher = await getPublisher()
        publisher.send({
            command: "store",
            collection: "ADE-SETTINGS.app-grants",
            data: updates
        })    
    }
    
}



const close = async () => {
    await vs_consumer.close()
    await vs_publisher.close()
    await (await getConsumer()).close()
    await (await getPublisher()).close()
}





const init = async () => {
    
    if (!initiated){
        console.log("Employee Manager init...")
        let users = await docdb.aggregate({
            db,
            collection: "ADE-SETTINGS.app-grants",
            pipeline: [{
                $project: {
                    _id: 0
                },
            }, ]
        })
        users.forEach(user => {
            user.taskList = user.taskList || []
            EMPLOYEE_CACHE.set(user.namedAs, user)
        })
        vs_consumer = await VERSION_SERVICE.getConsumer()
        vs_publisher = await VERSION_SERVICE.getPublisher()
        await getConsumer()
        await getPublisher()

        initiated = true
    }    

    const Task = {
        create,
        save,
        submit,
        rollback,
        commit,
        lock,
        release,
        select,
        context,
        chart,
        updateData
    }

    console.log("Employee Manager started")

    return {
        close,
        employes,
        employee,
        priorities,
        Task,
        Key,
        getEmployeeStats,
        setEmployesSchedule,

         Messages: {
            getConsumer,
            getPublisher
        },

        getVersionService: () => VERSION_SERVICE
    }
}

module.exports = init


// const test = async () => {
//     const SCHEMA = "strazhesko-part-1"
//     const DATA_COLLECTION = "labels"
//     const SAVEPOINTS_COLLECTION = "savepoints"
//     const DATA_ID = "8f9044eb-c1b5-466b-99f9-dd287e623830"
//     const VERSION_ID = "333012d2-0bdc-4c4f-a7a1-345740cf0afd"

//     const EMPLOYEE_SERVICE = await init()
//     const USER = "Andrey Boldak"

//     const { employes, emploee, select, priorities, Task } = EMPLOYEE_SERVICE

//     console.log(priorities(user => user.schedule && user.schedule.length > 0))
//     // console.log(employee(USER))
//     // console.log(select(user => user.schedule && user.schedule.length > 0))

//     let taskDescription = {
//         schema: SCHEMA,
//         dataCollection: DATA_COLLECTION,
//         savepointCollection: SAVEPOINTS_COLLECTION,
//         dataId: DATA_ID,
//         versionId: VERSION_ID
//     }

//     let task = await Task.create({
//         user: USER,
//         sourceKey: Task.buildKey(taskDescription),
//         metadata: {
//             task: "TEST",
//             status: "started"
//         }
//     })

//     let taskContext = await Task.context(task.id)


//     let data = taskContext.data
//     data.CHANGED = 1

//     let save = await Task.save({
//         user: USER,
//         sourceKey: task.id,
//         data,
//         metadata:{
//             task: "TEST",
//             status: "SAVEPOINT"
//         }
//     })


//     let submit = await Task.submit({
//         user: USER,
//         sourceKey: save.id,
//         data,
//         metadata:{
//             task: "TEST",
//             status: "SUBMIT"
//         }
//     })

//     // await Task.rollback({
//     //    user: USER,
//     //    sourceKey: submit.id,     
//     // })

//     let commit = await Task.commit({
//         user: USER,
//         sourceKey: submit.id,
//         data,
//         metadata:{
//             task: "TEST",
//             status: "COMMIT"
//         }
//     })

//     console.log(JSON.stringify((await Task.chart(commit.id)), null, " "))

//     // console.log(task1)
//     // console.log((await Task.context(task1.id)))
//     // console.log((await Task.context(task.id)))

//     // console.log(commit.id)

//     setTimeout(async () => {
//         await EMPLOYEE_SERVICE.close()
//     }, 10000)


// }


// test()