const crypto = require('crypto');
const path = require("path")
const fsp = require("fs").promises


const TARGET_DIR = path.resolve('./.tmp/uploads/')
console.log(`UPLOADS TARGET ${path.resolve(TARGET_DIR)}`)

const Resumable = require('./resumable-node.js') //(TARGET_DIR);
const resumable = new Resumable(TARGET_DIR)

const { copyToGD, getFileWriteStreamFromGD, createFolder, updateRecording, getFileList } = require("./target-controller")
const uuid = require("uuid").v4

let UPLOADS = {}

let RECORDINGS = {}


// app.get('/fileid',

const getFileId = (req, res) => {
  if(!req.query.filename){
    return res.status(500).end('query parameter missing');
  }
  // create md5 hash from filename
  res.end(
    crypto.createHash('md5')
    .update(req.query.filename)
    .digest('hex')
  );
}

// Handle uploads through Resumable.js
// app.post('/upload', 

const postUpload = async (req, res) => {
    let status = await resumable.post(req)
    res.send(status)
}

// Handle status checks on chunks through Resumable.js
// app.get('/upload', 

const getUpload = async (req, res) => {

    let result = await resumable.get(req)
    
    if(result){
    
      res.status(200).send(result.status)   
    
    } else {
    
      res.status(404).send("not found")
    
    }

}


////////////////////////////////////////////////////////////////////////////////////////////////////

const postUpdateRecordingStatus = async (req, res) => {
    
      let result = RECORDINGS[req.body.uploadId]

      if(result.files){
        delete RECORDINGS[req.body.uploadId] 
      }

      res.status(200).send(result)

}  



const updateRStatus = uploadId => status => {
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
          
          let files = await updateRecording( recording, updateRStatus(uploadId) )  
          
          try {
            await fsp.unlink(recording.path)
          } catch(e) {
            // console.log("UNLINK FILE", e.toString())
            setTimeout(async () => {
              await fsp.unlink(recording.path)
            }, 10)
          }

          RECORDINGS[uploadId] = { files }         

        }, 10)
        

        res.status(200).send({uploadId}) 
    
    } catch (e) {

      res.status(500).send(e.toString())
    
    }
}



////////////////////////////////////////////////////////////////////////////////////////////////////


const updateStatus = uploadId => status => {
  // console.log("UPDATE UPLOAD STATUS", uploadId, status)
  UPLOADS[uploadId] = { status }
}





const postGdStatus = async (req, res) => {
    
    // setTimeout(() => {
      // console.log("postGdStatus",req.body.uploadId, UPLOADS[req.body.uploadId])
      let result = UPLOADS[req.body.uploadId]

      if(result.files){
        delete UPLOADS[req.body.uploadId] 
      }

      res.status(200).send(result)

    // }, 1000)
    

}  




const postGd = async (req, res) => {
    
    try {
        
        // console.log(req.body)
        
        let options = req.body.options
        let uploadId = uuid()

        UPLOADS[uploadId] = {}

        setTimeout(async () => {
          
          let files = await copyToGD(
            path.resolve(TARGET_DIR, options.source), 
            options.gd.homeDir,
            options.gd.targetDir,
            updateStatus(uploadId)
          )  
          
          try {
            console.log("\n----- UNLINK FILE -----",path.resolve(TARGET_DIR, options.source),"\n")
            await fsp.unlink(path.resolve(TARGET_DIR, options.source))
          } catch(e) {
            console.log("ERROR", e.toString())
            console.log("\n----- UNLINK FILE -----", e.toString(),"\n")
            setTimeout(async () => {
              await fsp.unlink(path.resolve(TARGET_DIR, options.source))
            }, 10)
          }

          UPLOADS[uploadId] = { files }         

        }, 10)
        

        res.status(200).send({uploadId}) 
    
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

const getGdFileList = async (req, res) => {
    
    try {

        let result = await getFileList("ADE-LMS/FILES")
        
        res.status(200).send(result)
        // let stream = await getFileWriteStreamFromGD(req.query.id)
        // stream.on('end', () => res.end())
        // stream.pipe(res)
      
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

  getGdFileList

}
