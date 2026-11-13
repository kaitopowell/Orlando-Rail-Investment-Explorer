"""
Plain-language usefulness numbers for each scenario and budget, from the same travel times the model uses.

For each commute pair (merged onto stations) with a transit option today:
  rail time  = shortest ride over existing + built links, plus the wait/access overhead
  after      = the faster of today's transit and rail
  saved      = what the plan adds on top of existing SunRail: max(0, transit - rail_plan) - max(0, transit - rail_existing)

Also reported: commuters on any pair (with or without a transit option) for whom rail is newly competitive with
driving, at ratios 1.5 and 2.0. Counting only what existing SunRail does not already offer.

Reported: commuters (jobs on a pair) whose pair saves at least 10, 20 and 30 minutes, and the pairs that
gain the most. Pair times are averages for a center pair, so "commuters" means the workers on that pair.

Standard library only.
"""

import heapq
from collections import defaultdict

THRESHOLDS_MIN = (10, 20, 30)
RATIOS = (1.5, 2.0)         # rail counts as a realistic alternative to driving if rail_time <= ratio * drive_time
TOP_N = 8
MIN_TOP_WORKERS = 300       # a top pair needs at least this many workers, so tiny pairs do not top the list


def all_pairs_minutes(links, nodes):
    """Shortest ride minutes (no overhead) from each node to every reachable node. links: objects with a, b, minutes."""
    graph = defaultdict(list)
    for l in links:
        graph[l.a].append((l.b, l.minutes))
        graph[l.b].append((l.a, l.minutes))
    out = {}
    for src in nodes:
        if src not in graph:
            continue
        best = {src: 0.0}
        queue = [(0.0, src)]
        while queue:
            d, n = heapq.heappop(queue)
            if d > best.get(n, float("inf")):
                continue
            for m, w in graph[n]:
                nd = d + w
                if nd < best.get(m, float("inf")):
                    best[m] = nd
                    heapq.heappush(queue, (nd, m))
        out[src] = best
    return out


def usefulness(pairs, existing_links, built_links, overhead_min):
    """Returns {"commuters_saving": {"10": n, ...}, "top_pairs": [...], "commuters_any": n}."""
    nodes = {p.home for p in pairs if p.transit_min is not None}
    base = all_pairs_minutes(existing_links, nodes)
    plan = all_pairs_minutes(list(existing_links) + list(built_links), nodes)
    counts = {t: 0 for t in THRESHOLDS_MIN}
    any_gain = 0
    gains = []
    total_saved = 0.0
    viable = {r: 0 for r in RATIOS}
    for p in pairs:
        r_plan = plan.get(p.home, {}).get(p.work)
        if r_plan is None:
            continue
        r_plan += overhead_min
        r_base = base.get(p.home, {}).get(p.work)
        r_base = r_base + overhead_min if r_base is not None else float("inf")
        if p.car_min is not None:                       # all pairs, with or without a transit option
            for r in RATIOS:
                if r_plan <= r * p.car_min and not r_base <= r * p.car_min:
                    viable[r] += p.jobs
        if p.transit_min is None:
            continue
        saved = max(0.0, p.transit_min - r_plan) - max(0.0, p.transit_min - r_base)
        if saved <= 0:
            continue
        any_gain += p.jobs
        total_saved += p.jobs * saved
        for t in THRESHOLDS_MIN:
            if saved >= t:
                counts[t] += p.jobs
        gains.append((p.jobs * saved, p, saved, r_plan))
    gains.sort(key=lambda g: (-g[0], g[1].home, g[1].work))
    top = [{"home": p.home, "work": p.work, "workers": p.jobs, "today_min": round(p.transit_min, 1),
            "with_plan_min": round(min(p.transit_min, r), 1), "saved_min": round(s, 1),
            "drive_min": None if p.car_min is None else round(p.car_min, 1)}
           for _, p, s, r in gains if p.jobs >= MIN_TOP_WORKERS][:TOP_N]
    return {"job_minutes_saved": round(total_saved, 1), "commuters_any": any_gain,
            "commuters_saving": {str(t): counts[t] for t in THRESHOLDS_MIN},
            "rail_competitive_with_driving": {str(r): viable[r] for r in RATIOS}, "top_pairs": top}
