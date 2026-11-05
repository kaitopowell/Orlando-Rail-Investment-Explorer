import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCandidates} from '../src/data/candidates.ts';
const names=['candidate_centers.geojson','candidate_connections.geojson','candidate_connections_summary.json'];
const inputs=names.map(n=>{
 const source=readFileSync(`data/processed/${n}`);assert.deepEqual(readFileSync(`public/data/${n}`),source,`${n} browser copy unchanged`);return JSON.parse(source);
});
const parsed=parseCandidates(...inputs);
assert.equal(parsed.centers.length,146);assert.equal(parsed.connections.length,270);
assert.deepEqual(parsed.groups.map(g=>g.length),[136,5,5]);
assert.equal(parsed.disconnectedNote,'2 groups of 5 centers are not connected to the main network.');
assert.equal([...parsed.neighbors.values()].reduce((n,x)=>n+x.length,0),540);
const misleading=structuredClone(inputs);misleading[2].connected_components=[];
assert.deepEqual(parseCandidates(...misleading).groups,parsed.groups,'topology comes from edges');
for(const mutate of [
 x=>x[0].features[0].geometry.type='Polygon',
 x=>x[0].features[0].geometry.coordinates=[Infinity,28],
 x=>x[0].features[1].properties.id=x[0].features[0].properties.id,
 x=>x[0].features[0].properties.total_jobs=-1,
 x=>x[0].features[0].properties.criteria='ridership',
 x=>x[1].features[0].properties.to_id='unknown',
 x=>x[1].features.push(x[1].features[0]),
 x=>x[1].features[0].geometry.coordinates[0][0]=0,
 x=>x[2].center_count=145,
 x=>x[2].jobs_share_inside_centers=0,
 x=>x[2].parameters_assumptions.MAX_KM=1,
 x=>x[2].sources.jobs.fallback=true,
 x=>x[2].flagged_work_hex.center_id='unknown',
]) {const copy=structuredClone(inputs);mutate(copy);assert.throws(()=>parseCandidates(...copy),/malformed/);}
// A tiny disconnected graph exercises isolated nodes and symmetric neighbors.
const tiny=structuredClone(inputs);tiny[0].features=tiny[0].features.slice(0,3);
const [a,b]=tiny[0].features.map(f=>f.properties.id).sort();
tiny[1].features=[{type:'Feature',properties:{from_id:a,to_id:b,km:1},geometry:{type:'LineString',coordinates:[a,b].map(id=>tiny[0].features.find(f=>f.properties.id===id).geometry.coordinates)}}];
const s=tiny[2];s.center_count=3;s.connection_count=1;
s.jobs_inside_centers=tiny[0].features.reduce((n,f)=>n+f.properties.total_jobs,0);s.population_inside_centers=tiny[0].features.reduce((n,f)=>n+f.properties.total_population,0);
s.jobs_share_inside_centers=s.jobs_inside_centers/s.all_jobs;s.population_share_inside_centers=s.population_inside_centers/s.all_population;
s.flagged_work_hex={h3:tiny[0].features[0].properties.hexagons[0],jobs:1,center_id:tiny[0].features[0].properties.id};
const graph=parseCandidates(...tiny);assert.deepEqual(graph.groups.map(g=>g.length),[2,1]);assert.equal(graph.neighbors.get(a)[0].id,b);assert.equal(graph.neighbors.get(b)[0].id,a);
console.log('PASS candidate adapter: byte-identical delivery, schemas, references, reconciliation, graph components and malformed input');
