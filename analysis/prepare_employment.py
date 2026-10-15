"""Offline LODES tract join. csv.DictReader preserves GEOID strings."""
import csv
import json
from decimal import Decimal
from pathlib import Path
from osgeo import ogr
ROOT = Path(__file__).resolve().parents[1]
SECTORS = [f'CNS{i:02}' for i in range(1,21)]

def count(value):
    number = Decimal(value)
    if not number.is_finite() or number < 0 or number != number.to_integral_value():
        raise ValueError('Invalid jobs count')
    return int(number)  # Counts only; never identifiers.

def prepare(csv_path, boundaries):
    with open(csv_path, newline='') as stream:
        rows = list(csv.DictReader(stream))
    table = {}
    for row in rows:
        geoid = row['GEOID']
        if len(geoid) != 11 or not geoid.isascii() or not geoid.isdigit() or geoid in table:
            raise ValueError('Invalid or duplicate string GEOID')
        table[geoid] = row
    ids = {f['properties']['GEOID'] for f in boundaries['features']}
    csv_only, geometry_only = sorted(set(table)-ids), sorted(ids-set(table))
    print(f'CSV-only GEOIDs: {csv_only}; geometry-only GEOIDs: {geometry_only}')
    if csv_only or geometry_only:
        raise ValueError('Unmatched employment GEOIDs')
    features = []
    for f in boundaries['features']:
        geoid = f['properties']['GEOID']; row = table[geoid]
        geometry = ogr.CreateGeometryFromJson(json.dumps(f['geometry']))
        point = geometry.PointOnSurface()
        if not geometry.Contains(point):
            raise ValueError(f'Point outside tract {geoid}')
        density = float(row['jobs_per_km2']) if row['jobs_per_km2'].strip() else None
        props = dict(GEOID=geoid,name=row['NAMELSAD'],jobs_total=count(row['jobs_total']),jobs_per_km2=density,point=[point.GetX(),point.GetY()])
        props.update({key:count(row[key]) for key in SECTORS})
        features.append(dict(type='Feature',geometry=f['geometry'],properties=props))
    return dict(type='FeatureCollection',features=features)

if __name__ == '__main__':
    result = prepare(ROOT/'data/processed/lodes_wac_tracts_2023.csv', json.loads((ROOT/'public/data/population_tracts.geojson').read_text()))
    (ROOT/'public/data/employment_tracts.geojson').write_text(json.dumps(result,separators=(',',':'))+'\n')
    print(f'Published {len(result["features"])} tracts; {sum(f["properties"]["jobs_total"] for f in result["features"]):,} jobs')
