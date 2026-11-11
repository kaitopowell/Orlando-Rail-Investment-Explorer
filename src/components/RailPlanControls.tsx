import type { RailState } from "./useRailPlan";
import {
  equityAt,
  type EquityReach,
  type RailSelection,
} from "../data/railPlan";
import { LINK_TYPES, PHASES } from "../map/railPlanLayers";
export const railNumber = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });
export const railMoney = (n: number) => `$${railNumber(n)}M`;
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
export function RailInspection({
  state,
  selection,
}: {
  state: RailState;
  selection: RailSelection;
}) {
  if (!selection || !state.network || !state.data || !state.scenario)
    return null;
  const links = state.network.links.filter((l) =>
    selection.kind === "link"
      ? l.id === selection.id
      : selection.kind === "station"
        ? [l.from, l.to].includes(selection.id)
        : state
            .scenario!.steps.find((s) => s.route_id === selection.id)
            ?.new_link_ids.includes(l.id),
  );
  const station = state.network.stations.find((c) => c.id === selection.id);
  return (
    <div className="rail-inspection">
      <h3>
        {station?.name ??
          (selection.kind === "step"
            ? "Selected build step"
            : "Link inspection")}
      </h3>
      {station && (
        <p>
          {station.anchor ? "Anchor station" : "Station"} ·{" "}
          {railNumber(station.jobs)} jobs · {railNumber(station.population)}{" "}
          population. First served in step {Math.min(...links.map(l => state.network!.built.get(l.id)!)) + 1}.
          Costs below are for links; station construction is excluded.
        </p>
      )}
      {links.map((l) => (
        <div key={l.id}>
          <strong>
            {l.from_name} – {l.to_name}
          </strong>
          <p>
            {LINK_TYPES[l.class].label} · {railNumber(l.length_km)} km ·{" "}
            {railMoney(
              state.cost === "low" ? l.cost_low_musd : l.cost_high_musd,
            )}{" "}
            ({state.cost} cost) · added in step{" "}
            {state.network!.built.get(l.id)! + 1}
          </p>
        </div>
      ))}
    </div>
  );
}
function Reach({ value, region }: { value: EquityReach; region: number }) {
  return (
    <>
      <dl>
        <dt>Households reached</dt>
        <dd>{percent(value.share_of_households)}</dd>
        <dt>No-vehicle households reached</dt>
        <dd>{percent(value.share_of_no_vehicle_households)}</dd>
        <dt>People in poverty reached</dt>
        <dd>{percent(value.share_of_people_in_poverty)}</dd>
        <dt>Median income of reached tracts / region</dt>
        <dd>
          {value.median_income_covered === null
            ? "Unavailable"
            : `$${railNumber(value.median_income_covered)}`}{" "}
          / ${railNumber(region)}
        </dd>
      </dl>
      <p>
        {value.no_vehicle_ratio === null
          ? "No-car ratio unavailable"
          : `${value.no_vehicle_ratio.toFixed(2)}× its fair share of households with no car`}
        .{" "}
        {value.poverty_ratio === null
          ? "Poverty ratio unavailable"
          : `${value.poverty_ratio.toFixed(2)}× its fair share of people in poverty`}
        .
      </p>
    </>
  );
}
export default function RailPlanControls({
  state,
  onSelect,
}: {
  state: RailState;
  onSelect: (s: RailSelection) => void;
}) {
  const { data, scenario, network } = state;
  const equity =
    data && scenario ? equityAt(data, scenario, state.budget) : null;
  return (
    <section
      className="candidate-controls rail-plan-controls"
      aria-labelledby="rail-plan-heading"
    >
      <div className="section-heading">
        <h2 id="rail-plan-heading">Rail plan</h2>
      </div>
      <label className="layer">
        <span className="layer-symbol" aria-hidden="true">
          ━
        </span>
        <span className="layer-text">
          <strong>Proposed rail network</strong>
          <small>Illustrative model · not surveyed routes</small>
        </span>
        <input
          type="checkbox"
          aria-label="Proposed rail network"
          checked={state.enabled}
          onChange={(e) => state.setEnabled(e.target.checked)}
        />
      </label>
      {state.enabled && (
        <div className="candidate-details">
          {state.error ? (
            <p role="alert">
              Rail plan unavailable: {state.error}{" "}
              <button onClick={state.retry}>Retry rail plan</button>
            </p>
          ) : !data ? (
            <p role="status">Loading rail plan…</p>
          ) : (
            <>
              <label>
                Objective
                <select
                  aria-label="Rail objective"
                  value={state.measure}
                  onChange={(e) =>
                    state.setMeasure(e.target.value as typeof state.measure)
                  }
                >
                  <option value="minutes_saved">Minutes saved</option>
                  <option value="workers_connected">
                    Workers newly connected
                  </option>
                </select>
              </label>
              <div className="rail-assumptions">
                <label>
                  Cost
                  <select
                    aria-label="Rail cost"
                    value={state.cost}
                    onChange={(e) =>
                      state.setCost(e.target.value as typeof state.cost)
                    }
                  >
                    <option value="low">Low</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label>
                  Wait + access
                  <select
                    aria-label="Rail overhead"
                    value={state.overhead}
                    onChange={(e) => state.setOverhead(Number(e.target.value))}
                  >
                    {[10, 20, 30].map((n) => (
                      <option key={n} value={n}>
                        {n} min
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {state.measure === "workers_connected" && (
                <label>
                  Competitiveness ratio
                  <select
                    aria-label="Rail competitiveness ratio"
                    value={state.ratio}
                    onChange={(e) => state.setRatio(Number(e.target.value))}
                  >
                    {[1.5, 2, 3].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              {!scenario || !network ? (
                <p role="alert">Selected scenario unavailable.</p>
              ) : (
                <>
                  <label>
                    Budget: <strong>{railMoney(state.budget)}</strong>
                    <input
                      className="rail-budget"
                      type="range"
                      aria-label="Rail budget"
                      aria-valuetext={railMoney(state.budget)}
                      min={0}
                      max={state.stops.length - 1}
                      step={1}
                      value={Math.max(
                        0,
                        state.stops.findIndex((n) => n >= state.budget),
                      )}
                      onChange={(e) =>
                        state.setBudget(state.stops[Number(e.target.value)])
                      }
                    />
                  </label>
                  <p>$0–$30B · stops at build costs and published budgets</p>
                  <div className="rail-budget-presets">
                    {data.plan.budgets_musd.map((b) => (
                      <button
                        key={b}
                        aria-pressed={state.budget === b}
                        onClick={() => state.setBudget(b)}
                      >
                        ${b / 1000}B
                      </button>
                    ))}
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={state.core}
                      onChange={(e) => state.setCore(e.target.checked)}
                    />{" "}
                    Highlight core network
                  </label>
                  <p>These links appear in every minutes-saved plan at $10B.</p>
                  <label>
                    Color by
                    <select
                      aria-label="Rail color by"
                      value={state.colorBy}
                      onChange={(e) =>
                        state.setColorBy(e.target.value as typeof state.colorBy)
                      }
                    >
                      <option value="phase">Build phase</option>
                      <option value="type">Link type</option>
                    </select>
                  </label>
                  <ul className="rail-legend" aria-label="Rail legend">
                    {(state.colorBy === "phase"
                      ? PHASES
                      : Object.values(LINK_TYPES)
                    ).map((p) => (
                      <li key={p.label}>
                        <span
                          style={{
                            backgroundColor: `rgb(${p.color.join(",")})`,
                          }}
                        />
                        {p.label}
                      </li>
                    ))}
                  </ul>
                  <div className="rail-summary" aria-live="polite">
                    <h3>Network at this budget</h3>
                    <p>
                      {railMoney(network.spent)} spent · {network.links.length}{" "}
                      links · {railNumber(network.miles)} miles ·{" "}
                      {network.stations.length} stations
                    </p>
                    {state.measure === "minutes_saved" ? (
                      <p>
                        {railNumber(network.score)} job-minutes saved per
                        weekday;{" "}
                        {railNumber(
                          network.score /
                            data.plan.denominators.workers_with_transit_option,
                        )}{" "}
                        minutes on average per worker with a transit option
                        today (
                        {railNumber(
                          data.plan.denominators.workers_with_transit_option,
                        )}{" "}
                        workers).
                      </p>
                    ) : (
                      <p>
                        {railNumber(network.score)} of{" "}
                        {railNumber(
                          data.plan.denominators.workers_without_transit_option,
                        )}{" "}
                        workers with no transit option today (
                        {percent(
                          network.score /
                            data.plan.denominators
                              .workers_without_transit_option,
                        )}
                        ) newly connected.
                      </p>
                    )}
                  </div>
                  <details className="rail-build-order">
                    <summary>
                      Build order · {network.steps.length} steps
                    </summary>
                    <ol>
                      {network.steps.map((s, i) => (
                        <li key={s.route_id}>
                          <button
                            aria-pressed={
                              state.selection?.kind === "step" &&
                              state.selection.id === s.route_id
                            }
                            onClick={() =>
                              onSelect({ kind: "step", id: s.route_id })
                            }
                          >
                            <strong>
                              {s.from_name} – {s.to_name}
                            </strong>
                            <small>
                              {railMoney(s.cost_musd)} · running total{" "}
                              {railMoney(s.total_cost_musd)}
                            </small>
                            <small>
                              Gain: {railNumber(s.gain)}{" "}
                              {state.measure === "minutes_saved"
                                ? "job-minutes saved per weekday"
                                : "workers newly connected"}
                            </small>
                            <span className="sr-only">Step {i + 1}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </details>
                  <label>
                    Inspect station
                    <select
                      aria-label="Inspect rail station"
                      value={
                        state.selection?.kind === "station"
                          ? state.selection.id
                          : ""
                      }
                      onChange={(e) =>
                        onSelect(
                          e.target.value
                            ? { kind: "station", id: e.target.value }
                            : null,
                        )
                      }
                    >
                      <option value="">Choose a station</option>
                      {network.stations.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {state.selection && (
                    <>
                      <button onClick={() => state.select(null)}>
                        Close rail inspection
                      </button>
                      <RailInspection
                        state={state}
                        selection={state.selection}
                      />
                    </>
                  )}
                  <details className="rail-equity">
                    <summary>Who does this serve?</summary>
                    <p>
                      Equity is separate from the commute score. Ratios above 1
                      mean proportionally more reach than the overall population
                      base.
                    </p>
                    {equity && equity.budget !== state.budget && (
                      <p>
                        Published ${equity.budget / 1000}B snapshot: exactly the
                        same built network.
                      </p>
                    )}
                    {!equity && (
                      <p>
                        Equity unavailable at this build step. Choose a
                        published budget above; results are not interpolated.
                      </p>
                    )}
                    {(["0.8", "2.0"] as const).map((r) => (
                      <div key={r}>
                        <h4>
                          {r === "0.8"
                            ? "Within 0.8 km (walking)"
                            : "Within 2 km (typical access distance)"}
                        </h4>
                        {equity && (
                          <Reach
                            value={equity.record[r]}
                            region={data.equity.region.median_income}
                          />
                        )}
                        <details>
                          <summary>Reference: all candidate centers</summary>
                          <Reach
                            value={
                              data.equity.benchmarks.all_candidate_centers[r]
                            }
                            region={data.equity.region.median_income}
                          />
                        </details>
                      </div>
                    ))}
                    <small>
                      {data.equity.notes.map((n) => (
                        <p key={n}>{n}</p>
                      ))}
                    </small>
                  </details>
                </>
              )}
              <details
                open={state.caveatsOpen}
                onToggle={(e) => state.setCaveatsOpen(e.currentTarget.open)}
              >
                <summary>Model caveats</summary>
                <ul>
                  {data.plan.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <p>
                  Links are straight lines between centers and not surveyed
                  routes.
                </p>
              </details>
            </>
          )}
        </div>
      )}
    </section>
  );
}
