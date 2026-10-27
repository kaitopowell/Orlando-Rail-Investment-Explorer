// Shared display encodings; these never modify the source features or values.
export type DemandScale = "sqrt" | "linear" | "log";
export const DEMAND_STYLE = {
  height: 4000, minimumHeight: 60, needleRadius: 1.2, needleSides: 6,
  opacity: 0.65, circleRadius: 30, circleAlpha: 95,
} as const;
export const demandTransform = (v: number, s: DemandScale) =>
  s === "linear" ? v : s === "log" ? Math.log1p(v) : Math.sqrt(v);
export const demandHeight = (value: number, maximum: number, scale: DemandScale, exaggeration: number) =>
  maximum > 0 ? DEMAND_STYLE.height * exaggeration * demandTransform(value, scale) / demandTransform(maximum, scale) : 0;
export const demandRadius = (value: number, maximum: number, zoom: number) =>
  maximum > 0 ? DEMAND_STYLE.circleRadius * Math.sqrt(value / maximum) * Math.max(0.7, Math.min(1.6, 1 + (zoom - 10) * 0.12)) : 0;
export const demandAlphaBlend = {
  blend: true, blendColorOperation: "add", blendColorSrcFactor: "src-alpha",
  blendColorDstFactor: "one-minus-src-alpha", blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one-minus-src-alpha", depthWriteEnabled: false, depthCompare: "always",
} as const;
export const populationRamp = [
  [10, 64, 58], [17, 99, 89], [28, 137, 121], [49, 177, 156], [84, 218, 192],
] as const;
export const populationRampCss = `linear-gradient(to right, ${populationRamp.map(c => `rgb(${c.join(",")})`).join(",")})`;
export function populationColor(value: number, maximum: number): [number, number, number, number] {
  const t = maximum > 0 ? Math.min(1, Math.sqrt(Math.max(0, value) / maximum)) * (populationRamp.length - 1) : 0;
  const i = Math.min(populationRamp.length - 2, Math.floor(t)), f = t - i;
  const rgb = populationRamp[i].map((v, c) => Math.round(v + (populationRamp[i + 1][c] - v) * f));
  return [rgb[0], rgb[1], rgb[2], 230];
}
