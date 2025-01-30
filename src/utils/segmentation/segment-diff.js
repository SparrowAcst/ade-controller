const {
    isArray,
    find,
    remove,
    unionBy,
    sortBy,
    uniqBy,
    keys,
    findIndex,
    maxBy,
    max,
    zipObject,
    flattenDeep,
    values,
    uniqWith,
    isEqual,
    mean,
    extend

} = require("lodash")

const Diff = require('jsondiffpatch')


const SEGMENT_TYPES = [
    "S1",
    "S2",
    "S3",
    "S4",
    "unsegmentable",
    "Inhale",
    "systole",
    "diastole"
]

const CHECKED_SEGMENT_TYPES = [
    "S1",
    "S2",
    "S3",
    "S4",
    "unsegmentable",
    "Inhale"
]


const segmentTypes = {
    'S1': { color: '#ef6c00' },
    'S2': { color: '#1a237e' },
    'S3': { color: '#c8e6c9' },
    'S4': { color: '#ffe082' },
    'systole': { color: '#f9a825' },
    'diastole': { color: '#7986cb' },
    'unsegmentable': { color: '#e0e0e0' },
    'Inhale': { color: '#b2ebf2' }
}

let series = [{
        name: "unsegmentable",
        segments: ["unsegmentable"]
    },
    {
        name: "Heart Cycle",
        segments: ["S1", "S2", "systole", "diastole"]

    },
    {
        name: "S3-S4",
        segments: ["S3", "S4"]

    },
    {
        name: "breath",
        segments: ["Inhale"]
    },
]



const parseV1 = segmentation => {
    let segments = []

    segments = keys(segmentation).filter(key => key != "v2").map(key => ({
        type: segmentation[key][0][1],
        start: Number.parseFloat(key),
        end: Number.parseFloat(segmentation[key][0][0])
    }))
    return segments
}

const parseV2 = segmentation => {

    let segments = []
    keys(segmentation).forEach(key => {

        if (key == "v2" || !isArray(segmentation[key])) return

        segments = segments.concat(segmentation[key].map(s => ({
            type: key,
            start: Number.parseFloat(s[0]),
            end: Number.parseFloat(s[1]),
            lf: Number.parseFloat(s[2]),
            hf: Number.parseFloat(s[3]),
        })))
    })

    return segments

}

const matchPattern = (array, pattern) => pattern.map((p, index) => array[index] == p).reduce((v, a) => v && a, true)

const splitByPattern = (array, pattern) => {

    const temp = array.map(s => s)
    let res = []

    for (; temp.length >= pattern.length;) {

        let buf = temp.slice(0, pattern.length)
        if (matchPattern(buf.map(b => b.type), pattern)) {
            res.push(buf)
        }
        temp.shift()
    }

    return res


}


const parseAI = segmentation => {

    const type2name = {
        s1: "S1",
        s2: "S2",
        S1: "S1",
        S2: "S2",
        unsegmentable: "unsegmentable"
    }

    let segments = sortBy(segmentation.map(s => {
        s.type = type2name[s.type]
        return s
    }), d => d.start)

    const sysPattern = ["S1", "S2"]
    const diaPattern = ["S2", "S1"]

    const sysSegments = splitByPattern(segments, sysPattern).map(d => ({
        type: "systole",
        start: d[0].end,
        end: d[1].start
    }))

    const diaSegments = splitByPattern(segments, diaPattern).map(d => ({
        type: "diastole",
        start: d[0].end,
        end: d[1].start
    }))


    return sortBy(segments.concat(sysSegments).concat(diaSegments), s => s.start)

}

const parse = segmentation => {

    let segments = []
    if (isArray(segmentation)) {
        segments = parseAI(segmentation)
    } else if (segmentation && segmentation.v2 == true){  //(segmentation.S1 || segmentation.S2 || segmentation.unsegmentable)) {
        segments = parseV2(segmentation)
    } else if (segmentation) segments = parseV1(segmentation)
    return sortBy(segments, d => d.start)


}

const getSegmentationChart = (segmentation, nonConsistencyIntervals) => {

    let segments = parse(segmentation)

    nonConsistencyIntervals = nonConsistencyIntervals || []

    let m = SEGMENT_TYPES.map(type => max(segments.filter(s => s.type == type).map(s => s.hf)) || 1)
    m = zipObject(SEGMENT_TYPES, m)

    segments = segments.map(s => {
        s.name = s.type
        s.itemStyle = {
            normal: {
                color: (segmentTypes[s.type]) ? segmentTypes[s.type].color || "black" : "black",
                borderColor: "#999",
                borderWidth: 0.3,
                // opacity: 0.5
            }
        }
        let categoryIndex = findIndex(series, serie => serie.segments.includes(s.type))
        s.value = [categoryIndex, s.start, s.end, (s.hf || 1) / m[s.type]]
        return s
    })

    let data = series.map(s => ({
        name: s.name,
        data: segments.filter(seg => s.segments.includes(seg.type))
    }))

    let options = {
        "toolbox": {
            "feature": {
                "saveAsImage": {}
            }
        },
        tooltip: {
            formatter: `params => {
                return params.marker + params.name + ': started at ' + params.value[1] + ' s';
            }`
        },
        dataZoom: [{
                type: 'slider',
                filterMode: 'weakFilter',
                showDataShadow: false,
                labelFormatter: ''
            },
            {
                type: 'inside',
                filterMode: 'weakFilter'
            }
        ],
        grid: {
            containLabel: true
        },
        xAxis: {
            min: 0,
            max: maxBy(segments.map(s => s.end)),
            scale: true,
            axisLabel: {
                formatter: function(val) {
                    return val + ' s';
                }
            },
            minorTick: {
                show: true
            },
            minorSplitLine: {
                show: true
            }
        },

        yAxis: {
            data: series.map(s => s.name),
            splitLine: {
                show: true
            }
        },

        series: [{
            type: 'custom',
            renderItem: `

          	(params, api) => {
  
			  var categoryIndex = api.value(0);
			  var start = api.coord([api.value(1), categoryIndex]);
			  var end = api.coord([api.value(2), categoryIndex]);
			  var height = api.size([0, 1])[1] *api.value(3) //categoryIndex])[1];  //api.size([0, 1])[1] * 0.1;
			  var rectShape = echarts.graphic.clipRectByRect(
			    {
			      x: start[0],
			      y: start[1] + api.size([0, 1])[1]/2 - height * 0.9,
			      width: end[0] - start[0],
			      height: height * 0.9
			    },
			    {
			      x: params.coordSys.x,
			      y: params.coordSys.y,
			      width: params.coordSys.width,
			      height: params.coordSys.height
			    }
			  );
			  return (
			    rectShape && {
			      type: 'rect',
			      transition: ['shape'],
			      shape: rectShape,
			      style: api.style()
			    }
			  );
			}
          `,
            itemStyle: {
                opacity: 0.8
            },
            encode: {
                x: [1, 2],
                y: 0,
                v: 3
            },
            data: segments,

            markArea: {
                "itemStyle": {
                    "color": "#fff3e0",
                    "opacity": 0.7,
                    borderWidth: 1,
                    borderType: "dashed",
                    borderColor: "red"
                },
                data: nonConsistencyIntervals.map(interval => [{
                        xAxis: interval.start
                    },
                    {
                        xAxis: interval.end
                    }
                ])
            }
        }]
    }

    return options

}



const getMultiSegmentationChart = (segmentations, nonConsistencyIntervals) => {

    nonConsistencyIntervals = nonConsistencyIntervals || []

    segmentations = (isArray(segmentations || [])) ? segmentations : [segmentations]

    let pool = []

    segmentations.forEach((segmentation, index) => {

        let segments = parse(segmentation)

        let m = SEGMENT_TYPES.map(type => max(segments.filter(s => s.type == type).map(s => s.hf)) || 1)
        m = zipObject(SEGMENT_TYPES, m)

        segments = segments.map(s => {
            s.name = s.type
            s.itemStyle = {
                normal: {
                    color: (segmentTypes[s.type]) ? segmentTypes[s.type].color || "black" : "black",
                    borderColor: "#999",
                    borderWidth: 0.3,
                    // opacity: 0.3
                }
            }
            let categoryIndex = findIndex(series, serie => serie.segments.includes(s.type))
            s.value = [categoryIndex, s.start, s.end, (s.hf || 1) / m[s.type], index / segmentations.length, segmentations.length]
            return s
        })

        pool = pool.concat(segments)

    })

    let data = series.map(s => ({
        name: s.name,
        data: pool.filter(seg => s.segments.includes(seg.type))
    }))

    let options = {
        "toolbox": {
            "feature": {
                "saveAsImage": {}
            }
        },
        tooltip: {
            formatter: `params => {
                return params.marker + params.name + ': started at ' + params.value[1] + ' s';
            }`
        },
        dataZoom: [{
                type: 'slider',
                filterMode: 'weakFilter',
                showDataShadow: false,
                labelFormatter: ''
            },
            {
                type: 'inside',
                filterMode: 'weakFilter'
            }
        ],
        grid: {
            containLabel: true
        },
        xAxis: {
            min: 0,
            max: maxBy(pool.map(s => s.end)),
            scale: true,
            axisLabel: {
                formatter: function(val) {
                    return val + ' s';
                }
            },
            minorTick: {
                show: true
            },
            minorSplitLine: {
                show: true
            }
        },

        yAxis: {
            data: series.map(s => s.name),
            splitLine: {
                show: true
            }
        },

        series: [{
            type: 'custom',
            renderItem: `

          	(params, api) => {
  
			  var categoryIndex = api.value(0);
			  var start = api.coord([api.value(1), categoryIndex]);
			  var end = api.coord([api.value(2), categoryIndex]);
			  var height = api.size([0, 1])[1] *api.value(3) //categoryIndex])[1];  //api.size([0, 1])[1] * 0.1;
			  var rectShape = echarts.graphic.clipRectByRect(
			    {
			      x: start[0],
			      y: start[1] + api.size([0, 1])[1]/2 - height * api.value(4) * 0.9 - api.size([0, 1])[1] / api.value(5)  ,
			      width: end[0] - start[0],
			      height: height  * 0.8 / api.value(5)
			    },
			    {
			      x: params.coordSys.x,
			      y: params.coordSys.y,
			      width: params.coordSys.width,
			      height: params.coordSys.height
			    }
			  );
			  return (
			    rectShape && {
			      type: 'rect',
			      transition: ['shape'],
			      shape: rectShape,
			      style: api.style()
			    }
			  );
			}
          `,
            itemStyle: {
                opacity: 0.8
            },
            encode: {
                x: [1, 2],
                y: 0,
                v: 3,
                i: 4,
                l: 5
            },
            data: pool,

            markArea: {
                "itemStyle": {
                    "color": "#fff3e0",
                    "opacity": 0.7,
                    borderWidth: 1,
                    borderType: "dashed",
                    borderColor: "red"
                },
                data: nonConsistencyIntervals.map(interval => [{
                        xAxis: interval.start
                    },
                    {
                        xAxis: interval.end
                    }
                ])
            }
        }]
    }

    return options

}



const TOLERANCE = {
    "S1": [0.05, 0.05, Infinity, Infinity],
    "S2": [0.05, 0.05, Infinity, Infinity],
    "S3": [0.05, 0.05, Infinity, 20],
    "S4": [0.05, 0.05, Infinity, 20],
    "unsegmentable": [0.05, 0.05, Infinity, Infinity],
    "Inhale": [0.5, 0.5, Infinity, Infinity],
    "systole": [Infinity, Infinity, Infinity, Infinity],
    "diastole": [Infinity, Infinity, Infinity, Infinity],
}

const eqIndex = (sample, sequence, type) => {
    return findIndex(sequence, s => [
            Math.abs(sample.start - s.start),
            Math.abs(sample.end - s.end),
            Math.abs(sample.lf - s.lf),
            Math.abs(sample.hf - s.hf)
        ]
        .map((v, index) => v <= TOLERANCE[type][index])
        .reduce((a, b) => a && b, true)
    )
}

const diff2 = (s1, s2) => {

    s1 = (isArray(s1)) ? s1 : parse(s1)
    s2 = (isArray(s2)) ? s2 : parse(s2)


    let matchData = CHECKED_SEGMENT_TYPES.map(type => ({
        s1: s1.filter(d => d.type == type),
        s2: s2.filter(d => d.type == type),
    }))

    let diff = []
    matchData = zipObject(CHECKED_SEGMENT_TYPES, matchData)

    keys(matchData).forEach(key => {
        let m = matchData[key]
        let i = 0
        while (i < m.s1.length) {
            s = m.s1[i]
            let index = eqIndex(m.s1[i], m.s2, key)
            if (index > -1) {
                m.s1.splice(i, 1)
                m.s2.splice(index, 1)
            } else {
                i++
            }
        }

        diff.push(m.s1.concat(m.s2))
    })

    return zipObject(CHECKED_SEGMENT_TYPES, diff)

}


const getNonConsistencyIntervals = diffs => {

    diffs = (isArray(diffs || [])) ? diffs : [diffs]

    let pool = []
    diffs.forEach(d => {
        pool = pool.concat(flattenDeep(values(d)))
    })

    pool = sortBy(
        uniqWith(
            pool.map(d => ({
                start: Math.round(d.start),
                end: Math.round(d.end + 1)
            })),
            isEqual
        ),
        d => d.start
    )

    let i = 0
    while (i < pool.length - 1) {
        if (pool[i].end >= pool[i + 1].start) {
            pool[i].end = pool[i + 1].end
            pool.splice(i + 1, 1)
        } else {
            i++
        }
    }

    return pool

}



const mergeSegment = segments => [
    mean(segments.map(s => s.start)).toFixed(3),
    mean(segments.map(s => s.end)).toFixed(3),
    mean(segments.map(s => s.lf)).toFixed(3),
    mean(segments.map(s => s.hf)).toFixed(3)
]


const diffs = segmentations => {

    segmentations = (isArray(segmentations || [])) ? segmentations : [segmentations]
    let res = []

    for (let i = 0; i < segmentations.length - 1; i++) {
        res.push(diff2(segmentations[i], segmentations[i + 1]))
    }

    return res

}


const merge = segmentations => {

    segmentations = (isArray(segmentations || [])) ? segmentations : [segmentations]
    segmentations = segmentations.map(s => parse(s))

    let differences = diffs(segmentations)

    if (getNonConsistencyIntervals(differences).length > 0) return

    let mergeData = SEGMENT_TYPES.map(
        type => segmentations.map(
            seg => seg.filter(d => d.type == type)
        )
    )

    mergeData = mergeData.map(d => d[0].map((t, index) => d.map(v => v[index])))

    mergeData = mergeData.map(d => d.map(s => mergeSegment(s)))

    return extend({ v2: true }, zipObject(SEGMENT_TYPES, mergeData))

}


module.exports = {
    getSegmentationChart,
    getMultiSegmentationChart,
    diff2,
    diffs,
    getNonConsistencyIntervals,
    merge
}



// const run = async () => {

//     let segmentation = {
//         "v2": true,
//         "S1": [
//             [
//                 "0.268",
//                 "0.375",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "1.178",
//                 "1.282",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "2.180",
//                 "2.290",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "3.123",
//                 "3.237",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "3.835",
//                 "3.946",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "4.622",
//                 "4.728",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "5.322",
//                 "5.425",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "6.317",
//                 "6.435",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "7.126",
//                 "7.223",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "7.603",
//                 "7.708",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "8.105",
//                 "8.208",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "8.732",
//                 "8.847",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "9.361",
//                 "9.467",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "10.142",
//                 "10.250",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "11.222",
//                 "11.340",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "12.054",
//                 "12.168",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "12.750",
//                 "12.847",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "13.643",
//                 "13.750",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "14.406",
//                 "14.518",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "15.421",
//                 "15.541",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "16.197",
//                 "16.312",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "16.897",
//                 "17.017",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "18.238",
//                 "18.348",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "18.985",
//                 "19.102",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "19.710",
//                 "19.823",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "20.857",
//                 "20.960",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "21.970",
//                 "22.073",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "22.698",
//                 "22.808",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "23.421",
//                 "23.536",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "24.237",
//                 "24.344",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "24.977",
//                 "25.080",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "25.513",
//                 "25.617",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "26.963",
//                 "27.079",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "27.673",
//                 "27.788",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "28.461",
//                 "28.577",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "29.188",
//                 "29.307",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "29.905",
//                 "30.023",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "30.492",
//                 "30.602",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "31.260",
//                 "31.381",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "32.105",
//                 "32.225",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "32.707",
//                 "32.815",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "33.295",
//                 "33.409",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "33.995",
//                 "34.119",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "34.574",
//                 "34.680",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "35.561",
//                 "35.679",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "36.213",
//                 "36.325",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "36.902",
//                 "37.012",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "37.495",
//                 "37.614",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "38.080",
//                 "38.193",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "38.870",
//                 "38.972",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "39.400",
//                 "39.504",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "40.149",
//                 "40.272",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "40.813",
//                 "40.920",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "41.370",
//                 "41.478",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "41.991",
//                 "42.102",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "42.854",
//                 "42.977",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "43.462",
//                 "43.585",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "43.964",
//                 "44.078",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "44.467",
//                 "44.570",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "45.410",
//                 "45.515",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "46.065",
//                 "46.170",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "46.858",
//                 "46.969",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "47.637",
//                 "47.761",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "48.238",
//                 "48.350",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "48.823",
//                 "48.938",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "49.497",
//                 "49.620",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "50.190",
//                 "50.310",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "50.687",
//                 "50.795",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "51.562",
//                 "51.692",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "52.282",
//                 "52.392",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "53.043",
//                 "53.160",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "53.767",
//                 "53.887",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "54.475",
//                 "54.598",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "55.252",
//                 "55.370",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "55.875",
//                 "55.985",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "56.512",
//                 "56.622",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "57.187",
//                 "57.309",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "57.891",
//                 "58.013",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "58.397",
//                 "58.504",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "58.946",
//                 "59.049",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "59.477",
//                 "59.577",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "14.872",
//                 "14.974",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "20.292",
//                 "20.403",
//                 "0.000",
//                 "22050.000"
//             ]
//         ],
//         "S2": [
//             [
//                 "0.560",
//                 "0.658",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "1.508",
//                 "1.605",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "2.500",
//                 "2.590",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "3.458",
//                 "3.550",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "4.165",
//                 "4.258",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "4.947",
//                 "5.030",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "5.628",
//                 "5.718",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "6.648",
//                 "6.737",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "7.458",
//                 "7.550",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "7.860",
//                 "7.938",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "8.398",
//                 "8.483",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "9.030",
//                 "9.122",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "9.675",
//                 "9.768",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "10.477",
//                 "10.567",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "11.533",
//                 "11.620",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "12.378",
//                 "12.462",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "13.051",
//                 "13.143",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "13.966",
//                 "14.060",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "14.739",
//                 "14.832",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "15.731",
//                 "15.826",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "16.518",
//                 "16.612",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "17.228",
//                 "17.321",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "18.562",
//                 "18.654",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "19.308",
//                 "19.398",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "20.045",
//                 "20.140",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "20.615",
//                 "20.708",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "21.172",
//                 "21.258",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "22.303",
//                 "22.393",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "23.030",
//                 "23.134",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "23.758",
//                 "23.852",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "24.572",
//                 "24.660",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "25.298",
//                 "25.385",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "25.810",
//                 "25.895",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "27.272",
//                 "27.359",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "28.000",
//                 "28.102",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "28.791",
//                 "28.882",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "29.521",
//                 "29.607",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "30.238",
//                 "30.330",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "30.818",
//                 "30.908",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "31.596",
//                 "31.695",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "32.437",
//                 "32.537",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "33.024",
//                 "33.113",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "33.622",
//                 "33.710",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "34.317",
//                 "34.407",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "34.878",
//                 "34.965",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "35.880",
//                 "35.968",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "36.524",
//                 "36.612",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "37.220",
//                 "37.315",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "37.815",
//                 "37.905",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "38.398",
//                 "38.482",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "39.182",
//                 "39.277",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "39.680",
//                 "39.769",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "41.103",
//                 "41.198",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "41.671",
//                 "41.758",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "42.290",
//                 "42.382",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "43.169",
//                 "43.268",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "43.773",
//                 "43.873",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "44.243",
//                 "44.332",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "44.752",
//                 "44.845",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "45.712",
//                 "45.803",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "46.347",
//                 "46.447",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "47.183",
//                 "47.276",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "47.957",
//                 "48.045",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "48.545",
//                 "48.640",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "49.126",
//                 "49.218",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "49.810",
//                 "49.912",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "50.491",
//                 "50.583",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "50.973",
//                 "51.073",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "51.892",
//                 "51.990",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "52.590",
//                 "52.682",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "53.353",
//                 "53.440",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "54.082",
//                 "54.168",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "54.802",
//                 "54.893",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "55.576",
//                 "55.675",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "56.197",
//                 "56.292",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "56.820",
//                 "56.918",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "57.500",
//                 "57.595",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "58.208",
//                 "58.300",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "58.669",
//                 "58.754",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "59.244",
//                 "59.334",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "59.767",
//                 "59.852",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "15.133",
//                 "15.209",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "40.467",
//                 "40.561",
//                 "0.000",
//                 "22050.000"
//             ]
//         ],
//         "Inhale": [
//             [
//                 "0.174",
//                 "1.328",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "4.036",
//                 "5.055",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "8.261",
//                 "9.438",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "12.961",
//                 "13.964",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "17.638",
//                 "18.732",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "22.202",
//                 "23.273",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "26.842",
//                 "27.943",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "30.735",
//                 "32.002",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "35.020",
//                 "36.144",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "38.792",
//                 "39.886",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "41.930",
//                 "43.054",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "45.619",
//                 "46.751",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "49.444",
//                 "50.621",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "54.020",
//                 "55.449",
//                 "0.000",
//                 "22050.000"
//             ]
//         ],
//         "S3": [
//             [
//                 "6.813",
//                 "6.910",
//                 "21.089",
//                 "39.975"
//             ],
//             [
//                 "5.824",
//                 "5.917",
//                 "21.089",
//                 "41.155"
//             ],
//             [
//                 "3.662",
//                 "3.747",
//                 "16.367",
//                 "50.598"
//             ],
//             [
//                 "1.710",
//                 "1.816",
//                 "21.089",
//                 "39.980"
//             ],
//             [
//                 "9.906",
//                 "9.999",
//                 "21.089",
//                 "44.106"
//             ],
//             [
//                 "9.224",
//                 "9.315",
//                 "-4.289",
//                 "45.877"
//             ],
//             [
//                 "10.637",
//                 "10.729",
//                 "21.089",
//                 "41.745"
//             ],
//             [
//                 "14.122",
//                 "14.212",
//                 "21.089",
//                 "41.155"
//             ],
//             [
//                 "15.917",
//                 "16.018",
//                 "21.089",
//                 "41.745"
//             ],
//             [
//                 "16.708",
//                 "16.810",
//                 "19.908",
//                 "41.756"
//             ],
//             [
//                 "23.961",
//                 "24.043",
//                 "21.679",
//                 "43.516"
//             ],
//             [
//                 "24.753",
//                 "24.834",
//                 "21.089",
//                 "42.336"
//             ],
//             [
//                 "27.491",
//                 "27.572",
//                 "3.973",
//                 "46.464"
//             ],
//             [
//                 "29.707",
//                 "29.814",
//                 "21.679",
//                 "41.756"
//             ],
//             [
//                 "28.960",
//                 "29.059",
//                 "21.089",
//                 "41.745"
//             ],
//             [
//                 "28.239",
//                 "28.326",
//                 "21.089",
//                 "45.287"
//             ],
//             [
//                 "31.785",
//                 "31.889",
//                 "0.432",
//                 "45.298"
//             ],
//             [
//                 "51.146",
//                 "51.231",
//                 "21.089",
//                 "41.155"
//             ],
//             [
//                 "52.057",
//                 "52.159",
//                 "18.742",
//                 "39.991"
//             ],
//             [
//                 "49.984",
//                 "50.067",
//                 "-6.060",
//                 "43.530"
//             ],
//             [
//                 "17.458",
//                 "17.564",
//                 "21.089",
//                 "41.754"
//             ],
//             [
//                 "11.727",
//                 "11.824",
//                 "21.089",
//                 "37.614"
//             ],
//             [
//                 "45.920",
//                 "46.020",
//                 "-10.049",
//                 "43.409"
//             ],
//             [
//                 "46.619",
//                 "46.724",
//                 "1.113",
//                 "42.822"
//             ],
//             [
//                 "47.377",
//                 "47.460",
//                 "20.499",
//                 "39.884"
//             ],
//             [
//                 "52.789",
//                 "52.892",
//                 "11.099",
//                 "35.772"
//             ],
//             [
//                 "0.792",
//                 "0.877",
//                 "-41.184",
//                 "42.234"
//             ],
//             [
//                 "21.389",
//                 "21.460",
//                 "20.499",
//                 "36.947"
//             ]
//         ],
//         "unsegmentable": [
//             [
//                 "0.000",
//                 "0.268",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "59.852",
//                 "60.000",
//                 "0.000",
//                 "22050.000"
//             ]
//         ],
//         "systole": [
//             [
//                 "0.375",
//                 "0.560",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "1.282",
//                 "1.508",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "2.290",
//                 "2.500",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "3.237",
//                 "3.458",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "3.946",
//                 "4.165",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "4.728",
//                 "4.947",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "5.425",
//                 "5.628",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "6.435",
//                 "6.648",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "7.223",
//                 "7.458",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "7.708",
//                 "7.860",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "8.208",
//                 "8.398",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "8.847",
//                 "9.030",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "9.467",
//                 "9.675",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "10.250",
//                 "10.477",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "11.340",
//                 "11.533",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "12.168",
//                 "12.378",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "12.847",
//                 "13.051",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "13.750",
//                 "13.966",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "14.518",
//                 "14.739",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "14.974",
//                 "15.133",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "15.541",
//                 "15.731",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "16.312",
//                 "16.518",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "17.017",
//                 "17.228",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "18.348",
//                 "18.562",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "19.102",
//                 "19.308",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "19.823",
//                 "20.045",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "20.403",
//                 "20.615",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "20.960",
//                 "21.172",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "22.073",
//                 "22.303",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "22.808",
//                 "23.030",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "23.536",
//                 "23.758",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "24.344",
//                 "24.572",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "25.080",
//                 "25.298",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "25.617",
//                 "25.810",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "27.079",
//                 "27.272",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "27.788",
//                 "28.000",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "28.577",
//                 "28.791",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "29.307",
//                 "29.521",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "30.023",
//                 "30.238",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "30.602",
//                 "30.818",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "31.381",
//                 "31.596",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "32.225",
//                 "32.437",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "32.815",
//                 "33.024",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "33.409",
//                 "33.622",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "34.119",
//                 "34.317",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "34.680",
//                 "34.878",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "35.679",
//                 "35.880",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "36.325",
//                 "36.524",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "37.012",
//                 "37.220",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "37.614",
//                 "37.815",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "38.193",
//                 "38.398",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "38.972",
//                 "39.182",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "39.504",
//                 "39.680",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "40.272",
//                 "40.467",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "40.920",
//                 "41.103",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "41.478",
//                 "41.671",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "42.102",
//                 "42.290",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "42.977",
//                 "43.169",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "43.585",
//                 "43.773",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "44.078",
//                 "44.243",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "44.570",
//                 "44.752",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "45.515",
//                 "45.712",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "46.170",
//                 "46.347",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "46.969",
//                 "47.183",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "47.761",
//                 "47.957",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "48.350",
//                 "48.545",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "48.938",
//                 "49.126",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "49.620",
//                 "49.810",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "50.310",
//                 "50.491",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "50.795",
//                 "50.973",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "51.692",
//                 "51.892",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "52.392",
//                 "52.590",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "53.160",
//                 "53.353",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "53.887",
//                 "54.082",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "54.598",
//                 "54.802",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "55.370",
//                 "55.576",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "55.985",
//                 "56.197",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "56.622",
//                 "56.820",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "57.309",
//                 "57.500",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "58.013",
//                 "58.208",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "58.504",
//                 "58.669",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "59.049",
//                 "59.244",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "59.577",
//                 "59.767",
//                 "0.000",
//                 "22050.000"
//             ]
//         ],
//         "diastole": [
//             [
//                 "0.658",
//                 "1.178",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "1.605",
//                 "2.180",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "2.590",
//                 "3.123",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "3.550",
//                 "3.835",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "4.258",
//                 "4.622",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "5.030",
//                 "5.322",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "5.718",
//                 "6.317",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "6.737",
//                 "7.126",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "7.550",
//                 "7.603",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "7.938",
//                 "8.105",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "8.483",
//                 "8.732",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "9.122",
//                 "9.361",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "9.768",
//                 "10.142",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "10.567",
//                 "11.222",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "11.620",
//                 "12.054",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "12.462",
//                 "12.750",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "13.143",
//                 "13.643",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "14.060",
//                 "14.406",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "14.832",
//                 "14.872",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "15.209",
//                 "15.421",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "15.826",
//                 "16.197",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "16.612",
//                 "16.897",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "17.321",
//                 "18.238",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "18.654",
//                 "18.985",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "19.398",
//                 "19.710",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "20.140",
//                 "20.292",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "20.708",
//                 "20.857",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "21.258",
//                 "21.970",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "22.393",
//                 "22.698",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "23.134",
//                 "23.421",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "23.852",
//                 "24.237",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "24.660",
//                 "24.977",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "25.385",
//                 "25.513",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "25.895",
//                 "26.963",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "27.359",
//                 "27.673",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "28.102",
//                 "28.461",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "28.882",
//                 "29.188",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "29.607",
//                 "29.905",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "30.330",
//                 "30.492",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "30.908",
//                 "31.260",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "31.695",
//                 "32.105",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "32.537",
//                 "32.707",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "33.113",
//                 "33.295",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "33.710",
//                 "33.995",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "34.407",
//                 "34.574",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "34.965",
//                 "35.561",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "35.968",
//                 "36.213",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "36.612",
//                 "36.902",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "37.315",
//                 "37.495",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "37.905",
//                 "38.080",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "38.482",
//                 "38.870",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "39.277",
//                 "39.400",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "39.769",
//                 "40.149",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "40.561",
//                 "40.813",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "41.198",
//                 "41.370",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "41.758",
//                 "41.991",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "42.382",
//                 "42.854",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "43.268",
//                 "43.462",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "43.873",
//                 "43.964",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "44.332",
//                 "44.467",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "44.845",
//                 "45.410",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "45.803",
//                 "46.065",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "46.447",
//                 "46.858",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "47.276",
//                 "47.637",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "48.045",
//                 "48.238",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "48.640",
//                 "48.823",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "49.218",
//                 "49.497",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "49.912",
//                 "50.190",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "50.583",
//                 "50.687",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "51.073",
//                 "51.562",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "51.990",
//                 "52.282",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "52.682",
//                 "53.043",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "53.440",
//                 "53.767",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "54.168",
//                 "54.475",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "54.893",
//                 "55.252",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "55.675",
//                 "55.875",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "56.292",
//                 "56.512",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "56.918",
//                 "57.187",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "57.595",
//                 "57.891",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "58.300",
//                 "58.397",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "58.754",
//                 "58.946",
//                 "0.000",
//                 "22050.000"
//             ],
//             [
//                 "59.334",
//                 "59.477",
//                 "0.000",
//                 "22050.000"
//             ]
//         ]
//     }

//     // console.log(JSON.stringify(getSegmentationChart(segmentation), null, " "))

//     let s2 = JSON.parse(JSON.stringify(segmentation))
//     let s3 = JSON.parse(JSON.stringify(segmentation))


//     s2.S1[0] = [
//         "0.361",
//         "0.375",
//         "0.000",
//         "22050.000"
//     ]

//     s2.S1.splice(10, 4)
//     s3.S2 = s3.S2.slice(0, -10)

//     let d1 = diff2(parse(segmentation), parse(s2))
//     let d2 = diff2(parse(segmentation), parse(s3))
//     let d3 = diff2(parse(s2), parse(s3))


//     let diffs = [d1, d2, d3]

//     console.log(JSON.stringify(getNonConsistencyIntervals(diffs), null, " "))

//     // console.log(JSON.stringify(getSegmentationChart(segmentation, getNonConsistencyIntervals(diffs)), null, " "))

//     // // console.log(JSON.stringify(getMultiSegmentationChart([segmentation, s2, s3], getNonConsistencyIntervals(diffs)), null, " "))

//     // let s4 = merge([segmentation, segmentation, segmentation])
//     // console.log(JSON.stringify(getSegmentationChart(s4), null, " "))


// }

// run()