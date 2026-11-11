"""
Greedy build order over whole routes instead of single links.

Each candidate is a route (a chain of links between two anchors). At each step we add the
route with the best gain per *new* dollar, where links already built cost nothing, so routes
that share track grow into connected lines. This removes the single-link greedy's blind
spot for benefits that only appear once several links exist (see test_rail_routegreedy.py).

Same rules as greedy.py: ties go to the smaller route id, stop when nothing helps, and stop
at the first best route that would exceed the budget, so any smaller budget is a prefix.

Standard library only.
"""

import math
from dataclasses import dataclass

from .fastgreedy import INF, _contribution


@dataclass(frozen=True)
class RouteStep:
    route_id: str
    new_link_ids: tuple    # links this step actually added (others were already built)
    gain: float
    cost: float            # cost of the new links only
    total_cost: float
    total_score: float


def _add_link(D, n, u, v, w):
    """Update the all-pairs rail-minute table in place for a new link u-v of w minutes."""
    Du, Dv = D[u][:], D[v][:]
    for i in range(n):
        iu, iv = D[i][u] + w, D[i][v] + w
        if iu == INF and iv == INF:
            continue
        row = D[i]
        for j in range(n):
            c = iu + Dv[j]
            c2 = iv + Du[j]
            if c2 < c:
                c = c2
            if c < row[j]:
                row[j] = c


def greedy_routes(routes, budget, pairs, params, measure):
    """
    routes: list of (route_id, anchor_a, anchor_b, [Link, ...]) from routes.build_routes.
    measure: "time_saved" or "newly_connected". Returns a list of RouteStep.
    """
    if measure not in ("time_saved", "newly_connected"):
        raise ValueError(measure)
    for _, _, _, links in routes:
        for l in links:
            if l.cost <= 0:
                raise ValueError(f"link {l.id} must have a positive cost")

    node_set = {p.home for p in pairs} | {p.work for p in pairs}
    for _, _, _, links in routes:
        for l in links:
            node_set |= {l.a, l.b}
    nodes = sorted(node_set)
    idx = {x: i for i, x in enumerate(nodes)}
    n = len(nodes)

    relevant = []
    for p in pairs:
        if p.home == p.work:
            continue
        if measure == "time_saved" and p.transit_min is None:
            continue
        if measure == "newly_connected" and (p.transit_min is not None or p.car_min is None):
            continue
        relevant.append((idx[p.home], idx[p.work], p))

    D = [[INF] * n for _ in range(n)]
    for i in range(n):
        D[i][i] = 0.0
    contrib = [0.0] * len(relevant)
    built_ids = set()
    ov = params.overhead_min

    remaining = sorted(routes, key=lambda r: r[0])
    steps, spent, score = [], 0.0, 0.0

    while remaining:
        best, best_gain, best_ratio, best_new, best_cost = None, 0.0, float("-inf"), None, 0.0
        for route in remaining:
            new = [l for l in route[3] if l.id not in built_ids]
            if not new:
                continue
            cost = sum(l.cost for l in new)
            D2 = [row[:] for row in D]
            for l in new:
                _add_link(D2, n, idx[l.a], idx[l.b], l.minutes)
            gain = 0.0
            for k, (i, j, p) in enumerate(relevant):
                d2 = D2[i][j]
                if d2 < D[i][j]:
                    gain += _contribution(measure, p, d2 + ov, params) - contrib[k]
            ratio = gain / cost
            if ratio > best_ratio + 1e-12:
                best, best_gain, best_ratio, best_new, best_cost = route, gain, ratio, new, cost

        if best is None or best_gain <= 0:
            break
        if spent + best_cost > budget:
            break

        for l in best_new:
            _add_link(D, n, idx[l.a], idx[l.b], l.minutes)
            built_ids.add(l.id)
        for k, (i, j, p) in enumerate(relevant):
            contrib[k] = _contribution(measure, p, D[i][j] + ov, params) if D[i][j] < INF else 0.0
        remaining.remove(best)
        spent += best_cost
        score += best_gain
        steps.append(RouteStep(best[0], tuple(l.id for l in best_new), best_gain, best_cost, spent, score))

    return steps
