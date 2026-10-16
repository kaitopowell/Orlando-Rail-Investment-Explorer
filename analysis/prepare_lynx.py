"""Offline publication of supplied LYNX stop measures; no schedule recomputation."""
import collections
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/processed/lynx_stops_peak_headway.geojson'
OUTPUT = ROOT / 'public/data/lynx_stops.geojson'
ZIP = ROOT / 'data/raw/lynx_gtfs_2026-10-16.zip'
SHA1 = '951d151b999633151eba05207b7ca245e6f9f21c'
COUNTIES = {'Lake', 'Orange', 'Osceola', 'Seminole'}
PROPERTIES = ('stop_id', 'stop_name', 'county', 'route_short_name', 'route_long_name',
              'n_dep', 'headway_best_route_min', 'headway_combined_min', 'freq15', 'freq30',
              'n_dep_best_nonlymmo', 'headway_best_nonlymmo_min', 'freq15_nl', 'freq20_nl', 'freq30_nl')


def bounds():
    data = json.loads((ROOT / 'public/data/counties.geojson').read_text())
    points = []
    for f in data['features']:
        g = f['geometry']
        polygons = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        points.extend(p for poly in polygons for ring in poly for p in ring)
    return min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)


def prepare(source):
    west, south, east, north = bounds()
    seen, features = set(), []
    if source.get('type') != 'FeatureCollection':
        raise ValueError('Expected a FeatureCollection')
    for f in source['features']:
        p = {key: f['properties'][key] for key in PROPERTIES}
        if not isinstance(p['stop_id'], str) or not p['stop_id'].strip() or p['stop_id'] in seen:
            raise ValueError('Invalid or duplicate string stop_id')
        seen.add(p['stop_id'])
        if p['county'] not in COUNTIES or f['geometry']['type'] != 'Point':
            raise ValueError('Invalid county or geometry')
        xy = f['geometry']['coordinates']
        if len(xy) != 2 or not all(math.isfinite(v) for v in xy):
            raise ValueError('Invalid coordinates')
        lon, lat = [round(v, 5) for v in xy]
        if not (west <= lon <= east and south <= lat <= north):
            raise ValueError('Stop outside four-county bounding box')
        for key in ('headway_best_route_min', 'headway_combined_min', 'headway_best_nonlymmo_min'):
            if p[key] is not None and (not math.isfinite(p[key]) or p[key] <= 0):
                raise ValueError('Headway must be positive or null')
        for key in ('n_dep', 'n_dep_best_nonlymmo'):
            if not math.isfinite(p[key]) or p[key] < 0 or int(p[key]) != p[key]:
                raise ValueError('Invalid departure count')
        headway = p['headway_best_nonlymmo_min']
        for threshold in (15, 20, 30):
            flag = p[f'freq{threshold}_nl']
            if not isinstance(flag, bool) or flag != (headway is not None and headway <= threshold):
                raise ValueError('Non-LYMMO flag disagrees with headway')
        if p['n_dep_best_nonlymmo'] == 0 and headway is not None:
            raise ValueError('No non-LYMMO departures must have null headway')
        for threshold in (15, 30):
            h = p['headway_best_route_min']
            if not isinstance(p[f'freq{threshold}'], bool) or p[f'freq{threshold}'] != (h is not None and h <= threshold):
                raise ValueError('Original flag disagrees with headway')
        features.append({'type': 'Feature', 'properties': p,
                         'geometry': {'type': 'Point', 'coordinates': [lon, lat]}})
    return {'type': 'FeatureCollection', 'features': sorted(features, key=lambda f: f['properties']['stop_id'])}


def serialize(data):
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n'


def summary(data):
    print('County:', dict(sorted(collections.Counter(f['properties']['county'] for f in data['features']).items())))
    for label, field in [('Non-LYMMO', 'headway_best_nonlymmo_min'), ('Including LYMMO', 'headway_best_route_min')]:
        counts = collections.Counter()
        for f in data['features']:
            h = f['properties'][field]
            counts['No peak service' if h is None else '≤15' if h <= 15 else '>15–20' if h <= 20 else '>20–30' if h <= 30 else '>30'] += 1
        print(label, dict(sorted(counts.items())))


if __name__ == '__main__':
    if hashlib.sha1(ZIP.read_bytes()).hexdigest() != SHA1:
        raise ValueError('LYNX ZIP SHA1 mismatch')
    result = prepare(json.loads(INPUT.read_text()))
    OUTPUT.write_text(serialize(result), encoding='utf-8')
    summary(result)
