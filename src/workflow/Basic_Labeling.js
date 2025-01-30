// TODO DEFFERED_TIMEOUT
// TODO pretendentCriteria


const { extend } = require("lodash")
const Agent  = require("./Basic_Labeling_Agent.class")
const uuid = require("uuid").v4


const Basic_Labeling_1st_Agent = class extends Agent {

    constructor(options){
        options = extend({}, options, {
            ALIAS: "Basic_Labeling_1st",
            NEXT_AGENT: "Basic_Labeling_2nd",
            decoration: {
                icon: "mdi-numeric-1-box-outline",
                class: "Basic_Labeling_1st"
            }    
        })
        
        super(options)
    }

    async create({ schema, dataId, metadata }){
        
        const { Task, Key } = this.getEmployeeService()

        let key = Key()
                    .fromDescription({
                        workflowType: this.WORKFLOW_TYPE,
                        workflowId: uuid(),
                        taskType: this.ALIAS,
                        // taskId: uuid(),
                        // taskState: "start",
                        schema,
                        dataCollection: this.dataCollection,
                        dataId,
                        savepointCollection: this.savepointCollection
                    })
                    .get()
       
        await super.create({
            sourceKey: key,
            metadata: extend({}, metadata, {
                task: "Basic_Labeling_1st",
                initiator: "assigned automatically",
                status: "start"
            })
        })
    
    }

    uiPermissions(){
        return ["open", "rollback", "sync", "history", "save", "submit"]
    }

}

const Basic_Labeling_2nd_Agent = class extends Agent {

    constructor(options){
        options = extend({}, options, {
            ALIAS: "Basic_Labeling_2nd",
            NEXT_AGENT: "Basic_Labeling_Quality_Check",
            PREV_AGENT: "Basic_Relabeling_1st",
            decoration: {
                icon: "mdi-numeric-2-box-outline",
                class: "Basic_Labeling_2nd"
            }    
        })
        
        super(options)
    }

        uiPermissions(){
        return ["open", "rollback", "sync", "history", "save", "reject", "submit"]
    }

}

const Basic_Labeling_Quality_Check_Agent = class extends Agent {

    constructor(options){
        options = extend({}, options, {
            ALIAS: "Basic_Labeling_Quality_Check",
            NEXT_AGENT: "Basic_Labeling_Finalization",
            PREV_AGENT: "Basic_Relabeling_2nd",
            decoration: {
                icon: "mdi-numeric-3-box-outline",
                class: "Basic_Labeling_Quality_Check"
            }    
        })
        
        super(options)
    }

    uiPermissions(){
        return ["open", "rollback", "sync", "history", "save", "reject", "submit"]
    }

}

const Basic_Labeling_Finalization_Agent = class extends Agent {

    constructor(options){
        options = extend({}, options, {
            ALIAS: "Basic_Labeling_Finalization",
            PREV_AGENT: "Basic_Labeling_Quality_Recheck",
            decoration: {
                icon: "mdi-numeric-4-box-outline",
                class: "Basic_Labeling_Finalization"
            }    
        })
        
        super(options)
    }

    uiPermissions(){
        return ["open", "rollback", "sync", "history", "save", "reject", "submit"]
    }

}

const Basic_Relabeling_1st_Agent = class extends Agent {

    constructor(options){
        options = extend({}, options, {
            ALIAS: "Basic_Relabeling_1st",
            NEXT_AGENT: "Basic_Labeling_2nd",
            decoration: {
                icon: "mdi-numeric-1-box-outline",
                class: "Basic_Relabeling_1st"
            }    
        })
        
        super(options)
    }

    uiPermissions(){
        return ["open", "rollback", "sync", "history", "save", "submit"]
    }

}

const Basic_Relabeling_2nd_Agent = class extends Agent {

    constructor(options){
        options = extend({}, options, {
            ALIAS: "Basic_Relabeling_2nd",
            NEXT_AGENT: "Basic_Labeling_Quality_Check",
            PREV_AGENT: "Basic_Relabeling_1st",
            decoration: {
                icon: "mdi-numeric-2-box-outline",
                class: "Basic_Relabeling_2nd"
            }    
        })
        
        super(options)
    }

    uiPermissions(){
        return ["open", "rollback", "sync", "history", "save", "reject", "submit"]
    }

}

const Basic_Labeling_Quality_Recheck_Agent = class extends Agent {

    constructor(options){
        options = extend({}, options, {
            ALIAS: "Basic_Labeling_Quality_Recheck",
            NEXT_AGENT: "Basic_Labeling_Finalization",
            PREV_AGENT: "Basic_Relabeling_2nd",
            decoration: {
                icon: "mdi-numeric-3-box-outline",
                class: "Basic_Labeling_Quality_Recheck"
            }    
        })
        
        super(options)
    }

    uiPermissions(){
        return ["open", "rollback", "sync", "history", "save", "reject", "submit"]
    }

}

module.exports = [
    
    Basic_Labeling_1st_Agent,
    Basic_Labeling_2nd_Agent,
    Basic_Labeling_Quality_Check_Agent,
    Basic_Labeling_Finalization_Agent,

    Basic_Relabeling_1st_Agent,
    Basic_Relabeling_2nd_Agent,
    Basic_Labeling_Quality_Recheck_Agent,

    require("./Deffered.class")

]
