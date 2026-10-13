"""Validate the checked-in Census derivatives using system GDAL; no downloads."""
import hashlib
import json
import subprocess
import unittest
from pathlib import Path
from osgeo import ogr

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'


class CountyDataTests(unittest.TestCase):
    def setUp(self):
        self.features = json.loads((DATA / 'counties.geojson').read_text())['features']

    def test_fips_and_names(self):
        self.assertEqual({f['properties']['GEOID']: f['properties']['NAME'] for f in self.features},
                         {'12069': 'Lake', '12095': 'Orange', '12097': 'Osceola', '12117': 'Seminole'})

    def test_geometry_and_interior_labels(self):
        for feature in self.features:
            geometry = ogr.CreateGeometryFromJson(json.dumps(feature['geometry']))
            self.assertTrue(geometry.IsValid())
            self.assertFalse(geometry.IsEmpty())
            point = ogr.Geometry(ogr.wkbPoint)
            point.AddPoint_2D(*feature['properties']['label'])
            self.assertTrue(geometry.Contains(point))

    def test_mask_excludes_all_county_interiors(self):
        mask = ogr.CreateGeometryFromJson(json.dumps(json.loads((DATA / 'outside-counties.geojson').read_text())['geometry']))
        self.assertTrue(mask.IsValid())
        for feature in self.features:
            county = ogr.CreateGeometryFromJson(json.dumps(feature['geometry']))
            self.assertLess(mask.Intersection(county).GetArea(), 1e-10)

    def test_reproducible_and_input_checksum(self):
        files = sorted(DATA.glob('*'))
        before = {p.name: p.read_bytes() for p in files}
        subprocess.run(['/usr/bin/python3', str(ROOT / 'analysis/prepare_counties.py')], check=True)
        self.assertEqual(before, {p.name: p.read_bytes() for p in files})
        metadata = json.loads((DATA / 'counties-source.json').read_text())
        self.assertEqual(metadata['sha256'], hashlib.sha256((ROOT / 'data/raw/cb_2025_us_county_500k.zip').read_bytes()).hexdigest())


if __name__ == '__main__':
    unittest.main()
