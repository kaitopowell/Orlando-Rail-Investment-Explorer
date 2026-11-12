import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseRailData,
  networkAt,
  equityAt,
  coreNetwork,
} from "../src/data/railPlan.ts";
import { schematicPath, project } from "../src/map/schematic.ts";
import {
  displayStations,
  stationName,
  LINE_PALETTE,
} from "../src/data/networkDisplay.ts";
const read = (n) => JSON.parse(readFileSync(`public/data/${n}`));
const p = read("rail_network.json"),
  e = read("rail_equity_v2.json"),
  data = parseRailData(p, e);
assert.equal(p.scenarios.length, 24);
assert.equal(new Set(LINE_PALETTE).size, 12);
for (const s of p.scenarios) {
  const owners = new Map(
    s.lines.flatMap((l) => l.link_ids.map((id) => [id, l])),
  );
  const seen = new Set();
  for (const st of s.steps) {
    const before = new Set(
      networkAt(p, s, st.total_cost_musd - 0.001).links.map((l) => l.id),
    );
    for (const id of st.new_link_ids) {
      assert.ok(!before.has(id));
      assert.ok(owners.has(id));
      assert.ok(!seen.has(id));
      seen.add(id);
    }
  }
  let previous = new Set();
  for (const b of s.by_budget) {
    const n = networkAt(p, s, b.budget_musd);
    assert.deepEqual(
      [n.steps.length, n.links.length, n.spent, n.score],
      [b.routes, b.links, b.spent_musd, b.score],
    );
    for (const id of previous) assert.ok(n.built.has(id));
    for (const l of n.links) {
      assert.equal(n.owner.get(l.id), owners.get(l.id));
      assert.equal(n.owner.get(l.id).color_index, owners.get(l.id).color_index);
    }
    previous = new Set(n.links.map((l) => l.id));
    assert.equal(
      equityAt(data, s, b.budget_musd).record.stations,
      n.stations.length,
    );
  }
}
const s = p.scenarios.find((s) => s.id === "low-oh20-minutes");
assert.equal(s.lines.length, 12);
for (const [b, r, l, spent, score] of [
  [2500, 3, 8, 1650.9, 2207711.4],
  [10000, 15, 39, 9997.2, 5968066.1],
  [30000, 36, 89, 25373.8, 7652671.3],
]) {
  const n = networkAt(p, s, b);
  assert.deepEqual(
    [n.steps.length, n.links.length, n.spent, n.score],
    [r, l, spent, score],
  );
}
for (const id of coreNetwork(p))
  for (const s of p.scenarios.filter((s) => s.measure === "minutes_saved"))
    assert.ok(networkAt(p, s, 10000).built.has(id));
for (const l of p.links) {
  const path = schematicPath(l.coords[0], l.coords[1], l.a, l.b);
  assert.deepEqual(path[0], l.coords[0]);
  assert.deepEqual(path.at(-1), l.coords[1]);
  assert.deepEqual(
    path,
    [...schematicPath(l.coords[1], l.coords[0], l.b, l.a)].reverse(),
  );
  const q = path.map(project);
  for (let i = 1; i < q.length; i++) {
    const dx = Math.abs(q[i][0] - q[i - 1][0]),
      dy = Math.abs(q[i][1] - q[i - 1][1]);
    assert.ok(Math.min(dx, dy) < 1e-12 || Math.abs(dx - dy) < 1e-12);
  }
  if (q.length === 3) {
    const end = l.a < l.b ? 0 : 2;
    const dx = Math.abs(q[end][0] - q[1][0]),
      dy = Math.abs(q[end][1] - q[1][1]);
    assert.ok(Math.min(dx, dy) < 1e-12, "straight run touches smaller id");
  }
}
for (const b of [
  [1, 0],
  [0, 1],
  [1, 1],
  [0, 0],
]) {
  const path = schematicPath([0, 0], b, "a", "b");
  assert.deepEqual(path[0], [0, 0]);
  assert.deepEqual(path.at(-1), b);
}
const n = networkAt(p, s, 10000),
  stations = displayStations(p.nodes, n.links, s);
assert.ok(stations.some((n) => n.kind === "interchange"));
for (const n of stations) {
  if (n.existing_station && n.degree) assert.equal(n.kind, "interchange");
  if (n.kind === "terminus") assert.equal(n.degree, 1);
}
assert.equal(stationName("Downtown (LYNX) (test)"), "Downtown");
for (const mutate of [
  (p) => p.links.push(p.links[0]),
  (p) => p.scenarios[0].lines[0].link_ids.pop(),
  (p) =>
    p.scenarios[0].lines[1].link_ids.push(p.scenarios[0].lines[0].link_ids[0]),
]) {
  const bad = structuredClone(p);
  mutate(bad);
  assert.throws(() => parseRailData(bad, e), /Invalid connected rail network/);
}
console.log(
  "PASS connected network: 24 scenarios, published totals, unique ownership, visible failure on duplicates/missing owners, monotonic budgets/stable names and colors, core intersection, station roles, Mercator octilinearity/exact endpoints/reversal/straight-end rule",
);
