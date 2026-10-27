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

const { parseHexagons } =
  await import("../src/data/kontur.ts");
const hexData = parseHexagons(
  JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile("public/data/kontur_h3_four_counties.geojson", "utf8"),
  ),
);
assert.equal(hexData.features.length, 7896);
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
const { demandHeight, demandRadius } = await import("../src/map/demandStyle.ts");
const { POPULATION_DISPLAY: style, populationValues, displayQuantile, populationDisplaySettings,
  populationDisplayValue, populationDisplayHeight, populationDisplayRadius, populationDisplayColor } = await import("../src/map/populationDisplay.ts");
assert.deepEqual(pillarDefaults,{coverage:.35,exaggeration:1,scale:'sqrt'});
assert.equal(jobHeight,demandHeight);assert.equal(jobRadius,demandRadius);
const snapshot=JSON.stringify(hexData), values=populationValues(hexData), defaults=populationDisplaySettings(values,50);
assert.ok(Math.abs(defaults.floor-176)<1e-9);assert.equal(defaults.ceiling,1447);
assert.equal(displayQuantile([0,10],.95),9.5);
for(const emphasis of [0,50,100]) for(const scale of ['sqrt','linear','log']) {
  const settings=populationDisplaySettings(values,emphasis);
  const displayed=values.map(v=>populationDisplayValue(v,settings,scale));
  assert.ok(displayed.every((v,i)=>v>=0&&v<=1&&(!i||v>=displayed[i-1])));
  assert.ok(values.filter(v=>v<=settings.floor).every(v=>populationDisplayValue(v,settings,scale)<=style.lowValueFloor+1e-12));
  assert.ok(values.filter(v=>v>=settings.ceiling).every(v=>Math.abs(populationDisplayValue(v,settings,scale)-1)<1e-12));
  assert.equal(populationDisplayValue(0,settings,scale),0);
  for(const t of [0,.002,.25,1]) {
    assert.equal(populationDisplayHeight(t,2),2*populationDisplayHeight(t,1));
    assert.ok(populationDisplayColor(t,style.needleAlpha)[3]<=style.needleAlpha);
  }
}
const low=populationDisplaySettings(values,0), high=populationDisplaySettings(values,100);
for(const v of values) assert.ok(populationDisplayValue(v,high,'sqrt')<=populationDisplayValue(v,low,'sqrt')+1e-12);
assert.ok(populationDisplayHeight(.002,1)<=8);
assert.equal(populationDisplayHeight(1,1),4000);
assert.ok(populationDisplayRadius(1,10)<10);
assert.ok(populationDisplayRadius(.002,10)<1);
assert.ok(populationDisplayRadius(.5,8)<populationDisplayRadius(.5,12));
for(const settings of [populationDisplaySettings([],50),populationDisplaySettings([5,5,5],50)])
  assert.ok(Number.isFinite(populationDisplayValue(5,settings,'sqrt')));
// Every source-over overlap stays bounded by the cyan-green ceiling, including halos.
for(const t of [0,.002,.2,.5,1]) {
  const c=populationDisplayColor(t,style.needleAlpha), a=c[3]/255;
  let rgb=[12,20,28];
  for(let n=0;n<10000;n++) rgb=rgb.map((v,i)=>c[i]*a+v*(1-a));
  assert.ok(rgb[0]<50 && rgb[1]<=243 && rgb[2]<200);
}
for(const f of hexData.features) {
  const ring=f.geometry.coordinates[0].slice(0,-1), center=hexCenter(f);
  for(let axis=0;axis<2;axis++) assert.ok(Math.abs(center[axis]-ring.reduce((n,p)=>n+p[axis],0)/ring.length)<1e-10);
}
assert.equal(JSON.stringify(hexData),snapshot);
console.log('PASS Population contrast: real-data quantiles, monotonic emphasis/scales, faint lows, capped highs, bounded overlap, small circles, original features/centers');
