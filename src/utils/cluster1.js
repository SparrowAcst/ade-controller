
const jsondiffpatch = require("jsondiffpatch")
const { find, min } = require("lodash")

const checker = jsondiffpatch.create({
    objectHash: d  => JSON.stringify(d)
})

const isEqualArrays = (a1, a2) => !checker.diff( a1, a2 )

const euclidianDistance = (vec1, vec2) => {
    // var N = vec1.length;
    // var d = 0;
    // for (var i = 0; i < N; i++)
    //   d += Math.pow(vec1[i] - vec2[i], 2)
    // d = Math.sqrt(d);
    // return d;

    return Math.sqrt(
      vec1.map( (d, i) => Math.pow(vec1[i] - vec2[i], 2)).reduce((a,b) => a+b, 0)
    )

  }

const manhattanDistance = (vec1, vec2) => {
    var N = vec1.length;
    var d = 0;
    for (var i = 0; i < N; i++)
      d += Math.abs(vec1[i] - vec2[i])
    return d;
  }

const maxDistance = (vec1, vec2) => {
    var N = vec1.length;
    var d = 0;
    for (var i = 0; i < N; i++)
      d = Math.max(d, Math.abs(vec1[i] - vec2[i]));
    return d;
  }


const vectorSum = vectors => {
    let res = vectors[0]
    for (let i = 1; i < vectors.length; i++){
      res = res.map( (d, index) => vectors[i][index] + d)
    }
    // console.log("vectorSum", vectors, res)
    return res
  }

const vectorScale = (scalar, vec) => {
  // console.log("vectorScale", scalar, vec, vec.map( v => v * scalar))
  return vec.map( v => v * scalar)
}  

const centroid = vectors => {
  return vectorScale(1/vectors.length, vectorSum(vectors.map(v => v.scaledCoord)))
}  


  function getRandomVectors(k, vectors) {
    /*  Returns a array of k distinct vectors randomly selected from a the input array of vectors
     Returns null if k > n or if there are less than k distinct objects in vectors */

    var n = vectors.length;
    if (k > n)
      return null;

    var selected_vectors = new Array(k);
    var selected_indices = new Array(k);

    var tested_indices = new Object;
    var tested = 0;
    var selected = 0;
    var i, vector, select;
    while (selected < k) {
      if (tested == n)
        return null;

      var random_index = Math.floor(Math.random() * (n));
      if (random_index in tested_indices)
        continue;

      tested_indices[random_index] = 1;
      tested++;
      vector = vectors[random_index];
      select = true;
      for (var i = 0; i < selected; i++) {
        if (compareArray(vector, selected_vectors[i])) {
          select = false;
          break;
        }
      }
      if (select) {
        selected_vectors[selected] = vector;
        selected_indices[selected] = random_index;
        selected++;
      }
    }
    return {'vectors': selected_vectors, 'indices': selected_indices};
  }


const KMEANS_MAX_ITERATIONS = 20
    

  const kmeans = (k, points, distance, initialPosition, iteration) => {

    distance = distance || euclidianDistance
    
    let clusters = initialPosition.map( d => ({
      centroid: d.scaledCoord,
      points: []
    }))

    let replacement = JSON.parse(JSON.stringify(clusters))
      
    let repeat = true
    let it = 0

    while (repeat) {

      // console.log(JSON.stringify(replacement, null, " "))
      
      it ++
      
      replacement.forEach(c => {
        c.points = []
      })
      
      points.forEach( point => {
        
        let distances = replacement.map( cluster => {
          // console.log("D", cluster.centroid, point.scaledCoord, distance(cluster.centroid, point.scaledCoord))
          return distance(cluster.centroid, point.scaledCoord)
        })

        let m = min(distances)
        // console.log("distances", m)
        
        let cluster = find(replacement, c => distance(c.centroid, point.scaledCoord) == m)
        
        cluster.points.push(point)
        // console.log("cluster", cluster)
       
      })

      replacement.forEach( cluster => {
        cluster.centroid = centroid(cluster.points)
        // console.log("cluster", cluster)
      })
      
      if( 
        replacement.map( (c,index) => isEqualArrays(c.points, clusters[index].points)).reduce((a,b) => a&&b, true)
      ){
        repeat = false
      } else {
        clusters = JSON.parse(JSON.stringify(replacement))
        repeat = it < (iteration || KMEANS_MAX_ITERATIONS)
      }
    }  

    return clusters;

  }


 module.exports = {
    kmeans,
    euclidianDistance
 }