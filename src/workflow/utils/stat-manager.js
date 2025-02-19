const uuid = require("uuid").v4

const docdb = require("../../utils/docdb")

const config = require("../../../.config")
const db = config.docdb

const { isArray, last, keys, isFunction, extend, find } = require("lodash")
const moment = require("moment")

const getPoolStat = async collection => {
    let result = await docdb.countDocuments({
        db,
        collection: `ADE-TASK-POOL.${collection}`
    })
    return result
}

const getDeferredStat = async () => {

    let result = await docdb.aggregate({
        db,
        collection: `ADE-SETTINGS.deferred-tasks`,
        pipeline: [{
                $group: {
                    _id: "$data.alias",
                    count: {
                        $sum: 1,
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    taskType: "$_id",
                    count: 1,
                },
            },
        ]
    })
    return result

}

const getTaskStat = async ({ status }) => {
    let result = await docdb.aggregate({
        db,
        collection: `ADE-SETTINGS.task-log`,
        pipeline: [{
                $match: {
                    "metadata.status": status,
                },
            },
            {
                $group: {
                    _id: "$description.taskType",
                    count: {
                        $sum: 1,
                    },
                    workflowType: {
                        $first: "$description.workflowType"
                    }
                },
            },
            {
                $project: {
                    _id: 0,
                    taskType: "$_id",
                    workflowType: 1,
                    count: 1,
                },
            },
        ]
    })
    return result
}

const getTaskEvents = async ({ status, startDate }) => {
    startDate = startDate || moment().subtract(24, "hours").toDate()
    let pipeline = [
    
        {
    $addFields:
      
      {
        d: {
          $dateFromString: {
            dateString: "$createdAt",
          },
        },
      },
  },
        {
            $match: {
                "metadata.status": status,
                d: {
                    $gte: startDate,
                },
            },
        },
        {
            $group: {
                _id: "$description.taskType",
                events: {
                    $push: "$d",
                },
                workflowType: {
                    $first: "$description.workflowType",
                },
            },
        },
        {
            $project: {
                _id: 0,
                taskType: "$_id",
                workflowType: 1,
                events: 1,
            },
        },
    ]
    let result = await docdb.aggregate({
        db,
        collection: `ADE-SETTINGS.task-log`,
        pipeline
    })

    return result
}


module.exports = {
    getPoolStat,
    getDeferredStat,
    getTaskStat,
    getTaskEvents
}