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
  assert.ok(Math.abs(hexHeight(6000, 6000, scale, 2) - 8000) < 1e-8);
  assert.ok(hexHeight(10, 6000, scale, 1) < hexHeight(100, 6000, scale, 1));
}
assert.ok(Math.abs(hexHeight(1500, 6000, "sqrt", 1) - 2000) < 1e-8);
assert.equal(hexHeight(1500, 6000, "linear", 1), 1000);
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

const { pillarDefaults, hexCenter } = await import("../src/data/kontur3d.ts");
const { populationRamp, demandHeight, demandRadius, DEMAND_STYLE } = await import("../src/map/demandStyle.ts");
assert.deepEqual(pillarDefaults, {coverage: .35, exaggeration: 3, scale: "sqrt"});
assert.equal(jobHeight, demandHeight);
assert.equal(jobRadius, demandRadius);
const maximum = Math.max(...hexData.features.map(f => f.properties.population));
for (const scale of ["linear", "sqrt", "log"]) {
  assert.equal(hexHeight(maximum, maximum, scale, 3), 12000);
  assert.ok(Math.abs(hexHeight(1, maximum, scale, 3) / hexHeight(1, maximum, scale, 1) - 3) < 1e-12);
  assert.equal(hexHeight(0, maximum, scale, 3), 0);
}
assert.equal(hexHeight(.001, maximum, "linear", 3), DEMAND_STYLE.minimumHeight * 3);
// Population uses the same proportional-circle encoding as Employment.
assert.equal(demandRadius(400, 400, 10) ** 2 / demandRadius(100, 400, 10) ** 2, 4);
assert.ok(demandRadius(100, 400, 8) < demandRadius(100, 400, 12));
// Approximate perceptual lightness in OKLab: sequential, nearly even steps.
function lightness(rgb) {
  const [r,g,b] = rgb.map(v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2104542553 * Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b)
    + .793617785 * Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b)
    - .0040720468 * Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
}
const steps=populationRamp.slice(1).map((c,i)=>lightness(c)-lightness(populationRamp[i]));
assert.ok(steps.every(s=>s>.08 && s<.14));
for(const color of populationRamp) {
  assert.ok(color[1]>color[2] && color[2]>color[0]);
  assert.ok(Math.max(...color)<240);
}
for(const f of hexData.features) {
  const ring=f.geometry.coordinates[0].slice(0,-1), center=hexCenter(f);
  for(let axis=0;axis<2;axis++) assert.ok(Math.abs(center[axis]-ring.reduce((n,p)=>n+p[axis],0)/ring.length)<1e-10);
  assert.equal(typeof f.properties.h3,'string');
}
console.log("PASS Population style: shared Employment scaling, minimum height, proportional circles, sequential teal ramp and unchanged hexagon centers");
