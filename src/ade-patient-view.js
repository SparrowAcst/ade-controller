const mongodb = require("./mongodb")
const { extend, find, isString, last } = require("lodash")
const moment = require("moment")

const uuid = require("uuid").v4
const isValidUUID = require("uuid").validate
const isUUID = data => isString(data) && isValidUUID(data)



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
        let { db } = req.body.cache.currentDataset

        let data = await mongodb.aggregate({
            db,
            collection: `${db.name}.examinations`,
            pipeline: [{
                '$match': {
                    'patientId': options.patientId
                }
            }, {
                '$lookup': {
                    'from': "forms",
                    'localField': 'id',
                    'foreignField': 'examinationId',
                    'as': 'forms'
                }
            }, {
                '$lookup': {
                    'from': "actors",
                    'localField': 'actorId',
                    'foreignField': 'id',
                    'as': 'physician'
                }
            }, {
                '$lookup': {
                    'from': "labels",
                    'localField': 'id',
                    'foreignField': 'Examination ID',
                    'as': 'records'
                }
            }, {
                '$project': {
                    '_id': 0,
                    'id': 1,
                    'type': 1,
                    'comment': 1,
                    'Stage Comment': 1,
                    'workflowTags': 1,
                    'state': 1,
                    'dateTime': 1,
                    'patientId': 1,
                    'forms': 1,
                    'physician': 1,
                    'recordCount': {
                        '$size': '$records'
                    }
                }
            }, {
                '$project': {
                    'records': 0
                }
            }]
        })

        data = data[0]

        if (data) {

            let formType = ["patient", "echo", "ekg", "attachements"]
            let forms = formType.map(type => {
                let f = find(data.forms, d => d.type == type)
                if (f && f.data) {
                    let form = f.data.en || f.data.uk || f.data
                    if (form) return extend(form, { formType: type, id: f.id })
                }
            }).filter(f => f)

            let patientForm = find(forms, f => f.formType == "patient")

            if (patientForm) {
                if (patientForm.diagnosisTags) {
                    if (patientForm.diagnosisTags.tags) {
                        let tags = await mongodb.aggregate({
                            db,
                            collection: `settings.tags`,
                            pipeline: [{
                                    $match: {
                                        id: {
                                            $in: patientForm.diagnosisTags.tags
                                        }
                                    }
                                },
                                {
                                    $project: {
                                        _id: 0,
                                        name: 1
                                    }
                                }
                            ]
                        })

                        patientForm.diagnosisTags.tags = tags.map(t => last(t.name.split("/")))

                    } else {
                        patientForm.diagnosisTags.tags = []
                    }
                }
            }


            let physician
            if (data.physician) {
                physician = data.physician[0]
                physician = (physician) ? {
                    name: `${physician.firstName} ${physician.lastName}`,
                    email: physician.email
                } : { name: "", email: "" }
            } else {
                physician = { name: "", email: "" }
            }


            result = {
                examination: {
                    id: data.id,
                    patientId: data.patientId,
                    recordCount: data.recordCount,
                    state: data.state,
                    comment: data.comment,
                    'Stage Comment': data['Stage Comment'],
                    workflowTags: data.workflowTags,
                    date: moment(new Date(data.dateTime)).format("YYYY-MM-DD HH:mm:ss"),
                    physician
                },
                patient: find(forms, f => f.formType == "patient"),
                ekg: find(forms, f => f.formType == "ekg"),
                echo: find(forms, f => f.formType == "echo"),
                attachements: find(forms, f => f.formType == "attachements"),
            }
        } else {
            result = {}
        }

        res.send(result)

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}

const updateForm = async (req, res) => {

    let pipeline = []

    try {

        let { patientId, type, form } = req.body.options
        let { db } = req.body.cache.currentDataset

        pipeline = [{
            $match: {
                patientId,
                type
            }
        }]

        let storedForm = await mongodb.aggregate({
            db,
            collection: `${db.name}.forms`,
            pipeline
        })

        storedForm = storedForm[0]

        if (!storedForm) {
            res.send({
                error: `${type} for ${patientId} not found`,
                requestBody: req.body
            })
        }

        storedForm.data.en = form

        let result = await mongodb.replaceOne({
            db,
            collection: `${db.name}.forms`,
            filter: {
                patientId,
                type
            },
            data: storedForm
        })

        res.send(result)

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body,
            pipeline
        })
    }
}


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
        let { db } = req.body.cache.currentDataset

        const resolveSegmentation = async segmentation => {


            if (!segmentation) return

            if (isUUID(segmentation)) {
                let d = await mongodb.aggregate({
                    db,
                    collection: `${db.name}.segmentations`,
                    pipeline: [{
                        $match: {
                            id: segmentation
                        }
                    }]
                })

                return (d[0]) ? d[0].data : undefined

            }

        }

        let pipeline = [{
                $match: {
                    "Examination ID": options.id,
                },
            },
            {
                $lookup: {
                    from: "segmentations",
                    localField: "segmentation",
                    foreignField: "id",
                    as: "result",
                },
            },
            {
                $addFields: {
                    segmentation: {
                        $first: "$result",
                    },
                },
            },
            {
                $addFields: {
                    segmentation: "$segmentation.data",
                },
            },
            {
                $project: {
                    _id: 0,
                    result: 0,
                },
            },
        ]
        // options.excludeFilter
        //     .concat(options.valueFilter)
        //     .concat([{
        //         '$project': {
        //             '_id': 0
        //         }
        //     }])

        const data = await mongodb.aggregate({
            db,
            collection: `${db.name}.labels`,
            pipeline
        })

        // for(let d of data){
        //     d.segmentation = await resolveSegmentation(d.segmentation)
        // }

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
    updateForm,
    getSegmentation,
    getRecords,
    getTags
}