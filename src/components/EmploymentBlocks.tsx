import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Map } from "maplibre-gl";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import { jobRampCss, topSectors, type JobScale } from "../data/employment";
import { blockSource, blockStats, parseEmploymentBlocks, type BlockData, type JobBlock } from "../data/employmentBlocks";
import { employmentBlockLayers } from "../map/employmentBlockLayers";
const format = (v: number) => v.toLocaleString("en-US", {maximumFractionDigits: 2});
export default function EmploymentBlocks({map, overlay, sourceControl}: {
  map: Map; overlay: Pick<MapboxOverlay, "setProps">; sourceControl: ReactNode;
}) {
  const [data, setData] = useState<BlockData | null>(null);
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const [scale, setScale] = useState<JobScale>("sqrt"), [exag, setExag] = useState(3);
  const [clip, setClip] = useState(true), [opacity, setOpacity] = useState(.65);
  const [hovered, setHovered] = useState<JobBlock | null>(null), [selected, setSelected] = useState<JobBlock | null>(null);
  const [query, setQuery] = useState("");
  const stats = useMemo(() => data ? blockStats(data) : null, [data]);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch("/data/employment_blocks.geojson", {signal: controller.signal})
      .then(r => {if (!r.ok) throw new Error("Unavailable"); return r.json();})
      .then(parseEmploymentBlocks).then(d => {if (!controller.signal.aborted) setData(d);})
      .catch(() => {if (!controller.signal.aborted) setError(true);});
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    overlay.setProps({effects: [], layers: data && stats ? employmentBlockLayers(data, stats, scale, exag, clip, opacity,
      hovered?.properties.w_geocode ?? selected?.properties.w_geocode ?? null, setHovered, setSelected) : []});
    return () => overlay.setProps({layers: [], effects: []});
  }, [overlay, data, stats, scale, exag, clip, opacity, hovered, selected]);
  const inspected = hovered ?? selected;
  return <section className="population-panel employment-panel employment-blocks-panel" aria-label="Employment layer">
    <header><h2>Employment · 2023</h2><button aria-label="Toggle employment 3D view"
      onClick={() => map.easeTo({pitch: 0, duration: 0})}>2D / 3D</button></header>
    {sourceControl}
    <div className="population-legend">
      <div aria-hidden="true" style={{background: jobRampCss, height: 6, borderRadius: 3, marginBottom: 8}} />
      Total jobs · indigo → violet → magenta → hot pink → near-white.
      <label>Height scale<select aria-label="Employment height scale" value={scale} onChange={e => setScale(e.target.value as JobScale)}>
        <option value="sqrt">Square root</option><option value="linear">Linear</option><option value="log">Log (ln(1 + value))</option>
      </select></label>
      <label>Vertical exaggeration: {exag.toFixed(1)}×<input type="range" aria-label="Employment vertical exaggeration"
        min=".5" max="6" step=".1" value={exag} onChange={e => setExag(Number(e.target.value))}/></label>
      <label><input type="checkbox" checked={clip} onChange={e => setClip(e.target.checked)}/>Clip tallest needles</label>
      <label>Opacity: {Math.round(opacity * 100)}%<input type="range" aria-label="Employment opacity"
        min=".05" max="1" step=".05" value={opacity} onChange={e => setOpacity(Number(e.target.value))}/></label>
      {stats && <p aria-label="Employment clipping legend">{clip ? `${format(stats.clipped)} needles clipped at the 99th percentile (${format(stats.cap)} jobs).` : "0 needles clipped (clipping off)."}
        {" "}Maximum block value: {format(stats.maximum)} jobs. Maximum displayed value: {format(clip ? stats.cap : stats.maximum)} jobs.</p>}
      <details><summary>Height method</summary>4,000 display metres × exaggeration × scaled jobs / scaled maximum displayed value;
        minimum height 60 m × exaggeration. Width is symbolic. Color uses original jobs, and inspection always shows original values. Display heights are not building heights.</details>
    </div>
    {error ? <p role="alert">Employment block data unavailable. <button onClick={() => setRetry(v => v + 1)}>Retry employment blocks</button></p>
      : !data ? <p role="status">Loading employment blocks…</p> : <>
        <p className="population-hint">{format(data.features.length)} blocks. Hover, click or tap a needle to inspect.</p>
        <form onSubmit={e => {e.preventDefault(); setHovered(null); setSelected(data.features.find(f => f.properties.w_geocode === query) ?? null);}}>
          <label>Block ID<input aria-label="Employment block ID" value={query} inputMode="numeric" maxLength={15} onChange={e => setQuery(e.target.value)}/></label>
          <button type="submit">Inspect employment block</button>
          {query.length === 15 && !data.features.some(f => f.properties.w_geocode === query) && <p role="status">Block ID not found.</p>}
        </form>
      </>}
    {inspected && <div className="tract-inspector" aria-label="Employment block details">
      <header><h3>Workplace block</h3><button aria-label="Close employment block details" onClick={() => {setSelected(null); setHovered(null);}}>×</button></header>
      <dl><dt>Block ID</dt><dd>{inspected.properties.w_geocode}</dd><dt>Tract ID</dt><dd>{inspected.properties.tract_geoid}</dd>
        <dt>County</dt><dd>{inspected.properties.county}</dd><dt>Total jobs</dt><dd>{format(inspected.properties.jobs_total)}</dd></dl>
      <h3>Three largest industry sectors</h3><ol>{topSectors(inspected.properties).map(s => <li key={s.code}>{s.name}: {format(s.jobs)} jobs</li>)}</ol>
      <p>{blockSource}</p>
    </div>}
    <p className="population-source">{blockSource}</p>
  </section>;
}
