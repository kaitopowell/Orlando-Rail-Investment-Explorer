import { useEffect, useMemo, useState } from "react";
import type { Map } from "maplibre-gl";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import {
  equityBreaks,
  equityLabels,
  equityHeadlines,
  equityPoint,
  type EquityClassification,
  parseEquity,
  type EquityData,
  type EquityMeasure,
  type EquityTract,
} from "../data/equity";
import EquityLegend from "./EquityLegend";
import { equityLayers } from "../map/equityLayers";
const source = "ACS 5-year estimates 2020-2024";
const format = (n: number | null) =>
  n === null
    ? "value not available"
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
export default function EquityOverlay({
  map,
  overlay,
  enabled,
  compactLegend,
}: {
  map: Map;
  overlay: Pick<MapboxOverlay, "setProps">;
  enabled: boolean;
  compactLegend: boolean;
}) {
  const [data, setData] = useState<EquityData | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const [method, setMethod] = useState<EquityClassification>("fixed"),
    [showCounts, setShowCounts] = useState(false),
    [legendOpen, setLegendOpen] = useState(true);
  useEffect(() => {
    if (compactLegend && window.innerWidth <= 600) setLegendOpen(false);
  }, [compactLegend]);
  const points = useMemo(
    () =>
      new globalThis.Map(
        data?.features.map(
          (f) => [f.properties.GEOID, equityPoint(f)] as const,
        ) ?? [],
      ),
    [data],
  );
  const [measure, setMeasure] = useState<EquityMeasure>("pct_zero_vehicle"),
    [selected, setSelected] = useState<EquityTract | null>(null),
    [hovered, setHovered] = useState<EquityTract | null>(null);
  useEffect(() => {
    if (!enabled) {
      setSelected(null);
      setHovered(null);
      return;
    }
    if (data) return;
    const abort = new AbortController();
    setError(false);
    fetch("/data/equity_tracts.geojson", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Unavailable");
        return r.json();
      })
      .then(parseEquity)
      .then((d) => {
        if (!abort.signal.aborted) setData(d);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [enabled, data, retry]);
  const breaks = useMemo(
    () => (data ? equityBreaks(data, measure, method) : []),
    [data, measure, method],
  );
  useEffect(() => {
    overlay.setProps({
      layers:
        enabled && data
          ? equityLayers(
              data,
              measure,
              breaks,
              hovered?.properties.GEOID ?? selected?.properties.GEOID ?? null,
              setHovered,
              setSelected,
              method,
              showCounts,
              points,
            )
          : [],
    });
    return () => overlay.setProps({ layers: [] });
  }, [
    overlay,
    enabled,
    data,
    measure,
    breaks,
    hovered,
    selected,
    method,
    showCounts,
    points,
  ]);
  if (!enabled) return null;
  const p = selected?.properties;
  const unit = (v: number | null, income = false) =>
    v === null ? format(v) : income ? `$${format(v)}` : `${format(v)}%`;
  return (
    <>
      <section
        className="population-panel equity-panel"
        aria-label="Equity layer"
      >
        <details open>
          <summary>Equity · ACS 2020–2024</summary>
          <div className="equity-headline">
            <h2>{equityHeadlines[measure].title}</h2>
            <p>{equityHeadlines[measure].meaning}</p>
            <small aria-label="How to read">Match colors to the legend.</small>
          </div>
          <button
            onClick={() =>
              map.easeTo({ pitch: map.getPitch() ? 0 : 45, duration: 0 })
            }
            aria-label="Toggle equity 3D view"
          >
            2D / 3D
          </button>
          <label>
            Measure
            <select
              aria-label="Equity measure"
              value={measure}
              onChange={(e) => setMeasure(e.target.value as EquityMeasure)}
            >
              {Object.entries(equityLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Classification
            <select
              aria-label="Equity classification"
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as EquityClassification)
              }
            >
              <option value="fixed">Fixed breaks</option>
              <option value="quantiles">Quantiles</option>
            </select>
          </label>
          <label className="equity-count-toggle">
            <input
              type="checkbox"
              checked={showCounts}
              onChange={(e) => setShowCounts(e.target.checked)}
            />
            Show household counts
          </label>
          <p>Circle size always shows households without a vehicle.</p>
          <button
            aria-controls="equity-map-legend"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen(!legendOpen)}
          >
            {legendOpen ? "Collapse map legend" : "Show map legend"}
          </button>
          {error ? (
            <p role="alert">
              Equity data unavailable.{" "}
              <button onClick={() => setRetry(retry + 1)}>Retry equity</button>
            </p>
          ) : !data ? (
            <p role="status">Loading equity…</p>
          ) : (
            <>
              <p>Hover to highlight. Click or tap a tract to inspect.</p>
              <label>
                Inspect equity tract
                <select
                  aria-label="Inspect equity tract"
                  value={p?.GEOID ?? ""}
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
              {hovered && !p && <p>{hovered.properties.name}</p>}
              {p && (
                <div className="tract-inspector" aria-label="Equity details">
                  <header>
                    <h3>{p.name}</h3>
                    <button
                      aria-label="Close equity details"
                      onClick={() => setSelected(null)}
                    >
                      ×
                    </button>
                  </header>
                  <p>Tract ID: {p.GEOID}</p>
                  <dl>
                    <dt>Households · {source}</dt>
                    <dd>{format(p.households)}</dd>
                    <dt>No-vehicle households ± margin of error · {source}</dt>
                    <dd>
                      {format(p.hh_no_vehicle)} ± {format(p.B08201_002M)}
                    </dd>
                    <dt>Households with no vehicle · {source}</dt>
                    <dd>{unit(p.pct_zero_vehicle)}</dd>
                    <dt>People below poverty · {source}</dt>
                    <dd>{unit(p.pct_poverty)}</dd>
                    <dt>
                      Median household income ± margin of error · {source}
                    </dt>
                    <dd>
                      {unit(p.median_income, true)} ±{" "}
                      {unit(p.median_income_moe, true)}
                    </dd>
                  </dl>
                  {p.small_base && (
                    <p>small sample: fewer than 100 households</p>
                  )}
                  {p.median_income === 250001 && (
                    <p>income top-coded at $250,001 or more</p>
                  )}
                  {p.households === 0 && (
                    <p>no households: value not computed</p>
                  )}
                </div>
              )}
            </>
          )}
          <p className="population-source">
            <a href="https://api.census.gov/data/2024/acs/acs5">{source}</a>.
            Shares are estimates with sampling error.
          </p>
        </details>
      </section>
      {data && (
        <EquityLegend
          data={data}
          measure={measure}
          method={method}
          breaks={breaks}
          showCounts={showCounts}
          open={legendOpen}
          onOpen={setLegendOpen}
        />
      )}
    </>
  );
}
