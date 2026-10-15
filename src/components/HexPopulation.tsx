import { useEffect, useMemo, useState } from "react";
import { ColumnLayer, GeoJsonLayer } from "@deck.gl/layers";
import {
  AmbientLight,
  DirectionalLight,
  LightingEffect,
  type PickingInfo,
} from "@deck.gl/core";
import {
  pillarDefaults,
  pillarRampCss,
  hexCenter,
  pillarRadius,
  warmThreshold,
  pillarColor,
} from "../data/kontur3d";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import {
  parseHexagons,
  hexColor,
  hexHeight,
  hexRampCss,
  type Hex,
  type HexData,
  type HexProperties,
  type HexScale,
} from "../data/kontur";
import type { PopulationStatus } from "./PopulationOverlay";
let cached: HexData | null = null;
export default function HexPopulation({
  overlay,
  is3D,
  beforeId,
  onStatus,
}: {
  overlay: Pick<MapboxOverlay, "setProps">;
  is3D: boolean;
  beforeId?: string;
  onStatus: (status: PopulationStatus) => void;
}) {
  const [data, setData] = useState<HexData | null>(cached),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const [scale, setScale] = useState<HexScale>(pillarDefaults.scale),
    [exaggeration, setExaggeration] = useState(pillarDefaults.exaggeration),
    [coverage, setCoverage] = useState(pillarDefaults.coverage);
  const lighting = useMemo(
    () =>
      new LightingEffect({
        ambient: new AmbientLight({ intensity: 0.8 }),
        sun: new DirectionalLight({
          direction: [-1, -2, -3],
          intensity: 0.7,
          color: [255, 244, 230],
        }),
      }),
    [],
  );
  const radius = useMemo(() => (data ? pillarRadius(data) : 0), [data]);
  const threshold = useMemo(() => (data ? warmThreshold(data) : 0), [data]);
  const [selected, setSelected] = useState<Hex | null>(null),
    [hovered, setHovered] = useState<Hex | null>(null),
    [query, setQuery] = useState("");
  const maximum = useMemo(
    () =>
      data ? Math.max(...data.features.map((f) => f.properties.population)) : 0,
    [data],
  );
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
    overlay.setProps({
      effects: is3D ? [lighting] : [],
      layers: data
        ? [
            ...(is3D
              ? [
                  new ColumnLayer<Hex, { beforeId?: string }>({
                    id: "population-hexagon-pillars",
                    data: data.features,
                    beforeId,
                    diskResolution: 6,
                    radius,
                    coverage,
                    radiusUnits: "meters",
                    getPosition: hexCenter,
                    extruded: true,
                    pickable: true,
                    getElevation: (f) =>
                      hexHeight(
                        f.properties.population,
                        maximum,
                        scale,
                        exaggeration,
                      ),
                    getFillColor: (f) =>
                      pillarColor(f.properties.population, threshold, maximum),
                    autoHighlight: true,
                    highlightColor: [255, 240, 170, 90],
                    material: {
                      ambient: 0.65,
                      diffuse: 0.6,
                      shininess: 8,
                      specularColor: [70, 85, 90],
                    },
                    onHover: (info: PickingInfo<Hex>) =>
                      setHovered(info.object ?? null),
                    onClick: (info: PickingInfo<Hex>) => {
                      if (info.object) setSelected(info.object);
                      return true;
                    },
                    updateTriggers: {
                      getElevation: [scale, exaggeration, maximum],
                      getFillColor: [threshold, maximum],
                    },
                  }),
                ]
              : [
                  new GeoJsonLayer<HexProperties>({
                    id: "population-hexagons",
                    data,
                    extruded: false,
                    filled: true,
                    stroked: true,
                    pickable: true,
                    getElevation: (f) =>
                      hexHeight(
                        f.properties.population,
                        maximum,
                        scale,
                        exaggeration,
                      ),
                    getFillColor: (f) =>
                      hexColor(f.properties.population, maximum),
                    getLineColor: [75, 154, 167, 70],
                    getLineWidth: 0.4,
                    lineWidthUnits: "pixels",
                    autoHighlight: true,
                    highlightColor: [255, 240, 170, 90],
                    material: {
                      ambient: 0.5,
                      diffuse: 0.65,
                      shininess: 18,
                      specularColor: [100, 130, 130],
                    },
                    onHover: (info) => setHovered((info.object as Hex) ?? null),
                    onClick: (info) => {
                      if (info.object) setSelected(info.object as Hex);
                      return true;
                    },
                    updateTriggers: {
                      getElevation: [scale, exaggeration, maximum],
                      getFillColor: maximum,
                    },
                  }),
                ]),
          ]
        : [],
    });
    return () => overlay.setProps({ layers: [], effects: [] });
  }, [
    overlay,
    data,
    is3D,
    lighting,
    maximum,
    scale,
    exaggeration,
    coverage,
    radius,
    threshold,
    beforeId,
  ]);
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
            background: is3D ? pillarRampCss : hexRampCss,
            height: 6,
            borderRadius: 3,
            marginBottom: 8,
          }}
        />
        Hexagons · Kontur, modeled
        <br />
        Modeled estimate, Kontur Population · people per hexagon.
        <br />
        {is3D ? (
          <>
            Color: dim, low-opacity blue-gray → teal; orange → yellow only at or
            above the 95th percentile ({display(threshold)} people per hexagon).
            Basemap labels draw above pillars.
          </>
        ) : (
          "Color: low blue → teal → orange → high yellow (square-root ramp)."
        )}
        <label>
          Height scale
          <select
            aria-label="Hexagon height scale"
            value={scale}
            onChange={(e) => setScale(e.target.value as HexScale)}
          >
            <option value="sqrt">Square root</option>
            <option value="linear">Linear</option>
            <option value="log">Log (ln(1 + population))</option>
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
        Display height: 2,000 m × exaggeration × scaled population / scaled
        maximum.{" "}
        {is3D
          ? "Thin pillars; display metres are not building heights."
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
