import type { SunshineState } from "./useSunshine";
import type { RailState } from "./useRailPlan";
import {
  comparisonPlan,
  sunshineTotals,
  SUNSHINE_CAVEATS,
  type SunshineItem,
} from "../data/sunshine";
const number = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const billion = (n: number) =>
  (n / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
export function SunshineDetails({ item }: { item: SunshineItem }) {
  const p = item.properties;
  return (
    <div className="sunshine-details">
      <strong>{p.name}</strong>
      <dl>
        <dt>Capital cost</dt>
        <dd>
          {p.capital_low_musd === undefined || p.capital_high_musd === undefined
            ? "Not supplied for this station"
            : `$${number(p.capital_low_musd)}–${number(p.capital_high_musd)}M`}
        </dd>
        <dt>TCAR length</dt>
        <dd>
          {p.tcar_length_mi === undefined
            ? "Not supplied for this station"
            : `${number(p.tcar_length_mi)} mi`}
        </dd>
        <dt>Traced length</dt>
        <dd>
          {p.traced_length_mi === undefined
            ? "Not supplied for this station"
            : `${number(p.traced_length_mi)} mi`}
        </dd>
      </dl>
      <p>{p.geometry_basis}</p>
      {p.note && <p>{p.note}</p>}
    </div>
  );
}
export default function SunshineControls({
  state,
  rail,
}: {
  state: SunshineState;
  rail: RailState;
}) {
  const totals = state.data ? sunshineTotals(state.data) : null,
    comparison = comparisonPlan(rail);
  return (
    <section
      className="candidate-controls sunshine-controls"
      aria-label="FDOT proposal"
    >
      <h3>FDOT proposal</h3>
      <label className="layer">
        <span className="layer-symbol sunshine-symbol" aria-hidden="true">
          ━
        </span>
        <span className="layer-text">
          <strong>Sunshine Corridor (FDOT proposal)</strong>
          <small>Proposed rail · schematic</small>
        </span>
        <input
          type="checkbox"
          aria-label="Sunshine Corridor (FDOT proposal)"
          checked={state.enabled}
          onChange={(e) => state.setEnabled(e.target.checked)}
        />
      </label>
      {state.enabled && (
        <div className="candidate-details">
          <p className="sunshine-legend">
            <span aria-hidden="true">━</span> Sunshine Corridor (FDOT proposal,
            schematic)
          </p>
          {state.error ? (
            <p role="alert">
              {state.error}{" "}
              <button onClick={state.retry}>Retry Sunshine Corridor</button>
            </p>
          ) : !state.data ? (
            <p role="status">Loading Sunshine Corridor…</p>
          ) : (
            <>
              <label>
                Inspect Sunshine Corridor
                <select
                  aria-label="Inspect Sunshine Corridor"
                  value={state.selected?.properties.id ?? ""}
                  onChange={(e) =>
                    state.select(
                      state.data!.features.find(
                        (f) => f.properties.id === e.target.value,
                      ) ?? null,
                    )
                  }
                >
                  <option value="">Choose a segment or station</option>
                  {state.data.features.map((f) => (
                    <option key={f.properties.id} value={f.properties.id}>
                      {f.properties.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="sunshine-source">{state.data.properties.source}</p>
              <h3>Compare</h3>
              {rail.error ? (
                <p role="alert">
                  SOL/R comparison unavailable: {rail.error}{" "}
                  <button onClick={rail.retry}>Retry SOL/R comparison</button>
                </p>
              ) : !comparison || !rail.scenario || !rail.network ? (
                <p role="status">Loading selected SOL/R plan…</p>
              ) : (
                <>
                  <p>
                    Selected SOL/R plan: ${number(rail.budget / 1000)}B budget ·{" "}
                    {rail.cost} costs · {rail.overhead} min wait/access ·{" "}
                    {rail.measure === "minutes_saved"
                      ? "minutes saved"
                      : `workers connected, ratio ${rail.ratio}`}
                    .
                  </p>
                  {!rail.enabled && (
                    <button onClick={() => rail.setEnabled(true)}>
                      Show SOL/R plan and controls
                    </button>
                  )}
                  <div className="sunshine-table">
                    <table aria-label="Sunshine and SOL/R comparison">
                      <thead>
                        <tr>
                          <th>Measure</th>
                          <th>Sunshine Corridor (as published)</th>
                          <th>Selected SOL/R plan</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th>Capital cost ($B range)</th>
                          <td>
                            $
                            {billion(
                              state.data.properties.program_capital_musd.low,
                            )}
                            –
                            {billion(
                              state.data.properties.program_capital_musd.high,
                            )}{" "}
                            program total
                            <br />
                            <small>
                              Drawn 3B + 3C: ${billion(totals!.low)}–
                              {billion(totals!.high)}
                            </small>
                          </td>
                          <td>
                            ${billion(comparison.low)}–
                            {billion(comparison.high)}
                            <br />
                            <small>
                              Same built links; selected-case spend $
                              {billion(rail.network.spent)}B
                            </small>
                          </td>
                        </tr>
                        <tr>
                          <th>Route miles</th>
                          <td>
                            {number(totals!.tcar)} TCAR /{" "}
                            {number(totals!.traced)} traced
                            <br />
                            <small>
                              Drawn 3B + 3C only; not the full program
                            </small>
                          </td>
                          <td>
                            {number(rail.network.miles)} straight-line miles
                          </td>
                        </tr>
                        <tr>
                          <th>Minutes saved vs today’s transit</th>
                          <td>not yet scored</td>
                          <td>
                            {rail.measure === "minutes_saved"
                              ? `${number(rail.network.score)} job-minutes per weekday`
                              : "Not reported for this selected plan"}
                          </td>
                        </tr>
                        <tr>
                          <th>Workers newly connected</th>
                          <td>not yet scored</td>
                          <td>
                            {rail.measure === "workers_connected"
                              ? `${number(rail.network.score)} workers (jobs held)`
                              : "Not reported for this selected plan"}
                          </td>
                        </tr>
                        <tr>
                          <th>Equity metrics</th>
                          <td>not yet scored</td>
                          <td>
                            {comparison.equity ? (
                              <>
                                {comparison.equity.budget !== rail.budget && (
                                  <p>
                                    Published $
                                    {number(comparison.equity.budget / 1000)}B
                                    snapshot, identical built links.
                                  </p>
                                )}
                                {(["0.8", "2.0"] as const).map((r) => {
                                  const v = comparison.equity!.record[r];
                                  return (
                                    <p key={r}>
                                      <strong>{r} km</strong>
                                      <br />
                                      Households{" "}
                                      {(v.share_of_households * 100).toFixed(1)}
                                      %<br />
                                      No-vehicle households{" "}
                                      {(
                                        v.share_of_no_vehicle_households * 100
                                      ).toFixed(1)}
                                      %<br />
                                      People in poverty{" "}
                                      {(
                                        v.share_of_people_in_poverty * 100
                                      ).toFixed(1)}
                                      %<br />
                                      Median income{" "}
                                      {v.median_income_covered === null
                                        ? "unavailable"
                                        : `$${number(v.median_income_covered)}`}{" "}
                                      / region $
                                      {number(
                                        rail.data!.equity.region.median_income,
                                      )}
                                    </p>
                                  );
                                })}
                              </>
                            ) : (
                              "Unavailable at this build step"
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p>
                    Only the active objective is scored for this selected
                    network. Switching objectives selects a different plan; the
                    two benefits are never added. Equity remains separate.
                  </p>
                </>
              )}
            </>
          )}
          <div className="sunshine-caveats">
            <h4>Comparison caveats</h4>
            <ul>
              {SUNSHINE_CAVEATS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
