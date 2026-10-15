import type { FeatureCollection, Feature, Polygon } from "geojson";
export type HexProperties = {
  h3: string;
  population: number;
  county: string;
  tract_geoid: string;
  tract_pop_acs: number | null;
};
export type Hex = Feature<Polygon, HexProperties>;
export type HexData = FeatureCollection<Polygon, HexProperties>;
export type HexScale = "sqrt" | "linear" | "log";
export const hexRamp = [
  [8, 29, 72],
  [18, 150, 153],
  [245, 123, 35],
  [255, 231, 80],
] as const;
export const hexRampCss = `linear-gradient(to right, ${hexRamp.map((c) => `rgb(${c.join(",")})`).join(",")})`;
export const transformed = (value: number, scale: HexScale) =>
  scale === "linear"
    ? value
    : scale === "log"
      ? Math.log1p(value)
      : Math.sqrt(value);
export const hexHeight = (
  population: number,
  maximum: number,
  scale: HexScale,
  exaggeration: number,
) =>
  maximum > 0
    ? (2000 * exaggeration * transformed(population, scale)) /
      transformed(maximum, scale)
    : 0;
export function hexColor(
  population: number,
  maximum: number,
): [number, number, number, number] {
  const t =
    maximum > 0
      ? Math.min(1, Math.sqrt(Math.max(0, population) / maximum)) * 3
      : 0;
  const i = Math.min(2, Math.floor(t)),
    fraction = t - i;
  const rgb = hexRamp[i].map((v, c) =>
    Math.round(v + (hexRamp[i + 1][c] - v) * fraction),
  );
  return [rgb[0], rgb[1], rgb[2], 215];
}
export function parseHexagons(value: unknown): HexData {
  const data = value as HexData;
  if (
    data?.type !== "FeatureCollection" ||
    !Array.isArray(data.features) ||
    data.features.length === 0
  )
    throw new Error("Invalid Kontur data");
  for (const f of data.features) {
    const p = f.properties;
    if (
      f.geometry?.type !== "Polygon" ||
      typeof p?.h3 !== "string" ||
      !Number.isFinite(p.population) ||
      p.population < 0 ||
      typeof p.county !== "string" ||
      !/^\d{11}$/.test(p.tract_geoid) ||
      !(
        p.tract_pop_acs === null ||
        (Number.isFinite(p.tract_pop_acs) && p.tract_pop_acs >= 0)
      )
    )
      throw new Error("Invalid Kontur hexagon");
  }
  return data;
}
