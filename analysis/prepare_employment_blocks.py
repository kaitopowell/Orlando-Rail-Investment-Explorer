"""Publish supplied LODES internal points offline, preserving string identifiers."""
import csv
import json
import math
from pathlib import Path
from prepare_employment import count, SECTORS

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/processed/lodes_wac_blocks_2023.csv'
OUTPUT = ROOT / 'public/data/employment_blocks.geojson'
COUNTIES = {'12069', '12095', '12097', '12117'}


def county_bounds():
    data = json.loads((ROOT / 'public/data/counties.geojson').read_text())
    points = []
    for f in data['features']:
        g = f['geometry']
        polygons = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        points.extend(p for polygon in polygons for ring in polygon for p in ring)
    return (min(p[0] for p in points), min(p[1] for p in points),
            max(p[0] for p in points), max(p[1] for p in points))


def prepare(path=INPUT):
    west, south, east, north = county_bounds()
    features, seen = [], set()
    with Path(path).open(newline='', encoding='utf-8-sig') as stream:
        rows = csv.DictReader(stream)  # All fields initially strings; convert counts/coordinates only.
        required = {'w_geocode', 'tract_geoid', 'county', 'jobs_total', 'lat', 'lon', *SECTORS}
        if not required.issubset(rows.fieldnames or []):
            raise ValueError('Missing required block CSV columns')
        for row in rows:
            block, tract = row['w_geocode'], row['tract_geoid']
            if (len(block) != 15 or not block.isascii() or not block.isdigit()
                    or block in seen or len(tract) != 11 or not tract.isascii() or not tract.isdigit()
                    or tract[:5] != block[:5] or block[:5] not in COUNTIES
                    or not row['county'].strip()):
                raise ValueError(f'Invalid or duplicate block identifiers: {block}')
            seen.add(block)
            lon, lat = float(row['lon']), float(row['lat'])
            if not all(map(math.isfinite, [lon, lat])) or not (west <= lon <= east and south <= lat <= north):
                raise ValueError(f'Block outside four-county bounding box: {block}')
            props = {key: row[key] for key in ('w_geocode', 'tract_geoid', 'county')}
            props.update({key: count(row[key]) for key in ['jobs_total', *SECTORS]})
            if sum(props[k] for k in SECTORS) != props['jobs_total']:
                raise ValueError(f'Sector total mismatch: {block}')
            features.append(dict(type='Feature', properties=props,
                                 geometry=dict(type='Point', coordinates=[lon, lat])))
    if len(features) != 15574 or sum(f['properties']['jobs_total'] for f in features) != 1482556:
        raise ValueError('Expected 15,574 blocks and exactly 1,482,556 jobs')
    features.sort(key=lambda f: f['properties']['w_geocode'])
    return dict(type='FeatureCollection', features=features)


def serialize(data):
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n'


if __name__ == '__main__':
    result = prepare()
    OUTPUT.write_text(serialize(result), encoding='utf-8')
    print('Published 15,574 block internal points; 1,482,556 jobs; no downloads')
