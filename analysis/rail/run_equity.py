"""
Equity check for every scenario and budget in rail_plan.json.

Writes data/processed/rail_equity.json. Run:  py -m analysis.rail.run_equity
Needs public/data/rail_plan.json (py -m analysis.rail.export_plan) and the two tract files.
Tract files (already in the repo): public/data/equity_tracts.geojson and
data/raw/acs_b01003_tracts_2024_5yr.csv. Other locations can be passed with --tracts and --pop.
"""

import json
import sys
from pathlib import Path

from .equity import RADII_KM, covered, load_tracts, stations_xy, summarize, totals

DATA = Path("data/processed")
PLAN = Path("public/data/rail_plan.json")


def stations_for(plan, scenario, budget):
    """Centers touched by any link built within the budget."""
    link = {l["id"]: l for l in plan["links"]}
    center = {c["id"]: c for c in plan["centers"]}
    ids = set()
    for st in scenario["steps"]:
        if st["total_cost_musd"] <= budget:
            for lid in st["new_link_ids"]:
                ids.add(link[lid]["from"])
                ids.add(link[lid]["to"])
    return sorted(ids), [(center[i]["lon"], center[i]["lat"]) for i in sorted(ids)]


def _arg(flag, default):
    return Path(sys.argv[sys.argv.index(flag) + 1]) if flag in sys.argv else default


def main():
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    tracts = load_tracts(_arg("--tracts", Path("public/data/equity_tracts.geojson")),
                         _arg("--pop", Path("data/raw/acs_b01003_tracts_2024_5yr.csv")))
    region = totals(tracts)
    center = {c["id"]: c for c in plan["centers"]}

    def block(lonlats):
        xy = stations_xy(lonlats)
        return {str(r): summarize(covered(tracts, xy, r), region) for r in RADII_KM}

    out = {
        "radii_km": list(RADII_KM),
        "region": {k: (round(v, 1) if isinstance(v, float) else v) for k, v in region.items()},
        "benchmarks": {
            "all_candidate_centers": {"stations": len(plan["centers"]),
                                      **block([(c["lon"], c["lat"]) for c in plan["centers"]])},
            "anchor_centers_only": {"stations": len(plan["anchors"]),
                                    **block([(center[a]["lon"], center[a]["lat"]) for a in plan["anchors"]])},
        },
        "scenarios": {},
        "notes": [
            "Tracts are counted when their centroid is within the radius of a station (a center point).",
            "no_vehicle_ratio and poverty_ratio above 1 mean the plan reaches a larger share of that group than of all households (or people).",
            "Equity is reported separately and is never added to the commute scores.",
            "Poverty uses total population as its base and ACS estimates carry margins of error; tracts flagged small_base are included.",
        ],
    }
    for s in plan["scenarios"]:
        per_budget = {}
        for b in plan["budgets_musd"]:
            ids, lonlats = stations_for(plan, s, b)
            per_budget[str(b)] = {"stations": len(ids), **block(lonlats)}
        out["scenarios"][s["id"]] = per_budget
    Path(DATA / "rail_equity.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("wrote", DATA / "rail_equity.json")


if __name__ == "__main__":
    main()
