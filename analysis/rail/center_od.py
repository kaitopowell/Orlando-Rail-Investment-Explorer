"""Offline center-level baseline aggregation. Standard library + h3 v4 only."""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import h3

# Display/analysis assumptions, not calibrated findings or competitiveness rules.
ASSIGN_MAX_KM = 5
ASSIGN_RADII_KM = (3, 5, 8)
TRANSIT_MAX_MIN = 120
CAR_MAX_MIN = 60
RESOLUTION = 8
LARGE_FLOW_JOBS = 50
TOP_PAIR_COUNT = 20
CONCENTRATION_PAIR_COUNT = 100
MEAN_DECIMALS = 6
# Reference invariants, not tunable assumptions.
EXPECTED_PAIRS = 591_177
EXPECTED_JOBS = 1_006_088
EXPECTED_NO_CAR_HOME = 66
EXPECTED_NO_CAR_WORK = 32
EXPECTED_EXCLUDED_JOBS = 3_863
BASELINE_SHA256 = '2544ef1fdefae60565d1ca1c0b8ca093292b8b7cb31237f7132594e3a1237c33'
ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / 'data/processed/baseline_travel_times.csv.gz'
CENTERS = ROOT / 'data/processed/candidate_centers.geojson'
OUTPUT_DIR = ROOT / 'data/processed'
GROUPS = ('assigned_both', 'home_only', 'work_only', 'unassigned')
OD_FIELDS = ('home_center', 'work_center', 'intra_center', 'pair_count', 'jobs',
             'excluded_pair_count', 'excluded_jobs', 'transit_usable_jobs',
             'transit_mean_min', 'car_usable_jobs', 'car_mean_min')


@dataclass(frozen=True)
class Flow:
    home: str
    work: str
    jobs: int
    transit: float | None
    car: float | None


@dataclass(frozen=True)
class Center:
    id: str
    lat: float
    lon: float
    members: tuple[str, ...]


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def cell(value):
    if not isinstance(value, str) or not h3.is_valid_cell(value) or h3.get_resolution(value) != RESOLUTION:
        raise ValueError(f'Invalid resolution-{RESOLUTION} H3 ID: {value!r}')
    return value


def read_centers(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if data.get('type') != 'FeatureCollection' or not data.get('features'):
        raise ValueError('Expected nonempty center FeatureCollection')
    centers, ids, members = [], set(), set()
    for feature in data['features']:
        p, g = feature['properties'], feature['geometry']
        if feature.get('type') != 'Feature' or g.get('type') != 'Point':
            raise ValueError('Center geometry must be Point')
        coordinates = g['coordinates']
        if len(coordinates) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in coordinates):
            raise ValueError('Invalid center coordinates')
        lon, lat = coordinates
        if not -180 <= lon <= 180 or not -90 <= lat <= 90:
            raise ValueError('Center coordinate outside WGS84')
        id_ = p['id']
        if not isinstance(id_, str) or not id_ or id_ in ids:
            raise ValueError('Missing or duplicate center ID')
        ids.add(id_)
        if not isinstance(p['hexagons'], list) or not p['hexagons'] or len(p['hexagons']) != p['hexagon_count']:
            raise ValueError('Invalid center membership')
        for member in p['hexagons']:
            cell(member)
            if member in members:
                raise ValueError('Duplicate center member')
            members.add(member)
        centers.append(Center(id_, lat, lon, tuple(sorted(p['hexagons']))))
    return sorted(centers, key=lambda c: c.id)


def parse_time(value):
    if value == '':
        return None
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError(f'Invalid time: {value!r}')
    return result


def read_baseline(path):
    rows, pairs, cells = [], set(), set()
    with gzip.open(path, 'rt', encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ['h_hex', 'w_hex', 'S000', 'transit_min', 'car_min']:
            raise ValueError(f'Unexpected baseline columns: {reader.fieldnames}')
        for row in reader:
            home, work = row['h_hex'], row['w_hex']
            for id_ in (home, work):
                if id_ not in cells:
                    cell(id_)
                    cells.add(id_)
            if (home, work) in pairs:
                raise ValueError(f'Duplicate baseline pair: {home}, {work}')
            pairs.add((home, work))
            jobs = int(row['S000'])
            if jobs <= 0:
                raise ValueError('Baseline jobs must be positive integers')
            rows.append(Flow(home, work, jobs, parse_time(row['transit_min']), parse_time(row['car_min'])))
    return sorted(rows, key=lambda row: (row.home, row.work))


def no_car_roles(rows):
    """Use nonblank returned car times, including values above the cutoff."""
    homes, works, present_homes, present_works = set(), set(), set(), set()
    for row in rows:
        homes.add(row.home)
        works.add(row.work)
        if row.car is not None:
            present_homes.add(row.home)
            present_works.add(row.work)
    return homes - present_homes, works - present_works


def nearest_centers(cells, centers):
    """Cache nearest centroid once; member ownership always overrides distance."""
    if not centers or len({c.id for c in centers}) != len(centers):
        raise ValueError('Centers must be nonempty with unique IDs')
    owners = {}
    for center in centers:
        for member in center.members:
            if member in owners:
                raise ValueError('Duplicate center member')
            owners[member] = center.id
    result = {}
    for id_ in sorted(cells):
        if id_ in owners:
            result[id_] = (owners[id_], 0.0)
        else:
            position = h3.cell_to_latlng(cell(id_))
            distance, center_id = min((h3.great_circle_distance(position, (c.lat, c.lon), unit='km'), c.id) for c in centers)
            result[id_] = (center_id, distance)
    return result


def assignments(nearest, radius):
    if not math.isfinite(radius) or radius < 0:
        raise ValueError('Assignment radius must be finite and nonnegative')
    return {cell_id: center_id if distance <= radius else None
            for cell_id, (center_id, distance) in nearest.items()}


def bucket():
    return dict(pair_count=0, jobs=0, excluded_pair_count=0, excluded_jobs=0,
                transit_usable_jobs=0, transit_weighted_minutes=0.0,
                car_usable_jobs=0, car_weighted_minutes=0.0)


def add(bucket_, row, excluded):
    bucket_['pair_count'] += 1
    bucket_['jobs'] += row.jobs
    if excluded:
        bucket_['excluded_pair_count'] += 1
        bucket_['excluded_jobs'] += row.jobs
        return
    for mode, limit in (('transit', TRANSIT_MAX_MIN), ('car', CAR_MAX_MIN)):
        time = getattr(row, mode)
        if time is not None and time <= limit:
            bucket_[mode + '_usable_jobs'] += row.jobs
            bucket_[mode + '_weighted_minutes'] += row.jobs * time


def finalized(bucket_):
    result = dict(bucket_)
    for mode in ('transit', 'car'):
        weighted = result.pop(mode + '_weighted_minutes')
        count = result[mode + '_usable_jobs']
        result[mode + '_mean_min'] = round(weighted / count, MEAN_DECIMALS) if count else None
    return result


def reconcile(groups, expected_pairs, expected_jobs):
    if sum(g['pair_count'] for g in groups.values()) != expected_pairs or sum(g['jobs'] for g in groups.values()) != expected_jobs:
        raise ValueError('Reconciliation failed: assigned and unassigned pairs/jobs do not match baseline')


def aggregate(rows, mapping, no_car_home, no_car_work, expected_pairs, expected_jobs):
    groups = {name: bucket() for name in GROUPS}
    pairs = defaultdict(bucket)
    active_ends = set()
    for row in sorted(rows, key=lambda row: (row.home, row.work)):
        home, work = mapping[row.home], mapping[row.work]
        active_ends.update(id_ for id_ in (home, work) if id_ is not None)
        group = 'assigned_both' if home is not None and work is not None else 'home_only' if home is not None else 'work_only' if work is not None else 'unassigned'
        excluded = row.home in no_car_home or row.work in no_car_work
        add(groups[group], row, excluded)
        if group == 'assigned_both':
            add(pairs[home, work], row, excluded)
    reconcile(groups, expected_pairs, expected_jobs)
    result = [dict(home_center=home, work_center=work, intra_center=home == work, **finalized(values))
              for (home, work), values in sorted(pairs.items())]
    for field in ('pair_count', 'jobs', 'excluded_pair_count', 'excluded_jobs', 'transit_usable_jobs', 'car_usable_jobs'):
        if sum(row[field] for row in result) != groups['assigned_both'][field]:
            raise ValueError(f'Center-pair aggregation does not reconcile: {field}')
    return result, {name: finalized(b) for name, b in groups.items()}, active_ends


def summarize(radius, pairs, groups, center_ids, active_ends):
    jobs = sum(g['jobs'] for g in groups.values())
    assigned = groups['assigned_both']['jobs']
    intra = sum(row['jobs'] for row in pairs if row['intra_center'])
    ranked = sorted(pairs, key=lambda row: (-row['jobs'], row['home_center'], row['work_center']))
    pair_ends = {row[field] for row in pairs for field in ('home_center', 'work_center')}
    return dict(assign_max_km=radius,
                groups={name: dict(values, share_jobs=values['jobs'] / jobs) for name, values in groups.items()},
                center_pair_count=len(pairs), center_pairs_at_least_50_jobs=sum(row['jobs'] >= LARGE_FLOW_JOBS for row in pairs),
                intra_center_jobs=intra, intra_center_share_all_jobs=intra / jobs,
                intra_center_share_assigned_jobs=intra / assigned if assigned else None,
                top_100_share_assigned_jobs=sum(row['jobs'] for row in ranked[:CONCENTRATION_PAIR_COUNT]) / assigned if assigned else None,
                centers_without_assigned_pair_flows=sorted(center_ids - pair_ends),
                centers_without_any_endpoint_flows=sorted(center_ids - active_ends))


def write_csv(path, fields, rows, compressed=False):
    buffer = io.StringIO(newline='')
    writer = csv.DictWriter(buffer, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    for row in rows:
        writer.writerow({key: int(value) if isinstance(value, bool) else value for key, value in row.items()})
    content = buffer.getvalue().encode('utf-8')
    if compressed:
        with Path(path).open('wb') as stream:
            with gzip.GzipFile(fileobj=stream, mode='wb', filename='', mtime=0) as zipped:
                zipped.write(content)
    else:
        Path(path).write_bytes(content)


def run(baseline=BASELINE, centers_path=CENTERS, output_dir=OUTPUT_DIR):
    baseline, centers_path, output_dir = Path(baseline), Path(centers_path), Path(output_dir)
    protected = [baseline, centers_path, ROOT / 'data/processed/candidate_connections.geojson',
                 ROOT / 'data/processed/candidate_connections_summary.json', ROOT / 'data/CANDIDATE_CONNECTIONS_CONTRACT.md',
                 ROOT / 'data/BASELINE_TRAVEL_TIMES_CONTRACT.md']
    before = {str(path): sha256(path) for path in protected}
    if before[str(baseline)] != BASELINE_SHA256:
        raise ValueError('Baseline SHA-256 mismatch; no output written')
    centers, rows = read_centers(centers_path), read_baseline(baseline)
    if len(rows) != EXPECTED_PAIRS or sum(row.jobs for row in rows) != EXPECTED_JOBS:
        raise ValueError('Baseline reference pair/job totals do not match')
    no_home, no_work = no_car_roles(rows)
    excluded = [row for row in rows if row.home in no_home or row.work in no_work]
    if (len(no_home), len(no_work), sum(row.jobs for row in excluded)) != (EXPECTED_NO_CAR_HOME, EXPECTED_NO_CAR_WORK, EXPECTED_EXCLUDED_JOBS):
        raise ValueError('No-car role lists or excluded jobs differ from documented reference')
    nearest = nearest_centers({id_ for row in rows for id_ in (row.home, row.work)}, centers)
    summary = dict(parameters_assumptions=dict(ASSIGN_MAX_KM=ASSIGN_MAX_KM, ASSIGN_RADII_KM=ASSIGN_RADII_KM,
                   TRANSIT_MAX_MIN=TRANSIT_MAX_MIN, CAR_MAX_MIN=CAR_MAX_MIN, RESOLUTION=RESOLUTION,
                   LARGE_FLOW_JOBS=LARGE_FLOW_JOBS, TOP_PAIR_COUNT=TOP_PAIR_COUNT,
                   CONCENTRATION_PAIR_COUNT=CONCENTRATION_PAIR_COUNT, MEAN_DECIMALS=MEAN_DECIMALS),
                   h3_version=h3.__version__, sources={path.name: before[str(path)] for path in protected},
                   input_pairs=len(rows), input_jobs=sum(row.jobs for row in rows), center_count=len(centers),
                   membership_count=sum(len(c.members) for c in centers),
                   exclusions=dict(home_cells=sorted(no_home), work_cells=sorted(no_work),
                       home_count=len(no_home), work_count=len(no_work), distinct_count=len(no_home | no_work),
                       overlap_count=len(no_home & no_work), pair_count=len(excluded), jobs=sum(row.jobs for row in excluded)),
                   scenarios=[])
    unassigned, main = [], None
    center_ids = {c.id for c in centers}
    for radius in ASSIGN_RADII_KM:
        pairs, groups, active = aggregate(rows, assignments(nearest, radius), no_home, no_work, EXPECTED_PAIRS, EXPECTED_JOBS)
        summary['scenarios'].append(summarize(radius, pairs, groups, center_ids, active))
        for name, category in (('work_only', 'home_unassigned'), ('home_only', 'work_unassigned'), ('unassigned', 'both_unassigned')):
            unassigned.append(dict(assign_max_km=radius, category=category,
                                  **{field: groups[name][field] for field in ('pair_count', 'jobs', 'excluded_pair_count', 'excluded_jobs')}))
        if radius == ASSIGN_MAX_KM:
            main = pairs
    if main is None:
        raise ValueError('Default radius must be in sensitivity grid')
    top = sorted(main, key=lambda row: (-row['jobs'], row['home_center'], row['work_center']))[:TOP_PAIR_COUNT]
    summary['default_top_20_pairs'] = [dict(row, transit_option_share=row['transit_usable_jobs'] / row['jobs']) for row in top]
    summary['default_top_20_transit_option_share'] = sum(row['transit_usable_jobs'] for row in top) / sum(row['jobs'] for row in top) if top else None
    if before != {str(path): sha256(path) for path in protected}:
        raise ValueError('A protected input changed during analysis; no output written')
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output_dir) as temporary:
        temporary = Path(temporary)
        write_csv(temporary / 'center_od_baseline.csv.gz', OD_FIELDS, main, compressed=True)
        write_csv(temporary / 'center_od_unassigned.csv', ('assign_max_km', 'category', 'pair_count', 'jobs', 'excluded_pair_count', 'excluded_jobs'), sorted(unassigned, key=lambda row: (row['assign_max_km'], row['category'])))
        (temporary / 'center_od_sensitivity.json').write_text(json.dumps(summary, indent=2, sort_keys=True, allow_nan=False) + '\n', encoding='utf-8')
        for path in sorted(temporary.iterdir()):
            path.replace(output_dir / path.name)
    print(json.dumps({key: summary[key] for key in ('input_pairs', 'input_jobs', 'center_count', 'scenarios')}, indent=2))
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()
    run(output_dir=args.output_dir)
