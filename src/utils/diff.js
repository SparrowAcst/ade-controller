const { keys, isArray, last, first } = require("lodash")

const jsondiffpatch = require('jsondiffpatch')

const Diff = jsondiffpatch.create({
	objectHash: (d, index)  => d.name || d.id || d,
	propertyFilter: name => !([
		"updated at",
		"updated by",
		"complete",
		"_import",
		"supd",
		"nextTodo"
	].includes(name))
})


Diff.format = (delta, parentKey) => {
	let res = []
	delta = jsondiffpatch.clone(delta)
	
	keys(delta).forEach( key => {
		
		if(key == "_t") return
		
		let publicParentKey = parentKey || ""
		let publicSelfKey = (keys(delta).includes("_t")) ? "" : key

		let publicKey = [publicParentKey,publicSelfKey].filter(d => d).join(".")	

		if(isArray(delta[key])){
			let op
			if(delta[key].length == 1) op = "insert"
			if(delta[key].length == 2) op = "update"
			if(delta[key].length == 3 && last(delta[key]) == 0 ) op = "remove"
			
			let oldValue
			if(delta[key].length == 1) oldValue = undefined
			if(delta[key].length == 2) oldValue = first(delta[key])
			if(delta[key].length == 3 && last(delta[key]) == 0 ) oldValue = first(delta[key])

			let newValue
			if(delta[key].length == 1) newValue = last(delta[key])
			if(delta[key].length == 2) newValue = last(delta[key])
			if(delta[key].length == 3 && last(delta[key]) == 0 ) newValue = undefined

			res.push({
				key: publicKey,
				op,
				oldValue,
				newValue
			})

		} else {

			res = res.concat(Diff.format(delta[key], publicKey))

		}	

	})

	return res
}


const SegmentationDiff = jsondiffpatch.create({
	objectHash: (d, index)  => d.name || d.id || index,
	// propertyFilter: name => !([
	// 	"updated at",
	// 	"updated by",
	// 	"complete",
	// 	"_import",
	// 	"supd",
	// 	"nextTodo"
	// ].includes(name))
})

SegmentationDiff.format = Diff.format

module.exports = {
	Diff, 
	SegmentationDiff
}	
	
// {
// 	format: Diff.format,
// 	diff: Diff.diff
// }