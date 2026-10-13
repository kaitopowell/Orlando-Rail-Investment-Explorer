#!/usr/bin/env python3
"""Offline Census ZIP -> simplified WGS84 counties. Requires Python GDAL bindings."""
import hashlib
import json
from pathlib import Path
from osgeo import ogr, osr

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'data/raw/cb_2025_us_county_500k.zip'
OUTPUT = ROOT / 'public/data'
FIPS = {'12069', '12095', '12097', '12117'}
SOURCE = 'https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip'


def main():
    ogr.UseExceptions()
    dataset = ogr.Open(f'/vsizip/{ARCHIVE}')
    layer = dataset.GetLayer(0)
    source_crs = layer.GetSpatialRef()
    projected = osr.SpatialReference()
    projected.ImportFromEPSG(26917)  # NAD83 / UTM 17N; tolerance in metres.
    target = osr.SpatialReference()
    target.ImportFromEPSG(4326)
    for crs in (source_crs, projected, target):
        crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    to_metres = osr.CoordinateTransformation(source_crs, projected)
    to_wgs84 = osr.CoordinateTransformation(projected, target)
    features = []
    for record in layer:
        fips = record.GetField('GEOID')
        if fips not in FIPS:
            continue
        geometry = record.GetGeometryRef().Clone()
        geometry.Transform(to_metres)
        geometry = geometry.SimplifyPreserveTopology(75)
        if geometry.IsEmpty() or not geometry.IsValid():
            raise ValueError(f'Invalid simplified geometry: {fips}')
        geometry.Transform(to_wgs84)
        label = geometry.PointOnSurface()
        features.append({'type': 'Feature', 'id': fips, 'properties': {
            'GEOID': fips, 'NAME': record.GetField('NAME'),
            'label': [label.GetX(), label.GetY()],
        }, 'geometry': json.loads(geometry.ExportToJson())})
    assert {f['properties']['GEOID'] for f in features} == FIPS
    features.sort(key=lambda f: f['id'])
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result = {'type': 'FeatureCollection', 'features': features}
    (OUTPUT / 'counties.geojson').write_text(json.dumps(result, separators=(',', ':')) + '\n')
    metadata = {'source': SOURCE, 'year': 2025, 'downloadDate': '2026-10-12', 'downloadTime': '23:11',
                'downloadTimezone': 'America/New_York',
                'downloadDateNote': 'Download time supplied by the repository owner',
                'sha256': hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),
                'simplificationMetres': 75, 'crs': 'EPSG:4326'}
    (OUTPUT / 'counties-source.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Wrote {len(features)} counties to {OUTPUT}; no network access used.')


if __name__ == '__main__':
    main()
