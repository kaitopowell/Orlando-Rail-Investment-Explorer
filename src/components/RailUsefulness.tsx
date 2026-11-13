import { useEffect, useState } from "react";
import type { RailState } from "./useRailPlan";
import {
  commuteBaseline,
  driveDenominator,
  formatCount,
  formatMinutes,
  formatShare,
  usefulnessAt,
} from "../data/railUsefulness";

export function UsefulnessSummary({ state }: { state: RailState }) {
  if (!state.data || !state.scenario) return null;
  const plan = state.data.plan,
    u = usefulnessAt(plan, state.scenario, state.budget);
  return (
    <section
      className="usefulness-headlines"
      aria-label="How useful is this plan?"
    >
      <h3>How useful is this plan?</h3>
      {u ? (
        <>
          <p>
            <strong>
              ~{formatCount(u.commuters_saving["20"])} commuters save 20+ min
            </strong>{" "}
            (
            {formatShare(
              u.commuters_saving["20"],
              plan.denominators.workers_with_transit_option,
            )}{" "}
            of commuters who have a transit option today).
          </p>
          <p>
            Rail would be within 2x of driving for{" "}
            <strong>
              ~{formatCount(u.rail_competitive_with_driving["2.0"])} commuters
            </strong>{" "}
            (
            {formatShare(
              u.rail_competitive_with_driving["2.0"],
              driveDenominator(plan),
            )}{" "}
            of all commuters).
          </p>
        </>
      ) : (
        <p>
          No published usefulness snapshot for this built network. Choose one of
          the published budget buttons.
        </p>
      )}
      <p className="network-note">
        Not a traffic forecast: it counts commutes where rail becomes close to
        driving time; we do not simulate congestion.
      </p>
    </section>
  );
}
export function UsefulnessDetails({ state }: { state: RailState }) {
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [state.scenario?.id, state.budget]);
  if (!state.data || !state.scenario) return null;
  const plan = state.data.plan,
    u = usefulnessAt(plan, state.scenario, state.budget),
    baseline = commuteBaseline(plan, state.commute.from, state.commute.to);
  const names = new Map(plan.nodes.map((n) => [n.id, n.name]));
  const pick = (from: string, to: string) => {
    state.setCommute({ from, to });
    state.select(null);
    if (from && to) state.setEnabled(true);
  };
  return (
    <section
      className="usefulness-details"
      aria-label="Commute usefulness details"
    >
      {u && (
        <>
          <h3>Commuters by time saved</h3>
          <p className="network-note">
            Cumulative counts: 30+ is included in 20+ and 10+. Shares use all{" "}
            {plan.denominators.workers_with_transit_option.toLocaleString(
              "en-US",
            )}{" "}
            commuters with a transit option today.
          </p>
          <ul className="commute-bars">
            {(["10", "20", "30"] as const).map((key) => (
              <li key={key}>
                <span>
                  {key}+ min · ~{formatCount(u.commuters_saving[key])} (
                  {formatShare(
                    u.commuters_saving[key],
                    plan.denominators.workers_with_transit_option,
                  )}
                  )
                </span>
                <meter
                  min={0}
                  max={plan.denominators.workers_with_transit_option}
                  value={u.commuters_saving[key]}
                  aria-label={`${key}+ minutes saved`}
                />
              </li>
            ))}
          </ul>
          <p>
            Within 1.5x of driving: ~
            {formatCount(u.rail_competitive_with_driving["1.5"])} commuters (
            {formatShare(
              u.rail_competitive_with_driving["1.5"],
              driveDenominator(plan),
            )}{" "}
            of all commuters).
          </p>
          <p className="network-note">
            Driving comparison base:{" "}
            {driveDenominator(plan).toLocaleString("en-US")} commuters. Counts
            ≥1,000 are rounded to the nearest hundred; percentages use unrounded
            counts.
          </p>
          <h3>Top improved commutes</h3>
          <ol className="improved-commutes">
            {u.top_pairs
              .slice(0, all ? u.top_pairs.length : 5)
              .map((pair, i) => (
                <li key={`${pair.home}-${pair.work}-${i}`}>
                  <button
                    aria-pressed={
                      state.commute.from === pair.home &&
                      state.commute.to === pair.work
                    }
                    onClick={() => pick(pair.home, pair.work)}
                  >
                    {names.get(pair.home)} → {names.get(pair.work)}:{" "}
                    {formatMinutes(pair.today_min)} →{" "}
                    {formatMinutes(pair.with_plan_min)} (−
                    {Math.round(pair.saved_min)}), ~{formatCount(pair.workers)}{" "}
                    workers, driving {formatMinutes(pair.drive_min)}
                  </button>
                </li>
              ))}
          </ol>
          {u.top_pairs.length > 5 && (
            <button aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? "Show first 5" : `Show all ${u.top_pairs.length}`}
            </button>
          )}
        </>
      )}
      <h3>Pick a commute</h3>
      <div className="commute-selectors">
        {(["from", "to"] as const).map((end) => (
          <label key={end}>
            {end === "from" ? "From" : "To"}
            <select
              aria-label={`Commute ${end}`}
              value={state.commute[end]}
              onChange={(e) =>
                pick(
                  end === "from" ? e.target.value : state.commute.from,
                  end === "to" ? e.target.value : state.commute.to,
                )
              }
            >
              <option value="">Choose a station or center</option>
              {[...plan.nodes]
                .sort(
                  (a, b) =>
                    a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
                )
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      {state.commute.from && state.commute.to && (
        <div className="commute-result" aria-live="polite">
          <p>
            Today:{" "}
            {baseline.transit === null
              ? "no transit option"
              : formatMinutes(baseline.transit)}
            {!baseline.present ? " (pair absent from the lookup)" : ""}. With
            the plan:{" "}
            {state.route
              ? formatMinutes(state.route.ride + state.overhead)
              : "no rail path in this network"}
            . Driving: {formatMinutes(baseline.driving)}.
          </p>
          {state.route && (
            <p>
              Rail ride {formatMinutes(state.route.ride)} + {state.overhead} min
              wait/access once per trip.
            </p>
          )}
          <p className="network-note">
            Today and driving are worker-weighted means of the supplied rows for
            this pair; transit averages only rows with a transit time (
            {baseline.transitWorkers.toLocaleString("en-US")} of{" "}
            {baseline.workers.toLocaleString("en-US")} workers in the lookup).
            Missing entries do not establish that no real-world route exists.
            Driving is free-flow, without congestion.
          </p>
          <p className="network-note">
            Highlighted links show the shortest rail ride in the full budget
            network, including existing rail, with no change to the model.
            Display geometry is illustrative, not surveyed tracks. Published
            top-pair times are shown as supplied; the picker adds the selected
            overhead once, including for a same-node trip.
          </p>
          <button onClick={() => state.setCommute({ from: "", to: "" })}>
            Clear commute
          </button>
        </div>
      )}
    </section>
  );
}
