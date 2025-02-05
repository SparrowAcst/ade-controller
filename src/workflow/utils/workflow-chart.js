const { getUrl } = require("../../utils/plantuml")

const { flatten } = require("lodash")

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


module.exports = data => getUrl(
  
  plantUml(
    package(
      data.name,
      flatten(
        data.agents.map( agent => [
          link(agent.name, agent.submitTo, "-->", "submit"),
          (agent.rejectTo) ? link(agent.name, agent.rejectTo, "-u->", "reject") : ""
        ])
      ).join("\n")  
    )
  )
  
)  

