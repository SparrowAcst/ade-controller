const NodeCache = require("node-cache")
const EventEmitter = require("events")
const { isFunction } = require("lodash")

const Cachable = class extends EventEmitter {
 
    #cache
    #options
    
    constructor(options){
        
        super()

        this.#cache = new NodeCache()
        this.#options = options || {}
    
    }

    async get(key){
        
        let value
        
        if(!this.#cache.has(key) && this.#options.beforeRead && isFunction(this.#options.beforeRead)) {
            value = await this.#options.beforeRead(key)
        }
        
        if(value){
            this.#cache.set(key, value)
        }
        
        value = (this.#cache.has(key)) ? this.#cache.get(key) : undefined
        
        if(value &&this.#options.afterRead && isFunction(this.#options.afterRead)) {
            value = await this.#options.afterRead(key, value)
        }
                
        this.emit("get", {key, value})
        
        return value
    }

    async set(key, value){
        
        if(this.#options.beforeWrite && isFunction(this.#options.beforeWrite)) {
            value = await this.#options.beforeWrite(key, value)
        }
        
        if(value){
            this.#cache.set(key, value)
        }

        if( this.#options.afterWrite && isFunction(this.#options.afterWrite)){
            await this.#options.onWrite(key, value)
        }
        
        this.emit("set", {key, value})
    }

    del(key){
        if(this.#cache.has(key)) this.#cache.del(key)
    }

    keys(){
      
      return this.#cache.keys()  
    
    } 
    
    getStats(){
      
      return this.#cache.getStats()
    
    }

    selectKeys(selector){
        selector = selector || (() => true)
        return this.keys().filter(selector)
    }

    selectData(selector){
        selector = selector || (() => true)
        return this.keys().map(key => this.#cache.get(key)).filter(selector)
    }

}

module.exports = Cachable
