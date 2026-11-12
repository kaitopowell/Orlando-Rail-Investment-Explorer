import type { Feature, FeatureCollection, Point, LineString } from "geojson";
import {
  equityAt,
  type RailData,
  type RailScenario,
  type networkAt,
} from "./railPlan.ts";
export type SunshineProperties = {
  id: string;
  name: string;
  source: string;
  geometry_basis: string;
  note: string;
  capital_low_musd?: number;
  capital_high_musd?: number;
  tcar_length_mi?: number;
  traced_length_mi?: number;
};
export type SunshineItem = Feature<Point | LineString, SunshineProperties>;
export type SunshineData = FeatureCollection<
  Point | LineString,
  SunshineProperties
> & {
  properties: {
    title: string;
    source: string;
    program_capital_musd: { low: number; high: number; note: string };
    not_drawn: string[];
  };
};
export const SUNSHINE_COLOR: [number, number, number] = [255, 107, 107];
export const SUNSHINE_CAVEATS = [
  "The alignment is traced from FDOT's published study-area figure and is schematic, not survey data.",
  "Costs are FDOT preliminary concept-level estimates including right of way and trainsets, and are not directly comparable to SOL/R per-mile costs, which exclude stations and vehicles.",
  "Option 3A (SunRail to MCO, about $400M) and Option 3D (Disney Springs spur, $173-247M) are not drawn because the figure has no geometry for them; they are included in the program total ($3.5-4.8B) only.",
  "FDOT's ridership includes airport and attraction trips; SOL/R's measures count commuters only.",
];
export function parseSunshine(value: SunshineData): SunshineData {
  const fail = () => {
    throw new Error("Invalid Sunshine Corridor data.");
  };
  if (
    value?.type !== "FeatureCollection" ||
    !Array.isArray(value.features) ||
    !value.properties?.program_capital_musd ||
    !Array.isArray(value.properties.not_drawn)
  )
    fail();
  const ids = new Set<string>();
  for (const f of value.features) {
    const p = f.properties;
    if (
      !p?.id ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      typeof p.geometry_basis !== "string" ||
      typeof p.source !== "string"
    )
      fail();
    ids.add(p.id);
    if (!["Point", "LineString"].includes(f.geometry?.type)) fail();
    const coords =
      f.geometry.type === "Point"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    if (
      !coords.length ||
      coords.some(
        (p) =>
          p.length !== 2 ||
          !p.every(Number.isFinite) ||
          Math.abs(p[0]) > 180 ||
          Math.abs(p[1]) > 90,
      )
    )
      fail();
    if (
      f.geometry.type === "LineString" &&
      (coords.length < 2 ||
        ![
          p.capital_low_musd,
          p.capital_high_musd,
          p.tcar_length_mi,
          p.traced_length_mi,
        ].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) ||
        p.capital_low_musd! > p.capital_high_musd!)
    )
      fail();
  }
  const cost = value.properties.program_capital_musd;
  if (
    ![cost.low, cost.high].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
    ) ||
    cost.low > cost.high
  )
    fail();
  return value;
}
export function sunshineTotals(data: SunshineData) {
  const lines = data.features.filter((f) => f.geometry.type === "LineString");
  return {
    tcar: lines.reduce((n, f) => n + f.properties.tcar_length_mi!, 0),
    traced: lines.reduce((n, f) => n + f.properties.traced_length_mi!, 0),
    low: lines.reduce((n, f) => n + f.properties.capital_low_musd!, 0),
    high: lines.reduce((n, f) => n + f.properties.capital_high_musd!, 0),
  };
}
export function comparisonPlan(state: {
  data: RailData | null;
  network: ReturnType<typeof networkAt> | null;
  scenario: RailScenario | undefined;
  budget: number;
}) {
  if (!state.data || !state.scenario || !state.network) return null;
  return {
    low: state.network.links.reduce((n, l) => n + l.cost_low_musd, 0),
    high: state.network.links.reduce((n, l) => n + l.cost_high_musd, 0),
    equity: equityAt(state.data, state.scenario, state.budget),
  };
}
let cached: Promise<SunshineData> | undefined;
export function loadSunshine() {
  return (cached ??= fetch("/data/sunshine_corridor.geojson")
    .then(async (r) => {
      if (!r.ok) throw new Error("Sunshine Corridor file unavailable.");
      return parseSunshine(await r.json());
    })
    .catch((e) => {
      cached = undefined;
      throw e;
    }));
}
