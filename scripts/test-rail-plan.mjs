import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseRailData,
  networkAt,
  budgetStops,
  equityAt,
  scenarioId,
} from "../src/data/railPlan.ts";
const p = JSON.parse(readFileSync("public/data/rail_plan.json"));
const e = JSON.parse(readFileSync("public/data/rail_equity.json"));
const data = parseRailData(p, e);
assert.equal(p.scenarios.length, 24);
for (const s of p.scenarios) {
  assert.equal(
    s.id,
    scenarioId(s.cost_case, s.overhead_min, s.measure, s.ratio ?? 2),
  );
  const built = new Set();
  for (const step of s.steps) {
    const before = new Set(
      networkAt(p, s, step.total_cost_musd - 0.001).links.map((l) => l.id),
    );
    const after = new Set(
      networkAt(p, s, step.total_cost_musd).links.map((l) => l.id),
    );
    for (const id of step.new_link_ids) {
      assert.ok(p.links.some((l) => l.id === id));
      assert.ok(!before.has(id));
      assert.ok(after.has(id));
      assert.ok(!built.has(id));
      built.add(id);
    }
  }
  for (const b of s.by_budget) {
    const n = networkAt(p, s, b.budget_musd);
    assert.equal(n.links.length, b.links);
    assert.equal(n.steps.length, b.routes);
    assert.equal(n.spent, b.spent_musd);
    assert.equal(n.score, b.score);
    assert.equal(
      equityAt(data, s, b.budget_musd).record.stations,
      n.stations.length,
    );
  }
  for (const budget of budgetStops(p, s)) {
    const snapshot = equityAt(data, s, budget);
    if (snapshot) {
      assert.deepEqual(networkAt(p, s, budget).links.map(l => l.id), networkAt(p, s, snapshot.budget).links.map(l => l.id));
      assert.equal(snapshot.record, e.scenarios[s.id][String(snapshot.budget)]);
    }
  }
  assert.equal(networkAt(p, s, 0).links.length, 0);
  assert.ok(budgetStops(p, s).includes(10000));
}
const broken = structuredClone(p);
broken.scenarios[0].steps[0].new_link_ids[0] = "absent";
assert.throws(() => parseRailData(broken, e));
const s = p.scenarios.find((s) => s.id === "low-oh20-minutes");
const n = networkAt(p, s, 10000);
console.log(
  "PASS all 24 scenarios: links exist, every step boundary before/after, monotonic construction, published budget reconciliation, equity counts, zero budget and missing-reference rejection",
);
console.log(
  JSON.stringify(
    {
      default: {
        links: n.links.length,
        stations: n.stations.length,
        spent: n.spent,
        score: n.score,
        miles: n.miles,
        mean: n.score / p.denominators.workers_with_transit_option,
      },
    },
    null,
    2,
  ),
);
