import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseEquity,
  equityBreaks,
  equityColor,
  equityClass,
  equityCounts,
  equityPoint,
  householdRadius,
} from "../src/data/equity.ts";
const data = parseEquity(
  JSON.parse(readFileSync("public/data/equity_tracts.geojson")),
);
for (const measure of ["pct_zero_vehicle", "pct_poverty", "median_income"]) {
  const breaks = equityBreaks(data, measure, "quantiles");
  assert.equal(breaks.length, 4);
  assert.ok(breaks.every((b, i) => !i || b >= breaks[i - 1]));
  const low = equityColor({ [measure]: 0 }, measure, breaks),
    high = equityColor({ [measure]: 300000 }, measure, breaks);
  assert.equal(low[1] < high[1], measure !== "median_income");
  assert.deepEqual(
    equityColor({ [measure]: null }, measure, breaks),
    [115, 120, 122, 96],
  );
  assert.equal(
    equityColor({ [measure]: 0, small_base: true }, measure, breaks)[3],
    45,
  );
  console.log(measure, breaks);
}
assert.throws(() => parseEquity({ ...data, features: data.features.slice(1) }));
console.log(
  "PASS equity quantiles, inverse income, missing and small-base styling",
);

for (const measure of ["pct_zero_vehicle", "pct_poverty", "median_income"]) {
  const fixed = equityBreaks(data, measure);
  assert.deepEqual(
    fixed,
    measure === "median_income"
      ? [40000, 60000, 80000, 100000]
      : [2, 5, 10, 20],
  );
  for (const method of ["fixed", "quantiles"]) {
    const breaks = equityBreaks(data, measure, method),
      counts = equityCounts(data, measure, breaks, method);
    assert.equal(
      counts.classes.reduce((a, b) => a + b, 0) + counts.missing,
      490,
    );
    assert.equal(counts.missing, measure === "median_income" ? 3 : 2);
  }
}
const fixed = [2, 5, 10, 20];
assert.deepEqual(
  [0, 1.999, 2, 4.999, 5, 9.999, 10, 20, 20.001, null].map((v) =>
    equityClass(v, fixed, "fixed"),
  ),
  [0, 0, 1, 1, 2, 2, 3, 3, 4, null],
);
assert.equal(equityClass(5, fixed, "quantiles"), 1);
assert.equal(householdRadius(null, 1000), null);
assert.equal(householdRadius(0, 1000), 0);
assert.equal(
  householdRadius(100, 1000) ** 2 / householdRadius(25, 1000) ** 2,
  4,
);
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
for (const f of data.features) {
  const point = equityPoint(f),
    polygons =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
  assert.ok(
    polygons.some(
      (p) => inRing(point, p[0]) && p.slice(1).every((h) => !inRing(point, h)),
    ),
    f.properties.GEOID,
  );
}
console.log(
  "PASS fixed boundaries, counts including nulls, proportional circle area, and all 490 interior display points",
);
