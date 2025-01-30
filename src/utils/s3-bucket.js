const { readFileSync } = require("fs")
const fsp = require("fs").promises
const axios = require("axios")
const {
    extend,
    findIndex,
    chunk: splitArray,
    isUndefined,
    sortBy,
    last,
    isFunction
} = require("lodash")

const path = require("path")
const { lookup } = require("mime-types")
const nanomatch = require('nanomatch')

const {

    ListObjectsCommand,
    HeadObjectCommand,

    GetObjectCommand,

    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    PutObjectCommand,

    DeleteObjectsCommand,
    waitUntilObjectNotExists,

    S3Client

} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner")
const { Upload } = require("@aws-sdk/lib-storage")


// TODO transfer into settings
const settings = require("../../../sync-data/.config/key/s3/s3.settings.json")
// const settings = require("../../.config/ade-clinic").s3
const bucket = settings.bucket.default
console.log("S3 bucket:", bucket)

const client = new S3Client(settings.access)

const dir = async path => {
    try {
        let { CommonPrefixes } = await client.send(new ListObjectsCommand({
            Bucket: bucket,
            Delimiter: "/",
            Prefix: path
        }))
        if (!CommonPrefixes) return
        return CommonPrefixes.map(item => item.Prefix.replace(path, "").replace("/", ""))
    } catch (e) {
        console.error("s3-bucket.dir:", e.toString(), e.stack)
        throw e
    }
}

const list = async path => {
    try {
        path = path || "**/*"
        let Prefix = path.split("/")
        Prefix = Prefix.slice(0, findIndex(Prefix, d => /\*/.test(d))).join("/")
        Prefix = (!Prefix) ? undefined : Prefix + "/"
        let { Contents } = await client.send(new ListObjectsCommand({
            Bucket: bucket,
            Prefix
        }))
        let items = Contents || []
        let names = items.map(d => d.Key)
        names = nanomatch(names, path)
        return items.filter(d => names.includes(d.Key))
    } catch (e) {
        // console.error("s3-bucket.list:", e.toString(), e.stack)
        // throw e
        return []
    }
}


const metadata = async target => {
    try {
        let {
            AcceptRanges,
            LastModified,
            ContentLength,
            ETag,
            VersionId,
            ContentType,
            ServerSideEncryption,
            Metadata
        } = await client.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: target
        }))

        return {
            Key: target,
            AcceptRanges,
            LastModified,
            ContentLength,
            ETag,
            VersionId,
            ContentType,
            ServerSideEncryption,
            Metadata
        }
    } catch (e) {
        // console.error("s3-bucket.metadata:", e.toString(), e.stack)
        // throw e
    }
}


const deleteFiles = async path => {

    let deletedItems = await list(path)
    let Keys = deletedItems.map(d => d.Key)

    if (Keys.length == 0) return

    await client.send(
        new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
                Objects: Keys.map(Key => ({ Key })),
            }
        })
    )
    await Promise.all(Keys.map(Key => waitUntilObjectNotExists({ client }, { Bucket: bucket, Key }, )))

}


const getStream = async source => {
    try {
        let res = await client.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: source
            })
        )
        return res
    } catch (e) {
        console.error("s3-bucket.getStream:", e.toString(), e.stack)
        // throw e
    }
}


const download = async ({ source, target }) => new Promise(async (resolve, reject) => {
    try {
        let file = await getStream(source)
        let writeStream = createWriteStream(target)
        writeStream
            .on('end', resolve)
            .on('error', reject)
        let content = await file.Body.transformToByteArray()
        writeStream.write(content);
    } catch (e) {
        console.error("s3-bucket.download:", e.toString(), e.stack)
        reject(e)
    }
})


const getPresignedUrl = async source => {
    try {
        const command = new GetObjectCommand({ Bucket: bucket, Key: source })
        let res = await getSignedUrl(client, command, { expiresIn: 3600 })
        return res
    } catch (e) {
        console.error("s3-bucket.getPresignedUrl:", e.toString(), e.stack)
        throw e
    }
}






// upload file with size <= 20Mb

const uploadLt20M = async ({ source, target }) => {
    try {
        const fileContent = readFileSync(source)
        const ContentType = lookup(path.extname(`./${target}`))
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Body: fileContent,
                Key: target,
                ContentType
            })
        )
    } catch (e) {
        console.error("s3-bucket.uploadLt20M:", e.toString(), e.stack)
        throw e
    }
}

const uploadFromURL = async ({ source, target, callback }) => {
    try {

        callback = (callback && isFunction(callback)) ? callback : (() => {})
        const ContentType = lookup(path.extname(`./${target}`))

        const axiosResponse = await axios({
            method: 'GET',
            url: source,
            responseType: 'stream'
        })

        const uploadProcess = new Upload({
            client,
            params: {
                Bucket: bucket,
                Key: target,
                ContentType,
                Body: axiosResponse.data
            },
        })

        uploadProcess.on("httpUploadProgress", callback)
        await uploadProcess.done();

    } catch (e) {
        console.log(`uploadFromURL`, e.toString(), e.stack)
    }

}


// multypart upload,  chunk size must be >= 6Mb

const uploadChunks = async ({
    chunks,
    simultaneousUploads = 2,
    deleteUploadedChunks = true,
    target,
    size,
    callback = (() => {})
}) => {

    let uploadId
    let options = {
        Bucket: bucket,
        Key: target
    }

    try {
        const ContentType = lookup(path.extname(`./${target}`))

        uploadId = (await client.send(new CreateMultipartUploadCommand(extend({}, options, { ContentType })))).UploadId
        let uploadedBytes = 0

        chunks = sortBy(chunks, c => Number.parseInt(last(c.split("."))))
        let partitions = splitArray(chunks, simultaneousUploads)

        const uploadResults = await new Promise(async (resolve, reject) => {
            let uploads = []
            let partIndex = 0

            for (const partition of partitions) {

                console.log(`Upload ${target} part ${partIndex + 1}: ${partition.length} items`)
                console.log(partition)

                let partUploads = await Promise.all(partition.map((chunk, i) => {
                    let buffer = readFileSync(chunk)
                    return client
                        .send(
                            new UploadPartCommand(
                                extend({}, options, {
                                    UploadId: uploadId,
                                    Body: buffer,
                                    PartNumber: partIndex * simultaneousUploads + i + 1
                                }))
                        )
                        .then((d) => {
                            uploadedBytes += buffer.length
                            callback({
                                target,
                                uploadedBytes,
                                percents: (size) ? Number.parseFloat((uploadedBytes / size).toFixed(3)) : 0,
                                status: "processed"
                            })
                            return d;
                        })
                }))

                uploads = uploads.concat(partUploads)

                if (deleteUploadedChunks) {
                    await Promise.all(partition.map(c => fsp.unlink(c)))
                }

                partIndex++
            }

            resolve(uploads)
        })

        await client.send(new CompleteMultipartUploadCommand(
            extend({}, options, {
                UploadId: uploadId,
                MultipartUpload: {
                    Parts: uploadResults.map(({ ETag }, i) => ({
                        ETag,
                        PartNumber: i + 1,
                    }))
                }
            })))

        callback({
            target,
            uploadedBytes: size,
            percents: 1,
            status: "done"
        })


    } catch (e) {

        console.error("s3-bucket.uploadChunks:", e.toString(), e.stack)

        if (uploadId) {
            const abortCommand = new AbortMultipartUploadCommand(
                extend({}, options, { UploadId: uploadId })
            )
            await client.send(abortCommand);
        }

        // throw e
    }
}


module.exports = {
    list,
    metadata,
    getStream,
    download,
    getPresignedUrl,
    uploadLt20M,
    uploadChunks,
    deleteFiles,
    uploadFromURL
}

// const run = async () => {
//     console.log( (await dir()) )
//     console.log( (await dir("ADE BACKUP/")))
//     console.log( (await dir("ADE-BACKUP/TESTAI/")))


// }

// run()