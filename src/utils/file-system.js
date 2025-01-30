// const glob = require("fast-glob")
const fs = require("fs")
// const fse = require("fs-extra")
const path = require("path")
const YAML = require("js-yaml")
// const { extend } = require("lodash")
// const runZip = require('zip-folder')

// const writeFile = fs.writeFileSync
// const readFile = fs.readFileSync

// const getFileList = async ( pattern, options ) => await glob(pattern, options) 

// const getDirList = async (pattern, options) => {
    
// 	options = extend(
// 		{},
// 		{
// 			includeParentPath: false,
// 			absolitePath: false
// 		},

// 		options
// 	)

// 	pattern = ( /\/$/.test(pattern)) ? pattern : `${pattern}/`

//     let filesAndDirectories = await fse.readdir(pattern);

//     let directories = [];
//     await Promise.all(
//         filesAndDirectories.map(name =>{
//             return fse.stat(pattern + name)
//             .then(stat =>{
//                 if(stat.isDirectory()) directories.push(name)
//             })
//         })
//     );

//     if(options.includeParentPath){
//     	directories = directories.map( d => pattern+d)
//     	if(options.absolutePath){
//     		directories = directories.map( d => path.resolve(d))
//     	}
//     }
//     return directories;
// }

// const makeDir = async dir => await fse.mkdirs(path.resolve(dir))

// const rmDir = require('lignator').remove

const loadConfig = filename => YAML.load(fs.readFileSync(path.resolve(process.argv[2])).toString().replace(/\t/gm, " "))

const loadJSON = filename => JSON.parse(fs.readFileSync(path.resolve(filename)).toString())

const loadYaml = filename => YAML.load(fs.readFileSync(path.resolve(filename)).toString().replace(/\t/gm, " "))

// const zip = async (source, dest) => {
//     return new Promise( (resolve, reject) => {
//         runZip(source, dest, err => {
//             if(err) {
//                 reject(err)
//             } else {
//                 resolve()
//             }
//         })
//     })
// }

// const createWriteStream = filePath => fs.createWriteStream(filePath)

// const unzip = (path2zip, path2dest, logger) => new Promise( (resolve, reject) => {
//     const inly = require('inly');
//     logger = logger || console
//     const extract = inly(path2zip, path2dest);
//     let _p = 0
//     let extractedFilePath 
//     extract.on('file', (name) => {
//         extractedFilePath = name
//         logger.info(`File ${name} extracted`)
//     });

//     extract.on('progress', (percent) => {
//         // if( config.mode == "development"){
//         //  if( (percent % 5) == 0) _p = percent
//         //  logUpdate(`${frame()} ${ _p }%`)    
//         // }
//     });

//     extract.on('error', (error) => {
//         reject(error)
//     });

//     extract.on('end', () => {
//         resolve(extractedFilePath)
//     }); 
// })




module.exports = {
	// getFileList,
	// getDirList,
	// makeDir,
 //    rmDir,
	loadConfig,
    // writeFile,
    loadJSON,
    loadYaml,
    // pathExists: fse.pathExistsSync,
    // readFile,
    // zip,
    // unzip,
    // createWriteStream 	
}

