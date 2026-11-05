import {useEffect, useRef} from "react";
import {connectionId} from "../data/candidates";
import type {CandidateState} from "./useCandidates";
const count = (n: number) => n.toLocaleString("en-US");
const percent = (n: number) => `${(100*n).toFixed(1)}%`;
const caveat = "Illustrative candidate. Not a route or a proposal.";
export default function CandidateControls({state}: {state: CandidateState}) {
  const {enabled, toggle, status, error, data, selection, select, retry} = state;
  const inspector = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selection) inspector.current?.scrollIntoView({block:"nearest"}); }, [selection]);
  const center = selection?.kind === "center" ? data?.byId.get(selection.id) : undefined;
  const edge = selection?.kind === "connection" ? data?.connections.find(e => connectionId(e) === selection.id) : undefined;
  const group = center && data ? data.groupById.get(center.properties.id)! : undefined;
  return <section className="candidate-controls" aria-labelledby="candidate-heading">
    <div className="section-heading"><h2 id="candidate-heading">Model candidates</h2></div>
    <label className="layer"><span className="layer-symbol candidate-symbol" aria-hidden="true">⌁</span><span className="layer-text"><strong>Candidate connections</strong><small>Illustrative candidates, not routes</small></span><input type="checkbox" aria-label="Candidate connections" checked={enabled} onChange={toggle}/></label>
    {enabled && <div className="candidate-details">
      {status === "loading" && <p role="status">Loading candidate connections…</p>}
      {status === "error" && <div role="alert"><p>Candidate connections unavailable: {error}</p><button onClick={retry}>Retry candidate data</button></div>}
      {status === "ready" && data && <>
        <p>{count(data.summary.center_count)} centers · {count(data.summary.connection_count)} connections.<br/>{percent(data.summary.jobs_share_inside_centers)} of workplace jobs · {percent(data.summary.population_share_inside_centers)} of modeled population inside centers.</p>
        <p className="candidate-legend">Amber circles: size ∝ √jobs (bounded). Pale arcs: uniform width, no importance encoding.</p>
        {data.disconnectedNote && <p>{data.disconnectedNote}</p>}
        <details><summary>Assumptions and sources</summary>
          <p>Assumptions: top {percent(data.summary.parameters_assumptions.TOP_SHARE)} of hexagons by jobs and by population; each center linked to its {data.summary.parameters_assumptions.K_NEAREST} nearest within {data.summary.parameters_assumptions.MAX_KM} km.</p>
          <p>Built only from population and job data. Not based on SunRail, STAR, or any existing plan. Straight lines are not routes and ignore water and terrain. No costs, speeds, or ridership are implied.</p>
          <p>Workplace jobs: <a href="https://lehd.ces.census.gov/data/">Census LODES (2023)</a>. Population: <a href="https://www.kontur.io/portfolio/population-dataset/">Kontur modeled hexagons</a>, a modeled estimate, not a measured count.</p>
          <p>Flagged, not corrected: the named Disney-area hexagon {data.summary.flagged_work_hex.h3} has {count(data.summary.flagged_work_hex.jobs)} workplace jobs. The largest workplace hexagon in this source is {data.summary.largest_work_hexagon.h3} ({count(data.summary.largest_work_hexagon.jobs)} jobs). Large counts may reflect LODES assigning a large employer’s jobs to one location; this is a possibility to check.</p>
        </details>
        <label>Inspect candidate center<select aria-label="Inspect candidate center" value={center?.properties.id ?? ""} onChange={e => select(e.target.value ? {kind:"center",id:e.target.value} : null)}><option value="">Choose a center</option>{data.centers.map(c => <option key={c.properties.id} value={c.properties.id}>{c.properties.id}</option>)}</select></label>
        <label>Inspect candidate connection<select aria-label="Inspect candidate connection" value={edge ? connectionId(edge) : ""} onChange={e => select(e.target.value ? {kind:"connection",id:e.target.value} : null)}><option value="">Choose a connection</option>{data.connections.map(e => <option key={connectionId(e)} value={connectionId(e)}>{e.properties.from_id} → {e.properties.to_id}</option>)}</select></label>
        {selection && <div className="candidate-inspector" ref={inspector} aria-live="polite">
          <button onClick={() => select(null)} aria-label="Close candidate inspection">Close</button>
          {center && <><h3>Candidate center</h3><p>{center.properties.id}</p><dl><dt>Jobs</dt><dd>{count(center.properties.total_jobs)}</dd><dt>Population (modeled estimate)</dt><dd>{count(center.properties.total_population)}</dd><dt>Hexagons</dt><dd>{count(center.properties.hexagon_count)}</dd><dt>Criteria met</dt><dd>{center.properties.criteria}</dd><dt>Connected group</dt><dd>{group!+1} · {data.groups[group!].length} centers</dd></dl><p>Connections (straight-line km):</p><ul>{data.neighbors.get(center.properties.id)!.map(n => <li key={n.id}><button onClick={() => select({kind:"connection",id:n.connectionId})}>{n.id} · {n.km.toFixed(2)} km</button></li>)}</ul></>}
          {edge && <><h3>Candidate connection</h3><p>From: {edge.properties.from_id}<br/>To: {edge.properties.to_id}</p><p>{edge.properties.km.toFixed(2)} straight-line km</p></>}
          <p>{caveat}</p>
        </div>}
      </>}
    </div>}
  </section>;
}
