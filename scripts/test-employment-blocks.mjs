import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseEmploymentBlocks, blockStats, needleHeight} from "../src/data/employmentBlocks.ts";
const data = parseEmploymentBlocks(JSON.parse(readFileSync(new URL('../public/data/employment_blocks.geojson', import.meta.url))));
const stats = blockStats(data);
assert.equal(data.features.length,15574);
assert.equal(data.features.reduce((s,f) => s+f.properties.jobs_total,0),1482556);
assert.ok(stats.maximum > stats.cap);
assert.equal(stats.clipped, data.features.filter(f => f.properties.jobs_total > stats.cap).length);
for (const scale of ['sqrt','linear','log']) {
  assert.equal(needleHeight(stats.maximum,stats.maximum,stats.cap,true,scale,3),12000);
  assert.equal(needleHeight(stats.cap,stats.maximum,stats.cap,true,scale,3),12000);
  assert.ok(needleHeight(1,stats.maximum,stats.cap,true,scale,3) >= 180);
  assert.equal(needleHeight(10,stats.maximum,stats.cap,true,scale,2),2*needleHeight(10,stats.maximum,stats.cap,true,scale,1));
  assert.ok(needleHeight(stats.cap,stats.maximum,stats.cap,false,scale,3) < 12000);
}
const altered = structuredClone(data);
altered.features[0].properties.w_geocode = Number(altered.features[0].properties.w_geocode);
assert.throws(() => parseEmploymentBlocks(altered));
console.log(`PASS employment blocks: real data, IDs, scales, minimum height, exaggeration; ${stats.clipped} clipped at ${stats.cap}, max ${stats.maximum}`);
