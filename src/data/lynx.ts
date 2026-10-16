import type {Feature, FeatureCollection, Point} from "geojson";
export type Threshold = 15 | 20 | 30;
export type LynxProperties = {
  stop_id: string; stop_name: string; county: string;
  route_short_name: string | null; route_long_name: string | null;
  n_dep: number; headway_best_route_min: number | null; headway_combined_min: number | null;
  freq15: boolean; freq30: boolean; n_dep_best_nonlymmo: number;
  headway_best_nonlymmo_min: number | null; freq15_nl: boolean; freq20_nl: boolean; freq30_nl: boolean;
};
export type LynxStop = Feature<Point, LynxProperties>;
export type LynxData = FeatureCollection<Point, LynxProperties>;
export type BusTier = Threshold | "infrequent";
export const busColors: Record<BusTier, [number, number, number, number]> = {
  15: [232,251,255,255], 20: [88,214,255,245], 30: [45,140,255,230], infrequent: [83,111,138,85],
};
export const busRadii: Record<BusTier, number> = {15: 4.5, 20: 3.5, 30: 2.5, infrequent: 1.5};
export const busDefinition = "scheduled headway = 4 peak hours (7 to 9 am and 4 to 6 pm) divided by departures on the stop’s best single route and direction, on a representative Wednesday";
export const busNote = "Scheduled service from the GTFS feed, not observed reliability";
export const headway = (p: LynxProperties, includeLymmo: boolean) => includeLymmo ? p.headway_best_route_min : p.headway_best_nonlymmo_min;
export function meets(p: LynxProperties, threshold: Threshold, includeLymmo: boolean) {
  if (!includeLymmo) return p[`freq${threshold}_nl`];
  return threshold === 20 ? p.headway_best_route_min !== null && p.headway_best_route_min <= 20 : p[`freq${threshold}`];
}
export function busTier(p: LynxProperties, includeLymmo: boolean): BusTier | null {
  if (headway(p, includeLymmo) === null) return null;
  return meets(p,15,includeLymmo) ? 15 : meets(p,20,includeLymmo) ? 20 : meets(p,30,includeLymmo) ? 30 : "infrequent";
}
export function busSelection(data: LynxData, threshold: Threshold, includeLymmo: boolean, showInfrequent: boolean) {
  const counts: Record<BusTier, number> = {15:0,20:0,30:0,infrequent:0};
  let noService = 0;
  const stops = data.features.filter(f => {
    const tier = busTier(f.properties, includeLymmo);
    if (tier === null) {noService++; return false;}
    if (!meets(f.properties, threshold, includeLymmo) && !showInfrequent) return false;
    counts[meets(f.properties, threshold, includeLymmo) ? tier : "infrequent"]++;
    return true;
  });
  return {stops, counts, noService};
}
export function parseLynx(value: unknown): LynxData {
  const d = value as LynxData, ids = new Set<string>();
  if (d?.type !== "FeatureCollection" || !Array.isArray(d.features) || !d.features.length) throw new Error("Invalid LYNX data");
  for (const f of d.features) {
    const p = f.properties;
    if (typeof p?.stop_id !== "string" || !p.stop_id.trim() || ids.has(p.stop_id) ||
      typeof p.stop_name !== "string" || !["Lake","Orange","Osceola","Seminole"].includes(p.county) ||
      ![p.route_short_name, p.route_long_name].every(v => v === null || typeof v === "string") ||
      f.geometry?.type !== "Point" || f.geometry.coordinates.length !== 2 || !f.geometry.coordinates.every(Number.isFinite) ||
      ![p.n_dep,p.n_dep_best_nonlymmo].every(v => Number.isInteger(v) && v >= 0) ||
      ![p.headway_best_route_min,p.headway_best_nonlymmo_min,p.headway_combined_min].every(v => v === null || Number.isFinite(v) && v > 0))
      throw new Error("Invalid LYNX stop");
    for (const t of [15,20,30] as const) {
      if (p[`freq${t}_nl`] !== (p.headway_best_nonlymmo_min !== null && p.headway_best_nonlymmo_min <= t)) throw new Error("Invalid LYNX threshold");
    }
    for (const t of [15,30] as const) {
      if (p[`freq${t}`] !== (p.headway_best_route_min !== null && p.headway_best_route_min <= t)) throw new Error("Invalid LYNX threshold");
    }
    if (p.n_dep_best_nonlymmo === 0 && p.headway_best_nonlymmo_min !== null) throw new Error("Invalid LYNX service");
    ids.add(p.stop_id);
  }
  return d;
}
