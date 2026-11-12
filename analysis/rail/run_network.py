"""
Plan a connected network on top of existing SunRail, for one scenario or a quick comparison.

Run:  py -m analysis.rail.run_network            (base scenario, $10B, prints the plan)
"""

import csv
import sys
import time
from pathlib import Path

from .demand import load_pairs
from .links import build_links
from .network import (load_node_map, load_sunrail_links, merge_anchors, merge_links, merge_pairs, station_id)
from .routegreedy import greedy_routes
from .routes import build_routes, pick_anchors
from .run_scenarios import BASE, BUDGETS_MUSD, COST_CASES, MAX_BUDGET_MUSD, build_network
from .score import Params

DATA = Path("data/processed")


def prepare(cost="low", connected=True):
    """Everything the planner needs, on merged nodes. Returns a dict."""
    conns, infos, circ = build_network()
    node_map = load_node_map(DATA / "center_station_map.csv")
    stations = [r["name"] for r in csv.DictReader(open(DATA / "rail_stations.csv"))]
    existing = load_sunrail_links(DATA / "sunrail_links.csv")
    links = merge_links(build_links(conns, infos, circ, case=COST_CASES[cost]), node_map, existing)
    pairs = merge_pairs(load_pairs(), node_map)
    anchors = merge_anchors(pick_anchors(DATA / "candidate_centers.geojson"), node_map)
    routes = build_routes(links, anchors)
    return {"links": links, "existing": existing, "pairs": pairs, "anchors": anchors, "routes": routes,
            "seed": [station_id(s) for s in stations], "node_map": node_map}


def plan(ctx, overhead, measure, ratio, budget=MAX_BUDGET_MUSD, connected=True, tree=False):
    params = Params(overhead_min=overhead, ratio=ratio)
    return greedy_routes(ctx["routes"], budget, ctx["pairs"], params, measure,
                         existing_links=ctx["existing"], seed_nodes=ctx["seed"], require_connected=connected, tree_growth=tree)


if __name__ == "__main__":
    ctx = prepare(BASE["cost"])
    print(f"{len(ctx['links'])} candidate links, {len(ctx['existing'])} existing links, {len(ctx['pairs'])} pairs, "
          f"{len(ctx['anchors'])} anchors, {len(ctx['routes'])} routes")
    for connected in (False, True):
        t0 = time.time()
        steps = plan(ctx, BASE["overhead"], "time_saved", BASE["ratio"], connected=connected)
        kept = [s for s in steps if s.total_cost <= 10_000]
        print(f"connected={connected}: $10B -> {len(kept)} routes / {sum(len(s.new_link_ids) for s in kept)} links, "
              f"score {kept[-1].total_score:,.0f}, spent {kept[-1].total_cost:,.0f}  ({time.time()-t0:.0f}s)")
        if connected:
            for s in kept: print(f"  {s.total_cost:8,.0f}  +{s.cost:7,.0f}  {s.route_id}")
