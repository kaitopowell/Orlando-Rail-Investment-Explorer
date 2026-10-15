import json
import unittest
from prepare_equity import prepare, number, ROOT


class EquityTests(unittest.TestCase):
    def test_real_input_and_reproducibility(self):
        data = prepare()
        self.assertEqual(data, json.loads((ROOT / 'public/data/equity_tracts.geojson').read_text()))
        props = [f['properties'] for f in data['features']]
        self.assertEqual(len(props), 490)
        for p in props:
            self.assertIsInstance(p['GEOID'], str)
            self.assertRegex(p['GEOID'], r'^\d{11}$')
        for key, count in [('median_income', 3), ('pct_zero_vehicle', 2), ('pct_poverty', 2)]:
            self.assertEqual(sum(p[key] is None for p in props), count)
        self.assertEqual({p['GEOID'] for p in props if p['households'] == 0}, {'12095016515', '12095990000'})
        self.assertEqual(sum(p['median_income'] == 250001 for p in props), 1)
        self.assertEqual(sum(p['small_base'] is True for p in props), 2)
        original = json.loads((ROOT / 'public/data/population_tracts.geojson').read_text())
        geometries = {f['properties']['GEOID']: f['geometry'] for f in original['features']}
        for f in data['features']:
            self.assertEqual(f['geometry'], geometries[f['properties']['GEOID']])

    def test_missing_is_not_zero(self):
        for cell in ('', '-666666666', 'NaN'):
            self.assertIsNone(number(cell))
        self.assertEqual(number('0'), 0)
