import { POPULATION_DISPLAY, populationNeedleRampCss, populationValues, populationDisplaySettings } from "../map/populationDisplay";
import { useEffect, useMemo, useState } from "react";
import { pillarDefaults } from "../data/kontur3d";
import { hexPopulationLayers } from "../map/hexPopulationLayers";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import {
  parseHexagons,
  hexRampCss,
  type Hex,
  type HexData,
  type HexScale,
} from "../data/kontur";
import type { PopulationStatus } from "./PopulationOverlay";
let cached: HexData | null = null;
export default function HexPopulation({
  overlay,
  is3D,
  zoom,
  beforeId,
  onStatus,
}: {
  overlay: Pick<MapboxOverlay, "setProps">;
  is3D: boolean;
  zoom: number;
  beforeId?: string;
  onStatus: (status: PopulationStatus) => void;
}) {
  const [data, setData] = useState<HexData | null>(cached),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const [scale, setScale] = useState<HexScale>(pillarDefaults.scale),
    [exaggeration, setExaggeration] = useState<number>(pillarDefaults.exaggeration),
    [coverage, setCoverage] = useState(pillarDefaults.coverage);
  const [selected, setSelected] = useState<Hex | null>(null),
    [hovered, setHovered] = useState<Hex | null>(null),
    [query, setQuery] = useState("");
  const [emphasis, setEmphasis] = useState<number>(POPULATION_DISPLAY.emphasisDefault);
  const values = useMemo(
    () =>
      data ? populationValues(data) : [],
    [data],
  );
  const settings = useMemo(() => populationDisplaySettings(values, emphasis, is3D), [values, emphasis, is3D]);
  useEffect(() => {
    if (data) {
      onStatus("ready");
      return;
    }
    const abort = new AbortController();
    setError(false);
    onStatus("loading");
    fetch("/data/kontur_h3_four_counties.geojson", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Unavailable");
        return r.json();
      })
      .then(parseHexagons)
      .then((d) => {
        if (!abort.signal.aborted) {
          cached = d;
          setData(d);
          onStatus("ready");
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError(true);
          onStatus("error");
        }
      });
    return () => abort.abort();
  }, [data, retry, onStatus]);
  useEffect(() => {
    overlay.setProps({ effects: [], layers: data ? hexPopulationLayers(data, is3D, zoom, settings,
      scale, exaggeration, coverage, beforeId, setHovered, setSelected) : [] });
    return () => overlay.setProps({ layers: [], effects: [] });
  }, [overlay, data, is3D, zoom, settings, scale, exaggeration, coverage, beforeId]);
  const display = (value: number | null) =>
    value === null
      ? "Unavailable"
      : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return (
    <>
      <div className="population-legend">
        <div
          aria-hidden="true"
          style={{
            background: is3D ? populationNeedleRampCss : hexRampCss,
            height: 6,
            borderRadius: 3,
            marginBottom: 8,
          }}
        />
        Hexagons · Kontur, modeled
        <br />
        Modeled estimate, Kontur Population · people per hexagon.
        <br />
        {is3D ? "Color: dark teal → cyan → cyan-white. Additive light builds in overlapping spikes; per-spike emission is capped." : "Color: very dark teal → neon cyan-green. Height, color and opacity use the same stretched display value."} Basemap labels draw above the data.
        {is3D ? " Thin needles fade from a bright base to a transparent tip, with faint wider bloom." : " Small soft circles: radius uses the stretched display value and adapts to zoom."}
        <label>
          Display emphasis: {emphasis}%
          <input aria-label="Population display emphasis" type="range" min="0" max="100" step="5"
            value={emphasis} onChange={e=>setEmphasis(Number(e.target.value))}/>
        </label>
        <p aria-label="Population display method">
          Display setting only; does not change the data. Floor: {Math.round(settings.floorPercentile*100)}th percentile
          ({display(settings.floor)} people); ceiling: {is3D ? "99.5th" : "95th"} percentile ({display(settings.ceiling)} people).
          Power: {settings.gamma.toFixed(1)}. Below-floor values nearly vanish; above-ceiling values share the brightest display value.{" "}
          {is3D ? "Wider bloom follows each spike; ground glow is limited to the top 3%. Local cores may saturate when many spikes overlap." : "Glow is limited to the top 10%."} Inspect any H3 ID for its original value.
        </p>
        <label>
          Height scale
          <select
            aria-label="Hexagon height scale"
            value={scale}
            onChange={(e) => setScale(e.target.value as HexScale)}
          >
            <option value="sqrt">Square root</option>
            <option value="linear">Linear</option>
            <option value="log">Log (normalized display value)</option>
          </select>
        </label>
        <label>
          Vertical exaggeration: {exaggeration.toFixed(1)}×
          <input
            aria-label="Vertical exaggeration"
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={exaggeration}
            onChange={(e) => setExaggeration(Number(e.target.value))}
          />
        </label>
        {is3D && (
          <label>
            Column width: {coverage.toFixed(2)}
            <input
              aria-label="Column width"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={coverage}
              onChange={(e) => setCoverage(Number(e.target.value))}
            />
            Widths are not to scale; width is a display setting, not population
            or land area.
          </label>
        )}
        Display height: 4,000 m × exaggeration × stretched display value².{" "}
        {is3D
          ? "An 8 m × exaggeration picking floor retains faint positive values. Display metres are not building heights."
          : "Flat view; height controls apply in 3D."}
      </div>
      {error ? (
        <p role="alert">
          Kontur population unavailable.{" "}
          <button onClick={() => setRetry(retry + 1)}>Retry hexagons</button>
        </p>
      ) : !data ? (
        <p role="status">Loading modeled hexagons…</p>
      ) : (
        <>
          <p className="population-hint">
            Hover to highlight. Click or tap a hexagon to inspect.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSelected(
                data.features.find((f) => f.properties.h3 === query.trim()) ??
                  null,
              );
            }}
          >
            <label>
              Inspect H3 ID
              <input
                aria-label="Inspect H3 ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button type="submit">Inspect hexagon</button>
          </form>
          {hovered && !selected && (
            <p className="population-hover">
              Hexagon {hovered.properties.h3} ·{" "}
              {display(hovered.properties.population)} people — modeled
              estimate, Kontur Population
            </p>
          )}
          {selected && (
            <div className="tract-inspector" aria-label="Hexagon details">
              <header>
                <h3>Hexagon {selected.properties.h3}</h3>
                <button
                  aria-label="Close hexagon details"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              </header>
              <dl>
                <dt>
                  Modeled estimate, Kontur Population · people in this hexagon
                </dt>
                <dd>{display(selected.properties.population)}</dd>
                <dt>County</dt>
                <dd>{selected.properties.county}</dd>
                <dt>Census tract ID</dt>
                <dd>{selected.properties.tract_geoid}</dd>
                <dt>
                  ACS, measured · total population of the entire tract, not this
                  hexagon
                </dt>
                <dd>{display(selected.properties.tract_pop_acs)}</dd>
              </dl>
            </div>
          )}
        </>
      )}
      <p className="population-source">
        Kontur Population · release 2023-11-01 ·{" "}
        <a href="https://data.humdata.org/organization/kontur">
          CC BY · Kontur / Humanitarian Data Exchange
        </a>
        .<br />
        Modeled estimate, not a measured count.
      </p>
    </>
  );
}
