import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseSunshine,
  sunshineTotals,
  comparisonPlan,
  SUNSHINE_COLOR,
} from "../src/data/sunshine.ts";
import { parseRailData, networkAt } from "../src/data/railPlan.ts";
const read = (n) => JSON.parse(readFileSync(`public/data/${n}`));
const raw = read("sunshine_corridor.geojson"),
  before = JSON.stringify(raw),
  d = parseSunshine(raw);
assert.equal(
  d.features.filter((f) => f.geometry.type === "LineString").length,
  2,
);
assert.equal(d.features.filter((f) => f.geometry.type === "Point").length, 3);
assert.equal(JSON.stringify(raw), before);
assert.deepEqual(sunshineTotals(d), {
  tcar: 17.2,
  traced: 17,
  low: 2970,
  high: 4140,
});
assert.equal(d.properties.program_capital_musd.low, 3543);
assert.equal(d.properties.program_capital_musd.high, 4787);
assert.deepEqual(SUNSHINE_COLOR, [255, 107, 107]);
for (const f of d.features.filter((f) => f.geometry.type === "Point"))
  assert.equal(f.properties.capital_low_musd, undefined);
const bad = structuredClone(raw);
bad.features[0].properties.capital_low_musd = -1;
assert.throws(() => parseSunshine(bad));
assert.throws(() => parseSunshine({}));
const data = parseRailData(read("rail_network.json"), read("rail_equity_v2.json"));
for (const scenario of data.plan.scenarios) {
  const network = networkAt(data.plan, scenario, 10000);
  const c = comparisonPlan({ data, network, scenario, budget: 10000 });
  assert.equal(
    c.low,
    network.links.reduce((n, l) => n + l.cost_low_musd, 0),
  );
  assert.equal(
    c.high,
    network.links.reduce((n, l) => n + l.cost_high_musd, 0),
  );
  assert.equal(c.equity.record, data.equity.scenarios[scenario.id]["10000"]);
}
console.log(
  "PASS Sunshine: two segments/three stations, immutable source, actual costs/miles, absent station measures, validation and selected-network comparison across 24 scenarios",
);
