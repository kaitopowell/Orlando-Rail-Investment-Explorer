import type { HexData, HexScale } from "../data/kontur";
// Display-only contrast settings. Quantiles are computed from the supplied values;
// no feature, population value, identifier or inspection field is rewritten.
export const POPULATION_DISPLAY = {
  emphasisDefault: 50,
  floorPercentileLow: .40, floorPercentileHigh: .80, ceilingPercentile: .95,
  gammaLow: 1.6, gammaHigh: 4, lowValueFloor: .002,
  height: 4000, minimumHeight: 8, exaggeration: 1,
  needleRadius: .8, needleAlpha: 235, needleOpacity: .85,
  circleRadius: 8, circleMinimumRadius: .5, circleAlpha: 185,
  glowPercentile: .90, glowAlpha: 32, glowWidth: 2.2, circleGlowWidth: 1.45,
  ramp: [[2,18,17], [5,52,46], [10,103,86], [20,169,139], [45,242,197]],
} as const;
export const populationRampCss = `linear-gradient(to right, ${POPULATION_DISPLAY.ramp.map(c=>`rgb(${c.join(",")})`).join(",")})`;
export function populationValues(data: HexData) {
  return data.features.map(f=>f.properties.population).sort((a,b)=>a-b);
}
export function displayQuantile(sorted: readonly number[], p: number) {
  if (!sorted.length) return 0;
  const index=(sorted.length-1)*p, low=Math.floor(index);
  return sorted[low]+(sorted[Math.ceil(index)]-sorted[low])*(index-low);
}
export function populationDisplaySettings(sorted: readonly number[], emphasis: number) {
  const e=Math.max(0,Math.min(1,emphasis/100)), c=POPULATION_DISPLAY;
  const floorPercentile=c.floorPercentileLow+(c.floorPercentileHigh-c.floorPercentileLow)*e;
  return {floorPercentile, floor:displayQuantile(sorted,floorPercentile),
    ceiling:displayQuantile(sorted,c.ceilingPercentile), glowFloor:displayQuantile(sorted,c.glowPercentile),
    gamma:c.gammaLow+(c.gammaHigh-c.gammaLow)*e};
}
export type PopulationDisplaySettings = ReturnType<typeof populationDisplaySettings>;
export function populationDisplayValue(value: number, settings: PopulationDisplaySettings, scale: HexScale) {
  if(value<=0) return 0;
  const {floor,ceiling,gamma}=settings, low=POPULATION_DISPLAY.lowValueFloor;
  if(value<=floor) return low*value/Math.max(1,floor);
  if(ceiling<=floor) return 1;
  const normalized=Math.min(1,(value-floor)/(ceiling-floor));
  const scaled=scale==='sqrt'?Math.sqrt(normalized):scale==='log'?Math.log1p(9*normalized)/Math.log(10):normalized;
  return low+(1-low)*Math.pow(scaled,gamma);
}
export const populationDisplayHeight = (t: number, exaggeration: number) =>
  t>0 ? Math.max(POPULATION_DISPLAY.minimumHeight, POPULATION_DISPLAY.height*t)*exaggeration : 0;
export const populationDisplayRadius = (t: number, zoom: number) =>
  (POPULATION_DISPLAY.circleMinimumRadius+POPULATION_DISPLAY.circleRadius*Math.pow(t,.65))*Math.max(.65,Math.min(1.35,1+(zoom-10)*.1));
export function populationDisplayColor(t: number, alpha: number): [number,number,number,number] {
  const ramp=POPULATION_DISPLAY.ramp, x=Math.max(0,Math.min(1,t))*(ramp.length-1), i=Math.min(ramp.length-2,Math.floor(x));
  const rgb=ramp[i].map((v,c)=>Math.round(v+(ramp[i+1][c]-v)*(x-i)));
  return [rgb[0],rgb[1],rgb[2],Math.round(2+(alpha-2)*Math.pow(t,1.2))];
}
