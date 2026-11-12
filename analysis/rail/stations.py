"""Existing passenger-rail stations (SunRail + Brightline GTFS) and how model centers relate to them.

Writes data/processed/rail_stations.csv and data/processed/center_station_map.csv.
Centers are demand centroids, not station sites, so each center is matched to its nearest
existing station; within SNAP_STATION_KM the plan will use the station as the node.
"""
import csv, json, math, sys
SNAP_STATION_KM = 3.0                       # assumption: a center this close is served by that station
BBOX = (28.2, 28.95, -81.75, -81.0)         # lat_min, lat_max, lon_min, lon_max (study area)
HUB_OVERRIDES = {"Downtown Orlando": "LYNX Central"}   # downtown's hub is LYNX Central by definition
KX = 111.32 * math.cos(math.radians(28.5)); KY = 110.57

def km(a, b):  # a, b = (lat, lon)
    return math.hypot((a[1] - b[1]) * KX, (a[0] - b[0]) * KY)

def load_stations(sunrail_stops, brightline_stops):
    out = []
    for path, system in ((sunrail_stops, "sunrail"), (brightline_stops, "brightline")):
        for r in csv.DictReader(open(path, encoding="utf-8-sig")):
            la, lo = float(r["stop_lat"]), float(r["stop_lon"])
            if BBOX[0] < la < BBOX[1] and BBOX[2] < lo < BBOX[3]:
                out.append({"name": r["stop_name"], "system": system, "lat": la, "lon": lo})
    return out

def match_centers(centers, stations):
    rows = []
    for c in centers:
        best = min(stations, key=lambda s: km((c["lat"], c["lon"]), (s["lat"], s["lon"])))
        if c["name"] in HUB_OVERRIDES:
            best = next(s for s in stations if s["name"] == HUB_OVERRIDES[c["name"]])
        d = km((c["lat"], c["lon"]), (best["lat"], best["lon"]))
        rows.append({"center_id": c["id"], "center": c["name"], "station": best["name"], "system": best["system"],
                     "km": round(d, 2), "snapped": d <= SNAP_STATION_KM or c["name"] in HUB_OVERRIDES})
    return rows

def main(plan="public/data/rail_plan.json", sun="/tmp/g/s/stops.txt", bri="/tmp/g/b/stops.txt"):
    stations = load_stations(sun, bri)
    centers = json.load(open(plan))["centers"]
    rows = match_centers(centers, stations)
    with open("data/processed/rail_stations.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["name", "system", "lat", "lon"]); w.writeheader(); w.writerows(stations)
    with open("data/processed/center_station_map.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    return stations, rows

if __name__ == "__main__":
    st, rows = main(*sys.argv[1:])
    print(len(st), "stations;", sum(r["snapped"] for r in rows), "of", len(rows), "centers within", SNAP_STATION_KM, "km")
