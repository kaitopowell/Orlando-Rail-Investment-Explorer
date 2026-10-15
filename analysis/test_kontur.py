import json
import unittest
from prepare_kontur import ROOT, prepare
class KonturTests(unittest.TestCase):
    def test_publication(self):
        source = json.loads((ROOT/'data/processed/kontur_h3_four_counties.geojson').read_text())
        output = prepare(source)
        self.assertEqual(output, json.loads((ROOT/'public/data/kontur_h3_four_counties.geojson').read_text()))
        self.assertEqual(len(output['features']), 7896)
        self.assertEqual(len({f['properties']['h3'] for f in output['features']}), 7896)
        for a,b in zip(source['features'],output['features']):
            self.assertEqual(a['geometry'],b['geometry'])
            for key in ('h3','population','county','tract_geoid'):
                self.assertEqual(a['properties'][key],b['properties'][key])
            self.assertIsInstance(b['properties']['tract_geoid'],str)
            self.assertEqual(len(b['properties']['tract_geoid']),11)
    def test_conflicting_total_rejected(self):
        with self.assertRaises(ValueError):
            prepare({'features':[{'properties':{'tract_pop_acs_x':1,'tract_pop_acs_y':2}}]})
