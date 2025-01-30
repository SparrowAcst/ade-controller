const {
    isArray,
    keys,
    first,
    last,
    uniqBy,
    flatten,
    find

} = require("lodash")

const jsondiffpatch = require('jsondiffpatch')

const checkedFields = [
    // "Heart Sound Informativeness",
    // "Lung Sound Informativeness",
    "S3",
    "S4",
    "Pathological findings",
    "Rhythm and Arrhythmias",
    "Systolic murmurs",
    "Diastolic murmurs",
    "Other murmurs"
    ]

const checker = jsondiffpatch.create({
    objectHash: (d, index)  => {
        let c = JSON.parse(JSON.stringify(d))
        delete c.grade
        return JSON.stringify(c)
    },

    propertyFilter: name => checkedFields.includes(name) 
})



const format = (delta, parentKey) => {
    
    let res = []
    delta = jsondiffpatch.clone(delta)
    
    keys(delta).forEach( key => {
        
        if(key == "_t") return
        
        let publicParentKey = parentKey || ""
        let publicSelfKey = (keys(delta).includes("_t")) ? "" : key

        let publicKey = [publicParentKey,publicSelfKey].filter(d => d).join(".")    

        if(isArray(delta[key])){
            let op
            if(delta[key].length == 1) op = "insert"
            if(delta[key].length == 2) op = "update"
            if(delta[key].length == 3 && last(delta[key]) == 0 ) op = "remove"
            
            let oldValue
            if(delta[key].length == 1) oldValue = undefined
            if(delta[key].length == 2) oldValue = first(delta[key])
            if(delta[key].length == 3 && last(delta[key]) == 0 ) oldValue = first(delta[key])

            let newValue
            if(delta[key].length == 1) newValue = last(delta[key])
            if(delta[key].length == 2) newValue = last(delta[key])
            if(delta[key].length == 3 && last(delta[key]) == 0 ) newValue = undefined

            res.push({
                key: publicKey,
                op,
                oldValue,
                newValue
            })

        } else {

            res = res.concat(format(delta[key], publicKey))

        }   

    })

    return res
}



const mergeMurmurLabels = labels => {

    let murmurs = uniqBy(flatten(labels.map(l => l.map( d => d.type))))
    let res = murmurs.map( m => {
        let values = labels.map(l => find(l, d => d.type == m)).filter( d => d )
        let mergedValue = values[0]
        let grades = values.map( v => v.grade).filter( d => d ) 
        if(grades.length > 0){
            grades = grades
                .map(g => Number.parseInt(g))
            
            let defGrades = grades.filter(g => !Number.isNaN(g))
            let undefGrades = grades.filter(g => Number.isNaN(g))
                            
            if(defGrades.length > 0){
                mergedValue.grade = Math.round( defGrades.reduce( (a, b) => a + b, 0 ) / defGrades.length ).toString()
            } else {
                mergedValue.grade = "No grade"   
            }
        }
        return mergedValue 
    })

    return res

}


const merge = dataArray => {
    dataArray = (isArray(dataArray)) ? dataArray : []
    if(dataArray.length == 0) return 
    
    let res = dataArray[0]
    res["Systolic murmurs"] = mergeMurmurLabels(dataArray.map(d => d["Systolic murmurs"]))
    res["Diastolic murmurs"] = mergeMurmurLabels(dataArray.map(d => d["Diastolic murmurs"]))
    res["Other murmurs"] = mergeMurmurLabels(dataArray.map(d => d["Other murmurs"]))

    return res

}


module.exports = {
    checkedFields,
    checker,
    getDifference: (d1, d2) => {
        let patch = checker.diff(d1, d2)
        return {
            patch,
            formatted: format(patch) 
        }
    },
    merge    
}




// let l1 = {
//   "_id": {
//     "$oid": "65a65e2042d448ca597107b7"
//   },
//   "id": "46c35175-5b68-419a-8759-282da490e32b",
//   "Segmentation URL": "http://ec2-54-235-192-121.compute-1.amazonaws.com:8002/?record_v3=9ASbG0DQawa2ajr0APjbqhVz8pG2/recordings/Android_vVIdAJrcJWpHqjaIMnDL&patientId=POT0354&position=leftDecubitus&spot=mitral&device=android",
//   "Examination ID": "POT0354",
//   "Source": {
//     "path": "9ASbG0DQawa2ajr0APjbqhVz8pG2/recordings/Android_vVIdAJrcJWpHqjaIMnDL",
//     "url": "https://firebasestorage.googleapis.com/v0/b/stethophonedata.appspot.com/o/9ASbG0DQawa2ajr0APjbqhVz8pG2%2Frecordings%2FAndroid_vVIdAJrcJWpHqjaIMnDL?alt=media&token=a212d058-d105-4f82-bd92-1accb4ad1fa2"
//   },
//   "Clinic": "POTASHEV",
//   "Age (Years)": "48",
//   "Sex at Birth": "Male",
//   "Ethnicity": "White",
//   "model": "android",
//   "deviceDescription": {
//     "osVersion": "14",
//     "model": "SM-S908B",
//     "deviceId": "UP1A.231005.007",
//     "brand": "samsung",
//     "manufacturer": "samsung"
//   },
//   "Body Position": "leftDecubitus",
//   "Body Spot": "Apex",
//   "Type of artifacts , Artifact": [
//     "Movement",
//     "Bowel sound"
//   ],
//   "Systolic murmurs": [
//     {
//       "type": "Systolic murmur undetermined",
//       "grade": "2"
//     }
//   ],
//   "Diastolic murmurs": [
//     {
//       "type": "No diastolic murmurs"
//     }
//   ],
//   "Other murmurs": [
//     {
//       "type": "No Other Murmurs"
//     }
//   ],
//   "Pathological findings": [
//     "No Pathology"
//   ],
//   "path": "9ASbG0DQawa2ajr0APjbqhVz8pG2/recordings/Android_vVIdAJrcJWpHqjaIMnDL",
//   "state": "Assign 2nd expert",
//   "CMO": "Yaroslav Shpak",
//   "TODO": "Finalized",
//   "updated at": "2024-09-15T19:44:29.675Z",
//   "updated by": "Yaroslav Shpak",
//   "Stage Comment": "Added by import utils",
//   "1st expert": "María José Aedo",
//   "2nd expert": "Ivanna Kuzyk",
//   "segmentation": {
//     "v2": true,
//     "S2": [
//       [
//         "0.225",
//         "0.303",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "0.977",
//         "1.059",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.707",
//         "1.783",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.443",
//         "2.521",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.183",
//         "3.259",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.923",
//         "4.008",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.659",
//         "4.733",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.407",
//         "5.484",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.142",
//         "6.223",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.904",
//         "6.989",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.665",
//         "7.747",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.439",
//         "8.519",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.219",
//         "9.303",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.002",
//         "10.088",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.792",
//         "10.869",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.601",
//         "11.688",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.408",
//         "12.494",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.227",
//         "13.306",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.030",
//         "14.119",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.854",
//         "14.940",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.655",
//         "15.735",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.469",
//         "16.552",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.279",
//         "17.363",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.102",
//         "18.180",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.940",
//         "19.030",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.769",
//         "19.855",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "S1": [
//       [
//         "0.709",
//         "0.808",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.439",
//         "1.536",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.201",
//         "2.290",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.937",
//         "3.023",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.670",
//         "3.759",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.417",
//         "4.514",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.132",
//         "5.224",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.855",
//         "5.941",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.629",
//         "6.721",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.392",
//         "7.482",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.173",
//         "8.269",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.944",
//         "9.029",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.732",
//         "9.830",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.525",
//         "10.619",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.310",
//         "11.410",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.129",
//         "12.215",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.954",
//         "13.051",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.773",
//         "13.867",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.577",
//         "14.669",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.405",
//         "15.498",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.195",
//         "16.288",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.002",
//         "17.096",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.823",
//         "17.905",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.657",
//         "18.772",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.507",
//         "19.600",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "S3": [
//       [
//         "0.374",
//         "0.478",
//         "0.944",
//         "65.043"
//       ],
//       [
//         "1.133",
//         "1.241",
//         "2.832",
//         "65.062"
//       ],
//       [
//         "2.614",
//         "2.715",
//         "-4.719",
//         "71.861"
//       ],
//       [
//         "4.095",
//         "4.189",
//         "0.000",
//         "56.854"
//       ],
//       [
//         "4.818",
//         "4.910",
//         "0.000",
//         "62.987"
//       ],
//       [
//         "5.582",
//         "5.671",
//         "0.000",
//         "51.380"
//       ],
//       [
//         "6.292",
//         "6.376",
//         "0.000",
//         "58.078"
//       ],
//       [
//         "7.074",
//         "7.171",
//         "0.000",
//         "54.664"
//       ],
//       [
//         "7.825",
//         "7.923",
//         "0.000",
//         "56.380"
//       ],
//       [
//         "8.611",
//         "8.693",
//         "0.000",
//         "61.776"
//       ],
//       [
//         "9.408",
//         "9.498",
//         "-3.776",
//         "67.311"
//       ],
//       [
//         "10.179",
//         "10.256",
//         "-3.776",
//         "65.536"
//       ],
//       [
//         "10.981",
//         "11.073",
//         "0.000",
//         "51.172"
//       ],
//       [
//         "11.763",
//         "11.853",
//         "0.000",
//         "57.229"
//       ],
//       [
//         "12.587",
//         "12.668",
//         "0.000",
//         "58.682"
//       ],
//       [
//         "13.390",
//         "13.478",
//         "0.000",
//         "57.078"
//       ],
//       [
//         "14.200",
//         "14.288",
//         "0.000",
//         "60.078"
//       ],
//       [
//         "15.037",
//         "15.121",
//         "0.000",
//         "61.369"
//       ],
//       [
//         "15.810",
//         "15.904",
//         "0.000",
//         "58.133"
//       ],
//       [
//         "16.650",
//         "16.739",
//         "0.000",
//         "60.048"
//       ],
//       [
//         "17.440",
//         "17.529",
//         "0.000",
//         "58.331"
//       ],
//       [
//         "18.290",
//         "18.373",
//         "0.000",
//         "65.246"
//       ],
//       [
//         "19.110",
//         "19.211",
//         "0.000",
//         "56.529"
//       ],
//       [
//         "1.853",
//         "1.936",
//         "17.968",
//         "58.797"
//       ],
//       [
//         "3.340",
//         "3.430",
//         "20.000",
//         "71.793"
//       ]
//     ],
//     "unsegmentable": [
//       [
//         "0.000",
//         "0.225",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.855",
//         "20.000",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "diastole": [
//       [
//         "0.303",
//         "0.709",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.059",
//         "1.439",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.783",
//         "2.201",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.521",
//         "2.937",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.259",
//         "3.670",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.008",
//         "4.417",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.733",
//         "5.132",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.484",
//         "5.855",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.223",
//         "6.629",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.989",
//         "7.392",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.747",
//         "8.173",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.519",
//         "8.944",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.303",
//         "9.732",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.088",
//         "10.525",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.869",
//         "11.310",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.688",
//         "12.129",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.494",
//         "12.954",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.306",
//         "13.773",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.119",
//         "14.577",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.940",
//         "15.405",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.735",
//         "16.195",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.552",
//         "17.002",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.363",
//         "17.823",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.180",
//         "18.657",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.030",
//         "19.507",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "systole": [
//       [
//         "0.808",
//         "0.977",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.536",
//         "1.707",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.290",
//         "2.443",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.023",
//         "3.183",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.759",
//         "3.923",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.514",
//         "4.659",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.224",
//         "5.407",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.941",
//         "6.142",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.721",
//         "6.904",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.482",
//         "7.665",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.269",
//         "8.439",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.029",
//         "9.219",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.830",
//         "10.002",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.619",
//         "10.792",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.410",
//         "11.601",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.215",
//         "12.408",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.051",
//         "13.227",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.867",
//         "14.030",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.669",
//         "14.854",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.498",
//         "15.655",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.288",
//         "16.469",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.096",
//         "17.279",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.905",
//         "18.102",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.772",
//         "18.940",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.600",
//         "19.769",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "Murmur": [
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             2.29,
//             20
//           ],
//           [
//             2.2901687031517217,
//             544.211970074813
//           ],
//           [
//             2.444077803359707,
//             530.2967581047382
//           ],
//           [
//             2.443,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             0.808,
//             20
//           ],
//           [
//             0.8081863453113789,
//             544.211970074813
//           ],
//           [
//             0.9781905148221595,
//             530.2967581047382
//           ],
//           [
//             0.9770000000000001,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             1.536,
//             20
//           ],
//           [
//             1.5361885505813357,
//             544.211970074813
//           ],
//           [
//             1.7082046037549663,
//             530.2967581047382
//           ],
//           [
//             1.7069999999999999,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             3.023,
//             20
//           ],
//           [
//             3.0231764215965717,
//             544.211970074813
//           ],
//           [
//             3.1841271146245296,
//             530.2967581047382
//           ],
//           [
//             3.183,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             3.759,
//             20
//           ],
//           [
//             3.7591808321364857,
//             544.211970074813
//           ],
//           [
//             3.924155292490143,
//             530.2967581047382
//           ],
//           [
//             3.923,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             4.514,
//             20
//           ],
//           [
//             4.514159882071894,
//             544.211970074813
//           ],
//           [
//             4.6600214476284805,
//             530.2967581047382
//           ],
//           [
//             4.659,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             5.224,
//             20
//           ],
//           [
//             5.224201782201079,
//             544.211970074813
//           ],
//           [
//             5.408289137351806,
//             530.2967581047382
//           ],
//           [
//             5.407,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             5.941,
//             20
//           ],
//           [
//             5.941221629630693,
//             544.211970074813
//           ],
//           [
//             6.143415937747066,
//             530.2967581047382
//           ],
//           [
//             6.142,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             6.721,
//             20
//           ],
//           [
//             6.721201782201079,
//             544.211970074813
//           ],
//           [
//             6.905289137351806,
//             530.2967581047382
//           ],
//           [
//             6.904,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             7.482,
//             20
//           ],
//           [
//             7.482201782201079,
//             544.211970074813
//           ],
//           [
//             7.666289137351806,
//             530.2967581047382
//           ],
//           [
//             7.665,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             8.269,
//             20
//           ],
//           [
//             8.269187447946358,
//             544.211970074813
//           ],
//           [
//             8.440197559288563,
//             530.2967581047382
//           ],
//           [
//             8.439,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             9.029,
//             20
//           ],
//           [
//             9.029209500645928,
//             544.211970074813
//           ],
//           [
//             9.220338448616628,
//             530.2967581047382
//           ],
//           [
//             9.219,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             9.83,
//             20
//           ],
//           [
//             9.830189653216316,
//             544.211970074813
//           ],
//           [
//             10.00321164822137,
//             530.2967581047382
//           ],
//           [
//             10.002,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             10.619,
//             20
//           ],
//           [
//             10.619190755851292,
//             544.211970074813
//           ],
//           [
//             10.793218692687773,
//             530.2967581047382
//           ],
//           [
//             10.792,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             11.41,
//             20
//           ],
//           [
//             11.410210603280909,
//             544.211970074813
//           ],
//           [
//             11.602345493083035,
//             530.2967581047382
//           ],
//           [
//             11.601000000000003,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             12.215,
//             20
//           ],
//           [
//             12.215212808550865,
//             544.211970074813
//           ],
//           [
//             12.409359582015838,
//             530.2967581047382
//           ],
//           [
//             12.408,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             13.050999999999998,
//             20
//           ],
//           [
//             13.051194063756228,
//             544.211970074813
//           ],
//           [
//             13.228239826086982,
//             530.2967581047382
//           ],
//           [
//             13.227,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             13.867,
//             20
//           ],
//           [
//             13.867179729501508,
//             544.211970074813
//           ],
//           [
//             14.031148248023738,
//             530.2967581047382
//           ],
//           [
//             14.03,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             14.669,
//             20
//           ],
//           [
//             14.669203987471036,
//             544.211970074813
//           ],
//           [
//             14.855303226284612,
//             530.2967581047382
//           ],
//           [
//             14.854,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             15.497999999999998,
//             20
//           ],
//           [
//             15.498173113691635,
//             544.211970074813
//           ],
//           [
//             15.656105981225318,
//             530.2967581047382
//           ],
//           [
//             15.654999999999998,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             16.288,
//             20
//           ],
//           [
//             16.28819957693112,
//             544.211970074813
//           ],
//           [
//             16.470275048419,
//             530.2967581047382
//           ],
//           [
//             16.469,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             17.096,
//             20
//           ],
//           [
//             17.096201782201078,
//             544.211970074813
//           ],
//           [
//             17.280289137351808,
//             530.2967581047382
//           ],
//           [
//             17.279,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             17.905,
//             20
//           ],
//           [
//             17.90521721909078,
//             544.211970074813
//           ],
//           [
//             18.103387759881453,
//             530.2967581047382
//           ],
//           [
//             18.102,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             18.772,
//             20
//           ],
//           [
//             18.7721852426764,
//             544.211970074813
//           ],
//           [
//             18.941183470355757,
//             530.2967581047382
//           ],
//           [
//             18.94,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             19.6,
//             20
//           ],
//           [
//             19.600186345311382,
//             544.211970074813
//           ],
//           [
//             19.77019051482216,
//             530.2967581047382
//           ],
//           [
//             19.769,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       }
//     ]
//   },
//   "Confidence": "Not Confident",
//   "nextTodo": "Labeling completed",
//   "complete": 100,
//   "Arrhythmia at the moment of recording": "No arrhythmia",
//   "S4": "No",
//   "S3": "Certain",
//   "Recording Informativeness": "Good",
//   "FINALIZED": true,
//   "Rhythm and Arrhythmias": "No arrhythmia",
//   "Heart Sound Informativeness": "Good",
//   "Lung Sound Informativeness": "Uninformative",
//   "aiSegmentation": "b41ffe35-fc2a-4e10-8420-95d9bfccef67",
//   "UPDATE_FB_SEG": true,
//   "assigned to": ""
// }


// let l2 = {
//   "_id": {
//     "$oid": "65a65e2042d448ca597107b7"
//   },
//   "id": "46c35175-5b68-419a-8759-282da490e32b",
//   "Segmentation URL": "http://ec2-54-235-192-121.compute-1.amazonaws.com:8002/?record_v3=9ASbG0DQawa2ajr0APjbqhVz8pG2/recordings/Android_vVIdAJrcJWpHqjaIMnDL&patientId=POT0354&position=leftDecubitus&spot=mitral&device=android",
//   "Examination ID": "POT0354",
//   "Source": {
//     "path": "9ASbG0DQawa2ajr0APjbqhVz8pG2/recordings/Android_vVIdAJrcJWpHqjaIMnDL",
//     "url": "https://firebasestorage.googleapis.com/v0/b/stethophonedata.appspot.com/o/9ASbG0DQawa2ajr0APjbqhVz8pG2%2Frecordings%2FAndroid_vVIdAJrcJWpHqjaIMnDL?alt=media&token=a212d058-d105-4f82-bd92-1accb4ad1fa2"
//   },
//   "Clinic": "POTASHEV",
//   "Age (Years)": "48",
//   "Sex at Birth": "Male",
//   "Ethnicity": "White",
//   "model": "android",
//   "deviceDescription": {
//     "osVersion": "14",
//     "model": "SM-S908B",
//     "deviceId": "UP1A.231005.007",
//     "brand": "samsung",
//     "manufacturer": "samsung"
//   },
//   "Body Position": "leftDecubitus",
//   "Body Spot": "Apex",
//   "Type of artifacts , Artifact": [
//     "Movement",
//     "Bowel sound"
//   ],
//   "Systolic murmurs": [
//     {
//       "type": "Systolic murmur undetermined",
//       "grade": "No grade"
//     }
//   ],
//   "Diastolic murmurs": [
//     {
//       "type": "No diastolic murmurs"
//     }
//   ],
//   "Other murmurs": [
//     {
//       "type": "No Other Murmurs"
//     }
//   ],
//   "Pathological findings": [
//     "No Pathology"
//   ],
//   "path": "9ASbG0DQawa2ajr0APjbqhVz8pG2/recordings/Android_vVIdAJrcJWpHqjaIMnDL",
//   "state": "Assign 2nd expert",
//   "CMO": "Yaroslav Shpak",
//   "TODO": "Finalized",
//   "updated at": "2024-09-15T19:44:29.675Z",
//   "updated by": "Yaroslav Shpak",
//   "Stage Comment": "Added by import utils",
//   "1st expert": "María José Aedo",
//   "2nd expert": "Ivanna Kuzyk",
//   "segmentation": {
//     "v2": true,
//     "S2": [
//       [
//         "0.225",
//         "0.303",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "0.977",
//         "1.059",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.707",
//         "1.783",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.443",
//         "2.521",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.183",
//         "3.259",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.923",
//         "4.008",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.659",
//         "4.733",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.407",
//         "5.484",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.142",
//         "6.223",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.904",
//         "6.989",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.665",
//         "7.747",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.439",
//         "8.519",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.219",
//         "9.303",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.002",
//         "10.088",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.792",
//         "10.869",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.601",
//         "11.688",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.408",
//         "12.494",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.227",
//         "13.306",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.030",
//         "14.119",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.854",
//         "14.940",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.655",
//         "15.735",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.469",
//         "16.552",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.279",
//         "17.363",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.102",
//         "18.180",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.940",
//         "19.030",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.769",
//         "19.855",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "S1": [
//       [
//         "0.709",
//         "0.808",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.439",
//         "1.536",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.201",
//         "2.290",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.937",
//         "3.023",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.670",
//         "3.759",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.417",
//         "4.514",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.132",
//         "5.224",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.855",
//         "5.941",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.629",
//         "6.721",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.392",
//         "7.482",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.173",
//         "8.269",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.944",
//         "9.029",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.732",
//         "9.830",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.525",
//         "10.619",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.310",
//         "11.410",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.129",
//         "12.215",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.954",
//         "13.051",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.773",
//         "13.867",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.577",
//         "14.669",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.405",
//         "15.498",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.195",
//         "16.288",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.002",
//         "17.096",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.823",
//         "17.905",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.657",
//         "18.772",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.507",
//         "19.600",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "S3": [
//       [
//         "0.374",
//         "0.478",
//         "0.944",
//         "65.043"
//       ],
//       [
//         "1.133",
//         "1.241",
//         "2.832",
//         "65.062"
//       ],
//       [
//         "2.614",
//         "2.715",
//         "-4.719",
//         "71.861"
//       ],
//       [
//         "4.095",
//         "4.189",
//         "0.000",
//         "56.854"
//       ],
//       [
//         "4.818",
//         "4.910",
//         "0.000",
//         "62.987"
//       ],
//       [
//         "5.582",
//         "5.671",
//         "0.000",
//         "51.380"
//       ],
//       [
//         "6.292",
//         "6.376",
//         "0.000",
//         "58.078"
//       ],
//       [
//         "7.074",
//         "7.171",
//         "0.000",
//         "54.664"
//       ],
//       [
//         "7.825",
//         "7.923",
//         "0.000",
//         "56.380"
//       ],
//       [
//         "8.611",
//         "8.693",
//         "0.000",
//         "61.776"
//       ],
//       [
//         "9.408",
//         "9.498",
//         "-3.776",
//         "67.311"
//       ],
//       [
//         "10.179",
//         "10.256",
//         "-3.776",
//         "65.536"
//       ],
//       [
//         "10.981",
//         "11.073",
//         "0.000",
//         "51.172"
//       ],
//       [
//         "11.763",
//         "11.853",
//         "0.000",
//         "57.229"
//       ],
//       [
//         "12.587",
//         "12.668",
//         "0.000",
//         "58.682"
//       ],
//       [
//         "13.390",
//         "13.478",
//         "0.000",
//         "57.078"
//       ],
//       [
//         "14.200",
//         "14.288",
//         "0.000",
//         "60.078"
//       ],
//       [
//         "15.037",
//         "15.121",
//         "0.000",
//         "61.369"
//       ],
//       [
//         "15.810",
//         "15.904",
//         "0.000",
//         "58.133"
//       ],
//       [
//         "16.650",
//         "16.739",
//         "0.000",
//         "60.048"
//       ],
//       [
//         "17.440",
//         "17.529",
//         "0.000",
//         "58.331"
//       ],
//       [
//         "18.290",
//         "18.373",
//         "0.000",
//         "65.246"
//       ],
//       [
//         "19.110",
//         "19.211",
//         "0.000",
//         "56.529"
//       ],
//       [
//         "1.853",
//         "1.936",
//         "17.968",
//         "58.797"
//       ],
//       [
//         "3.340",
//         "3.430",
//         "20.000",
//         "71.793"
//       ]
//     ],
//     "unsegmentable": [
//       [
//         "0.000",
//         "0.225",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.855",
//         "20.000",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "diastole": [
//       [
//         "0.303",
//         "0.709",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.059",
//         "1.439",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.783",
//         "2.201",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.521",
//         "2.937",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.259",
//         "3.670",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.008",
//         "4.417",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.733",
//         "5.132",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.484",
//         "5.855",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.223",
//         "6.629",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.989",
//         "7.392",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.747",
//         "8.173",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.519",
//         "8.944",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.303",
//         "9.732",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.088",
//         "10.525",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.869",
//         "11.310",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.688",
//         "12.129",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.494",
//         "12.954",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.306",
//         "13.773",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.119",
//         "14.577",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.940",
//         "15.405",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.735",
//         "16.195",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.552",
//         "17.002",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.363",
//         "17.823",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.180",
//         "18.657",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.030",
//         "19.507",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "systole": [
//       [
//         "0.808",
//         "0.977",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "1.536",
//         "1.707",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "2.290",
//         "2.443",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.023",
//         "3.183",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "3.759",
//         "3.923",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "4.514",
//         "4.659",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.224",
//         "5.407",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "5.941",
//         "6.142",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "6.721",
//         "6.904",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "7.482",
//         "7.665",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "8.269",
//         "8.439",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.029",
//         "9.219",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "9.830",
//         "10.002",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "10.619",
//         "10.792",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "11.410",
//         "11.601",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "12.215",
//         "12.408",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.051",
//         "13.227",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "13.867",
//         "14.030",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "14.669",
//         "14.854",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "15.498",
//         "15.655",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "16.288",
//         "16.469",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.096",
//         "17.279",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "17.905",
//         "18.102",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "18.772",
//         "18.940",
//         "0.000",
//         "22050.000"
//       ],
//       [
//         "19.600",
//         "19.769",
//         "0.000",
//         "22050.000"
//       ]
//     ],
//     "Murmur": [
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             2.29,
//             20
//           ],
//           [
//             2.2901687031517217,
//             544.211970074813
//           ],
//           [
//             2.444077803359707,
//             530.2967581047382
//           ],
//           [
//             2.443,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             0.808,
//             20
//           ],
//           [
//             0.8081863453113789,
//             544.211970074813
//           ],
//           [
//             0.9781905148221595,
//             530.2967581047382
//           ],
//           [
//             0.9770000000000001,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             1.536,
//             20
//           ],
//           [
//             1.5361885505813357,
//             544.211970074813
//           ],
//           [
//             1.7082046037549663,
//             530.2967581047382
//           ],
//           [
//             1.7069999999999999,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             3.023,
//             20
//           ],
//           [
//             3.0231764215965717,
//             544.211970074813
//           ],
//           [
//             3.1841271146245296,
//             530.2967581047382
//           ],
//           [
//             3.183,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             3.759,
//             20
//           ],
//           [
//             3.7591808321364857,
//             544.211970074813
//           ],
//           [
//             3.924155292490143,
//             530.2967581047382
//           ],
//           [
//             3.923,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             4.514,
//             20
//           ],
//           [
//             4.514159882071894,
//             544.211970074813
//           ],
//           [
//             4.6600214476284805,
//             530.2967581047382
//           ],
//           [
//             4.659,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             5.224,
//             20
//           ],
//           [
//             5.224201782201079,
//             544.211970074813
//           ],
//           [
//             5.408289137351806,
//             530.2967581047382
//           ],
//           [
//             5.407,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             5.941,
//             20
//           ],
//           [
//             5.941221629630693,
//             544.211970074813
//           ],
//           [
//             6.143415937747066,
//             530.2967581047382
//           ],
//           [
//             6.142,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             6.721,
//             20
//           ],
//           [
//             6.721201782201079,
//             544.211970074813
//           ],
//           [
//             6.905289137351806,
//             530.2967581047382
//           ],
//           [
//             6.904,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             7.482,
//             20
//           ],
//           [
//             7.482201782201079,
//             544.211970074813
//           ],
//           [
//             7.666289137351806,
//             530.2967581047382
//           ],
//           [
//             7.665,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             8.269,
//             20
//           ],
//           [
//             8.269187447946358,
//             544.211970074813
//           ],
//           [
//             8.440197559288563,
//             530.2967581047382
//           ],
//           [
//             8.439,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             9.029,
//             20
//           ],
//           [
//             9.029209500645928,
//             544.211970074813
//           ],
//           [
//             9.220338448616628,
//             530.2967581047382
//           ],
//           [
//             9.219,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             9.83,
//             20
//           ],
//           [
//             9.830189653216316,
//             544.211970074813
//           ],
//           [
//             10.00321164822137,
//             530.2967581047382
//           ],
//           [
//             10.002,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             10.619,
//             20
//           ],
//           [
//             10.619190755851292,
//             544.211970074813
//           ],
//           [
//             10.793218692687773,
//             530.2967581047382
//           ],
//           [
//             10.792,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             11.41,
//             20
//           ],
//           [
//             11.410210603280909,
//             544.211970074813
//           ],
//           [
//             11.602345493083035,
//             530.2967581047382
//           ],
//           [
//             11.601000000000003,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             12.215,
//             20
//           ],
//           [
//             12.215212808550865,
//             544.211970074813
//           ],
//           [
//             12.409359582015838,
//             530.2967581047382
//           ],
//           [
//             12.408,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             13.050999999999998,
//             20
//           ],
//           [
//             13.051194063756228,
//             544.211970074813
//           ],
//           [
//             13.228239826086982,
//             530.2967581047382
//           ],
//           [
//             13.227,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             13.867,
//             20
//           ],
//           [
//             13.867179729501508,
//             544.211970074813
//           ],
//           [
//             14.031148248023738,
//             530.2967581047382
//           ],
//           [
//             14.03,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             14.669,
//             20
//           ],
//           [
//             14.669203987471036,
//             544.211970074813
//           ],
//           [
//             14.855303226284612,
//             530.2967581047382
//           ],
//           [
//             14.854,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             15.497999999999998,
//             20
//           ],
//           [
//             15.498173113691635,
//             544.211970074813
//           ],
//           [
//             15.656105981225318,
//             530.2967581047382
//           ],
//           [
//             15.654999999999998,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             16.288,
//             20
//           ],
//           [
//             16.28819957693112,
//             544.211970074813
//           ],
//           [
//             16.470275048419,
//             530.2967581047382
//           ],
//           [
//             16.469,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             17.096,
//             20
//           ],
//           [
//             17.096201782201078,
//             544.211970074813
//           ],
//           [
//             17.280289137351808,
//             530.2967581047382
//           ],
//           [
//             17.279,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             17.905,
//             20
//           ],
//           [
//             17.90521721909078,
//             544.211970074813
//           ],
//           [
//             18.103387759881453,
//             530.2967581047382
//           ],
//           [
//             18.102,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             18.772,
//             20
//           ],
//           [
//             18.7721852426764,
//             544.211970074813
//           ],
//           [
//             18.941183470355757,
//             530.2967581047382
//           ],
//           [
//             18.94,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       },
//       {
//         "name": "Systolic murmur undetermined",
//         "type": "annotation-polygon",
//         "points": [
//           [
//             19.6,
//             20
//           ],
//           [
//             19.600186345311382,
//             544.211970074813
//           ],
//           [
//             19.77019051482216,
//             530.2967581047382
//           ],
//           [
//             19.769,
//             20
//           ]
//         ],
//         "additionalNames": [],
//         "alternativeNames": [
//           "systole",
//           "diastole",
//           "unsegmentable"
//         ]
//       }
//     ]
//   },
//   "Confidence": "Not Confident",
//   "nextTodo": "Labeling completed",
//   "complete": 100,
//   "Arrhythmia at the moment of recording": "No arrhythmia",
//   "S4": "No",
//   "S3": "Certain",
//   "Recording Informativeness": "Good",
//   "FINALIZED": true,
//   "Rhythm and Arrhythmias": "No arrhythmia",
//   "Heart Sound Informativeness": "Good",
//   "Lung Sound Informativeness": "Uninformative",
//   "aiSegmentation": "b41ffe35-fc2a-4e10-8420-95d9bfccef67",
//   "UPDATE_FB_SEG": true,
//   "assigned to": ""
// }

// console.log(JSON.stringify(checker.diff(l1, l2)))
// console.log(merge([l1,l2]))