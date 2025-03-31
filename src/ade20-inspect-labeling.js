const docdb = require("./utils/docdb")
const { extend, find, last } = require("lodash")
const moment = require("moment")

const log = require("./workflow/utils/logger")(__filename) //(path.basename(__filename))

const Key = require("./workflow/utils/task-key")
const WORKFLOW = require("./workflow")


const config = require("../.config")
const db = config.docdb

const VERSION_SERVICE = require("./workflow/utils/data-version-manager")({
    dataView: {
        labels: d => ({ id: d.id })
    }
})


const segmentationAnalysis = require("./utils/segmentation/segment-analysis")


const get = async ({ recordId, currentDataset, datasets }) => {


    let ds = find(datasets, d => d.name == currentDataset)

    if (!ds) {
        throw new Error("Cannot find dataset")
    }

    let result = docdb.aggregate({
        db,
        collection: `${ds.schema}.labels`,
        pipeline: [{
            $match: {
                id: recordId
            }
        }]
    })

    return result

}

const getRecordData = async (req, res) => {
    try {

        let result = await get({
            datasets: req.body.cache.datasets,
            currentDataset: req.body.options.currentDataset,
            recordId: req.body.options.recordId,
        })

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

        let { recordId, currentDataset } = req.body.options

        let ds = find(req.body.cache.datasets, d => d.name == currentDataset)

        if (!ds) {
            throw new Error("Cannot find dataset")
        }

        let schema = ds.schema
        let key = Key().fromDescription({
            schema,
            dataCollection: "labels",
            dataId: recordId,
            savepointCollection: "savepoints"
        }).getDataKey()

        const versionService = await VERSION_SERVICE.getService()
        let versionManager = await versionService.getManager({ key })
        let result = versionManager.getChart1()

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


        let data = await get({
            datasets: req.body.cache.datasets,
            currentDataset: req.body.options.currentDataset,
            recordId: req.body.options.recordId,
        })

        data = data[0]

        if (!data) {
            throw new Error("Data not found")
        }

        let segmentation = data.segmentation

        if (segmentation) {
            let result = segmentationAnalysis.getSegmentationAnalysis(segmentation)
            res.send(result)
        } else {
            res.send([])
        }


    } catch (e) {
        log(e.toString())
        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}



const getSegmentationData = async (req, res) => {

    let recordId = req.params.recordId
    let currentDataset = req.params.currentDataset

    let data = await get({
        datasets: req.params.cache.datasets,
        currentDataset,
        recordId,
    })

    data = data[0]

    if (!data) {
        throw new Error("Data not found")
    }

    let segmentation = data.segmentation


    let segmentationData = (segmentation) ? {
        user: "ADE Inspector",
        readonly: true,
        segmentation
    } : undefined

    let requestData = {
        "patientId": data.examinationId,
        "recordId": data.id,
        "spot": data["Body Spot"],
        "position": data["Body Position"],
        "device": data.model,
        "path": data.id,
        "Systolic murmurs": data["Systolic murmurs"],
        "Diastolic murmurs": data["Diastolic murmurs"],
        "Other murmurs": data["Other murmurs"],
        "inconsistency": [],
        "data": (segmentationData) ? [segmentationData] : []
    }

    res.send(requestData)
}

const updateSegmentationData = async (req, res) => {
    res.status(200).send("ok")
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

const getForms = async (req, res) => {
    try {

        let options = req.body.options
        const { examinationId, currentDataset } = options
        let ds = find(req.body.cache.datasets, d => d.name == currentDataset)


        const db = req.body.cache.defaultDB
        const diaTags = req.body.cache.diagnosisTags

        let data = await docdb.aggregate({
            db,
            collection: `${ds.schema}.examinations`,
            pipeline: [{
                '$match': {
                    'id': examinationId
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

            if (result.patient && result.patient.diagnosisTags && result.patient.diagnosisTags.tags) {
                result.patient.diagnosisTags.tags = result.patient.diagnosisTags.tags
                    .map(id => find(diaTags, d => d.id == id))
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


module.exports = {
    getRecordData,
    getVersionChart1,
    getMetadata,
    getSegmentationAnalysis,
    getForms,
    getSegmentationData,
    updateSegmentationData
}