const docdb = require("./utils/docdb")
const { extend, find, last } = require("lodash")
const moment = require("moment")

const Key = require("./workflow/utils/task-key")
const WORKFLOW = require("./workflow")

const getRecordData = async (req, res) => {
    try {

        let { user, sourceKey } = req.body.options
        
        const description = Key(sourceKey).getDescription()
        
        const workflow = await WORKFLOW()
        agentInstance = workflow.agent(description.taskType)
        
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        // console.log(sourceKey)
        let result = await agentInstance.read(sourceKey)
        result.permissions = agentInstance.uiPermissions
        res.send(result)

    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const saveRecordData = async (req, res) => {
    
    try {

        let { user, sourceKey, data, metadata } = req.body.options
        
        const description = Key(sourceKey).getDescription()
        
        const workflow = await WORKFLOW()
        agentInstance = workflow.agent(description.taskType)
        
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        
        let result = await agentInstance.save({
            user: user.altname, 
            sourceKey, 
            data, 
            metadata
        })
        
        res.send(result)

    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }

}    

const rejectRecordData = async (req, res) => {
    try {

        let { user, sourceKey, metadata } = req.body.options
        
        const description = Key(sourceKey).getDescription()
        
        const workflow = await WORKFLOW()
        agentInstance = workflow.agent(description.taskType)
        
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        
        let result = await agentInstance.reject({
            user: user.altname, 
            sourceKey, 
            metadata
        })
        
        res.send(result)


    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }   
}

const submitRecordData = async (req, res) => {
       try {
        
        let { user, sourceKey, data, metadata } = req.body.options
        
        const description = Key(sourceKey).getDescription()
        
        const workflow = await WORKFLOW()
        agentInstance = workflow.agent(description.taskType)
        
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        
        let result = await agentInstance.submit({
            user: user.altname, 
            sourceKey, 
            data, 
            metadata
        })
        
        res.send(result)

    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const rollbackRecordData = async (req, res) => {
    try {

        let { user, sourceKey } = req.body.options
        
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

const getVersionChart = async (req, res) => {
     try {
        let {sourceKey, agent} = req.body.options
        const workflow = await WORKFLOW()
        
        agentInstance = workflow.agent(agent)
        
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        
        let result = await agentInstance.chart({sourceKey})
        res.send(result)

    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}

const getVersionChart1 = async (req, res) => {
     try {
        let {sourceKey, agent} = req.body.options
        const workflow = await WORKFLOW()
        
        agentInstance = workflow.agent(agent)
        
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        
        let result = await agentInstance.chart1({sourceKey})
        res.send(result)

    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const getSegmentationAnalysis = async (req, res) => {
     try {
        
        let { user, sourceKey, agent } = req.body.options
        
        const description = Key(sourceKey).getDescription()
        
        agentAlias = agent || description.taskType 
        // console.log("sourceKey", sourceKey)
        // console.log("agentAlias", agentAlias)
        
        const workflow = await WORKFLOW()
        agentInstance = workflow.agent(agentAlias)
        
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        
        let result = await agentInstance.getSegmentationAnalysis(Key(sourceKey).taskType(agentAlias).get())

        res.send(result)

    } catch (e) {
        console.log(e.toString())
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}





const getMetadata = async (req, res) => {
    try {

        res.send(req.body.cache.metadata)

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}

const getEmployeeStats = async (req, res) => {
    
    const workflow = await WORKFLOW()
    
    // agentInstance = workflow.agent("Basic_Labeling_1st")
        
    // if(!agentInstance) throw new Error(`Agent ${agent} not found`)
    let result = await workflow.getEmployeeStats(req.body)
    res.send(result)

}


const getForms = async (req, res) => {
    try {

        let options = req.body.options
        const { id, schema } = options
        
        const db = req.body.cache.defaultDB
        const diaTags = req.body.cache.diagnosisTags
        
        let data = await docdb.aggregate({
            db,
            collection: `${schema}.examinations`,
            pipeline: [{
                '$match': {
                    'id': id
                }
            }]
        })

        data = data[0]
        let result = {}
        
        if (data) {

            result = {
                patient: data.forms.patient.data,
                echo: data.forms.echo.data,
                ekg: data.forms.ekg.data,  
                examination: {
                    id: data.id,
                    patientId: data.id,
                    state: data.state
                }
            }

            if ( result.patient && result.patient.diagnosisTags && result.patient.diagnosisTags.tags ) {
                result.patient.diagnosisTags.tags = result.patient.diagnosisTags.tags
                    .map( id => find(diaTags, d => d.id == id))
                    .filter(t => t)
            }
            
        }

        res.send(result)

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}



// const getForms = async (req, res) => {
//     try {

//         let options = req.body.options
//         let { db } = req.body.cache.currentDataset

//         let data = await mongodb.aggregate({
//             db,
//             collection: `${db.name}.examinations`,
//             pipeline: [{
//                 '$match': {
//                     'patientId': options.patientId
//                 }
//             }, {
//                 '$lookup': {
//                     'from': "forms",
//                     'localField': 'id',
//                     'foreignField': 'examinationId',
//                     'as': 'forms'
//                 }
//             }, {
//                 '$lookup': {
//                     'from': "actors",
//                     'localField': 'actorId',
//                     'foreignField': 'id',
//                     'as': 'physician'
//                 }
//             }, {
//                 '$lookup': {
//                     'from': "labels",
//                     'localField': 'id',
//                     'foreignField': 'Examination ID',
//                     'as': 'records'
//                 }
//             }, {
//                 '$project': {
//                     '_id': 0,
//                     'type': 1,
//                     'comment': 1,
//                     'state': 1,
//                     'dateTime': 1,
//                     'patientId': 1,
//                     'forms': 1,
//                     'physician': 1,
//                     'recordCount': {
//                         '$size': '$records'
//                     }
//                 }
//             }, {
//                 '$project': {
//                     'records': 0
//                 }
//             }]
//         })

//         data = data[0]

//         if (data) {

//             let formType = ["patient", "echo", "ekg"]
//             let forms = formType.map(type => {
//                 let f = find(data.forms, d => d.type == type)
//                 if (f && f.data) {
//                     let form = f.data.en || f.data.uk
//                     if (form) return extend(form, { formType: type })
//                 }
//             }).filter(f => f)

//             let patientForm = find(forms, f => f.formType == "patient")

//             if (patientForm) {
//                 if (patientForm.diagnosisTags) {
//                     if (patientForm.diagnosisTags.tags) {
//                         let tags = await mongodb.aggregate({
//                             db,
//                             collection: `settings.tags`,
//                             pipeline: [{
//                                     $match: {
//                                         id: {
//                                             $in: patientForm.diagnosisTags.tags
//                                         }
//                                     }
//                                 },
//                                 {
//                                     $project: {
//                                         _id: 0,
//                                         name: 1
//                                     }
//                                 }
//                             ]
//                         })

//                         patientForm.diagnosisTags.tags = tags.map(t => last(t.name.split("/")))

//                     } else {
//                         patientForm.diagnosisTags.tags = []
//                     }
//                 }
//             }


//             let physician
//             if (data.physician) {
//                 physician = data.physician[0]
//                 physician = (physician) ? {
//                     name: `${physician.firstName} ${physician.lastName}`,
//                     email: physician.email
//                 } : { name: "", email: "" }
//             } else {
//                 physician = { name: "", email: "" }
//             }


//             result = {
//                 examination: {
//                     patientId: data.patientId,
//                     recordCount: data.recordCount,
//                     state: data.state,
//                     comment: data.comment,
//                     date: moment(new Date(data.dateTime)).format("YYYY-MM-DD HH:mm:ss"),
//                     physician
//                 },
//                 patient: find(forms, f => f.formType == "patient"),
//                 ekg: find(forms, f => f.formType == "ekg"),
//                 echo: find(forms, f => f.formType == "echo"),
//             }
//         } else {
//             result = {}
//         }

//         res.send(result)

//     } catch (e) {
//         res.send({
//             error: e.toString(),
//             requestBody: req.body
//         })
//     }
// }


// const getChangelog = async (req, res) => {
//     try {

//         let options = req.body.options
//         let { db } = req.body.cache.currentDataset

//         const changelog = await mongodb.aggregate({
//             db,
//             collection: `${db.name}.changelog-recordings`,
//             pipeline: [{
//                     $match: {
//                         recordingId: options.recordingId,
//                     },
//                 },
//                 {
//                     $project: {
//                         _id: 0,
//                     },
//                 },
//                 {
//                     $sort: {
//                         startedAt: -1,
//                     },
//                 },
//             ]
//         })

//         res.status(200).send(changelog)

//     } catch (e) {

//         res.status(500).send(e.toString())

//     }
// }


// const getSegmentation = async (req, res) => {
//     try {

//         let { options } = req.body

//         options = extend(
//             options,
//             req.body.cache.currentDataset, { userProfiles: req.body.cache.userProfiles }
//         )

//         let handler = (dataStrategy[options.strategy]) ? dataStrategy[options.strategy].getSegmentation : undefined
//         let result
//         if (handler) {
//             result = await handler(options)
//         } else {
//             result = {}
//         }

//         res.send(result)

//     } catch (e) {

//         res.send({
//             error: `${e.toString()}\n${e.stack}`,
//             requestBody: req.body
//         })
//     }
// }



// const getRecords = async (req, res) => {
//     try {

//         let options = req.body.options
//         let { db } = req.body.cache.currentDataset

//         let pipeline = options.excludeFilter
//             .concat(options.valueFilter)
//             .concat([{
//                 '$project': {
//                     '_id': 0
//                 }
//             }])

//         const data = await mongodb.aggregate({
//             db,
//             collection: `${db.name}.labels`,
//             pipeline
//         })


//         res.send({
//             options,
//             collection: data
//         })

//     } catch (e) {
//         res.send({
//             error: e.toString(),
//             requestBody: req.body
//         })
//     }

// }

// const getLongTermTask = async (req, res) => {
//     let {type, id} = req.body
//     res.send(LongTerm.pool.getTask(type, id))
// }



module.exports = {
    getRecordData,
    saveRecordData,
    rejectRecordData,
    submitRecordData,
    rollbackRecordData,
    getVersionChart,
    getVersionChart1,
    getMetadata,
    getSegmentationAnalysis,
    getEmployeeStats,
    getForms,
    // getChangelog,
    // getSegmentation,
    // getRecords,
    // getLongTermTask
}