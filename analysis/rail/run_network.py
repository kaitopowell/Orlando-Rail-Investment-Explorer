"""
Plan a connected network on top of existing SunRail, for one scenario or a quick comparison.

Run:  py -m analysis.rail.run_network            (base scenario, $10B, prints the plan)
"""

import csv
import sys
import time
from pathlib import Path

from .demand import load_pairs
from .hub_links import SUNSHINE_3A, hub_connections
from .links import build_links
from .network import (load_node_map, load_sunrail_links, merge_anchors, merge_links, merge_pairs, station_id)
from .routegreedy import greedy_routes
from .routes import build_routes, pick_anchors
from .run_scenarios import BASE, BUDGETS_MUSD, COST_CASES, MAX_BUDGET_MUSD, build_network
from .score import Link, Params

DATA = Path("data/processed")


def prepare(cost="low", hubs=True):
    """Everything the planner needs, on merged nodes. Returns a dict."""
    conns, infos, circ = build_network(hub_connections() if hubs else ())
    node_map = load_node_map(DATA / "center_station_map.csv")
    stations = [r["name"] for r in csv.DictReader(open(DATA / "rail_stations.csv"))]
    existing = load_sunrail_links(DATA / "sunrail_links.csv")
    links = merge_links(build_links(conns, infos, circ, case=COST_CASES[cost]), node_map, existing)
    if hubs:
        links.append(Link(SUNSHINE_3A["id"], SUNSHINE_3A["a"], SUNSHINE_3A["b"], SUNSHINE_3A["minutes"], SUNSHINE_3A["cost_musd"]))
    pairs = merge_pairs(load_pairs(), node_map)
    anchors = merge_anchors(pick_anchors(DATA / "candidate_centers.geojson"), node_map)
    # candidates: chains that ignore existing rail, chains that ride it for free, and each documented project
    seen, routes = set(), []
    sunshine = [(SUNSHINE_3A["id"], SUNSHINE_3A["a"], SUNSHINE_3A["b"], [l for l in links if l.id == SUNSHINE_3A["id"]])] if hubs else []
    for route in build_routes(links, anchors) + build_routes(links, anchors, free_links=existing) + sunshine:
        key = frozenset(l.id for l in route[3])
        if key not in seen:
            seen.add(key)
            routes.append(route)
    routes.sort(key=lambda x: x[0])
    from .links import price
    meta = {}
    for (lid, _a, _b, _ap, _bp, km), info in zip(conns, infos):
        length, lo = price(info, km, circ, 0)
        _, hi = price(info, km, circ, 1)
        meta[lid] = {"class": info["cls"], "length_km": round(length, 3), "cost_low_musd": round(lo, 1), "cost_high_musd": round(hi, 1)}
    meta[SUNSHINE_3A["id"]] = {"class": "documented_project", "length_km": round(SUNSHINE_3A["length_mi"] * 1.609344, 3),
                               "cost_low_musd": SUNSHINE_3A["cost_musd"], "cost_high_musd": SUNSHINE_3A["cost_musd"]}
    return {"links": links, "existing": existing, "pairs": pairs, "anchors": anchors, "routes": routes,
            "seed": [station_id(s) for s in stations], "node_map": node_map, "meta": meta}


def plan(ctx, overhead, measure, ratio, budget=MAX_BUDGET_MUSD, connected=True, tree=False):
    params = Params(overhead_min=overhead, ratio=ratio)
    return greedy_routes(ctx["routes"], budget, ctx["pairs"], params, measure,
                         existing_links=ctx["existing"], seed_nodes=ctx["seed"], require_connected=connected, tree_growth=tree)


# ----------------------------------------------------------------- full grid ----

def run_grid(out="data/processed/rail_scenarios_v2.json"):
    """All 24 scenarios on the connected-growth planner (loops allowed). Slow: a few minutes."""
    import json
    from .run_scenarios import OVERHEADS_MIN, RATIOS, prefix_summary
    runs = []
    for cost in COST_CASES:
        ctx = prepare(cost)
        ends = {r[0]: (r[1], r[2]) for r in ctx["routes"]}
        for ov in OVERHEADS_MIN:
            for measure, ratio in [("time_saved", None)] + [("newly_connected", r) for r in RATIOS]:
                steps = plan(ctx, ov, measure, ratio or 2.0)
                runs.append({
                    "cost": cost, "overhead_min": ov, "measure": measure, "ratio": ratio,
                    "order": [{"route_id": s.route_id, "from": ends[s.route_id][0], "to": ends[s.route_id][1],
                               "new_link_ids": list(s.new_link_ids), "gain": round(s.gain, 1), "cost_musd": round(s.cost, 1),
                               "total_cost_musd": round(s.total_cost, 1), "total_score": round(s.total_score, 1)} for s in steps],
                    "by_budget": [prefix_summary(steps, b) for b in BUDGETS_MUSD]})
                b10 = runs[-1]["by_budget"][2]
                print(f"{cost:4s} oh {ov:4.0f} {measure:15s} r {ratio}: $10B -> {b10['routes']} routes / {b10['links']} links, score {b10['score']:,.0f}")
    Path(out).write_text(json.dumps({"runs": runs}, indent=1), encoding="utf-8")
    print("wrote", out)


def score_link_set(ctx, link_ids, overhead, measure, ratio):
    """Marginal score and cost of building exactly these links on top of existing rail (no growth rules)."""
    by_id = {l.id: l for l in ctx["links"]}
    links = [by_id[i] for i in link_ids if i in by_id]       # links that merged away add nothing
    if not links:
        return 0.0, 0.0
    steps = greedy_routes([("set", links[0].a, links[-1].b, links)], 10**9, ctx["pairs"],
                          Params(overhead_min=overhead, ratio=ratio), measure,
                          existing_links=ctx["existing"], seed_nodes=ctx["seed"])
    return (steps[0].gain, steps[0].cost) if steps else (0.0, sum(l.cost for l in links))


if __name__ == "__main__" and "--grid" in sys.argv:
    run_grid()
elif __name__ == "__main__":
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
