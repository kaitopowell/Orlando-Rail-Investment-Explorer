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
  [74, 88, 52],
  [94, 126, 45],
  [133, 171, 43],
  [182, 217, 56],
  [234, 255, 138],
] as const;
export const equityLabels = {
  pct_zero_vehicle: "Households with no vehicle",
  pct_poverty: "People below poverty",
  median_income: "Median household income",
};
export type EquityClassification = "fixed" | "quantiles";
export const equityHeadlines = {
  pct_zero_vehicle: {
    title: "Where do households have no car?",
    meaning: "Brighter = a larger share of households without a car",
    how: "Compare the colors to see where being without a car is more common.",
  },
  pct_poverty: {
    title: "Where do more people live below poverty?",
    meaning: "Brighter = a larger share of people below poverty",
    how: "Compare the colors to see where poverty is more common.",
  },
  median_income: {
    title: "Where are household incomes lower?",
    meaning: "Brighter = lower median household income",
    how: "Read the income ranges in reverse: the brightest tracts have the lowest incomes.",
  },
};
// Type-7 quantiles: linear interpolation at (n - 1) * p, excluding nulls.
export function equityBreaks(
  data: EquityData,
  measure: EquityMeasure,
  method: EquityClassification = "fixed",
) {
  if (method === "fixed")
    return measure === "median_income"
      ? [40000, 60000, 80000, 100000]
      : [2, 5, 10, 20];
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
  method: EquityClassification = "fixed",
): [number, number, number, number] {
  const value = p[measure];
  const index = equityClass(value, breaks, method) ?? 0;
  const c =
    value === null
      ? [115, 120, 122]
      : equityRamp[measure === "median_income" ? 4 - index : index];
  return [c[0], c[1], c[2], p.small_base ? 45 : 96];
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

// Fixed intervals: <b0, [b0,b1), [b1,b2), [b2,b3], >b3.
// Quantile ties retain the existing lower-class convention.
export function equityClass(
  value: number | null,
  breaks: number[],
  method: EquityClassification,
): number | null {
  if (value === null) return null;
  if (method === "quantiles") return breaks.filter((b) => value > b).length;
  return value < breaks[0]
    ? 0
    : value < breaks[1]
      ? 1
      : value < breaks[2]
        ? 2
        : value <= breaks[3]
          ? 3
          : 4;
}
export function equityCounts(
  data: EquityData,
  measure: EquityMeasure,
  breaks: number[],
  method: EquityClassification,
) {
  const classes = [0, 0, 0, 0, 0];
  let missing = 0;
  for (const f of data.features) {
    const index = equityClass(f.properties[measure], breaks, method);
    if (index === null) missing++;
    else classes[index]++;
  }
  return { classes, missing };
}
export function equityClassLabel(
  index: number,
  breaks: number[],
  measure: EquityMeasure,
  method: EquityClassification,
) {
  const format = (n: number) =>
    measure === "median_income"
      ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
      : `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  if (index === 0)
    return `${method === "fixed" ? "Under" : "≤"} ${format(breaks[0])}`;
  if (index === 4) return `Over ${format(breaks[3])}`;
  return method === "fixed"
    ? `${format(breaks[index - 1])} to ${index < 3 ? "< " : ""}${format(breaks[index])}`
    : `> ${format(breaks[index - 1])} to ≤ ${format(breaks[index])}`;
}
export const householdRadius = (
  count: number | null,
  maximum: number,
): number | null =>
  count === null ? null : maximum > 0 ? 26 * Math.sqrt(count / maximum) : 0;
// Interior display point from a horizontal scanline through each polygon's
// bounding-box midpoint. Even/odd ring crossings exclude holes; choose the
// widest interior interval across MultiPolygon parts. Never a population center.
export function equityPoint(feature: EquityTract): [number, number] {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  let point: [number, number] | null = null,
    widest = -1;
  for (const polygon of polygons) {
    const ys = polygon[0].map((p) => p[1]),
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    const xs: number[] = [];
    for (const ring of polygon)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        if (a[1] > y !== b[1] > y)
          xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2)
      if (xs[i + 1] - xs[i] > widest) {
        widest = xs[i + 1] - xs[i];
        point = [(xs[i] + xs[i + 1]) / 2, y];
      }
  }
  if (!point || widest <= 0)
    throw new Error("No interior Equity display point");
  return point;
}
