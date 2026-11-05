import type { Feature, Point, LineString } from "geojson";
export type CandidateCenter = Feature<Point, {
  id: string; hexagon_count: number; total_jobs: number; total_population: number;
  criteria: "jobs" | "population" | "both"; hexagons: string[];
  jobs_selected_hexagons: number; population_selected_hexagons: number;
  missing_job_hexagons: number; missing_population_hexagons: number;
  centroid_weight: "jobs" | "population";
}>;
export type CandidateConnection = Feature<LineString, {from_id: string; to_id: string; km: number}>;
export type CandidateSelection = {kind: "center"; id: string} | {kind: "connection"; id: string} | null;
export type CandidateSummary = {
  center_count: number; connection_count: number;
  jobs_share_inside_centers: number; population_share_inside_centers: number;
  jobs_inside_centers: number; population_inside_centers: number;
  all_jobs: number; all_population: number;
  parameters_assumptions: {TOP_SHARE: number; K_NEAREST: number; MAX_KM: number; RESOLUTION: number};
  sources: {jobs: {fallback: boolean}};
  flagged_work_hex: {h3: string; jobs: number; center_id: string};
  largest_work_hexagon: {h3: string; jobs: number};
};
export type CandidateData = {
  centers: CandidateCenter[]; connections: CandidateConnection[]; summary: CandidateSummary;
  byId: Map<string, CandidateCenter>;
  neighbors: Map<string, {id: string; km: number; connectionId: string}[]>;
  groups: string[][]; groupById: Map<string, number>; disconnectedNote: string | null;
};
export const connectionId = (f: CandidateConnection) => `${f.properties.from_id}|${f.properties.to_id}`;
const fail = (): never => { throw new Error("Candidate data is missing, malformed, or inconsistent."); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function number(value: unknown, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) return fail();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.length) return fail();
  return value;
}
function position(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 2 || value.some(v => typeof v !== "number" || !Number.isFinite(v)) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) return fail();
  return value;
}
function features(value: unknown): unknown[] {
  const collection = record(value);
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features) || !collection.features.length) return fail();
  return collection.features;
}
function same(a: number, b: number) { return Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)); }

export function parseCandidates(centerJSON: unknown, connectionJSON: unknown, summaryJSON: unknown): CandidateData {
  const memberIds = new Set<string>();
  const centers = features(centerJSON).map(value => {
    const f = record(value), p = record(f.properties), g = record(f.geometry);
    if (f.type !== "Feature" || g.type !== "Point") return fail();
    position(g.coordinates); text(p.id);
    number(p.total_jobs, true); number(p.total_population);
    const count = number(p.hexagon_count, true);
    if (!count || !Array.isArray(p.hexagons) || p.hexagons.length !== count) return fail();
    for (const id of p.hexagons) {
      if (typeof id !== "string" || !/^88[0-9a-f]{13}$/.test(id) || memberIds.has(id)) return fail();
      memberIds.add(id);
    }
    for (const field of ["jobs_selected_hexagons", "population_selected_hexagons", "missing_job_hexagons", "missing_population_hexagons"])
      if (number(p[field], true) > count) return fail();
    if (!["jobs", "population", "both"].includes(String(p.criteria)) || !["jobs", "population"].includes(String(p.centroid_weight))) return fail();
    return f as unknown as CandidateCenter;
  });
  const byId = new Map(centers.map(c => [c.properties.id, c]));
  if (byId.size !== centers.length) return fail();
  const ids = new Set<string>();
  const connections = features(connectionJSON).map(value => {
    const f = record(value), p = record(f.properties), g = record(f.geometry);
    const from = text(p.from_id), to = text(p.to_id);
    number(p.km);
    if (f.type !== "Feature" || g.type !== "LineString" || from >= to || !byId.has(from) || !byId.has(to) || !Array.isArray(g.coordinates) || g.coordinates.length !== 2) return fail();
    g.coordinates.forEach(position);
    for (const [i, id] of [from, to].entries()) {
      const expected = byId.get(id)!.geometry.coordinates;
      if (!(g.coordinates[i] as number[]).every((v, axis) => same(v, expected[axis]))) return fail();
    }
    const key = `${from}|${to}`;
    if (ids.has(key)) return fail();
    ids.add(key);
    return f as unknown as CandidateConnection;
  });
  const s = record(summaryJSON), assumptions = record(s.parameters_assumptions);
  if (number(s.center_count, true) !== centers.length || number(s.connection_count, true) !== connections.length) return fail();
  for (const field of ["jobs_share_inside_centers", "population_share_inside_centers"])
    if (number(s[field]) > 1) return fail();
  if (number(assumptions.TOP_SHARE) <= 0 || number(assumptions.TOP_SHARE) > 1 || number(assumptions.K_NEAREST, true) < 1 || number(assumptions.MAX_KM) <= 0 || assumptions.RESOLUTION !== 8) return fail();
  if (connections.some(e => e.properties.km > (assumptions.MAX_KM as number))) return fail();
  const sources = record(s.sources);
  if (record(sources.jobs).fallback !== false) return fail(); // This UI attribution requires workplace WAC, never silently OD.
  for (const [field, totalField, shareField, centerField] of [
    ["jobs_inside_centers", "all_jobs", "jobs_share_inside_centers", "total_jobs"],
    ["population_inside_centers", "all_population", "population_share_inside_centers", "total_population"],
  ] as const) {
    const total = number(s[totalField]);
    if (!total || !same(number(s[field]), centers.reduce((n,c) => n + c.properties[centerField], 0)) || !same((s[field] as number) / total, s[shareField] as number)) return fail();
  }
  for (const field of ["flagged_work_hex", "largest_work_hexagon"]) {
    const flag = record(s[field]);
    if (!/^88[0-9a-f]{13}$/.test(text(flag.h3))) return fail();
    number(flag.jobs, true);
  }
  const flagged = record(s.flagged_work_hex);
  if (!byId.get(text(flagged.center_id))?.properties.hexagons.includes(flagged.h3 as string)) return fail();
  const summary = s as unknown as CandidateSummary;
  const neighbors: CandidateData["neighbors"] = new Map(centers.map(c => [c.properties.id, []]));
  for (const e of connections) {
    const {from_id, to_id, km} = e.properties;
    neighbors.get(from_id)!.push({id: to_id, km, connectionId: connectionId(e)});
    neighbors.get(to_id)!.push({id: from_id, km, connectionId: connectionId(e)});
  }
  neighbors.forEach(list => list.sort((a,b) => a.km - b.km || a.id.localeCompare(b.id)));
  // Derive topology from loaded edges, not the summary's component counts.
  const remaining = new Set([...byId.keys()].sort()), groups: string[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(first);
    const stack = [first], members: string[] = [];
    while (stack.length) {
      const id = stack.pop()!; members.push(id);
      for (const neighbor of neighbors.get(id)!) if (remaining.delete(neighbor.id)) stack.push(neighbor.id);
    }
    groups.push(members.sort());
  }
  groups.sort((a,b) => b.length - a.length || a[0].localeCompare(b[0]));
  const groupById = new Map<string, number>();
  groups.forEach((group,i) => group.forEach(id => groupById.set(id,i)));
  const sizes = new Map<number, number>();
  groups.slice(1).forEach(group => sizes.set(group.length, (sizes.get(group.length) ?? 0) + 1));
  const parts = [...sizes].sort((a,b) => b[0]-a[0]).map(([size,count]) => `${count} ${count === 1 ? "group" : "groups"} of ${size} ${size === 1 ? "center" : "centers"}`);
  const disconnectedNote = parts.length ? `${parts.join(" and ")} ${groups.length === 2 ? "is" : "are"} not connected to the main network.` : null;
  return {centers, connections, summary, byId, neighbors, groups, groupById, disconnectedNote};
}

export async function loadCandidates(signal: AbortSignal) {
  const names = ["candidate_centers.geojson", "candidate_connections.geojson", "candidate_connections_summary.json"];
  const data = await Promise.all(names.map(async name => {
    const response = await fetch(`/data/${name}`, {signal});
    if (!response.ok) throw new Error(`Could not load ${name}.`);
    return response.json() as Promise<unknown>;
  }));
  return parseCandidates(data[0], data[1], data[2]);
}
