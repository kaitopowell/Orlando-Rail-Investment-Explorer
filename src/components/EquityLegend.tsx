import {
  equityClassLabel,
  equityCounts,
  equityHeadlines,
  equityLabels,
  equityRamp,
  householdRadius,
  type EquityClassification,
  type EquityData,
  type EquityMeasure,
} from "../data/equity";
export default function EquityLegend({
  data,
  measure,
  method,
  breaks,
  showCounts,
  open,
  onOpen,
}: {
  data: EquityData;
  measure: EquityMeasure;
  method: EquityClassification;
  breaks: number[];
  showCounts: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const counts = equityCounts(data, measure, breaks, method);
  const maximum = Math.max(
    ...data.features.map((f) => f.properties.hh_no_vehicle ?? 0),
  );
  const unavailable = data.features.filter(
    (f) => f.properties.hh_no_vehicle === null,
  ).length;
  return (
    <details
      className="equity-map-legend"
      id="equity-map-legend"
      aria-label="Equity map legend"
      open={open}
      onToggle={(e) => onOpen(e.currentTarget.open)}
    >
      <summary>
        Equity · map legend{" "}
        <span>{method === "fixed" ? "Fixed breaks" : "Quantiles"}</span>
      </summary>
      <div className="equity-legend-body">
        <h2>{equityLabels[measure]}</h2>
        <p className="equity-legend-meaning">
          {equityHeadlines[measure].meaning}
        </p>
        <p>
          {method === "fixed"
            ? "Fixed breaks: the same ranges each time."
            : "Quantiles: five groups with approximately equal numbers of tracts; 20th/40th/60th/80th percentiles, linearly interpolated, excluding missing values. Break labels rounded to 2 decimals."}
        </p>
        <ol className="equity-classes">
          {counts.classes.map((count, index) => (
            <li key={index}>
              <span
                className="equity-swatch"
                style={{
                  background: `rgb(${equityRamp[measure === "median_income" ? 4 - index : index].join(",")})`,
                }}
              />
              <span>{equityClassLabel(index, breaks, measure, method)}</span>
              <strong>{count} tracts</strong>
            </li>
          ))}
        </ol>
        <p className="equity-missing">
          <span className="equity-swatch missing" />
          Gray: value not available · {counts.missing} tracts
        </p>
        <p>
          Dimmer: small sample, fewer than 100 households. Thin outlines keep
          low values visible. Fill stays flat in 2D and 3D.
        </p>
        {showCounts && (
          <div className="equity-circle-key">
            <h3>Circle size: households without a vehicle</h3>
            <p>
              {measure === "median_income"
                ? "Brighter means lower income."
                : measure === "pct_poverty"
                  ? "Brighter means a high poverty share."
                  : "Brighter means a high no-vehicle share."}{" "}
              A bigger circle means more households without a vehicle, not a
              higher share.
            </p>
            <div className="equity-size-examples">
              {[Math.round(maximum / 4), maximum].map((count) => (
                <div key={count}>
                  <svg width="60" height="60" aria-hidden="true">
                    <circle
                      cx="30"
                      cy="30"
                      r={householdRadius(count, maximum) ?? 0}
                    />
                  </svg>
                  <span>{count.toLocaleString("en-US")} households</span>
                </div>
              ))}
            </div>
            <p>
              Circle area is proportional to the count. Zero: no circle.
              Unavailable: no circle ({unavailable} tracts). Points mark tract
              interiors, not household locations.
            </p>
          </div>
        )}
        <p className="equity-legend-source">
          ACS 5-year estimates 2020–2024. Shares are estimates with sampling
          error.
        </p>
      </div>
    </details>
  );
}
