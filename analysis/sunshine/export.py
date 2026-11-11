"""Write public/data/sunshine_corridor.geojson from the traced FDOT figure."""
import json
t = json.load(open("analysis/sunshine/trace.json"))
c = [[round(x, 6), round(y, 6)] for x, y in t["coords"]]
c[0] = [-81.30835, 28.4108]            # snap MCO end to the Brightline MCO station
k = t["occc_index"]
SRC = "FDOT Sunshine Corridor TCAR Final Report (2024), Tables 13-15 and map figure"
common = {"kind": "sunshine_corridor", "mode": "rail", "status": "proposed", "source": SRC,
          "geometry_basis": "traced from the FDOT study-area figure and georeferenced to the SunRail/Brightline GTFS lines (about 130 m mean fit error); schematic, not survey data"}
def seg(id_, name, coords, cap_lo, cap_hi, tcar_mi, traced_mi, note):
    return {"type": "Feature", "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {**common, "id": id_, "name": name, "capital_low_musd": cap_lo, "capital_high_musd": cap_hi,
                           "tcar_length_mi": tcar_mi, "traced_length_mi": round(traced_mi, 1), "note": note}}
def stn(id_, name, lonlat, note=""):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": lonlat},
            "properties": {**common, "id": id_, "name": name, "feature": "station", "note": note}}
fs = [
 seg("sunshine_3b", "Sunshine Corridor: MCO to Convention Center (Option 3B)", c[:k+1], 1750, 2400, 11.1, t["mco_to_occc_mi"],
     "TCAR Table 15 length 11.1 mi; traced 11.6 mi"),
 seg("sunshine_3c", "Sunshine Corridor: Convention Center to South I-Drive (Option 3C)", c[k:], 1220, 1740, 6.1, t["occc_to_sid_mi"],
     "TCAR Table 15 lists 17.2 mi, read as cumulative from MCO (17.2 - 11.1 = 6.1); traced 5.4 mi"),
 stn("sunshine_mco", "Orlando International Airport (MCO)", c[0], "Brightline / SunRail connection point"),
 stn("sunshine_occc", "Orange County Convention Center", c[k]),
 stn("sunshine_sid", "South International Drive", c[-1]),
]
json.dump({"type": "FeatureCollection",
           "properties": {"title": "Sunshine Corridor (FDOT TCAR proposal)", "source": SRC,
                          "program_capital_musd": {"low": 3543, "high": 4787, "note": "3A $400M + 3B + 3C + 3D, as published; includes right of way and trainsets"},
                          "not_drawn": ["Option 3A (SunRail to MCO, about 20.6 mi, $400M): no geometry in the figure",
                                        "Option 3D (South I-Drive to Disney Springs, about 0.3 mi, $173-247M): optional, not drawn in the figure"]},
           "features": fs}, open("public/data/sunshine_corridor.geojson", "w"), indent=1)
print("ok", [f["properties"]["id"] for f in fs])
