// const mongodb = require("./mongodb")
const { extend, find, isString, last } = require("lodash")
const moment = require("moment")

const uuid = require("uuid").v4
const isValidUUID = require("uuid").validate
const isUUID = data => isString(data) && isValidUUID(data)

const log  = require("./workflow/utils/logger")(__filename) //(path.basename(__filename))


const docdb = require("./utils/docdb")


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

const getForms = async (req, res) => {
    try {

        let options = req.body.options
        const { id } = options
        
        const schema = req.body.cache.currentDataset.schema
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
                patient: (data.forms.patient) ? data.forms.patient.data  || {} : {},
                echo: (data.forms.echo) ? data.forms.echo.data || {} : {},
                ekg: (data.forms.ekg) ? data.forms.ekg.data || {} : {},
                attachements: (data.forms.attachements) ? data.forms.attachements.data || [] : [],  
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

// const updateForm = async (req, res) => {

//     let pipeline = []

//     try {

//         let { patientId, type, form } = req.body.options
//         let { db } = req.body.cache.currentDataset

//         pipeline = [{
//             $match: {
//                 patientId,
//                 type
//             }
//         }]

//         let storedForm = await mongodb.aggregate({
//             db,
//             collection: `${db.name}.forms`,
//             pipeline
//         })

//         storedForm = storedForm[0]

//         if (!storedForm) {
//             res.send({
//                 error: `${type} for ${patientId} not found`,
//                 requestBody: req.body
//             })
//         }

//         storedForm.data.en = form

//         let result = await mongodb.replaceOne({
//             db,
//             collection: `${db.name}.forms`,
//             filter: {
//                 patientId,
//                 type
//             },
//             data: storedForm
//         })

//         res.send(result)

//     } catch (e) {
//         res.send({
//             error: e.toString(),
//             requestBody: req.body,
//             pipeline
//         })
//     }
// }


const getSegmentation = async (req, res) => {
    try {

        let { options } = req.body

        options = extend(
            options,
            req.body.cache.currentDataset, { userProfiles: req.body.cache.userProfiles }
        )

        let handler = (dataStrategy[options.strategy]) ? dataStrategy[options.strategy].getSegmentation : undefined
        let result
        if (handler) {
            result = await handler(options)
        } else {
            result = {}
        }

        res.send(result)

    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}



const getRecords = async (req, res) => {
    try {

        let options = req.body.options
        
        const schema = req.body.cache.currentDataset.schema
        const db = req.body.cache.defaultDB
        
        
        let pipeline = [{
                $match: {
                    "examinationId": options.id,
                },
            }]

        const data = await docdb.aggregate({
            db,
            collection: `${schema}.labels`,
            pipeline
        })

        res.send({
            options,
            collection: data
        })

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }

}

const getTags = async (req, res) => {
    try {

        let result = req.body.cache.diagnosisTags
        res.send(result)

    } catch (e) {

        res.send({
            command: "getTags",
            error: e.toString(),
            requestBody: req.body
        })

    }

}

module.exports = {
    getMetadata,
    getForms,
    // updateForm,
    getSegmentation,
    getRecords,
    getTags
}