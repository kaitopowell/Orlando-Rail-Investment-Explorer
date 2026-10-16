import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLynx,busSelection,meets,headway,busColors,busRadii} from '../src/data/lynx.ts';
const original=JSON.parse(readFileSync(new URL('../data/processed/lynx_stops_peak_headway.geojson',import.meta.url)));
const data=parseLynx(JSON.parse(readFileSync(new URL('../public/data/lynx_stops.geojson',import.meta.url))));
assert.equal(data.features.length,original.features.length);
for(const include of [false,true]) for(const threshold of [15,20,30]) for(const show of [false,true]) {
  const result=busSelection(data,threshold,include,show);
  const expected=data.features.filter(f=>headway(f.properties,include)!==null && (show || headway(f.properties,include)<=threshold));
  assert.deepEqual(result.stops,expected);
  assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),expected.length);
  for(const f of data.features) assert.equal(meets(f.properties,threshold,include),headway(f.properties,include)!==null && headway(f.properties,include)<=threshold);
}
assert.deepEqual(busColors[15].slice(0,3),[232,251,255]);
assert.deepEqual(busColors[20].slice(0,3),[88,214,255]);
assert.deepEqual(busColors[30].slice(0,3),[45,140,255]);
assert.ok(busRadii[15]>busRadii[20] && busRadii[20]>busRadii[30] && busRadii[30]>busRadii.infrequent);
const bad=structuredClone(data);bad.features[0].properties.stop_id=123;
assert.throws(()=>parseLynx(bad));
console.log('PASS LYNX real-data filtering: all thresholds, LYMMO modes, infrequent toggles, nulls, tier counts and styles');
