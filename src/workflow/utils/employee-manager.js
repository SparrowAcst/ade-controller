const { remove, isFunction, flatten, findIndex, find, extend, isArray, last } = require("lodash")
const moment = require("moment")
const uuid = require("uuid").v4

const log = require("./logger")(__filename) //(path.basename(__filename))

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

const { getPublisher, getConsumer, getLogPublisher, getMsConsumer } = require("./employee-messages")

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



const updateEmployee = async emp => {

    // log("updateEmployee", emp)
    if (!emp || !emp.namedAs) return

    EMPLOYEE_CACHE.set(emp.namedAs, emp)

    publisher = await getPublisher()
    publisher.send({
        command: "store",
        collection: "ADE-SETTINGS.app-grants",
        data: [emp]
    })

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


const syncAltVersions = async (sourceKey, targetKey) => {
    try {

        let publisher = await getPublisher()

        let emps = employes(emp => {
            let alts = flatten(emp.taskList.map(t => t.altVersions).filter(d => d))
            return alts.includes(sourceKey)
        })

        // log(emps.map(e => e.namedAs))

        for (let emp of emps) {
            let t = find(emp.taskList, t => (t.altVersions || []).includes(sourceKey))
            // log(emp, t.key)
            if (!t) continue
            let index = findIndex((t.altVersions || []), k => k == sourceKey)
            // log("index", index)
            if (index >= 0) {
                t.altVersions[index] = targetKey
                publisher.send({
                    command: "store",
                    collection: "ADE-SETTINGS.app-grants",
                    data: [emp]
                })
            }

        }

    } catch (e) {
        log(e.toString(), e.stack)
    }


}


const updateData = async options => {
    let { sourceKey, update } = options

    let key = Key(sourceKey)
    const versionService = await VERSION_SERVICE.getService()
    let versionManager = await versionService.getManager({ key: key.getDataKey() })
    await versionManager.updateData({
        source: { id: key.versionId() },
        update
    })
}


const updateMetadata = async options => {

    let { sourceKey, update } = options
    let ctx = await context(sourceKey)
    if (ctx && ctx.task) {
        ctx.task.metadata = ctx.task.metadata || {}
        ctx.task.metadata = extend({}, ctx.task.metadata, update)
        await updateEmployee(ctx.user)
    } else {
        log(`Employee Manager: No context for ${sourceKey}`)
    }


}


const updateTask = async options => {
    try {
        let {
            user,
            sourceKey,
            targetKey,
            data,
            metadata,
            method,
            defferedTimeout,
            employeeOperation,
            waitFor,
            altVersions,
            iteration,
            noSyncAltVersions
        } = options


        let prevCtx = await context(sourceKey)

        let key = Key(sourceKey)

        const versionService = await VERSION_SERVICE.getService()
        let versionManager = await versionService.getManager({ key: key.getDataKey() })

        let version = versionManager[method]({
            user,
            source: { id: key.versionId() },
            data,
            altVersions,
            defferedTimeout,
            metadata
        })


        let inheritedWaitFor = (prevCtx.task) ? prevCtx.task.waitFor || [] : []
        if (waitFor) {
            inheritedWaitFor.push(waitFor)
        }


        targetKey = targetKey || sourceKey

        let task = {
            key: Key(targetKey).versionId(version.id).get(),
            user,
            metadata,
            altVersions,
            iteration: iteration,
            waitFor: inheritedWaitFor,
            createdAt: new Date()
        }


        let emp = processEmployee(EMPLOYEE_CACHE.get(user), task, employeeOperation(version))
        EMPLOYEE_CACHE.set(user, emp)

        if (!noSyncAltVersions) await syncAltVersions(sourceKey, task.key)

        // log("!!!", method, sourceKey, targetKey, task)

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
    } catch (e) {
        log(e.toString(), e.stack)
        throw e
    }
}

const create = async options => {
    let { user, sourceKey, metadata, waitFor, targetKey, altVersions, iteration, noSyncAltVersions } = options

    let task = await updateTask({
        user,
        sourceKey,
        targetKey,
        metadata,
        method: "createBranch",
        employeeOperation: () => "insert",
        waitFor,
        altVersions,
        noSyncAltVersions,
        iteration: iteration
    })

    return task
}

const baseBranch = async options => {

    let { user, sourceKey, metadata } = options

    let key = Key(sourceKey)

    // log(key.getDescription())
    const versionService = await VERSION_SERVICE.getService()
    let versionManager = await versionService.getManager({ key: key.getDataKey() })

    let version = versionManager.createBranch({
        user,
        source: { id: key.versionId() },
        metadata
    })

    return version
}

const save = async options => {

    let { user, sourceKey, data, metadata, altVersions, iteration, noSyncAltVersions } = options
    // log("metadata", metadata)
    let task = await updateTask({
        user,
        sourceKey,
        targetKey: Key(sourceKey).taskState("save").get(),
        data,
        metadata,
        method: "createSavepoint",
        employeeOperation: () => "update",
        altVersions,
        noSyncAltVersions,
        iteration: iteration
    })

    return task
}

const submit = async options => {
    let { user, sourceKey, metadata, data, defferedTimeout, altVersions, iteration, noSyncAltVersions } = options
    let task = await updateTask({
        user,
        sourceKey,
        targetKey: Key(sourceKey).taskState("submit").get(),
        data,
        defferedTimeout,
        metadata,
        method: "createSubmit",
        employeeOperation: () => "update",
        altVersions,
        noSyncAltVersions,
        iteration: iteration //version => (moment(new Date()).isSameOrBefore(moment(version.expiredAt))) ? "update" : "delete"
    })

    return task
}

const rollback = async options => {
    let { user, sourceKey, metadata, altVersions, iteration, noSyncAltVersions } = options

    let ctx = await context(sourceKey)
    if (ctx.task && ctx.task.lock) throw new Error(`Cannot apply rollback for locked task ${sourceKey}`)

    let task = await updateTask({
        user,
        sourceKey,
        targetKey: Key(sourceKey).taskState("rollback").get(),
        metadata,
        method: "rollbackSubmit",
        employeeOperation: () => "update",
        altVersions,
        noSyncAltVersions,
        iteration: iteration
    })

    return task
}

const commit = async options => {
    let { user, sourceKey, metadata, data, altVersions, iteration, noSyncAltVersions } = options

    metadata = (metadata || {})
    metadata.status = "commit"
    metadata.workflow = Key(sourceKey).workflowType()

    let task = await updateTask({
        user,
        sourceKey,
        targetKey: Key(sourceKey).taskState("commit").get(),
        data,
        metadata,
        method: "createCommit",
        employeeOperation: () => "update",
        altVersions,
        noSyncAltVersions,
        iteration: iteration
    })

    task = await release({ user, sourceKey: task.key })

    return task
}

const merge = async options => {
    let { user, sourceKey, metadata, data, altVersions, iteration, noSyncAltVersions } = options

    metadata = (metadata || {})
    metadata.status = "merge"

    // log(altVersions)

    let task = await updateTask({
        user,
        sourceKey,
        targetKey: Key(sourceKey).taskState("merge").get(),
        data,
        metadata,
        method: "createMerge",
        employeeOperation: () => "insert",
        altVersions, //: altVersions.map(a => a.task.key),
        noSyncAltVersions,
        iteration: iteration
    })

    await release({ user, sourceKey: task.key })

    for (let a of altVersions) {
        await release({ user: Key(a).user(), sourceKey: a })
    }

    return task

}


const lock = async options => {

    let { user, sourceKey } = options
    let emp = EMPLOYEE_CACHE.get(user)
    let task = find(emp.taskList, t => Key(t.key).getIdentity() == Key(sourceKey).getIdentity())
    if (task) {
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

    if (!task) {
        // log("RELESE: task not found: > ",user," > ",sourceKey )
        return
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
    const versionService = await VERSION_SERVICE.getService()
    let versionManager = await versionService.getManager({ key: k.getDataKey() })

    let version = versionManager.getVersion(k.versionId())
    let data = versionManager.getData(k.versionId())

    let user = employes(user => user.taskList.filter(t => k.getIdentity() == Key(t.key).getIdentity()).length > 0)[0]

    // log(user, k.getIdentity())

    let task = find(user ? user.taskList || [] : [], t => k.getIdentity() == Key(t.key).getIdentity())

    return {
        user,
        task,
        version,
        data
    }
}

const altVersions = async key => {

    let k = Key(key)

    let user = employes(user => user.taskList.filter(t => k.getIdentity() == Key(t.key).getIdentity()).length > 0)[0]
    // log(user, k.getIdentity())

    if (!user) return []

    let task = find(user.taskList || [], t => k.getIdentity() == Key(t.key).getIdentity())

    let res = []
    for (let alt of (task.altVersions || [])) {
        let v = await context(alt)
        res.push(v)
    }

    return res

}


const comparedVersions = async key => {

    let k = Key(key)

    let user = employes(user => user.taskList.filter(t => k.getIdentity() == Key(t.key).getIdentity()).length > 0)[0]
    // log(user, k.getIdentity())

    if (!user) return []

    let task = find(user.taskList || [], t => k.getIdentity() == Key(t.key).getIdentity())

    let res = []
    for (let alt of (task.metadata.comparedVersions || [])) {
        let v = await context(alt)
        res.push(v)
    }

    return res

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
    const versionService = await VERSION_SERVICE.getService()
    let versionManager = await versionService.getManager({ key: Key(taskKey).getDataKey() })
    return versionManager.getChart()
}

const chart1 = async taskKey => {
    const versionService = await VERSION_SERVICE.getService()
    let versionManager = await versionService.getManager({ key: Key(taskKey).getDataKey() })
    return versionManager.getChart1()
}


const getEmployeeStats = async options => {
    const versionService = await VERSION_SERVICE.getService()
    let result = await versionService.getEmployeeStats(options)
    return result
}

const setEmployesSchedule = async options => {

    let { employes } = options

    let updates = employes.map(e => {
        let emp = EMPLOYEE_CACHE.get(e.namedAs)
        if (emp) {
            emp.schedule = e.schedule
            EMPLOYEE_CACHE.set(e.namedAs, emp)
            return emp
        }
    }).filter(e => e)

    if (updates.length > 0) {
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


let state = "unavailable"

const isReady = consumer => new Promise((resolve, reject) => {
    let interval = setInterval(async () => {
        let assertion = await consumer.getStatus()
        log.table([assertion])

        if (assertion.consumerCount == 0) {
            clearInterval(interval)
            reject(new Error(`Employee Manager Store MS not available`))
        }

        if (assertion.messageCount == 0) {
            state = "available"
            clearInterval(interval)
            resolve()
        }

    }, 1000)

})



const init = async () => {

    if (!initiated) {
        log("Employee Manager init...")

        log("Check MS state...")
        let msConsumer = await getMsConsumer()
        await isReady(msConsumer)

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

        const versionService = await VERSION_SERVICE.getService()
        vs_consumer = await versionService.getConsumer()
        vs_publisher = await versionService.getPublisher()
        await getConsumer()
        await getPublisher()

        initiated = true
        log("Employee Manager started")

    }

    const Task = {
        create,
        baseBranch,
        save,
        submit,
        rollback,
        commit,
        merge,
        lock,
        release,
        select,
        context,
        chart,
        chart1,
        updateData,
        updateMetadata,
        altVersions,
        comparedVersions
    }


    return {
        close,
        employes,
        employee,
        priorities,
        Task,
        Key,
        getEmployeeStats,
        setEmployesSchedule,
        updateEmployee,

        Messages: {
            getConsumer,
            getPublisher
        },

        getVersionService: async () => {
            const versionService = await VERSION_SERVICE.getService()
            return versionService
        }
    }
}

module.exports = init