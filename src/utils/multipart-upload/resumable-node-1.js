const fs = require('fs')
const path = require('path')
const { sortBy, keys } = require("lodash")
const Stream = require('stream').Stream;

const cleanIdentifier = identifier => identifier.replace(/^0-9A-Za-z_-/img, '')

const UPLOAD = {}

const Resumable = class {

    constructor(temporaryFolder) {
        this.temporaryFolder = temporaryFolder;
        try {
            fs.mkdirSync(this.temporaryFolder);
        } catch (e) {}
    }

    testAllChunkExists(id) {
        return keys(UPLOAD[id].chunk)
            .map(key => UPLOAD[id].chunk[key].status)
            .filter(status => status == "done")
            .length == UPLOAD[id].totalChunks
    }

    async post(req, res, next) {
        if (req.busboy) {
            let query = req.query;
            let eventHub = req.eventHub
            let id = cleanIdentifier(query.resumableIdentifier)

            let chunkMetadata = {
                file: path.join(this.temporaryFolder, `./resumable-${id}.${query.resumableChunkNumber}`),
                status: "processed"
            }

            UPLOAD[id] = UPLOAD[id] || {
                id,
                file: `./resumable-${id}.${query.resumableChunkNumber}`,
                size: query.resumableTotalSize,
                status: "processed",
                totalChunks: query.resumableTotalChunks,
                chunk: {}
            }

            UPLOAD[id].chunk[chunkMetadata.file] = chunkMetadata

            req.busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated) => {
                if (fieldname) query[fieldname] = val;
            })

            req.busboy.on('file', (name, file, info) => {
                try {
         
                    // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!  busboy.on('file'...")
                    let writer = fs.createWriteStream(chunkMetadata.file)
                    writer.on('finish', () => {
                        // console.log("wriiter.on('finish'...")
                        UPLOAD[id].chunk[chunkMetadata.file].status = "done"
                        UPLOAD[id].chunk[chunkMetadata.file].commpletedAt = new Date()
                        // console.log(UPLOAD)
                        if (this.testAllChunkExists(id)) {
                            UPLOAD[id].status = "done"
                            UPLOAD[id].completedAt = new Date()
                            // console.log('all chunks ready', UPLOAD[id])
                            eventHub.emit("resumable-done", UPLOAD[id])
                            delete UPLOAD[id]
                        }
                        // next()
                        res.status(200).send(chunkMetadata.file)
                    })

                    file.pipe(writer)
            
                } catch (e) {
                    console.log("UPLOAD CHUNK ERROR", id, e.toString(), e.stack)
                }
            })

            req.pipe(req.busboy)
        }
    }
}


module.exports = Resumable