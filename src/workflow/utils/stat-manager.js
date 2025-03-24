const uuid = require("uuid").v4

const log  = require("./logger")(__filename) //(path.basename(__filename))

const docdb = require("../../utils/docdb")

const config = require("../../../.config")
const db = config.docdb

const { isArray, last, keys, isFunction, extend, find, sortBy } = require("lodash")
const moment = require("moment")

const getPoolStat = async collection => {
    let result = await docdb.countDocuments({
        db,
        collection: `ADE-TASK-POOL.${collection}`
    })
    return result
}

const getDeferredStat = async emitter => {

    let pipeline = (emitter) 
        ?   [
                {
                    $match: {
                        "data.metadata.emitter": emitter
                    }
                }
            ]
        : []    

    pipeline = pipeline.concat([
        {
            $group: {
                _id: "1",
                count: {
                    $sum: 1,
                },
            },
        },
        {
            $project: {
                _id: 0,
                count: 1,
                emitter: emitter
            },
        },
    ])    

    let result = await docdb.aggregate({
        db,
        collection: `ADE-SETTINGS.deferred-tasks`,
        pipeline
    })
    
    return result

}

const getAssignedStat = async => {

}

const getTaskStat = async selector  => {
    try {
        if(!selector) return []

        let result = await docdb.aggregate({
            db,
            collection: `ADE-SETTINGS.task-log`,
            pipeline: selector
        })
        return result
    } catch (e) {
        log(e.toString(), e.stack)
        throw e
    }    
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


const getMetric = async ({ metric, filter, limit, afterDate}) => {

    let pipeline = [
        {
            $match: filter || {}
        },
        {
            $sort: {
                date: -1
            }
        }
    ]

    if(lastDate){
        pipeline.push({
            $match:{
                date: {
                    $gt: moment(afterDate).toDate()
                }
            }
        })
    } else {
        pipeline.push({$limit: limit || 1})
    }

    let result = await docdb.aggregate({
        db,
        collection: `ADE-STATS.${metric}`,
        pipeline
    })    

    return sortBy(result, d => d.date)
} 



module.exports = {
    getPoolStat,
    getDeferredStat,
    getTaskStat,
    getTaskEvents,
    getMetric
}