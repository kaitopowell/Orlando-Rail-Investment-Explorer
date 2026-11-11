"""
Turn the center-to-center commute table into Pair objects for the scoring engine.

Each center pair becomes up to two Pairs, so the two measures never mix:
  - a Pair with a transit time: the workers who have a transit option today
  - a Pair with transit_min=None: the workers who have none (but can drive)

Pairs inside one center (home == work) are skipped: a rail link between centers
cannot help them (see docs/rail-model-assumptions.md).
"""

import csv
import gzip
from pathlib import Path

from .score import Pair


def _num(text):
    return float(text) if text not in ("", None) else None


def load_pairs(path="data/processed/center_od_baseline.csv.gz"):
    pairs = []
    with gzip.open(Path(path), "rt", newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if int(r["intra_center"]) == 1:
                continue
            transit_jobs = int(r["transit_usable_jobs"])
            car_jobs = int(r["car_usable_jobs"])
            transit_min = _num(r["transit_mean_min"])
            car_min = _num(r["car_mean_min"])
            home, work = r["home_center"], r["work_center"]
            if transit_jobs > 0 and transit_min is not None:
                pairs.append(Pair(home, work, transit_jobs, transit_min, car_min))
            no_transit_jobs = car_jobs - min(transit_jobs, car_jobs)
            if no_transit_jobs > 0 and car_min is not None:
                pairs.append(Pair(home, work, no_transit_jobs, None, car_min))
    return pairs
