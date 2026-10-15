import { useEffect, useMemo, useState } from "react";
import type { Map } from "maplibre-gl";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import { AmbientLight, DirectionalLight, LightingEffect } from "@deck.gl/core";
import {
  parseEmployment,
  employmentSource,
  jobRampCss,
  topSectors,
  type JobData,
  type JobTract,
  type JobScale,
  type JobMeasure,
} from "../data/employment";
import { employmentLayers } from "../map/employmentLayers";
export default function EmploymentOverlay({
  map,
  overlay,
  enabled,
}: {
  map: Map;
  overlay: Pick<MapboxOverlay, "setProps">;
  enabled: boolean;
}) {
  const [data, setData] = useState<JobData | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState<JobTract | null>(null),
    [hovered, setHovered] = useState<JobTract | null>(null);
  const [scale, setScale] = useState<JobScale>("sqrt"),
    [measure, setMeasure] = useState<JobMeasure>("jobs_total"),
    [exag, setExag] = useState(3),
    [camera, setCamera] = useState({
      pitch: map.getPitch(),
      zoom: map.getZoom(),
    });
  const lighting = useMemo(
    () =>
      new LightingEffect({
        ambient: new AmbientLight({ intensity: 0.8 }),
        sun: new DirectionalLight({
          direction: [-1, -2, -1],
          intensity: 1.2,
          color: [255, 230, 250],
        }),
      }),
    [],
  );
  useEffect(() => {
    const update = () =>
      setCamera({ pitch: map.getPitch(), zoom: map.getZoom() });
    map.on("pitch", update);
    map.on("zoom", update);
    return () => {
      map.off("pitch", update);
      map.off("zoom", update);
    };
  }, [map]);
  useEffect(() => {
    if (!enabled) {
      setSelected(null);
      setHovered(null);
      return;
    }
    if (data) return;
    const abort = new AbortController();
    setError(false);
    fetch("/data/employment_tracts.geojson", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Unavailable");
        return r.json();
      })
      .then(parseEmployment)
      .then((d) => {
        if (!abort.signal.aborted) setData(d);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [enabled, data, retry]);
  useEffect(() => {
    overlay.setProps({
      effects: enabled && camera.pitch > 0 ? [lighting] : [],
      layers:
        enabled && data
          ? employmentLayers(
              data,
              camera.pitch > 0,
              camera.zoom,
              measure,
              scale,
              exag,
              hovered?.properties.GEOID ?? selected?.properties.GEOID ?? null,
              setHovered,
              setSelected,
            )
          : [],
    });
    return () => overlay.setProps({ layers: [], effects: [] });
  }, [
    enabled,
    data,
    camera,
    measure,
    scale,
    exag,
    hovered,
    selected,
    lighting,
    overlay,
  ]);
  if (!enabled) return null;
  const format = (v: number | null) =>
    v === null
      ? "Unavailable"
      : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return (
    <section
      className="population-panel employment-panel"
      aria-label="Employment layer"
    >
      <header>
        <h2>Employment · 2023</h2>
        <button
          aria-label="Toggle employment 3D view"
          onClick={() =>
            map.easeTo({ pitch: map.getPitch() > 0 ? 0 : 45, duration: 0 })
          }
        >
          2D / 3D
        </button>
      </header>
      <div className="population-legend">
        <div
          aria-hidden="true"
          style={{
            background: jobRampCss,
            height: 6,
            borderRadius: 3,
            marginBottom: 8,
          }}
        />
        Low indigo → violet → magenta → hot pink → high near-white.
        <br />
        {camera.pitch > 0
          ? "Height and color encode the selected measure."
          : "Circle area: total jobs (square-root radius). Tract tint: jobs/km²."}
        <label>
          Measure
          <select
            aria-label="Employment measure"
            value={measure}
            onChange={(e) => setMeasure(e.target.value as JobMeasure)}
          >
            <option value="jobs_total">Total jobs</option>
            <option value="jobs_per_km2">Jobs per km²</option>
          </select>
        </label>
        <label>
          Height scale
          <select
            aria-label="Employment height scale"
            value={scale}
            onChange={(e) => setScale(e.target.value as JobScale)}
          >
            <option value="sqrt">Square root</option>
            <option value="linear">Linear</option>
            <option value="log">Log (ln(1 + value))</option>
          </select>
        </label>
        <label>
          Vertical exaggeration: {exag.toFixed(1)}×
          <input
            type="range"
            aria-label="Employment vertical exaggeration"
            min=".5"
            max="6"
            step=".1"
            value={exag}
            onChange={(e) => setExag(Number(e.target.value))}
          />
        </label>
        Display height = 4,000 m × exaggeration × scaled value / scaled maximum.
        Units: {measure === "jobs_total" ? "jobs" : "jobs/km²"}. Height controls
        apply in 3D. Zero jobs: no column or circle.
      </div>
      {error ? (
        <p role="alert">
          Employment data unavailable.{" "}
          <button onClick={() => setRetry(retry + 1)}>Retry employment</button>
        </p>
      ) : !data ? (
        <p role="status">Loading employment…</p>
      ) : (
        <>
          <p className="population-hint">
            Hover to highlight. Click or tap a tract or point to inspect.
          </p>
          <label className="tract-picker">
            Inspect employment tract
            <select
              aria-label="Inspect employment tract"
              value={selected?.properties.GEOID ?? ""}
              onChange={(e) =>
                setSelected(
                  data.features.find(
                    (f) => f.properties.GEOID === e.target.value,
                  ) ?? null,
                )
              }
            >
              <option value="">Select tract…</option>
              {data.features.map((f) => (
                <option key={f.properties.GEOID} value={f.properties.GEOID}>
                  {f.properties.GEOID} · {f.properties.name}
                </option>
              ))}
            </select>
          </label>
          {hovered && !selected && (
            <p className="population-hover">{hovered.properties.name}</p>
          )}
          {selected && (
            <div className="tract-inspector" aria-label="Employment details">
              <header>
                <h3>{selected.properties.name}</h3>
                <button
                  aria-label="Close employment details"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              </header>
              <dl>
                <dt>Tract ID</dt>
                <dd>{selected.properties.GEOID}</dd>
                <dt>Total jobs</dt>
                <dd>{format(selected.properties.jobs_total)}</dd>
                <dt>Jobs per km²</dt>
                <dd>{format(selected.properties.jobs_per_km2)}</dd>
              </dl>
              <h3>Three largest industry sectors</h3>
              <ol>
                {topSectors(selected.properties).map((s) => (
                  <li key={s.code}>
                    {s.name}: {format(s.jobs)} jobs
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
      <p className="population-source">
        <a href="https://lehd.ces.census.gov/data/lodes/LODES8/fl/wac/fl_wac_S000_JT00_2023.csv.gz">
          {employmentSource}
        </a>
        <br />
        Accessed 2026-10-15.
      </p>
    </section>
  );
}
