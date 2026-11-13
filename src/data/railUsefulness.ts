import { networkAt, type RailPlan, type RailScenario } from "./railPlan.ts";

// Provided by the author: full drive-time population, not the smaller lookup extract.
export const DRIVE_TIME_COMMUTERS_FALLBACK = 763549;
export const driveDenominator = (plan: RailPlan) =>
  plan.denominators.workers_with_drive_time ?? DRIVE_TIME_COMMUTERS_FALLBACK;
export const formatCount = (n: number) =>
  (n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n)).toLocaleString(
    "en-US",
  );
export const formatShare = (n: number, total: number) =>
  total > 0 ? `${((100 * n) / total).toFixed(1)}%` : "unavailable";
export const formatMinutes = (n: number | null) =>
  n === null ? "unavailable" : `${Math.round(n)} min`;
export function usefulnessAt(
  plan: RailPlan,
  scenario: RailScenario,
  budget: number,
) {
  if (scenario.usefulness[String(budget)])
    return scenario.usefulness[String(budget)];
  const signature = (b: number) =>
    networkAt(plan, scenario, b)
      .links.map((l) => l.id)
      .sort()
      .join("|");
  const current = signature(budget);
  for (const [b, summary] of Object.entries(scenario.usefulness))
    if (signature(Number(b)) === current) return summary;
  return null;
}
export type RouteEdge = {
  id: string;
  a: string;
  b: string;
  minutes: number;
  existing: boolean;
};
export type RailRoute = { ride: number; nodes: string[]; edges: RouteEdge[] };
export function shortestRailPath(
  plan: RailPlan,
  scenario: RailScenario,
  budget: number,
  from: string,
  to: string,
): RailRoute | null {
  const ids = new Set(plan.nodes.map((n) => n.id));
  if (!ids.has(from) || !ids.has(to)) return null;
  const edges: RouteEdge[] = [
    ...plan.existing_links.map((l) => ({ ...l, existing: true })),
    ...networkAt(plan, scenario, budget).links.map((l) => ({
      id: l.id,
      a: l.a,
      b: l.b,
      minutes: scenario.speed_mph === 30 ? l.minutes_s30 : l.minutes,
      existing: false,
    })),
  ];
  const adjacent = new Map<string, { to: string; edge: RouteEdge }[]>();
  for (const edge of edges)
    for (const [a, b] of [
      [edge.a, edge.b],
      [edge.b, edge.a],
    ])
      adjacent.set(a, [...(adjacent.get(a) ?? []), { to: b, edge }]);
  const distance = new Map([[from, 0]]),
    previous = new Map<string, { node: string; edge: RouteEdge }>(),
    pending = new Set(ids);
  while (pending.size) {
    const node = [...pending].sort(
      (a, b) =>
        (distance.get(a) ?? Infinity) - (distance.get(b) ?? Infinity) ||
        a.localeCompare(b),
    )[0];
    const d = distance.get(node);
    if (d === undefined) break;
    pending.delete(node);
    if (node === to) {
      const nodes = [to],
        route: RouteEdge[] = [];
      while (nodes[0] !== from) {
        const p = previous.get(nodes[0])!;
        route.unshift(p.edge);
        nodes.unshift(p.node);
      }
      return { ride: d, nodes, edges: route };
    }
    for (const next of adjacent.get(node) ?? []) {
      const value = d + next.edge.minutes;
      if (pending.has(next.to) && value < (distance.get(next.to) ?? Infinity)) {
        distance.set(next.to, value);
        previous.set(next.to, { node, edge: next.edge });
      }
    }
  }
  return null;
}
export function commuteBaseline(plan: RailPlan, from: string, to: string) {
  const h = plan.nodes.findIndex((n) => n.id === from),
    w = plan.nodes.findIndex((n) => n.id === to),
    cols = plan.commute_pairs.columns;
  const index = (key: string) => cols.indexOf(key);
  const rows = plan.commute_pairs.rows.filter(
    (r) => r[index("home")] === h && r[index("work")] === w,
  );
  const mean = (key: string) => {
    const available = rows.filter((r) => r[index(key)] !== null),
      workers = available.reduce((sum, r) => sum + r[index("workers")]!, 0);
    return workers
      ? available.reduce(
          (sum, r) => sum + r[index(key)]! * r[index("workers")]!,
          0,
        ) / workers
      : null;
  };
  return {
    transit: mean("transit_min"),
    driving: mean("drive_min"),
    workers: rows.reduce((sum, r) => sum + r[index("workers")]!, 0),
    transitWorkers: rows
      .filter((r) => r[index("transit_min")] !== null)
      .reduce((sum, r) => sum + r[index("workers")]!, 0),
    present: rows.length > 0,
  };
}
