import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
} from "geojson";
export type EquityMeasure =
  "pct_zero_vehicle" | "pct_poverty" | "median_income";
export type EquityProperties = {
  GEOID: string;
  name: string;
  households: number | null;
  hh_no_vehicle: number | null;
  B08201_002M: number | null;
  pct_zero_vehicle: number | null;
  pct_poverty: number | null;
  median_income: number | null;
  median_income_moe: number | null;
  small_base: boolean | null;
};
export type EquityTract = Feature<Polygon | MultiPolygon, EquityProperties>;
export type EquityData = FeatureCollection<
  Polygon | MultiPolygon,
  EquityProperties
>;
export const equityRamp = [
  [5, 35, 20],
  [25, 75, 25],
  [65, 120, 25],
  [125, 185, 20],
  [195, 255, 40],
] as const;
export const equityLabels = {
  pct_zero_vehicle: "Households with no vehicle",
  pct_poverty: "People below poverty",
  median_income: "Median household income",
};
// Type-7 quantiles: linear interpolation at (n - 1) * p, excluding nulls.
export function equityBreaks(data: EquityData, measure: EquityMeasure) {
  const values = data.features
    .map((f) => f.properties[measure])
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((p) => {
    const pos = (values.length - 1) * p,
      i = Math.floor(pos);
    return values[i] + (values[Math.ceil(pos)] - values[i]) * (pos - i);
  });
}
export function equityColor(
  p: EquityProperties,
  measure: EquityMeasure,
  breaks: number[],
): [number, number, number, number] {
  const value = p[measure];
  const index = value === null ? 0 : breaks.filter((b) => value > b).length;
  const c =
    value === null
      ? [115, 120, 122]
      : equityRamp[measure === "median_income" ? 4 - index : index];
  return [c[0], c[1], c[2], p.small_base ? 65 : 135];
}
export function parseEquity(value: unknown): EquityData {
  const d = value as EquityData;
  if (
    d?.type !== "FeatureCollection" ||
    !Array.isArray(d.features) ||
    d.features.length !== 490
  )
    throw new Error("Invalid equity data");
  const ids = new Set<string>();
  for (const f of d.features) {
    const p = f.properties;
    if (
      typeof p?.GEOID !== "string" ||
      !/^\d{11}$/.test(p.GEOID) ||
      ids.has(p.GEOID) ||
      typeof p.name !== "string" ||
      !["Polygon", "MultiPolygon"].includes(f.geometry?.type) ||
      ![
        "households",
        "hh_no_vehicle",
        "B08201_002M",
        "pct_zero_vehicle",
        "pct_poverty",
        "median_income",
        "median_income_moe",
      ].every((k) => {
        const v = p[k as keyof EquityProperties];
        return (
          v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0)
        );
      }) ||
      !(p.small_base === null || typeof p.small_base === "boolean")
    )
      throw new Error("Invalid equity tract");
    ids.add(p.GEOID);
  }
  return d;
}
