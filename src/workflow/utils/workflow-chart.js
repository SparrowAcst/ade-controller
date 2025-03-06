
const log  = require("./logger")(__filename) //(path.basename(__filename))

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
    "requiredExperts": {
      title: "Expert participation required",
      value: d => (d) ? `${d.count} from list: ${d.experts.join(", ")}` : null
    },
    "assignPretendent": {
      title: "Assign to expert",
      value: d => (d) ? d.join(", ") : null
    },
    "canCreate": {
      title: "Creating a task is possible",
      value: d => d
    },  
    "initialStatus": {
      title: "Initial task state",
      value: d => d || "start"
    },  
    "altCount": {
      title: "Number of alternatives",
      value: d => d
    },  
    "maxIteration": {
      title: "Number of iterations",
      value: d => d
    }  
  }

  let result = keys(fields)
                .map( key => ({
                  name: fields[key].title, 
                  value: fields[key].value(agent[key])
                }))
                .filter( d => d.value)
                .map( d => `${agent.name.split(" ").join("_")}: ${d.name}: ${d.value}`)

  return result              

}

module.exports = data => {
  log(data)
  let text = plantUml(
    package(
      data.name,
      flatten(
        data.agents.map( agent => [
          link(agent.name, agent.submitTo, "-->", "submit"),
          (agent.rejectTo) ? link(agent.name, agent.rejectTo, "-u->", "reject") : "",
          (agent.initial) ? link("", agent.name, "-->", "emit") : "",
        ])
      ).concat(
        flatten(
          data.agents.map( agent => state(agent))
        )
      ).join("\n")  
    ) + ((data.description) ? `\n${data.name}: ${JSON.stringify(data.description)}` : "")
  )
  log(text)
  return getUrl(text)  
}
