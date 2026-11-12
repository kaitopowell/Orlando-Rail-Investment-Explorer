"""
Equity check for every scenario and budget in rail_network.json (the connected-network plan).

Same method and output shape as run_equity.py. A plan's stations are the stations touched by any link
built within the budget; today's SunRail and Brightline stations are reported as a benchmark.

Writes data/processed/rail_equity_v2.json. Run:  py -m analysis.rail.run_equity_network
"""

import json
from pathlib import Path

from .equity import RADII_KM, covered, load_tracts, stations_xy, summarize, totals
from .run_equity import _arg

DATA = Path("data/processed")
NET = Path("public/data/rail_network.json")


def plan_stations(net, scenario, budget):
    """(ids, lon/lat list) of nodes touched by links built within the budget."""
    link = {l["id"]: l for l in net["links"]}
    node = {n["id"]: n for n in net["nodes"]}
    ids = set()
    for st in scenario["steps"]:
        if st["total_cost_musd"] <= budget:
            for lid in st["new_link_ids"]:
                ids |= {link[lid]["a"], link[lid]["b"]}
    ids = sorted(ids)
    return ids, [(node[i]["lon"], node[i]["lat"]) for i in ids]


def main():
    net = json.loads(NET.read_text(encoding="utf-8"))
    tracts = load_tracts(_arg("--tracts", Path("public/data/equity_tracts.geojson")),
                         _arg("--pop", Path("data/raw/acs_b01003_tracts_2024_5yr.csv")))
    region = totals(tracts)

    def block(lonlats):
        xy = stations_xy(lonlats)
        return {str(r): summarize(covered(tracts, xy, r), region) for r in RADII_KM}

    existing = [(n["lon"], n["lat"]) for n in net["nodes"] if n["existing_station"]]
    out = {
        "radii_km": list(RADII_KM),
        "region": {k: (round(v, 1) if isinstance(v, float) else v) for k, v in region.items()},
        "benchmarks": {"existing_stations": {"stations": len(existing), **block(existing)}},
        "scenarios": {},
        "notes": [
            "Tracts are counted when their centroid is within the radius of a station point.",
            "no_vehicle_ratio and poverty_ratio above 1 mean the plan reaches a larger share of that group than of all households (or people).",
            "A plan's stations are the stations touched by its new links, including the existing stations those links connect to.",
            "Equity is reported separately and is never added to the commute scores.",
            "Poverty uses total population as its base and ACS estimates carry margins of error; tracts flagged small_base are included.",
        ],
    }
    for s in net["scenarios"]:
        per_budget = {}
        for b in net["budgets_musd"]:
            ids, lonlats = plan_stations(net, s, b)
            per_budget[str(b)] = {"stations": len(ids), **block(lonlats)}
        out["scenarios"][s["id"]] = per_budget
    (DATA / "rail_equity_v2.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("wrote", DATA / "rail_equity_v2.json")


if __name__ == "__main__":
    main()
