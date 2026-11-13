import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  scenarioId,
  parseRailData,
  type RailPlan,
  type RailScenario,
} from "./railPlan";
import {
  shortestRailPath,
  formatCount,
  formatShare,
  formatMinutes,
  driveDenominator,
  commuteBaseline,
  usefulnessAt,
} from "./railUsefulness";
const plan: RailPlan = JSON.parse(
  readFileSync("public/data/rail_network.json", "utf8"),
);
const defaultScenario = plan.scenarios.find(
  (s) => s.id === "low-oh20-minutes",
)!;
describe("scenario ids and formatting", () => {
  it("uses the unchanged default and only appends the speed suffix for 30 mph", () => {
    expect(scenarioId("low", 20, "minutes_saved", 2)).toBe("low-oh20-minutes");
    expect(scenarioId("high", 10, "workers_connected", 1.5, 30)).toBe(
      "high-oh10-connected-r1.5-s30",
    );
    expect(scenarioId("low", 30, "workers_connected", 2, 30)).toBe(
      "low-oh30-connected-r2.0-s30",
    );
  });
  it("rounds large counts to hundreds, small counts to integers, and shares from exact counts", () => {
    expect(formatCount(142026)).toBe("142,000");
    expect(formatCount(11990)).toBe("12,000");
    expect(formatCount(749)).toBe("749");
    expect(formatCount(1050)).toBe("1,100");
    expect(formatShare(142026, 267793)).toBe("53.0%");
    expect(formatShare(1, 0)).toBe("unavailable");
    expect(formatMinutes(null)).toBe("unavailable");
    expect(formatMinutes(39.4)).toBe("39 min");
    expect(driveDenominator(plan)).toBe(763549);
    expect(
      driveDenominator({
        ...plan,
        denominators: { ...plan.denominators, workers_with_drive_time: 123 },
      }),
    ).toBe(123);
  });
});
describe("real network and routing references", () => {
  it("accepts all 48 regenerated scenarios without changing the inputs", () => {
    const before = JSON.stringify(plan);
    const equity = JSON.parse(
      readFileSync("public/data/rail_equity_v2.json", "utf8"),
    );
    expect(parseRailData(plan, equity).plan.scenarios).toHaveLength(48);
    expect(JSON.stringify(plan)).toBe(before);
  });
  for (const [i, ref] of plan.reference_checks.entries())
    it(`matches supplied reference ${i + 1}: ${ref.scenario} / $${ref.budget_musd}M`, () => {
      const scenario = plan.scenarios.find((s) => s.id === ref.scenario)!;
      const path = shortestRailPath(
        plan,
        scenario,
        ref.budget_musd,
        ref.home,
        ref.work,
      );
      if (ref.ride_min === null) expect(path).toBeNull();
      else {
        expect(path).not.toBeNull();
        expect(Math.abs(path!.ride - ref.ride_min)).toBeLessThanOrEqual(0.05);
        expect(path!.nodes[0]).toBe(ref.home);
        expect(path!.nodes.at(-1)).toBe(ref.work);
      }
    });
  it("uses supplied summaries only, without interpolating a different built network", () => {
    expect(usefulnessAt(plan, defaultScenario, 10000)).toBe(
      defaultScenario.usefulness["10000"],
    );
    expect(usefulnessAt(plan, defaultScenario, 0)).toBeNull();
  });
});
describe("small routing and baseline fixture", () => {
  const tiny = {
    ...plan,
    nodes: ["a", "b", "c", "d"].map((id, i) => ({
      id,
      name: id,
      lon: i,
      lat: 0,
      existing_station: i < 2,
    })),
    existing_links: [{ id: "old", a: "a", b: "b", minutes: 5 }],
    links: [{ id: "new", a: "b", b: "c", minutes: 12, minutes_s30: 8 }],
    commute_pairs: {
      columns: ["home", "work", "workers", "transit_min", "drive_min"],
      rows: [
        [0, 2, 3, 60, 20],
        [0, 2, 1, 100, 40],
        [0, 2, 4, null, 30],
      ],
    },
  } as RailPlan;
  const scenario = {
    ...defaultScenario,
    steps: [
      {
        ...defaultScenario.steps[0],
        new_link_ids: ["new"],
        total_cost_musd: 100,
      },
    ],
    lines: [],
  } as RailScenario;
  it("keeps existing rail fixed, uses the selected new-line speed and excludes unbuilt edges", () => {
    expect(shortestRailPath(tiny, scenario, 99, "a", "c")).toBeNull();
    expect(shortestRailPath(tiny, scenario, 100, "a", "c")?.ride).toBe(17);
    expect(
      shortestRailPath(tiny, { ...scenario, speed_mph: 30 }, 100, "a", "c")
        ?.ride,
    ).toBe(13);
    expect(shortestRailPath(tiny, scenario, 100, "c", "a")?.ride).toBe(17);
    expect(shortestRailPath(tiny, scenario, 100, "a", "d")).toBeNull();
    expect(shortestRailPath(tiny, scenario, 100, "a", "a")).toEqual({
      ride: 0,
      nodes: ["a"],
      edges: [],
    });
  });
  it("weights repeated rows by workers and excludes missing transit from its mean", () => {
    expect(commuteBaseline(tiny, "a", "c")).toEqual({
      transit: 70,
      driving: 27.5,
      workers: 8,
      transitWorkers: 4,
      present: true,
    });
    expect(commuteBaseline(tiny, "a", "d")).toEqual({
      transit: null,
      driving: null,
      workers: 0,
      transitWorkers: 0,
      present: false,
    });
  });
});
