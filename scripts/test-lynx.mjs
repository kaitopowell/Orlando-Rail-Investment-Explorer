import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLynx,busSelection,meets,headway} from '../src/data/lynx.ts';
import {busColors,busRadii,TRANSIT_STYLE,TRANSIT_ALPHA_BLEND,transitRadiusScale} from '../src/map/transitStyle.ts';
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
// Sequential colors must increase in perceptual luminance without reaching white.
const luminance = color => {
  const rgb=color.slice(0,3).map(v => v/255 <= .04045 ? v/255/12.92 : ((v/255+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
assert.ok(luminance(busColors[30]) < luminance(busColors[20]));
assert.ok(luminance(busColors[20]) < luminance(busColors[15]));
assert.equal(TRANSIT_ALPHA_BLEND.blendColorDstFactor,'one-minus-src-alpha');
assert.ok(TRANSIT_STYLE.bus.defaultOpacity < .8);
assert.ok(TRANSIT_STYLE.bus.glowAlpha < 32);
assert.ok(transitRadiusScale(8) < transitRadiusScale(11));
assert.ok(transitRadiusScale(11) < transitRadiusScale(13));
assert.equal(transitRadiusScale(22),TRANSIT_STYLE.zoom.maximum);
for(const color of Object.values(busColors)) {
  assert.ok(Math.max(...color.slice(0,3)) < 235);
  assert.ok(color[3] < 200);
  let pixel=[12,20,28];
  // Stress many source-over overlaps: RGB remains bounded by the palette.
  for(let i=0;i<1000;i++) pixel=pixel.map((v,c)=>color[c]*color[3]/255+v*(1-color[3]/255));
  assert.ok(pixel.every(v=>v<235));
}
assert.ok(busRadii[15]>busRadii[20] && busRadii[20]>busRadii[30] && busRadii[30]>busRadii.infrequent);
const bad=structuredClone(data);bad.features[0].properties.stop_id=123;
assert.throws(()=>parseLynx(bad));
console.log('PASS LYNX real-data filtering: all thresholds, LYMMO modes, infrequent toggles, nulls, tier counts and styles');
