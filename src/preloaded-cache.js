// const mongodb = require("./mongodb")
const { extend, keys, isFunction } = require("lodash")
// const { loadYaml } = require("./utils/file-system")
const path = require("path")

// const db = require("../../.config/ade-clinic").mongodb

// const db = loadYaml(path.join(__dirname, "../../sync-data/.config/db/mongodb.conf.yml")).db

const docdb = require("./utils/docdb")
const db = require("../.config").docdb


const log  = require("./workflow/utils/logger")(__filename) //(path.basename(__filename))


let CACHE = {}
let COLLECTIONS = {}

const normalizeCollectionName = collectionName => {
    let parts = collectionName.split(".")
    return (parts.length == 1) ? `${db.name}.${collectionName}` : collectionName
}

const init = async collections => {

    log(`Init preloaded cache:\n${JSON.stringify(db, null, " ")}`)
    COLLECTIONS = collections || COLLECTIONS
    // log(COLLECTIONS)

    let cacheProperties = keys(COLLECTIONS)

    let res = []

    for (const cacheProperty of cacheProperties) {

        if (COLLECTIONS[cacheProperty].calculate && isFunction(COLLECTIONS[cacheProperty].calculate )){
            CACHE[cacheProperty] = COLLECTIONS[cacheProperty].calculate
            // log(`Set calculable ${cacheProperty}`) // as ${CACHE[cacheProperty].toString()}`)
            res.push(`Set calculable ${cacheProperty}`) // as ${CACHE[cacheProperty].toString()}`)
            continue
        }


        const pipeline = (COLLECTIONS[cacheProperty].pipeline) ? COLLECTIONS[cacheProperty].pipeline : [{
                $project: {
                    _id: 0
                },
            }]

        CACHE[cacheProperty] = await docdb.aggregate({
            db,
            collection: normalizeCollectionName(COLLECTIONS[cacheProperty].collection),
            pipeline 
        })

        if(COLLECTIONS[cacheProperty].mapper && isFunction(COLLECTIONS[cacheProperty].mapper)){
            CACHE[cacheProperty] = CACHE[cacheProperty].map(d =>  COLLECTIONS[cacheProperty].mapper(d))
        }
        
        // log(`Load ${CACHE[cacheProperty].length} items from ${normalizeCollectionName(COLLECTIONS[cacheProperty].collection)} as ${cacheProperty}`)
        res.push(`Load ${CACHE[cacheProperty].length} items from ${normalizeCollectionName(COLLECTIONS[cacheProperty].collection)} as ${cacheProperty}`)
    }

    log.table(cacheProperties.map( prop => ({
        alias: prop,
        collection: (!!COLLECTIONS[prop].calculate && isFunction(COLLECTIONS[prop].calculate)) ? '' : COLLECTIONS[prop].collection,
        items: (!!COLLECTIONS[prop].calculate && isFunction(COLLECTIONS[prop].calculate)) ? '' : CACHE[prop].length,
        calculable: !!COLLECTIONS[prop].calculate && isFunction(COLLECTIONS[prop].calculate)
    })))

    return res.join("\n")

}


const handler = async (req, res, next) => {

    // log(req.url, /\/ade-admin\/cache-update\//.test(req.url) )
    if ( /\/ade-admin\/cache-update\//.test(req.url) ) {
        const stat = await init()
        res.status(200).send(stat)
        return
    }

    if (req.body.forceUpdate) {
        await init()
    }

    const cache = {}

    keys(CACHE).forEach( property => {

        if( isFunction(CACHE[property]) ) {
            cache[property] = CACHE[property](req, CACHE)
            return
        }
        cache[property] = CACHE[property]
    })
    cache.defaultDB = db

    req.body = extend(req.body, {cache})
    req.params = extend(req.params, {cache})
    req.query = extend(req.query, {cache})
    req.dbCache = cache

    next()

}


module.exports = {
    init: async collections => {
        await init(collections)
        return handler
    }
}


