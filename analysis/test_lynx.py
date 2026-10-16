import copy
import hashlib
import json
import unittest
from prepare_lynx import INPUT, OUTPUT, ZIP, SHA1, PROPERTIES, COUNTIES, bounds, prepare, serialize

class LynxTests(unittest.TestCase):
    def test_publication_fidelity_invariants_and_reproducibility(self):
        self.assertEqual(hashlib.sha1(ZIP.read_bytes()).hexdigest(), SHA1)
        source = json.loads(INPUT.read_text())
        result = prepare(source)
        self.assertEqual(len(result['features']), len(source['features']))
        self.assertEqual(serialize(result), OUTPUT.read_text())
        self.assertEqual(serialize(prepare(source)), serialize(result))
        originals = {f['properties']['stop_id']: f for f in source['features']}
        ids = [f['properties']['stop_id'] for f in result['features']]
        self.assertEqual(len(ids), len(set(ids)))
        west, south, east, north = bounds()
        for f in result['features']:
            p = f['properties']
            self.assertIsInstance(p['stop_id'], str)
            self.assertIn(p['county'], COUNTIES)
            original = originals[p['stop_id']]
            self.assertEqual(p, {k: original['properties'][k] for k in PROPERTIES})
            self.assertEqual(f['geometry']['coordinates'], [round(v, 5) for v in original['geometry']['coordinates']])
            lon, lat = f['geometry']['coordinates']
            self.assertTrue(west <= lon <= east and south <= lat <= north)
            self.assertFalse(p['freq15_nl'] and not p['freq20_nl'])
            self.assertFalse(p['freq20_nl'] and not p['freq30_nl'])
            for threshold in (15, 20, 30):
                self.assertEqual(p[f'freq{threshold}_nl'], p['headway_best_nonlymmo_min'] is not None and p['headway_best_nonlymmo_min'] <= threshold)
            if p['n_dep_best_nonlymmo'] == 0:
                self.assertIsNone(p['headway_best_nonlymmo_min'])
                self.assertFalse(any(p[f'freq{t}_nl'] for t in (15,20,30)))

    def test_rejects_duplicate_ids_and_inconsistent_flags(self):
        source = json.loads(INPUT.read_text())
        duplicate = copy.deepcopy(source)
        duplicate['features'].append(duplicate['features'][0])
        with self.assertRaises(ValueError): prepare(duplicate)
        source['features'][0]['properties']['freq15_nl'] = not source['features'][0]['properties']['freq15_nl']
        with self.assertRaises(ValueError): prepare(source)
