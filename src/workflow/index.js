const { keys, isFunction } = require("lodash")

const AGENT_CLASSES = require("./Basic_Labeling")

let AGENTS

const close = async () => {

    for (const agentAlias of keys(AGENTS)) {
        await AGENTS[agentAlias].close()
    }

}

const normalizeSelector = selector => {
    selector = selector || (() => true)
    selector = (isFunction(selector)) ? selector : (() => true)

    return selector
}


const init = async () => {

    if(!AGENTS){
        console.log("Workflow init...")
        AGENTS = {}
        for (const AgentClass of AGENT_CLASSES) {
            console.log(AgentClass)
            let agent = new AgentClass()
            AGENTS[agent.alias] = agent
            await agent.start()
            console.log(`${agent.ALIAS}: SUBMIT > ${agent.NEXT_AGENT}, REJECT: > ${agent.PREV_AGENT}`)
        }

        console.log("Workflow started")
    }    

    return {
        select: selector => {
            selector = normalizeSelector(selector)
            return  keys(AGENTS)
                        .filter(key => selector(AGENTS[key]))
                        .map( key => AGENTS[key])
        },
        agent: alias => AGENTS[alias],
        close
    }

}


module.exports = init


// const data =[ 
// "3c0f4295-f2cc-4b3b-a47f-d050b3b2533c"
// ,"0a104be1-edc5-4451-9168-7437aea116bd"

// // ,"549aa4f4-da03-4484-b73b-888c2a054ffb"
// // ,"bc8399c2-2127-4090-8a3a-bb3243e827f8"
// // ,"272509f1-d873-4eb2-bf05-d7bb9e42a4a9"
// // ,"c82b3f58-7b9e-4732-ba18-9a0c2f3a277d"
// // ,"79e3a6da-fe6f-4dd2-8d7f-d91acba94761"
// // ,"1bfbb67e-67d6-4325-93db-dd7469d6695f"
// // ,"91dc994f-f219-4535-9e42-cbdd1128f45b"
// // ,"1098d1e3-98ba-4fa4-b9f7-93c8617bbcc7"

// // ,"d5d18c7f-24d5-4812-8e85-f9910eb9489b"
// // ,"38956faa-dfb8-49fc-a6fa-996b42a1ba81"
// // ,"7825ea5d-6ff5-4409-be57-c98a03ed25e3"
// // ,"188dc4ea-e641-4ced-b1f0-30ee3d5a8ac6"
// // ,"ff60f385-4090-40fa-a5c5-ca54b5e14b52"
// // ,"b0705c69-8965-4f9e-ab4b-8935af243d48"
// // ,"7345ea49-e11f-4dae-9548-35baf81f65c9"
// // ,"5141801e-6ba0-4c6d-b646-6846f8398917"
// // ,"c5a19fc5-9da8-4484-9b26-640729508863"
// // ,"88969e24-3582-4459-89f4-4dcc1ed9585e"
// ]

// const test = async () => {

//     const WORKFLOW = await init()
//     // console.log(WORKFLOW.listWorkflows())
//     console.log(WORKFLOW.select().map(a => a.ALIAS))
//     const SCHEMA = "strazhesko-part-1"
//     // const DATA_ID = "1098d1e3-98ba-4fa4-b9f7-93c8617bbcc7"
//     // let user = "Andrey Boldak"


// // //////////////////////////////////// STAGE 1 /////////////////////////////////////////////////////

    
//     let agent = WORKFLOW.agent("Basic_Labeling_1st")

//     for(const DATA_ID of data){
//       let task = await agent.create({
//           schema: SCHEMA,
//           dataId: DATA_ID
//       })
//     }
    
// }

// test()

















    // setTimeout(async () => {
        
    //     let emp = agent.getEmployeeService().employee(user)
    //     let task = last(emp.taskList)
    //     console.log(">>>", task)
    //     branch = await agent.read(task.key)
    //     // console.log("BRANCH",branch)
        
    //     let data = branch.data
    //     data.CHANGED = `by ${user}`

    //     let save = await agent.save({
    //         user,
    //         sourceKey: branch.task.key,
    //         data,
    //         metadata:{
    //             comment: "test save for Basic Labeling 1st agent"
    //         }
    //     })

    //     save = await agent.read(save.key)
    //     data = save.data
    //     data.CHANGED = data.CHANGED + ` and ${user} MARKER 1`

    //     save = await agent.save({
    //         user,
    //         sourceKey: save.task.key,
    //         data,
    //         metadata:{
    //             comment: "test save for Basic Labeling 1st agent next save"
    //         }
    //     })

    //     save = await agent.read(save.key)

    //     data = save.data
    //     data.CHANGED = data.CHANGED + ` and submitted by ${user} MARKER 2`

    //     let submit = await agent.submit({
    //         user,
    //         sourceKey: save.task.key,
    //         data,
    //         metadata:{
    //             comment: "test submit for Basic Labeling 1st agent next save"
    //         }
    //     })
        
    //     // setTimeout(async () => {
            
    //     //     console.log("ROLLBACK")
            
    //     //     let rollback = await agent.rollback({user, sourceKey: submit.key})
            
    //     //     let d = await agent.read(save.task.key)
    //     //     console.log("SAVE DATA", d.data.CHANGED)
            
    //     //     d = await agent.read(submit.key)
    //     //     console.log("SUBMIT DATA", d.data.CHANGED)
    //     //     d = await agent.read(rollback.key)
    //     //     console.log("ROLLBACK DATA", d.data.CHANGED)
            
    //     // }, 10000)

    //     // submit = await agent.read(submit.key)    
            
    //     // data = submit.data
    //     // data.CHANGED = data.CHANGED + ` and commited by ${user}`

    //     // let commit = await agent.commit({
    //     //     user,
    //     //     sourceKey: submit.task.key,
    //     //     data,
    //     //     metadata:{
    //     //         comment: "test commit for Basic Labeling 1st agent next save"
    //     //     }
    //     // })

    //     // commit = await agent.read(commit.key)
            
    //     // console.log(submit)


    // }, 8000)

///////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////// STAGE 2 //////////////////////////////////////////////////////////
   
   // const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Labeling_2nd.b99375e9-6165-4c65-89f5-6125774b97df.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.d42ec03a-656c-4e47-ad3b-f7c1663b0b53"



   // let br = await WORKFLOW.agent("Basic_Labeling_2nd").reject({
   //      user: "Andrii Boldak Dev.",
   //      sourceKey: key,
   //      metadata: {
   //          comment: "test reject"
   //      },
         
   // })

   //  return

 

///////////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////// STAGE 3 /////////////////////////////////////////////////////////

// const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Relabeling_1st.8dd9b194-b6ad-4d99-9f23-6c6bec7010b3.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.76dabd0c-152b-488d-bb23-098f360b4442"




// let submit = await WORKFLOW.agent("Basic_Relabeling_1st").submit({
//             user: "Andrey Boldak",
//             sourceKey: key,
//             data: {},
//             metadata:{
//                 comment: "test submit after rejection"
//             }
//         })



///////////////////////////////////////////////////////////////////////////////////////////////////////////



///////////////////////////////////////// STAGE 4 /////////////////////////////////////////////////////////

// const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Labeling_2nd.a55f0102-4410-46ff-801a-39d225b2dd45.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.5448cc6f-ec49-4d7d-8ff0-a67f28d2a7b6"




// let submit = await WORKFLOW.agent("Basic_Labeling_2nd").submit({
//             user: "Andrii Boldak Dev.",
//             sourceKey: key,
//             data: {},
//             metadata:{
//                 comment: "test submit"
//             }
//         })



///////////////////////////////////////////////////////////////////////////////////////////////////////////

/////////////////////////////////////// STAGE 5 /////////////////////////////////////////////////////////////

   //  const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Labeling_Quality_Check.a7d4757e-fb54-4eda-b82d-24e47b6b4c56.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.a3b81efb-0c5d-47a1-92e3-f531be2f5025"



   //  let submit =  await WORKFLOW.agent("Basic_Labeling_Quality_Check").submit({
   //      user: "Andrii Boldak Dev.",
   //      sourceKey: key,
   //      data: {},
   //      metadata: {
   //          comment: "test submit"
   //      },
         
   // })


/////////////////////////////////////////////////////////////////////////////////////////////////////////////



//////////////////////////////////////// STAGE 6 //////////////////////////////////////////////////////////
   
   // const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Labeling_Finalization.d8d23225-9c07-457f-850a-b12c9fe5375a.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.5d02ba68-571c-4a7b-8449-fc53dce0f5c1"



   // let r1 = await WORKFLOW.agent("Basic_Labeling_Finalization").reject({
   //      user: "Andrey Boldak",
   //      sourceKey: key,
   //      metadata: {
   //          comment: "test reject"
   //      },
         
   // })

   // const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Labeling_Quality_Recheck.f0060333-eff0-4404-9aa9-4634a8dab98d.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.32b06d69-97a0-4883-b667-32cc7c6b7f3e"
   // let r2 = await WORKFLOW.agent("Basic_Labeling_Quality_Recheck").reject({
   //      user: "Andrii Boldak Dev.",
   //      sourceKey: key,
   //      metadata: {
   //          comment: "test reject"
   //      },
         
   // })

   // console.log(r2)


   // const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Relabeling_2nd.f11281e7-2e29-431b-8eca-bcc0cbe28b6c.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.5bac4eaa-ffd2-480c-8415-101ddafa15e5"
   // let r3 = await WORKFLOW.agent("Basic_Relabeling_2nd").reject({
   //      user: "Andrey Boldak",
   //      sourceKey: key,
   //      metadata: {
   //          comment: "test reject"
   //      },
         
   // })

   //  return


///////////////////////////////////////////////////////////////////////////////////////////////////////////


///////////////////////////////////////// STAGE 3 /////////////////////////////////////////////////////////

// const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Relabeling_1st.4782c63a-f0f8-4108-95f6-86303d8b1d1b.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.63eeb903-2815-4057-b84a-d53b41d7f821"



// let submit = await WORKFLOW.agent("Basic_Relabeling_1st").submit({
//             user: "Andrii Boldak Dev.",
//             sourceKey: key,
//             data: {},
//             metadata:{
//                 comment: "test submit after rejection"
//             }
//         })




// const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Labeling_2nd.eb3282ba-0d1d-4fd8-a414-db3b5d6a39fa.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.3b66bd4f-90e3-459f-a132-9cf10eb0faf6"

// let submit = await WORKFLOW.agent("Basic_Relabeling_1st").submit({
//             user: "Andrey Boldak",
//             sourceKey: key,
//             data: {},
//             metadata:{
//                 comment: "test submit after rejection"
//             }
//         })


// const key = "Basic_Labeling.adf921fe-71ab-4275-8631-cd9d14396011.Basic_Labeling_2nd.9898b902-59dc-4656-9f85-49bd93c7bb81.start.strazhesko-part-1.labels.8f9044eb-c1b5-466b-99f9-dd287e623830.savepoints.608ae239-79ab-42d7-b6ee-2d15e5aa849f"

// let submit = await WORKFLOW.agent("Basic_Labeling_2nd").submit({
//             user: "Andrey Boldak",
//             sourceKey: key,
//             data: {},
//             metadata:{
//                 comment: "test commit"
//             }
//         })




// ///////////////////////////////////////////////////////////////////////////////////////////////////////////


// }

// test()