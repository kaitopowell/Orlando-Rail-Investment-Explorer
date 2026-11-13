import { useEffect } from "react";
import { RightPanel } from "./RightPanels";
import type { RailState } from "./useRailPlan";
import type { SunshineState } from "./useSunshine";
import {
  equityAt,
  type EquityReach,
  type RailSelection,
} from "../data/railPlan";
import { LINE_PALETTE, stationName } from "../data/networkDisplay";
import { CompactSunshineCompare, SunshineSources } from "./SunshineControls";
export const railNumber = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });
export const railMoney = (n: number) => `$${railNumber(n)}M`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
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
        ? [l.a, l.b].includes(selection.id)
        : state.scenario!.steps[Number(selection.id)]?.new_link_ids.includes(
            l.id,
          ),
  );
  return (
    <div className="rail-inspection">
      <h3>
        {state.data.plan.nodes.find((n) => n.id === selection.id)?.name ??
          "Rail inspection"}
      </h3>
      {links.map((l) => (
        <div key={l.id}>
          <strong>
            {l.a_name} – {l.b_name}
          </strong>
          <p>
            {state.network!.owner.get(l.id)?.name} ·{" "}
            {l.class.replaceAll("_", " ")} · {railNumber(l.length_km)} km ·{" "}
            {railMoney(
              state.cost === "low" ? l.cost_low_musd : l.cost_high_musd,
            )}{" "}
            · added in step {state.network!.built.get(l.id)! + 1}
          </p>
        </div>
      ))}
    </div>
  );
}
function Reach({ v, region }: { v: EquityReach; region: number }) {
  return (
    <p>
      Households {pct(v.share_of_households)} · No-vehicle households{" "}
      {pct(v.share_of_no_vehicle_households)} · People in poverty{" "}
      {pct(v.share_of_people_in_poverty)}
      <br />
      Median income{" "}
      {v.median_income_covered === null
        ? "unavailable"
        : `$${railNumber(v.median_income_covered)}`}{" "}
      / region ${railNumber(region)}
      <br />
      No-vehicle ratio {v.no_vehicle_ratio?.toFixed(2) ?? "n/a"}× · Poverty
      ratio {v.poverty_ratio?.toFixed(2) ?? "n/a"}×
    </p>
  );
}
export function RailPlanToggle({ state }: { state: RailState }) {
  return (
    <section className="candidate-controls" aria-label="Rail plan">
      <label className="layer">
        <span className="layer-symbol">━</span>
        <span className="layer-text">
          <strong>Proposed rail network</strong>
          <small>Named lines · connected network</small>
        </span>
        <input
          type="checkbox"
          aria-label="Proposed rail network"
          checked={state.enabled}
          onChange={(e) => {
            state.setEnabled(e.target.checked);
            state.setPanelOpen(true);
          }}
        />
      </label>
    </section>
  );
}
export default function RailPlanControls({
  showPopulation,
  onShowPopulation,
  state,
  sunshine,
  onSelect,
}: {
  state: RailState;
  showPopulation: boolean;
  onShowPopulation: (value: boolean) => void;
  sunshine: SunshineState;
  onSelect: (s: RailSelection) => void;
}) {
  useEffect(() => {
    if (!state.panelOpen) state.setHoverLine(null);
  }, [state.panelOpen, state.setHoverLine]);
  if (!state.enabled && !sunshine.enabled) return null;
  const { data, network, scenario } = state,
    eq = data && scenario ? equityAt(data, scenario, state.budget) : null;
  const lines =
    network?.lines.filter(
      (l) =>
        !state.core ||
        l.link_ids.some((id) => data?.core.has(id) && network.built.has(id)),
    ) ?? [];
  return (
    <RightPanel
      id="rail"
      title="Rail network"
      className="network-panel candidate-details rail-plan-controls"
      aria-label="Rail network controls"
    >
      <label className="rail-population">
        <input
          type="checkbox"
          checked={showPopulation}
          onChange={(e) => onShowPopulation(e.target.checked)}
        />{" "}
        Show population
      </label>
      {state.error ? (
        <p role="alert">
          {state.error} <button onClick={state.retry}>Retry rail plan</button>
        </p>
      ) : !data || !network || !scenario ? (
        <p role="status">Loading connected network…</p>
      ) : (
        <>
          <label className="network-budget">
            Budget {railMoney(state.budget)} · spent {railMoney(network.spent)}
            <input
              type="range"
              aria-label="Rail budget"
              aria-valuetext={`${railMoney(state.budget)}, spent ${railMoney(network.spent)}`}
              min={0}
              max={state.stops.length - 1}
              value={Math.max(0, state.stops.indexOf(state.budget))}
              onChange={(e) =>
                state.setBudget(state.stops[Number(e.target.value)])
              }
            />
          </label>
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
          <div className="network-selectors">
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
              Wait/access
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
            {state.measure === "workers_connected" && (
              <label>
                Ratio
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
            <label>
              Drawing
              <select
                aria-label="Rail drawing style"
                value={state.drawing}
                onChange={(e) =>
                  state.setDrawing(e.target.value as typeof state.drawing)
                }
              >
                <option value="schematic">Schematic</option>
                <option value="geographic">Geographic</option>
              </select>
            </label>
          </div>
          <div className="rail-summary" aria-live="polite">
            <p>
              Budget {railMoney(state.budget)} · spent{" "}
              {railMoney(network.spent)} · {network.steps.length} routes ·{" "}
              {network.links.length} links
            </p>
            {state.measure === "minutes_saved" ? (
              <p title="Total modeled job-minutes saved divided by all modeled commuters with a transit option today, including those with no saving. This is not the saving of a typical commuter.">
                {railNumber(network.score)} job-minutes saved per weekday ·
                Average{" "}
                {railNumber(
                  network.score /
                    data.plan.denominators.workers_with_transit_option,
                )}{" "}
                min saved across the{" "}
                {railNumber(data.plan.denominators.workers_with_transit_option)}{" "}
                commuters who have a transit option today (commute pairs we
                model only).
              </p>
            ) : (
              <p>
                {railNumber(network.score)} workers newly connected /{" "}
                {railNumber(
                  data.plan.denominators.workers_without_transit_option,
                )}{" "}
                without transit today (
                {pct(
                  network.score /
                    data.plan.denominators.workers_without_transit_option,
                )}
                ).
              </p>
            )}
            <p>
              Within 2 km:{" "}
              {eq
                ? `${pct(eq.record["2.0"].share_of_households)} of households, ${pct(eq.record["2.0"].share_of_no_vehicle_households)} of no-vehicle households`
                : "no matching equity snapshot"}
            </p>
          </div>
          <label>
            <input
              type="checkbox"
              checked={state.core}
              onChange={(e) => state.setCore(e.target.checked)}
            />{" "}
            Core network only
          </label>
          {state.core && (
            <p className="network-note">
              Showing only built links common to every $10B minutes-saved
              scenario. Summary describes the full selected plan.
            </p>
          )}
          {sunshine.enabled && (
            <CompactSunshineCompare state={sunshine} rail={state} />
          )}
          <details
            className="network-lines"
            onToggle={(e) => {
              if (!e.currentTarget.open) state.setHoverLine(null);
            }}
          >
            <summary>Lines · {lines.length}</summary>
            <ul>
              {lines.map((l) => (
                <li key={l.id}>
                  <button
                    onMouseEnter={() => state.setHoverLine(l.id)}
                    onMouseLeave={() => state.setHoverLine(null)}
                    onFocus={() => state.setHoverLine(l.id)}
                    onBlur={() => state.setHoverLine(null)}
                  >
                    <span style={{ background: LINE_PALETTE[l.color_index] }} />
                    {l.id} · {l.name}
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <details className="rail-build-order">
            <summary>Build order · {network.steps.length} routes</summary>
            <ol>
              {network.steps.map((s, index) => (
                <li key={index}>
                  <button
                    onClick={() =>
                      onSelect({ kind: "step", id: String(index) })
                    }
                  >
                    {s.from_name} to {s.to_name}
                    <small>
                      {railMoney(s.cost_musd)} · total{" "}
                      {railMoney(s.total_cost_musd)} · gain {railNumber(s.gain)}{" "}
                      {state.measure === "minutes_saved"
                        ? "job-minutes"
                        : "workers"}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
          </details>
          <details className="network-details">
            <summary>Details</summary>
            <label>
              Inspect station
              <select
                aria-label="Inspect rail station"
                value={
                  state.selection?.kind === "station" ? state.selection.id : ""
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
                {data.plan.nodes
                  .filter(
                    (n) =>
                      n.existing_station ||
                      network.stations.some((s) => s.id === n.id),
                  )
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {stationName(n.name)}
                    </option>
                  ))}
              </select>
            </label>
            <h3>Equity, separate from commute scores</h3>
            {eq && eq.budget !== state.budget && (
              <p>
                Published ${eq.budget / 1000}B snapshot: identical built links.
              </p>
            )}
            {(["0.8", "2.0"] as const).map((r) => (
              <div key={r}>
                <h4>Within {r} km</h4>
                {eq ? (
                  <Reach
                    v={eq.record[r]}
                    region={data.equity.region.median_income}
                  />
                ) : (
                  <p>No matching snapshot; not interpolated.</p>
                )}
                <h4>Existing stations benchmark</h4>
                <Reach
                  v={data.equity.benchmarks.existing_stations[r]}
                  region={data.equity.region.median_income}
                />
              </div>
            ))}
            <h3>Model caveats</h3>
            <ul>
              {data.plan.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p>{data.plan.denominators.note}</p>
            {data.equity.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
            <p>
              Drawing geometry does not change stations, costs, lengths or
              scores. Minutes cannot be expressed as a percent of a worker
              count; the mean uses all workers with a transit baseline.
            </p>
            {data.plan.documented_projects.map((p) => (
              <p key={p.link_id}>
                {p.source}: {p.note}
              </p>
            ))}
            {sunshine.enabled && <SunshineSources state={sunshine} />}
          </details>
        </>
      )}
    </RightPanel>
  );
}
