const { 
    extend, 
    find, 
    isArray, 
    sampleSize, 
    uniqBy, 
    flatten, 
    keys, 
    remove,
    nth 
} = require("lodash")

const segmentationAnalysis = require("./segment-analysis")

const hasDataInconsistency = dataDiff => dataDiff.length > 0

const hasSegmentationInconsistency = diff => {
    return (diff) ? diff
        .map(diff => keys(diff)
            .map(key => diff[key].length > 0)
            .reduce((a, b) => a || b, false)
        )
        .reduce((a, b) => a || b, false) : false
}

const hasPolygonsInconsistency = diff => diff && diff.length && diff.length > 0

const getPolygonsInconsistency = polygonArray => {

    let result = []
    polygonArray = polygonArray.filter(d => d)
    if(polygonArray.length > 0){
        polygonArray[0].forEach(pa => {

            let polygonSet = []
            polygonArray.forEach(p => {
                let f = find(p, p => p.name == pa.name)
                if (f) {
                    polygonSet.push(f.shapes)
                }
            })
            result.push(
                segmentationAnalysis
                .getPolygonsDiff(polygonSet)
            )

        })
    }    

    return result
}

const mergePolygons = polygonArray => {

    polygonArray = polygonArray.filter(d => d)
    if(polygonArray.length > 0){
        let res = polygonArray[0].map(pa => {

            let polygonSet = []
            polygonArray.forEach(p => {
                let f = find(p, p => p.name == pa.name)
                if (f) {
                    polygonSet.push(f.shapes)
                }

            })

            return {
                name: pa.name,
                shapes: segmentationAnalysis.mergePolygons(polygonSet)
            }
        })

        return res
    }
    return []
}


module.exports = {
	hasDataInconsistency,
	hasSegmentationInconsistency,
	hasPolygonsInconsistency,
	getPolygonsInconsistency,
	mergePolygons
}