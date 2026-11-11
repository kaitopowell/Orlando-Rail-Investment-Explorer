"""
Export everything the map needs into one file: public/data/rail_plan.json

Reads the centers, the 270 candidate links with their classes and costs, the 24 scenario
results and the place names, and writes one JSON the front end can load. No new analysis
happens here; this only packages results already computed by run_scenarios.py.

Run:  py -m analysis.rail.export_plan
Standard library only.
"""

import csv
import json
from pathlib import Path

from . import rail_params as P
from .demand import load_pairs
from .routes import pick_anchors

DATA = Path("data/processed")
OUT = Path("public/data/rail_plan.json")
CORE_BUDGET_MUSD = 10_000


def scenario_id(run):
    if run["measure"] == "time_saved":
        return f"{run['cost']}-oh{int(run['overhead_min'])}-minutes"
    return f"{run['cost']}-oh{int(run['overhead_min'])}-connected-r{run['ratio']}"


def load_names(path):
    names = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["name"].strip():
                names[r["center_id"]] = r["name"].strip()
    return names


def build_plan(centers_fc, connections_fc, link_rows, scenarios, names, anchors, denominators):
    anchor_set = set(anchors)
    centers = []
    for f in centers_fc["features"]:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        centers.append({"id": p["id"], "name": names.get(p["id"], "Unnamed center"),
                        "lon": round(lon, 6), "lat": round(lat, 6),
                        "jobs": int(p["total_jobs"]), "population": int(round(p["total_population"])),
                        "anchor": p["id"] in anchor_set})
    centers.sort(key=lambda c: c["id"])
    cname = {c["id"]: c["name"] for c in centers}

    by_link = {r["link_id"]: r for r in link_rows}
    links = []
    for f in connections_fc["features"]:
        p = f["properties"]
        lid = f"{p['from_id']}|{p['to_id']}"
        r = by_link[lid]
        links.append({"id": lid, "from": p["from_id"], "to": p["to_id"],
                      "from_name": cname[p["from_id"]], "to_name": cname[p["to_id"]],
                      "coords": [[round(x, 6), round(y, 6)] for x, y in f["geometry"]["coordinates"]],
                      "class": r["class"], "length_km": float(r["length_km"]),
                      "cost_low_musd": float(r["cost_low_musd"]), "cost_high_musd": float(r["cost_high_musd"])})
    links.sort(key=lambda l: l["id"])

    out_scenarios = []
    for run in scenarios:
        steps = []
        for s in run["order"]:
            steps.append({"route_id": s["route_id"], "from": s["from"], "to": s["to"],
                          "from_name": cname[s["from"]], "to_name": cname[s["to"]],
                          "new_link_ids": s["new_link_ids"], "gain": s["gain"], "cost_musd": s["cost_musd"],
                          "total_cost_musd": s["total_cost_musd"], "total_score": s["total_score"]})
        out_scenarios.append({
            "id": scenario_id(run), "cost_case": run["cost"], "overhead_min": run["overhead_min"],
            "measure": "minutes_saved" if run["measure"] == "time_saved" else "workers_connected",
            "ratio": run["ratio"], "steps": steps, "by_budget": run["by_budget"]})
    out_scenarios.sort(key=lambda s: s["id"])

    # links in every minutes-saved plan at $10B: the part of the plan that does not depend on assumptions
    sets = []
    for s in out_scenarios:
        if s["measure"] == "minutes_saved":
            sets.append({lid for st in s["steps"] if st["total_cost_musd"] <= CORE_BUDGET_MUSD for lid in st["new_link_ids"]})
    core = sorted(set.intersection(*sets)) if sets else []

    return {
        "version": 1,
        "units": {"cost": "millions of US dollars (2025 dollars where sourced)", "minutes_saved": "job-minutes per weekday commute",
                  "workers_connected": "workers (jobs held) newly able to commute competitively by rail"},
        "denominators": denominators,
        "budgets_musd": [b["budget_musd"] for b in out_scenarios[0]["by_budget"]],
        "core_budget_musd": CORE_BUDGET_MUSD,
        "core_link_ids": core,
        "anchors": sorted(anchor_set),
        "cost_per_mile_musd": {k: list(v) for k, v in P.COST_PER_MILE_M.items()},
        "centers": centers, "links": links, "scenarios": out_scenarios,
        "caveats": [
            "Links are straight lines between centers, not surveyed alignments.",
            "Costs are planning-level and exclude stations, vehicles and station access.",
            "The workers-connected result depends strongly on the wait/access overhead and the competitiveness ratio, which are tested assumptions, not measurements.",
            "Greedy build order is not a proven optimum and is limited to routes between anchor centers.",
        ],
    }


def validate(plan):
    """Raise AssertionError if the plan is internally inconsistent."""
    cids = [c["id"] for c in plan["centers"]]
    assert len(cids) == len(set(cids)), "duplicate center ids"
    lids = [l["id"] for l in plan["links"]]
    assert len(lids) == len(set(lids)), "duplicate link ids"
    cset, lset = set(cids), set(lids)
    link = {l["id"]: l for l in plan["links"]}
    for l in plan["links"]:
        assert l["from"] in cset and l["to"] in cset, f"link {l['id']} has unknown endpoint"
        assert len(l["coords"]) == 2
        assert l["cost_low_musd"] > 0 and l["cost_high_musd"] >= l["cost_low_musd"], f"cost order {l['id']}"
    assert set(plan["core_link_ids"]) <= lset
    sids = [s["id"] for s in plan["scenarios"]]
    assert len(sids) == len(set(sids)), "duplicate scenario ids"
    for s in plan["scenarios"]:
        key = "cost_low_musd" if s["cost_case"] == "low" else "cost_high_musd"
        seen, spent, score = set(), 0.0, 0.0
        for st in s["steps"]:
            assert st["new_link_ids"], f"{s['id']}: empty step"
            for lid in st["new_link_ids"]:
                assert lid in lset, f"{s['id']}: unknown link"
                assert lid not in seen, f"{s['id']}: link built twice"
                seen.add(lid)
            expect = sum(link[l][key] for l in st["new_link_ids"])
            assert abs(expect - st["cost_musd"]) <= 0.1 * len(st["new_link_ids"]) + 0.5, f"{s['id']}: step cost mismatch"
            assert st["total_cost_musd"] >= spent - 1e-6, f"{s['id']}: cost went down"
            spent = st["total_cost_musd"]
            assert st["total_score"] >= score - 1e-6, f"{s['id']}: score went down"
            score = st["total_score"]
        for b in s["by_budget"]:
            kept = [st for st in s["steps"] if st["total_cost_musd"] <= b["budget_musd"]]
            assert b["routes"] == len(kept), f"{s['id']}: by_budget route count"
    return True


def main(names_path="data/center_labels.csv"):
    centers_fc = json.loads((DATA / "candidate_centers.geojson").read_text(encoding="utf-8"))
    connections_fc = json.loads((DATA / "candidate_connections.geojson").read_text(encoding="utf-8"))
    with open(DATA / "link_classes.csv", newline="", encoding="utf-8") as fh:
        link_rows = list(csv.DictReader(fh))
    scenarios = json.loads((DATA / "rail_scenarios.json").read_text(encoding="utf-8"))["runs"]
    pairs = load_pairs()
    denominators = {
        "workers_with_transit_option": sum(p.jobs for p in pairs if p.transit_min is not None),
        "workers_without_transit_option": sum(p.jobs for p in pairs if p.transit_min is None),
        "note": "center-to-center commutes only; trips inside one center are excluded",
    }
    plan = build_plan(centers_fc, connections_fc, link_rows, scenarios, load_names(names_path),
                      pick_anchors(DATA / "candidate_centers.geojson"), denominators)
    validate(plan)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(plan, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}: {len(plan['centers'])} centers, {len(plan['links'])} links, "
          f"{len(plan['scenarios'])} scenarios, {len(plan['core_link_ids'])} core links, "
          f"{OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
