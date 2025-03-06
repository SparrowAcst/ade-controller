let {
    point,
    segment,
    polygon,
    ray,
    vector,
    line,
    BooleanOperations,
    matrix,
    box,
    Face
} = require('@flatten-js/core');

let { flattenDeep, flatten, uniqBy, sortBy, first, last, min, max, isUndefined, find, remove } = require("lodash")
let { avg, sum } = require("../stat")

let { kmeans, euclidianDistance } = require("../cluster1")

const log  = require("../../workflow/utils/logger")(__filename) //(path.basename(__filename))


/////////////////////////////////////////////////////////////////////////////////

const getSegmentArray = polygons =>
    flattenDeep(
        polygons
        .map(p => Array.from(p.edges)
            .map(e => e.shape)
        )
    )

const getPointArray = polygons => flatten(polygons.map(p => p.vertices))

const centroid = polygon => {
    let points = getPointArray([polygon])
    let res = {
        x: avg(points.map(p => p.x)),
        y: avg(points.map(p => p.y))
    }

    return point(res.x, res.y)
}


const sortCW = (points, center) => {

    points = sortBy(
        points.map(p => {
            let a = vector(center, points[0]).angleTo(vector(center, p))
            a = (a > Math.PI) ? a - 2 * Math.PI : a
            p.angle = a
            return p
        }),
        p => p.angle
    ).map(p => {
        delete p.angle
        return p
    })

    return points

}


const sortCCW = (points, center) => {
    let res = sortCW(points, center)
    res.reverse()
    return res
}

const getIntersection = polygons => {

    let intersection = polygons[0]
    for (let p of polygons) {
        try {
            intersection = BooleanOperations.intersect(intersection, p)
        } catch (e) {
            log("------------------------------------- ERROR I", e.toString())
            log("p", getPointArray([p]))
            log("intersection", getPointArray([intersection]))
        }
        if (!intersection) return
    }
    return intersection

}

const getUnion = polygons => {

    let union = polygons[0]
    for (let p of polygons) {
        try {
            union = BooleanOperations.unify(union, p)
        } catch (e) {
            log("--------------------------------------- ERROR U", e.toString())
            log("p", getPointArray([p]))
            log("union", getPointArray([union]))
        }
        if (!union) return
    }
    return union
}

const getSubtract = polygons => {

    let subtract = polygons[0]
    for (let p of polygons) {
        try {
            subtract = BooleanOperations.subtract(subtract, p)
        } catch (e) {
            log("--------------------------------------- ERROR S", e.toString())
            log("p", getPointArray([p]))
            log("union", getPointArray([union]))
        }
        if (!subtract) return
    }
    return subtract
}


const fit = polygons => {

    let centroids = polygons.map(p => centroid(p))
    return polygons.map((p, i) => p.translate(vector(-centroids[i].x, -centroids[i].y)))

}


const merge = polygons => {

    let centroids = polygons.map(p => centroid(p))

    let c = point(avg(centroids.map(c => c.x)), avg(centroids.map(c => c.y))) //centroid(intersection)
    let points = getPointArray(polygons)
    points = sortCW(points, c)

    let segments = points.map(p => segment(c, p))
    let rays = segments.map(s => ray(c, s.tangentInStart().rotate90CCW()))

    let mergedPoints = flattenDeep(rays.map(r => {
        let p = flattenDeep(polygons.map(p => r.intersect(p)))
        return point([
            avg(p.map(d => d.x)),
            avg(p.map(d => d.y)),
        ])
    }))

    return polygon(mergedPoints)

}


const simplify = (p, factor) => {


    let currentPolygon = p.clone()

    factor = factor || 0.001
    let f = true
    let maxit = currentPolygon.vertices.length
    let it = 0

    while (f) {
        it++
        let area = currentPolygon.area()
        let min = Infinity
        let minPolygon = currentPolygon.clone()

        currentPolygon.vertices.forEach((v, index) => {

            let points = currentPolygon.vertices
            points.splice(index, 1)
            let testPolygon = polygon(points)

            let m = Math.abs(area - testPolygon.area()) / area

            if (m < min) {
                min = m
                minPolygon = testPolygon.clone()
            }
        })

        if (min < factor) {
            f = true
            currentPolygon = minPolygon.clone()
        } else {
            f = false
        }

        if (it > maxit) {
            f = false
        }

    }

    return currentPolygon

}



const getBoundaryBox = polygons => {

    points = getPointArray(polygons)
    let x = points.map(p => p.x)
    let y = points.map(p => p.y)

    return {
        x: {
            min: min(x),
            max: max(x)
        },
        y: {
            min: min(y),
            max: max(y)
        }
    }

}

const getNormalizedScale = polygons => {

    let boundaryBox = getBoundaryBox(polygons)
    return {
        x: 1 / (boundaryBox.x.max - boundaryBox.x.min),
        y: 1 / (boundaryBox.y.max - boundaryBox.y.min)
    }
}

const getDenormalizedScale = polygons => {

    let boundaryBox = getBoundaryBox(polygons)
    return {
        x: (boundaryBox.x.max - boundaryBox.x.min),
        y: (boundaryBox.y.max - boundaryBox.y.min)
    }
}

const getNormalizedTranslateVector = polygons => {

    let boundaryBox = getBoundaryBox(polygons)
    return vector(-boundaryBox.x.min, -boundaryBox.y.min)

}

// const getPatternForPolygons = (polygons, factor) => {

//     factor = factor || 0.001
//     polygons = fit(polygons)
//     let pattern = simplify(merge(polygons), factor)

//     let a = pattern.area()
//     let metric = Math.sqrt(sum(polygons.map(p => (p.area() - a) * (p.area() - a))) / polygons.length / (polygons.length - 1)) / a

//     let consistency = polygons.map(p => getIntersection([pattern, p]).area() / getUnion([pattern, p]).area())
//     consistency = avg(consistency)



//     return {
//         polygons,
//         patterns: [pattern],
//         metric: Number.parseFloat(metric.toFixed(3)),
//         consistency: Number.parseFloat(consistency.toFixed(3)),
//     }

// }

const getPatternForPolygons = (polygons, factor) => {

    factor = factor || 0.001
    polygons = fit(polygons)
    // let pattern = simplify(merge(polygons), factor)

    // let a = pattern.area()
    // let metric = Math.sqrt(sum(polygons.map(p => (p.area() - a) * (p.area() - a))) / polygons.length / (polygons.length - 1)) / a

    // let consistency = polygons.map(p => getIntersection([pattern, p]).area() / getUnion([pattern, p]).area())
    // consistency = avg(consistency)



    return {
        polygons,
        // patterns: [pattern],
        // metric: Number.parseFloat(metric.toFixed(3)),
        // consistency: Number.parseFloat(consistency.toFixed(3)),
    }

}


const getSVG = ({ polygons, patterns, svgOptions }) => {

    svgOptions = svgOptions || {
        polygon: {
            stroke: "black",
            strokeWidth: 0.002,
            fill: "none",
            opacity: 1,
            r: 0.003
        },

        pattern: {
            stroke: "red",
            strokeWidth: 0.007,
            fill: "#ffff9920",
            opacity: 1,
            r: 0.007
        },

        // pattern: {
        //     stroke: "red",
        //     strokeWidth: 0.004,
        //     fill: "#ffff9920",
        //     opacity: 1,
        //     r: 0.003
        // }
    }

    if (polygons) {
        polygons = polygons.map(p => p.clone())
    } else {
        if (patterns) {
            polygons = patterns
        } else {
            return `<svg viewBox = "0 0 1 1" xmlns="http://www.w3.org/2000/svg"></svg>`
        }
    }

    if (patterns) {
        patterns = patterns.map(p => p.clone())
    }

    let scale = getNormalizedScale(polygons)

    polygons = polygons.map(p => p
        .scale(scale.x, scale.y)
        .transform(matrix(1, 0, 0, -1, 0, 0)))

    if (patterns) {

        patterns = patterns.map(p => p
            .scale(scale.x, scale.y)
            .transform(matrix(1, 0, 0, -1, 0, 0)))

    }

    let translation = getNormalizedTranslateVector(polygons)

    polygons = polygons.map(p => p
        .translate(translation))

    if (patterns) {

        patterns = patterns.map(p => p
            .translate(translation))

    }



    return `
<svg viewBox = "-0.1 -0.1 1.2 1.2" xmlns="http://www.w3.org/2000/svg">
    ${polygons.map(p => p.svg(svgOptions.polygon)).join("\n")}
    ${getPointArray(polygons).map(p => p.svg(svgOptions.polygon)).join("\n")}
    ${(patterns) ? patterns.map(p => p.svg(svgOptions.pattern)).join("\n") : ""}
    ${(patterns) ? getPointArray(patterns).map(p => p.svg(svgOptions.pattern)).join("\n") : ""}

</svg>
`

}

// const array2Polygons = a => a.map(d => polygon(d[1].map((x, i) => point([x, d[2][i]]))))

const array2Polygons = a => a.map(d => polygon(d.map(v => point(v))))

const polygon2Array = polygon => getPointArray([polygon]).map(p => [p.x, p.y])

const create = data => {
    // log(data)
    return polygon(data.map(d => point(d)))
}



//////////////////////////////////////////////////////////////

// const normalizePointSet = points => {
//     let res = [points.pop()]
//     while (points.length > 0) {
//         let p = points.pop()
//         if (!find(res, d => d.distanceTo(p)[0] < 0.00000000000001)) {
//             res.push(p)
//         }
//     }
//     return res
// }

// const getSectors = p => {

//     let points = getPointArray([p])
//     points = points.concat(points.slice(0, 2))

//     let res = []

//     for (let i = 0; i < points.length - 2; i++) {

//         let p0 = points[i]
//         let p1 = points[i + 1]
//         let p2 = points[i + 2]

//         // log(segment(p0,p2).intersect(p))

//         while (normalizePointSet(segment(p0, p2).intersect(p)).length > 2) {
//             p0 = point([
//                 (p0.x + p1.x) / 2,
//                 (p0.y + p1.y) / 2
//             ])

//         }

//         let m0 = point([
//             (p0.x + p1.x) / 2,
//             (p0.y + p1.y) / 2
//         ])

//         let m1 = point([
//             (p1.x + p2.x) / 2,
//             (p1.y + p2.y) / 2
//         ])

//         let m2 = point([
//             (p2.x + p0.x) / 2,
//             (p2.y + p0.y) / 2
//         ])

//         res.push({
//             segment: segment(m0, m1),
//             point: m2
//         })

//     }

//     return res

// }


// const selectPointsWithinSector = (points, sector, sceleton) => {
//     // log("-------------- sceleton ----------------")
//     let res = points.filter(p => {
//         let s = segment(sector.point, p)
//         let segmentsIntersection = sector.segment.intersect(s)
//         let sceletonIntersection = s.intersect(sceleton)
//         let sectorPointInSceleton = sector.point.on(sceleton)
//         let pointInSceleton = p.on(sceleton)
//         // log("-------------------------------")
//         if (segmentsIntersection.length == 1) {
//             // log("segmentsIntersection")
//             if (sectorPointInSceleton) {
//                 // log("sectorPointInSceleton")
//                 if (pointInSceleton) {
//                     // log("pointInSceleton", sceletonIntersection.length, sceletonIntersection.length <= 2)
//                     // log(p)
//                     return (sceletonIntersection.length <= 2)
//                 } else {
//                     // log("NOT pointInSceleton", sceletonIntersection.length, sceletonIntersection.length < 2)
//                     // log(p)

//                     return (sceletonIntersection.length < 2)
//                 }

//             } else {
//                 // log("NOT sectorPointInSceleton")
//                 if (pointInSceleton) {
//                     // log("pointInSceleton", sceletonIntersection.length, sceletonIntersection.length <= 2)
//                     // log(p)
//                     return (sceletonIntersection.length <= 2)
//                 } else {
//                     // log("NOT pointInSceleton", sceletonIntersection.length, sceletonIntersection.length < 2)
//                     // log(p)
//                     return (sceletonIntersection.length < 2)
//                 }

//             }
//         }

//         return false
//         // log(">", intrs1)
//         // if(intrs1.length > 0) log(">>",s.intersect(sceleton))

//         // return  sector.segment.intersect(s).length == 1
//         //         &&
//         //         (
//         //             (p.on(sceleton)) 
//         //                 ? s.intersect(sceleton).length <= 2 
//         //                 : (sector.point.on(sceleton))
//         //                     ? s.intersect(sceleton).length <= 2
//         //                     : s.intersect(sceleton).length < 2
//         //          )
//     })
//     // log(res.length)
//     // log("------------------------------------------")
//     return res
// }


const normalizePolygonPoints = fragments => {

    return flatten(fragments)

    for (j = 0; j < fragments.length - 2; j++) {
        for (let i = j; i < fragments.length - 1; i++) {
            let chain = flatten(fragments.slice(j, i + 1))
            let p = polygon(chain)
            if (!p.isValid()) fragments[i].reverse()
        }
    }
    // let p = polygon(last(fragments).concat(first(fragments))
    // if(!p.isValid()) first(fragments).reverse()


    return flatten(fragments)

}


// const newMerge = polygons => {

//     let intersection = simplify(getIntersection(polygons), 0.02)
//     let sectors = getSectors(intersection)
//     let points = getPointArray(polygons)
//     let resPoints = sectors.map(sector => {

//             let selection = selectPointsWithinSector(points, sector, intersection)
//             let segments = selection.map(p => segment(sector.point, p))
//             let rays = segments.map(s => ray(sector.point, s.tangentInStart().rotate90CCW()))

//             let mergedPoints = 
//             // flattenDeep(
//                 rays.map(r => {
//                 let p = flattenDeep(polygons.map(p => [r.intersect(p)[0]]))
//                 return point([
//                     avg(p.map(d => d.x)),
//                     avg(p.map(d => d.y)),
//                 ])
//             })
//                 // )

//             mergedPoints = sortCW(mergedPoints, sector.point)    
//             if(sector.point.on(intersection)){
//                 mergedPoints.reverse()
//             }    

//             return mergedPoints
//         })



//     log("resPoints",resPoints)

//     return polygon(normalizePolygonPoints(resPoints))

// }


const bisector = (vector1, vector2) => {

    let angle1 = vector1.angleTo(vector2) / 2
    let angle2 = vector2.angleTo(vector1) / 2

    if (angle1 < angle2) {
        return vector1.clone().rotate(angle1).rotate90CCW()
    } else {
        return vector2.clone().rotate(angle2).rotate90CW()
    }

}

const bisectorLine = (vector1, vector2, point) => {
    let res = line(point, bisector(vector1, vector2))
    return res
}



isInnerAngle = (a, b, c) => vector(b, a).angleTo(vector(b, c)) > Math.PI
isOuterAngle = (a, b, c) => !isInnerAngle(a, b, c)

const boundaryIntersection = (centroid, focus, boundary) => {
    return segment(centroid, focus)
        .intersect(boundary)
        .filter(p => !p.equalTo(focus) && !p.equalTo(centroid))
}

const outOfBoundary = (centroid, focus, boundary) => {
    return segment(centroid, focus)
        .intersect(boundary)
        .filter(p => !p.equalTo(focus) && !p.equalTo(centroid)).length > 0
}

const adjustFocus = (centroid, focus, boundary, innerAngle) => {
    // log("adjustFocus", innerAngle)
    if (!innerAngle) {
        let i = 0
        let intrsct = boundaryIntersection(centroid, focus, boundary)
        // log("intrsct >", intrsct)
        while (intrsct.length > 1 && i < 3) {
            i++
            if (intrsct.length >= 2) focus = segment(intrsct[0], intrsct[1]).middle()
            intrsct = boundaryIntersection(centroid, focus, boundary)
            // log("intrsct", intrsct)
        }
    } else {
        if (focus.on(boundary)) {
            // log("ON BOUNDARY")
            let s = segment(centroid, focus)
            let r = ray(centroid, s.tangentInStart().rotate90CCW())
            let p = r.intersect(boundary)[0]
            focus = point([
                p.x - 1.01 * (focus.x - p.x),
                p.y - 1.01 * (focus.y - p.y)
            ])
        }
    }

    return focus
}

const newMerge = polygons => {

    let scale = getNormalizedScale(polygons)
    let descale = getDenormalizedScale(polygons)

    let index = -1
    polygons = polygons.map(p => {
        let scaled = p.scale(scale.x, scale.y)
        return {
            poly: p,
            scaled,
            points: p.vertices.map((v, i) => {
                index++
                return {
                    index,
                    coord: [v.x, v.y],
                    scaledCoord: [scaled.vertices[i].x, scaled.vertices[i].y]
                }
            })
        }
    })

    let clusterCount = max(polygons.map(p => p.points.length))
    let initial = find(polygons, p => p.points.length == clusterCount)

    let clusters = kmeans(
        clusterCount,
        flatten(polygons.map(p => p.points)),
        euclidianDistance,
        initial.points,
        1
    )

    let clusterPoly = polygon(clusters.map(c => c.centroid))
    let intersectionPoly = getIntersection(polygons.map(p => p.scaled))
    let unionPoly = getUnion(polygons.map(p => p.scaled))

    // clusters.map(c => c.centroid).forEach( p => {
    //     log(point(p).svg({strokeWidth:0.002, r:0.01}))
    // })

    // log(unionPoly.svg({strokeWidth:0.006, opacity: 0.2}))
    // log(intersectionPoly.svg({strokeWidth:0.006, opacity: 0.2, fill:"#ffff9920"}))

    let resPoints = []

    // polygons.map(p => p.scaled).forEach( p => {
    //     log(p.svg({strokeWidth:0.002, opacity:0.3}))
    // })


    for (let i = 0; i < clusters.length; i++) {

        let a, b, c
        b = clusters[i]
        if (i == 0) {
            a = last(clusters)
            c = clusters[i + 1]
        } else {
            if (i < clusters.length - 1) {
                a = clusters[i - 1]
                c = clusters[i + 1]
            } else {
                a = clusters[i - 1]
                c = clusters[0]
            }
        }

        let bline = bisectorLine(
            vector(point(b.centroid), point(a.centroid)),
            vector(point(b.centroid), point(c.centroid)),
            point(b.centroid)
        )

        b.focus = bline.intersect(
            segment(
                point(a.centroid),
                point(c.centroid)
            )
        )[0]

        b.focus = (isInnerAngle(point(a.centroid), point(b.centroid), point(c.centroid))) ?
            adjustFocus(point(b.centroid), b.focus, unionPoly, true) :
            adjustFocus(point(b.centroid), b.focus, intersectionPoly, false)

        let adjustedPoints = b.points.map(d => point(d.scaledCoord))

        let segments = adjustedPoints.map(p => segment(
            b.focus,
            point([
                p.x + 2 * (p.x - b.focus.x),
                p.y + 2 * (p.y - b.focus.y)
            ])
        ))

        let rays = segments.map(s => ray(b.focus, s.tangentInStart().rotate90CCW()))

        // rays.forEach(r => {
        //     log(r.svg(box(-1,-1, 1, 1),{strokeWidth:0.002}))
        // })

        let mergedPoints = rays.map(r => {
            let p = flattenDeep(polygons.map(p => p.scaled).map(p => [r.intersect(p)[0]]))
            p = p.filter(p => p)
            if (p.length > polygons.length / 2) {
                //     p.forEach( pp => {
                //     log(pp.svg({strokeWidth:0.002, r:0.002}))
                // })
                return point([
                    avg(p.map(d => d.x)),
                    avg(p.map(d => d.y)),
                ])
            }
        }).filter(p => p)


        mergedPoints = (isInnerAngle(point(a.centroid), point(b.centroid), point(c.centroid))) ?
            sortCW(mergedPoints, b.focus) :
            sortCCW(mergedPoints, b.focus)

        resPoints = resPoints.concat(mergedPoints)

    }

    resPoints = flatten(resPoints)
        .map(p => point([descale.x * p.x, descale.y * p.y]))

    clusters.forEach(cluster => {

        cluster.centroid = [
            avg(cluster.points.map(p => p.coord[0])),
            avg(cluster.points.map(p => p.coord[1])),
        ]
        cluster.focus = point([
            descale.x * cluster.focus.x,
            descale.y * cluster.focus.y,
        ])

    })

    return polygon(resPoints)
}

//////////////////////////////////////////////////////////////

module.exports = {
    create,
    array2Polygons,
    polygon2Array,
    getIntersection,
    getUnion,
    getSubtract,
    getBoundaryBox,
    getSVG,
    getPatternForPolygons,
    getPointArray,
    getSegmentArray,
    fit,
    merge,
    simplify,
    centroid,

    /////////////////////////////////////////////////////
    // getSectors,
    // selectPointsWithinSector,
    newMerge
}