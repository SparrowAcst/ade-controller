module.exports = {

    init: async () => {

        const authorize = (req, res, next) => {

            if (req.isAuthenticated()) {
                return next()
            } else {
                res.status(401).send()
            }

        }

        const router = require('express').Router()
        const { find } = require("lodash")
        const preloadedCache = require("./src/preloaded-cache")
        const md5 = require("js-md5")

        const DBCache = await preloadedCache.init({

            datasets: {
                collection: "ADE-SETTINGS.datasets",
            },

            diagnosisTags: {
                collection: "ADE-SETTINGS.tags",
            },

            workflowTags: {
                collection: "ADE-SETTINGS.workflow-tags",
            },

            portalUsers: {
                collection: "dj-portal.user"
            },
            
            userProfiles: {
                collection: "ADE-SETTINGS.app-grants",
                pipeline: [{
                        $lookup: {
                            from: "profiles",
                            localField: "profile",
                            foreignField: "name",
                            as: "result"
                        },
                    },
                    {
                        $addFields: {
                            profile: {
                                $arrayElemAt: ["$result", 0],
                            },
                        },
                    },
                    {
                        $project: {
                            _id: 0,
                            result: 0,
                        },
                    },
                ]
            },

            metadata: {
                collection: "ADE-SETTINGS.metadata"
            },

            currentDatasetName: {
                calculate: req => {
                    return (req.body && req.body.options && (req.body.options.currentDataset || req.body.options.dataset)) ?
                        (req.body.options.currentDataset || req.body.options.dataset) :
                        (req.body && req.body.currentDataset || req.body.dataset) ?
                        (req.body.currentDataset || req.body.dataset) :
                        "ADE-TEST"
                }
            },

            currentDataset: {
                calculate: (req, CACHE) => {

                    let currentDatasetName = (req.body && req.body.options && (req.body.options.currentDataset || req.body.options.dataset)) ?
                        (req.body.options.currentDataset || req.body.options.dataset) :
                        (req.body && req.body.currentDataset || req.body.dataset) ?
                        (req.body.currentDataset || req.body.dataset) :
                        "ADE-TEST"

                    let currentDataset = find(CACHE.datasets, d => d.name == currentDatasetName)

                    if (!currentDataset) {
                        currentDataset = find(CACHE.datasets, d => d.name == "ADE-TEST")
                    }

                    currentDataset = currentDataset || {}

                    currentDataset.name = currentDatasetName
                    return currentDataset
                }
            }

        })

        const initWorkflow = require("./src/workflow")
        await initWorkflow()


        ////////////////////////////////////////////////////////////////////////////
        const lockCurrentDataset = require("./src/lock-current-dataset")


        /////////////////////////////////////////////////////////////////////////////////////

        // const uploaderS3 = require("./src/utils/multipart-upload/routes-s3")

        // router.get("/file-s3/fileid", uploaderS3.getFileId)
        // router.get("/file-s3/upload", uploaderS3.getUpload)
        // router.post("/file-s3/upload", uploaderS3.postUpload)
        // router.post("/file/s3", uploaderS3.s3Upload)
        // router.get("/file/s3/status", uploaderS3.s3UploadStatus)
        // router.post("/file/s3/status", uploaderS3.s3UploadStatus)
        // router.post("/file/s3/metadata", uploaderS3.s3Metadata)
        // router.post("/file/s3/url", uploaderS3.s3PresignedUrl)

        /////////////////////////////////////////////////////////////////////////////////////




        ////////////////////////////////////////////////////////////////////////////////////

        const adeInspect = require("./src/ade20-inspect")

        router.post("/inspect/get-events/", [authorize, DBCache, lockCurrentDataset, adeInspect.getRecords])
        router.post("/inspect/get-exams/", [authorize, DBCache, lockCurrentDataset, adeInspect.getExams])
        router.post("/inspect/select-exams/", [authorize, DBCache, lockCurrentDataset, adeInspect.selectExams])


        router.post("/inspect/get-tag-list/", [authorize, DBCache, lockCurrentDataset, adeInspect.getTagList])
        router.post("/inspect/add-tags/", [authorize, DBCache, lockCurrentDataset, adeInspect.addTags])
        router.post("/inspect/remove-tag/", [authorize, DBCache, lockCurrentDataset, adeInspect.removeLastTag])

        router.post("/inspect/update-diagnosis/", [authorize, DBCache, lockCurrentDataset, adeInspect.updateDiagnosis])

        router.post("/inspect/save-consistency/", [authorize, DBCache, lockCurrentDataset, adeInspect.setConsistency])

        router.post("/inspect/add-tags-dia/", [authorize, DBCache, lockCurrentDataset, adeInspect.addTagsDia])
        router.post("/inspect/remove-tag-dia/", [authorize, DBCache, lockCurrentDataset, adeInspect.removeLastTagDia])

        router.post("/inspect/get-dia-classes/", [authorize, DBCache, lockCurrentDataset, adeInspect.getDiaClassification])

        ////////////////////////////////////////////////////////////////////////////////////

        const adeInspectPatient = require("./src/ade20-inspect-patient")

        router.post("/inspect-patient/get-records/", [authorize, DBCache, lockCurrentDataset, adeInspectPatient.getRecords])
        router.post("/inspect-patient/segment/", [authorize, DBCache, lockCurrentDataset, adeInspectPatient.getSegmentation])
        router.post("/inspect-patient/get-metadata/", [authorize, DBCache, lockCurrentDataset, adeInspectPatient.getMetadata])
        router.post("/inspect-patient/get-forms/", [authorize, DBCache, lockCurrentDataset, adeInspectPatient.getForms])
        // router.post("/inspect-patient/update-form/", [authorize, DBCache, lockCurrentDataset,  adeInspectPatient.updateForm])
        router.post("/inspect-patient/get-tags/", [authorize, DBCache, lockCurrentDataset, adeInspectPatient.getTags])


        ////////////////////////////////////////////////////////////////////////////////////

        const ade20Labeling = require("./src/ade20-labeling")

        router.post("/labeling/get-record/", [authorize, DBCache, lockCurrentDataset,  ade20Labeling.getRecordData])
        router.post("/labeling/save-record/", [authorize, DBCache, lockCurrentDataset,  ade20Labeling.saveRecordData])
        router.post("/labeling/reject-record/", [authorize, DBCache, lockCurrentDataset,  ade20Labeling.rejectRecordData])
        router.post("/labeling/submit-record/", [authorize, DBCache, lockCurrentDataset,  ade20Labeling.submitRecordData])
        router.post("/labeling/rollback-record/", [authorize, DBCache, lockCurrentDataset,  ade20Labeling.rollbackRecordData])
        router.post("/labeling/get-version-chart/", [authorize, DBCache, lockCurrentDataset,  ade20Labeling.getVersionChart])
        router.post("/labeling/get-metadata/", [authorize, DBCache, lockCurrentDataset,  ade20Labeling.getMetadata])
        router.post("/labeling/analysis/", [authorize, DBCache, lockCurrentDataset, ade20Labeling.getSegmentationAnalysis])
        router.post("/labeling/stats/", [authorize, DBCache, lockCurrentDataset, ade20Labeling.getEmployeeStats])


        // router.post("/labeling/get-record/", [ade20Labeling.getRecordData])
        // router.post("/labeling/save-record/", [ade20Labeling.saveRecordData])
        // router.post("/labeling/reject-record/", [ade20Labeling.rejectRecordData])
        // router.post("/labeling/submit-record/", [ade20Labeling.submitRecordData])
        // router.post("/labeling/rollback-record/", [ade20Labeling.rollbackRecordData])
        // router.post("/labeling/get-version-chart/", [ade20Labeling.getVersionChart])
        // router.post("/labeling/get-metadata/", [DBCache, ade20Labeling.getMetadata])
        // router.post("/labeling/analysis/", [DBCache, ade20Labeling.getSegmentationAnalysis])
        // router.post("/labeling/stats/", [DBCache, ade20Labeling.getEmployeeStats])

        /////////////////////////////////////////////////////////////////////////////////////

        const ade20TaskDashboard = require("./src/ade20-task-dashboard")

        router.post("/task-dashboard/employee-task/", [authorize, DBCache, lockCurrentDataset, ade20TaskDashboard.getTaskList])
        router.post("/task-dashboard/metadata/", [authorize, DBCache, lockCurrentDataset,  ade20TaskDashboard.getMetadata])
        router.post("/task-dashboard/chart/", [authorize, DBCache, lockCurrentDataset,  ade20TaskDashboard.getChart])
        router.post("/task-dashboard/rollback/", [authorize, DBCache, lockCurrentDataset,  ade20TaskDashboard.rollback])
        router.post("/task-dashboard/fastforward/", [authorize, DBCache, lockCurrentDataset,  ade20TaskDashboard.fastForward])
        router.post("/task-dashboard/get-employes/", [authorize, DBCache, lockCurrentDataset,  ade20TaskDashboard.getEmployes])
        router.post("/task-dashboard/set-employes/", [authorize, DBCache, lockCurrentDataset,  ade20TaskDashboard.setEmployesSchedule])
        // router.post("/task-dashboard/employee-profile/", [authorize, DBCache, lockCurrentDataset,  ade20TaskDashboard.getEmployeeProfile])

        // router.post("/task-dashboard/employee-task/", [ade20TaskDashboard.getTaskList])
        // router.post("/task-dashboard/metadata/", [ade20TaskDashboard.getMetadata])
        // router.post("/task-dashboard/chart/", [ade20TaskDashboard.getChart])
        // router.post("/task-dashboard/rollback/", [ade20TaskDashboard.rollback])
        // router.post("/task-dashboard/fastforward/", [ade20TaskDashboard.fastForward])
        // router.post("/task-dashboard/get-employes/", [ade20TaskDashboard.getEmployes])
        // router.post("/task-dashboard/set-employes/", [ade20TaskDashboard.setEmployesSchedule])
        router.post("/task-dashboard/employee-profile/", [ DBCache, lockCurrentDataset,  ade20TaskDashboard.getEmployeeProfile])


        /////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const adeGrants = require("./src/ade-grants")

        router.post("/ade-grants/get-dataset-list/", [authorize, DBCache, lockCurrentDataset, adeGrants.getDatasetList])
        router.post("/ade-grants/get-grants/", [authorize, DBCache, lockCurrentDataset, adeGrants.getGrants])
        router.post("/ade-grants/get-employes/", [authorize, DBCache, lockCurrentDataset, adeGrants.getEmployes])

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////

        const segmentationRequest = require("./src/segmentation-request")

        router.get("/segmentation/", segmentationRequest.getSegmentationData)
        router.get("/segmentation/:requestId", segmentationRequest.getSegmentationData)
        router.post("/segmentation/", segmentationRequest.updateSegmentationData)
        router.post("/segmentation/:requestId", segmentationRequest.updateSegmentationData)

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////

        return router
    }

}