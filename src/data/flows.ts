import {parseCSV} from "./csv.ts";
import {pairName, type CenterLabels} from "./centerLabels.ts";
import type {CandidateData} from "./candidates";
export const DEFAULT_TOP_N = 10;
export const TOP_N_OPTIONS = [5,10,20] as const;
export const FLAGGED_HEXAGON = '8844a9160dfffff';
export type Direction = {home:string;work:string;jobs:number;transitJobs:number;carJobs:number;transitMean:number|null;carMean:number|null};
export type CommuteFlow = {id:string;a:string;b:string;jobs:number;rank:number;directions:Direction[];transitJobs:number;carJobs:number;transitMean:number|null;carMean:number|null;connected:boolean;flagged:boolean};
export type FlowScenario = {radius:number;both:number;homeOnly:number;workOnly:number;neither:number;total:number};
export type FlowData = {flows:CommuteFlow[];assignedJobs:number;intraJobs:number;rankedPairCount:number;defaultRadius:number;scenarios:FlowScenario[]};
const fail = ():never => {throw new Error('Commute data is malformed or inconsistent.');};
function object(value:unknown):Record<string,unknown> {if(!value || typeof value!=='object' || Array.isArray(value))return fail();return value as Record<string,unknown>;}
function number(value:unknown,integer=false):number {if(typeof value!=='number'||!Number.isFinite(value)||value<0||(integer&&!Number.isSafeInteger(value)))return fail();return value;}
const count = (v:string) => /^\d+$/.test(v) ? number(Number(v),true) : fail();
const decimal = (v:string) => v.trim() && /^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v) ? number(Number(v)) : fail();
const same = (a:number,b:number) => Math.abs(a-b)<1e-8;
export function parseFlows(csv:string, summaryJSON:unknown, candidates:CandidateData):FlowData {
  const summary=object(summaryJSON), params=object(summary.parameters_assumptions);
  const defaultRadius=number(params.ASSIGN_MAX_KM), inputJobs=number(summary.input_jobs,true);
  if(!inputJobs || !Array.isArray(summary.scenarios))return fail();
  const scenarios:FlowScenario[]=summary.scenarios.map(value=>{
    const r=object(value),g=object(r.groups);
    const totals=['assigned_both','home_only','work_only','unassigned'].map(key=>{
      const group=object(g[key]),jobs=number(group.jobs,true);
      if(!same(number(group.share_jobs),jobs/inputJobs))return fail();return jobs;
    });
    if(totals.reduce((a,b)=>a+b,0)!==inputJobs)return fail();
    return {radius:number(r.assign_max_km),both:totals[0],homeOnly:totals[1],workOnly:totals[2],neither:totals[3],total:inputJobs};
  }).sort((a,b)=>a.radius-b.radius);
  if(scenarios.map(s=>s.radius).join(',')!=='3,5,8')return fail();
  const reference=summary.scenarios.map(object).find(r=>r.assign_max_km===defaultRadius);
  const scenario=scenarios.find(s=>s.radius===defaultRadius);if(!reference||!scenario)return fail();
  const rows=parseCSV(csv), seen=new Set<string>(), combined=new Map<string,Direction[]>();
  const required='home_center,work_center,intra_center,pair_count,jobs,excluded_pair_count,excluded_jobs,transit_usable_jobs,transit_mean_min,car_usable_jobs,car_mean_min,home_access_mean_km,work_access_mean_km';
  const intraRanks:{id:string;jobs:number}[]=[];
  let total=0,intra=0,pairs=0,excluded=0,excludedPairs=0,transit=0,car=0;
  for(const r of rows) {
    if(Object.keys(r).join(',')!==required || !candidates.byId.has(r.home_center)||!candidates.byId.has(r.work_center))return fail();
    const id=`${r.home_center}|${r.work_center}`;if(seen.has(id))return fail();seen.add(id);
    const jobs=count(r.jobs),pairCount=count(r.pair_count),ex=count(r.excluded_jobs),exPairs=count(r.excluded_pair_count);
    if(!jobs||!pairCount||ex>jobs||exPairs>pairCount||r.intra_center!==(r.home_center===r.work_center?'1':'0'))return fail();
    decimal(r.home_access_mean_km);decimal(r.work_access_mean_km);
    const tj=count(r.transit_usable_jobs),cj=count(r.car_usable_jobs);
    const mean=(value:string,usable:number,max:number)=>{if(!usable){if(value!=='')return fail();return null;}const v=decimal(value);if(v>max)return fail();return v;};
    if(tj>jobs-ex||cj>jobs-ex)return fail();
    const d:Direction={home:r.home_center,work:r.work_center,jobs,transitJobs:tj,carJobs:cj,transitMean:mean(r.transit_mean_min,tj,number(params.TRANSIT_MAX_MIN)),carMean:mean(r.car_mean_min,cj,number(params.CAR_MAX_MIN))};
    total+=jobs;pairs+=pairCount;excluded+=ex;excludedPairs+=exPairs;transit+=tj;car+=cj;
    if(r.intra_center==='1'){intra+=jobs;intraRanks.push({id,jobs});continue;}
    const key=[d.home,d.work].sort().join('|');combined.set(key,[...(combined.get(key)||[]),d]);
  }
  const ref=object(object(reference.groups).assigned_both);
  for(const [field,value] of Object.entries({jobs:total,pair_count:pairs,excluded_jobs:excluded,excluded_pair_count:excludedPairs,transit_usable_jobs:transit,car_usable_jobs:car}))if(ref[field]!==value)return fail();
  if(total!==scenario.both || rows.length!==reference.center_pair_count || intra!==reference.intra_center_jobs || !same(intra/total,number(reference.intra_center_share_assigned_jobs)))return fail();
  const connections=new Set(candidates.connections.map(e=>[e.properties.from_id,e.properties.to_id].sort().join('|')));
  const flows:CommuteFlow[]=[...combined].map(([id,directions])=>{
    directions.sort((a,b)=>a.home.localeCompare(b.home));const [a,b]=id.split('|');
    const transitJobs=directions.reduce((n,d)=>n+d.transitJobs,0),carJobs=directions.reduce((n,d)=>n+d.carJobs,0);
    return {id,a,b,directions,jobs:directions.reduce((n,d)=>n+d.jobs,0),rank:0,transitJobs,carJobs,
      transitMean:transitJobs?directions.reduce((n,d)=>n+(d.transitMean??0)*d.transitJobs,0)/transitJobs:null,
      carMean:carJobs?directions.reduce((n,d)=>n+(d.carMean??0)*d.carJobs,0)/carJobs:null,
      connected:connections.has(id),flagged:[a,b].some(id=>candidates.byId.get(id)!.properties.hexagons.includes(FLAGGED_HEXAGON))};
  }).sort((a,b)=>b.jobs-a.jobs||a.id.localeCompare(b.id));
  const ranked=[...flows,...intraRanks].sort((a,b)=>b.jobs-a.jobs||a.id.localeCompare(b.id));
  const ranks=new Map(ranked.map((f,i)=>[f.id,i+1]));
  flows.forEach(flow=>flow.rank=ranks.get(flow.id)!);
  return {flows,rankedPairCount:ranked.length,assignedJobs:total,intraJobs:intra,defaultRadius,scenarios};
}
export const formatJobs=(n:number)=>n.toLocaleString('en-US');
export const formatPercent=(n:number)=>`${(100*n).toFixed(2)}%`;
export const formatMinutes=(n:number|null)=>n===null?'Unavailable':`${n.toFixed(1)} minutes`;
export function describeFlow(flow:CommuteFlow,data:FlowData,labels:CenterLabels):string {
  return `${pairName(labels,flow.a,flow.b)} has ${formatJobs(flow.jobs)} commuting jobs in both directions, ${formatPercent(flow.jobs/data.assignedJobs)} of all assigned commuting jobs. Rank ${flow.rank} of ${data.rankedPairCount} combined center pairs (including intra-center pairs). Mean driving time: ${formatMinutes(flow.carMean)} (free-flow, no congestion; ${formatJobs(flow.carJobs)} jobs with usable driving times). ${formatPercent(flow.transitJobs/flow.jobs)} of its jobs have a transit option today under the baseline cutoffs; for those jobs, mean transit time: ${formatMinutes(flow.transitMean)}. Directly joined by a candidate connection: ${flow.connected?'yes':'no'}.`;
}
export async function loadFlows(candidates:CandidateData,signal:AbortSignal) {
  const [csvResponse,jsonResponse]=await Promise.all([fetch('/data/center_od_baseline.csv.gz',{signal}),fetch('/data/center_od_sensitivity.json',{signal})]);
  if(!csvResponse.ok||!jsonResponse.ok)throw new Error('Could not load commute baseline or sensitivity file.');
  const bytes=new Uint8Array(await csvResponse.arrayBuffer());
  // Static hosts may already decode Content-Encoding; inspect the gzip magic bytes.
  const csv=bytes[0]===31&&bytes[1]===139 ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bytes);
  return parseFlows(csv,await jsonResponse.json(),candidates);
}
