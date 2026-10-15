"""Publish supplied ACS equity values joined to existing 2024 tract geometry.

Run: python3 analysis/prepare_equity.py. Standard library only; no downloads.
"""
import csv
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ('households', 'hh_no_vehicle', 'B08201_002M', 'pct_zero_vehicle',
          'pct_poverty', 'median_income', 'median_income_moe')


def number(cell):
    if not cell.strip():
        return None
    value = float(cell)
    return value if math.isfinite(value) and value >= 0 else None


def prepare(csv_path=ROOT / 'data/processed/acs_equity_tracts_2024_5yr.csv',
            polygons_path=ROOT / 'public/data/population_tracts.geojson'):
    rows = {}
    with open(csv_path, newline='', encoding='utf-8') as source:
        for row in csv.DictReader(source):  # GEOID remains a string throughout.
            geoid = row['GEOID']
            if not re.fullmatch(r'\d{11}', geoid) or geoid in rows:
                raise ValueError(f'Invalid or duplicate GEOID: {geoid}')
            props = {'GEOID': geoid, 'name': row['NAME']}
            props.update({key: number(row[key]) for key in FIELDS})
            props['small_base'] = (props['households'] < 100
                                   if props['households'] is not None else None)
            rows[geoid] = props
    data = json.loads(Path(polygons_path).read_text())
    ids = [f['properties']['GEOID'] for f in data['features']]
    if any(not isinstance(i, str) or not re.fullmatch(r'\d{11}', i) for i in ids):
        raise ValueError('Polygon GEOIDs must be 11-character strings')
    if len(ids) != len(set(ids)) or set(ids) != set(rows):
        raise ValueError(f'Join mismatch: CSV only {set(rows)-set(ids)}, polygons only {set(ids)-set(rows)}')
    for feature in data['features']:
        feature['properties'] = rows[feature['properties']['GEOID']]
    data['features'].sort(key=lambda f: f['properties']['GEOID'])
    return data


if __name__ == '__main__':
    output = ROOT / 'public/data/equity_tracts.geojson'
    output.write_text(json.dumps(prepare(), separators=(',', ':'), allow_nan=False) + '\n')
    print(f'Published {output}')
