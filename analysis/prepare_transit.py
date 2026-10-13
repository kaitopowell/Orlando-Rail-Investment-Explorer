"""Offline publication of supplied, already clipped GTFS geometry (10 m simplification)."""
import json
from pathlib import Path
from osgeo import ogr, osr

ROOT = Path(__file__).resolve().parents[1]
FILES = [f'{service}_{kind}.geojson' for service in ('sunrail', 'brightline') for kind in ('line', 'stations')]

def prepare(data):
    source, metric = osr.SpatialReference(), osr.SpatialReference()
    source.ImportFromEPSG(4326)
    metric.ImportFromEPSG(26917)
    for crs in (source, metric):
        crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    forward, reverse = osr.CoordinateTransformation(source, metric), osr.CoordinateTransformation(metric, source)
    result = json.loads(json.dumps(data))
    for feature in result['features']:
        if feature['geometry']['type'] in ('LineString', 'MultiLineString'):
            geometry = ogr.CreateGeometryFromJson(json.dumps(feature['geometry']))
            geometry.Transform(forward)
            geometry = geometry.SimplifyPreserveTopology(10)
            geometry.Transform(reverse)
            feature['geometry'] = json.loads(geometry.ExportToJson())
        elif feature['geometry']['type'] != 'Point':
            raise ValueError('Unexpected transit geometry')
    return result

if __name__ == '__main__':
    for name in FILES:
        data = prepare(json.loads((ROOT / 'data/processed' / name).read_text()))
        (ROOT / 'public/data' / name).write_text(json.dumps(data, separators=(',', ':')) + '\n')
        print(f'{name}: {len(data["features"])} features; local input only')
