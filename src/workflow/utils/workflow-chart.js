const { getUrl } = require("../../utils/plantuml")

const { flatten, keys, isArray } = require("lodash")

const plantUml = content => `
  @startuml
  ${content}
  @enduml
`

const package = (name, content) => `
state ${name} {
  ${content}
}
`
const link = (source, target, direction ,label) => `
${(source || "[*]").split(" ").join("_")} ${direction} ${(target || "[*]").split(" ").join("_")}: ${label || ""}
`

const state = agent => {
  
  const fields = {
    // "type": "Type", 
    "assignPretendent": "Assign to expert",
    "canCreate": "Creating a task is possible",
    "initialStatus": "Initial task state",
    "altCount": "Number of alternatives",
    "maxIteration": "Number of iterations"
  }

  let result = keys(fields)
                .map( key => ({
                  name: fields[key], 
                  value: (key == "initialStatus") 
                    ? agent[key] || "start" 
                    : (isArray(agent[key])) 
                        ? agent[key].join(", ")
                        : agent[key]
                }))
                .filter( d => d.value)
                .map( d => `${agent.name.split(" ").join("_")}: ${d.name}: ${d.value}`)

  return result              

}

module.exports = data => {
  let text = plantUml(
    package(
      data.name,
      flatten(
        data.agents.map( agent => [
          link(agent.name, agent.submitTo, "-->", "submit"),
          (agent.rejectTo) ? link(agent.name, agent.rejectTo, "-u->", "reject") : ""
        ])
      ).concat(
        flatten(
          data.agents.map( agent => state(agent))
        )
      ).join("\n")  
    )
  )
  console.log(text)
  return getUrl(text)  
}
