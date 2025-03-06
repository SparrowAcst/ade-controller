const {
    isArray,
    find,
    first,
    last,
    sortBy,
    keys,
    findIndex,
    maxBy,
    zipObject,
    flattenDeep,
    flatten,
    values,
    uniqWith,
    isEqual,
    mean,
    extend,
    groupBy,
    uniqBy,
    chunk,
    remove

} = require("lodash")

const log  = require("../../workflow/utils/logger")(__filename) //(path.basename(__filename))

const { avg, std, quantile, confidenceInterval, min, max } = require("../stat")

const Diff = require('jsondiffpatch')

const Polygon = require("./polygon")

const DataDiff = require("./data-diff")

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

let series = [
    // {
    //     name: "unsegmentable",
    //     segments: ["unsegmentable"]
    // },
    {
        name: "Heart Cycle",
        segments: ["S1", "S2", "systole", "diastole", "unsegmentable"]

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

    keys(segmentation)
        .filter( key => isArray(segmentation[key]))
        .forEach(key => {
            // log(key, segmentation[key].length)
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

const parsePolygons = segmentation => {
    const types = [
        "S1",
        "S2",
        "S3",
        "S4",
        "unsegmentable",
        "Inhale"
    ]

    let segments = sortBy(
        flatten(
            types.map(t => segmentation
                .filter(s => s.name == t)
                .map(s => ({
                    type: t,
                    start: min(s.points.map(p => p[0])),
                    end: max(s.points.map(p => p[0])),
                    lf: min(s.points.map(p => p[1])),
                    hf: max(s.points.map(p => p[1])),
                }))
            )
        ), s => s.start
    )

    const sysPattern = ["S1", "S2"]
    const diaPattern = ["S2", "S1"]

    const sysSegments = splitByPattern(segments.filter(s => ["S1", "S2", "unsegmentable"].includes(s.type)), sysPattern).map(d => ({
        type: "systole",
        start: d[0].end,
        end: d[1].start
    }))


    const diaSegments = splitByPattern(segments.filter(s => ["S1", "S2", "unsegmentable"].includes(s.type)), diaPattern).map(d => ({
        type: "diastole",
        start: d[0].end,
        end: d[1].start
    }))

    let res = sortBy(segments.concat(sysSegments).concat(diaSegments), s => s.start)
    return res

}


const parsePoly = segmentation => {
    
    if (!segmentation.Murmur) return []
    if(segmentation.Murmur.length == 0) return []
    if(!segmentation.Murmur[0].points) return []
        
    let items = groupBy(segmentation.Murmur, s => s.name)

    items = keys(items)
        .map(key => ({
            name: key,
            shapes: Polygon.array2Polygons(items[key].map(d => d.points))
        }))
        .filter(d => d.name != "undefined")

    return items    

}


const parse = segmentation => {

    let segments = []
    let polygons = []

    if (isArray(segmentation)) {
        if (segmentation[0] && segmentation[0].points) {
            segments = parsePolygons(segmentation)
            
        } else {
            segments = parseAI(segmentation)
        }

    } else if (segmentation && segmentation.v2 == true){  //(segmentation.S1 || segmentation.S2 || segmentation.unsegmentable)) {

        segments = parseV2(segmentation)
        polygons = parsePoly(segmentation)

    } else if (segmentation) {

        segments = parseV1(segmentation)
    }
    
    return {
        original: segmentation,
        segments, 
        polygons
    }

}


const polygons2v2 = polygons => {
    
    if(!polygons) return []

    let res = flatten(
        polygons.map( p => {
            return p.shapes.map( s => {
                return {
                    name: p.name,
                    type: "annotation-polygon",
                    points: s.vertices.map(v => [v.x, v.y])
                }
            })
        })
    )
    return res
}

const getSegmentationChart = (sa, nonConsistencyIntervals) => {

    let segments = JSON.parse(JSON.stringify(sa.segmentation.segments))
    
    // log("segments", segments)

    nonConsistencyIntervals = nonConsistencyIntervals || []

    let murmurCategories = uniqBy(segments.map(s => s.type)).filter(d => !SEGMENT_TYPES.includes(d))
    murmurCategories = murmurCategories.filter( d => d != "Murmur")


    let m = SEGMENT_TYPES.map(type => max(segments.filter(s => s.type == type).map(s => s.hf)) || 1)
    m = m.concat(murmurCategories.map(d => 1))

    m = zipObject(SEGMENT_TYPES.concat(murmurCategories), m)

    // let customSeries = JSON.parse(JSON.stringify(series)).concat(murmurCategories.map(d => ({name: d, segments: [d]})))
    let customSeries = murmurCategories
        .map(d => ({ name: d, segments: [d] }))
        .concat(JSON.parse(JSON.stringify(series)))
        .filter(d => {
            return segments.filter(s => d.segments.includes(s.type)).length > 0
        })

    segments = segments.map(s => {
        s.name = s.type
        s.itemStyle = {
            normal: {
                color: (segmentTypes[s.type]) ? segmentTypes[s.type].color || "#ede7f6" : "#ede7f6",
                borderColor: "#999",
                borderWidth: 0.3,
                // opacity: 0.5
            }
        }
        let categoryIndex = findIndex(customSeries, serie => serie.segments.includes(s.type))
        s.value = [categoryIndex, s.start, s.end, (s.hf || 1) / m[s.type]]
        return s
    })

    let data = customSeries.map(s => ({
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
            formatter: 
            `params => {
                return (params.componentType == 'markArea') 
                    ? 'zone of non-conformity started at ' + params.data.coord[0][0] + ' s'
                    : params.marker + params.name + ': started at ' + params.value[1] + ' s'
            }`
    
            // `params => {
            //     return params.marker + params.name + ': started at ' + params.value[1] + ' s';
            // }`
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
            data: customSeries.map(s => s.name),
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



const getMultiSegmentationChart = (users, segmentations, nonConsistencyIntervals) => {

    nonConsistencyIntervals = nonConsistencyIntervals || []

    users = (isArray(users || [])) ? users : [users]
    segmentations = (isArray(segmentations || [])) ? segmentations : [segmentations]

    let pool = []

    segmentations.forEach((segmentation, index) => {

        let segments = segmentation //parse(segmentation)

        let m = SEGMENT_TYPES.map(type => max(segments.filter(s => s.type == type).map(s => s.hf)) || 1)
        m = zipObject(SEGMENT_TYPES, m)

        segments = segments.map(s => {
            s.name = s.type
            s.user = users[index]
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
                return (params.componentType == 'markArea') 
                    ? 'zone of non-conformity started at ' + params.data.coord[0][0] + ' s'
                    : '<div style="font-size:10px;"><div style="font-weight: bold">' + params.data.user + '</div><div>' + params.marker + params.name + ': started at ' + params.value[1] + 's</div></div>'
            }`
            // `params => {
            //     return params.marker + params.name + ': started at ' + params.value[1] + ' s';
            // }`
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


const select = (sa, ...types) => {

    let segments = sa.segmentation.segments
    // log(segments)
    let selector = (types && isArray(types) && types.length > 0) ? (s => types.includes(s.type)) : (s => s)
    segments = sortBy(segments, s => s.start).filter(selector)
    return segments
}

const getCardioCycles = (sa, patternName) => {

    let segments = select(sa, "S1", "S2", "unsegmentable")

    if (!segments || segments.length == 0) return []

    let temp = segments.map(s => s)

    const HC_Pattern = {
        "S1S1": [{
                type: "S1",
                "required": true
            },
            {
                type: "systole"
            },
            {
                type: "S2",
                "required": true
            },
            {
                type: "diastole"
            },
            {
                type: "S1",
                "required": true
            }
        ],

        "S2S2": [{
                type: "S2",
                "required": true
            },
            {
                type: "diastole"
            },
            {
                type: "S1",
                "required": true
            },
            {
                type: "systole"
            },
            {
                type: "S2",
                "required": true
            }
        ],
    }

    const pattern = HC_Pattern[patternName] || HC_Pattern["S1S1"]

    const p1 = pattern.map(p => p.type)
    const p2 = pattern.filter(p => p.required).map(p => p.type)

    let res = []

    for (; temp.length >= pattern.length;) {

        let buf1 = temp.slice(0, p1.length)
        let buf2 = temp.slice(0, p2.length)

        if (matchPattern(buf1.map(b => b.type), p1)) {
            res.push(buf1)
        } else if (matchPattern(buf2.map(b => b.type), p2)) {
            res.push(buf2)
        }

        temp.shift()

    }

    return res

}

const getHeartRate = sa => {

    let cardioCycles = getCardioCycles(sa, "S1S1").concat(getCardioCycles(sa, "S2S2"))

    let res = cardioCycles.map(c => ({
        segments: c,
        rate: 60 / (last(c).start - c[0].start),
        duration: (last(c).start - c[0].start)
    }))

    if (res.length > 0) {
        res = {
            duration: res.map(d => d.duration),
            avg: avg(res.map(d => d.rate)),
            std: std(res.map(d => d.rate)),
            delta: confidenceInterval(res.map(d => d.rate), 0.95)
        }
    } else {
        res = {
            duration: res.map(d => d.duration),
            avg: 0,
            std: 0,
            delta: 0
        }
    }

    return res
}



const getBreathRate = sa => {

    let segments = sortBy(select(sa, "Inhale"), s => s.start)

    let res = []

    for (; segments.length >= 2;) {
        res.push(60 / (segments[1].start - segments[0].start))
        res.push(60 / (segments[1].end - segments[0].end))
        segments.shift()
    }

    if (res.length == 0) {
        return {
            avg: 0,
            delta: 0
        }
    }

    return {
        avg: avg(res),
        std: std(res),
        delta: confidenceInterval(res, 0.95)
    }

}

const getDepricated = sa => {

    let segments = select(sa, "unsegmentable")

    let deprecated = segments.map(s => s.end - s.start).reduce((a, v) => a + v, 0)
    let duration = getDuration(sa)

    return {
        value: deprecated,
        percents: 100 * deprecated / duration
    }
}

const getDuration = sa => {

    let segments = select(sa)
    return max(segments.map(s => s.end))

}

const getSystoleDiastole = sa => {


    let systole = select(sa, "systole").map(d => {
        d.duration = Number.parseFloat((d.end - d.start).toFixed(4))
        return d
    })


    let diastole = select(sa, "diastole").map(d => {
        d.duration = Number.parseFloat((d.end - d.start).toFixed(4))
        return d
    })

    if(systole.length > 0 && diastole.length > 0){
        return extend(sa, { systole, diastole })    
    }
    
    if( select(sa,"S1").length > 0 && select(sa,"S2").length > 0){
        // log("sa", sa)
        
        remove(sa.segmentation.segments, s => ["systole", "diastole"].includes(s.type))

        const sysPattern = ["S1", "S2"]
        const diaPattern = ["S2", "S1"]

        let segments = select(sa, "S1","S2","unsegmentable")

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

        if(sysSegments.length > 0 && diaSegments.length > 0){
            sa.segmentation.segments = sa.segmentation.segments.concat(sysSegments).concat(diaSegments)
            return getSystoleDiastole(sa)

        } else {
            sa.systole = []
            sa.diastole = []
            return sa            
        }

    } else {

        sa.systole = []
        sa.diastole = []
        return sa

    }    

}


const getTotals = sa => {

    let cardioCycles = getCardioCycles(sa)

    if (cardioCycles.lengyh == 0) return {
        cardioCycles: [],
        heartRate: {},
        breathRate: {},
        deprecated: null,
        duration: null,
        systole: [],
        diastole: []
    }

    let res = extend({}, sa, { cardioCycles })

    let heartRate = getHeartRate(sa)
    let deprecated = getDepricated(sa)
    let duration = getDuration(sa)
    let breathRate = getBreathRate(sa)

    return extend({},
        res, 
        {
            heartRate,
            breathRate,
            deprecated,
            duration
        }
    )
}



const getSystoleDiastoleBars = sa => {

    let segments = select(sa, "systole", "diastole", "unsegmentable").map(d => {
        d.duration = Number.parseFloat((d.end - d.start).toFixed(4))
        return d
    })

    if (segments.length == 0) return {}

    // while (first(segments).type != "systole") {
    //     segments.shift()
    // }

    segments = splitByPattern(segments, ["systole", "diastole"]) //chunk(segments, 2)

    // if (last(segments).length < 2) {
    //     segments.pop()
    // }


    let systole = segments.map(d => d[0].duration)
    let diastole = segments.map(d => d[1].duration)

    let sysdia = systole.map((s, index) => s + diastole[index])

    let s = {
        avg: avg(systole),
        std: std(systole),
        ci: confidenceInterval(systole),
        max: max(systole)
    }

    let d = {
        avg: avg(sysdia),
        std: std(sysdia),
        ci: confidenceInterval(sysdia),
        max: max(sysdia)
    }


    let option = {
        legend: {
            data: [
                "Systole",
                "Diastole"
            ]
        },
        xAxis: {
            type: 'category',

        },
        yAxis: {
            type: 'value',
            max: Number.parseFloat((Math.max(d.max, d.avg + d.ci) + 0.03).toFixed(1))
        },
        series: [{
                name: "Systole",
                barWidth: "40%",
                data: systole,
                color: "#f9a825",
                type: 'bar',
                itemStyle: {
                    borderColor: "#ef6c00",
                    borderWidth: 2
                },
                stack: "glob",
                markArea: {
                    itemStyle: {
                        color: 'rgba(255, 50, 50, 0.1)'
                    },
                    data: [
                        [{
                                yAxis: s.avg - s.ci
                            },
                            {
                                yAxis: s.avg + s.ci
                            }
                        ]
                    ]
                },
                markLine: {
                    silent: true,
                    symbol: [],
                    lineStyle: {
                        color: 'red',
                    },
                    data: [{
                            yAxis: s.avg - s.ci,
                            lineStyle: {
                                width: 1
                            }
                        },
                        {
                            yAxis: s.avg + s.ci,
                            lineStyle: {
                                width: 1
                            }
                        },
                    ]
                },
            },
            {
                name: "Diastole",
                data: diastole,
                color: "#7986cb",
                type: 'bar',
                itemStyle: {
                    borderColor: "#1a237e",
                    borderWidth: 2
                },
                stack: "glob",
                markArea: {
                    itemStyle: {
                        color: 'rgba(125, 125, 150, 0.05)'
                    },
                    data: [
                        [{
                                yAxis: d.avg - d.ci
                            },
                            {
                                yAxis: d.avg + d.ci
                            }
                        ]
                    ]
                },
                markLine: {
                    silent: true,
                    symbol: [],
                    lineStyle: {
                        color: 'blue',
                    },
                    data: [
                        // {
                        //   xAxis: diastoleAvg,
                        //   lineStyle: {
                        //     width:3
                        //   }
                        // },
                        {
                            yAxis: d.avg - d.ci,
                            lineStyle: {
                                width: 1
                            }
                        },
                        {
                            yAxis: d.avg + d.ci,
                            lineStyle: {
                                width: 1
                            }
                        },
                    ]
                },
            }
        ]
    }

    return option
}

/////////////////////////////////////////////////////////////////////////////////////////////////////



const getSystoleDiastoleScatterPlot = sa => {

    let values = []

    let segments = select(sa, "systole", "diastole", "unsegmentable").map(d => {
        d.duration = Number.parseFloat((d.end - d.start).toFixed(4))
        return d
    })

    if (segments.length == 0) return {}

    segments = splitByPattern(segments, ["systole", "diastole"])
    
    let systole = segments.map(d => d[0].duration)
    let diastole = segments.map(d => d[1].duration)
    

    // if (!sa.systole) return {}

    // let systole = sa.systole.map(d => d.duration)
    // let diastole = sa.diastole.map(d => d.duration)


    for (let i = 0; i < systole.length; i++) {
        values.push([systole[i], diastole[i]])
    }

    let minx = min(values.map(d => d[0]))
    let maxx = max(values.map(d => d[0]))
    minx = minx - 1.75 * (maxx - minx)
    maxx = maxx + 1.75 * (maxx - minx)

    let miny = min(values.map(d => d[1]))
    let maxy = max(values.map(d => d[1]))
    miny = miny - 0.1 * (maxy - miny)
    maxy = maxy + 0.25 * (maxy - miny)

    
    let max_ = (maxy < 0.75) ? 0.75 : maxy
    max_ = max_ + 0.10 * max_

    let min_ = Number.parseFloat(min([minx, miny]).toFixed(4))
    max_ = Number.parseFloat(max_.toFixed(4))

    min_ = 0

    return {
        grid: {
            width: 300,
            height: 300,
            left: "center",
            top: "center"
        },
        xAxis: {
            name: "Systole, s",
            nameLocation: "center",
            nameTextStyle: {
                fontWeight: "bold"
            },
            nameGap: 25,
            min: min_,
            max: max_,
        },
        yAxis: {
            name: "Diastole, s",
            nameLocation: "center",
            nameTextStyle: {
                fontWeight: "bold"
            },
            nameGap: 30,
            min: min_,
            max: max_,
        },
        series: [{
            symbolSize: 6,
            color: "#234758",
            data: values,
            type: 'scatter',
        }]
    }
}


const getS4S1interval = sa => {

    let pool = sortBy(select(sa, "S4", "S1", "unsegmentable"), d => d.start)

    let res = []
    for (let i = 0; i < pool.length - 1; i++) {
        if (pool[i].type == "S4" && pool[i + 1].type == "S1") {
            res.push({
                type: "S4-S1",
                start: pool[i].start,
                end: pool[i + 1].start
            })
        }
    }

    return res

}

const getS2S3interval = sa => {

    let pool = sortBy(select(sa, "S2", "S3", "unsegmentable"), d => d.start)

    let res = []
    for (let i = 0; i < pool.length - 1; i++) {
        if (pool[i].type == "S2" && pool[i + 1].type == "S3") {
            res.push({
                type: "S2-S3",
                start: pool[i].start,
                end: pool[i + 1].start
            })
        }
    }

    return res

}



const getSegmentDurationBoxplot = sa => {

    let pool = select(sa).concat(getS4S1interval(sa)).concat(getS2S3interval(sa))

    let seg = [
        "S1",
        "S2",
        "S3",
        "S4",
        "S4-S1",
        "S2-S3",
        "systole",
        "diastole"
    ]
    seg.reverse()

    seg = seg
        .map(s => {
            return {
                type: s,
                seg: pool.filter(p => p.type == s).map(d => Number.parseFloat((d.end - d.start).toFixed(4)))
            }
        })
        .filter(d => d.seg.length > 0)
        .map(d => {
            d.box = [quantile(d.seg, 0), quantile(d.seg, 0.25), quantile(d.seg, 0.5), quantile(d.seg, 0.75), quantile(d.seg, 0.999)]
            d.seg = d.seg.map(s => [s, d.type])
            return d
        })


    return {
        grid: {
            containLabel: true
        },
        tooltip: {
            trigger: 'item',
            axisPointer: {
                type: 'shadow'
            }
        },
        yAxis: {
            type: 'category',
            data: seg.map(d => d.type),
            boundaryGap: true
        },
        xAxis: {
            type: 'value',
            name: 'Duration, s',
            nameLocation: "center",
            nameTextStyle: {
                fontWeight: "bold"
            },
            nameGap: 25,
            minorTick: {
                show: true,
                splitNumber: 10
            },
            minorSplitLine: {
                show: true
            }
        },
        series: [{
                name: 'Segment duration',
                type: 'boxplot',
                color: "#234758",
                itemStyle: {
                    borderWidth: 1
                },
                data: seg.map(d => d.box)
            },
            {
                name: 'outlier',
                type: 'scatter',
                color: "#234758",
                symbolSize: 8,
                data: flatten(seg.map(d => d.seg))
            }
        ]
    }
}


const getHFBoxplot = sa => {

    let pool = select(sa, "S3", "S4").map(d => ({
        type: d.type,
        hf: d.hf
    }))

    if (pool.length == 0) {
        return {

            title: [{
                left: 'center',
                top: "center",
                text: 'No data',
                textStyle: {
                    color: "#aeaeae"
                }
            }]
        }
    }

    let seg = [
        "S3",
        "S4",
    ]

    seg.reverse()



    seg = seg
        .map(s => {
            return {
                type: s,
                seg: pool.filter(p => p.type == s).map(d => Number.parseFloat((d.hf).toFixed(1)))
            }
        })
        .filter(d => d.seg.length > 0)
        .map(d => {
            d.box = [quantile(d.seg, 0), quantile(d.seg, 0.25), quantile(d.seg, 0.5), quantile(d.seg, 0.75), quantile(d.seg, 0.999)]
            d.seg = d.seg.map(s => [s, d.type])
            return d
        })

    return {
        grid: {
            containLabel: true
        },
        tooltip: {
            trigger: 'item',
            axisPointer: {
                type: 'shadow'
            }
        },
        yAxis: {
            type: 'category',
            data: seg.map(d => d.type),
            boundaryGap: true
        },
        xAxis: {
            type: 'value',
            name: 'Frequancy, hz',
            nameLocation: "center",
            nameTextStyle: {
                fontWeight: "bold"
            },
            nameGap: 25,
            minorTick: {
                show: true,
                splitNumber: 10
            },
            minorSplitLine: {
                show: true
            }
        },
        series: [{
                name: 'High frequency',
                type: 'boxplot',
                color: "#234758",
                itemStyle: {
                    borderWidth: 1
                },
                data: seg.map(d => d.box)
            },
            {
                name: 'outlier',
                type: 'scatter',
                color: "#234758",
                symbolSize: 8,
                data: flatten(seg.map(d => d.seg))
            }
        ]
    }
}

const getPoincareChart = sa => {

    let data = sa.cardioCycles.map(c => Number.parseFloat((last(c).end - first(c).start).toFixed(4)))
    let values = []

    for (let i = 0; i < data.length - 1; i++) {
        values.push([data[i], data[i + 1]])
    }

    let min_ = min(data)
    let max_ = max(data)
    max_ = (max_< 1.400) ? 1.400 : max_

    min_ = min_ - 0.5 * (max_ - min_)
    
    max_ = Number.parseFloat((max_ + 0.10 * max_ ).toFixed(4))
    min_ = 0

    return {
        grid: {
            width: 300,
            height: 300,
            left: "center",
            top: "center"
        },
        xAxis: {
            name: "Duration of Preceding Cardio Cycle, s",
            nameLocation: "center",
            nameTextStyle: {
                fontWeight: "bold"
            },
            nameGap: 25,
            min: min_,
            max: max_,
        },
        yAxis: {
            name: "Duration of Next Cardio Cycle, s",
            nameLocation: "center",
            nameTextStyle: {
                fontWeight: "bold"
            },
            nameGap: 35,
            min: min_,
            max: max_,
        },
        series: [{
            symbolSize: 6,
            color: "#234758",
            data: values,
            type: 'scatter',
        }]
    }
}

const getMurmurPolygons = sa => {

    let items = sa.segmentation.polygons
    items = items.map(d => {
        // let p = Polygon.array2Polygons(d.polygons)
        let merged = Polygon.getPatternForPolygons(d.shapes)
        return {
            name: d.name,
            // consistency: merged.consistency,
            timeBoundary: sortBy(d.shapes.map(v => {
                let b = Polygon.getPointArray([v]).map(v => v.x)
                return [
                    Number.parseFloat(min(b).toFixed(3)),
                    Number.parseFloat(max(b).toFixed(3))
                ]
            }), d => d[0]),

            svg: Polygon.getSVG(merged),
            // metric: merged.metric
        }
    })

    items = items.map(d => {

        d.count = d.timeBoundary.length

        d.segments = d.timeBoundary.map(t => ({
            type: d.name,
            start: t[0],
            end: t[1]
        }))

        return d
    })

    return items

}


const getSegmentationAnalysis = segmentation => {

    let s = JSON.parse(JSON.stringify(segmentation))

    let sa = {
        segmentation: parse(s)
    }

    sa = getSystoleDiastole(sa)
    sa = getTotals(sa)

    let murmurPolygons = getMurmurPolygons(sa)

    sa.segmentation.segments = sa.segmentation.segments.concat(
        flatten(murmurPolygons.map(p => p.segments))
    )

    sa.charts = {
        murmurPolygons,
        segmentation: getSegmentationChart(sa),
        segmentDurationBoxplot: getSegmentDurationBoxplot(sa),
        systoleDiastoleBars: getSystoleDiastoleBars(sa),
        hfBoxplot: getHFBoxplot(sa),
        systoleDiastoleScatterPlot: getSystoleDiastoleScatterPlot(sa),
        poincareChart: getPoincareChart(sa),

    }

    return sa
}







/////////////////////////////////////////////////////////////////////////////////////////////////////

const TOLERANCE = {
    segment:{
        "S1": [0.03, 0.03, Infinity, Infinity],
        "S2": [0.03, 0.03, Infinity, Infinity],
        "S3": [0.02, 0.02, Infinity, 20],
        "S4": [0.02, 0.02, Infinity, 20],
        "unsegmentable": [0.03, 0.03, Infinity, Infinity],
        "Inhale": [0.5, 0.5, Infinity, Infinity],
        "systole": [Infinity, Infinity, Infinity, Infinity],
        "diastole": [Infinity, Infinity, Infinity, Infinity],
    },

    polygon: 0.975

}

const mergeIntervals = (...intervals) =>  {
    let pool = sortBy(flatten(intervals), d=> d.start)
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


const reduceEquality = (set1, set2, finder, key) => {
    
    set1 = set1.map( v => v)
    set2 = set2.map( v => v)


    let i = 0
    while (i < set1.length) {
        
        let index = finder(set1[i], set2, key)
        // log(index, set1[i], set2[index])
        if (index > -1) {
            set1.splice(i, 1)
            set2.splice(index, 1)
        } else {
            i++
        }
        
    }

    return set1.concat(set2)

}



///////////////////////////////////// segments difference/////////////////////////////////////////////

const findEqualSegmentIndex = (sample, sequence, type) => {
    return findIndex(sequence, s => [
            Math.abs(sample.start - s.start),
            Math.abs(sample.end - s.end),
            Math.abs(sample.lf - s.lf),
            Math.abs(sample.hf - s.hf)
        ]
        .map((v, index) => {
            // log(type, index,":", v, TOLERANCE.segment[type][index], v <= TOLERANCE.segment[type][index])
            return v <= TOLERANCE.segment[type][index]
        })
        .reduce((a, b) => a && b, true)
    )
}

const getPairSegmentsDiff = (s1, s2) => {

    let matchData = CHECKED_SEGMENT_TYPES.map(type => ({
        s1: s1.filter(d => d.type == type),
        s2: s2.filter(d => d.type == type),
    }))

    let diff = []
    
    matchData = zipObject(CHECKED_SEGMENT_TYPES, matchData)

    keys(matchData).forEach(key => {

        let m = matchData[key]
        diff.push(reduceEquality(m.s1, m.s2, findEqualSegmentIndex, key))
        // log(key, diff)
    })

    let segments = zipObject(CHECKED_SEGMENT_TYPES, diff)

    return segments

}


const getNonConsistencyIntervalsForSegments = diffs => {

    diffs = (isArray(diffs || [])) ? diffs : [diffs]

    let pool = []
    diffs.forEach(d => {
        pool = pool.concat(flattenDeep(values(d)))
    })

    pool = sortBy(
        uniqWith(
            pool.map(d => ({
                start: Math.round(d.start-1),
                end: Math.round(d.end + 1)
            })),
            isEqual
        ),
        d => d.start
    ).map(d => {
        d.start = (d.start < 0) ? 0 : d.start
        return d
    })

    return mergeIntervals(pool)

}



const mergeSegment = segments => [
    mean(segments.map(s => s.start)).toFixed(3),
    mean(segments.map(s => s.end)).toFixed(3),
    mean(segments.map(s => s.lf)).toFixed(3),
    mean(segments.map(s => s.hf)).toFixed(3)
]


const getSegmentsDiff = segmentations => {

    segmentations = (isArray(segmentations || [])) ? segmentations : [segmentations]
    
    let res = []

    for (let i = 0; i < segmentations.length - 1; i++) {
        res.push(getPairSegmentsDiff(segmentations[i], segmentations[i + 1]))
    }

    return res

}


const mergeSegments = segmentations => {

    segmentations = (isArray(segmentations || [])) ? segmentations : [segmentations]
    
    // segmentations = segmentations.map(s => parse(s))

    let differences = getSegmentsDiff(segmentations)

    if (getNonConsistencyIntervalsForSegments(differences).length > 0) return

    let mergeData = SEGMENT_TYPES.map(
        type => segmentations.map(
            seg => seg.filter(d => d.type == type)
        )
    )

    mergeData = mergeData.map(d => d[0].map((t, index) => d.map(v => v[index])))

    mergeData = mergeData.map(d => d.map(s => mergeSegment(s)))

    return extend({ v2: true }, zipObject(SEGMENT_TYPES, mergeData))

}

///////////////////////////////////////// polygons differences //////////////////////////////////////

const findEqualPolygonIndex = (pattern, sequence) => {
    
    let logPattern = Polygon.create(pattern.vertices.map( d => [d.x, Math.log(d.y)]))
    
    let consistencies = sequence.map( p => {

        let logP = Polygon.create(p.vertices.map( d => [d.x, Math.log(d.y)]))
        return (Polygon.getIntersection([logPattern, logP]).area() / Polygon.getUnion([logPattern, logP]).area()) >= TOLERANCE.polygon
    })

    return findIndex(consistencies, c => c)
}


const getPairPolygonDiff = (polygonSet1, polygonSet2) => {
    return reduceEquality(polygonSet1, polygonSet2, findEqualPolygonIndex)
}

const getNonConsistencyIntervalsForPolygons = diffs => {

    diffs = (isArray(diffs || [])) ? diffs : [diffs]

    let pool = flatten(diffs)

    pool = sortBy(
        uniqWith(
            pool.map(d => ({
                start: Math.round(d.box.xmin - 1),
                end: Math.round(d.box.xmax + 1)
            })),
            isEqual
        ),
        d => d.start
    )

    return mergeIntervals(pool)

}

const getPolygonsDiff = poligonSets => {

    poligonSets = (isArray(poligonSets || [])) ? poligonSets : [poligonSets]
    
    let res = []

    for (let i = 0; i < poligonSets.length - 1; i++) {
        res.push(getPairPolygonDiff(poligonSets[i], poligonSets[i + 1]))
    }

    return flatten(res)

}

const mergePolygons = polygonSets => {

    polygonSets = (isArray(polygonSets || [])) ? polygonSets : [polygonSets]
    
    let differences = getPolygonsDiff (polygonSets)

    if (getNonConsistencyIntervalsForPolygons(differences).length > 0) return

    let mergeData = polygonSets[0].map( (p, index) => {
        return Polygon.simplify(Polygon.merge(polygonSets.map( v => v[index])))
    })

    return mergeData
}

/////////////////////////////////////////////////////////////////////////////////////////////////////

const getDataDiff = dataArray => {

    dataArray.push(dataArray[0])

    let diffs = []
    for(let i = 0; i < dataArray.length -1; i++) {
        diffs.push(DataDiff.getDifference(dataArray[i], dataArray[i+1]))
    }   

    return diffs

}


const mergeData = dataArray => DataDiff.merge(dataArray)

/////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    
    parse,
    getSegmentationChart,
    getMultiSegmentationChart,
    getPairSegmentsDiff,
    getSegmentsDiff,
    getNonConsistencyIntervalsForSegments,
    mergeSegments,
    getSegmentationAnalysis,

    getNonConsistencyIntervalsForPolygons,
    getPolygonsDiff,
    mergePolygons,
    polygons2v2,

    getDataDiff,

    mergeData

}

/////////////////////////////////////////////////////////////////////////////////////////////

// let segmentations = require("./segment-examples")

// log(JSON.stringify(getSegmentsDiff(segmentations.map(s => parse(s).segments)), null, " "))


// let data = [
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 1.1176,
//                 100
//             ],
//             [
//                 1.14,
//                 130
//             ],
//             [
//                 1.1365,
//                 140
//             ],
//             [
//                 1.1680000000000001,
//                 130
//             ],
//             [
//                 1.1880000000000001,
//                 130
//             ],
//             [
//                 1.183,
//                 90
//             ],
//             [
//                 1.1932,
//                 85
//             ],

//             [
//                 1.1869,
//                 70
//             ],
//             [
//                 1.16548,
//                 110
//             ],
//             [
//                 1.13902,
//                 118
//             ],
//             [
//                 1.12579,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 0.31179999999999986,
//                 100
//             ],
//             [
//                 0.33,
//                 127
//             ],
//             [
//                 0.3294999999999999,
//                 140
//             ],
//             [
//                 0.3494999999999999,
//                 125
//             ],
//             [
//                 0.359,
//                 130
//             ],
//             [
//                 0.38259999999999983,
//                 85
//             ],
//             [
//                 0.3766999999999998,
//                 70
//             ],
//             [
//                 0.35663999999999985,
//                 110
//             ],
//             [
//                 0.3318599999999998,
//                 118
//             ],
//             [
//                 0.3194699999999999,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 0.7257999999999999,
//                 100
//             ],
//             [
//                 0.7420000000000001,
//                 140
//             ],
//             [
//                 0.7690000000000002,
//                 130
//             ],
//             [
//                 0.7906000000000001,
//                 85
//             ],
//             [
//                 0.7852,
//                 70
//             ],
//             [
//                 0.7668400000000001,
//                 110
//             ],
//             [
//                 0.74416,
//                 118
//             ],
//             [
//                 0.7328200000000001,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 1.4693,
//                 100
//             ],
//             [
//                 1.4877500000000001,
//                 140
//             ],
//             [
//                 1.5185000000000002,
//                 130
//             ],
//             [
//                 1.5431000000000001,
//                 85
//             ],
//             [
//                 1.5369500000000003,
//                 70
//             ],
//             [
//                 1.5160400000000003,
//                 110
//             ],
//             [
//                 1.49021,
//                 118
//             ],
//             [
//                 1.4772950000000002,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 1.9425999999999999,
//                 100
//             ],
//             [
//                 1.9629999999999999,
//                 140
//             ],
//             [
//                 1.9969999999999999,
//                 130
//             ],
//             [
//                 2.0241999999999996,
//                 85
//             ],
//             [
//                 2.0174,
//                 70
//             ],
//             [
//                 1.9942799999999998,
//                 110
//             ],
//             [
//                 1.9657199999999997,
//                 118
//             ],
//             [
//                 1.95144,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 2.3668,
//                 100
//             ],
//             [
//                 2.383,
//                 140
//             ],
//             [
//                 2.41,
//                 130
//             ],
//             [
//                 2.4316000000000004,
//                 85
//             ],
//             [
//                 2.4262,
//                 70
//             ],
//             [
//                 2.40784,
//                 110
//             ],
//             [
//                 2.38516,
//                 118
//             ],
//             [
//                 2.3738200000000003,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 2.7696,
//                 100
//             ],
//             [
//                 2.787,
//                 140
//             ],
//             [
//                 2.816,
//                 130
//             ],
//             [
//                 2.8392,
//                 85
//             ],
//             [
//                 2.8334,
//                 70
//             ],
//             [
//                 2.81368,
//                 110
//             ],
//             [
//                 2.78932,
//                 118
//             ],
//             [
//                 2.77714,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 3.1418,
//                 100
//             ],
//             [
//                 3.155,
//                 140
//             ],
//             [
//                 3.1769999999999996,
//                 130
//             ],
//             [
//                 3.1946,
//                 85
//             ],
//             [
//                 3.1902,
//                 70
//             ],
//             [
//                 3.1752399999999996,
//                 110
//             ],
//             [
//                 3.15676,
//                 118
//             ],
//             [
//                 3.14752,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 3.5927999999999995,
//                 100
//             ],
//             [
//                 3.6105,
//                 140
//             ],
//             [
//                 3.6399999999999997,
//                 130
//             ],
//             [
//                 3.6635999999999997,
//                 85
//             ],
//             [
//                 3.6576999999999997,
//                 70
//             ],
//             [
//                 3.6376399999999998,
//                 110
//             ],
//             [
//                 3.6128599999999995,
//                 118
//             ],
//             [
//                 3.6004699999999996,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 3.9932999999999996,
//                 100
//             ],
//             [
//                 4.01025,
//                 140
//             ],
//             [
//                 4.0385,
//                 130
//             ],
//             [
//                 4.0611,
//                 85
//             ],
//             [
//                 4.0554499999999996,
//                 70
//             ],
//             [
//                 4.036239999999999,
//                 110
//             ],
//             [
//                 4.01251,
//                 118
//             ],
//             [
//                 4.0006450000000005,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 4.3877,
//                 100
//             ],
//             [
//                 4.40825,
//                 140
//             ],
//             [
//                 4.4425,
//                 130
//             ],
//             [
//                 4.4699,
//                 85
//             ],
//             [
//                 4.46305,
//                 70
//             ],
//             [
//                 4.43976,
//                 110
//             ],
//             [
//                 4.41099,
//                 118
//             ],
//             [
//                 4.396605,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 4.7817,
//                 100
//             ],
//             [
//                 4.7947500000000005,
//                 140
//             ],
//             [
//                 4.8165000000000004,
//                 130
//             ],
//             [
//                 4.833900000000001,
//                 85
//             ],
//             [
//                 4.82955,
//                 70
//             ],
//             [
//                 4.814760000000001,
//                 110
//             ],
//             [
//                 4.79649,
//                 118
//             ],
//             [
//                 4.787355,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 5.2248,
//                 100
//             ],
//             [
//                 5.242500000000001,
//                 140
//             ],
//             [
//                 5.272,
//                 130
//             ],
//             [
//                 5.2956,
//                 85
//             ],
//             [
//                 5.289700000000001,
//                 70
//             ],
//             [
//                 5.269640000000001,
//                 110
//             ],
//             [
//                 5.24486,
//                 118
//             ],
//             [
//                 5.23247,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 5.6278,
//                 100
//             ],
//             [
//                 5.6455,
//                 140
//             ],
//             [
//                 5.675,
//                 130
//             ],
//             [
//                 5.6986,
//                 85
//             ],
//             [
//                 5.6927,
//                 70
//             ],
//             [
//                 5.67264,
//                 110
//             ],
//             [
//                 5.64786,
//                 118
//             ],
//             [
//                 5.63547,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 6.0292,
//                 100
//             ],
//             [
//                 6.049,
//                 140
//             ],
//             [
//                 6.082000000000001,
//                 130
//             ],
//             [
//                 6.1084000000000005,
//                 85
//             ],
//             [
//                 6.101800000000001,
//                 70
//             ],
//             [
//                 6.07936,
//                 110
//             ],
//             [
//                 6.051640000000001,
//                 118
//             ],
//             [
//                 6.037780000000001,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 6.4376999999999995,
//                 100
//             ],
//             [
//                 6.452249999999999,
//                 140
//             ],
//             [
//                 6.4765,
//                 130
//             ],
//             [
//                 6.495899999999999,
//                 85
//             ],
//             [
//                 6.4910499999999995,
//                 70
//             ],
//             [
//                 6.474559999999999,
//                 110
//             ],
//             [
//                 6.454189999999999,
//                 118
//             ],
//             [
//                 6.444004999999999,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 6.855700000000001,
//                 100
//             ],
//             [
//                 6.8732500000000005,
//                 140
//             ],
//             [
//                 6.902500000000001,
//                 130
//             ],
//             [
//                 6.9259,
//                 85
//             ],
//             [
//                 6.920050000000001,
//                 70
//             ],
//             [
//                 6.9001600000000005,
//                 110
//             ],
//             [
//                 6.875590000000001,
//                 118
//             ],
//             [
//                 6.863305,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 7.2593,
//                 100
//             ],
//             [
//                 7.27775,
//                 140
//             ],
//             [
//                 7.3085,
//                 130
//             ],
//             [
//                 7.3331,
//                 85
//             ],
//             [
//                 7.32695,
//                 70
//             ],
//             [
//                 7.30604,
//                 110
//             ],
//             [
//                 7.28021,
//                 118
//             ],
//             [
//                 7.267295,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 7.6645,
//                 100
//             ],
//             [
//                 7.68025,
//                 140
//             ],
//             [
//                 7.7065,
//                 130
//             ],
//             [
//                 7.7275,
//                 85
//             ],
//             [
//                 7.722250000000001,
//                 70
//             ],
//             [
//                 7.704400000000001,
//                 110
//             ],
//             [
//                 7.68235,
//                 118
//             ],
//             [
//                 7.671325,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 8.0519,
//                 100
//             ],
//             [
//                 8.06675,
//                 140
//             ],
//             [
//                 8.0915,
//                 130
//             ],
//             [
//                 8.1113,
//                 85
//             ],
//             [
//                 8.10635,
//                 70
//             ],
//             [
//                 8.08952,
//                 110
//             ],
//             [
//                 8.06873,
//                 118
//             ],
//             [
//                 8.058335,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 8.4929,
//                 100
//             ],
//             [
//                 8.51225,
//                 140
//             ],
//             [
//                 8.544500000000001,
//                 130
//             ],
//             [
//                 8.5703,
//                 85
//             ],
//             [
//                 8.56385,
//                 70
//             ],
//             [
//                 8.541920000000001,
//                 110
//             ],
//             [
//                 8.51483,
//                 118
//             ],
//             [
//                 8.501285000000001,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 8.8967,
//                 100
//             ],
//             [
//                 8.91425,
//                 140
//             ],
//             [
//                 8.9435,
//                 130
//             ],
//             [
//                 8.966899999999999,
//                 85
//             ],
//             [
//                 8.96105,
//                 70
//             ],
//             [
//                 8.94116,
//                 110
//             ],
//             [
//                 8.91659,
//                 118
//             ],
//             [
//                 8.904304999999999,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 9.3041,
//                 100
//             ],
//             [
//                 9.32375,
//                 140
//             ],
//             [
//                 9.3565,
//                 130
//             ],
//             [
//                 9.3827,
//                 85
//             ],
//             [
//                 9.376149999999999,
//                 70
//             ],
//             [
//                 9.35388,
//                 110
//             ],
//             [
//                 9.326369999999999,
//                 118
//             ],
//             [
//                 9.312615,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 9.711599999999999,
//                 100
//             ],
//             [
//                 9.7305,
//                 140
//             ],
//             [
//                 9.762,
//                 130
//             ],
//             [
//                 9.787199999999999,
//                 85
//             ],
//             [
//                 9.780899999999999,
//                 70
//             ],
//             [
//                 9.75948,
//                 110
//             ],
//             [
//                 9.73302,
//                 118
//             ],
//             [
//                 9.71979,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 10.1211,
//                 100
//             ],
//             [
//                 10.13925,
//                 140
//             ],
//             [
//                 10.1695,
//                 130
//             ],
//             [
//                 10.1937,
//                 85
//             ],
//             [
//                 10.18765,
//                 70
//             ],
//             [
//                 10.16708,
//                 110
//             ],
//             [
//                 10.14167,
//                 118
//             ],
//             [
//                 10.128964999999999,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 10.5306,
//                 100
//             ],
//             [
//                 10.5495,
//                 140
//             ],
//             [
//                 10.581,
//                 130
//             ],
//             [
//                 10.6062,
//                 85
//             ],
//             [
//                 10.5999,
//                 70
//             ],
//             [
//                 10.57848,
//                 110
//             ],
//             [
//                 10.55202,
//                 118
//             ],
//             [
//                 10.53879,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 10.942499999999999,
//                 100
//             ],
//             [
//                 10.961249999999998,
//                 140
//             ],
//             [
//                 10.992499999999998,
//                 130
//             ],
//             [
//                 11.017499999999998,
//                 85
//             ],
//             [
//                 11.011249999999999,
//                 70
//             ],
//             [
//                 10.989999999999998,
//                 110
//             ],
//             [
//                 10.963749999999997,
//                 118
//             ],
//             [
//                 10.950624999999999,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 11.3474,
//                 100
//             ],
//             [
//                 11.3675,
//                 140
//             ],
//             [
//                 11.401,
//                 130
//             ],
//             [
//                 11.427800000000001,
//                 85
//             ],
//             [
//                 11.421100000000001,
//                 70
//             ],
//             [
//                 11.39832,
//                 110
//             ],
//             [
//                 11.37018,
//                 118
//             ],
//             [
//                 11.356110000000001,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 11.7551,
//                 100
//             ],
//             [
//                 11.774750000000001,
//                 140
//             ],
//             [
//                 11.807500000000001,
//                 130
//             ],
//             [
//                 11.8337,
//                 85
//             ],
//             [
//                 11.82715,
//                 70
//             ],
//             [
//                 11.80488,
//                 110
//             ],
//             [
//                 11.777370000000001,
//                 118
//             ],
//             [
//                 11.763615000000001,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 12.1663,
//                 100
//             ],
//             [
//                 12.186250000000001,
//                 140
//             ],
//             [
//                 12.2195,
//                 130
//             ],
//             [
//                 12.2461,
//                 85
//             ],
//             [
//                 12.23945,
//                 70
//             ],
//             [
//                 12.21684,
//                 110
//             ],
//             [
//                 12.18891,
//                 118
//             ],
//             [
//                 12.174945000000001,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 12.5765,
//                 100
//             ],
//             [
//                 12.595249999999998,
//                 140
//             ],
//             [
//                 12.626499999999998,
//                 130
//             ],
//             [
//                 12.651499999999999,
//                 85
//             ],
//             [
//                 12.645249999999999,
//                 70
//             ],
//             [
//                 12.623999999999999,
//                 110
//             ],
//             [
//                 12.597749999999998,
//                 118
//             ],
//             [
//                 12.584624999999999,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 12.982899999999999,
//                 100
//             ],
//             [
//                 13.00375,
//                 140
//             ],
//             [
//                 13.0385,
//                 130
//             ],
//             [
//                 13.0663,
//                 85
//             ],
//             [
//                 13.05935,
//                 70
//             ],
//             [
//                 13.03572,
//                 110
//             ],
//             [
//                 13.00653,
//                 118
//             ],
//             [
//                 12.991935,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 13.7984,
//                 100
//             ],
//             [
//                 13.82,
//                 140
//             ],
//             [
//                 13.856000000000002,
//                 130
//             ],
//             [
//                 13.8848,
//                 85
//             ],
//             [
//                 13.877600000000001,
//                 70
//             ],
//             [
//                 13.85312,
//                 110
//             ],
//             [
//                 13.822880000000001,
//                 118
//             ],
//             [
//                 13.807760000000002,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 14.2305,
//                 100
//             ],
//             [
//                 14.249249999999998,
//                 140
//             ],
//             [
//                 14.280499999999998,
//                 130
//             ],
//             [
//                 14.305499999999999,
//                 85
//             ],
//             [
//                 14.299249999999999,
//                 70
//             ],
//             [
//                 14.277999999999999,
//                 110
//             ],
//             [
//                 14.251749999999998,
//                 118
//             ],
//             [
//                 14.238624999999999,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 14.6366,
//                 100
//             ],
//             [
//                 14.6525,
//                 140
//             ],
//             [
//                 14.679,
//                 130
//             ],
//             [
//                 14.7002,
//                 85
//             ],
//             [
//                 14.6949,
//                 70
//             ],
//             [
//                 14.67688,
//                 110
//             ],
//             [
//                 14.65462,
//                 118
//             ],
//             [
//                 14.64349,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 14.994800000000001,
//                 100
//             ],
//             [
//                 15.011000000000001,
//                 140
//             ],
//             [
//                 15.038,
//                 130
//             ],
//             [
//                 15.059600000000001,
//                 85
//             ],
//             [
//                 15.054200000000002,
//                 70
//             ],
//             [
//                 15.03584,
//                 110
//             ],
//             [
//                 15.013160000000001,
//                 118
//             ],
//             [
//                 15.00182,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 15.4587,
//                 100
//             ],
//             [
//                 15.47775,
//                 140
//             ],
//             [
//                 15.509500000000001,
//                 130
//             ],
//             [
//                 15.5349,
//                 85
//             ],
//             [
//                 15.528550000000001,
//                 70
//             ],
//             [
//                 15.506960000000001,
//                 110
//             ],
//             [
//                 15.48029,
//                 118
//             ],
//             [
//                 15.466955,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 15.86,
//                 100
//             ],
//             [
//                 15.875,
//                 140
//             ],
//             [
//                 15.899999999999999,
//                 130
//             ],
//             [
//                 15.92,
//                 85
//             ],
//             [
//                 15.915,
//                 70
//             ],
//             [
//                 15.898,
//                 110
//             ],
//             [
//                 15.876999999999999,
//                 118
//             ],
//             [
//                 15.866499999999998,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 16.2602,
//                 100
//             ],
//             [
//                 16.28,
//                 140
//             ],
//             [
//                 16.313000000000002,
//                 130
//             ],
//             [
//                 16.3394,
//                 85
//             ],
//             [
//                 16.332800000000002,
//                 70
//             ],
//             [
//                 16.310360000000003,
//                 110
//             ],
//             [
//                 16.28264,
//                 118
//             ],
//             [
//                 16.268780000000003,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 16.6802,
//                 100
//             ],
//             [
//                 16.697,
//                 140
//             ],
//             [
//                 16.724999999999998,
//                 130
//             ],
//             [
//                 16.7474,
//                 85
//             ],
//             [
//                 16.741799999999998,
//                 70
//             ],
//             [
//                 16.722759999999997,
//                 110
//             ],
//             [
//                 16.69924,
//                 118
//             ],
//             [
//                 16.687479999999997,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 17.114600000000003,
//                 100
//             ],
//             [
//                 17.132000000000005,
//                 140
//             ],
//             [
//                 17.161000000000005,
//                 130
//             ],
//             [
//                 17.184200000000004,
//                 85
//             ],
//             [
//                 17.178400000000003,
//                 70
//             ],
//             [
//                 17.158680000000004,
//                 110
//             ],
//             [
//                 17.134320000000002,
//                 118
//             ],
//             [
//                 17.12214,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 17.4882,
//                 100
//             ],
//             [
//                 17.5065,
//                 140
//             ],
//             [
//                 17.537,
//                 130
//             ],
//             [
//                 17.5614,
//                 85
//             ],
//             [
//                 17.5553,
//                 70
//             ],
//             [
//                 17.53456,
//                 110
//             ],
//             [
//                 17.50894,
//                 118
//             ],
//             [
//                 17.496129999999997,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 17.9543,
//                 100
//             ],
//             [
//                 17.96975,
//                 140
//             ],
//             [
//                 17.9955,
//                 130
//             ],
//             [
//                 18.0161,
//                 85
//             ],
//             [
//                 18.01095,
//                 70
//             ],
//             [
//                 17.99344,
//                 110
//             ],
//             [
//                 17.97181,
//                 118
//             ],
//             [
//                 17.960995,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 18.3027,
//                 100
//             ],
//             [
//                 18.31875,
//                 140
//             ],
//             [
//                 18.3455,
//                 130
//             ],
//             [
//                 18.3669,
//                 85
//             ],
//             [
//                 18.36155,
//                 70
//             ],
//             [
//                 18.343360000000004,
//                 110
//             ],
//             [
//                 18.320890000000002,
//                 118
//             ],
//             [
//                 18.309655000000003,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     },
//     {
//         "name": "Still's Murmur",
//         "type": "annotation-polygon",
//         "points": [
//             [
//                 18.7775,
//                 100
//             ],
//             [
//                 18.79475,
//                 140
//             ],
//             [
//                 18.823500000000003,
//                 130
//             ],
//             [
//                 18.846500000000002,
//                 85
//             ],
//             [
//                 18.84075,
//                 70
//             ],
//             [
//                 18.8212,
//                 110
//             ],
//             [
//                 18.79705,
//                 118
//             ],
//             [
//                 18.784975,
//                 88
//             ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//             "systole",
//             "diastole",
//             "unsegmentable"
//         ]
//     }
// ]


// // let data = [
// //     {
// //         "name": "Still's Murmur",
// //         "type": "annotation-polygon",
// //         "points": [
// //             [
// //                 0,
// //                 0
// //             ],
// //             [
// //                 5,
// //                 10
// //             ],
// //             [
// //                 10,
// //                 0
// //             ],
// //             [
// //                 5,
// //                 9.8
// //             ]
// //         ],
// //         "additionalNames": [],
// //         "alternativeNames": [
// //             "systole",
// //             "diastole",
// //             "unsegmentable"
// //         ]
// //     },
// //     {
// //         "name": "Still's Murmur",
// //         "type": "annotation-polygon",
// //         "points": [
// //             [
// //                 0.5,
// //                 0
// //             ],
// //             [
// //                 5.5,
// //                 10
// //             ],
// //             [
// //                 9.5,
// //                 0.2
// //             ],
// //             [
// //                 5.3,
// //                 9.5
// //             ]
// //         ],
// //         "additionalNames": [],
// //         "alternativeNames": [
// //             "systole",
// //             "diastole",
// //             "unsegmentable"
// //         ]
// //     },

// // ]

// let polygons = data.map( d => Polygon.create(d.points))
// polygons = Polygon
//     .fit(polygons)
//     .slice(3,8)
//     // .map( p => Polygon.create(Polygon.getPointArray([p])))

// let intersection = Polygon.simplify(Polygon.getIntersection(polygons), 0.01)
// // let intersection = Polygon.getIntersection(polygons)

// let union = Polygon.simplify(Polygon.getUnion(polygons))
// let sbstr = Polygon.simplify(Polygon.getSubtract ([union, intersection]))
// // let pattern = Polygon.simplify(Polygon.merge(polygons), 0.01)
// // log(polygons.map(p => Polygon.getPointArray([p])))

// // let sectors = Polygon.getSectors(intersection)

// // let sPoly = Polygon.create(sectors.map( s => s.point))
// // let s1Poly = Polygon.create(flatten(sectors.map( s => s.segment.vertices)))
// let m = Polygon.simplify(Polygon.newMerge(polygons))
// log(Polygon.getSVG({
//     polygons: polygons,
//     patterns: [
//         m
//         // s1Poly, 
//         // sPoly, 
//         // intersection,
//         // Polygon.create(m.map(d => d.centroid)),
//         // Polygon.create(flatten(
//         //     m.map(d => [d.centroid,(d.focus) ? [d.focus.x, d.focus.y] : d.centroid, d.centroid]
//         //     ))
//         // ),
//         // Polygon.create(m.map(d => d.focus)),
        
//         // polygons[0]
//     ]
// }))

// let sectors = Polygon.getSectors(intersection)

// sectors.forEach( sector => {
//     // log(sector.point)
//     log(Polygon.selectPointsWithinSector(
//         Polygon.getPointArray(polygons), 
//         sector,
//         intersection
//     ))

// })

// let s1 =  {
//     "v2": true,
//     "S1": [
//       [
//         "0.645",
//         "0.749",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.227",
//         "1.335",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.887",
//         "1.989",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.514",
//         "2.613",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.263",
//         "3.365",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.185",
//         "4.295",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.808",
//         "4.912",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.343",
//         "5.445",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.939",
//         "6.041",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.729",
//         "6.834",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.437",
//         "7.539",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.354",
//         "8.465",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.292",
//         "9.393",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.130",
//         "10.229",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.953",
//         "11.057",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.591",
//         "11.687",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.472",
//         "12.571",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.191",
//         "13.300",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.854",
//         "13.954",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.749",
//         "14.852",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.595",
//         "15.694",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.271",
//         "16.374",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.090",
//         "17.194",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.855",
//         "17.953",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.576",
//         "18.673",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.210",
//         "19.305",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.825",
//         "19.923",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "S2": [
//       [
//         "0.897",
//         "0.979",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "0.017",
//         "0.107",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.494",
//         "1.586",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.145",
//         "2.234",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.776",
//         "2.870",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.531",
//         "3.624",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.450",
//         "4.544",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.076",
//         "5.152",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.603",
//         "5.681",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.204",
//         "6.274",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.967",
//         "7.051",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.685",
//         "7.771",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.609",
//         "8.704",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.537",
//         "9.626",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.381",
//         "10.457",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.202",
//         "11.291",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.849",
//         "11.939",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.730",
//         "12.811",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.483",
//         "13.570",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.128",
//         "14.215",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.002",
//         "15.079",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.845",
//         "15.927",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.540",
//         "16.615",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.358",
//         "17.439",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.126",
//         "18.209",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.831",
//         "18.912",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.473",
//         "19.553",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "Murmur": [
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             13.954619420857254,
//             20
//           ],
//           [
//             14.12793013115543,
//             20
//           ],
//           [
//             14.12793013115543,
//             651.4232135668533
//           ],
//           [
//             13.954619420857254,
//             651.4232135668533
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             13.301274779901899,
//             20
//           ],
//           [
//             13.481985292788861,
//             20
//           ],
//           [
//             13.481985292788861,
//             576.7925243600912
//           ],
//           [
//             13.301274779901899,
//             576.7925243600912
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             12.572930013476649,
//             20
//           ],
//           [
//             12.728285204645346,
//             20
//           ],
//           [
//             12.728285204645346,
//             551.0578039439663
//           ],
//           [
//             12.572930013476649,
//             551.0578039439663
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             11.687850125744434,
//             31.216451538244655
//           ],
//           [
//             11.847815721841608,
//             31.216451538244655
//           ],
//           [
//             11.847815721841608,
//             584.5129404849285
//           ],
//           [
//             11.687850125744434,
//             584.5129404849285
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             10.230134813255338,
//             20
//           ],
//           [
//             10.38006776585768,
//             20
//           ],
//           [
//             10.38006776585768,
//             653.1746119907925
//           ],
//           [
//             10.230134813255338,
//             653.1746119907925
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             9.395218300374824,
//             20
//           ],
//           [
//             9.535467835528435,
//             20
//           ],
//           [
//             9.535467835528435,
//             537.5187678349482
//           ],
//           [
//             9.395218300374824,
//             537.5187678349482
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             8.469119227046798,
//             20
//           ],
//           [
//             8.607680148377156,
//             20
//           ],
//           [
//             8.607680148377156,
//             565.7901964063769
//           ],
//           [
//             8.469119227046798,
//             565.7901964063769
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             7.539355048908541,
//             20
//           ],
//           [
//             7.683879558679512,
//             20
//           ],
//           [
//             7.683879558679512,
//             601.7720145881951
//           ],
//           [
//             7.539355048908541,
//             601.7720145881951
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             6.836000201655538,
//             36.343443159623575
//           ],
//           [
//             6.965997433018954,
//             36.343443159623575
//           ],
//           [
//             6.965997433018954,
//             568.3603262765068
//           ],
//           [
//             6.836000201655538,
//             568.3603262765068
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             6.0442631929917905,
//             20
//           ],
//           [
//             6.202284218349307,
//             20
//           ],
//           [
//             6.202284218349307,
//             586.3512353674159
//           ],
//           [
//             6.0442631929917905,
//             586.3512353674159
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             5.447896996979841,
//             20
//           ],
//           [
//             5.600519007074424,
//             20
//           ],
//           [
//             5.600519007074424,
//             648.0343522505327
//           ],
//           [
//             5.447896996979841,
//             648.0343522505327
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             4.914051555844572,
//             17.429870129870324
//           ],
//           [
//             5.074289556018392,
//             17.429870129870324
//           ],
//           [
//             5.074289556018392,
//             619.7629236791042
//           ],
//           [
//             4.914051555844572,
//             619.7629236791042
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             4.30008214211406,
//             31.203183419363995
//           ],
//           [
//             4.447424713936456,
//             31.203183419363995
//           ],
//           [
//             4.447424713936456,
//             514.3875990037795
//           ],
//           [
//             4.30008214211406,
//             514.3875990037795
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             3.3668307777926056,
//             31.203183419363995
//           ],
//           [
//             3.5279847985592836,
//             31.203183419363995
//           ],
//           [
//             3.5279847985592836,
//             581.2109756271561
//           ],
//           [
//             3.3668307777926056,
//             581.2109756271561
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             2.614080974702069,
//             36.343443159623575
//           ],
//           [
//             2.7744250107303086,
//             36.343443159623575
//           ],
//           [
//             2.7744250107303086,
//             558.0798067959872
//           ],
//           [
//             2.614080974702069,
//             558.0798067959872
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             1.991204365533028,
//             20
//           ],
//           [
//             2.1440893022047858,
//             20
//           ],
//           [
//             2.1440893022047858,
//             542.659027575208
//           ],
//           [
//             1.991204365533028,
//             542.659027575208
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             1.3385569868555283,
//             20
//           ],
//           [
//             1.4909640036495222,
//             20
//           ],
//           [
//             1.4909640036495222,
//             519.5278587440391
//           ],
//           [
//             1.3385569868555283,
//             519.5278587440391
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             0.7511229660097336,
//             20
//           ],
//           [
//             0.8945997585441111,
//             20
//           ],
//           [
//             0.8945997585441111,
//             617.1927938089743
//           ],
//           [
//             0.7511229660097336,
//             617.1927938089743
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             14.854252214444836,
//             20
//           ],
//           [
//             14.999454724777381,
//             20
//           ],
//           [
//             14.999454724777381,
//             578.6408457570262
//           ],
//           [
//             14.854252214444836,
//             578.6408457570262
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             15.695982581041088,
//             31.203183419363995
//           ],
//           [
//             15.841889408299183,
//             31.203183419363995
//           ],
//           [
//             15.841889408299183,
//             447.56422238040295
//           ],
//           [
//             15.695982581041088,
//             447.56422238040295
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             16.37570696904792,
//             20
//           ],
//           [
//             16.53782803558734,
//             20
//           ],
//           [
//             16.53782803558734,
//             488.68630030248073
//           ],
//           [
//             16.37570696904792,
//             488.68630030248073
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             17.19612013588709,
//             20
//           ],
//           [
//             17.356185044971163,
//             20
//           ],
//           [
//             17.356185044971163,
//             496.39668991287044
//           ],
//           [
//             17.19612013588709,
//             496.39668991287044
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             17.954326623688633,
//             20
//           ],
//           [
//             18.12315226896408,
//             20
//           ],
//           [
//             18.12315226896408,
//             565.7901964063769
//           ],
//           [
//             17.954326623688633,
//             565.7901964063769
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             18.675644603576995,
//             20
//           ],
//           [
//             18.829114469710127,
//             20
//           ],
//           [
//             18.829114469710127,
//             555.5096769258573
//           ],
//           [
//             18.675644603576995,
//             555.5096769258573
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       },
//       {
//         "name": "Murmur",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             19.307490592828437,
//             20
//           ],
//           [
//             19.47258039078924,
//             20
//           ],
//           [
//             19.47258039078924,
//             555.5096769258573
//           ],
//           [
//             19.307490592828437,
//             555.5096769258573
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "Murmur",
//           "Murmur"
//         ]
//       }
//     ],
//     "Inhale": [
//       [
//         "1.821",
//         "3.009",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.711",
//         "8.747",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.791",
//         "12.861",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.688",
//         "18.310",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "unsegmentable": [
//       [
//         "0.000",
//         "0.017",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.923",
//         "19.968",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "diastole": [
//       [
//         "0.107",
//         "0.645",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "0.979",
//         "1.227",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.586",
//         "1.887",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.234",
//         "2.514",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.870",
//         "3.263",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.624",
//         "4.185",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.544",
//         "4.808",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.152",
//         "5.343",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.681",
//         "5.939",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.274",
//         "6.729",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.051",
//         "7.437",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.771",
//         "8.354",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.704",
//         "9.292",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.626",
//         "10.130",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.457",
//         "10.953",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.291",
//         "11.591",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.939",
//         "12.472",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.811",
//         "13.191",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.570",
//         "13.854",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.215",
//         "14.749",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.079",
//         "15.595",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.927",
//         "16.271",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.615",
//         "17.090",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.439",
//         "17.855",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.209",
//         "18.576",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.912",
//         "19.210",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.553",
//         "19.825",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "systole": [
//       [
//         "0.749",
//         "0.897",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.335",
//         "1.494",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.989",
//         "2.145",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.613",
//         "2.776",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.365",
//         "3.531",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.295",
//         "4.450",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.912",
//         "5.076",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.445",
//         "5.603",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.041",
//         "6.204",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.834",
//         "6.967",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.539",
//         "7.685",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.465",
//         "8.609",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.393",
//         "9.537",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.229",
//         "10.381",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.057",
//         "11.202",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.687",
//         "11.849",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.571",
//         "12.730",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.300",
//         "13.483",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.954",
//         "14.128",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.852",
//         "15.002",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.694",
//         "15.845",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.374",
//         "16.540",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.194",
//         "17.358",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.953",
//         "18.126",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.673",
//         "18.831",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.305",
//         "19.473",
//         "0.000",
//         "22050.000"
//       ]
//     ]
//   }



//   let s2 = JSON.parse(JSON.stringify(s1))

//   s2.S1[0] = [
//         "0.000",
//         "0.749",
//         "0.000",
//         "22050.000"
//       ]

//   s2.Murmur[0].points = [
//           [
//             13.954619420857254,
//             20
//           ],
//           [
//             14.12793013115543,
//             20
//           ],
//           [
//             14.12793013115543,
//             651.4232135668533
//           ],
//           [
//             13.961, //4619420857254,
//             651.4232135668533
//           ]
//         ]


//   s1 = parse(s1)

//   s2 = parse(s2)
  


//   // log(s1.polygons[0].shapes.length, s2.polygons[0].shapes.length)

//   // log(findEqualPolygonIndex(s1.polygons[0].shapes[5], s1.polygons[0].shapes))

//   let shapes1 = s1.polygons[0].shapes //sortBy(s1.polygons[0].shapes, v => v.box.xmin)
//   let shapes2 = s2.polygons[0].shapes //sortBy(s1.polygons[0].shapes, v => v.box.xmin)
      

//   log("!!!!!!!!!!!!!!!!!!")
//   let data = getPolygonsDiff(shapes1, shapes2)
//   log(data.map(d => Polygon.getPointArray([d]))) //JSON.stringify(d.box)).join("\n"))
//   // let int = getNonConsistencyIntervalsForPolygons(data)
//   // log(int)
//   // int = mergeIntervals(int, [{start:8, end:10}])
//   // log(int)


//   // log(
//   //       mergeIntervals( int, 
//   //           getNonConsistencyIntervalsForSegments(
//   //               getSegmentsDiff([s1.segments, s2.segments])
//   //           )
//   //       )    
//   // )


    
//     // let m = mergePolygons(shapes1, shapes2)

//     // shapes1.forEach((p,index) => {
//     //     log(Polygon.getPointArray([p]), Polygon.getPointArray([shapes2[index]]), Polygon.getPointArray([m[index]]))
//     // })
//     // 













// <svg viewBox = "-0.1 -0.1 1.2 1.2" xmlns="http://www.w3.org/2000/svg">                  
                                                                                        
// <path fill-rule="evenodd" fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  d="                                                                            
// M0.04610140931372192,0.5714285714285714 L0.2722043504901943,0 L0.6490425857843142,0.14285714285714285 L0.9505131740196089,0.7857142857142857 L0.8751455269607866,1 L0.6188955269607858,0.4285714285714286 L0.30235140931372273,0.3142857142857143 L0.14407935049019532,0.7428571428571429 L0.04610140931372192,0.5714285714285714 z" >                          
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  d="                                                                            
// M0,0.5714285714285714 L0.25000000000000067,0 L0.6666666666666694,0.14285714285714285 L1,0.7857142857142857 L0.9166666666666701,1 L0.6333333333333352,0.4285714285714286 L0.2833333333333321,0.3142857142857143 L0.108333333333336,0.7428571428571429 L0,0.5714285714285714 z" >                                                                                 
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  d="                                                                            
// M0.09929534313725952,0.5714285714285714 L0.29782475490196614,0 L0.6287071078431455,0.14285714285714285 L0.8934129901960912,0.7857142857142857 L0.8272365196078522,1 L0.6022365196078521,0.4285714285714286 L0.3242953431372596,0.3142857142857143 L0.1853247549019688,0.7428571428571429 L0.09929534313725952,0.5714285714285714 z" >                           
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  d="                                                                            
// M0.07092524509803477,0.5714285714285714 L0.28416053921568096,0 L0.6395526960784264,0.14285714285714285 L0.923866421568625,0.7857142857142857 L0.852787990196078,1 L0.611121323529411,0.4285714285714286 L0.3125919117647019,0.3142857142857143 L0.1633272058823501,0.7428571428571429 L0.07092524509803477,0.5714285714285714 z" >                              
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  d="                                                                            
// M0.170220588235297,0.5714285714285714 L0.3319852941176491,0 L0.6015931372549026,0.14285714285714285 L0.8172794117647109,0.7857142857142857 L0.7633578431372601,1 L0.5800245098039223,0.4285714285714286 L0.3535539215686294,0.3142857142857143 L0.24031862745098564,0.7428571428571429 L0.170220588235297,0.5714285714285714 z" >                               
// </path>                                                                                 
                                                                                        
// <circle cx="0.04610140931372192" cy="0.5714285714285714" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.2722043504901943" cy="0" r="0.003"                                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.6490425857843142" cy="0.14285714285714285" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.9505131740196089" cy="0.7857142857142857" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.8751455269607866" cy="1" r="0.003"                                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.6188955269607858" cy="0.4285714285714286" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.30235140931372273" cy="0.3142857142857143" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.14407935049019532" cy="0.7428571428571429" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0" cy="0.5714285714285714" r="0.003"                                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.25000000000000067" cy="0" r="0.003"                                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.6666666666666694" cy="0.14285714285714285" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="1" cy="0.7857142857142857" r="0.003"                                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.9166666666666701" cy="1" r="0.003"                                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.6333333333333352" cy="0.4285714285714286" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.2833333333333321" cy="0.3142857142857143" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.108333333333336" cy="0.7428571428571429" r="0.003"                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.09929534313725952" cy="0.5714285714285714" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.29782475490196614" cy="0" r="0.003"                                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.6287071078431455" cy="0.14285714285714285" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.8934129901960912" cy="0.7857142857142857" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.8272365196078522" cy="1" r="0.003"                                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.6022365196078521" cy="0.4285714285714286" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.3242953431372596" cy="0.3142857142857143" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.1853247549019688" cy="0.7428571428571429" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.07092524509803477" cy="0.5714285714285714" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.28416053921568096" cy="0" r="0.003"                                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.6395526960784264" cy="0.14285714285714285" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.923866421568625" cy="0.7857142857142857" r="0.003"                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.852787990196078" cy="1" r="0.003"                                         
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.611121323529411" cy="0.4285714285714286" r="0.003"                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.3125919117647019" cy="0.3142857142857143" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.1633272058823501" cy="0.7428571428571429" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.170220588235297" cy="0.5714285714285714" r="0.003"                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.3319852941176491" cy="0" r="0.003"                                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.6015931372549026" cy="0.14285714285714285" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.8172794117647109" cy="0.7857142857142857" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.7633578431372601" cy="1" r="0.003"                                        
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.5800245098039223" cy="0.4285714285714286" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.3535539215686294" cy="0.3142857142857143" r="0.003"                       
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <circle cx="0.24031862745098564" cy="0.7428571428571429" r="0.003"                      
//             fill="none" stroke="black" stroke-width="0.002" opacity="1" r="0.003"  />   
                                                                                        
// <path fill-rule="evenodd" fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  d="                                                                         
// M0.1123440709799256,0.6324049800808074 L0.07829547023000932,0.5684345824124553 L0.2735351245277378,0.04183874464424209 L0.3048714721455331,0.01732475495733704 L0.33762999048397546,0.019103915559710527 L0.6091017615258177,0.13226408785269256 L0.6443437427278,0.1614501237396732 L0.8721335906883058,0.6904677778132182 L0.9163705372105292,0.7879118283727977 L0.8948190029115564,0.9173502061259597 L0.8663188850067733,0.9322281141383437 L0.8292587049360209,0.9174281461536127 L0.8019849110336745,0.8326363996610102 L0.6149125019982977,0.44413885132028974 L0.5860707765284184,0.4202687561451872 L0.35832969205884696,0.329847648312717 L0.33049658271912785,0.3288029520667982 L0.30440598727644513,0.3496692239345907 L0.19097989564393647,0.6090728746376644 L0.17563657907279762,0.6771872856588583 L0.14502561118800816,0.6914858702659556 L0.11819254420368797,0.6820886334505561 L0.1123440709799256,0.6324049800808074 z" >                                                        
// </path>                                                                                 
                                                                                        
// <circle cx="0.1123440709799256" cy="0.6324049800808074" r="0.007"                       
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.07829547023000932" cy="0.5684345824124553" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.2735351245277378" cy="0.04183874464424209" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.3048714721455331" cy="0.01732475495733704" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.33762999048397546" cy="0.019103915559710527" r="0.007"                    
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.6091017615258177" cy="0.13226408785269256" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.6443437427278" cy="0.1614501237396732" r="0.007"                          
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.8721335906883058" cy="0.6904677778132182" r="0.007"                       
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.9163705372105292" cy="0.7879118283727977" r="0.007"                       
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.8948190029115564" cy="0.9173502061259597" r="0.007"                       
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.8663188850067733" cy="0.9322281141383437" r="0.007"                       
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.8292587049360209" cy="0.9174281461536127" r="0.007"                       
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.8019849110336745" cy="0.8326363996610102" r="0.007"                       
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.6149125019982977" cy="0.44413885132028974" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.5860707765284184" cy="0.4202687561451872" r="0.007"                       
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.35832969205884696" cy="0.329847648312717" r="0.007"                       
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.33049658271912785" cy="0.3288029520667982" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.30440598727644513" cy="0.3496692239345907" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.19097989564393647" cy="0.6090728746376644" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.17563657907279762" cy="0.6771872856588583" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.14502561118800816" cy="0.6914858702659556" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// <circle cx="0.11819254420368797" cy="0.6820886334505561" r="0.007"                      
//             fill="#ffff9920" stroke="red" stroke-width="0.007" opacity="1" r="0.007"  />                                                                                        
// </svg>


// <svg viewBox = "-0.8 -0.6 1.9 2" xmlns="http://www.w3.org/2000/svg">                  
                                                                                        
               
                                                                                        
// <path fill-rule="evenodd" fill="lightcyan" stroke-width="0.01" opacity="1" stroke="red"  d="                                                                               
// M0.45386574074076197,-0.43451040274857383 L0.4215822440087189,-0.5207100591715976 L0.4074045120869512,-0.49101928362578035 L0.3985974945533775,-0.5161290322580646 L0.3611228527249564,-0.43232965137024937 L0.34494485294117777,-0.48272571101355227 L0.1316904125558869,0.03830059876536029 L-0.1539962035038759,0.13516502242403294 L-0.3027505446623103,-0.26875357892727625 L-0.3162199685674126,-0.24512110649600782 L-0.32731481481481345,-0.2733346058408093 L-0.3642918834620099,-0.21257652035879004 L-0.37395833333333023,-0.2353502576827639 L-0.48229166666666623,-0.07043328879557167 L-0.23229166666666554,0.4792899408284024 L-0.21273976205891976,0.4728410591406406 L-0.2100873161764719,0.4792899408284024 L-0.1874485967609026,0.47103372583606995 L-0.18446691176470556,0.4792899408284024 L1.7684213324009848e-14,0.4026722656995553 L0.18437500000000315,0.34185913342240887 L0.5177083333333338,-0.276579499904562 L0.45386574074076197,-0.43451040274857383 z" >               
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="#ffff9920" stroke-width="0.01" opacity="1" stroke="red"  d="                                                                               
// M4.257519415444215e-15,0.11444386878629921 L-0.15799632352941206,0.17694216453521666 L-0.16029612445414892,0.17011920648402443 L-0.1799402573529435,0.17694216453521666 L-0.18198682195975718,0.17161094508156943 L-0.19895833333333413,0.17694216453521666 L-0.33941741281809545,-0.15397334462639137 L-0.38005579143703616,-0.07607024050363326 L-0.17370642701524974,0.2672265699560985 L-0.17389586704120577,0.27275013343250865 L-0.1531726579520697,0.3038747852643635 L-0.17765354770165975,0.3823140312801232 L-0.17947419216278793,0.435399144620161 L0.15776736646594022,0.31533736103396276 L0.41112132352941416,-0.276579499904562 L0.3792677238805995,-0.37580659405776795 L0.151041666666669,0.06699751861042184 L3.84160506820505e-16,0.11444386878630074 z" >                                           
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="lightcyan" stroke-width="0.002" opacity="0.3" stroke="black"  d="                                                                               
// M-0.4276824618736391,-0.10841763695361707 L-0.1531726579520697,0.3038747852643635 L-0.19606481481481297,0.441305592670357 L0.18996459694989548,0.3038747852643635 L0.4987881263616601,-0.31456384806260734 L0.4215822440087189,-0.5207100591715976 L0.15908224400871793,0.029013170452376454 L-0.16518246187363814,0.13895781637717128 L-0.32731481481481345,-0.2733346058408093 L-0.4276824618736391,-0.10841763695361707 z" >                         
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="lightcyan" stroke-width="0.002" opacity="0.3" stroke="black"  d="                                                                               
// M-0.3967456427015271,-0.10383661004008402 L-0.17370642701524974,0.2672265699560985 L-0.1798338779956433,0.4458866195838901 L0.1816857298474964,0.3084558121778965 L0.4709014161220054,-0.3099828211490743 L0.3985974945533775,-0.5161290322580646 L0.1527641612200436,0.0335941973659095 L-0.15091230936819322,0.14353884329070432 L-0.3027505446623103,-0.26875357892727625 L-0.3967456427015271,-0.10383661004008402 z" >                             
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="lightcyan" stroke-width="0.002" opacity="0.3" stroke="black"  d="                                                                               
// M-0.3829963235294149,-0.07043328879557167 L-0.18446691176470556,0.4792899408284024 L0.1464154411764739,0.34185913342240887 L0.41112132352941416,-0.276579499904562 L0.34494485294117777,-0.48272571101355227 L0.11994485294117768,0.06699751861042184 L-0.15799632352941206,0.17694216453521666 L-0.2969669117647056,-0.2353502576827639 L-0.3829963235294149,-0.07043328879557167 z" >                                                                 
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="lightcyan" stroke-width="0.002" opacity="0.3" stroke="black"  d="                                                                               
// M-0.4361902573529443,-0.07043328879557167 L-0.2100873161764719,0.4792899408284024 L0.16675091911764794,0.34185913342240887 L0.4682215073529427,-0.276579499904562 L0.3928538602941204,-0.48272571101355227 L0.13660386029411956,0.06699751861042184 L-0.1799402573529435,0.17694216453521666 L-0.3382123161764709,-0.2353502576827639 L-0.4361902573529443,-0.07043328879557167 z" >                                                                    
// </path>                                                                                 
                                                                                        
// <path fill-rule="evenodd" fill="lightcyan" stroke-width="0.002" opacity="0.3" stroke="black"  d="                                                                               
// M-0.48229166666666623,-0.07043328879557167 L-0.23229166666666554,0.4792899408284024 L0.18437500000000315,0.34185913342240887 L0.5177083333333338,-0.276579499904562 L0.43437500000000384,-0.48272571101355227 L0.151041666666669,0.06699751861042184 L-0.19895833333333413,0.17694216453521666 L-0.37395833333333023,-0.2353502576827639 L-0.48229166666666623,-0.07043328879557167 z" >                                                                
// </path>                                                                                 
// adjustFocus false                                                                       
// intrsct > [                                                                             
//   Point { x: -0.374461203795021, y: -0.08679497309413742 },                             
//   Point { x: -0.31199268856894957, y: -0.08936188183015835 }                            
// ]                                                                                       
// intrsct [ Point { x: -0.37446120379502096, y: -0.08679497309413742 } ]             


// <circle cx="-0.42518127042483833" cy="-0.08471082267608321" r="0.01"                    
//             fill="red" stroke-width="0.002" r="0.01" stroke="black"  />                 
                                                                                        
// <circle cx="-0.16343954248365972" cy="0.285550677610231" r="0.01"                       
//             fill="red" stroke-width="0.002" r="0.01" stroke="black"  />                 
                                                                                        
// <circle cx="-0.20054891748365986" cy="0.4650124069478909" r="0.01"                      
//             fill="red" stroke-width="0.002" r="0.01" stroke="black"  />                 
                                                                                        
// <circle cx="0.17383833741830337" cy="0.32758159954189736" r="0.01"                      
//             fill="red" stroke-width="0.002" r="0.01" stroke="black"  />                 
                                                                                        
// <circle cx="0.4733481413398713" cy="-0.2908570337850735" r="0.01"                       
//             fill="red" stroke-width="0.002" r="0.01" stroke="black"  />                 
                                                                                        
// <circle cx="0.3984706903594797" cy="-0.49700324489406383" r="0.01"                      
//             fill="red" stroke-width="0.002" r="0.01" stroke="black"  />                 
                                                                                        
// <circle cx="0.14388735702614555" cy="0.05271998472991031" r="0.01"                      
//             fill="red" stroke-width="0.002" r="0.01" stroke="black"  />                 
                                                                                        
// <circle cx="-0.17059793709150423" cy="0.16266463065470516" r="0.01"                     
//             fill="red" stroke-width="0.002" r="0.01" stroke="black"  />                 
                                                                                        
// <circle cx="-0.32784058415032613" cy="-0.24962779156327553" r="0.01"                    
//             fill="red" stroke-width="0.002" r="0.01" stroke="black"  />  
                                                                                        
// <line x1="-0.3432269461819853" y1="-0.08807842746214789" x2="-1" y2="-0.24624743064161309" stroke-width="0.002" stroke="black"  />                                              
                                                                                        
// <line x1="-0.3432269461819853" y1="-0.08807842746214789" x2="-1" y2="-0.2814603737237484" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="-0.3432269461819853" y1="-0.08807842746214789" x2="-1" y2="0.20332295671965941" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="-0.3432269461819853" y1="-0.08807842746214789" x2="-1" y2="0.03658205914399027" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="-0.3432269461819853" y1="-0.08807842746214789" x2="-1" y2="-0.004744195985616105" stroke-width="0.002" stroke="black"  />                                             
                                                                                        
// <circle cx="-0.4276824618736391" cy="-0.10841763695361707" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3947289657330958" cy="-0.1004815293354255" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3703804377466785" cy="-0.09461773456170437" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.4153833023432039" cy="-0.10545566128856006" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.4532889756814187" cy="-0.114584389289653" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.42534546940032086" cy="-0.11225761653175677" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3967456427015271" cy="-0.10383661004008402" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3697221129079732" cy="-0.095879732461206" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.41342710496210017" cy="-0.1087483426693172" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.4500408814760316" cy="-0.11952899714515271" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3979688921609906" cy="-0.06379016116018116" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3780000019627673" cy="-0.07265008957915246" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3829963235294149" cy="-0.07043328879557167" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.4279810137892037" cy="-0.050474185826154476" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.46562007344157164" cy="-0.033774240512867086" r="0.002"                  
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.4061840517182045" cy="-0.07612869327948797" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3827630266329731" cy="-0.0805741807533826" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3771505901769046" cy="-0.08163946358676358" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.4361902573529443" cy="-0.07043328879557167" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.4786284213912715" cy="-0.0623782047007926" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.40861617685523843" cy="-0.0797815564907832" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3841523947862584" cy="-0.0828856279289709" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.37595815130931387" cy="-0.08392534930412948" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.4324316824414559" cy="-0.07675974120205425" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.48229166666666623" cy="-0.07043328879557167" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
// adjustFocus true                                                                        
// ON BOUNDARY                                                                             
                                                                                        
// <line x1="-0.3488013776011686" y1="0.32423062100636496" x2="1" y2="0.18388323571302603" 
// stroke-width="0.002" stroke="black"  />                                                 
                                                                                        
// <line x1="-0.3488013776011686" y1="0.32423062100636496" x2="1" y2="-0.11488622575683358" stroke-width="0.002" stroke="black"  />                                                
                                                                                        
// <circle cx="-0.1531726579520697" cy="0.3038747852643635" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.17504138271766634" cy="0.3061503006897775" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.244389328474742" cy="0.3133661910529528" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.27693923594706676" cy="0.31675311998195915" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.304886737840042" cy="0.3196611529075598" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1768846164124451" cy="0.26826126381813675" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.17370642701524974" cy="0.2672265699560985" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.25186315708086393" cy="0.2926713370134785" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.28271320052699994" cy="0.3027149016372541" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3087400138267615" cy="0.311188211627352" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
// adjustFocus false                                                                       
// intrsct > [ Point { x: -0.17304901145200224, y: 0.43311170810392247 } ]                 
                                                                                        
// <line x1="-0.05725183823204525" y1="0.298783585468878" x2="-0.7402196103050087" y2="1" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="-0.05725183823204525" y1="0.298783585468878" x2="-0.6415806314895438" y2="1" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="-0.05725183823204525" y1="0.298783585468878" x2="-0.5514466135861319" y2="1" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="-0.05725183823204525" y1="0.298783585468878" x2="-0.6509746777624507" y2="1" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="-0.05725183823204525" y1="0.298783585468878" x2="-0.737232333381912" y2="1" stroke-width="0.002" stroke="black"  />                                                   
                                                                                        
// <circle cx="-0.19606481481481297" cy="0.441305592670357" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.17907862755973708" cy="0.42386554086907513" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.19761131116840955" cy="0.4428934108259092" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.21690832908732033" cy="0.4627060378187914" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.23253643519204995" cy="0.4787517210512641" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.167560061133561" cy="0.4311575801253668" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1798338779956433" cy="0.4458866195838901" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1914821325734884" cy="0.4598649608959583" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.20661337005680025" cy="0.47802301201015557" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.19833640374146322" cy="0.46809034274961847" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.14484559212818862" cy="0.42307097397549803" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.15400549306273023" cy="0.4360680213161492" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.18446691176470556" cy="0.4792899408284024" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1756037854480489" cy="0.466713989063535" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.16998282606008897" cy="0.458738370572979" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.17009867828790345" cy="0.4320613563522121" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1797506823188773" cy="0.44346085660555007" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.19212736216183335" cy="0.45807833547859045" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.2100873161764719" cy="0.4792899408284024" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.2014834517908268" cy="0.4691283460001052" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.19513752319827393" cy="0.4409754664372827" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.17909816485004187" cy="0.4244351958963633" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.19744471483882198" cy="0.44335471210882904" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.21670034774595912" cy="0.4632117020710107" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.23229166666666554" cy="0.4792899408284024" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
// adjustFocus false                                                                       
// intrsct > [ Point { x: 0.15936746116694842, y: 0.31159902182030735 } ]                  
                                                                                        
// <line x1="0.04693653652670962" y1="0.18742298989517803" x2="1" y2="0.9633962576152174" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="0.04693653652670962" y1="0.18742298989517803" x2="0.9516010280055267" y2="1" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="0.04693653652670962" y1="0.18742298989517803" x2="0.5703520341077865" y2="1" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="0.04693653652670962" y1="0.18742298989517803" x2="0.6773486314527476" y2="1" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="0.04693653652670962" y1="0.18742298989517803" x2="0.7700790158184039" y2="1" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <circle cx="0.18996459694989548" cy="0.3038747852643635" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.18552028138994292" cy="0.3002562748503064" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.1697264343651774" cy="0.2873971069613034" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.1866018274017744" cy="0.3011368571254174" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.20030879437481508" cy="0.31229691137179355" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.18038320076027578" cy="0.30728586994932716" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.1816857298474964" cy="0.3084558121778965" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.16653686347972213" cy="0.2948489770964383" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.18262346530200096" cy="0.30929809379618467" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.19562886829918386" cy="0.3209796526306475" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.13463613695233972" cy="0.32357233860682477" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.13606905873763725" cy="0.32579687973216803" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.1464154411764739" cy="0.34185913342240887" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.15028381484640135" cy="0.34786459471502373" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.15306711716506402" cy="0.3521855357012359" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.14868374095796602" cy="0.31857123376409424" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.15013973010723497" cy="0.3204479479311929" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.1536456722895041" cy="0.3249669729292822" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.16675091911764794" cy="0.34185913342240887" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.17034187282637359" cy="0.34648773501737584" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.16004930723512686" cy="0.3145249644838442" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.161482908402678" cy="0.31613586604718824" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.15874325010150103" cy="0.3130573809424828" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.1729881571700142" cy="0.3290640246211823" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.18437500000000315" cy="0.34185913342240887" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
// adjustFocus false                                                                       
// intrsct > [ Point { x: 0.4054183133362389, y: -0.2943449372690627 } ]                   
                                                                                        
// <line x1="0.3441201815502482" y1="-0.2974923317745655" x2="1" y2="-0.3698852443287169" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="0.3441201815502482" y1="-0.2974923317745655" x2="1" y2="-0.36210962258241447" 
// stroke-width="0.002" stroke="black"  />                                                 
                                                                                        
// <line x1="0.3441201815502482" y1="-0.2974923317745655" x2="1" y2="-0.09277486032559847" 
// stroke-width="0.002" stroke="black"  />                                                 
                                                                                        
// <line x1="0.3441201815502482" y1="-0.2974923317745655" x2="1" y2="-0.1869672887788501" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="0.3441201815502482" y1="-0.2974923317745655" x2="1" y2="-0.21847596902586885" 
// stroke-width="0.002" stroke="black"  />                                                 
                                                                                        
// <circle cx="0.4987881263616601" cy="-0.31456384806260734" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4703938919759029" cy="-0.31142982675396463" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4023449065394098" cy="-0.30391890156076906" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.45605860688637906" cy="-0.3098475657806394" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.5022011126579904" cy="-0.3149405573492" r="0.002"                         
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.497825108415721" cy="-0.3126353437692642" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4709014161220054" cy="-0.3099828211490743" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.40255970146123077" cy="-0.3032497942646975" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4565269151773474" cy="-0.30856664507286247" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.5029296855732747" cy="-0.3131382467971701" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4705564888301744" cy="-0.25802820984614533" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4496554694010301" cy="-0.2645519718645493" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.41112132352941416" cy="-0.276579499904562" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4606808964337919" cy="-0.2611106439256487" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.5023590764313417" cy="-0.24810177952140428" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4789199920847096" cy="-0.2747766536334839" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4562255565623145" cy="-0.2786009875911971" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4078557829460658" cy="-0.2867519798282582" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4682215073529427" cy="-0.276579499904562" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.5135878137730213" cy="-0.26893463444813215" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.48197025768016855" cy="-0.2808850032457464" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4586098177349345" cy="-0.28369932523699876" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.40683332450172355" cy="-0.2899370383912788" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.46594140269214823" cy="-0.2828160610166248" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.5177083333333338" cy="-0.276579499904562" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
// adjustFocus false                                                                       
// intrsct > [                                                                             
//   Point { x: 0.3866216754805988, y: -0.2193403908918687 },                              
//   Point { x: 0.3916523878156, y: -0.33722714847288426 }                                 
// ]                                                                                       
// intrsct [ Point { x: 0.39165238781559997, y: -0.3372271484728844 } ]                    
                                                                                        
// <line x1="0.38913703164809943" y1="-0.27828376968237645" x2="0.4857281909901732" y2="-1" stroke-width="0.002" stroke="black"  />                                                
                                                                                        
// <line x1="0.38913703164809943" y1="-0.27828376968237645" x2="0.41784380323193215" y2="-1" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="0.38913703164809943" y1="-0.27828376968237645" x2="0.23313082070033325" y2="-1" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="0.38913703164809943" y1="-0.27828376968237645" x2="0.40225809448714495" y2="-1" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="0.38913703164809943" y1="-0.27828376968237645" x2="0.5488350651023811" y2="-1" stroke-width="0.002" stroke="black"  />                                                
                                                                                        
// <circle cx="0.4215822440087189" cy="-0.5207100591715976" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.41479030495157637" cy="-0.4699615984816469" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.395444690443877" cy="-0.3254137529978932" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.41016247238344883" cy="-0.43538305218030615" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4102285504092816" cy="-0.43587677835603134" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.39670771906427926" cy="-0.4686182336941904" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.3985974945533775" cy="-0.5161290322580646" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.3915003805645171" cy="-0.3377006660025035" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.3968356551920932" cy="-0.47183467270119034" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.39416579681747244" cy="-0.40471182971670194" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.3631742278737201" cy="-0.39839294196908104" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.357560431220644" cy="-0.4243634987412358" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.34494485294117777" cy="-0.48272571101355227" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.3601228638121599" cy="-0.412509168204287" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.37136911858390864" cy="-0.36048172295227887" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.3924346942823443" cy="-0.45966973470985284" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.3932434814481809" cy="-0.5041565900520804" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.3902860256833746" cy="-0.3414835008298071" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.3928538602941204" cy="-0.48272571101355227" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.39133571256547073" cy="-0.39922090128687243" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4349072619111315" cy="-0.4851311386304846" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.4250671576761451" cy="-0.44066119256543207" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.39788419761276456" cy="-0.3178144483603203" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.41871995411926877" cy="-0.41197655741343575" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.43437500000000384" cy="-0.48272571101355227" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
// adjustFocus true                                                                        
                                                                                        
// <line x1="0.03131134054394671" y1="-0.07138985382456257" x2="1" y2="0.6898106100899609" 
// stroke-width="0.002" stroke="black"  />                                                 
                                                                                        
// <line x1="0.03131134054394671" y1="-0.07138985382456257" x2="1" y2="0.7659464817652045" 
// stroke-width="0.002" stroke="black"  />                                                 
                                                                                        
// <line x1="0.03131134054394671" y1="-0.07138985382456257" x2="0.7175086735834215" y2="1" 
// stroke-width="0.002" stroke="black"  />                                                 
                                                                                        
// <line x1="0.03131134054394671" y1="-0.07138985382456257" x2="0.846482084514509" y2="1" stroke-width="0.002" stroke="black"  />                                                  
                                                                                        
// <line x1="0.03131134054394671" y1="-0.07138985382456257" x2="0.9582590406547835" y2="1" 
// stroke-width="0.002" stroke="black"  />                                                 
                                                                                        
// <circle cx="0.15908224400871793" cy="0.029013170452376454" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.15592296714930934" cy="0.02653059466547024" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.14123264949387215" cy="0.014986868510309434" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.15558943327115538" cy="0.02626850205160134" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.16729353684878856" cy="0.0354656460317949" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.1507376477447759" cy="0.031842475230175235" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.1527641612200436" cy="0.0335941973659095" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.13862065726566436" cy="0.021368525414501065" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.15234393205916888" cy="0.03323095047307153" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.16348273830879723" cy="0.042859355964207896" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.10693997793961876" cy="0.04669243950845254" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.10875562164760176" cy="0.04952728329642962" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.11994485294117768" cy="0.06699751861042184" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.12297635400654373" cy="0.07173073357193305" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.1251533392788879" cy="0.07512975571966393" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.11823965075561185" cy="0.04286119144388176" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.12016790356535283" cy="0.04539552000172777" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.12577186429481713" cy="0.05276088083096303" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.13660386029411956" cy="0.06699751861042184" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.13938892461158506" cy="0.07065796603699086" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.12745580572028545" cy="0.039736377438540416" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.12944582455927778" cy="0.04203649209739462" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.12993154194969764" cy="0.042597896677027056" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.14165903939512145" cy="0.056152838096352166" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="0.151041666666669" cy="0.06699751861042184" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
// adjustFocus true                                                                        
                                                                                        
// <line x1="-0.05904926121232726" y1="-0.07734955302068025" x2="-0.587660730213222" y2="1" stroke-width="0.002" stroke="black"  />                                                
                                                                                        
// <line x1="-0.05904926121232726" y1="-0.07734955302068025" x2="-0.5070973050322668" y2="1" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="-0.05904926121232726" y1="-0.07734955302068025" x2="-0.4782551023801129" y2="1" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="-0.05904926121232726" y1="-0.07734955302068025" x2="-0.5712242620661742" y2="1" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="-0.05904926121232726" y1="-0.07734955302068025" x2="-0.65179753379408" y2="1" 
// stroke-width="0.002" stroke="black"  />                                                 
                                                                                        
// <circle cx="-0.16518246187363814" cy="0.13895781637717128" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.15799451550764357" cy="0.12430824621332795" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.16851220182052343" cy="0.145744074439699" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.18164320855004065" cy="0.17250604435589273" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.18106138222150128" cy="0.17132023895486295" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.14635190111369858" cy="0.13257315810952744" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.15091230936819322" cy="0.14353884329070432" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.16104391395960183" cy="0.1679006942763164" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.16224857357250919" cy="0.1707973467969764" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.15967169985085458" cy="0.1646011502271928" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.13987784141294" cy="0.13037807431353107" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.14402914271674896" cy="0.14104682499614074" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.15799632352941206" cy="0.17694216453521666" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.15456719819176076" cy="0.16812938979076394" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.15229235523044862" cy="0.16228309470877114" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.16124823674290845" cy="0.13762388461975258" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.15665155108542017" cy="0.1279548511249204" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1671001559596422" cy="0.1499332760229857" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1799402573529435" cy="0.17694216453521666" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1766015613326775" cy="0.169919286301978" r="0.002"                       
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1705499773784914" cy="0.12530856051525557" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.16280819174456487" cy="0.11123747894809281" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.17355770928068143" cy="0.13077526327984862" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.1877562488849422" cy="0.15658181726535525" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.19895833333333413" cy="0.17694216453521666" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
// adjustFocus false                                                                       
// intrsct > [                                                                             
//   Point { x: -0.34716003105291104, y: -0.021342620434814386 },                          
//   Point { x: -0.3365144743852942, y: -0.1471341473806237 }                              
// ]                                                                                       
// intrsct [ Point { x: -0.33651447438529414, y: -0.14713414738062364 } ]                  
                                                                                        
// <line x1="-0.3418372527191026" y1="-0.08423838390771904" x2="-0.2715074964242499" y2="-1" stroke-width="0.002" stroke="black"  />                                               
                                                                                        
// <line x1="-0.3418372527191026" y1="-0.08423838390771904" x2="-0.14784722965340652" y2="-1" stroke-width="0.002" stroke="black"  />                                              
                                                                                        
// <line x1="-0.3418372527191026" y1="-0.08423838390771904" x2="-0.06991596076172565" y2="-1" stroke-width="0.002" stroke="black"  />                                              
                                                                                        
// <line x1="-0.3418372527191026" y1="-0.08423838390771904" x2="-0.31986956968015023" y2="-1" stroke-width="0.002" stroke="black"  />                                              
                                                                                        
// <line x1="-0.3418372527191026" y1="-0.08423838390771904" x2="-0.536496030742761" y2="-1" stroke-width="0.002" stroke="black"  />                                                
                                                                                        
// <circle cx="-0.32731481481481345" cy="-0.2733346058408093" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.33154682607461033" cy="-0.21822971603649308" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3359748383188115" cy="-0.16057270337991883" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.33156236403818934" cy="-0.2180273966856579" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3369314609204105" cy="-0.1481165496011688" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.31071964637685384" cy="-0.23113413154753765" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3027505446623103" cy="-0.26875357892727625" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.31861913594813385" cy="-0.19384329966980945" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.31992039001839345" cy="-0.1877005171107084" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3311773618515529" cy="-0.13456014135670258" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3035970206946638" cy="-0.21302174039431973" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.2940574025800735" cy="-0.24514874317014385" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.2969669117647056" cy="-0.2353502576827639" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3149558517134379" cy="-0.17476809215737982" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.32865767059714635" cy="-0.12862385786801264" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3377109044029323" cy="-0.2562524918987799" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3389339217943263" cy="-0.20526885466830952" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3402004278017939" cy="-0.15247231776760065" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3382123161764709" cy="-0.2353502576827639" r="0.002"                     
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.34012446119006445" cy="-0.15563911997441643" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.36786829681483274" cy="-0.20670001267011698" r="0.002"                   
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3597869329389462" cy="-0.16868167659327074" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.35166838834065994" cy="-0.1304884258335219" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.3645389267948862" cy="-0.191037172797235" r="0.002"                      
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
// <circle cx="-0.37395833333333023" cy="-0.2353502576827639" r="0.002"                    
//             fill="red" stroke-width="0.002" r="0.002" stroke="black"  />                
                                                                                        
                                                                                    
// </svg> 
// </svg> 


