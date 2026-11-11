"""
Rail cost and speed parameters, each with where it came from.

status: "cited"      -> number taken from a named source (verify it before the report)
        "derived"    -> arithmetic on cited numbers (the arithmetic is shown)
        "assumption" -> a choice we made; it is varied in the sensitivity runs

Costs are millions of dollars per mile, as a (low, high) pair.
See docs/rail-model-assumptions.md for the full discussion.
"""

KM_PER_MILE = 1.609344

# ---- cost per mile ($M), by what the link would run on --------------------------
COST_PER_MILE_M = {
    # SunRail-type passenger corridor that already exists (add track, upgrade)
    "passenger_corridor": (4.4, 10.9),
    # new service on an existing freight right-of-way
    "freight_corridor": (30.9, 51.1),
    # brand-new alignment
    "new_alignment": (119.0, 223.0),
}

COST_SOURCES = {
    "passenger_corridor": {
        "low": ("derived", "MetroPlan Orlando 2050 MTP Appendix H Table H-2, project 60210 "
                           "(double tracking, Maitland to airport): $75.0M / 17.11 mi = $4.38M per mile, 2025 dollars"),
        "high": ("derived", "SunRail Phase 2 South: $187M / 17.2 mi = $10.9M per mile (FTA / Progressive Railroading), "
                            "nominal dollars, year to confirm"),
    },
    "freight_corridor": {
        "low": ("derived", "MetroPlan Table H-2, project 60211 (airport east extension): "
                           "$345.0M / 11.17 mi = $30.9M per mile, 2025 dollars"),
        "high": ("derived", "MetroPlan Table H-2, project 60208 (Orange Blossom Express, Downtown to Zellwood): "
                            "$1,035.0M / 20.25 mi = $51.1M per mile, 2025 dollars"),
    },
    "new_alignment": {
        "low": ("cited", "Eno Center US at-grade average, $119M per mile (dollar year to confirm)"),
        "high": ("cited", "Eno project delivery report, Houston METRO Green Line, $223M per mile"),
    },
}

# MetroPlan project 60217 (Poinciana to Lakeland, $18.0M for 37.28 mi = $0.5M per mile) is
# NOT used: that is far too low to build track, so it is probably a partial or placeholder figure.

# ---- escalation / local complexity ------------------------------------------------
# MetroPlan Appendix P complexity buffer: 0, 25, 50, 75 or 100 percent. 0 = off.
COMPLEXITY_BUFFER = 0.0           # status: cited range, base case chosen by us

# ---- speed ------------------------------------------------------------------------
SPEED_MPH = 20.0                  # assumption; TTI says light rail averages 10 to 30 mph
SPEED_MPH_BOUNDS = (10.0, 30.0)

# ---- how a candidate link is matched to existing rail (all assumptions) ------------
SNAP_KM = 1.5                     # a center must be this close to a rail line to use it
CIRCUITY_CAP = 1.5                # rail path may be at most this much longer than a straight line
PASSENGER_SHARE_MIN = 0.5         # share of path on passenger rail to call a link "passenger corridor"
SHAPE_MATCH_KM = 0.075            # rail within this distance of a SunRail/Brightline route shape is passenger rail
DEFAULT_NEW_CIRCUITY = 1.2        # used only if no corridor links exist to measure it from

# rail features that are not through lines (OSM tags)
SKIP_SERVICE = {"spur", "yard", "siding", "crossover", "wye"}
SKIP_USAGE = {"industrial", "military"}
