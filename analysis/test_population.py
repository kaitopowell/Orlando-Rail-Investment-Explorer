"""Offline unit and real-input regression tests. Synthetic rows are test fixtures only."""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from osgeo import ogr
from prepare_population import ROOT, COUNTIES, code, geoid, population_number, density, read_acs, reconciliation, generate


class PopulationTests(unittest.TestCase):
    def test_string_identifiers_and_padding(self):
        self.assertEqual(geoid({'state': '12', 'county': '69', 'tract': '30102'}), '12069030102')
        self.assertEqual(code('1', 6), '000001')
        for value in (123, '12.0', '', '1234567'):
            with self.assertRaises(ValueError):
                code(value, 6)
        with self.assertRaises(ValueError):
            geoid({'state': '12', 'county': '069', 'tract': '030102', 'GEOID': '12069000001'})

    def test_missing_margins_and_zero(self):
        for value in ('', ' ', '-1', '-555555555.0'):
            self.assertIsNone(population_number(value, margin=True))
        self.assertEqual(population_number('0.0'), 0)
        self.assertEqual(population_number('0', margin=True), 0)
        self.assertEqual(population_number('601.0', margin=True), 601)
        for value in ('', '-1', 'NaN', 'Infinity', '2.5'):
            with self.assertRaises(ValueError):
                population_number(value)

    def test_land_density(self):
        self.assertEqual(density(100, 2_000_000), 50)
        self.assertEqual(density(0, 1_000_000), 0)
        self.assertIsNone(density(10, 0))
        with self.assertRaises(ValueError):
            density(1, -1)

    def test_csv_string_types_and_duplicates(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'fixture.csv'
            header = 'state,county,tract,GEOID,B01003_001E,B01003_001M\n'
            row = '12,069,000100,12069000100,0,-1\n'
            path.write_text(header + row)
            self.assertEqual(read_acs(path), {'12069000100': {'pop_est': 0, 'pop_moe': None}})
            path.write_text(header + row + row)
            with self.assertRaisesRegex(ValueError, 'Duplicate'):
                read_acs(path)

    def test_reports_both_sides_and_total_differences(self):
        report = reconciliation({'12069000100': {'pop_est': 5}}, {'12069000200': None}, {'12069': {'pop_est': 7}})
        self.assertEqual(report['acs_only'], ['12069000100'])
        self.assertEqual(report['boundaries_only'], ['12069000200'])
        self.assertEqual(report['county_totals']['12069']['difference'], -2)
        self.assertEqual(report['county_totals']['12069']['joined_difference'], -7)

    def test_real_inputs_output_and_reproducibility(self):
        raw = ROOT / 'data/raw'
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            output = Path(folder) / 'tracts.geojson'
            report = generate(raw, output)
            first = output.read_bytes()
            generate(raw, output)
            self.assertEqual(first, output.read_bytes())
            self.assertEqual(first, (ROOT / 'public/data/population_tracts.geojson').read_bytes())
            acs = read_acs(raw / 'acs_b01003_tracts_2024_5yr.csv')
            data = json.loads(first)['features']
            self.assertEqual(len(data), len(acs))
            self.assertEqual(len(data), 490)
            self.assertEqual(report['acs_only'], [])
            self.assertEqual(report['boundaries_only'], [])
            self.assertTrue(all(t['difference'] == t['joined_difference'] == 0 for t in report['county_totals'].values()))
            dataset = ogr.Open('/vsizip/' + str(raw / 'cb_2024_12_tract_500k.zip'))
            land = {r.GetFieldAsString('GEOID'): r.GetFieldAsInteger64('ALAND') for r in dataset.GetLayer(0)}
            zeros = []
            for feature in data:
                p = feature['properties']
                self.assertEqual(set(p), {'GEOID', 'county', 'pop_est', 'pop_moe', 'density'})
                self.assertIsInstance(p['GEOID'], str)
                self.assertEqual(len(p['GEOID']), 11)
                self.assertEqual(p['county'], COUNTIES[p['GEOID'][:5]])
                self.assertEqual(p['pop_est'], acs[p['GEOID']]['pop_est'])
                self.assertEqual(p['pop_moe'], acs[p['GEOID']]['pop_moe'])
                self.assertEqual(p['density'], density(p['pop_est'], land[p['GEOID']]))
                geometry = ogr.CreateGeometryFromJson(json.dumps(feature['geometry']))
                self.assertTrue(geometry.IsValid())
                self.assertFalse(geometry.IsEmpty())
                if p['pop_est'] == 0:
                    zeros.append(p['GEOID'])
            self.assertEqual(len(zeros), 1)


if __name__ == '__main__':
    unittest.main()
