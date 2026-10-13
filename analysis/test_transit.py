import json
import unittest
from prepare_transit import ROOT, FILES, prepare

class TransitTests(unittest.TestCase):
    def test_publication_preserves_features_and_properties(self):
        for name in FILES:
            source = json.loads((ROOT / 'data/processed' / name).read_text())
            result = prepare(source)
            self.assertEqual(result, json.loads((ROOT / 'public/data' / name).read_text()))
            self.assertEqual(len(source['features']), len(result['features']))
            for original, simplified in zip(source['features'], result['features']):
                self.assertEqual(original['properties'], simplified['properties'])
                if original['geometry']['type'] == 'Point':
                    self.assertEqual(original, simplified)
                else:
                    self.assertLessEqual(len(simplified['geometry']['coordinates']), len(original['geometry']['coordinates']))
