# analysis/rail/baseline_times.py
# Door-to-door travel times (existing transit and driving) between hexagons that have
# commuters. Progress is saved per batch, so an interrupted run can resume.

import csv
import datetime
import io
import json
import os
import time
import zipfile
from pathlib import Path

# ---- inputs ----
# clipped to a box around the hexagons: -82.1577,27.4431,-80.6732,29.4605
OSM_PBF = Path("data/raw/osm/orlando-region.osm.pbf")
GTFS_FILES = [
    Path("data/raw/gtfs/lynx.zip"),        # file dated 2026-10-16
    Path("data/raw/gtfs/sunrail.zip"),     # file dated 2026-10-13
    Path("data/raw/gtfs/brightline.zip"),  # file dated 2026-10-13
]
FLOWS = next(
    (p for p in [Path("data/processed/lodes_od_hex8_2023.csv.gz"),
                 Path("data/processed/lodes_od_hex8_2023.csv")] if p.exists()),
    Path("data/processed/lodes_od_hex8_2023.csv.gz"),
)
OUT = Path("data/processed/baseline_travel_times.csv.gz")

# ---- assumptions (document these) ----
DEPARTURE = datetime.datetime(2026, 11, 4, 8, 0)   # a Wednesday morning peak, inside all three feeds
MAX_TIME = datetime.timedelta(minutes=120)         # transit trips longer than this count as "no option"
CAR_MAX_TIME = datetime.timedelta(minutes=60)      # driving search cap; longer drives are left blank

# ---- run settings ----
CHUNK = 50                    # origins per batch (one saved file per batch)
SAMPLE_ORIGINS = 20           # random test sample; set to None for the full run
SAMPLE_SEED = 1               # same seed as the earlier test, so timings are comparable
RESTRICT_DESTINATIONS = True  # only route to the work hexagons each batch needs

CHUNK_DIR = Path("data/processed/baseline_chunks_test" if SAMPLE_ORIGINS else "data/processed/baseline_chunks")


def gtfs_date_range(path):
    """First and last service date from a GTFS zip's calendar.txt, or None if it has none."""
    with zipfile.ZipFile(path) as z:
        if "calendar.txt" not in z.namelist():
            return None
        rows = list(csv.DictReader(io.TextIOWrapper(z.open("calendar.txt"), "utf-8-sig")))
    return min(r["start_date"] for r in rows), max(r["end_date"] for r in rows)


# 0. make sure Java can be found (the usual Colab install location)
colab_java = "/usr/lib/jvm/java-21-openjdk-amd64"
if "JAVA_HOME" not in os.environ and os.path.isdir(colab_java):
    os.environ["JAVA_HOME"] = colab_java

# 1. make sure every input exists
missing = [str(p) for p in [OSM_PBF, FLOWS, *GTFS_FILES] if not p.exists()]
if missing:
    raise SystemExit("Missing input files:\n  " + "\n  ".join(missing))

import geopandas as gpd
import h3
import pandas as pd
import r5py
from shapely.geometry import Point

# 2. check the departure date is covered by each schedule feed
day = DEPARTURE.strftime("%Y%m%d")
for g in GTFS_FILES:
    rng = gtfs_date_range(g)
    print(g.name, "service dates:", rng if rng else "no calendar.txt, cannot check")
    if rng and not (rng[0] <= day <= rng[1]):
        raise SystemExit(f"DEPARTURE {day} is outside {g.name}'s dates {rng}; change DEPARTURE")

# 3. hexagon center points; origins are hexagons where people live, destinations where they work
flows = pd.read_csv(FLOWS, dtype={"h_hex": str, "w_hex": str})
total_jobs, total_pairs = int(flows["S000"].sum()), len(flows)
print("flows:", total_pairs, "pairs |", total_jobs, "jobs")

hexes = sorted(set(flows["h_hex"]) | set(flows["w_hex"]))
points = gpd.GeoDataFrame(
    {"id": hexes,
     # h3 gives (lat, lng); shapely wants (lng, lat), so reverse it
     "geometry": [Point(h3.cell_to_latlng(h)[::-1]) for h in hexes]},
    crs="EPSG:4326",
)
origins = points[points["id"].isin(set(flows["h_hex"]))]
if SAMPLE_ORIGINS:
    origins = origins.sample(SAMPLE_ORIGINS, random_state=SAMPLE_SEED).sort_values("id")
print(len(points), "hexagons |", len(origins), "origins this run")

# 4. refuse to mix batches made with different settings
CHUNK_DIR.mkdir(parents=True, exist_ok=True)
config = {"departure": str(DEPARTURE), "max_time_min": MAX_TIME.total_seconds() / 60,
          "car_max_min": CAR_MAX_TIME.total_seconds() / 60,
          "chunk": CHUNK, "sample": SAMPLE_ORIGINS, "seed": SAMPLE_SEED,
          "restrict": RESTRICT_DESTINATIONS, "osm": OSM_PBF.name, "pairs": total_pairs}
cfg_file = CHUNK_DIR / "run_config.json"
if cfg_file.exists():
    if json.loads(cfg_file.read_text()) != config:
        raise SystemExit(f"Settings changed since the batches in {CHUNK_DIR} were made. Delete that folder to start fresh.")
else:
    cfg_file.write_text(json.dumps(config, indent=2))

# 5. build the routing network
t0 = time.time()
network = r5py.TransportNetwork(OSM_PBF, [str(g) for g in GTFS_FILES])
print("network built in", round(time.time() - t0), "seconds")

pairs = flows[["h_hex", "w_hex", "S000"]].rename(columns={"h_hex": "from_id", "w_hex": "to_id"})


def run(modes, label, origin_chunk, dests, **extra):
    """Travel times (minutes) from these origins to these destinations; unreachable pairs are absent."""
    ttm = r5py.TravelTimeMatrix(
        network, origins=origin_chunk, destinations=dests, transport_modes=modes,
        departure=DEPARTURE, max_time=MAX_TIME, snap_to_network=True, **extra,
    )
    ttm = ttm.rename(columns={"travel_time": label})   # travel_time is already minutes (float)
    return ttm[["from_id", "to_id", label]]


# 6. one saved file per batch of origins
n_chunks = -(-len(origins) // CHUNK)
done_times = []
for n in range(n_chunks):
    f = CHUNK_DIR / f"chunk_{n:05d}.csv.gz"
    if f.exists():
        print("batch", n + 1, "of", n_chunks, "already done, skipping")
        continue

    chunk = origins.iloc[n * CHUNK:(n + 1) * CHUNK]
    block = pairs[pairs["from_id"].isin(chunk["id"])]
    dests = points[points["id"].isin(block["to_id"].unique())] if RESTRICT_DESTINATIONS else points

    t = time.time()
    transit = run([r5py.TransportMode.TRANSIT], "transit_min", chunk, dests)
    t_transit = time.time() - t
    t = time.time()
    car = run([r5py.TransportMode.CAR], "car_min", chunk, dests, max_time_driving=CAR_MAX_TIME)
    t_car = time.time() - t

    block = block.merge(transit, on=["from_id", "to_id"], how="left").merge(car, on=["from_id", "to_id"], how="left")
    block.to_csv(f, index=False)

    done_times.append(t_transit + t_car)
    left = n_chunks - n - 1
    print(f"batch {n + 1}/{n_chunks}: transit {t_transit:.0f}s, car {t_car:.0f}s, {len(chunk)} origins, "
          f"{len(dests)} destinations | about {left * sum(done_times) / len(done_times) / 60:.0f} min left")

# 7. combine all batches and report
parts = sorted(CHUNK_DIR.glob("chunk_*.csv.gz"))
result = pd.concat([pd.read_csv(p, dtype={"from_id": str, "to_id": str}) for p in parts], ignore_index=True)
result = result.rename(columns={"from_id": "h_hex", "to_id": "w_hex"})

print(result[["transit_min", "car_min"]].describe())
jobs = int(result["S000"].sum())
print("pairs:", len(result), "| jobs:", jobs)
print("pairs with a transit time:", result["transit_min"].notna().sum(), "| with a car time:", result["car_min"].notna().sum())
print("jobs with a transit time:", int(result.loc[result["transit_min"].notna(), "S000"].sum()), "of", jobs)
print("jobs with a car time:", int(result.loc[result["car_min"].notna(), "S000"].sum()), "of", jobs)
same = result["h_hex"] == result["w_hex"]
print("home and work in the same hexagon:", same.sum(), "pairs,", int(result.loc[same, "S000"].sum()), "jobs")

if SAMPLE_ORIGINS is None:
    # a full run must account for every commute pair and job
    assert len(result) == total_pairs, "pair count does not match the flows file"
    assert jobs == total_jobs, "job count does not match the flows file"
    print("reconciles with the flows file")
    result.to_csv(OUT, index=False)
    print("saved", OUT)
    try:
        from google.colab import files
        files.download(str(OUT))
    except ImportError:
        pass
else:
    print("test sample only; nothing written to", OUT)