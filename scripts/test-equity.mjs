import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEquity, equityBreaks, equityColor } from "../src/data/equity.ts";
const data = parseEquity(
  JSON.parse(readFileSync("public/data/equity_tracts.geojson")),
);
for (const measure of ["pct_zero_vehicle", "pct_poverty", "median_income"]) {
  const breaks = equityBreaks(data, measure);
  assert.equal(breaks.length, 4);
  assert.ok(breaks.every((b, i) => !i || b >= breaks[i - 1]));
  const low = equityColor({ [measure]: 0 }, measure, breaks),
    high = equityColor({ [measure]: 300000 }, measure, breaks);
  assert.equal(low[1] < high[1], measure !== "median_income");
  assert.deepEqual(
    equityColor({ [measure]: null }, measure, breaks),
    [115, 120, 122, 135],
  );
  assert.equal(
    equityColor({ [measure]: 0, small_base: true }, measure, breaks)[3],
    65,
  );
  console.log(measure, breaks);
}
assert.throws(() => parseEquity({ ...data, features: data.features.slice(1) }));
console.log(
  "PASS equity quantiles, inverse income, missing and small-base styling",
);
