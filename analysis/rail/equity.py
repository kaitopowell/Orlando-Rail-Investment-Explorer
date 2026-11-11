"""
Who lives near the proposed stations? An equity check on a plan, reported separately from the
commute score (never added to it).

For each plan we take the stations it builds (centers touched by a built link) and find the
census tracts whose centroid is within R km of a station. We then compare those tracts with the
whole four-county region on three measures:
  - households with no vehicle
  - people in poverty (tract poverty rate x tract population)
  - median household income (household-weighted median of tract medians)

R is shown at two values: 0.8 km (the half-mile walking convention) and 2.0 km (the typical
distance from a home to its center in our commute data). Both are assumptions.

Caveats: tract centroids stand in for where people live; a center is one point, not a set of
real stations; poverty uses total population as the base; ACS values have margins of error.
Standard library only.
"""

import csv
import json
import math
from pathlib import Path

RADII_KM = (0.8, 2.0)
KM_PER_DEG_LAT = 111.195


def _project(lon, lat, lat0=28.5):
    return lon * KM_PER_DEG_LAT * math.cos(math.radians(lat0)), lat * KM_PER_DEG_LAT


def polygon_centroid(ring):
    """Area centroid of one ring of (lon, lat); falls back to the vertex mean for degenerate rings."""
    pts = [_project(x, y) for x, y in ring]
    ox, oy = pts[0]                      # work relative to one corner so large coordinates do not lose precision
    pts = [(x - ox, y - oy) for x, y in pts]
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(a) < 1e-12:
        return ox + sum(p[0] for p in pts) / len(pts), oy + sum(p[1] for p in pts) / len(pts)
    return ox + cx / (3 * a), oy + cy / (3 * a)


def load_tracts(geojson_path, population_csv_path):
    """List of tract dicts with projected centroid, households, no-vehicle households, population, etc."""
    pop = {}
    with open(population_csv_path, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            pop[r["GEOID"]] = float(r["B01003_001E"])
    fc = json.loads(Path(geojson_path).read_text(encoding="utf-8"))
    tracts = []
    for f in fc["features"]:
        p = f["properties"]
        x, y = polygon_centroid(f["geometry"]["coordinates"][0])
        tracts.append({
            "geoid": p["GEOID"], "x": x, "y": y,
            "households": p["households"], "hh_no_vehicle": p["hh_no_vehicle"],
            "population": pop.get(p["GEOID"], 0.0),
            "pct_poverty": p["pct_poverty"], "median_income": p["median_income"],
            "small_base": bool(p["small_base"]),
        })
    return tracts


def weighted_median(values_weights):
    """Median of values where each has a weight; None if there is nothing to take a median of."""
    vw = sorted((v, w) for v, w in values_weights if v is not None and w > 0)
    total = sum(w for _, w in vw)
    if total <= 0:
        return None
    half, run = total / 2.0, 0.0
    for v, w in vw:
        run += w
        if run >= half:
            return v
    return vw[-1][0]


def totals(tracts):
    pov = [t for t in tracts if t["pct_poverty"] is not None]
    return {
        "tracts": len(tracts),
        "households": sum(t["households"] for t in tracts),
        "hh_no_vehicle": sum(t["hh_no_vehicle"] for t in tracts),
        "population": sum(t["population"] for t in tracts),
        "poverty_population_base": sum(t["population"] for t in pov),
        "people_in_poverty": sum(t["population"] * t["pct_poverty"] / 100.0 for t in pov),
        "median_income": weighted_median([(t["median_income"], t["households"]) for t in tracts]),
    }


def stations_xy(station_lonlats):
    return [_project(lon, lat) for lon, lat in station_lonlats]


def covered(tracts, station_xy, radius_km):
    if not station_xy:
        return []
    out = []
    for t in tracts:
        for sx, sy in station_xy:
            if math.hypot(t["x"] - sx, t["y"] - sy) <= radius_km:
                out.append(t)
                break
    return out


def summarize(cov, region):
    """Shares of the region covered, and ratios of 'share of the group covered' to 'share of everyone covered'."""
    c = totals(cov)
    share = lambda part, whole: (part / whole) if whole else None
    sh_hh = share(c["households"], region["households"])
    # poverty is only known for some tracts, so compare it with the same tracts' population, not everyone's
    sh_pop_pov = share(c["poverty_population_base"], region["poverty_population_base"])
    sh_zero = share(c["hh_no_vehicle"], region["hh_no_vehicle"])
    sh_pov = share(c["people_in_poverty"], region["people_in_poverty"])
    ratio = lambda a, b: (a / b) if (a is not None and b) else None
    return {
        "tracts": c["tracts"],
        "households": round(c["households"]),
        "share_of_households": sh_hh,
        "share_of_no_vehicle_households": sh_zero,
        "no_vehicle_ratio": ratio(sh_zero, sh_hh),
        "share_of_people_in_poverty": sh_pov,
        "poverty_ratio": ratio(sh_pov, sh_pop_pov),
        "median_income_covered": c["median_income"],
        "median_income_region": region["median_income"],
        "small_base_tracts": sum(1 for t in cov if t["small_base"]),
    }
