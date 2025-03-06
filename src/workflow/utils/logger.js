const { basename } = require("path")
module.exports = module => (...args) => {
    const e = new Error('log')
    let line = (e.stack.split('\n')[2] || "").trim()    
    let s = line.split(/\(|\)/g)
    let func = s[0]
    let module = "..."
    if(s[1]){
    	module = basename(s[1])
    	func = "| " + func 
    } else {
    	s = func.split(" ").map( d => d.trim())
    	module = (s[1]) ? basename(s[1]) : "..."
    	func = "|"
    }
    

    console.log(new Date(), func, module, "|", ...args);
}
