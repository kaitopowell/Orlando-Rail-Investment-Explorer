"""
Export the connected-network plan for the map: public/data/rail_network.json

Packages results already computed by run_network.py --grid (rail_scenarios_v2.json). The only new
work here is grouping each scenario's links into lines so the map can draw named, colored lines.

Lines are grouped once per scenario on the full plan (everything built up to the largest budget) and
then fixed, so a line keeps its color and name as the budget slider moves; the map draws only the
links built within the chosen budget.

Run:  py -m analysis.rail.export_network
Standard library only.
"""

import csv
import json
import re
from collections import Counter
from pathlib import Path

from .export_plan import load_names, scenario_id
from .lines import group_lines
from .network import STATION_PREFIX
from .run_network import prepare
from .usefulness import all_pairs_minutes, usefulness

DATA = Path("data/processed")
OUT = Path("public/data/rail_network.json")
SLOW, FAST = 20.0, 30.0       # new-link train speeds (mph) in the export; 20 is the default
PALETTE_SIZE = 12          # the map keeps one color per index; lines beyond this reuse colors


def short(name):
    """Place name without the parenthetical, for line names."""
    return re.sub(r"\s*\(.*?\)", "", name).strip()


def sid(run):
    """Scenario id; 30 mph runs get an -s30 suffix so the 20 mph ids stay as they were."""
    return scenario_id(run) + ("-s30" if run.get("speed_mph", SLOW) == FAST else "")


def build_network_export(ctxs, runs, centers, stations, names, denominators, use=None, commute_pairs=None, ctx_fast=None):
    """
    ctxs: {"low": ctx, "high": ctx} from run_network.prepare. runs: rail_scenarios_v2 runs.
    centers: list of {id, name, lon, lat}. stations: list of {name, system, lat, lon}.
    """
    station_xy = {STATION_PREFIX + s["name"]: (float(s["lon"]), float(s["lat"])) for s in stations}
    center = {c["id"]: c for c in centers}
    existing_nodes = {n for l in ctxs["low"]["existing"] for n in (l.a, l.b)} | set(station_xy)

    def xy(n):
        return station_xy[n] if n in station_xy else (center[n]["lon"], center[n]["lat"])

    def label(n):
        return n[len(STATION_PREFIX):] if n.startswith(STATION_PREFIX) else names.get(n, center[n]["name"])

    low = {l.id: l for l in ctxs["low"]["links"]}
    high = {l.id: l for l in ctxs["high"]["links"]}
    meta = ctxs["low"]["meta"]
    fast = {l.id: l for l in ctx_fast["links"]} if ctx_fast else {}

    used_links = {lid for run in runs for s in run["order"] for lid in s["new_link_ids"]}
    nodes_used = {n for lid in used_links for n in (low[lid].a, low[lid].b)}
    links = []
    for lid in sorted(used_links):
        l = low[lid]
        m = meta[lid]
        (x1, y1), (x2, y2) = xy(l.a), xy(l.b)
        links.append({"id": lid, "a": l.a, "b": l.b, "a_name": label(l.a), "b_name": label(l.b),
                      "coords": [[round(x1, 6), round(y1, 6)], [round(x2, 6), round(y2, 6)]],
                      "class": m["class"], "length_km": m["length_km"], "minutes": round(l.minutes, 2),
                      "minutes_s30": round(fast[lid].minutes, 2) if lid in fast else None,
                      "cost_low_musd": round(l.cost, 1) if lid in low else None,
                      "cost_high_musd": round(high[lid].cost, 1)})
    link_by_pair = {frozenset((l["a"], l["b"])): l["id"] for l in links}

    nodes = []
    for n in sorted(nodes_used | existing_nodes):
        x, y = xy(n)
        nodes.append({"id": n, "name": label(n), "lon": round(x, 6), "lat": round(y, 6),
                      "existing_station": n in existing_nodes})

    out_scenarios = []
    for run in sorted(runs, key=sid):
        steps = [{"route_id": s["route_id"], "from": s["from"], "to": s["to"], "from_name": label(s["from"]),
                  "to_name": label(s["to"]), "new_link_ids": s["new_link_ids"], "gain": s["gain"],
                  "cost_musd": s["cost_musd"], "total_cost_musd": s["total_cost_musd"],
                  "total_score": s["total_score"]} for s in run["order"]]
        edges = Counter()
        for s in steps:
            for lid in s["new_link_ids"]:
                edges[frozenset((low[lid].a, low[lid].b))] += 1
        pos = {n: xy(n) for e in edges for n in e}
        grouped = group_lines(dict(edges), pos)
        lines = []
        for i, g in enumerate(grouped):
            lids = []
            for path in [g["main"]] + g["branches"]:
                for a, b in zip(path, path[1:]):
                    lids.append(link_by_pair[frozenset((a, b))])
            lines.append({"id": f"L{i + 1}", "name": f"{short(label(g['main'][0]))} to {short(label(g['main'][-1]))}",
                          "color_index": i % PALETTE_SIZE, "main": g["main"], "branches": g["branches"],
                          "link_ids": lids})
        out_scenarios.append({
            "id": sid(run), "speed_mph": run.get("speed_mph", SLOW), "cost_case": run["cost"], "overhead_min": run["overhead_min"],
            "measure": "minutes_saved" if run["measure"] == "time_saved" else "workers_connected",
            "ratio": run["ratio"], "steps": steps, "by_budget": run["by_budget"], "lines": lines,
            **({"usefulness": use[sid(run)]} if use else {})})

    return {
        "version": 2,
        "units": {"cost": "millions of US dollars", "minutes_saved": "job-minutes per weekday commute",
                  "workers_connected": "workers (jobs held) newly able to commute competitively by rail"},
        "denominators": denominators,
        "budgets_musd": [b["budget_musd"] for b in out_scenarios[0]["by_budget"]],
        "nodes": nodes,
        "existing_links": [{"id": l.id, "a": l.a, "b": l.b, "minutes": l.minutes} for l in ctxs["low"]["existing"]],
        "links": links,
        "scenarios": out_scenarios,
        **({"commute_pairs": commute_pairs} if commute_pairs else {}),
        "documented_projects": [{"link_id": "sunshine_3a:Meadow Woods|Orlando",
                                 "source": "FDOT Sunshine Corridor TCAR Final Report (2024), Table 14; 2018 SunRail Extension to OIA PD&E Study",
                                 "note": "5.5-mile extension on the existing OUC spur track to the MCO terminal, $400M including right of way and trainsets; the junction near Meadow Woods is inferred from the report's travel times"}],
        "caveats": [
            "Existing SunRail counts as part of the system: scores are what new construction adds on top of it.",
            "Stations near existing SunRail or Brightline stations are merged into those stations; other stations are demand centers, not chosen station sites.",
            "Links are straight lines between stations, not surveyed alignments.",
            "Costs are planning-level and exclude stations, vehicles and station access.",
            "No transfer penalty is charged between lines; the 10 to 30 minute wait/access overhead is the only stand-in.",
            "The workers-connected result depends strongly on the overhead and competitiveness ratio, which are tested assumptions, not measurements.",
            "Greedy build order is not a proven optimum and is limited to routes between anchor stations.",
        ],
    }


def validate(net):
    """Raise AssertionError if the export is internally inconsistent."""
    nids = [n["id"] for n in net["nodes"]]
    assert len(nids) == len(set(nids)), "duplicate node ids"
    nset = set(nids)
    lids = [l["id"] for l in net["links"]]
    assert len(lids) == len(set(lids)), "duplicate link ids"
    lset = set(lids)
    link = {l["id"]: l for l in net["links"]}
    for l in net["links"]:
        assert l["a"] in nset and l["b"] in nset, f"link {l['id']} has an unknown endpoint"
        assert 0 < l["cost_low_musd"] <= l["cost_high_musd"], f"cost order {l['id']}"
    sids = [s["id"] for s in net["scenarios"]]
    assert len(sids) == len(set(sids)), "duplicate scenario ids"
    for s in net["scenarios"]:
        key = "cost_low_musd" if s["cost_case"] == "low" else "cost_high_musd"
        built, spent, score = set(), 0.0, 0.0
        for st in s["steps"]:
            assert st["new_link_ids"], f"{s['id']}: empty step"
            for lid in st["new_link_ids"]:
                assert lid in lset, f"{s['id']}: unknown link {lid}"
                assert lid not in built, f"{s['id']}: link built twice"
                built.add(lid)
            expect = sum(link[x][key] for x in st["new_link_ids"])
            assert abs(expect - st["cost_musd"]) <= 0.1 * len(st["new_link_ids"]) + 0.5, f"{s['id']}: step cost mismatch"
            assert st["total_cost_musd"] >= spent - 1e-6 and st["total_score"] >= score - 1e-6, f"{s['id']}: totals went down"
            spent, score = st["total_cost_musd"], st["total_score"]
        in_lines = Counter(x for ln in s["lines"] for x in ln["link_ids"])
        assert set(in_lines) == built, f"{s['id']}: lines do not cover exactly the built links"
        assert all(c == 1 for c in in_lines.values()), f"{s['id']}: a link is in two lines"
        for ln in s["lines"]:
            for path in [ln["main"]] + ln["branches"]:
                assert all(n in nset for n in path), f"{s['id']}: line node unknown"
        for b in s["by_budget"]:
            kept = [st for st in s["steps"] if st["total_cost_musd"] <= b["budget_musd"]]
            assert b["routes"] == len(kept), f"{s['id']}: by_budget route count"
            if "usefulness" in s:
                u = s["usefulness"][str(b["budget_musd"])]
                if s["measure"] == "minutes_saved":
                    assert abs(u["job_minutes_saved"] - b["score"]) <= 0.5 + 1e-6 * b["score"], f"{s['id']}: usefulness does not match the model score"
                sv = u["commuters_saving"]
                assert sv["10"] >= sv["20"] >= sv["30"] >= 0 and u["commuters_any"] >= sv["10"], f"{s['id']}: saving buckets"
    return True


def usefulness_for_all(ctxs, runs, ctxs_fast=None):
    """{scenario id: {str(budget): usefulness dict}} on the same pairs and links the model used."""
    out = {}
    for run in runs:
        ctx = (ctxs_fast or ctxs)[run["cost"]] if run.get("speed_mph", SLOW) == FAST else ctxs[run["cost"]]
        by_id = {l.id: l for l in ctx["links"]}
        per = {}
        for b in run["by_budget"]:
            ids = [i for st in run["order"] if st["total_cost_musd"] <= b["budget_musd"] for i in st["new_link_ids"]]
            per[str(b["budget_musd"])] = usefulness(ctx["pairs"], ctx["existing"], [by_id[i] for i in ids], run["overhead_min"])
        out[sid(run)] = per
    return out


def commute_pair_table(ctx, node_ids):
    """Baseline commute pairs whose two ends are both network nodes, as compact arrays for the map:
    [home_index, work_index, workers, transit_min or null, drive_min or null] over the node list order."""
    index = {n: i for i, n in enumerate(node_ids)}
    rows = []
    for p in ctx["pairs"]:
        if p.home in index and p.work in index:
            rows.append([index[p.home], index[p.work], p.jobs,
                         None if p.transit_min is None else round(p.transit_min, 1),
                         None if p.car_min is None else round(p.car_min, 1)])
    return {"columns": ["home", "work", "workers", "transit_min", "drive_min"], "rows": rows}


def main(names_path="data/center_labels.csv"):
    runs = json.loads((DATA / "rail_scenarios_v2.json").read_text(encoding="utf-8"))["runs"]
    runs_fast = json.loads((DATA / "rail_scenarios_v2_s30.json").read_text(encoding="utf-8"))["runs"]
    base_runs = runs
    runs = runs + runs_fast
    ctxs = {c: prepare(c) for c in ("low", "high")}
    ctxs_fast = {c: prepare(c, speed=FAST) for c in ("low", "high")}
    plan = json.loads(Path("public/data/rail_plan.json").read_text(encoding="utf-8"))
    stations = list(csv.DictReader(open(DATA / "rail_stations.csv", encoding="utf-8")))
    pairs = ctxs["low"]["pairs"]
    denominators = {
        "workers_with_transit_option": sum(p.jobs for p in pairs if p.transit_min is not None),
        "workers_without_transit_option": sum(p.jobs for p in pairs if p.transit_min is None),
        "note": "center-to-center commutes only; trips inside one center or one station area are excluded",
    }
    use = usefulness_for_all(ctxs, runs, ctxs_fast)
    net = build_network_export(ctxs, runs, plan["centers"], stations, load_names(names_path), denominators, use=use, ctx_fast=ctxs_fast["low"])
    net["commute_pairs"] = commute_pair_table(ctxs["low"], [n["id"] for n in net["nodes"]])
    # reference values so the map's own shortest-path code can be tested against the model
    base = [r for r in base_runs if r["cost"] == "low" and r["overhead_min"] == 20.0 and r["measure"] == "time_saved"][0]
    by_id = {l.id: l for l in ctxs["low"]["links"]}
    checks = []
    for budget in (2500, 10000, 30000):
        ids = [i for st in base["order"] if st["total_cost_musd"] <= budget for i in st["new_link_ids"]]
        dist = all_pairs_minutes(list(ctxs["low"]["existing"]) + [by_id[i] for i in ids], [n["id"] for n in net["nodes"]])
        samples = [r for r in net["commute_pairs"]["rows"] if r[3] is not None][::max(1, len(net["commute_pairs"]["rows"]) // 12)][:12]
        ids_by_idx = [n["id"] for n in net["nodes"]]
        for r in samples:
            d = dist.get(ids_by_idx[r[0]], {}).get(ids_by_idx[r[1]])
            checks.append({"scenario": "low-oh20-minutes", "budget_musd": budget, "home": ids_by_idx[r[0]], "work": ids_by_idx[r[1]],
                           "ride_min": None if d is None else round(d, 2)})
    net["reference_checks"] = checks
    validate(net)
    OUT.write_text(json.dumps(net, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}: {len(net['nodes'])} nodes, {len(net['links'])} links, {len(net['scenarios'])} scenarios, "
          f"{OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
