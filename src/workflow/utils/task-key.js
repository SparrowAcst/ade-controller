
const parseKey = taskKey => {
    let result = {};
    ([
        result.workflowType,
        result.workflowId,
        result.taskType,
        result.taskId,
        result.taskState,
        result.schema,
        result.dataCollection,
        result.dataId,
        result.savepointCollection,
        result.versionId
    ] = taskKey.split("."));

    return result
}

const buildKey = d => {
    return `${d.workflowType}.${d.workflowId}.${d.taskType}.${d.taskId}.${d.taskState}.${d.schema}.${d.dataCollection}.${d.dataId}.${d.savepointCollection}.${d.versionId}`
}

const buildVersionManagerKey = d => {
    return `${d.schema}.${d.dataCollection}.${d.dataId}.${d.savepointCollection}`
}

const identity = d => {
    return `${d.workflowType}.${d.workflowId}.${d.taskType}.${d.taskId}`
}



const TaskKey = class {
    
    constructor(key){
        this.key = key
        this.description = parseKey(this.key)
    }

    getDescription(){
        return this.description
    }

    workflowType(value){
        if(value){
            this.description.workflowType = value
            return this
        }
        return this.description.workflowType
    }

    workflowId(value){
        if(value){
            this.description.workflowId = value
            return this
        }
        return this.description.workflowId
    }

    taskType(value){
        if(value){
            this.description.taskType = value
            return this
        }
        return this.description.taskType
    }

    agent(value){
        return this.taskType(value)
    }

    taskId(value){
        if(value){
            this.description.taskId = value
            return this
        }
        return this.description.taskId
    }

    taskState(value){
        if(value){
            this.description.taskState = value
            return this
        }
        return this.description.taskState
    }

    schema(value){
        if(value){
            this.description.schema = value
            return this
        }
        return this.description.schema
    }

    dataCollection(value){
        if(value){
            this.description.dataCollection = value
            return this
        }
        return this.description.dataCollection
    }

    dataId(value){
        if(value){
            this.description.dataId = value
            return this
        }
        return this.description.dataId
    }

    savepointCollection(value){
        if(value){
            this.description.savepointCollection = value
            return this
        }
        return this.description.savepointCollection
    }
    
    versionId(value){
        if(value){
            this.description.versionId = value
            return this
        }
        return this.description.versionId
    }

    get(){
        return buildKey(this.description)
    }

    fromDescription(description){
        this.description = description
        return this
    }

    getDataKey(){
        return buildVersionManagerKey(this.description)
    }

    getIdentity(){
        return identity(this.description)
    }

}

module.exports = key => {
    key = key || "....."
    return new TaskKey(key)
}
