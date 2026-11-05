"""
TOY EXAMPLE. NOT REAL DATA. NOT REAL ASSUMPTIONS.

Five stations on a line (A-B-C-D-E) with four candidate rail links. Every number
here was invented so the answer can be checked by hand. Do not reuse any of these
values (overhead, ratio, costs, times) as model assumptions: the real values need
cited sources (see docs/rail-model-assumptions.md).

        A ---AB--- B ---BC--- C ---CD--- D ---DE--- E
 minutes:     5          5          5          5
 cost ($M):  100        200        100        300

A rail trip costs the minutes along the built links plus a fixed overhead
(waiting, getting to and from the station).
"""

from .score import Link, Pair, Params

PARAMS = Params(
    overhead_min=10.0,   # TOY: wait + access for any rail trip
    ratio=2.0,           # TOY: rail counts as competitive if rail time <= ratio * car time
)

LINKS = [
    Link("AB", "A", "B", minutes=5, cost=100),
    Link("BC", "B", "C", minutes=5, cost=200),
    Link("CD", "C", "D", minutes=5, cost=100),
    Link("DE", "D", "E", minutes=5, cost=300),
]

# home -> work, jobs, transit time today (None = no transit option), car time
PAIRS = [
    Pair("A", "B", jobs=40,  transit_min=30,   car_min=10),   # P1
    Pair("B", "C", jobs=50,  transit_min=None, car_min=15),   # P2
    Pair("C", "D", jobs=20,  transit_min=20,   car_min=8),    # P3
    Pair("A", "C", jobs=100, transit_min=60,   car_min=20),   # P4
    Pair("B", "D", jobs=60,  transit_min=70,   car_min=20),   # P5
    Pair("D", "E", jobs=30,  transit_min=12,   car_min=10),   # P6 (rail is slower than today's transit)
    Pair("A", "E", jobs=40,  transit_min=None, car_min=30),   # P7 (needs all four links)
    Pair("C", "E", jobs=80,  transit_min=50,   car_min=25),   # P8
]
