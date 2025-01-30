const mongodb = require("./mongodb")
const { extend, keys, isFunction } = require("lodash")
const { loadYaml } = require("./utils/file-system")
const path = require("path")
const uuid = require("uuid").v4

const db = loadYaml(path.join(__dirname, "../../sync-data/.config/db/mongodb.conf.yml")).db


const saveRequestError = async (req, res) => {
     let { error } = req.body
     error.id = uuid()

     await mongodb.replaceOne({
        db,
        collection: "settings.error-request",
        filter:{
            id: error.id
        },
        data: error 
    })

    res.status(200).send("ok")   
}



module.exports = {
    saveRequestError
}


