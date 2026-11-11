"""
Same greedy rule as greedy.py, fast enough for the real network (146 centers, ~38k pairs).

greedy.py rebuilds the network and re-runs a shortest-path search for every pair, for
every candidate link, at every step. That is fine for the toy and far too slow here.
This version keeps a table of the shortest rail minutes between every pair of centers
and updates it when a link is added:

    new[i][j] = min(old[i][j], old[i][u] + w + old[v][j], old[i][v] + w + old[u][j])

for a new link u-v of w minutes. It must give exactly the same answers as score.py and
greedy.py; test_rail_fastgreedy.py checks that. Standard library only.
"""

import math

from .greedy import Step

INF = math.inf


def _contribution(measure, p, rail_min, params):
    """What one pair adds to the objective when its rail time (incl. overhead) is rail_min."""
    if measure == "time_saved":
        if p.transit_min is None:
            return 0.0
        return p.jobs * max(0.0, p.transit_min - rail_min)
    if p.transit_min is not None or p.car_min is None:
        return 0.0
    return float(p.jobs) if rail_min <= params.ratio * p.car_min else 0.0


def greedy_fast(links, budget, pairs, params, measure):
    """measure is "time_saved" or "newly_connected". Returns a list of greedy.Step."""
    for link in links:
        if link.cost <= 0:
            raise ValueError(f"link {link.id} must have a positive cost")
    if measure not in ("time_saved", "newly_connected"):
        raise ValueError(measure)

    nodes = sorted({l.a for l in links} | {l.b for l in links} | {p.home for p in pairs} | {p.work for p in pairs})
    idx = {n: i for i, n in enumerate(nodes)}
    n = len(nodes)

    # only pairs that can ever contribute, as (i, j, pair)
    relevant = []
    for p in pairs:
        if p.home == p.work:
            continue
        if measure == "time_saved" and p.transit_min is None:
            continue
        if measure == "newly_connected" and (p.transit_min is not None or p.car_min is None):
            continue
        relevant.append((idx[p.home], idx[p.work], p))

    D = [[INF] * n for _ in range(n)]            # shortest in-vehicle rail minutes, built links only
    for i in range(n):
        D[i][i] = 0.0
    contrib = [0.0] * len(relevant)               # each pair's current contribution (no link built: zero)

    remaining = sorted(links, key=lambda l: l.id)
    steps, spent, score = [], 0.0, 0.0
    ov = params.overhead_min

    while remaining:
        best, best_gain, best_ratio = None, 0.0, float("-inf")
        for link in remaining:
            u, v, w = idx[link.a], idx[link.b], link.minutes
            Du, Dv = D[u], D[v]
            gain = 0.0
            for k, (i, j, p) in enumerate(relevant):
                d = D[i][j]
                via = D[i][u] + w + Dv[j]
                alt = D[i][v] + w + Du[j]
                if alt < via:
                    via = alt
                if via < d:
                    gain += _contribution(measure, p, via + ov, params) - contrib[k]
            ratio = gain / link.cost
            if ratio > best_ratio + 1e-12:
                best, best_gain, best_ratio = link, gain, ratio

        if best is None or best_gain <= 0:
            break
        if spent + best.cost > budget:
            break

        # add the link: update the full table, then each pair's current contribution
        u, v, w = idx[best.a], idx[best.b], best.minutes
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
        for k, (i, j, p) in enumerate(relevant):
            contrib[k] = _contribution(measure, p, D[i][j] + ov, params) if D[i][j] < INF else 0.0

        remaining.remove(best)
        spent += best.cost
        score += best_gain
        steps.append(Step(best.id, best_gain, best.cost, spent, score))

    return steps
