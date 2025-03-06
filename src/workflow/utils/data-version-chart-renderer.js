const {
    sortBy,
    find,
    findIndex,
    last,
    first,
    take,
    flattenDeep,
    flatten,
    uniqBy,
    max
} = require("lodash")

const moment = require("moment")

const log = require("./logger")(__filename) //(path.basename(__filename))

const processBuf = (buf, links, level) => {
    let p = links.map(d => ({ id: d, level: [level] }))
    p.forEach(d => {
        let i = findIndex(buf, b => b.id == d.id)
        if (i >= 0) {
            buf[i].level = buf[i].level.concat(d.level) //?.push()  = Math.round(Math.max(d.level, buf[i].level || 0))
        } else {
            buf.push(d)
        }
    })
    return buf
}


const processLevels = (pool, currentNode, level) => {

    currentNode.level = currentNode.level || []
    currentNode.level.push(level)

    let nextNodes = []

    if (currentNode.branch) nextNodes = nextNodes.concat(currentNode.branch.map(id => find(pool, p => p.id == id)))
    if (currentNode.submit) nextNodes = nextNodes.concat([currentNode.submit].map(id => find(pool, p => p.id == id)))
    if (currentNode.save) nextNodes = nextNodes.concat([currentNode.save].map(id => find(pool, p => p.id == id)))
    if (currentNode.merge) nextNodes = nextNodes.concat([currentNode.merge].map(id => find(pool, p => p.id == id)))
    if (currentNode.commit) nextNodes = nextNodes.concat([currentNode.commit].map(id => find(pool, p => p.id == id)))

    nextNodes.forEach(n => {
        processLevels(pool, n, level + 1)
    })

}

const prepareData = data => {

    let result = JSON.parse(JSON.stringify(data))

    result = result.map(d => ({
        id: d.id,
        type: d.type,
        head: d.head,
        user: d.user,
        createdAt: d.createdAt,
        log: last(d.log),
        prev: d.prev,
        commit: d.commit,
        branch: d.branch,
        save: d.save,
        submit: d.submit,
        merge: d.merge,
        commit: d.commit
    }))

    let users = ["main"].concat(
        sortBy(uniqBy(
            result.map(d => d.user).filter(d => d)
        ))
    )

    result = sortBy(result, d => d.createdAt)

    let start = first(result)
    if (start) {
        processLevels(result, start, 1)
    } else {
        result = []
    }

    result.forEach(n => {
        if (n.level) {
            n.level = max(n.level)
        }
    })

    // let buf = (start) ? [{ id: start.id, level: [1] }] : []
    // let index = 0

    // while (index < buf.length) {
    //     let current = (max(flatten(buf.map(d => d.level))) || 0)
    //     let n = buf[index]
    //     let f = find(result, d => d.id == n.id)
    //     if (f) {
    //         if (f.branch) buf = processBuf(buf, f.branch, max(n.level) + 1)
    //         if (f.submit) buf = processBuf(buf, [f.submit], max(n.level) + 1)
    //         if (f.save) buf = processBuf(buf, [f.save], max(n.level) + 1)
    //         if (f.merge) buf = processBuf(buf, [f.merge], max(n.level) + 1)
    //         if (f.commit) buf = processBuf(buf, [f.commit], max(n.level) + 1)
    //     }
    //     index++
    // }

    // console.log("buf", buf)

    // buf.forEach(b => {
    //     let f = find(result, r => r.id == b.id)
    //     console.log(f)
    //     if (f) f.level = max(b.level)
    // })

    let links = []
    result.forEach(d => {
        if (d.branch) {
            links = links.concat(d.branch.map(b => {
                let f = find(result, dd => dd.id == b)
                return {
                    user: d.user,
                    id: d.id,
                    createdAt: d.createdAt,
                    log: d.log,
                    value: [
                        findIndex(users, u => (d.user || "main") == u), d.level, d.type,
                        findIndex(users, u => (f.user || "main") == u), f.level, f.type
                    ]
                }
            }))
        }
        if (d.submit) {
            links = links.concat([d.submit].map(b => {
                let f = find(result, dd => dd.id == b)
                return {
                    user: d.user,
                    id: d.id,
                    createdAt: d.createdAt,
                    log: d.log,
                    value: [
                        findIndex(users, u => (d.user || "main") == u), d.level, d.type,
                        findIndex(users, u => (f.user || "main") == u), f.level, f.type
                    ]
                }
            }))
        }
        if (d.save) {
            links = links.concat([d.save].map(b => {
                let f = find(result, dd => dd.id == b)
                return {
                    user: d.user,
                    id: d.id,
                    createdAt: d.createdAt,
                    log: d.log,
                    value: [
                        findIndex(users, u => (d.user || "main") == u), d.level, d.type,
                        findIndex(users, u => (f.user || "main") == u), f.level, f.type
                    ]
                }
            }))
        }
        if (d.merge) {
            links = links.concat([d.merge].map(b => {
                let f = find(result, dd => dd.id == b)
                return {
                    user: d.user,
                    id: d.id,
                    createdAt: d.createdAt,
                    log: d.log,
                    value: [
                        findIndex(users, u => (d.user || "main") == u), d.level, d.type,
                        findIndex(users, u => (f.user || "main") == u), f.level, f.type
                    ]
                }
            }))
        }
        if (d.commit) {
            links = links.concat([d.commit].map(b => {
                let f = find(result, dd => dd.id == b)
                return {
                    user: d.user,
                    id: d.id,
                    createdAt: d.createdAt,
                    log: d.log,
                    value: [
                        findIndex(users, u => (d.user || "main") == u), d.level, d.type,
                        findIndex(users, u => (f.user || "main") == u), f.level, f.type
                    ]
                }
            }))
        }

        if (!d.branch && !d.submit && !d.save && !d.merge && !d.commit) {
            links = links.concat([{
                user: d.user,
                id: d.id,
                createdAt: d.createdAt,
                log: d.log,
                value: [
                    findIndex(users, u => (d.user || "main") == u), d.level, d.type,
                    null, null, null
                ]
            }])
        }
    })

    return {
        users,
        links
    }
}


// const renderItem = (params, api) => {

//     const color = {
//         branch: "#FF5722",
//         save: "#FF9800",
//         submit: "#689F38",
//         merge: "#5c6bc0",
//         main: "#c62828"
//     }


//     const height = api.size([0, 1])[1] * 0.6;
//     const outerRadius = 0.50 * height
//     const innerRadius = 0.25 * height

//     let source = {
//         userIndex: api.value(0),
//         level: api.value(1),
//         type: api.value(2),
//     }

//     let coord = api.coord([source.level, source.userIndex])
//     source.cx = coord[0]
//     source.cy = coord[1]

//     let target = {
//         userIndex: api.value(3),
//         level: api.value(4),
//         type: api.value(5),
//     }

//     coord = api.coord([target.level, target.userIndex])
//     target.cx = coord[0]
//     target.cy = coord[1] //  - height / 2

//     const renderLink = (source, target) => {
//         // h-h
//         if (source.cy == target.cy) {
//             return [{
//                 type: "line",
//                 silent: true,
//                 shape: {
//                     x1: source.cx + outerRadius,
//                     y1: source.cy,
//                     x2: target.cx - outerRadius,
//                     y2: target.cy,
//                 },
//                 style: {
//                     lineWidth: innerRadius,
//                     stroke: "#9e9e9e",
//                     fill: "transparent"
//                 }
//             }]
//         }
//         // v-v
//         if (source.cx == target.cx) {
//             return [{
//                 type: "line",
//                 silent: true,
//                 shape: {
//                     x1: source.cx,
//                     y1: source.cy + outerRadius,
//                     x2: target.cx,
//                     y2: target.cy - outerRadius,
//                 },
//                 style: {
//                     lineWidth: innerRadius,
//                     stroke: "#9e9e9e",
//                     fill: "transparent"
//                 }
//             }]
//         }

//         // v-h
//         if (
//             (source.type == "main" && target.type == "branch") ||
//             (source.type == "branch" && target.type == "branch")
//         ) {
//             return [{
//                     type: "line",
//                     silent: true,
//                     shape: {
//                         x1: source.cx,
//                         y1: source.cy + outerRadius,
//                         x2: source.cx,
//                         y2: target.cy + 2 * outerRadius,
//                     },
//                     style: {
//                         lineWidth: innerRadius,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 },
//                 {
//                     type: "line",
//                     silent: true,
//                     shape: {
//                         x1: source.cx + 2 * outerRadius,
//                         y1: target.cy,
//                         x2: target.cx - outerRadius,
//                         y2: target.cy,
//                     },
//                     style: {
//                         lineWidth: innerRadius,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 },
//                 {
//                     type: "arc",
//                     silent: true,
//                     shape: {
//                         cx: source.cx + 2 * outerRadius,
//                         cy: target.cy + 2 * outerRadius,
//                         r: 2 * outerRadius,
//                         startAngle: Math.PI,
//                         endAngle: Math.PI * 3 / 2
//                     },
//                     style: {
//                         lineWidth: innerRadius,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 }
//             ]
//         }

//         // h-v
//         if (
//             (source.type == "submit" && target.type == "merge") ||
//             (source.type == "submit" && target.type == "branch") ||
//             (source.type == "merge" && target.type == "branch")
//         ) {
//             return [{
//                     type: "line",
//                     silent: true,
//                     shape: {
//                         x1: source.cx + outerRadius,
//                         y1: source.cy,
//                         x2: target.cx - 2 * outerRadius,
//                         y2: source.cy,
//                     },
//                     style: {
//                         lineWidth: innerRadius,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 },
//                 {
//                     type: "line",
//                     silent: true,
//                     shape: {
//                         x1: target.cx,
//                         y1: source.cy + ((source.userIndex < target.userIndex) ? -2 * outerRadius : 2 * outerRadius),
//                         x2: target.cx,
//                         y2: target.cy + ((source.userIndex < target.userIndex) ? outerRadius : -outerRadius),
//                     },
//                     style: {
//                         lineWidth: innerRadius,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 },
//                 {
//                     type: "arc",
//                     silent: true,
//                     shape: {
//                         cx: target.cx - 2 * outerRadius,
//                         cy: source.cy + ((source.userIndex < target.userIndex) ? -2 * outerRadius : 2 * outerRadius),
//                         r: 2 * outerRadius,
//                         startAngle: ((source.userIndex < target.userIndex) ? 0 : 3 * Math.PI / 2),
//                         endAngle: ((source.userIndex < target.userIndex) ? Math.PI / 2 : 0)
//                     },
//                     style: {
//                         lineWidth: innerRadius,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 }
//             ]
//         }

//         return []

//     }

//     const renderNode = source => {
//         return [{
//                 type: 'circle',
//                 shape: {
//                     cx: source.cx,
//                     cy: source.cy,
//                     r: outerRadius
//                 },
//                 style: {
//                     fill: color[source.type]
//                 }
//             },
//             {
//                 type: 'circle',
//                 shape: {
//                     cx: source.cx,
//                     cy: source.cy,
//                     r: innerRadius
//                 },
//                 style: {
//                     fill: "white"
//                 }
//             },
//         ]
//     }

//     return {
//         type: "group",
//         children: renderLink(source, target).concat(renderNode(source)),
//     }


// }

// const renderItem = (params, api) => {

//     const color = {
//         branch: "#FF5722",
//         save: "#FF9800",
//         submit: "#689F38",
//         merge: "#5c6bc0",
//         main: "#c62828"
//     }


//     const height = api.size([0, 1])[1] * 0.6;
//     const outerRadius = 0.40 * height
//     const innerRadius = 0.30 * height

//     let source = {
//         userIndex: api.value(0),
//         level: api.value(1),
//         type: api.value(2),
//     }

//     let coord = api.coord([source.level, source.userIndex])
//     source.cx = coord[0]
//     source.cy = coord[1]

//     let target = {
//         userIndex: api.value(3),
//         level: api.value(4),
//         type: api.value(5),
//     }

//     coord = api.coord([target.level, target.userIndex])
//     target.cx = coord[0]
//     target.cy = coord[1] //  - height / 2

//     const distance = target.cx - source.cx

//     const renderLink = (source, target) => {
//         // h-h
//         if (source.cy == target.cy) {
//             return [{
//                 type: "line",
//                 silent: true,
//                 shape: {
//                     x1: source.cx + outerRadius,
//                     y1: source.cy,
//                     x2: target.cx - outerRadius,
//                     y2: target.cy,
//                 },
//                 style: {
//                     lineWidth: innerRadius / 2,
//                     stroke: "#9e9e9e",
//                     fill: "transparent"
//                 }
//             }]
//         }
//         // v-v
//         if (source.cx == target.cx) {
//             return [{
//                 type: "line",
//                 silent: true,
//                 shape: {
//                     x1: source.cx,
//                     y1: source.cy + outerRadius,
//                     x2: target.cx,
//                     y2: target.cy - outerRadius,
//                 },
//                 style: {
//                     lineWidth: innerRadius / 2,
//                     stroke: "#9e9e9e",
//                     fill: "transparent"
//                 }
//             }]
//         }

//         // v-h
//         if (
//             (source.type == "main" && target.type == "branch") ||
//             (source.type == "branch" && target.type == "branch") ||
//             (source.type == "submit" && target.type == "merge") ||
//             (source.type == "submit" && target.type == "branch") ||
//             (source.type == "merge" && target.type == "branch")
//         ) {
//             return [{
//                     type: "line",
//                     silent: true,
//                     shape: {
//                         x1: source.cx,
//                         y1: source.cy,
//                         x2: source.cx + distance / 4,
//                         y2: source.cy,
//                     },
//                     style: {
//                         lineWidth: innerRadius / 2,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 },
//                 {
//                     type: "line",
//                     silent: true,
//                     shape: {
//                         x1: source.cx + distance / 2,
//                         y1: source.cy + Math.sign(target.cy - source.cy) * distance / 4,
//                         x2: source.cx + distance / 2,
//                         y2: target.cy - Math.sign(target.cy - source.cy) * distance / 4,
//                     },
//                     style: {
//                         lineWidth: innerRadius / 2,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 },
//                 {
//                     type: "line",
//                     silent: true,
//                     shape: {
//                         x1: target.cx - distance / 4,
//                         y1: target.cy,
//                         x2: target.cx,
//                         y2: target.cy,
//                     },
//                     style: {
//                         lineWidth: innerRadius / 2,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 },

//                 {
//                     type: "arc",
//                     silent: true,
//                     shape: {
//                         cx: target.cx - distance / 4,
//                         cy: target.cy - Math.sign(target.cy - source.cy) * distance / 4,
//                         r: distance / 4,
//                         startAngle: (Math.sign(target.cy - source.cy) == -1) ? Math.PI : Math.PI / 2,
//                         endAngle: (Math.sign(target.cy - source.cy) == -1) ? Math.PI * 3 / 2 : Math.PI
//                     },
//                     style: {
//                         lineWidth: innerRadius / 2,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 },
//                 {
//                     type: "arc",
//                     silent: true,
//                     shape: {
//                         cx: source.cx + distance / 4,
//                         cy: source.cy + Math.sign(target.cy - source.cy) * distance / 4,
//                         r: distance / 4,
//                         startAngle: (Math.sign(target.cy - source.cy) == -1) ? 0 : Math.PI * 3 / 2,
//                         endAngle: (Math.sign(target.cy - source.cy) == -1) ? Math.PI / 2 : 0
//                     },
//                     style: {
//                         lineWidth: innerRadius / 2,
//                         stroke: "#9e9e9e",
//                         fill: "transparent"
//                     }
//                 }
//             ]
//         }

//         return []
//     }

//     const renderNode = source => {
//         return [{
//                 type: 'circle',
//                 shape: {
//                     cx: source.cx,
//                     cy: source.cy,
//                     r: outerRadius
//                 },
//                 style: {
//                     fill: color[source.type]
//                 }
//             },
//             {
//                 type: 'circle',
//                 shape: {
//                     cx: source.cx,
//                     cy: source.cy,
//                     r: innerRadius
//                 },
//                 style: {
//                     fill: "white"
//                 }
//             },
//         ]
//     }

//     return {
//         type: "group",
//         children: renderLink(source, target).concat(renderNode(source)),
//     }


// }

const renderItem = (params, api) => {

    const color = {
        branch: "#FF5722",
        save: "#FF9800",
        submit: "#689F38",
        merge: "#5c6bc0",
        main: "#c62828"
    }


    const height = api.size([0, 1])[1] * 0.60;
    const outerRadius = 0.50 * height
    const innerRadius = 0.35 * height
    const distance = height
    const lineWidth = outerRadius - innerRadius
    const stroke = "#8e8e8e"
    const fill = "transparent"
    
    let source = {
        userIndex: api.value(0),
        level: api.value(1),
        type: api.value(2),
    }

    let coord = api.coord([source.level, source.userIndex])
    source.cx = coord[0]
    source.cy = coord[1]

    let target = {
        userIndex: api.value(3),
        level: api.value(4),
        type: api.value(5),
    }

    coord = api.coord([target.level, target.userIndex])
    target.cx = coord[0]
    target.cy = coord[1] //  - height / 2

    const renderLink = (source, target) => {
        // h-h
        if (source.cy == target.cy) {
            return [{
                type: "line",
                silent: true,
                shape: {
                    x1: source.cx + outerRadius,
                    y1: source.cy,
                    x2: target.cx - outerRadius,
                    y2: target.cy,
                },
                style: {
                    lineWidth,
                    stroke,
                    fill
                }
            }]
        }
        // v-v
        if (source.cx == target.cx) {
            return [{
                type: "line",
                silent: true,
                shape: {
                    x1: source.cx,
                    y1: source.cy + outerRadius,
                    x2: target.cx,
                    y2: target.cy - outerRadius,
                },
                style: {
                    lineWidth,
                    stroke,
                    fill
                }
            }]
        }

        // v-h
        if (
            (source.type == "main" && target.type == "branch") ||
            (source.type == "branch" && target.type == "branch") ||
            (source.type == "submit" && target.type == "merge") ||
            (source.type == "submit" && target.type == "branch") ||
            (source.type == "merge" && target.type == "branch")
        ) {
            return [
                {
                    type: "line",
                    silent: true,
                    shape: {
                        x1: source.cx + outerRadius,
                        y1: source.cy,
                        x2: target.cx - outerRadius - distance * 3 / 4,
                        y2: source.cy,
                    },
                    style: {
                        lineWidth,
                        stroke,
                        fill
                    }
                },
                {
                    type: "line",
                    silent: true,
                    shape: {
                        x1: target.cx - outerRadius - distance / 2,
                        y1: source.cy + Math.sign(target.cy - source.cy) * distance / 4,
                        x2: target.cx - outerRadius - distance / 2,
                        y2: target.cy - Math.sign(target.cy - source.cy) * distance / 4,
                    },
                    style: {
                        lineWidth,
                        stroke,
                        fill
                    }
                },
                {
                    type: "line",
                    silent: true,
                    shape: {
                        x1: target.cx - outerRadius - distance / 4,
                        y1: target.cy,
                        x2: target.cx - outerRadius,
                        y2: target.cy,
                    },
                    style: {
                        lineWidth,
                        stroke,
                        fill
                    }
                },
                
                {
                    type: "arc",
                    silent: true,
                    shape: {
                        cx: target.cx - outerRadius - distance / 4,
                        cy: target.cy - Math.sign(target.cy - source.cy) * distance / 4,
                        r: distance / 4,
                        startAngle: (Math.sign(target.cy - source.cy) == -1)  ? Math.PI : Math.PI / 2,
                        endAngle: (Math.sign(target.cy - source.cy) == -1)  ? Math.PI * 3 / 2 : Math.PI
                    },
                    style: {
                        lineWidth,
                        stroke,
                        fill
                    }
                },
                {
                    type: "arc",
                    silent: true,
                    shape: {
                        cx: target.cx - outerRadius - distance * 3 / 4,
                        cy: source.cy  + Math.sign(target.cy - source.cy) * distance / 4,
                        r: distance / 4,
                        startAngle: (Math.sign(target.cy - source.cy) == -1)  ? 0 : Math.PI * 3 / 2,
                        endAngle: (Math.sign(target.cy - source.cy) == -1)  ? Math.PI / 2 : 0
                    },
                    style: {
                        lineWidth,
                        stroke,
                        fill
                    }
                }
            ]
        }

        return []
    }

    const renderNode = source => {
        return [{
                type: 'circle',
                shape: {
                    cx: source.cx,
                    cy: source.cy,
                    r: outerRadius
                },
                style: {
                    fill: color[source.type]
                }
            },
            {
                type: 'circle',
                shape: {
                    cx: source.cx,
                    cy: source.cy,
                    r: innerRadius
                },
                style: {
                    fill: "white"
                }
            },
        ]
    }

    return {
        type: "group",
        children: renderLink(source, target).concat(renderNode(source)),
    }


}

const formatter = params => {
    return `
          <div>
            <b>${params.data.log.metadata.task || ""}</b> 
          </div>
          <div>
            <b>User</b>: ${params.data.user || ""}
          </div>
          <div>
            <b>Status:</b> ${params.data.log.metadata.status || ""} at ${moment(params.data.createdAt).format("DD MMM, YYYY HH:mm:ss")}
          </div>`
}



const getChart = versions => {
    let data = prepareData(versions)
    return {
        tooltip: {
            formatter: formatter.toString(),
            textStyle: {
                fontSize: 12
            }
        },
        grid: {
            containLabel: true,
            left: 10,
            right: 10
        },
        xAxis: {
            show: false,
            max: 25
        },
        yAxis: {
            data: data.users,
            axisLine: {
                show: false
            },
            axisTick: {
                show: false
            },
            splitArea: {
                show: true
            },
            splitLine: {
                show: true
            }
        },
        series: [{
            type: 'custom',
            renderItem: renderItem.toString(),
            encode: {
                x: 1,
                y: 0
            },
            data: data.links
        }]
    }
}

module.exports = {
    getChart
}





// function renderItem(params, api) {

//    const color = {
//         branch: "#FF5722",
//         save: "#FF9800",
//         submit: "#689F38",
//         merge: "#5c6bc0",
//         main: "#c62828" 
//     }


//   const height = api.size([0, 1])[1] * 0.6;
//   const outerRadius = 0.25 * height
//   const innerRadius = 0.15 * height
//   let source = {
//     userIndex: api.value(0),
//     level: api.value(1),
//     type: api.value(2),
//   }
//   let coord = api.coord([source.level, source.userIndex])
//   source.cx = coord[0]
//   source.cy = coord[1]

//   let target = {
//     userIndex: api.value(3),
//     level: api.value(4),
//     type: api.value(5),
//   }
//   coord = api.coord([target.level, target.userIndex])
//   target.cx = coord[0]
//   target.cy = coord[1]//  - height / 2

//   const renderLink = (source, target) => {
//     // h-h
//     if(source.cy == target.cy){
//       return [
//         {
//           type:"line",
//           silent: true,
//           shape:{
//             x1: source.cx + outerRadius , 
//             y1: source.cy,
//             x2: target.cx - outerRadius, 
//             y2: target.cy,
//           },
//           style:{
//               lineWidth: innerRadius,
//               stroke: "#9e9e9e",
//               fill: "transparent"
//             }
//         }
//       ]
//     }
//     // v-v
//     if(source.cx == target.cx){
//       return [
//         {
//           type:"line",
//           silent: true,
//           shape:{
//             x1: source.cx, 
//             y1: source.cy + outerRadius,
//             x2: target.cx, 
//             y2: target.cy - outerRadius,
//           },
//           style:{
//               lineWidth: innerRadius,
//               stroke: "#9e9e9e",
//               fill: "transparent"
//             }
//         }
//       ]
//     }

//     // v-h
//     if(
//       (source.type == "main" && target.type == "branch")
//       ||
//       (source.type == "branch" && target.type == "branch")
//     )
//     {
//       return [
//         {
//           type:"line",
//           silent: true,
//           shape:{
//             x1: source.cx, 
//             y1: source.cy + outerRadius,
//             x2: source.cx, 
//             y2: target.cy + 2 * outerRadius,
//           },
//           style:{
//               lineWidth: innerRadius,
//               stroke: "#9e9e9e",
//               fill: "transparent"
//             }
//         },
//         {
//           type:"line",
//           silent: true,
//           shape:{
//             x1: source.cx + 2 * outerRadius, 
//             y1: target.cy,
//             x2: target.cx - outerRadius, 
//             y2: target.cy,
//           },
//           style:{
//               lineWidth: innerRadius,
//               stroke: "#9e9e9e",
//               fill: "transparent"
//             }
//         },
//         {
//           type:"arc",
//           silent: true,
//           shape:{
//             cx: source.cx + 2 * outerRadius, 
//             cy: target.cy + 2 * outerRadius,
//             r: 2 * outerRadius,
//             startAngle: Math.PI,
//             endAngle: Math.PI *3/2
//           },
//           style:{
//               lineWidth: innerRadius,
//               stroke: "#9e9e9e",
//               fill: "transparent"
//             }
//         }
//       ]
//     }

//     // h-v
//     if(
//       (source.type == "submit" && target.type == "merge")
//       ||
//       (source.type == "submit" && target.type == "branch")
//       ||
//       (source.type == "merge" && target.type == "branch")
//     )
//     {
//       return [
//         {
//           type:"line",
//           silent: true,
//           shape:{
//             x1: source.cx + outerRadius, 
//             y1: source.cy,
//             x2: target.cx - 2 * outerRadius, 
//             y2: source.cy,
//           },
//           style:{
//               lineWidth: innerRadius,
//               stroke: "#9e9e9e",
//               fill: "transparent"
//             }
//         },
//         {
//           type:"line",
//           silent: true,
//           shape:{
//             x1: target.cx, 
//             y1: source.cy + ((source.userIndex < target.userIndex) ? -2 * outerRadius : 2 * outerRadius),
//             x2: target.cx, 
//             y2: target.cy + ((source.userIndex < target.userIndex) ? outerRadius : -outerRadius),
//           },
//           style:{
//               lineWidth: innerRadius,
//               stroke: "#9e9e9e",
//               fill: "transparent"
//             }
//         },
//         {
//           type:"arc",
//           silent: true,
//           shape:{
//             cx: target.cx - 2 * outerRadius, 
//             cy: source.cy + ((source.userIndex < target.userIndex) ? -2 * outerRadius : 2 * outerRadius),
//             r: 2 * outerRadius,
//             startAngle: ((source.userIndex < target.userIndex) ? 0 : 3 * Math.PI / 2 ),
//             endAngle: ((source.userIndex < target.userIndex) ? Math.PI / 2 : 0 )
//           },
//           style:{
//               lineWidth: innerRadius,
//               stroke: "#9e9e9e",
//               fill: "transparent"
//             }
//         }
//       ]
//     }

//     return []

//   }

//   const renderNode = source => {
//     return [
//       {
//         type: 'circle',
//         shape: 
//           {
//             cx: source.cx,
//             cy: source.cy,
//             r: outerRadius
//           },
//           style: {
//             fill: color[source.type]
//           }
//     },
//     {
//         type: 'circle',
//         shape: 
//           {
//             cx: source.cx,
//             cy: source.cy,
//             r: innerRadius
//           },
//         style: {
//           fill: "white"
//         }
//     },
//     ]
//   }

//   return {
//     type: "group",
//     children: renderLink(source, target).concat(renderNode(source)),
//   }


// }


// option = {
//   tooltip: {
//     formatter:  params => {
//         log(params)
//         return `
//           <div>
//             <b>${params.data.log.metadata.task || ""}</b> 
//           </div>
//           <div>
//             <b>User</b>: ${params.data.user || ""}
//           </div>
//           <div>
//             <b>Status:</b> ${params.data.log.metadata.status || ""} at ${params.data.createdAt}
//           </div>` 
//     },        
//     textStyle: {
//         fontSize: 10
//     }
//   },
//   grid: {
//     containLabel: true,
//     left: 10,
//     right: 10
//   },
//   xAxis: {
//     show: false,
//     max: 11
//   },
//   yAxis: {
//     data: users,
//     axisLine:{
//       show: false
//     },
//     axisTick:{
//       show: false
//     },
//     splitArea: {
//         show: true
//     },
//     splitLine: {
//         show: true
//     }
//   },
//   series: [
//     {
//       type: 'custom',
//       renderItem: renderItem,
//       // itemStyle: {
//       //   opacity: 1
//       // },
//       encode: {
//         x: 1,
//         y: 0
//       },
//       data: data
//     }
//   ]
// };