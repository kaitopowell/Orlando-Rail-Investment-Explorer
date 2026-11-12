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
export function CompactSunshineCompare({
  state,
  rail,
}: {
  state: SunshineState;
  rail: RailState;
}) {
  const totals = state.data ? sunshineTotals(state.data) : null,
    comparison = comparisonPlan(rail);
  if (state.error)
    return (
      <p role="alert">
        {state.error}{" "}
        <button onClick={state.retry}>Retry Sunshine Corridor</button>
      </p>
    );
  if (!state.data || !totals || !comparison || !rail.network)
    return <p role="status">Loading Sunshine comparison…</p>;
  return (
    <table
      className="compact-compare"
      aria-label="Sunshine and SOL/R comparison"
    >
      <thead>
        <tr>
          <th>Measure</th>
          <th>Sunshine</th>
          <th>SOL/R</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th title="Capital cost range in billions: FDOT full program versus the selected SOL/R built links; scopes differ">
            Cost ($B)
          </th>
          <td title="FDOT full program, including undrawn 3A and 3D">
            {billion(state.data.properties.program_capital_musd.low)}–
            {billion(state.data.properties.program_capital_musd.high)}
          </td>
          <td title="Low/high estimates for the same built links, excluding stations and vehicles">
            {billion(comparison.low)}–{billion(comparison.high)}
          </td>
        </tr>
        <tr>
          <th title="FDOT TCAR route miles for drawn options 3B and 3C; SOL/R straight-line link miles">
            Route miles
          </th>
          <td title="Drawn TCAR mileage, not the entire program">
            {number(totals.tcar)}
          </td>
          <td>{number(rail.network.miles)}</td>
        </tr>
        <tr>
          <th title="Job-minutes saved per weekday relative to today's transit">
            Minutes saved
          </th>
          <td title="Not yet scored">n/a</td>
          <td
            title={
              rail.measure === "minutes_saved"
                ? "Job-minutes per weekday"
                : "Not reported for this selected network"
            }
          >
            {rail.measure === "minutes_saved"
              ? number(rail.network.score)
              : "n/a"}
          </td>
        </tr>
        <tr>
          <th title="Workers newly connected, counted as jobs held">
            Workers connected
          </th>
          <td title="Not yet scored">n/a</td>
          <td
            title={
              rail.measure === "workers_connected"
                ? "Workers (jobs held)"
                : "Not reported for this selected network"
            }
          >
            {rail.measure === "workers_connected"
              ? number(rail.network.score)
              : "n/a"}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
export function SunshineSources({ state }: { state: SunshineState }) {
  return (
    <div>
      <h3>Sunshine comparison notes</h3>
      <ul>
        {SUNSHINE_CAVEATS.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {state.data && (
        <>
          <p>{state.data.properties.source}</p>
          <p>
            Drawn segments: {number(sunshineTotals(state.data).tcar)} TCAR
            miles; {number(sunshineTotals(state.data).traced)} traced miles.
            Program costs include undrawn options; scopes differ from SOL/R.
            Inactive SOL/R objectives and unscored Sunshine measures are n/a,
            never combined.
          </p>
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
        </>
      )}
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
  return (
    <section
      className="candidate-controls sunshine-controls"
      aria-label="FDOT proposal"
    >
      <h3>FDOT proposal</h3>
      <label className="layer">
        <span className="layer-symbol sunshine-symbol">━</span>
        <span className="layer-text">
          <strong>Sunshine Corridor (FDOT proposal)</strong>
          <small>Sunshine Corridor (FDOT proposal, schematic)</small>
        </span>
        <input
          type="checkbox"
          aria-label="Sunshine Corridor (FDOT proposal)"
          checked={state.enabled}
          onChange={(e) => {
            state.setEnabled(e.target.checked);
            rail.setPanelOpen(true);
          }}
        />
      </label>
    </section>
  );
}
