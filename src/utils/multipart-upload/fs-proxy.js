
//
// Required modules

const path = require('path')
const util = require('util')
const url = require('url')
const fs = require('fs')
const fsp = fs.promises 
module.exports = {

  log: options => {
    console.log(new Date().toISOString() + ' - ' + util.format.apply(null, arguments))
  },
  
  testStream: async (req, res, options) => {
  
    try {
    
      let query = req.query;
      let start = (query.resumableChunkNumber - 1) * query.resumableChunkSize;
      let seek = start + query.resumableCurrentChunkSize * 1;
      let filePath = path.resolve(options.dest, query.resumableFilename);
      
      let stats = await fs.stat(filePath)
      
      return seek <= stats.size ? {file: filePath, size: stats.size} : false
    
    } catch (e) {
    
      console.log(`testStream: ${e.toString()}`)
      return false
    
    }
  
  },
  
  writeStream: async (req, res, options) => {
    try {
    
      let query = req.query
      let res = await fs.createWriteStream(path.join(options.dest, query.resumableFilename), {flags: query.resumableChunkNumber * 1 === 1 ? 'w' : 'a'})
      return res
    
    } catch (e) {
    
      console.log(`writeStream: ${e.toString()}`)
      return false
    
    }

  },


  readStream: async (req, res, options) => {

    try {
    
      let query = req.query
      let parsed = url.parse(req.url)
      let filePath = path.join(options.dest, parsed.pathname)
      
      console.log(query, parsed, filePath)

      // An example to read the last 10 bytes of a file which is 100 bytes long:
      // fs.createReadStream('sample.txt', {start: 90, end: 99});
      let res = fs.createReadStream(filePath) 
      
      return res

    } catch (e) {
    
      console.log(`readStream: ${e.toString()}`)
      return false
    
    }  

  }

}