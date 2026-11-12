"""
Run the greedy build order on the real network for a grid of scenarios.

Candidates are routes between anchor centers (top 12 by jobs or by population), not single
links. One run per (cost case, overhead, objective [, ratio]) with a large budget; because
the greedy plan is a true prefix, every smaller budget is just the first N steps.

Run:  py -m analysis.rail.run_scenarios            (full grid, takes a while)
      py -m analysis.rail.run_scenarios --base     (one scenario, quick check)
Writes data/processed/rail_scenarios.json
"""

import json
import sys
import time
from pathlib import Path

from . import rail_params as P
from .demand import load_pairs
from .routegreedy import greedy_routes
from .routes import build_routes, pick_anchors
from .links import (Projector, build_links, build_passenger_index, build_rail_graph, classify_all,
                    load_connections, load_shape_lines)
from .score import Params

DATA = Path("data/processed")
MAX_BUDGET_MUSD = 30_000          # plan far past $10B so any smaller budget is a prefix
BUDGETS_MUSD = [2_500, 5_000, 10_000, 15_000, 20_000, 30_000]
COST_CASES = {"low": 0, "high": 1}
OVERHEADS_MIN = [10.0, 20.0, 30.0]    # assumption: wait + access time added to every rail trip
RATIOS = [1.5, 2.0, 3.0]              # assumption: rail counts if rail time <= ratio x car time
BASE = {"cost": "low", "overhead": 20.0, "ratio": 2.0}


def build_network(extra=()):
    proj = Projector(28.5)
    conns = load_connections(DATA / "candidate_connections.geojson") + list(extra)
    feats = json.loads((DATA / "rail_lines_orlando.geojson").read_text(encoding="utf-8"))["features"]
    graph = build_rail_graph(feats, proj, build_passenger_index(load_shape_lines(DATA / "passenger_rail_shapes.csv"), proj))
    infos, circ = classify_all(conns, graph, proj)
    return conns, infos, circ


def prefix_summary(steps, budget):
    kept = [s for s in steps if s.total_cost <= budget]
    return {"budget_musd": budget, "routes": len(kept),
            "links": sum(len(s.new_link_ids) for s in kept),
            "spent_musd": round(kept[-1].total_cost, 1) if kept else 0.0,
            "score": round(kept[-1].total_score, 1) if kept else 0.0}


def run_one(conns, infos, circ, pairs, anchors, cost, overhead, measure, ratio):
    links = build_links(conns, infos, circ, case=COST_CASES[cost])
    routes = build_routes(links, anchors)
    params = Params(overhead_min=overhead, ratio=ratio)
    t0 = time.time()
    steps = greedy_routes(routes, MAX_BUDGET_MUSD, pairs, params, measure)
    ends = {r[0]: (r[1], r[2]) for r in routes}
    return {
        "cost": cost, "overhead_min": overhead, "measure": measure,
        "ratio": ratio if measure == "newly_connected" else None,
        "candidate_routes": len(routes),
        "seconds": round(time.time() - t0, 1),
        "order": [{"route_id": s.route_id, "from": ends[s.route_id][0], "to": ends[s.route_id][1],
                   "new_link_ids": list(s.new_link_ids), "gain": round(s.gain, 1),
                   "cost_musd": round(s.cost, 1), "total_cost_musd": round(s.total_cost, 1),
                   "total_score": round(s.total_score, 1)} for s in steps],
        "by_budget": [prefix_summary(steps, b) for b in BUDGETS_MUSD],
    }


def main(base_only=False):
    conns, infos, circ = build_network()
    pairs = load_pairs()
    anchors = pick_anchors(DATA / "candidate_centers.geojson")
    print(f"{len(conns)} links, {len(pairs)} demand pairs, {len(anchors)} anchors, new-alignment circuity {circ:.3f}")
    runs = []
    if base_only:
        grid = [(BASE["cost"], BASE["overhead"], "time_saved", None), (BASE["cost"], BASE["overhead"], "newly_connected", BASE["ratio"])]
    else:
        grid = []
        for cost in COST_CASES:
            for ov in OVERHEADS_MIN:
                grid.append((cost, ov, "time_saved", None))
                for r in RATIOS:
                    grid.append((cost, ov, "newly_connected", r))
    for cost, ov, measure, ratio in grid:
        run = run_one(conns, infos, circ, pairs, anchors, cost, ov, measure, ratio if ratio else 2.0)
        runs.append(run)
        b10 = next(b for b in run["by_budget"] if b["budget_musd"] == 10_000)
        print(f"{cost:4s} overhead {ov:4.0f} {measure:15s} ratio {run['ratio']}: "
              f"$10B -> {b10['routes']} routes / {b10['links']} links, score {b10['score']:,.0f} ({run['seconds']}s)")
    out = DATA / ("rail_scenarios_base.json" if base_only else "rail_scenarios.json")
    out.write_text(json.dumps({"runs": runs}, indent=1), encoding="utf-8")
    print("wrote", out)


if __name__ == "__main__":
    main(base_only="--base" in sys.argv)
