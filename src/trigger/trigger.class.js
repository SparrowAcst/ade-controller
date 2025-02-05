const { extend } = require("lodash")
const uuid = require("uuid").v4


const DEFAULT_OPTIONS = {
	name: "dummy",
	state: "", //"stopped", // initiated, started
	pipeline: [{
		$limit: 0
	}],
	schema: "",
	interval: [1, "hours"]
}

const Trigger = class {

	constructor(options){
		options = extend({}, options, DEFAULT_OPTIONS )
	}

	async start(){

	}

	async init(){

	}

	async stop(){

	}

	async save(){

	}

}