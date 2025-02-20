// const {extend, sortBy, uniq, flattenDeep, find, last, findIndex} = require("lodash")
// const moment = require("moment")
// const uuid = require("uuid").v4
// const path = require("path")
// const { loadYaml } = require("./utils/file-system")

// const mongodb = require("./mongodb")
// const STRATEGY = require("./strategies/data")

// const config = loadYaml(path.join(__dirname, "../../sync-data/.config/db/mongodb.conf.yml"))

// const globalDB= {
//     url: config.db.url,
//     name: config.db.name
// }
// const CACHE = require("./utils/segmentation-request-cache")
// const serverTerminator = require("../../config/server-terminator")





// const { closeSegmentationRequest } = require("./long-term/close-segmentation-request")
// const { updateSegmentationRequest } = require("./long-term/update-segmentation-request")



// const openRequest =  async (req, res) => {
// 	try {

// 		let { strategy, user, version } = req.body.options 
// 		const { currentDataset } = req.body.cache
// 		strategy = strategy || "test"


// 		let existedRequest = CACHE.get({dataId: version.dataId})
		
// 		if(existedRequest){
			
// 			res.status(200).send({
// 					id: existedRequest.id,
// 					hash: existedRequest.hash,
// 					user: existedRequest.user,
// 					updatedAt: existedRequest.updatedAt
// 				})

// 			return
		
// 		}

// 		let options = req.body.options
// 		      options = extend({}, options, req.body.cache.currentDataset)
// 		      options.strategy = options.strategy || "test"
// 		      options.configDB = globalDB

//         if( STRATEGY[options.strategy] && STRATEGY[options.strategy].openRequest){
//         	let request 
//         	request = await STRATEGY[options.strategy].openRequest(options)
//         	res.status(200).send(request)
// 		} else {
// 			throw new Error(`No openRequest for ${options.strategy}`)
// 		}
	
// 	} catch (e) {
		
// 		delete req.body.cache
// 		res.status(503).send({ 
// 			error: `${e.toString()}\n${e.stack}`,
// 			requestBody: req.body
// 		})

// 	}
// }

// const closeRequest =  async (req, res) => {

// 		let requestId = req.query.requestId || req.params.requestId || (req.body && req.body.requestId)
// 		let user = req.query.user || req.params.user || (req.body && req.body.user)
		
// 		let options = {
// 			requestId,
// 			user,
// 			configDB: globalDB
// 		}	
		
// 		if (req.eventHub.listenerCount("close-segmentation-request") == 0) {
//             req.eventHub.on("close-segmentation-request", closeSegmentationRequest)
//         }

//         req.eventHub.emit( "close-segmentation-request", options )

//         res.status(200).send("ok")

// }	

// const closeRequestStub =  (req, res) => {
// 	res.status(200).send()
// }

// const getSegmentationData =  async (req, res) => {
// 	try {
		
// 		let requestId = req.query.requestId || req.params.requestId || (req.body && req.body.requestId)
		
// 		let result = CACHE.get(requestId)

// 		if(result){
// 			res.status(200).send(result.requestData)
// 		} else {
// 			res.status(404).send(`Request ${requestId} not found`)
// 		}
		
// 	} catch (e) {
	
// 		delete req.body.cache
	
// 		res.status(503).send({ 
// 			error: `${e.toString()}\n${e.stack}`,
// 			requestBody: req.body
// 		})
	
// 	}
// }


// const getSegmentationDataRaw =  async (req, res) => {
// 	try {
		
// 		let requestId = req.query.requestId || req.params.requestId || (req.body && req.body.requestId)
		
// 		let result = CACHE.get(requestId)

// 		if(result){
// 			res.status(200).send(result)
// 		} else {
// 			res.status(404).send(`Request ${requestId} not found`)
// 		}
		
// 	} catch (e) {
	
// 		delete req.body.cache
	
// 		res.status(503).send({ 
// 			error: `${e.toString()}\n${e.stack}`,
// 			requestBody: req.body
// 		})
	
// 	}
// }

// const RESPONSES = require("./segmentation-request-test")

// const getSegmentationDataDirect =  async (req, res) => {
// 	try {
// 		let requestId = req.query.requestId || req.params.requestId || (req.body && req.body.requestId)

// 		let result = RESPONSES[requestId]

// 		if(result){
// 			res.status(200).send(result)
// 		} else {
// 			res.status(404).send(`Request ${requestId} not found`)
// 		}
		
// 	} catch (e) {
	
// 		delete req.body.cache
	
// 		res.status(503).send({ 
// 			error: `${e.toString()}\n${e.stack}`,
// 			requestBody: req.body
// 		})
	
// 	}
// }



// const updateSegmentationData =  async (req, res) => {

// 		let requestId = req.query.requestId || req.params.requestId || (req.body && req.body.requestId)
		
// 		let options = {
// 			data: req.body,
// 			requestId,
// 			configDB: globalDB
// 		}	
		
// 		if (req.eventHub.listenerCount("update-segmentation-request") == 0) {
//             req.eventHub.on("update-segmentation-request", updateSegmentationRequest)
//         }

//         req.eventHub.emit( "update-segmentation-request", options )

//         res.status(200).send("ok")

// }	


// const storeCache = async () => {
	
// 	let commands = [{ 
// 		deleteMany : {
//       		"filter" : {}   
//      }}] 
	
// 	commands = commands.concat(
// 		CACHE
// 			.keys()
// 			.map( key => CACHE.get(key) )
// 			.map(d => ({
// 				replaceOne:{
// 					filter: {"hash": d.hash},
// 					replacement: d,
// 					upsert: true
// 				}	
// 			}))
// 	)
	
// 	await mongodb.bulkWrite({
// 		db: globalDB,
// 		collection: "settings.segmentation_request_cache",
// 		commands
// 	})				
	
// 	console.log( `Segmentation request cache: store ${commands.length-1} items into settings.segmentation_request_cache` )

// } 


// const getCacheStats = (req, res) => {
// 	res.send(CACHE.getStats())
// }


// const getCacheKeys = (req, res) => {
	
// 	let user = req.params.user

// 	let result = CACHE.keys().map(key => {
// 		let data = CACHE.get(key)
// 		return {
// 			hash: data.hash,
// 			user: data.user,
// 			updatedAt: data.updatedAt
// 		}
// 	}) 
	
// 	if( user ){
// 		let re = new RegExp(user)
// 		result = result.filter(d => re.test(d.user))
// 	}
	
// 	res.send({
// 		dateTime: new Date(),
// 		total: result.length,
// 		requests: result
// 	})

// }

// const removeCacheKey = (req, res) => {
	
// 	let key = req.params.key
// 	try {
// 		CACHE.del(key)
// 		res.send("ok")
// 	} catch (e) {
// 		res.status(503).send(`${e.toString()} ${e.stack}`)
// 	}

// }



// const restoreCache = async () => {
	
// 	let data = await mongodb.aggregate({
// 		db: globalDB,
// 		collection: "settings.segmentation_request_cache",
// 		pipeline: [{
// 			$project:{
// 				_id: 0
// 			}
// 		}]
// 	})

// 	data.forEach( d => {
// 		CACHE.set(d.hash, d)
// 	})				

// 	console.log(`Segmentation request cache: restore ${data.length} items from settings.segmentation_request_cache` )
// 	console.log(CACHE.getStats())
	
// } 


// serverTerminator.addListener( async () => {
// 	await storeCache()
// })



	
// module.exports = {
// 	openRequest,
// 	closeRequest,
// 	closeRequestStub,
// 	getSegmentationData,
// 	getSegmentationDataRaw,
// 	updateSegmentationData,
// 	restoreCache,
// 	storeCache,
// 	getCacheStats,
// 	getCacheKeys,
// 	removeCacheKey,

// 	getSegmentationDataDirect
// }



const { extend, find, last } = require("lodash")
const moment = require("moment")

const Key = require("./workflow/utils/task-key")
const segmentationAnalysis = require("./utils/segmentation/segment-analysis")
const WORKFLOW = require("./workflow")

   

const getSegmentationData = async (req, res) => {
    try {

        let sourceKey = req.query.requestId || req.params.requestId || (req.body && req.body.requestId)
        const description = Key(sourceKey).getDescription()
        const workflow = await WORKFLOW()
        agentInstance = workflow.agent(description.taskType)
        if(!agentInstance) throw new Error(`Agent ${agent} not found`)
        
        let result = await agentInstance.getSegmentationRequestData(sourceKey)
        
        res.send(result)

    } catch (e) {

        res.send({
            error: `${e.toString()}\n${e.stack}`,
            requestBody: req.body
        })
    }
}


const updateSegmentationData = async (req, res) => {

	let sourceKey = req.query.requestId || req.params.requestId || (req.body && req.body.requestId)
    // console.log(req.query.requestId || req.params.requestId)
    // console.log(sourceKey)
    
    const description = Key(sourceKey).getDescription()
    const workflow = await WORKFLOW()
    agentInstance = workflow.agent(description.taskType)
    if(!agentInstance) throw new Error(`Agent ${agent} not found`)
    
   // console.log("req.body", req.body) 	

    await agentInstance.updateSegmentationData({
    	sourceKey,
    	data: req.body.segmentation
    })    

	res.status(200).send("ok")
}

module.exports = {
	getSegmentationData,
	updateSegmentationData
}