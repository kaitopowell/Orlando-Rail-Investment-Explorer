"""
Fold the existing passenger rail into the candidate network.

- centers that sit near an existing station become that station's node (center_station_map.csv)
- consecutive SunRail stations are joined by free, already-built links whose minutes come from
  the published weekday timetable
- candidate links, routes' anchors and demand pairs are re-expressed on the merged nodes

Standard library only.
"""

import csv
from collections import defaultdict
from pathlib import Path

from .score import Link, Pair

STATION_PREFIX = "station:"


def station_id(name):
    return STATION_PREFIX + name


def load_node_map(path="data/processed/center_station_map.csv"):
    """center id -> node id (a station node for snapped centers, else the center itself)."""
    out = {}
    for r in csv.DictReader(open(path, encoding="utf-8")):
        out[r["center_id"]] = station_id(r["station"]) if r["snapped"] == "True" else r["center_id"]
    return out


def sunrail_links(gtfs_dir, station_names):
    """
    Existing SunRail links between consecutive stations, minutes from the weekday timetable
    (median over trips of departure -> next arrival). Only stations in station_names are kept.
    """
    d = Path(gtfs_dir)
    name_of = {r["stop_id"]: r["stop_name"] for r in csv.DictReader(open(d / "stops.txt", encoding="utf-8-sig"))}
    trips = [r["trip_id"] for r in csv.DictReader(open(d / "trips.txt", encoding="utf-8-sig"))]
    seq = defaultdict(list)
    for r in csv.DictReader(open(d / "stop_times.txt", encoding="utf-8-sig")):
        seq[r["trip_id"]].append((int(r["stop_sequence"]), r["stop_id"], r["arrival_time"], r["departure_time"]))

    def secs(t):
        h, m, s = (int(x) for x in t.split(":"))
        return h * 3600 + m * 60 + s

    legs = defaultdict(list)
    for t in trips:
        stops = sorted(seq.get(t, []))
        for (_, a, _, dep), (_, b, arr, _) in zip(stops, stops[1:]):
            na, nb = name_of.get(a), name_of.get(b)
            if na in station_names and nb in station_names and na != nb:
                legs[frozenset((na, nb))].append((secs(arr) - secs(dep)) / 60.0)
    links = []
    for key, mins in sorted(legs.items(), key=lambda kv: sorted(kv[0])):
        a, b = sorted(key)
        mins.sort()
        links.append(Link(f"existing:{a}|{b}", station_id(a), station_id(b), minutes=round(mins[len(mins) // 2], 2), cost=0.0))
    return links


def merge_links(links, node_map, existing_links=()):
    """Re-express candidate links on merged nodes; drop self-loops, links that connect two existing stations
    (they would duplicate SunRail), and keep only the cheaper of parallel candidates."""
    skip = {frozenset((l.a, l.b)) for l in existing_links}
    on_rail = {n for l in existing_links for n in (l.a, l.b)}
    best = {}
    for l in links:
        a, b = node_map.get(l.a, l.a), node_map.get(l.b, l.b)
        if a == b or frozenset((a, b)) in skip:
            continue
        if a in on_rail and b in on_rail:
            continue          # a second link between two existing stations would only duplicate SunRail
        key = frozenset((a, b))
        cand = Link(l.id, a, b, l.minutes, l.cost)
        if key not in best or (cand.cost, cand.id) < (best[key].cost, best[key].id):
            best[key] = cand
    return sorted(best.values(), key=lambda l: l.id)


def merge_pairs(pairs, node_map):
    """Demand pairs on merged nodes; pairs that fall inside one node (same station area) are dropped."""
    out = []
    for p in pairs:
        h, w = node_map.get(p.home, p.home), node_map.get(p.work, p.work)
        if h != w:
            out.append(Pair(h, w, p.jobs, p.transit_min, p.car_min))
    return out


def merge_anchors(anchors, node_map):
    return sorted({node_map.get(a, a) for a in anchors})


def write_sunrail_links(links, path="data/processed/sunrail_links.csv"):
    """Save the existing-link minutes so the planner does not need the GTFS download."""
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "a", "b", "minutes", "source"])
        for l in links:
            w.writerow([l.id, l.a, l.b, l.minutes, "SunRail GTFS weekday timetable, median departure-to-next-arrival"])


def load_sunrail_links(path="data/processed/sunrail_links.csv"):
    return [Link(r["id"], r["a"], r["b"], float(r["minutes"]), 0.0) for r in csv.DictReader(open(path, encoding="utf-8"))]
