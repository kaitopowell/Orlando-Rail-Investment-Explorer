import { DEMAND_STYLE } from "../map/demandStyle.ts";
import type { Feature, FeatureCollection, Point } from "geojson";
import { jobHeight, type JobScale } from "./employment.ts";
export const blockSource = "Census LODES 8.4 (2023), jobs by workplace location; block-level values include privacy noise";
export type BlockProperties = {
  w_geocode: string;
  tract_geoid: string;
  county: string;
  jobs_total: number;
} & { [key: `CNS${string}`]: number };
export type JobBlock = Feature<Point, BlockProperties>;
export type BlockData = FeatureCollection<Point, BlockProperties>;
export function parseEmploymentBlocks(value: unknown): BlockData {
  const d = value as BlockData;
  if (d?.type !== "FeatureCollection" || !Array.isArray(d.features) || !d.features.length)
    throw new Error("Invalid employment blocks");
  const seen = new Set<string>();
  for (const f of d.features) {
    const p = f.properties;
    if (typeof p?.w_geocode !== "string" || !/^\d{15}$/.test(p.w_geocode) ||
        seen.has(p.w_geocode) || typeof p.tract_geoid !== "string" || !/^\d{11}$/.test(p.tract_geoid) ||
        typeof p.county !== "string" || !p.county ||
        f.geometry?.type !== "Point" || f.geometry.coordinates.length !== 2 ||
        !f.geometry.coordinates.every(Number.isFinite) ||
        !Number.isSafeInteger(p.jobs_total) || p.jobs_total < 0 ||
        Array.from({length: 20}, (_, i) => p[`CNS${String(i + 1).padStart(2, "0")}`])
          .some(v => !Number.isSafeInteger(v) || v < 0))
      throw new Error("Invalid employment block");
    seen.add(p.w_geocode);
  }
  return d;
}
export function blockStats(data: BlockData) {
  const values = data.features.map(f => f.properties.jobs_total).sort((a,b) => a-b);
  const index = (values.length - 1) * .99;
  const low = Math.floor(index);
  const cap = values[low] + (values[Math.ceil(index)] - values[low]) * (index - low);
  return { cap, maximum: values.at(-1) ?? 0, clipped: values.filter(v => v > cap).length };
}
export function needleHeight(value: number, maximum: number, cap: number, clip: boolean, scale: JobScale, exag: number) {
  const limit = clip ? cap : maximum;
  // A display floor keeps small workplace counts visible; values are never changed.
  return Math.max(DEMAND_STYLE.minimumHeight * exag, jobHeight(Math.min(value, limit), limit, scale, exag));
}
