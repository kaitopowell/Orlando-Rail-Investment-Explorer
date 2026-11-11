export type CostCase = "low" | "high";
export type Measure = "minutes_saved" | "workers_connected";
export type LinkClass =
  | "passenger_corridor"
  | "freight_corridor"
  | "new_alignment";
export type RailCenter = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  jobs: number;
  population: number;
  anchor: boolean;
};
export type RailLink = {
  id: string;
  from: string;
  to: string;
  from_name: string;
  to_name: string;
  coords: [number, number][];
  class: LinkClass;
  length_km: number;
  cost_low_musd: number;
  cost_high_musd: number;
};
export type RailStep = {
  route_id: string;
  from_name: string;
  to_name: string;
  new_link_ids: string[];
  gain: number;
  cost_musd: number;
  total_cost_musd: number;
  total_score: number;
};
export type RailScenario = {
  id: string;
  cost_case: CostCase;
  overhead_min: number;
  measure: Measure;
  ratio: number | null;
  steps: RailStep[];
  by_budget: {
    budget_musd: number;
    routes: number;
    links: number;
    spent_musd: number;
    score: number;
  }[];
};
export type RailPlan = {
  centers: RailCenter[];
  links: RailLink[];
  scenarios: RailScenario[];
  budgets_musd: number[];
  core_link_ids: string[];
  denominators: {
    workers_with_transit_option: number;
    workers_without_transit_option: number;
  };
  caveats: string[];
  cost_per_mile_musd: Record<LinkClass, [number, number]>;
};
export type EquityReach = {
  share_of_households: number;
  share_of_no_vehicle_households: number;
  share_of_people_in_poverty: number;
  median_income_covered: number | null;
  no_vehicle_ratio: number | null;
  poverty_ratio: number | null;
};
export type EquitySnapshot = {
  stations: number;
  "0.8": EquityReach;
  "2.0": EquityReach;
};
export type RailEquity = {
  region: { median_income: number };
  benchmarks: { all_candidate_centers: EquitySnapshot };
  scenarios: Record<string, Record<string, EquitySnapshot>>;
  notes: string[];
};
export type RailData = { plan: RailPlan; equity: RailEquity };
export type RailSelection = {
  kind: "link" | "station" | "step";
  id: string;
} | null;
export const MAX_BUDGET = 30000;
export const DEFAULT_BUDGET = 10000;
export const KM_PER_MILE = 1.609344;
export const scenarioId = (
  cost: CostCase,
  overhead: number,
  measure: Measure,
  ratio: number,
) =>
  `${cost}-oh${overhead}-${measure === "minutes_saved" ? "minutes" : `connected-r${ratio.toFixed(1)}`}`;
export function networkAt(
  plan: RailPlan,
  scenario: RailScenario,
  budget: number,
) {
  const steps = scenario.steps.filter((s) => s.total_cost_musd <= budget);
  const built = new Map<string, number>();
  steps.forEach((s, i) => s.new_link_ids.forEach((id) => built.set(id, i)));
  const links = plan.links.filter((l) => built.has(l.id));
  const touched = new Set(links.flatMap((l) => [l.from, l.to]));
  return {
    steps,
    built,
    links,
    stations: plan.centers.filter((c) => touched.has(c.id)),
    spent: steps.at(-1)?.total_cost_musd ?? 0,
    score: steps.at(-1)?.total_score ?? 0,
    miles: links.reduce((n, l) => n + l.length_km, 0) / KM_PER_MILE,
  };
}
export const budgetStops = (plan: RailPlan, s: RailScenario) =>
  [
    ...new Set(
      [
        0,
        MAX_BUDGET,
        ...plan.budgets_musd,
        ...s.steps.map((x) => x.total_cost_musd),
      ].filter((x) => x <= MAX_BUDGET),
    ),
  ].sort((a, b) => a - b);
export function equityAt(data: RailData, s: RailScenario, budget: number) {
  const snapshots = data.equity.scenarios[s.id];
  if (snapshots?.[String(budget)])
    return { budget, record: snapshots[String(budget)] };
  const signature = (b: number) =>
    networkAt(data.plan, s, b)
      .links.map((l) => l.id)
      .sort()
      .join("|");
  const current = signature(budget);
  for (const [b, record] of Object.entries(snapshots ?? {}))
    if (signature(Number(b)) === current) return { budget: Number(b), record };
  return null;
}
export function parseRailData(plan: RailPlan, equity: RailEquity): RailData {
  const fail = () => {
    throw new Error("Rail plan or equity data is malformed or inconsistent.");
  };
  if (
    !Array.isArray(plan?.centers) ||
    !Array.isArray(plan.links) ||
    !Array.isArray(plan.scenarios) ||
    !Array.isArray(plan.caveats) ||
    !Array.isArray(equity?.notes)
  )
    fail();
  const finite = (n: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0;
  const centers = new Set(plan.centers.map((c) => c.id)),
    links = new Set(plan.links.map((l) => l.id));
  if (centers.size !== plan.centers.length || links.size !== plan.links.length)
    fail();
  for (const c of plan.centers)
    if (
      !c.id ||
      typeof c.name !== "string" ||
      !Number.isFinite(c.lon) ||
      !Number.isFinite(c.lat) ||
      Math.abs(c.lon) > 180 ||
      Math.abs(c.lat) > 90 ||
      typeof c.anchor !== "boolean"
    )
      fail();
  for (const l of plan.links)
    if (
      !centers.has(l.from) ||
      !centers.has(l.to) ||
      !["passenger_corridor", "freight_corridor", "new_alignment"].includes(
        l.class,
      ) ||
      !finite(l.length_km) ||
      !finite(l.cost_low_musd) ||
      !finite(l.cost_high_musd) ||
      l.coords?.length !== 2 ||
      l.coords.some((p) => p.length !== 2 || !p.every(Number.isFinite))
    )
      fail();
  if (
    !plan.core_link_ids.every((id) => links.has(id)) ||
    !plan.budgets_musd.every(finite) ||
    !finite(plan.denominators.workers_with_transit_option) ||
    !finite(plan.denominators.workers_without_transit_option)
  )
    fail();
  const scenarios = new Set<string>();
  for (const s of plan.scenarios) {
    if (
      scenarios.has(s.id) ||
      s.id !== scenarioId(s.cost_case, s.overhead_min, s.measure, s.ratio ?? 2)
    )
      fail();
    scenarios.add(s.id);
    let previous = 0;
    const built = new Set<string>();
    for (const step of s.steps) {
      if (
        ![
          step.cost_musd,
          step.total_cost_musd,
          step.gain,
          step.total_score,
        ].every(finite) ||
        step.total_cost_musd < previous ||
        !step.new_link_ids.length
      )
        fail();
      previous = step.total_cost_musd;
      for (const id of step.new_link_ids) {
        if (!links.has(id) || built.has(id)) fail();
        built.add(id);
      }
    }
    for (const [budget, snapshot] of Object.entries(
      equity.scenarios[s.id] ?? {},
    )) {
      if (
        snapshot.stations !== networkAt(plan, s, Number(budget)).stations.length
      )
        fail();
      for (const radius of ["0.8", "2.0"] as const) {
        const r = snapshot[radius];
        if (
          !r ||
          ![
            r.share_of_households,
            r.share_of_no_vehicle_households,
            r.share_of_people_in_poverty,
          ].every((n) => finite(n) && n <= 1)
        )
          fail();
      }
    }
  }
  if (!finite(equity.region.median_income)) fail();
  return { plan, equity };
}
let cached: Promise<RailData> | undefined;
// One shared request pair, including React StrictMode and repeated toggle cycles.
export function loadRailData() {
  return (cached ??= Promise.all(
    ["/data/rail_plan.json", "/data/rail_equity.json"].map(async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Could not load ${url.split("/").at(-1)}.`);
      return r.json();
    }),
  )
    .then(([p, e]) => parseRailData(p, e))
    .catch((e) => {
      cached = undefined;
      throw e;
    }));
}
