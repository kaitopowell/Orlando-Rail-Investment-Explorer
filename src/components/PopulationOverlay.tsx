import { useEffect, useMemo, useState } from "react";
import type { Map } from "maplibre-gl";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import {
  parsePopulation,
  columnData,
  populationSource,
  type PopulationData,
  type Tract,
} from "../data/population";
import { populationLayers } from "../map/populationLayers";
export type PopulationStatus = "off" | "loading" | "ready" | "error";
const format = (value: number | null) =>
  value === null
    ? "Unavailable"
    : value.toLocaleString("en-US", { maximumFractionDigits: 1 });

export default function PopulationOverlay({
  map,
  overlay,
  enabled,
  onStatus,
}: {
  map: Map;
  overlay: MapboxOverlay;
  enabled: boolean;
  onStatus: (status: PopulationStatus) => void;
}) {
  const [data, setData] = useState<PopulationData | null>(null);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<Tract | null>(null);
  const [selected, setSelected] = useState<Tract | null>(null);
  const [retry, setRetry] = useState(0);
  const columns = useMemo(() => (data ? columnData(data) : []), [data]);
  useEffect(() => {
    if (!enabled) {
      onStatus("off");
      setSelected(null);
      setHovered(null);
      return;
    }
    if (data) {
      onStatus("ready");
      return;
    }
    const controller = new AbortController();
    setError(false);
    onStatus("loading");
    fetch("/data/population_tracts.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Population data unavailable");
        return response.json();
      })
      .then(parsePopulation)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          onStatus("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
          onStatus("error");
        }
      });
    return () => controller.abort();
  }, [enabled, data, retry, onStatus]);
  useEffect(() => {
    overlay.setProps({
      layers:
        enabled && data
          ? populationLayers(
              data,
              columns,
              hovered?.properties.GEOID ?? selected?.properties.GEOID ?? null,
              setHovered,
              setSelected,
            )
          : [],
    });
    return () => overlay.setProps({ layers: [] });
  }, [enabled, data, columns, hovered, selected, overlay]);
  useEffect(() => {
    map.easeTo({
      pitch: enabled ? 35 : 0,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 600,
    });
    return () => {
      overlay.setProps({ layers: [] });
    };
  }, [enabled, map, overlay]);
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  if (!enabled) return null;
  return (
    <section className="population-panel" aria-label="Population layer">
      <header>
        <h2>Population density</h2>
        <button
          onClick={() =>
            map.easeTo({ pitch: map.getPitch() > 0 ? 0 : 35, duration: 0 })
          }
          aria-label="Toggle population 3D view"
        >
          2D / 3D
        </button>
      </header>
      {error ? (
        <p role="alert">
          Population data could not load.{" "}
          <button onClick={() => setRetry(retry + 1)}>Retry population</button>
        </p>
      ) : !data ? (
        <p role="status">Loading population tracts…</p>
      ) : (
        <>
          <div className="population-legend">
            <span aria-hidden="true">▁ ▃ ▆</span> Square-root scale
            <br />
            Display height (m) = 20 × √(people/km² land).
            <br />
            Zero population: no column. Missing density: no column.
          </div>
          <p className="population-hint">
            Hover to highlight. Click or tap any tract to inspect.
          </p>
          <label className="tract-picker">
            Inspect tract
            <select
              aria-label="Inspect tract"
              value={selected?.properties.GEOID ?? ""}
              onChange={(event) =>
                setSelected(
                  data.features.find(
                    (t) => t.properties.GEOID === event.target.value,
                  ) ?? null,
                )
              }
            >
              <option value="">Select tract ID…</option>
              {data.features.map((t) => (
                <option key={t.properties.GEOID} value={t.properties.GEOID}>
                  {t.properties.GEOID} · {t.properties.county}
                  {t.properties.pop_est === 0 ? " · zero population" : ""}
                </option>
              ))}
            </select>
          </label>
          {hovered && !selected && (
            <p className="population-hover">Tract {hovered.properties.GEOID}</p>
          )}
          {selected && (
            <div className="tract-inspector" aria-label="Tract details">
              <header>
                <h3>Tract {selected.properties.GEOID}</h3>
                <button
                  aria-label="Close tract details"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              </header>
              <p>{selected.properties.county} County</p>
              <dl>
                <dt>Population estimate ± margin of error</dt>
                <dd>
                  {format(selected.properties.pop_est)}{" "}
                  {selected.properties.pop_moe === null
                    ? "(margin unavailable)"
                    : `± ${format(selected.properties.pop_moe)}`}
                </dd>
                <dt>Density · people/km² land</dt>
                <dd>{format(selected.properties.density)}</dd>
              </dl>
            </div>
          )}
        </>
      )}
      <p className="population-source">
        <a href={populationSource.url} target="_blank" rel="noreferrer">
          U.S. Census Bureau · {populationSource.label}
        </a>
        <br />
        Accessed {populationSource.accessDate}. Tracts: 2024, 1:500,000.
      </p>
    </section>
  );
}
