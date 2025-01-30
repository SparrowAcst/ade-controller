const createController = require("../utils/task-controller")
const { extend, first, groupBy, keys, last } = require("lodash")
const moment = require("moment")
const uuid = require("uuid").v4
const mongodb = require("../mongodb")

let options = {
    db: {
        url: "mongodb+srv://jace:jace@jace.llb8spm.mongodb.net/?retryWrites=true&w=majority",
        name: "wf-test"
    },
    dataView: d => ({
        "Patient ID": d["Examination ID"],
        "Device": d.model,
        "Body Spot": d["Body Spot"],
        "S3": (d.segmentation && d.segmentation.S3 && d.segmentation.S3.length > 0) ? "present" : " ",
        "Murmurs": (
                (d["Systolic murmurs"].filter( d => d != "No systolic murmurs").length + 
                d["Diastolic murmurs"].filter( d => d != "No diastolic murmurs").length +
                d["Other murmurs"].filter( d => d != "No Other Murmurs").length) > 0
            ) ? "present" : " ",
        "Complete": d.complete
    })
}


const recordId = [
    "4084eaac-d234-475b-83da-5627ca659698",
    "e228a545-bb0c-4a66-9fd9-a180c0b7448b"
]


const run = async () => {

    let buffer = await mongodb.aggregate({
        db: options.db,
        collection:`${options.db.name}.labels`,
        pipeline:[
            {
                $match:{
                    id:{
                        $in: recordId, //["af40d78c-84f9-49b3-9d9d-ed33e99858bd"] //, "ae4e3cd1-2ccc-4acf-84c2-b25f4a1167db"]
                    }
                    // "S3":{
                    //     $ne: "No"
                    // },
                    // setS3CheckTask:{
                    //     $exists: false
                    // }
                }
            },
            {
                $limit: 2
            }
        ]
    })

    let controller = createController(options)
    let initiated = await controller.initData({
        dataId: buffer.map( d => d.id)
    })

    initiated = initiated.map( d => {
        
        console.log("!!!!!!!!!!", d.metadata)

        if(d.metadata.lock){
            console.log("IGNORE BY LOCK")
            return
        }
       
        let task = (d.metadata) ? d.metadata.task || {} : {}
        task = extend({}, task, {
        // actual_task: "none",
        // actual_status: "none",
        Cross_Validation_2nd:{
            id: uuid(),
            status:"open",
            updatedAt: new Date()
        }})
        
        d.metadata = extend({}, d.metadata, { task, lock: true })

        console.log(d.metadata)
        return d
    }).filter( d => d)

    if(initiated.length == 0) return
        
    await controller.updateVersion({
        version: initiated
    })


    await controller.updateVersion({
        version: initiated
    })


}



run()