import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseCandidates} from '../src/data/candidates.ts';
import {parseCenterLabels,placeName} from '../src/data/centerLabels.ts';
import {parseFlows,describeFlow,FLAGGED_HEXAGON} from '../src/data/flows.ts';
import {parseCSV} from '../src/data/csv.ts';
for(const [a,b] of [['data/center_labels.csv','public/data/center_labels.csv'],...['center_od_baseline.csv.gz','center_od_sensitivity.json'].map(n=>[`data/processed/${n}`,`public/data/${n}`])])assert.deepEqual(readFileSync(a),readFileSync(b));
const json=n=>JSON.parse(readFileSync(`data/processed/${n}`));
const candidates=parseCandidates(json('candidate_centers.geojson'),json('candidate_connections.geojson'),json('candidate_connections_summary.json'));
const csv=gunzipSync(readFileSync('data/processed/center_od_baseline.csv.gz')).toString();
const summary=json('center_od_sensitivity.json'),data=parseFlows(csv,summary,candidates);
const labels=parseCenterLabels(readFileSync('data/center_labels.csv','utf8'),candidates.byId);
assert.equal(labels.labels.size,146);assert.deepEqual(labels.missing,['center_8844a98d4bfffff']);
assert.equal(data.assignedJobs,843604);assert.equal(data.intraJobs,66807);
assert.equal(data.flows.reduce((n,f)=>n+f.jobs,0)+data.intraJobs,data.assignedJobs);
assert.ok(data.flows.every((f,i)=>(i===0||f.rank>data.flows[i-1].rank)&&f.a<f.b));
const ranked=new Map();for(const r of parseCSV(csv)){if(r.intra_center==='1')continue;const id=[r.home_center,r.work_center].sort().join('|');ranked.set(id,(ranked.get(id)||0)+Number(r.jobs));}
assert.deepEqual(data.flows.map(f=>[f.id,f.jobs]),[...ranked].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1)));
assert.throws(()=>parseCenterLabels('center_id,name,confidence,note\nunknown,Invalid,high,\n',candidates.byId));
const omitted=readFileSync('data/center_labels.csv','utf8').split('\n');omitted.splice(1,1);
const fallback=parseCenterLabels(omitted.join('\n'),candidates.byId);assert.equal(fallback.missing.length,2);assert.equal(placeName(fallback.labels,fallback.missing[0]),'Unnamed center');
assert.deepEqual(parseCSV('id,note\r\nA,"quoted, and ""escaped""\nline"\r\n'),[{id:'A',note:'quoted, and "escaped"\nline'}]);
assert.throws(()=>parseCSV('a,b\n"oops,3'));
const tiny={byId:new Map(['A','B','C'].map(id=>[id,{properties:{hexagons:id==='B'?[FLAGGED_HEXAGON]:[]}}])),connections:[{properties:{from_id:'A',to_id:'B'}}]};
const header=csv.split('\n')[0];
const fixture=header+'\n'+[
 ['A','B',0,1,10,0,0,8,30,10,10,1,2],['B','A',0,1,30,0,0,12,50,20,20,2,1],
 ['A','A',1,1,10,0,0,0,'',10,0,1,1],['A','C',0,1,40,0,0,0,'',40,40,1,3],
].map(r=>r.join(',')).join('\n')+'\n';
const s={input_jobs:90,parameters_assumptions:{ASSIGN_MAX_KM:5,TRANSIT_MAX_MIN:120,CAR_MAX_MIN:60},scenarios:[3,5,8].map(radius=>({assign_max_km:radius,center_pair_count:4,intra_center_jobs:10,intra_center_share_assigned_jobs:10/90,groups:{assigned_both:{jobs:90,share_jobs:1,pair_count:4,excluded_jobs:0,excluded_pair_count:0,transit_usable_jobs:20,car_usable_jobs:80},...Object.fromEntries(['home_only','work_only','unassigned'].map(k=>[k,{jobs:0,share_jobs:0}]))}}))};
const result=parseFlows(fixture,s,tiny);const first=result.flows[0];
assert.equal(first.id,'A|B');assert.equal(first.jobs,40);assert.equal(first.transitMean,42);assert.equal(first.carMean,50/3);assert.equal(first.transitJobs,20);assert.equal(first.connected,true);assert.equal(first.flagged,true);assert.equal(result.flows[1].connected,false);assert.equal(result.flows[1].transitMean,null);assert.equal(result.flows[1].directions.length,1);
const text=describeFlow(first,result,new Map([['A',{name:'Fixture A'}],['B',{name:'Fixture B'}]]));
for(const fragment of ['Fixture A to Fixture B','40 commuting jobs','44.44%','Rank 1 of 3','16.7 minutes','free-flow, no congestion','50.00%','42.0 minutes','connection: yes'])assert.ok(text.includes(fragment),fragment);
assert.throws(()=>parseFlows(fixture+fixture.split('\n')[1]+'\n',s,tiny));
assert.throws(()=>parseFlows(fixture.replace('A,B,0,1,10','X,B,0,1,10'),s,tiny));
assert.throws(()=>parseFlows(fixture.replace('0,0,8,30','0,0,11,30'),s,tiny));
assert.throws(()=>parseFlows(csv,{},candidates));
console.log(JSON.stringify({top:data.flows[0],combinedPairs:data.flows.length,intraShare:data.intraJobs/data.assignedJobs},null,2));
console.log('PASS flows: byte-identical delivery, editorial schema/fallback, CSV quoting, all real rows/ranks/totals, bidirectional weighting, null times, ties, template, connectivity, membership caveat and malformed input');
