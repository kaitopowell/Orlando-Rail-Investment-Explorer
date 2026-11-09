import {useEffect,useRef} from 'react';
import {TOP_N_OPTIONS,describeFlow,formatJobs,formatMinutes,formatPercent} from '../data/flows';
import {pairName} from '../data/centerLabels';
import {CenterName,LabelNotice} from './CenterName';
import type {CandidateState} from './useCandidates';
import type {FlowState} from './useFlows';
import type {LabelState} from './useCenterLabels';
export default function FlowControls({state,candidates,labels,onToggle}:{state:FlowState;candidates:CandidateState;labels:LabelState;onToggle:()=>void}) {
 const {data,enabled,topN,setTopN,selected,select}=state;
 const inspector=useRef<HTMLDivElement>(null);
 const flow=data?.flows.find(f=>f.id===selected);
 useEffect(()=>{if(selected)inspector.current?.scrollIntoView({block:'nearest'});},[selected]);
 const error=candidates.status==='error'?candidates.error:state.error;
 return <section className="candidate-controls flow-controls" aria-labelledby="flows-heading">
  <div className="section-heading"><h2 id="flows-heading">Commute demand</h2></div>
  <label className="layer"><span className="layer-symbol flow-symbol" aria-hidden="true">↔</span><span className="layer-text"><strong>Top commute flows</strong><small>Jobs between centers · both directions</small></span><input type="checkbox" aria-label="Top commute flows" checked={enabled} onChange={onToggle}/></label>
  {enabled&&<div className="candidate-details">
   <LabelNotice state={labels}/>
   {error?<div role="alert"><p>Top commute flows unavailable: {error}</p><button onClick={()=>{candidates.retry();state.retry();}}>Retry commute data</button></div>:!data?<p role="status">Loading commute flows…</p>:<>
    <p>{(100*data.intraJobs/data.assignedJobs).toFixed(2)} percent of assigned commuting jobs start and end in the same center ({formatJobs(data.intraJobs)} of {formatJobs(data.assignedJobs)}). These pairs are not drawn, but remain in the all-pair ranks.</p>
    <p>Coral lines: width ∝ √jobs, bounded. Both directions combined; not routes or proposed rail.</p>
    <label>Number of top flows<select aria-label="Number of top flows" value={topN} onChange={e=>setTopN(Number(e.target.value))}>{TOP_N_OPTIONS.map(n=><option key={n} value={n}>{n}</option>)}</select></label>
    <ol className="flow-ranked-list" aria-label="Ranked commute flows">{data.flows.slice(0,topN).map(f=><li key={f.id} value={f.rank}><button aria-pressed={selected===f.id} onClick={()=>select(f.id)}><span>{pairName(labels.labels,f.a,f.b)}</span><small>{formatJobs(f.jobs)} jobs</small><small>{f.a} to {f.b}</small></button></li>)}</ol>
    {flow&&<div className="candidate-inspector flow-inspector" ref={inspector} aria-live="polite"><button onClick={()=>select(null)}>Close flow inspection</button><h3>{pairName(labels.labels,flow.a,flow.b)}</h3><small>{flow.a} to {flow.b}</small><h4>Why it stands out</h4><p className="flow-explanation">{describeFlow(flow,data,labels.labels)}</p>
      <h4>Directions separately</h4>{[[flow.a,flow.b],[flow.b,flow.a]].map(([a,b])=>{const d=flow.directions.find(d=>d.home===a);return <div className="flow-direction" key={a}><p><CenterName id={a} labels={labels.labels}/> to <CenterName id={b} labels={labels.labels}/></p>{d?<p>{formatJobs(d.jobs)} jobs. Driving: {formatMinutes(d.carMean)} (free-flow; {formatJobs(d.carJobs)} usable jobs). Transit option: {formatPercent(d.transitJobs/d.jobs)}; mean for those jobs: {formatMinutes(d.transitMean)}.</p>:<p>No recorded flow in this direction.</p>}</div>;})}
      {flow.flagged&&<p className="flow-caveat">One of these centers contains hexagon 8844a9160dfffff near Walt Disney World. Its job count may reflect how LODES assigns a large employer’s jobs to one location; this is a possibility to check, not a finding.</p>}
      <p>Means use each mode’s usable-job denominator. A blank time does not prove no route exists. Access distances are not charged as time.</p>
    </div>}
    <p>Small flows carry Census privacy noise, so only large flows are highlighted. Jobs are not unique people or predicted ridership. Results depend on the assignment radius. “Today” means the stored baseline snapshot, not live service.</p>
    <details><summary>Assignment-radius sensitivity</summary><p>Share of all input commuting jobs; only the default {data.defaultRadius} km assignment is drawn.</p><div className="flow-table-scroll"><table><thead><tr><th>Radius</th><th>Both assigned</th><th>Home only</th><th>Work only</th><th>Neither</th></tr></thead><tbody>{data.scenarios.map(s=><tr key={s.radius}><th>{s.radius} km</th>{[s.both,s.homeOnly,s.workOnly,s.neither].map((n,i)=><td key={i}>{formatPercent(n/s.total)}</td>)}</tr>)}</tbody></table></div></details>
   </>}
  </div>}
 </section>;
}
