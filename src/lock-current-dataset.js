
const handler = async (req, res, next) => {

    if( req.dbCache.currentDataset && !req.dbCache.currentDataset.lock ){
        next()
    } else {
        res.status(403).send(`No access to dataset "${req.dbCache.currentDatasetName}"`)
    }

}


module.exports = handler



