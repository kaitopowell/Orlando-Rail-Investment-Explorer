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

const { parseHexagons, hexHeight, hexColor } =
  await import("../src/data/kontur.ts");
const hexData = parseHexagons(
  JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile("public/data/kontur_h3_four_counties.geojson", "utf8"),
  ),
);
assert.equal(hexData.features.length, 7896);
for (const scale of ["sqrt", "linear", "log"]) {
  assert.equal(hexHeight(0, 6000, scale, 1), 0);
  assert.ok(Math.abs(hexHeight(6000, 6000, scale, 2) - 4000) < 1e-8);
  assert.ok(hexHeight(10, 6000, scale, 1) < hexHeight(100, 6000, scale, 1));
}
assert.ok(Math.abs(hexHeight(1500, 6000, "sqrt", 1) - 1000) < 1e-8);
assert.equal(hexHeight(1500, 6000, "linear", 1), 500);
assert.notDeepEqual(hexColor(1, 6000), hexColor(6000, 6000));
assert.throws(() => parseHexagons({ type: "FeatureCollection", features: [] }));
console.log(
  "PASS Kontur: 7896 supplied hexagons, selectable scales, exaggeration, ramp and validation",
);

const { parseEmployment, jobHeight, jobRadius, topSectors } =
  await import("../src/data/employment.ts");
const employment = parseEmployment(
  JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile("public/data/employment_tracts.geojson", "utf8"),
  ),
);
assert.equal(employment.features.length, 490);
assert.equal(
  employment.features.reduce((sum, f) => sum + f.properties.jobs_total, 0),
  1482556,
);
assert.equal(jobHeight(0, 100, "sqrt", 3), 0);
assert.ok(Math.abs(jobHeight(100, 100, "sqrt", 3) - 12000) < 1e-8);
assert.ok(
  Math.abs(jobRadius(400, 400, 10) ** 2 / jobRadius(100, 400, 10) ** 2 - 4) <
    1e-8,
);
const top = topSectors(employment.features[0].properties);
assert.equal(top.length, 3);
assert.ok(top[0].jobs >= top[1].jobs && top[1].jobs >= top[2].jobs);
console.log(
  "PASS Employment: data contract, height, proportional circle area and sector ranking",
);

const { pillarDefaults, hexCenter, pillarRadius, warmThreshold, pillarColor } =
  await import("../src/data/kontur3d.ts");
assert.deepEqual(pillarDefaults, {
  coverage: 0.35,
  exaggeration: 3,
  scale: "linear",
});
const threshold = warmThreshold(hexData),
  maximum = Math.max(...hexData.features.map((f) => f.properties.population));
const fraction =
  hexData.features.filter((f) => f.properties.population >= threshold).length /
  hexData.features.length;
assert.ok(fraction >= 0.049 && fraction <= 0.051);
assert.equal(
  hexHeight(
    maximum,
    maximum,
    pillarDefaults.scale,
    pillarDefaults.exaggeration,
  ),
  6000,
);
assert.equal(
  hexHeight(85, maximum, pillarDefaults.scale, pillarDefaults.exaggeration),
  85,
);
assert.ok(pillarColor(1, threshold, maximum)[3] < 50);
assert.ok(pillarColor(threshold - 1, threshold, maximum)[0] < 50);
assert.ok(pillarColor(threshold, threshold, maximum)[0] > 240);
assert.deepEqual(pillarColor(maximum, threshold, maximum), [255, 231, 80, 245]);
const radius = pillarRadius(hexData);
assert.ok(Number.isFinite(radius) && radius > 0);
for (const f of hexData.features) {
  const center = hexCenter(f),
    ring = f.geometry.coordinates[0];
  // Independently verify that the maximum-width pillar's vertices stay in the supplied polygon.
  for (let angle = 0; angle < 6; angle++) {
    const x =
      center[0] +
      (radius * Math.cos((angle * Math.PI) / 3)) /
        (111195 * Math.cos((center[1] * Math.PI) / 180));
    const y = center[1] + (radius * Math.sin((angle * Math.PI) / 3)) / 111195;
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
    assert.ok(inside);
  }
}
console.log(
  "PASS 3D pillars: linear peaks, 95th-percentile warm tail, low alpha and footprints inside all supplied hexagons",
);
