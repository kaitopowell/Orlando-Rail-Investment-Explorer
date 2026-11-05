"""
Scoring: how good is a set of built rail links?

Two separate measures, never added together (see docs/rail-model-assumptions.md):

  time_saved         job-minutes saved, only for pairs that have a transit option today
  newly_connected    jobs on pairs with NO transit option today, where the new rail
                     trip is competitive with driving

Standard library only.
"""

import heapq
from dataclasses import dataclass


@dataclass(frozen=True)
class Link:
    id: str
    a: str
    b: str
    minutes: float    # in-vehicle rail minutes between the two ends
    cost: float       # same units as the budget


@dataclass(frozen=True)
class Pair:
    home: str
    work: str
    jobs: int
    transit_min: float | None   # transit time today; None means no option
    car_min: float | None       # driving time; None means unknown


@dataclass(frozen=True)
class Params:
    overhead_min: float   # wait + access time added to every rail trip
    ratio: float          # rail is "competitive" if rail_time <= ratio * car_time


def rail_minutes(built, home, work, params):
    """Door-to-door rail time between two nodes using only the built links.

    Returns None if there is no path (or if home and work are the same node, which
    the real model treats with a separate rule).
    """
    if home == work:
        return None

    # the rail network is undirected: a link can be ridden either way
    graph = {}
    for link in built:
        graph.setdefault(link.a, []).append((link.b, link.minutes))
        graph.setdefault(link.b, []).append((link.a, link.minutes))

    # Dijkstra's shortest path (the toy graph is tiny, but this scales to the real one)
    best = {home: 0.0}
    queue = [(0.0, home)]
    while queue:
        dist, node = heapq.heappop(queue)
        if node == work:
            return dist + params.overhead_min
        if dist > best.get(node, float("inf")):
            continue
        for nxt, minutes in graph.get(node, []):
            d = dist + minutes
            if d < best.get(nxt, float("inf")):
                best[nxt] = d
                heapq.heappush(queue, (d, nxt))
    return None


def time_saved(built, pairs, params):
    """Job-minutes saved versus today's transit. Pairs with no transit option are skipped."""
    total = 0.0
    for p in pairs:
        if p.transit_min is None:
            continue
        rail = rail_minutes(built, p.home, p.work, params)
        if rail is None:
            continue
        # people use whichever is faster, so rail can only help, never hurt
        total += p.jobs * max(0.0, p.transit_min - rail)
    return total


def newly_connected(built, pairs, params):
    """Jobs on pairs with no transit today that rail makes competitive with driving."""
    total = 0
    for p in pairs:
        if p.transit_min is not None or p.car_min is None:
            continue
        rail = rail_minutes(built, p.home, p.work, params)
        if rail is not None and rail <= params.ratio * p.car_min:
            total += p.jobs
    return total


def report(built, pairs, params):
    """Both measures for one network, side by side."""
    return {
        "time_saved": time_saved(built, pairs, params),
        "newly_connected": newly_connected(built, pairs, params),
    }
