let data = require("./data-version-chart-example")









// var data = [];
// var dataCount = 10;
// var startTime = +new Date();
// var categories = ['categoryA', 'categoryB', 'categoryC'];
// var types = [
//   { name: 'JS Heap', color: '#7b9ce1' },
//   { name: 'Documents', color: '#bd6d6c' },
//   { name: 'Nodes', color: '#75d874' },
//   { name: 'Listeners', color: '#e0bc78' },
//   { name: 'GPU Memory', color: '#dc77dc' },
//   { name: 'GPU', color: '#72b362' }
// ];
// // Generate mock data
// categories.forEach(function (category, index) {
//   var baseTime = startTime;
//   for (var i = 0; i < dataCount; i++) {
//     var typeItem = types[Math.round(Math.random() * (types.length - 1))];
//     var duration = Math.round(Math.random() * 10000);
//     data.push({
//       name: typeItem.name,
//       value: [index, baseTime, (baseTime += duration), duration],
//       itemStyle: {
//         normal: {
//           color: typeItem.color
//         }
//       }
//     });
//     baseTime += Math.round(Math.random() * 2000);
//   }
// });




// function renderItem(params, api) {
//   var categoryIndex = api.value(0);
//   var start = api.coord([api.value(1), categoryIndex]);
//   var end = api.coord([api.value(2), categoryIndex]);
//   var height = api.size([0, 1])[1] * 0.6;
//   var rectShape = echarts.graphic.clipRectByRect(
//     {
//       x: start[0],
//       y: start[1] - height / 2,
//       width: end[0] - start[0],
//       height: height
//     },
//     {
//       x: params.coordSys.x,
//       y: params.coordSys.y,
//       width: params.coordSys.width,
//       height: params.coordSys.height
//     }
//   );
//   return {
//     type: "group",
//     children:[
//     {
//       type:"line",
//       shape:{
//         x1:start[0] + (end[0]-start[0])/2, 
//         y1: start[1] - height/2,
//         x2: end[0] - 20, 
//         y2: start[1] - height/2,
//       },
//       style:{
//           lineWidth: 5,
//           stroke: "#9e9e9e",
//           fill: "transparent"
//         }
//     },
//     {
//       type:"line",
//       shape:{
//           x1:end[0], 
//           y1: start[1] - height/2 + 20,
//           x2: end[0], 
//           y2: start[1]
//       },
//       style:{
//           lineWidth: 5,
//           stroke: "#9e9e9e",
//           fill: "transparent"
//         }
//     },

//     {
//       type:"arc",
//       shape:{
//           cx: end[0] - 20, 
//           cy: start[1] - height/2 + 20,
//           r: 20,
//           startAngle: 0,
//           endAngle: - Math.PI/2,
//           clockwise: false
//       },
//       style:{
//           lineWidth: 5,
//           stroke: "#9e9e9e",
//           fill: "transparent"
//         }
//     },

//     {
//         type: 'circle',
//         shape: 
//           {
//             cx: start[0] + (end[0]-start[0])/2,
//             cy: start[1] - height / 2,
//             r: 8 ,
//           },
//           style: {
//             fill: "#dd2200"
//           }
//     },
//     {
//         type: 'circle',
//         shape: 
//           {
//             cx: start[0] + (end[0]-start[0])/2,
//             cy: start[1] - height / 2,
//             r: 4 ,
//           },
//         style: {
//           fill: "white"
//         }
//     },

//   ]
//   }
//   return (
//     rectShape && {
//       type: 'rect',
//       transition: ['shape'],
//       shape: rectShape,
//       style: api.style()
//     }
//   );
// }
// option = {
//   tooltip: {
//     formatter: function (params) {
//       return params.marker + params.name + ': ' + params.value[3] + ' ms';
//     }
//   },
//   title: {
//     text: 'Profile',
//     left: 'center'
//   },
//   dataZoom: [
//     {
//       type: 'slider',
//       filterMode: 'weakFilter',
//       showDataShadow: false,
//       top: 400,
//       labelFormatter: ''
//     },
//     {
//       type: 'inside',
//       filterMode: 'weakFilter'
//     }
//   ],
//   grid: {
//     height: 300
//   },
//   xAxis: {
//     min: startTime,
//     scale: true,
//     axisLabel: {
//       formatter: function (val) {
//         return Math.max(0, val - startTime) + ' ms';
//       }
//     }
//   },
//   yAxis: {
//     data: categories
//   },
//   series: [
//     {
//       type: 'custom',
//       renderItem: renderItem,
//       itemStyle: {
//         opacity: 0.8
//       },
//       encode: {
//         x: [1, 2],
//         y: 0
//       },
//       data: data
//     }
//   ]
// };


const { sortBy, find, findIndex, last, first, take, flattenDeep, uniqBy } = require("lodash")




const processBuf = (buf, links, level) => {
    let p = links.map(d => ({ id: d, level: level }))
    p.forEach(d => {
        let ff = find(buf, b => b.id == d.id)
        if (ff) {
            ff = p
        } else {
            buf.push(d)
        }
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
    let buf = (start) ? [{ id: start.id, level: 1 }] : []
    let current = 0

    while (buf.length < result.length && current < result.length + 1) {
        current++
        let nodes = buf.filter(b => b.level == current)
        nodes.forEach(n => {
            let f = find(result, d => d.id == n.id)
            if (f) {
                if (f.branch) processBuf(buf, f.branch, current + 1)
                if (f.submit) processBuf(buf, [f.submit], current + 1)
                if (f.save) processBuf(buf, [f.save], current + 1)
                if (f.merge) processBuf(buf, [f.merge], current + 1)
                if (f.commit) processBuf(buf, [f.commit], current + 1)
            }
        })

    }

    buf.forEach(b => {
        let f = find(result, r => r.id == b.id)
        if (f) f.level = b.level
    })

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

        if(!d.branch && !d.submit && !d.save && !d.merge && !d.commit){
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

        // 
        // {
        //     user: d.user,
        //     id: d.id,
        //     createdAt: d.createdAt,
        //     log: d.log,
        //     value: flattenDeep([
        //         findIndex(users, u => (d.user || "main") == u),
        //         d.level,
        //         d.type,
        //         links.length,
        //         links
        //     ])

        // }
    })

    return links

    // return encodedData
}


let prepared = prepareData(data)

console.log(JSON.stringify(prepared, null, " "))






// let data = [                                                                                                                           
//  {                                                                                                                          
//   "id": "26fd7e54-a063-4e4b-a4c9-bc9bb2f8f8ac",                                                                             
//   "createdAt": "2025-02-26T15:00:22.124Z",                                                                                  
//   "log": {                                                                                                                  
//    "id": "26fd7e54-a063-4e4b-a4c9-bc9bb2f8f8ac",                                                                            
//    "date": "2025-02-26T15:00:22.124Z",                                                                                      
//    "versionId": "26fd7e54-a063-4e4b-a4c9-bc9bb2f8f8ac",                                                                     
//    "metadata": {                                                                                                            
//     "state": "Initialize data versioning"                                                                                   
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    0,                                                                                                                       
//    1,                                                                                                                       
//    "main",                                                                                                                  
//    1,                                                                                                                       
//    2,                                                                                                                       
//    "branch"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "ADE",                                                                                                            
//   "id": "b520aed7-d76a-4a51-ac21-76cccea58fb7",                                                                             
//   "createdAt": "2025-02-26T15:00:22.124Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "ADE",                                                                                                           
//    "date": "2025-02-26T15:00:22.124Z",                                                                                      
//    "versionId": "b520aed7-d76a-4a51-ac21-76cccea58fb7",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "status": "baseBranch",                                                                                                 
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    1,                                                                                                                       
//    2,                                                                                                                       
//    "branch",                                                                                                                
//    4,                                                                                                                       
//    3,                                                                                                                       
//    "branch"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "ADE",                                                                                                            
//   "id": "b520aed7-d76a-4a51-ac21-76cccea58fb7",                                                                             
//   "createdAt": "2025-02-26T15:00:22.124Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "ADE",                                                                                                           
//    "date": "2025-02-26T15:00:22.124Z",                                                                                      
//    "versionId": "b520aed7-d76a-4a51-ac21-76cccea58fb7",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "status": "baseBranch",                                                                                                 
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    1,                                                                                                                       
//    2,                                                                                                                       
//    "branch",                                                                                                                
//    3,                                                                                                                       
//    3,                                                                                                                       
//    "branch"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "ADE",                                                                                                            
//   "id": "b520aed7-d76a-4a51-ac21-76cccea58fb7",                                                                             
//   "createdAt": "2025-02-26T15:00:22.124Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "ADE",                                                                                                           
//    "date": "2025-02-26T15:00:22.124Z",                                                                                      
//    "versionId": "b520aed7-d76a-4a51-ac21-76cccea58fb7",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "status": "baseBranch",                                                                                                 
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    1,                                                                                                                       
//    2,                                                                                                                       
//    "branch",                                                                                                                
//    2,                                                                                                                       
//    3,                                                                                                                       
//    "branch"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Oleh Shpak",                                                                                                     
//   "id": "eaf99d5c-ff3c-4cbb-a356-563fb80ca38e",                                                                             
//   "createdAt": "2025-02-26T15:00:22.125Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Oleh Shpak",                                                                                                    
//    "date": "2025-02-26T15:00:22.125Z",                                                                                      
//    "versionId": "eaf99d5c-ff3c-4cbb-a356-563fb80ca38e",                                                                     
//    "metadata": {                                                                                                            
//     "comment": "emitted by ADE",                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "status": "start",                                                                                                      
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    4,                                                                                                                       
//    3,                                                                                                                       
//    "branch",                                                                                                                
//    4,                                                                                                                       
//    4,                                                                                                                       
//    "submit"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Jean Andrade",                                                                                                   
//   "id": "0fcb703d-4605-4305-aee6-d3eaa4a3f0b8",                                                                             
//   "createdAt": "2025-02-26T15:00:22.126Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Jean Andrade",                                                                                                  
//    "date": "2025-02-26T15:00:22.126Z",                                                                                      
//    "versionId": "0fcb703d-4605-4305-aee6-d3eaa4a3f0b8",                                                                     
//    "metadata": {                                                                                                            
//     "comment": "emitted by ADE",                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "status": "start",                                                                                                      
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    3,                                                                                                                       
//    3,                                                                                                                       
//    "branch",                                                                                                                
//    3,                                                                                                                       
//    4,                                                                                                                       
//    "submit"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Iryna Prodan",                                                                                                   
//   "id": "18bb9333-89be-44da-864d-935b3cdd1d6c",                                                                             
//   "createdAt": "2025-02-26T15:00:22.127Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Iryna Prodan",                                                                                                  
//    "date": "2025-02-26T15:00:22.127Z",                                                                                      
//    "versionId": "18bb9333-89be-44da-864d-935b3cdd1d6c",                                                                     
//    "metadata": {                                                                                                            
//     "comment": "emitted by ADE",                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "status": "start",                                                                                                      
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    2,                                                                                                                       
//    3,                                                                                                                       
//    "branch",                                                                                                                
//    2,                                                                                                                       
//    4,                                                                                                                       
//    "submit"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Jean Andrade",                                                                                                   
//   "id": "6e193b8c-7222-4a49-90bd-33a34d9e95dc",                                                                             
//   "createdAt": "2025-02-26T15:28:52.487Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Jean Andrade",                                                                                                  
//    "date": "2025-02-26T15:28:52.487Z",                                                                                      
//    "versionId": "6e193b8c-7222-4a49-90bd-33a34d9e95dc",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Jean Andrade",                                                                                             
//     "expiredAt": "2025-02-26T16:28:52.485Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    3,                                                                                                                       
//    4,                                                                                                                       
//    "submit",                                                                                                                
//    3,                                                                                                                       
//    5,                                                                                                                       
//    "submit"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Iryna Prodan",                                                                                                   
//   "id": "fd19e061-d881-4434-806a-9c4cfb4a0cf3",                                                                             
//   "createdAt": "2025-02-26T15:40:38.987Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Iryna Prodan",                                                                                                  
//    "date": "2025-02-26T15:40:38.987Z",                                                                                      
//    "versionId": "fd19e061-d881-4434-806a-9c4cfb4a0cf3",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Iryna Prodan",                                                                                             
//     "expiredAt": "2025-02-26T16:40:38.986Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    2,                                                                                                                       
//    4,                                                                                                                       
//    "submit",                                                                                                                
//    2,                                                                                                                       
//    5,                                                                                                                       
//    "submit"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Oleh Shpak",                                                                                                     
//   "id": "e8c2ece3-fc1a-47e7-ab21-288b934d7c1e",                                                                             
//   "createdAt": "2025-02-26T21:15:23.864Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Oleh Shpak",                                                                                                    
//    "date": "2025-02-26T21:15:23.864Z",                                                                                      
//    "versionId": "e8c2ece3-fc1a-47e7-ab21-288b934d7c1e",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Oleh Shpak",                                                                                               
//     "expiredAt": "2025-02-26T22:15:23.863Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    4,                                                                                                                       
//    4,                                                                                                                       
//    "submit",                                                                                                                
//    4,                                                                                                                       
//    5,                                                                                                                       
//    "save"                                                                                                                   
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Jean Andrade",                                                                                                   
//   "id": "1e6741f9-2a1d-4585-a2a4-f0e6aa811e04",                                                                             
//   "createdAt": "2025-02-26T21:18:45.592Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Jean Andrade",                                                                                                  
//    "date": "2025-02-26T21:18:45.592Z",                                                                                      
//    "versionId": "1e6741f9-2a1d-4585-a2a4-f0e6aa811e04",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Jean Andrade",                                                                                             
//     "expiredAt": "2025-02-26T22:18:45.587Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    3,                                                                                                                       
//    5,                                                                                                                       
//    "submit",                                                                                                                
//    3,                                                                                                                       
//    6,                                                                                                                       
//    "submit"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Oleh Shpak",                                                                                                     
//   "id": "f9575140-9232-4d0b-91f9-2d9f2c7a4ee7",                                                                             
//   "createdAt": "2025-02-26T21:26:02.365Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Oleh Shpak",                                                                                                    
//    "date": "2025-02-26T21:26:02.365Z",                                                                                      
//    "versionId": "f9575140-9232-4d0b-91f9-2d9f2c7a4ee7",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Oleh Shpak",                                                                                               
//     "expiredAt": "2025-02-26T22:26:02.362Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    4,                                                                                                                       
//    5,                                                                                                                       
//    "save",                                                                                                                  
//    4,                                                                                                                       
//    6,                                                                                                                       
//    "submit"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Oleh Shpak",                                                                                                     
//   "id": "1111-1111",                                                                                                        
//   "createdAt": "2025-02-26T21:26:02.365Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Oleh Shpak",                                                                                                    
//    "date": "2025-02-26T21:26:02.365Z",                                                                                      
//    "versionId": "f9575140-9232-4d0b-91f9-2d9f2c7a4ee7",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Oleh Shpak",                                                                                               
//     "expiredAt": "2025-02-26T22:26:02.362Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    4,                                                                                                                       
//    6,                                                                                                                       
//    "submit",                                                                                                                
//    4,                                                                                                                       
//    7,                                                                                                                       
//    "submit"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Iryna Prodan",                                                                                                   
//   "id": "ffdb691b-7b9f-47f1-aca3-423d713e07c9",                                                                             
//   "createdAt": "2025-02-26T23:36:37.591Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Iryna Prodan",                                                                                                  
//    "date": "2025-02-26T23:36:37.591Z",                                                                                      
//    "versionId": "ffdb691b-7b9f-47f1-aca3-423d713e07c9",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Iryna Prodan",                                                                                             
//     "expiredAt": "2025-02-27T00:36:37.589Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    2,                                                                                                                       
//    5,                                                                                                                       
//    "submit",                                                                                                                
//    2,                                                                                                                       
//    6,                                                                                                                       
//    "submit"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Oleh Shpak",                                                                                                     
//   "id": "1f8d126c-de12-4129-978f-42db731888cc",                                                                             
//   "createdAt": "2025-02-26T23:38:43.301Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Oleh Shpak",                                                                                                    
//    "date": "2025-02-26T23:38:43.301Z",                                                                                      
//    "versionId": "1f8d126c-de12-4129-978f-42db731888cc",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Oleh Shpak",                                                                                               
//     "expiredAt": "2025-02-27T00:38:43.300Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    4,                                                                                                                       
//    7,                                                                                                                       
//    "submit",                                                                                                                
//    3,                                                                                                                       
//    7,                                                                                                                       
//    "merge"                                                                                                                  
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Iryna Prodan",                                                                                                   
//   "id": "3f53ad17-6b47-4a4f-9ce9-a2cf51e07dfd",                                                                             
//   "createdAt": "2025-02-26T23:39:13.108Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Iryna Prodan",                                                                                                  
//    "date": "2025-02-26T23:39:13.108Z",                                                                                      
//    "versionId": "3f53ad17-6b47-4a4f-9ce9-a2cf51e07dfd",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Iryna Prodan",                                                                                             
//     "expiredAt": "2025-02-27T00:39:13.106Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    2,                                                                                                                       
//    6,                                                                                                                       
//    "submit",                                                                                                                
//    3,                                                                                                                       
//    7,                                                                                                                       
//    "merge"                                                                                                                  
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Jean Andrade",                                                                                                   
//   "id": "44f9e1e7-a233-43c9-bed4-aef08729c9f1",                                                                             
//   "createdAt": "2025-02-27T16:50:22.810Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Jean Andrade",                                                                                                  
//    "date": "2025-02-27T16:50:22.810Z",                                                                                      
//    "versionId": "44f9e1e7-a233-43c9-bed4-aef08729c9f1",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Jean Andrade",                                                                                             
//     "expiredAt": "2025-02-27T17:50:22.809Z",                                                                                
//     "status": "submit",                                                                                                     
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    3,                                                                                                                       
//    6,                                                                                                                       
//    "submit",                                                                                                                
//    3,                                                                                                                       
//    7,                                                                                                                       
//    "merge"                                                                                                                  
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Jean Andrade",                                                                                                   
//   "id": "be49f1d9-cd8d-4f9a-bf95-205348b353ea",                                                                             
//   "createdAt": "2025-02-27T16:50:28.370Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Jean Andrade",                                                                                                  
//    "date": "2025-02-27T16:50:28.370Z",                                                                                      
//    "versionId": "be49f1d9-cd8d-4f9a-bf95-205348b353ea",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Cross_Labeling",                                                                                      
//     "employee": "Jean Andrade",                                                                                             
//     "status": "merge",                                                                                                      
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-1-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    3,                                                                                                                       
//    7,                                                                                                                       
//    "merge",                                                                                                                 
//    5,                                                                                                                       
//    8,                                                                                                                       
//    "branch"                                                                                                                 
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Yaroslav Shpak",                                                                                                 
//   "id": "9c1c048e-42b6-4033-a92f-1bb2444e37b0",                                                                             
//   "createdAt": "2025-02-27T16:50:28.384Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Yaroslav Shpak",                                                                                                
//    "date": "2025-02-27T16:50:28.384Z",                                                                                      
//    "versionId": "9c1c048e-42b6-4033-a92f-1bb2444e37b0",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Manual_Merge",                                                                                        
//     "employee": "Jean Andrade",                                                                                             
//     "status": "start",                                                                                                      
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-2-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     },                                                                                                                      
//     "comment": "Data is not consistent.",                                                                                   
//     "rejector": "Jean Andrade",                                                                                             
//     "initiator": "Jean Andrade"                                                                                             
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    5,                                                                                                                       
//    8,                                                                                                                       
//    "branch",                                                                                                                
//    5,                                                                                                                       
//    9,                                                                                                                       
//    "save"                                                                                                                   
//   ]                                                                                                                         
//  },                                                                                                                         
//  {                                                                                                                          
//   "user": "Yaroslav Shpak",                                                                                                 
//   "id": "af282308-ca72-4091-ba96-f855f60e7608",                                                                             
//   "createdAt": "2025-02-27T17:50:29.190Z",                                                                                  
//   "log": {                                                                                                                  
//    "user": "Yaroslav Shpak",                                                                                                
//    "date": "2025-02-27T17:50:29.190Z",                                                                                      
//    "versionId": "af282308-ca72-4091-ba96-f855f60e7608",                                                                     
//    "metadata": {                                                                                                            
//     "task": "IM_Short_Manual_Merge",                                                                                        
//     "initiator": "Jean Andrade",                                                                                            
//     "employee": "Yaroslav Shpak",                                                                                           
//     "status": "save",                                                                                                       
//     "decoration": {                                                                                                         
//      "icon": "mdi-numeric-2-box-outline",                                                                                   
//      "class": "Basic_Labeling_2nd"                                                                                          
//     }                                                                                                                       
//    }                                                                                                                        
//   },                                                                                                                        
//   "value": [                                                                                                                
//    5,                                                                                                                       
//    9,                                                                                                                       
//    "save",                                                                                                                  
//    null,                                                                                                                    
//    null,                                                                                                                    
//    null                                                                                                                     
//   ]                                                                                                                         
//  }                                                                                                                          
// ]  
// function renderItem(params, api) {
//   const height = api.size([0, 1])[1] * 0.6;
//   const outerRadius = 0.15 * height
//   const innerRadius = 0.07 * height
//   let source = {
//     userIndex: api.value(0),
//     level: api.value(1),
//     type: api.value(2),
//   }
//   let coord = api.coord([source.level, source.userIndex])
//   source.cx = coord[0]
//   source.cy = coord[1]// - height / 2
  
//   let target = {
//     userIndex: api.value(3),
//     level: api.value(4),
//     type: api.value(5),
//   }
//   coord = api.coord([target.level, target.userIndex])
//   target.cx = coord[0]
//   target.cy = coord[1]//  - height / 2
  
//   console.log({
//     source,
//     target
//   })
  
//   return {
//     type: "group",
//     children:[
//     {
//       type:"line",
//       shape:{
//         x1: source.cx, 
//         y1: source.cy,
//         x2: target.cx, 
//         y2: target.cy,
//       },
//       style:{
//           lineWidth: innerRadius,
//           stroke: "#9e9e9e",
//           fill: "transparent"
//         }
//     },
//     // {
//     //   type:"line",
//     //   shape:{
//     //       x1:end[0], 
//     //       y1: start[1] - height/2 + 20,
//     //       x2: end[0], 
//     //       y2: start[1]
//     //   },
//     //   style:{
//     //       lineWidth: 5,
//     //       stroke: "#9e9e9e",
//     //       fill: "transparent"
//     //     }
//     // },
    
//     // {
//     //   type:"arc",
//     //   shape:{
//     //       cx: end[0] - 20, 
//     //       cy: start[1] - height/2 + 20,
//     //       r: 20,
//     //       startAngle: 0,
//     //       endAngle: - Math.PI/2,
//     //       clockwise: false
//     //   },
//     //   style:{
//     //       lineWidth: 5,
//     //       stroke: "#9e9e9e",
//     //       fill: "transparent"
//     //     }
//     // },
    
//     {
//         type: 'circle',
//         shape: 
//           {
//             cx: source.cx,
//             cy: source.cy,
//             r: outerRadius
//           },
//           style: {
//             fill: "#dd2200"
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

//   ]
//   }
  
  
// }


// option = {
//   tooltip: {
//     formatter: function (params) {
//       // return params.marker + params.name + ': ' + params.value[3] + ' ms';
//     }
//   },
//   grid: {
//     height: 300
//   },
//   xAxis: {
//     axisLabel: {
//       formatter: function (val) {
//         // return Math.max(0, val - startTime) + ' ms';
//       }
//     }
//   },
//   yAxis: {
//     // data: categories
//   },
//   series: [
//     {
//       type: 'custom',
//       renderItem: renderItem,
//       itemStyle: {
//         opacity: 1
//       },
//       encode: {
//         x: 1,
//         y: 0
//       },
//       data: data
//     }
//   ]
// };