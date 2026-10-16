import type {
  FeatureCollection,
  Feature,
  Polygon,
  MultiPolygon,
} from "geojson";
export const employmentSource =
  "Census LODES 8.4 (2023), jobs by workplace location.";
export const sectorNames = [
  "Agriculture, Forestry, Fishing and Hunting",
  "Mining, Quarrying, and Oil and Gas Extraction",
  "Utilities",
  "Construction",
  "Manufacturing",
  "Wholesale Trade",
  "Retail Trade",
  "Transportation and Warehousing",
  "Information",
  "Finance and Insurance",
  "Real Estate and Rental and Leasing",
  "Professional, Scientific, and Technical Services",
  "Management of Companies and Enterprises",
  "Administrative and Support and Waste Management and Remediation Services",
  "Educational Services",
  "Health Care and Social Assistance",
  "Arts, Entertainment, and Recreation",
  "Accommodation and Food Services",
  "Other Services (except Public Administration)",
  "Public Administration",
];
export type JobProperties = {
  GEOID: string;
  name: string;
  jobs_total: number;
  jobs_per_km2: number | null;
  point: [number, number];
} & { [key: `CNS${string}`]: number };
export type JobTract = Feature<Polygon | MultiPolygon, JobProperties>;
export type JobData = FeatureCollection<Polygon | MultiPolygon, JobProperties>;
export type JobScale = "sqrt" | "linear" | "log";
export type JobMeasure = "jobs_total" | "jobs_per_km2";
export const jobRamp = [
  [55, 35, 125],
  [115, 65, 225],
  [200, 40, 220],
  [255, 65, 160],
  [255, 240, 253],
] as const;
export const jobRampCss = `linear-gradient(to right,${jobRamp.map((c) => `rgb(${c.join(",")})`).join(",")})`;
const transform = (v: number, s: JobScale) =>
  s === "linear" ? v : s === "log" ? Math.log1p(v) : Math.sqrt(v);
export const jobHeight = (
  value: number,
  max: number,
  scale: JobScale,
  exag: number,
) =>
  max > 0 ? (4000 * exag * transform(value, scale)) / transform(max, scale) : 0;
export const jobRadius = (jobs: number, max: number, zoom: number) =>
  max > 0
    ? 30 *
      Math.sqrt(jobs / max) *
      Math.max(0.7, Math.min(1.6, 1 + (zoom - 10) * 0.12))
    : 0;
export function jobColor(
  value: number,
  max: number,
): [number, number, number, number] {
  const t = max > 0 ? Math.min(1, Math.sqrt(Math.max(0, value) / max)) * 4 : 0;
  const i = Math.min(3, Math.floor(t)),
    f = t - i;
  const c = jobRamp[i].map((v, j) =>
    Math.round(v + (jobRamp[i + 1][j] - v) * f),
  );
  return [c[0], c[1], c[2], 230];
}
export const topSectors = (p: { [key: `CNS${string}`]: number }) =>
  sectorNames
    .map((name, i) => ({
      name,
      code: `CNS${String(i + 1).padStart(2, "0")}`,
      jobs: p[`CNS${String(i + 1).padStart(2, "0")}`],
    }))
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 3);
export function parseEmployment(value: unknown): JobData {
  const d = value as JobData;
  if (
    d?.type !== "FeatureCollection" ||
    !Array.isArray(d.features) ||
    !d.features.length
  )
    throw new Error("Invalid employment data");
  for (const f of d.features) {
    const p = f.properties;
    if (
      !/^\d{11}$/.test(p?.GEOID) ||
      typeof p.GEOID !== "string" ||
      typeof p.name !== "string" ||
      !Number.isFinite(p.jobs_total) ||
      p.jobs_total < 0 ||
      !(
        p.jobs_per_km2 === null ||
        (Number.isFinite(p.jobs_per_km2) && p.jobs_per_km2 >= 0)
      ) ||
      p.point?.length !== 2 ||
      !p.point.every(Number.isFinite) ||
      !["Polygon", "MultiPolygon"].includes(f.geometry?.type) ||
      sectorNames.some(
        (_, i) => !Number.isFinite(p[`CNS${String(i + 1).padStart(2, "0")}`]),
      )
    )
      throw new Error("Invalid employment tract");
  }
  return d;
}
