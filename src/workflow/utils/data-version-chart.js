
const {
    extend,
    isArray,
    isString,
    isObject,
    isFunction,
    find,
    remove,
    unionBy,
    keys,
    first,
    last,
    uniqBy,
    sortBy,
    findIndex,
    difference,
    values,
    flattenDeep,
    set,
    isUndefined
} = require("lodash")

const log  = require("./logger")(__filename) //(path.basename(__filename))

const uuid = require("uuid").v4
const moment = require("moment")



const getGraph = (versions, formatComment, formatDate) => {

    versions = JSON.parse(JSON.stringify(versions))

    data = sortBy(versions, d => d.createdAt).map(d => ({
        id: d.id,
        name: `...${last(d.id.split("-"))}`,
        x: d.createdAt,
        y: d.user || "main",
        value: 1,
        comment: formatComment(d),
        formattedDate: formatDate(d),
        prev: d.prev,
        branch: d.branch,
        save: d.save,
        submit: d.submit,
        commit: d.commit,
        type: d.type,
        user: d.user || "main",
        readonly: d.readonly,
        head: d.head
    })) 


    //     d.name = `...${last(d.id.split("-"))}` //(d.type == "branch") ? d.metadata.actual_task : d.id
    //     d.x = d.createdAt //moment(d.createdAt).format("YYYY-MM-DD HH:mm:ss")
    //     d.y = d.user || "main"
    //     d.value = 1
    //     d.comment = formatComment(d) //d.metadata.actual_status || ""
    //     d.formattedDate = formatDate(d)
    //     return d
    // })

    let dependencies = []
    data.forEach(t => {
        if (t.prev && t.prev.length > 0) {
            t.prev.forEach(s => {
                dependencies.push({
                    source: findIndex(versions, v => v.id == s.id),
                    target: findIndex(versions, v => v.id == t.id)
                })
            })
        }

    })

    let users = uniqBy(data.map(d => d.user || "main"))
    let timeline = sortBy(data.map(d => d.x))

    return {
        users,
        versions: data,
        dependencies,
        timeline
    }

}

const getChart = options => {

    let { versions, formatComment, formatDate } = options

    formatComment = formatComment || ( () => "")
    formatComment = isFunction(formatComment) ? formatComment : ( () => "")

    formatDate = formatDate || ( d => moment(new Date(d.createdAt)).format("DD MMM, YYYY HH:mm") )
    formatDate = isFunction(formatDate) ? formatDate : ( d => moment(new Date(d.createdAt)).format("DD MMM, YYYY HH:mm") )

    const normalizeNames = data => {
        let uniqNames = []

        data = data.map(d => {
            while (uniqNames.includes(d.name)) {
                d.name += " "
            }
            uniqNames.push(d.name)
            return d

        })

        return data

    }

    let data = getGraph(versions, formatComment, formatDate)

    data.versions = normalizeNames(data.versions)

    let connectors = []

    let nodes = data.versions.filter(d => d.branch)

    nodes.forEach(n => {
        let node = find(data.versions, v => v.id == n.id)
        node.branch = n.branch.map(b => {
            let branch = find(data.versions, v => v.id == b)
            let connector = {
                id: uuid(),
                user: branch.user,
                x: branch.x, //node.x,
                y: node.user || "main", //branch.user,
                value: 1,
                prev: [{
                    id: node.id
                }],
                createdAt: node.createdAt,
                type: "connector"
            }

            let index = findIndex(branch.prev, pr => pr.id == node.id)

            branch.prev[index] = { id: connector.id }
            connectors.push(connector)
            return connector.id
        })
    })

    nodes = data.versions.filter(d => d.merge)

    nodes.forEach(n => {
        let node = find(data.versions, v => v.id == n.id)
        let merge = find(data.versions, v => v.id == node.merge)

        let connector = {
            id: uuid(),
            user: node.user,
            x: node.x,
            y: merge.user,
            value: 1,
            prev: [{
                id: node.id
            }],
            createdAt: merge.createdAt,
            type: "connector"
        }

        let index = findIndex(merge.prev, pr => pr.id == node.id)
        merge.prev[index] = { id: connector.id }

        node.merge = connector.id

        connectors.push(connector)


    })



    nodes = data.versions.filter(d => d.commit)

    nodes.forEach(n => {
        let node = find(data.versions, v => v.id == n.id)
        let commit = find(data.versions, v => v.id == node.commit)

        let connector = {
            id: uuid(),
            x: commit.x,
            y: node.y,
            value: 1,
            prev: [{
                id: node.id
            }],
            createdAt: node.createdAt,
            type: "connector"
        }


        commit.prev = [{
            id: connector.id
        }]

        node.commit = connector.id
        connectors.push(connector)
    })

    //////////////////////////////////////////////////////////////////////////////////////////////////

    data.versions = sortBy(data.versions.concat(connectors), d => d.index)


    let dependencies = []

    data.versions.forEach(t => {
        if (t.prev && t.prev.length > 0) {
            t.prev.forEach(s => {

                dependencies.push({
                    source: findIndex(data.versions, v => v.id == s.id),
                    target: findIndex(data.versions, v => v.id == t.id)
                })
            })
        }

    })

    data.dependencies = dependencies.map(d => {
        if (data.versions[d.target].type == "connector") {
            d.symbol = "none"
        } else {
            d.symbol = ["none", "arrow"]
        }
        return d
    })

    data.timeline = sortBy(data.versions.map(d => d.x))


    return {

        grid: {
            containLabel: true
        },
        toolbox: {
            feature: {
                saveAsImage: {}
            }
        },
        tooltip: {
            formatter: "params => {\n\tif (params.dataType == \"edge\") return\n\treturn `<b>${params.data.category}</b><br/>User: ${(params.data.value[1] == \"main\") ? \"\" : params.data.value[1]}<br/>${params.data.comment}<br/>Created at: ${params.data.formattedDate}<br/>${(params.data.readonly) ? \"Read only\" : \"\"}`\n}",
            textStyle: {
                fontSize: 10
            }
        },

        xAxis: {
            type: 'category',
            show: false
        },
        yAxis: {
            type: 'category',
            data: data.users,
            splitArea: {
                show: true
            },
            splitLine: {
                show: true
            }
        },
        series: [{
            type: 'graph',
            layout: 'none',
            coordinateSystem: 'cartesian2d',
            label: {
                show: true,
                position: "bottom",
                fontSize: 8
            },
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: [0, 10],
            "categories": [{
                    "name": "main",
                    "symbol": "path://M405 384h-298q-18 0 -30.5 -12.5t-12.5 -30.5v-298q0 -18 12.5 -30.5t30.5 -12.5h298q18 0 30.5 12.5t12.5 30.5v298q0 18 -12.5 30.5t-30.5 12.5z",
                    "symbolSize": 14
                },
                {
                    "name": "merge",
                    "symbol": "path://M469 -107q0 18 -12.5 30.5t-29.5 12.5h-256q-18 0 -30.5 -12.5t-12.5 -30.5v-256q0 -17 12.5 -29.5t30.5 -12.5h256q17 0 29.5 12.5t12.5 29.5v256zM341 -21v42h-256q-17 0 -29.5 -12.5t-12.5 -29.5v-278h42v278h256zM277 -149l150 -150l-30 -30l-120 119l-66 -65l-30 30z",
                    "symbolSize": 14
                },
                {
                    "name": "save",
                    "symbol": "path://M320 -256h-213v-85h213v85zM256 -43q-27 0 -45.5 -18.5t-18.5 -45t18.5 -45.5t45.5 -19t45.5 19t18.5 45.5t-18.5 45t-45.5 18.5zM363 -384h-256q-18 0 -30.5 12.5t-12.5 30.5v298q0 18 12.5 30.5t30.5 12.5h298q18 0 30.5 -12.5t12.5 -30.5v-256z",
                    "symbolSize": 14
                },
                {
                    "name": "branch",
                    "symbol": "path://M107 341v-298h64v298h-64zM213 341v-298l235 149z",
                    "symbolSize": 14
                },
                {
                    "name": "submit",
                    "symbol": "path://M213 -85l-106 -107l30 -30l76 76l162 -162l30 31zM405 -384h-298q-18 0 -30.5 12.5t-12.5 30.5v298q0 18 12.5 30.5t30.5 12.5h298q18 0 30.5 -12.5t12.5 -30.5v-298q0 -18 -12.5 -30.5t-30.5 -12.5z",
                    "symbolSize": 14
                },
                {
                    "name": "connector",
                    "symbol": "none",
                    "symbolSize": 0
                }
            ],

            data: data.versions.map((d, index) => ({
                index,
                name: (d.type == "branch") ?
                    d.name : (d.name) ? last(d.name.split("-")) : null,
                x: d.x,
                value: [d.x, d.y],
                readonly: d.readonly, //!!d.branch || !!d.save || !!d.commit,
                head: d.head,
                category: d.type,
                comment: d.comment,
                formattedDate: d.formattedDate,
                label: {
                    position: (d.type == "branch") ?
                        "top" : (index % 2 == 0) ? "top" : "bottom",
                    fontSize: (d.type == "branch") ? 10 : undefined,
                    fontWeight: (d.type == "branch") ? "bold" : undefined
                },
                itemStyle: {
                    color: (d.head) ? (!d.readonly) ? "#1872a8" : "#ff9800" : "#757575",
                    borderColor: (d.head) ? (!d.readonly) ? "#1872a8" : "#ff9800" : "#757575",
                    borderWidth: (d.head) ? 0.3 : 0
                }
            })),
            links: data.dependencies,
            lineStyle: {
                color: '#333',
                width: 1.5,
                curveness: 0
            }
        }]
    }
}


module.exports = getChart
