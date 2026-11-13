export type CostCase = "low" | "high";
export type Measure = "minutes_saved" | "workers_connected";
export type RailNode = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  existing_station: boolean;
};
export type RailLink = {
  id: string;
  a: string;
  b: string;
  a_name: string;
  b_name: string;
  coords: [number, number][];
  class: string;
  length_km: number;
  minutes: number;
  minutes_s30: number;
  cost_low_musd: number;
  cost_high_musd: number;
};
export type RailStep = {
  route_id: string;
  from: string;
  to: string;
  from_name: string;
  to_name: string;
  new_link_ids: string[];
  gain: number;
  cost_musd: number;
  total_cost_musd: number;
  total_score: number;
};
export type RailLine = {
  id: string;
  name: string;
  color_index: number;
  main: string[];
  branches: string[][];
  link_ids: string[];
};
export type UsefulPair = {
  home: string;
  work: string;
  workers: number;
  today_min: number;
  with_plan_min: number;
  saved_min: number;
  drive_min: number | null;
};
export type Usefulness = {
  job_minutes_saved: number;
  commuters_any: number;
  commuters_saving: Record<"10" | "20" | "30", number>;
  rail_competitive_with_driving: Record<"1.5" | "2.0", number>;
  top_pairs: UsefulPair[];
};
export type RailScenario = {
  speed_mph: 20 | 30;
  usefulness: Record<string, Usefulness>;
  id: string;
  cost_case: CostCase;
  overhead_min: number;
  measure: Measure;
  ratio: number | null;
  steps: RailStep[];
  lines: RailLine[];
  by_budget: {
    budget_musd: number;
    routes: number;
    links: number;
    spent_musd: number;
    score: number;
  }[];
};
export type RailPlan = {
  commute_pairs: { columns: string[]; rows: (number | null)[][] };
  reference_checks: {
    scenario: string;
    budget_musd: number;
    home: string;
    work: string;
    ride_min: number | null;
  }[];
  nodes: RailNode[];
  links: RailLink[];
  existing_links: { id: string; a: string; b: string; minutes: number }[];
  scenarios: RailScenario[];
  budgets_musd: number[];
  denominators: {
    workers_with_drive_time?: number;
    workers_with_transit_option: number;
    workers_without_transit_option: number;
    note: string;
  };
  caveats: string[];
  documented_projects: { link_id: string; source: string; note: string }[];
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
  benchmarks: { existing_stations: EquitySnapshot };
  scenarios: Record<string, Record<string, EquitySnapshot>>;
  notes: string[];
};
export type RailData = {
  plan: RailPlan;
  equity: RailEquity;
  core: Set<string>;
};
export type RailSelection = {
  kind: "link" | "station" | "step";
  id: string;
} | null;
export const MAX_BUDGET = 30000,
  DEFAULT_BUDGET = 10000,
  KM_PER_MILE = 1.609344;
export const scenarioId = (
  cost: CostCase,
  overhead: number,
  measure: Measure,
  ratio: number,
  speed: 20 | 30 = 20,
) =>
  `${cost}-oh${overhead}-${measure === "minutes_saved" ? "minutes" : `connected-r${ratio.toFixed(1)}`}${speed === 30 ? "-s30" : ""}`;
export function networkAt(
  plan: RailPlan,
  scenario: RailScenario,
  budget: number,
) {
  const steps = scenario.steps.filter((s) => s.total_cost_musd <= budget),
    built = new Map<string, number>();
  steps.forEach((s, i) => s.new_link_ids.forEach((id) => built.set(id, i)));
  const links = plan.links.filter((l) => built.has(l.id)),
    touched = new Set(links.flatMap((l) => [l.a, l.b]));
  const owner = new Map<string, RailLine>();
  scenario.lines.forEach((line) =>
    line.link_ids.forEach((id) => owner.set(id, line)),
  );
  return {
    steps,
    built,
    links,
    owner,
    lines: scenario.lines.filter((line) =>
      line.link_ids.some((id) => built.has(id)),
    ),
    stations: plan.nodes.filter((n) => touched.has(n.id)),
    spent: steps.at(-1)?.total_cost_musd ?? 0,
    score: steps.at(-1)?.total_score ?? 0,
    miles: links.reduce((n, l) => n + l.length_km, 0) / KM_PER_MILE,
  };
}
export function coreNetwork(plan: RailPlan) {
  const sets = plan.scenarios
    .filter((s) => s.measure === "minutes_saved")
    .map(
      (s) =>
        new Set(
          s.steps
            .filter((st) => st.total_cost_musd <= 10000)
            .flatMap((st) => st.new_link_ids),
        ),
    );
  return new Set(
    [...(sets[0] ?? [])].filter((id) => sets.every((s) => s.has(id))),
  );
}
export const budgetStops = (p: RailPlan, s: RailScenario) =>
  [
    ...new Set(
      [
        0,
        MAX_BUDGET,
        ...p.budgets_musd,
        ...s.steps.map((st) => st.total_cost_musd),
      ].filter((n) => n <= MAX_BUDGET),
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
  const fail = (why: string): never => {
    throw new Error(`Invalid connected rail network: ${why}. No plan drawn.`);
  };
  const finite = (n: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (
    !Array.isArray(plan?.nodes) ||
    !Array.isArray(plan.links) ||
    !Array.isArray(plan.scenarios) ||
    !Array.isArray(equity?.notes)
  )
    fail("missing collections");
  const nodes = new Map(plan.nodes.map((n) => [n.id, n])),
    links = new Map(plan.links.map((l) => [l.id, l]));
  if (nodes.size !== plan.nodes.length || links.size !== plan.links.length)
    fail("duplicate node or link id");
  for (const n of plan.nodes)
    if (
      typeof n.name !== "string" ||
      !Number.isFinite(n.lon) ||
      !Number.isFinite(n.lat) ||
      Math.abs(n.lon) > 180 ||
      Math.abs(n.lat) > 85 ||
      typeof n.existing_station !== "boolean"
    )
      fail("invalid station");
  for (const l of plan.links) {
    if (
      !nodes.has(l.a) ||
      !nodes.has(l.b) ||
      l.a === l.b ||
      l.coords?.length !== 2 ||
      ![
        l.length_km,
        l.minutes,
        l.minutes_s30,
        l.cost_low_musd,
        l.cost_high_musd,
      ].every(finite)
    )
      fail("invalid link");
    for (const [i, id] of [l.a, l.b].entries()) {
      const n = nodes.get(id)!;
      if (l.coords[i][0] !== n.lon || l.coords[i][1] !== n.lat)
        fail("link endpoints differ from stations");
    }
  }
  const ids = new Set<string>();
  for (const s of plan.scenarios) {
    if (
      ![20, 30].includes(s.speed_mph) ||
      ids.has(s.id) ||
      s.id !==
        scenarioId(
          s.cost_case,
          s.overhead_min,
          s.measure,
          s.ratio ?? 2,
          s.speed_mph,
        )
    )
      fail("duplicate or invalid scenario");
    ids.add(s.id);
    const built = new Set<string>();
    let cost = 0;
    for (const st of s.steps) {
      if (
        ![st.cost_musd, st.total_cost_musd, st.gain, st.total_score].every(
          finite,
        ) ||
        st.total_cost_musd < cost
      )
        fail("invalid build order");
      cost = st.total_cost_musd;
      for (const id of st.new_link_ids) {
        if (!links.has(id) || built.has(id))
          fail("unknown or repeatedly built link");
        built.add(id);
      }
    }
    const owners = new Set<string>(),
      lineIds = new Set<string>();
    if (!Array.isArray(s.lines)) fail("missing lines");
    for (const line of s.lines) {
      if (
        lineIds.has(line.id) ||
        typeof line.name !== "string" ||
        !Number.isInteger(line.color_index) ||
        line.color_index < 0 ||
        line.color_index > 11
      )
        fail("invalid line");
      lineIds.add(line.id);
      for (const n of [...line.main, ...line.branches.flat()])
        if (!nodes.has(n)) fail("unknown line station");
      for (const id of line.link_ids) {
        if (!built.has(id) || owners.has(id))
          fail("link must belong to exactly one line");
        owners.add(id);
      }
    }
    if (owners.size !== built.size) fail("built link missing from lines");
    for (const b of s.by_budget) {
      const n = networkAt(plan, s, b.budget_musd);
      if (
        n.steps.length !== b.routes ||
        n.links.length !== b.links ||
        n.spent !== b.spent_musd ||
        n.score !== b.score
      )
        fail("budget summary mismatch");
    }
    if (!s.usefulness || typeof s.usefulness !== "object")
      fail("missing usefulness");
    for (const u of Object.values(s.usefulness)) {
      if (
        !u.commuters_saving ||
        !u.rail_competitive_with_driving ||
        ![
          u.job_minutes_saved,
          u.commuters_any,
          ...["10", "20", "30"].map((k) => u.commuters_saving[k as "10"]),
          ...["1.5", "2.0"].map(
            (k) => u.rail_competitive_with_driving[k as "1.5"],
          ),
        ].every(finite) ||
        !Array.isArray(u.top_pairs)
      )
        fail("invalid usefulness");
      for (const pair of u.top_pairs)
        if (
          !nodes.has(pair.home) ||
          !nodes.has(pair.work) ||
          ![
            pair.workers,
            pair.today_min,
            pair.with_plan_min,
            pair.saved_min,
          ].every(finite) ||
          (pair.drive_min !== null && !finite(pair.drive_min))
        )
          fail("invalid improved commute");
    }
    for (const [b, r] of Object.entries(equity.scenarios[s.id] ?? {})) {
      if (r.stations !== networkAt(plan, s, Number(b)).stations.length)
        fail("equity station mismatch");
      for (const radius of ["0.8", "2.0"] as const)
        if (
          !r[radius] ||
          ![
            r[radius].share_of_households,
            r[radius].share_of_no_vehicle_households,
            r[radius].share_of_people_in_poverty,
          ].every((n) => finite(n) && n <= 1)
        )
          fail("invalid equity");
    }
  }
  if (
    !equity.benchmarks?.existing_stations ||
    !Array.isArray(plan.caveats) ||
    !plan.budgets_musd.every(finite) ||
    !finite(plan.denominators.workers_with_transit_option) ||
    !finite(plan.denominators.workers_without_transit_option)
  )
    fail("invalid metadata");
  if (
    !plan.commute_pairs ||
    ["home", "work", "workers", "transit_min", "drive_min"].some(
      (c) => !plan.commute_pairs.columns.includes(c),
    ) ||
    !Array.isArray(plan.commute_pairs.rows)
  )
    fail("invalid commute lookup");
  const cols = plan.commute_pairs.columns;
  for (const row of plan.commute_pairs.rows) {
    if (row.length !== cols.length) fail("invalid commute row");
    for (const key of ["home", "work"]) {
      const index = row[cols.indexOf(key)];
      if (
        index === null ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= plan.nodes.length
      )
        fail("invalid commute node index");
    }
    for (const key of ["workers", "transit_min", "drive_min"]) {
      const n = row[cols.indexOf(key)];
      if ((key === "workers" || n !== null) && !finite(n as number))
        fail("invalid commute value");
    }
  }
  for (const l of plan.existing_links)
    if (!nodes.has(l.a) || !nodes.has(l.b) || !finite(l.minutes))
      fail("invalid existing rail link");
  return { plan, equity, core: coreNetwork(plan) };
}
let cached: Promise<RailData> | undefined;
export function loadRailData() {
  return (cached ??= Promise.all(
    ["/data/rail_network.json", "/data/rail_equity_v2.json"].map(
      async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Could not load ${url.split("/").at(-1)}.`);
        return r.json();
      },
    ),
  )
    .then(([p, e]) => parseRailData(p, e))
    .catch((e) => {
      cached = undefined;
      throw e;
    }));
}
