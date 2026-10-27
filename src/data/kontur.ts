import { demandHeight, DEMAND_STYLE, populationColor, populationRamp, populationRampCss } from "../map/demandStyle.ts";
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
export const hexRamp = populationRamp;
export const hexRampCss = populationRampCss;
export const hexHeight = (population: number, maximum: number, scale: HexScale, exaggeration: number) =>
  population > 0 ? Math.max(DEMAND_STYLE.minimumHeight * exaggeration, demandHeight(population, maximum, scale, exaggeration)) : 0;
export const hexColor = populationColor;
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
