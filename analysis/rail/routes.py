"""
Candidate routes: the cheapest chain of candidate links between every pair of anchor centers.

Anchors are the centers in the top N by jobs or the top N by population (N = 12), so the
network is organised around where people work and where they live.

Standard library only.
"""

import heapq
import json
import math
from itertools import combinations
from pathlib import Path

TOP_N = 12


def pick_anchors(centers_path="data/processed/candidate_centers.geojson", top_n=TOP_N):
    """Anchor ids: top_n by jobs plus top_n by population (ties go to the smaller id)."""
    feats = json.loads(Path(centers_path).read_text(encoding="utf-8"))["features"]
    rows = [(f["properties"]["id"], f["properties"]["total_jobs"], f["properties"]["total_population"]) for f in feats]
    by_jobs = [r[0] for r in sorted(rows, key=lambda r: (-r[1], r[0]))[:top_n]]
    by_pop = [r[0] for r in sorted(rows, key=lambda r: (-r[2], r[0]))[:top_n]]
    return sorted(set(by_jobs) | set(by_pop))


def cheapest_path(links, src, dst):
    """The links of the lowest-cost chain from src to dst, or None if they are not connected."""
    graph = {}
    for l in links:
        graph.setdefault(l.a, []).append((l.b, l))
        graph.setdefault(l.b, []).append((l.a, l))
    best = {src: 0.0}
    prev = {}
    heap = [(0.0, src)]
    while heap:
        d, node = heapq.heappop(heap)
        if d > best.get(node, math.inf):
            continue
        if node == dst:
            break
        for nb, link in sorted(graph.get(node, ()), key=lambda t: t[1].id):
            nd = d + link.cost
            if nd < best.get(nb, math.inf):
                best[nb] = nd
                prev[nb] = (node, link)
                heapq.heappush(heap, (nd, nb))
    if dst not in best:
        return None
    path, node = [], dst
    while node != src:
        node, link = prev[node]
        path.append(link)
    path.reverse()
    return path


def build_routes(links, anchors, free_links=()):
    """
    Returns a list of (route_id, anchor_a, anchor_b, [Link, ...]), one per distinct set of links.
    Two anchor pairs that share the same chain are listed once, under the smaller pair.

    free_links: rail that already exists. A chain may run along it at no cost, but the route lists only
    the links that still have to be built.
    """
    free_ids = {l.id for l in free_links}
    graph_links = list(links) + list(free_links)
    seen = {}
    for a, b in combinations(sorted(anchors), 2):
        path = cheapest_path(graph_links, a, b)
        if path:
            path = [l for l in path if l.id not in free_ids]
        if not path:
            continue
        key = frozenset(l.id for l in path)
        if key not in seen:
            seen[key] = (f"{a}>{b}", a, b, path)
    return sorted(seen.values(), key=lambda r: r[0])
