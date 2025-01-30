const fs = require('fs') 
const fsp = fs.promises
const path = require('path')
const { sortBy } = require("lodash")

const Stream = require('stream').Stream;


const uuid = require("uuid").v4

const cleanIdentifier = identifier => identifier.replace(/^0-9A-Za-z_-/img, '')
const fileExists = async path => !!(await fsp.stat(path).catch(e => false))

const mem = (msg) => {
    const used = process.memoryUsage();
    console.log(`${msg || ""} :Memory usage: ${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB`);
    return used.rss
  } 






const Resumable = class {

  constructor (temporaryFolder) {
    
    this.temporaryFolder = temporaryFolder;
    this.maxFileSize = null;
    this.fileParameterName = 'file';
    this.processed = {}
    this.chunks = []
    try {
      fs.mkdirSync(this.temporaryFolder);
    } catch(e) {

    }

  }

  getChunkFilename(chunkNumber, identifier){
    // Clean up the identifier
    identifier = cleanIdentifier(identifier);
    // What would the file name be?
    return path.join(this.temporaryFolder, `./resumable-${identifier}.${chunkNumber}`);
  }


  validateRequest(requestMetadata) {
  
    // Clean up the identifier
    requestMetadata.identifier = cleanIdentifier(requestMetadata.identifier);

    // Check if the request is sane
    if(
          requestMetadata.chunkNumber == 0 
          || requestMetadata.chunkSize == 0 
          || requestMetadata.totalSize == 0 
          || requestMetadata.identifier.length == 0 
          || requestMetadata.filename.length == 0
    ){
      return 'non_resumable_request';
    }

    let numberOfChunks = Math.max(Math.floor(requestMetadata.totalSize/(requestMetadata.chunkSize*1.0)), 1);
    
    if (requestMetadata.chunkNumber > numberOfChunks) {
      return 'invalid_resumable_request1';
    }

    // Is the file too big?
    if(this.maxFileSize && requestMetadata.totalSize > this.maxFileSize) {
      return 'invalid_resumable_request2';
    }

    if(typeof(requestMetadata.fileSize)!='undefined') {
      
      if(
          requestMetadata.chunkNumber < numberOfChunks 
          && requestMetadata.fileSize != requestMetadata.chunkSize
      ) {
        // The chunk in the POST request isn't the correct size
        return 'invalid_resumable_request3';
      }
      
      if(
          numberOfChunks > 1 
          && requestMetadata.chunkNumber == numberOfChunks 
          && requestMetadata.fileSize != ((requestMetadata.totalSize % requestMetadata.chunkSize) + requestMetadata.chunkSize)
      ) {
        // The chunks in the POST is the last one, and the fil is not the correct size
        return 'invalid_resumable_request4';
      }
      
      if(
        numberOfChunks == 1 
        && requestMetadata.fileSize != requestMetadata.totalSize) {
        // The file is only a single chunk, and the data size does not fit
        return 'invalid_resumable_request5';
      }

    }

    return true;
    
  }

  async testAllChunkExists(numberOfChunks, identifier) {
     let res = true
     for(let i=1; i <= numberOfChunks; i++){
        let exists = await fileExists(this.getChunkFilename(i, identifier))
        res &= exists      
     } 
     return res
  }  

  async concatChunk( stream, file ){
     
     return new Promise((resolve, reject) =>
        fs
          .createReadStream(file)
          .on('data', a => stream.write(a))
          .on('end', resolve)
          .on('error', reject)
        )
  
  }

  async mergeUploads(target, template, result = "file"){
    
    let files = (await fsp.readdir(this.temporaryFolder)).filter(a => a.startsWith(template))
    files = sortBy(files, d => d.split(".")[1]*1)
    
    if(result == "chunks") {
      let size = files.map( f => fs.statSync(f).size).reduce((a,b) => a + b, 0)
      return {
        target,
        chunks: files,
        size
      }
    }

    console.log(target, files)
    
    console.log("\n----- mergeUploads ----- into ", target, "\n" )
    
    const stream = fs.createWriteStream(target)

    for(const file of files){
      let f = path.resolve(this.temporaryFolder,file)
      await this.concatChunk(stream, f)
      try {
        await fsp.unlink(f)
      } catch(e) {
        // console.log("UNLINK FILE", e.toString())
        setTimeout(async () => {
          await fsp.unlink(f)
        }, 10)
      }  
    }

    stream.end();

  } 


  async get( req ){

    let requestMetadata = {
      chunkNumber: req.params.resumableChunkNumber || 0,
      chunkSize:req.params.resumableChunkSize || 0,
      totalSize: req.params.resumableTotalSize || 0,
      identifier: req.params.resumableIdentifier || "",
      filename: req.params.resumableFilename || ""
    }

    if(this.validateRequest(requestMetadata) == true) {
      
      let chunkFilename = this.getChunkFilename(chunkNumber, identifier);
      
      let exists = await fsp.exists(chunkFilename)
      
      if(exists){
         
         return {
            status: 'found', 
            filename: chunkFilename, 
            original_filename: filename, 
            identifier
          }

      }
    
    } 
  
  }

  async post( req ){
    mem()
    if (req.busboy) {
      
      let status = await ( new Promise( (resolve, reject) => {
        

          let query = req.query;

        
          req.busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated) => {
            if(fieldname) query[fieldname] = val;
          })

          req.busboy.on('file', async (name, file, info) => {

            let requestMetadata = {
              id: uuid(),
              chunkNumber: query.resumableChunkNumber,
              chunkSize: query.resumableChunkSize,
              totalChunks: query.resumableTotalChunks,
              totalSize: query.resumableTotalSize,
              identifier: cleanIdentifier(query.resumableIdentifier),
              filename: query.resumableFilename,
              original_filename: query.resumableIdentifier
            }  

            var chunkFilename = this.getChunkFilename(requestMetadata.chunkNumber, requestMetadata.identifier);
            
            this.chunks.push(`resumable-${requestMetadata.identifier}.${requestMetadata.chunkNumber}`)              
            console.log("\n----- upload -----", chunkFilename,"\n")
            
            let stream = await fs.createWriteStream(chunkFilename, {flags:'w'})

            stream.on('close', async file => {
              
              // let numberOfChunks = Math.max(Math.floor(requestMetadata.totalSize/(requestMetadata.chunkSize*1.0)), 1);
              
              if( requestMetadata.chunkNumber == 1){
                this.processed[path.resolve(this.temporaryFolder, info.filename)] = true
              }  

              let done = 
                ( await this.testAllChunkExists(requestMetadata.totalChunks, requestMetadata.identifier) )
                && this.processed[path.resolve(this.temporaryFolder, info.filename)]
              

              // console.log("PROCESSED:", path.resolve(this.temporaryFolder, info.filename), ":", this.processed[path.resolve(this.temporaryFolder, info.filename)])  
              // console.log("ALL CHUNKS:", requestMetadata.totalChunks, " : ", requestMetadata.identifier, " : ", ( await this.testAllChunkExists(requestMetadata.totalChunks, requestMetadata.identifier) ))
              // console.log("DONE: ", info.filename, " : ", done)


              if( done ){
                delete this.processed[path.resolve(this.temporaryFolder, info.filename)]
                // console.log("DONE", requestMetadata)
                await this.mergeUploads(
                  path.resolve(this.temporaryFolder, info.filename),
                  `resumable-${requestMetadata.identifier}` 
                )

              }      
              
                resolve(file);
            
            })
            
            stream.on('error', e => {
              
              console.log(`upload error: ${e.toString()}`)
              return
            
            })
            
            file.pipe(stream);

          })
         
          req.pipe(req.busboy)

          console.log(this.chunks)

          resolve ({
            chunks: this.chunks
          })


        }))  
      
      return status
    }

  }

  // async post( req ){
    
  //   if (req.busboy) {
      
  //     await ( new Promise( (resolve, reject) => {
        

  //         let query = req.query;

        
  //         req.busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated) => {
  //           // console.log(fieldname, val, fieldnameTruncated, valTruncated)
  //           if(fieldname) query[fieldname] = val;
  //         })

  //         req.busboy.on('file', async (name, file, info) => {

  //           console.log("file", name, info)
            
  //           let requestMetadata = {
  //             id: uuid(),
  //             chunkNumber: query.resumableChunkNumber,
  //             chunkSize: query.resumableChunkSize,
  //             totalSize: query.resumableTotalSize,
  //             identifier: cleanIdentifier(query.resumableIdentifier),
  //             filename: query.resumableFilename,
  //             original_filename: query.resumableIdentifier
  //           }  

  //           // console.log("POST>", requestMetadata)

                
  //           // var chunkFilename = this.getChunkFilename(requestMetadata.chunkNumber, requestMetadata.identifier);
            
  //           let filename = path.resolve(this.temporaryFolder, info.filename)
  //           console.log("upload", filename)
            
  //           let stream = await fs.createWriteStream(filename, {flags:(requestMetadata.chunkNumber == 1) ? 'w' : 'a'})

  //           stream.on('close', async file => {
              
  //             if(requestMetadata.chunkNumber == requestMetadata.chunkSize){
  //               console.log("UPLOADED", requestMetadata, filename)
  //             }
  //             // let numberOfChunks = Math.max(Math.floor(requestMetadata.totalSize/(requestMetadata.chunkSize*1.0)), 1);
  
  //             // let done = await this.testAllChunkExists(numberOfChunks, requestMetadata.identifier)

  //             // if( done ){
                  
  //             //     console.log("DONE", requestMetadata)

  //             // }      
              
  //               resolve();
            
  //           })
            
  //           stream.on('error', e => {
              
  //             console.log(`upload error: ${e.toString()}`)
  //             reject(e)
            
  //           })
            
  //           file.pipe(stream);

  //         })
         
  //         req.pipe(req.busboy)

  //       }))  
  //   }

  // }



}


module.exports = Resumable

