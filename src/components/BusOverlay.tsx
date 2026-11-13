import { RightPanel, usePanelSelection } from "./RightPanels";
import {useEffect, useMemo, useState} from "react";
import type {Map} from "maplibre-gl";
import {busColors, TRANSIT_STYLE} from "../map/transitStyle";
import type {MapboxOverlay} from "@deck.gl/mapbox";
import {busDefinition, busNote, busSelection, headway, meets, parseLynx,
  type BusTier, type LynxData, type LynxStop, type Threshold} from "../data/lynx";
import {lynxLayers} from "../map/lynxLayers";
const fmt = (value: number | null) => value === null ? "No peak service" : value.toLocaleString("en-US", {maximumFractionDigits: 2});
export default function BusOverlay({map, overlay, enabled}: {map: Map; overlay: Pick<MapboxOverlay,"setProps">; enabled: boolean}) {
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on("zoom", update);
    return () => { map.off("zoom", update); };
  }, [map]);
  const [data,setData] = useState<LynxData | null>(null), [error,setError] = useState(false), [retry,setRetry] = useState(0);
  const [threshold,setThreshold] = useState<Threshold>(30), [includeLymmo,setIncludeLymmo] = useState(false);
  const [showInfrequent,setShowInfrequent] = useState(false), [opacity,setOpacity] = useState<number>(TRANSIT_STYLE.bus.defaultOpacity);
  const [hovered,setHovered] = useState<LynxStop | null>(null), [selected,setSelected] = useState<LynxStop | null>(null);
  const selectOnMap = usePanelSelection("bus", setSelected);
  useEffect(() => {
    if (!enabled || data) return;
    const controller = new AbortController(); setError(false);
    fetch("/data/lynx_stops.geojson", {signal:controller.signal})
      .then(r => {if (!r.ok) throw new Error("Unavailable"); return r.json();})
      .then(parseLynx).then(d => {if (!controller.signal.aborted) setData(d);})
      .catch(() => {if (!controller.signal.aborted) setError(true);});
    return () => controller.abort();
  }, [enabled,data,retry]);
  const selection = useMemo(() => data ? busSelection(data,threshold,includeLymmo,showInfrequent) : null,
    [data,threshold,includeLymmo,showInfrequent]);
  useEffect(() => {setHovered(null);setSelected(null);}, [enabled,threshold,includeLymmo,showInfrequent]);
  useEffect(() => {
    overlay.setProps({layers: enabled && selection ? lynxLayers(selection.stops,threshold,includeLymmo,opacity,zoom,
      hovered?.properties.stop_id ?? selected?.properties.stop_id ?? null,setHovered,selectOnMap) : []});
    return () => overlay.setProps({layers:[]});
  }, [overlay,enabled,selection,threshold,includeLymmo,opacity,zoom,hovered,selected]);
  if (!enabled) return null;
  const p = (selected ?? hovered)?.properties;
  const tiers: [BusTier,string][] = [[15,"≤15 min"],[20,">15–20 min"],[30,">20–30 min"],["infrequent",`Served, >${threshold} min`]];
  return <RightPanel id="bus" title="Bus baseline (LYNX)" reveal={selected} className="transit-panel bus-panel" aria-label="Bus baseline layer">
    <h2>Bus baseline (LYNX)</h2>
    <label>Frequent threshold<select aria-label="Bus frequent threshold" value={threshold} onChange={e => setThreshold(Number(e.target.value) as Threshold)}>
      {[15,20,30].map(t => <option key={t} value={t}>{t} minutes</option>)}</select></label>
    <label><input type="checkbox" checked={includeLymmo} onChange={e => setIncludeLymmo(e.target.checked)}/>Include LYMMO</label>
    <label><input type="checkbox" checked={showInfrequent} onChange={e => setShowInfrequent(e.target.checked)}/>Show infrequent stops</label>
    <label>Opacity: {Math.round(opacity*100)}%<input type="range" aria-label="Bus opacity" min=".1" max="1" step=".05" value={opacity} onChange={e => setOpacity(Number(e.target.value))}/></label>
    {error ? <p role="alert">Bus data unavailable. <button onClick={() => setRetry(v => v+1)}>Retry bus</button></p> : !selection ?
      <p role="status">Loading bus stops…</p> : <>
      <ul className="bus-legend" aria-label="Bus tier counts">{tiers.map(([tier,label]) => <li key={tier}>
        <span aria-hidden="true" style={{color:`rgb(${busColors[tier].slice(0,3).join(",")})`}}>●</span>{" "}{label}: {fmt(selection.counts[tier])}
      </li>)}</ul>
      <p>{fmt(selection.stops.length)} displayed stops · {includeLymmo ? "LYMMO included" : "LYMMO excluded"}. {fmt(selection.noService)} stops with no peak service for this measure are hidden.</p>
      <label>Inspect bus stop<select aria-label="Inspect bus stop" value={selected?.properties.stop_id ?? ""} onChange={e => {
        setHovered(null);setSelected(selection.stops.find(f => f.properties.stop_id === e.target.value) ?? null);
      }}><option value="">Select a displayed stop…</option>{selection.stops.map(f => <option key={f.properties.stop_id} value={f.properties.stop_id}>
        {f.properties.stop_name} · {f.properties.stop_id.trim()}</option>)}</select></label>
    </>}
    <details><summary>Scheduled headway definition</summary><p>{busDefinition}</p></details>
    {p && <div aria-label="Bus stop details">
      <button aria-label="Close bus stop details" onClick={() => {setSelected(null);setHovered(null);}}>×</button>
      <h3>{p.stop_name}</h3><dl><dt>County</dt><dd>{p.county}</dd>
        <dt>Best route (supplied, including LYMMO)</dt><dd>{p.route_short_name ?? "Unavailable"} · {p.route_long_name ?? "Unavailable"}</dd>
        <dt>Peak departures (all routes)</dt><dd>{fmt(p.n_dep)}</dd>
        {!includeLymmo && <><dt>Best non-LYMMO route departures</dt><dd>{fmt(p.n_dep_best_nonlymmo)}</dd></>}
        <dt>Scheduled headway ({includeLymmo ? "including LYMMO" : "excluding LYMMO"})</dt><dd>{fmt(headway(p,includeLymmo))} minutes</dd>
        <dt>Thresholds met</dt><dd>{([15,20,30] as const).filter(t => meets(p,t,includeLymmo)).map(t => `${t} min`).join(", ") || "None"}</dd></dl>
      {!includeLymmo && <p>Separate non-LYMMO best-route names are not supplied.</p>}
      <p>{busNote}</p>
    </div>}
    <p>{busNote}</p>
  </RightPanel>;
}
