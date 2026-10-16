import csv
import unittest
from prepare_employment_blocks import prepare, serialize, county_bounds, OUTPUT, INPUT


class EmploymentBlockTests(unittest.TestCase):
    def test_real_data_and_reproducible_output(self):
        result = prepare()
        features = result['features']
        self.assertEqual(len(features), 15574)
        self.assertEqual(sum(f['properties']['jobs_total'] for f in features), 1482556)
        with INPUT.open(newline='') as stream:
            supplied = {r['w_geocode']: r for r in csv.DictReader(stream)}
        west, south, east, north = county_bounds()
        self.assertEqual(len({f['properties']['w_geocode'] for f in features}), 15574)
        for f in features:
            p = f['properties']
            self.assertIsInstance(p['w_geocode'], str)
            self.assertRegex(p['w_geocode'], r'^\d{15}$')
            self.assertIsInstance(p['tract_geoid'], str)
            self.assertIsInstance(p['county'], str)
            original = supplied[p['w_geocode']]
            self.assertEqual(p['tract_geoid'], original['tract_geoid'])
            self.assertEqual(p['county'], original['county'])
            for key in ['jobs_total', *[f'CNS{i:02}' for i in range(1, 21)]]:
                self.assertEqual(p[key], int(original[key]))
            self.assertEqual(f['geometry']['coordinates'], [float(original['lon']), float(original['lat'])])
            self.assertRegex(p['tract_geoid'], r'^\d{11}$')
            self.assertEqual(f['geometry']['type'], 'Point')
            lon, lat = f['geometry']['coordinates']
            self.assertTrue(west <= lon <= east and south <= lat <= north)
        self.assertEqual(OUTPUT.read_text(), serialize(result))
        self.assertEqual(serialize(prepare()), serialize(result))
