import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parsePopulation,
  columnData,
  tractCentroid,
  elevationForDensity,
} from "../src/data/population.ts";
const data = parsePopulation(
  JSON.parse(
    readFileSync(
      new URL("../public/data/population_tracts.geojson", import.meta.url),
    ),
  ),
);
const columns = columnData(data);
assert.equal(data.features.length, 490);
assert.equal(columns.length, 489);
assert.equal(
  columns.some((c) => c.tract.properties.pop_est === 0),
  false,
);
assert.equal(
  data.features.some((f) => f.properties.GEOID === "12095990000"),
  true,
);
assert.equal(elevationForDensity(0), 0);
assert.equal(elevationForDensity(null), 0);
assert.equal(elevationForDensity(100), 200);
assert.equal(elevationForDensity(400), 400);
assert.deepEqual(
  tractCentroid({
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
    ],
  }),
  [2, 2],
);
assert.deepEqual(
  tractCentroid({
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
      [
        [
          [4, 0],
          [6, 0],
          [6, 2],
          [4, 2],
          [4, 0],
        ],
      ],
    ],
  }),
  [3, 1],
);
const hole = tractCentroid({
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ],
    [
      [0, 0],
      [0, 2],
      [2, 2],
      [2, 0],
      [0, 0],
    ],
  ],
});
assert.ok(Math.abs(hole[0] - 7 / 3) < 1e-12);
assert.ok(Math.abs(hole[1] - 7 / 3) < 1e-12);
assert.ok(columns.every((c) => c.position.every(Number.isFinite)));
const invalid = structuredClone(data);
invalid.features[0].properties.pop_moe = -1;
assert.throws(() => parsePopulation(invalid));
console.log(
  "PASS: centroid weighting/holes, square-root scale, real-data validation, 489 columns with zero tract retained for inspection.",
);

const { columnRadiusPixels, densityFillAlpha } =
  await import("../src/map/populationVisuals.ts");
assert.equal(columnRadiusPixels(7), 2.5);
assert.ok(columnRadiusPixels(12) > columnRadiusPixels(8));
assert.equal(columnRadiusPixels(20), 8);
assert.equal(densityFillAlpha(null, 400), 0);
assert.equal(densityFillAlpha(0, 400), 8);
assert.equal(densityFillAlpha(100, 400), 20);
assert.equal(densityFillAlpha(400, 400), 32);
console.log(
  "PASS: minimum/zoom-scaled radius and square-root tint, with missing density unshaded.",
);

const { tractColor, tractHeight, tractRamp } =
  await import("../src/map/populationVisuals.ts");
assert.equal(tractHeight(null), 0);
assert.equal(tractHeight(0), 0);
assert.equal(tractHeight(1), 80);
assert.equal(tractHeight(100), 800);
assert.equal(tractHeight(400) / tractHeight(100), 2);
assert.deepEqual(tractColor(0, 400).slice(0, 3), [...tractRamp[0]]);
assert.deepEqual(tractColor(100, 400).slice(0, 3), [...tractRamp[1]]);
assert.deepEqual(tractColor(400, 400).slice(0, 3), [...tractRamp[2]]);
assert.equal(tractColor(400, 400)[3], 190);
console.log(
  "PASS: 3D tract square-root height, 4x exaggeration, missing/zero suppression and shared density ramp.",
);
