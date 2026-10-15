import json
import unittest
from osgeo import ogr
from prepare_employment import ROOT, prepare, SECTORS
class EmploymentTests(unittest.TestCase):
    def test_join_totals_points_and_fidelity(self):
        boundaries=json.loads((ROOT/'public/data/population_tracts.geojson').read_text())
        result=prepare(ROOT/'data/processed/lodes_wac_tracts_2023.csv',boundaries)
        self.assertEqual(result,json.loads((ROOT/'public/data/employment_tracts.geojson').read_text()))
        features=result['features']
        self.assertEqual(len(features),490)
        self.assertEqual(sum(f['properties']['jobs_total'] for f in features),1482556)
        self.assertEqual([f['properties']['GEOID'] for f in features if f['properties']['jobs_total']==0],['12095990000'])
        for f, original in zip(features,boundaries['features']):
            p=f['properties'];self.assertIsInstance(p['GEOID'],str);self.assertRegex(p['GEOID'],r'^\d{11}$')
            self.assertEqual(f['geometry'],original['geometry'])
            point=ogr.Geometry(ogr.wkbPoint);point.AddPoint_2D(*p['point'])
            self.assertTrue(ogr.CreateGeometryFromJson(json.dumps(f['geometry'])).Contains(point))
            self.assertEqual(sum(p[k] for k in SECTORS),p['jobs_total'])
