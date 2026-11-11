"""
Turn the 270 straight-line candidate connections into priced, timed rail links.

For each connection we ask: is there existing rail between the two centers that is not
much longer than a straight line? If so the link follows that corridor (cheaper, and its
length is the real rail length). If not it is new alignment (straight length times a
circuity factor measured from the corridor links).

Standard library only. Run:  py -m analysis.rail.links
"""

import csv
import heapq
import json
import math
import statistics
from pathlib import Path

from . import rail_params as P
from .score import Link

KM_PER_DEG_LAT = 111.195


# ---------------------------------------------------------------- geometry ----

class Projector:
    """Flat local map in km (fine for a region this size)."""

    def __init__(self, lat0):
        self.kx = KM_PER_DEG_LAT * math.cos(math.radians(lat0))

    def __call__(self, lon, lat):
        return lon * self.kx, lat * KM_PER_DEG_LAT


def _dist(p, q):
    return math.hypot(p[0] - q[0], p[1] - q[1])


def _densify(points, step_km):
    """Insert points so no gap is longer than step_km."""
    out = [points[0]]
    for q in points[1:]:
        p = out[-1]
        n = max(1, math.ceil(_dist(p, q) / step_km))
        for i in range(1, n + 1):
            out.append((p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n))
    return out


class PointIndex:
    """Grid lookup: is any stored point within radius_km of here?"""

    def __init__(self, radius_km):
        self.r = radius_km
        self.cells = {}

    def _cell(self, p):
        return int(p[0] // self.r), int(p[1] // self.r)

    def add(self, p):
        self.cells.setdefault(self._cell(p), []).append(p)

    def near(self, p):
        cx, cy = self._cell(p)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in self.cells.get((cx + dx, cy + dy), ()):
                    if _dist(p, q) <= self.r:
                        return True
        return False


# ------------------------------------------------------------ rail network ----

def build_passenger_index(shape_lines, proj, radius_km=None):
    """shape_lines: list of [(lon, lat), ...] route shapes from the SunRail / Brightline feeds."""
    radius_km = radius_km or P.SHAPE_MATCH_KM
    index = PointIndex(radius_km)
    for line in shape_lines:
        pts = [proj(lon, lat) for lon, lat in line]
        if len(pts) < 2:
            continue
        for p in _densify(pts, radius_km / 3):
            index.add(p)
    return index


def build_rail_graph(features, proj, passenger_index):
    """
    Undirected graph of through-running rail.
    graph[node] = list of (neighbour, km, is_passenger); a node is the (lon, lat) pair, so
    OSM ways that share a node join up automatically.
    """
    graph = {}
    for f in features:
        props = f.get("properties", {})
        if props.get("service") in P.SKIP_SERVICE or props.get("usage") in P.SKIP_USAGE:
            continue
        coords = [tuple(c) for c in f["geometry"]["coordinates"]]
        for a, b in zip(coords, coords[1:]):
            if a == b:
                continue
            pa, pb = proj(*a), proj(*b)
            km = _dist(pa, pb)
            # sample along the edge; passenger if most samples sit on a SunRail/Brightline shape
            n = max(1, math.ceil(km / 0.05))
            hits = 0
            for i in range(n):
                t = (i + 0.5) / n
                if passenger_index.near((pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t)):
                    hits += 1
            is_pass = hits * 2 > n
            graph.setdefault(a, []).append((b, km, is_pass))
            graph.setdefault(b, []).append((a, km, is_pass))
    return graph


def snap(point_lonlat, graph, proj, max_km):
    """Nearest rail node within max_km, or None."""
    p = proj(*point_lonlat)
    best, best_d = None, max_km
    for node in graph:
        d = _dist(p, proj(*node))
        if d < best_d or (d == best_d and best is not None and node < best):
            best, best_d = node, d
    return best


def shortest_rail_path(graph, src, dst, max_km):
    """(total_km, passenger_km) of the shortest rail path, or None if none within max_km."""
    if src == dst:
        return None
    best = {src: 0.0}
    prev = {}
    heap = [(0.0, src)]
    while heap:
        d, node = heapq.heappop(heap)
        if d > best.get(node, math.inf):
            continue
        if node == dst or d > max_km:
            break
        for nb, km, is_pass in graph.get(node, ()):
            nd = d + km
            if nd <= max_km and nd < best.get(nb, math.inf):
                best[nb] = nd
                prev[nb] = (node, km, is_pass)
                heapq.heappush(heap, (nd, nb))
    if dst not in best:
        return None
    pass_km, node = 0.0, dst
    while node != src:
        node, km, is_pass = prev[node]
        pass_km += km if is_pass else 0.0
    return best[dst], pass_km


# ---------------------------------------------------------- classify + price ----

def classify_connection(a_pt, b_pt, straight_km, graph, proj):
    """
    Returns a dict: cls, length_km (None for new alignment, filled in later),
    passenger_km, freight_km.
    """
    out = {"cls": "new_alignment", "rail_km": None, "passenger_km": 0.0, "freight_km": 0.0, "node_km": None}
    if not graph:
        return out
    sa = snap(a_pt, graph, proj, P.SNAP_KM)
    sb = snap(b_pt, graph, proj, P.SNAP_KM)
    if sa is None or sb is None:
        return out
    found = shortest_rail_path(graph, sa, sb, P.CIRCUITY_CAP * straight_km)
    if found is None:
        return out
    total, pass_km = found
    out.update(
        cls="passenger_corridor" if total > 0 and pass_km / total >= P.PASSENGER_SHARE_MIN else "freight_corridor",
        rail_km=total, passenger_km=pass_km, freight_km=total - pass_km,
        node_km=_dist(proj(*sa), proj(*sb)),   # straight gap between the two rail snap points
    )
    return out


def price(info, straight_km, new_circuity, case):
    """
    case 0 = low cost, 1 = high cost. Returns (length_km, cost in $M).
    Corridor links pay the passenger rate on passenger track and the freight rate on the rest.
    """
    buf = 1.0 + P.COMPLEXITY_BUFFER
    if info["cls"] == "new_alignment":
        length = straight_km * new_circuity
        return length, length / P.KM_PER_MILE * P.COST_PER_MILE_M["new_alignment"][case] * buf
    cost = (info["passenger_km"] / P.KM_PER_MILE * P.COST_PER_MILE_M["passenger_corridor"][case]
            + info["freight_km"] / P.KM_PER_MILE * P.COST_PER_MILE_M["freight_corridor"][case])
    return info["rail_km"], cost * buf


def minutes_for(length_km, speed_mph=None):
    return length_km / P.KM_PER_MILE / (speed_mph or P.SPEED_MPH) * 60.0


def classify_all(connections, graph, proj):
    """connections: list of (link_id, a_id, b_id, a_lonlat, b_lonlat, straight_km)."""
    infos = [classify_connection(a, b, km, graph, proj) for _, _, _, a, b, km in connections]
    # circuity is measured between the snapped rail points, so the snap offset can't make it < 1
    ratios = [i["rail_km"] / i["node_km"] for i in infos if i["rail_km"] and i["node_km"]]
    new_circuity = statistics.median(ratios) if ratios else P.DEFAULT_NEW_CIRCUITY
    return infos, new_circuity


def build_links(connections, infos, new_circuity, case=0, speed_mph=None):
    """The engine's Link objects (minutes = in-vehicle rail minutes, cost in $M)."""
    links = []
    for (lid, a_id, b_id, _, _, km), info in zip(connections, infos):
        length, cost = price(info, km, new_circuity, case)
        links.append(Link(lid, a_id, b_id, minutes=minutes_for(length, speed_mph), cost=cost))
    return links


# --------------------------------------------------------------------- I/O ----

def load_connections(path):
    """Link ids are 'from_id|to_id'. Center coordinates come from the line's two ends."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    out = []
    for f in data["features"]:
        p = f["properties"]
        a, b = f["geometry"]["coordinates"]
        out.append((f"{p['from_id']}|{p['to_id']}", p["from_id"], p["to_id"], tuple(a), tuple(b), p["km"]))
    return out


def load_shape_lines(path):
    shapes = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            shapes.setdefault((r["feed"], r["shape_id"]), []).append((int(r["seq"]), float(r["lon"]), float(r["lat"])))
    return [[(lon, lat) for _, lon, lat in sorted(pts)] for pts in shapes.values()]


def main(data_dir="data/processed"):
    d = Path(data_dir)
    proj = Projector(28.5)
    conns = load_connections(d / "candidate_connections.geojson")
    features = json.loads((d / "rail_lines_orlando.geojson").read_text(encoding="utf-8"))["features"]
    index = build_passenger_index(load_shape_lines(d / "passenger_rail_shapes.csv"), proj)
    graph = build_rail_graph(features, proj, index)
    infos, new_circ = classify_all(conns, graph, proj)

    out = d / "link_classes.csv"
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["link_id", "straight_km", "class", "length_km", "passenger_km",
                    "cost_low_musd", "cost_high_musd", "minutes_base_speed"])
        for c, info in zip(conns, infos):
            length, lo = price(info, c[5], new_circ, 0)
            _, hi = price(info, c[5], new_circ, 1)
            w.writerow([c[0], round(c[5], 3), info["cls"], round(length, 3), round(info["passenger_km"], 3),
                        round(lo, 1), round(hi, 1), round(minutes_for(length), 2)])
    counts = {}
    for i in infos:
        counts[i["cls"]] = counts.get(i["cls"], 0) + 1
    print("graph nodes:", len(graph), "| links by class:", counts, "| new-alignment circuity:", round(new_circ, 3))
    print("wrote", out)


if __name__ == "__main__":
    main()
