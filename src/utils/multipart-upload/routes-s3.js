const crypto = require('crypto');
const path = require("path")
const fsp = require("fs").promises
const s3bucket = require("../s3-bucket")
const { keys, sortBy } = require("lodash")

const TARGET_DIR = path.resolve('./.tmp/uploads/')
// console.log(`UPLOADS TARGET ${path.resolve(TARGET_DIR)}`)

const Resumable = require('./resumable-node-1.js') //(TARGET_DIR);
const resumable = new Resumable(TARGET_DIR)

const { copyToGD, getFileWriteStreamFromGD, createFolder, updateRecording, getGdFileMetadata } = require("./target-controller")
const uuid = require("uuid").v4

let UPLOADS = {}

let RECORDINGS = {}

let CHUNKED = {}

const updateChunked = data => {
    CHUNKED[data.id] = JSON.parse(JSON.stringify(data))
}

const getFileId = (req, res) => {
    if (!req.query.filename) {
        return res.status(500).end('query parameter missing');
    }
    res.end(
        crypto.createHash('md5')
        .update(req.query.filename)
        .digest('hex')
    );
}

const postUpload = async (req, res, next) => {
    if (req.eventHub.listenerCount("resumable-done") == 0) {
        req.eventHub.on("resumable-done", updateChunked)
    }
    resumable.post(req, res, next)
}

const getUpload = async (req, res) => {
    res.status(404).send("not found")
    return
}

////////////////////////////////////////////////////////////////////////////////////////////////////

const s3UploadStatus = async (req, res) => {
    let { uploadId } = req.body || req.query || req.params
    if (!UPLOADS[uploadId]) {
        res.status(200).send({})
    }
    let result = JSON.parse(JSON.stringify(UPLOADS[uploadId]))
    if (result.status == "done") {
        delete UPLOADS[uploadId]
    }
    res.status(200).send(result)
}

const readyForUpload = async uploadId => new Promise( (resolve, reject) => {
    let i = 0
    let interval = setInterval(()=> {
        i++
        console.log(`CHECK ready for upload ${uploadId}: ${i}`)
        console.log(CHUNKED[uploadId])
        if(CHUNKED[uploadId]) {
            clearInterval(interval)
            resolve()
        }
        if(i > 10) {
            clearInterval(interval)
            reject(new Error(`Upload ${uploadId} not ready after 10 retries.`))   
        }
    }, 250)
})

const s3Upload = async (req, res) => {
    try {
        let { uploadId, target } = req.body
        
        // if (!CHUNKED[uploadId]) {
        //     res.status(404).send()
        //     return
        // }

        // console.log("await ready For Upload: ", uploadId)
        await readyForUpload(uploadId)
        console.log("Start Upload: ", uploadId)
        
        UPLOADS[uploadId] = { 
            target, 
            uploadedBytes: 0, 
            percents: 0, 
            status: "processed"
        }

        try {
            s3bucket.uploadChunks({
                chunks: sortBy(keys(CHUNKED[uploadId].chunk)),
                simultaneousUploads: 3,
                deleteUploadedChunks: true,
                target,
                size: CHUNKED[uploadId].size,
                callback: status => {
                    UPLOADS[uploadId] = status
                }
            })
         } catch (e) {
            console.log("s3bucket.uploadChunks", e.toString(), e.stack)
         }   

        res.status(200).send({ uploadId })
    } catch (e) {
        console.error("s3Upload", e.toString(), e.stack)
        res.status(503).send(`s3Upload: ${e.toString()} ${e.stack}`)
    }
}


const s3Metadata = async (req, res) => {
    try {
        let { source } = req.body
        let metadata = await s3bucket.metadata(source)
        res.status(200).send(metadata)
    } catch (e) {
        console.error("s3Upload", e.toString(), e.stack)
        res.status(503).send(`s3Upload: ${e.toString()} ${e.stack}`)
    }
}


const s3PresignedUrl = async (req, res) => {
    try {
        let { source } = req.body
        let url = await s3bucket.getPresignedUrl(source)
        res.status(200).send({ source, url })
    } catch (e) {
        console.error("s3Upload", e.toString(), e.stack)
        res.status(503).send(`s3Upload: ${e.toString()} ${e.stack}`)
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

const postUpdateRecordingStatus = async (req, res) => {
    // console.log("RECORDINGS", RECORDINGS)
    let result = RECORDINGS[req.body.uploadId]

    if (result.files) {
        delete RECORDINGS[req.body.uploadId]
    }

    res.status(200).send(result)

}


const updateRStatus = uploadId => status => {
    // console.log("updateRStatus", uploadId, status)
    RECORDINGS[uploadId] = { status }
}

const postUpdateRecording = async (req, res) => {

    try {

        // console.log("BODY", req.body)

        let recording = req.body.recording
        recording.path = path.resolve(TARGET_DIR, recording.fileName)

        // console.log("updateRecording", recording)

        let uploadId = uuid()

        RECORDINGS[uploadId] = {}

        setTimeout(async () => {

            let files = await updateRecording(recording, updateRStatus(uploadId))

            try {
                await fsp.unlink(recording.path)
            } catch (e) {
                // console.log("UNLINK FILE", e.toString())
                setTimeout(async () => {
                    await fsp.unlink(recording.path)
                }, 10)
            }

            RECORDINGS[uploadId] = { files }

        }, 10)


        res.status(200).send({ uploadId })

    } catch (e) {

        res.status(500).send(e.toString())

    }
}



////////////////////////////////////////////////////////////////////////////////////////////////////


const updateStatus = uploadId => status => {
    if (status.status == "error") {
        console.log("UPDATE UPLOAD STATUS", uploadId, status)
    }
    UPLOADS[uploadId] = { status }
}

const postGdStatus = async (req, res) => {

    // setTimeout(() => {
    // console.log("postGdStatus",req.body.uploadId, UPLOADS[req.body.uploadId])
    let result = UPLOADS[req.body.uploadId]

    if (result.files) {
        delete UPLOADS[req.body.uploadId]
    }

    res.status(200).send(result)

    // }, 1000)


}

postGetGdFileMetadata = async (req, res) => {
    try {
        let result = await getGdFileMetadata(req.body.uploadDescriptor)
        res.status(200).send(result)
    } catch (e) {
        res.status(200).send({ error: e.toString() })
    }
}

const postGd = async (req, res) => {

    try {

        // console.log(req.body)

        let options = req.body.options
        let uploadId = uuid()

        let result = {
            uploadId,
            homeDir: options.gd.homeDir,
            targetDir: options.gd.targetDir,
            file: path.basename(path.resolve(TARGET_DIR, options.source))
        }

        UPLOADS[uploadId] = { status: { state: "wait" } }

        setTimeout(async () => {

            let files = await copyToGD(
                path.resolve(TARGET_DIR, options.source),
                options.gd.homeDir,
                options.gd.targetDir,
                updateStatus(uploadId)
            )

            console.log("--------------- postGd files", files)
            try {
                console.log("\n----- UNLINK FILE -----", path.resolve(TARGET_DIR, options.source), "\n")
                await fsp.unlink(path.resolve(TARGET_DIR, options.source))
                UPLOADS[uploadId] = { status: { state: "complete" } }
            } catch (e) {
                console.log("\n----- UNLINK FILE 2 -----", e.toString(), "\n")
                setTimeout(async () => {
                    await fsp.unlink(path.resolve(TARGET_DIR, options.source))
                    UPLOADS[uploadId] = { status: { state: "complete" } }
                }, 10)
            } finally {
                UPLOADS[uploadId] = { status: { state: "complete" } }
            }



        }, 10)


        res.status(200).send(result)

    } catch (e) {

        res.status(500).send(e.toString())

    }
}

const postGdCreateFolder = async (req, res) => {

    try {


        let options = req.body.options

        let files = await createFolder(
            options.gd.homeDir,
            options.gd.targetDir
        )

        res.status(200).send(files)

    } catch (e) {

        res.status(500).send(e.toString())

    }
}

const getGd = async (req, res) => {

    try {

        let stream = await getFileWriteStreamFromGD(req.query.id)
        stream.on('end', () => res.end())
        stream.pipe(res)

    } catch (e) {

        res.status(500).send(e.toString())

    }
}


module.exports = {
    getFileId,
    getUpload,
    postUpload,
    postGd,
    getGd,
    postGdCreateFolder,
    postGdStatus,

    postUpdateRecording,
    postUpdateRecordingStatus,

    postGetGdFileMetadata,

    s3Metadata,
    s3Upload,
    s3UploadStatus,
    s3PresignedUrl

}