"""
Group a plan's links into a handful of lines, the way a transit map is drawn.

1. Start from the busiest unassigned link and extend it at both ends along the straightest
   unassigned continuation (turns sharper than MAX_TURN_DEG are not allowed), so each line
   runs through rather than zigzags.
2. A short line (fewer than MIN_TRUNK segments) that hangs off a longer line becomes a branch of it
   instead of a line of its own; it is repeated until nothing more attaches.

Standard library only.
"""

import math
from collections import defaultdict

MAX_TURN_DEG = 75
MIN_TRUNK = 3          # segments; shorter pieces are branches when they touch a longer line
KX = 111.32 * math.cos(math.radians(28.5))
KY = 110.57


def _turn(pos, a, b, c):
    v1 = ((pos[b][0] - pos[a][0]) * KX, (pos[b][1] - pos[a][1]) * KY)
    v2 = ((pos[c][0] - pos[b][0]) * KX, (pos[c][1] - pos[b][1]) * KY)
    return abs(math.degrees(math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1])))


def straight_paths(edges, pos):
    """edges: {frozenset({a, b}): weight}. Returns paths (lists of nodes) that cover every edge once."""
    adj = defaultdict(set)
    for e in edges:
        a, b = tuple(e)
        adj[a].add(b)
        adj[b].add(a)
    free = set(edges)
    paths = []
    while free:
        e0 = max(free, key=lambda e: (edges[e], sorted(e)))
        path = sorted(e0)
        free.discard(e0)
        for end in (0, 1):
            while True:
                tail, prev = (path[-1], path[-2]) if end == 0 else (path[0], path[1])
                cands = [n for n in adj[tail] if frozenset((tail, n)) in free and n not in path
                         and _turn(pos, prev, tail, n) < MAX_TURN_DEG]
                if not cands:
                    break
                n = min(cands, key=lambda n: (_turn(pos, prev, tail, n), n))
                free.discard(frozenset((tail, n)))
                path.append(n) if end == 0 else path.insert(0, n)
        paths.append(path)
    return paths


def group_lines(edges, pos, min_trunk=MIN_TRUNK):
    """Returns a list of lines: {"main": [nodes], "branches": [[nodes], ...]}, longest first."""
    paths = sorted(straight_paths(edges, pos), key=lambda p: (-len(p), p))
    lines = [{"main": p, "branches": []} for p in paths if len(p) - 1 >= min_trunk]
    stubs = [p for p in paths if len(p) - 1 < min_trunk]
    changed = True
    while stubs and changed:
        changed = False
        rest = []
        for s in stubs:
            host = None
            for ln in lines:
                nodes = set(ln["main"]).union(*ln["branches"]) if ln["branches"] else set(ln["main"])
                if nodes & set(s):
                    host = ln
                    break
            if host is not None:
                host["branches"].append(s)
                changed = True
            else:
                rest.append(s)
        stubs = rest
    for s in stubs:                       # nothing to hang off: it stands alone
        lines.append({"main": s, "branches": []})
    return lines
