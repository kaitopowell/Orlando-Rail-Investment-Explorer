"""Offline, tiny synthetic coverage fixtures; no real datasets or geometry stack."""
import csv
import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import h3
from rail import coverage as c
from rail import coverage_sensitivity as sensitivity


def collection(points):
    return {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
         'properties': props} for lat, lon, props in points]}


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.a, self.b, self.d, self.e = [h3.latlng_to_cell(lat, lon, 8) for lat, lon in
                                        [(28.54, -81.38), (28.8, -81.7), (28.3, -81.4), (28.4, -81.3)]]
        self.totals = dict(zip(c.COUNTS, (15, 3, 5, 7)))
        self.rows = [dict(zip(('h_hex', 'w_hex', *c.COUNTS), (home, work, *map(str, counts))))
                     for home, work, counts in [(self.a, self.b, (6, 1, 2, 3)),
                                               (self.a, self.d, (4, 0, 1, 3)),
                                               (self.d, self.b, (3, 1, 1, 1)),
                                               (self.d, self.e, (2, 1, 1, 0))]]

    def test_four_way_classification_earnings_and_shares(self):
        result, inventory = c.aggregate_flows(self.rows, {'fixture': {self.a, self.b}}, self.totals)
        groups = result['fixture']
        self.assertEqual([groups[g]['counts']['S000'] for g in c.GROUPS], [6, 4, 3, 2])
        self.assertEqual([groups[g]['counts']['SE02'] for g in c.GROUPS], [2, 1, 1, 1])
        self.assertEqual([groups[g]['flow_rows'] for g in c.GROUPS], [1, 1, 1, 1])
        self.assertAlmostEqual(groups['both_covered']['shares']['S000'], 6/15)
        self.assertAlmostEqual(groups['both_covered']['shares']['SE01'], 1/3)
        self.assertEqual(groups['neither']['flow_share'], .25)
        self.assertEqual(inventory['counts'], self.totals)
        self.assertEqual(c.classify(self.a, self.a, {self.a}), 'both_covered')
        self.assertEqual(c.classify(self.a, self.d, {self.a}), 'home_only')
        self.assertEqual(c.classify(self.d, self.a, {self.a}), 'work_only')

    def test_grid_disk_includes_center_and_exactly_one_ring(self):
        self.assertEqual(c.expand_cells([self.a, self.a], 0), {self.a})
        disk = c.expand_cells([self.a, self.a], 1)
        self.assertEqual(len(disk), 7)
        self.assertIn(self.a, disk)
        self.assertTrue(all(h3.grid_distance(self.a, cell) <= 1 for cell in disk))
        self.assertTrue(set(h3.grid_ring(self.a, 2)).isdisjoint(disk))
        self.assertEqual(c.expand_cells([], 1), set())
        for invalid in (-1, 1.5, True):
            with self.assertRaises(ValueError):
                c.expand_cells([self.a], invalid)

    def test_headway_boundary_nulls_best_route_and_rail_policy(self):
        layers = {
            'lynx': collection([(28.54, -81.38, {c.HEADWAY_FIELD: 15}),
                                (28.54, -81.38, {c.HEADWAY_FIELD: 10, 'route_short_name': '60'}),
                                (28.8, -81.7, {c.HEADWAY_FIELD: 15.1, 'headway_combined_min': 1}),
                                (28.3, -81.4, {c.HEADWAY_FIELD: None})]),
            'sunrail': collection([(28.3, -81.4, {'stop_name': 'Synthetic rail'})]),
            'brightline': collection([(28.4, -81.3, {'stop_name': 'Synthetic intercity'})]),
        }
        covered, inventory, selection, _ = c.scenarios_from_stops(layers, rings=0)
        self.assertEqual(covered['frequent_transit'], {self.a})
        self.assertEqual(covered['rail_only'], {self.d, self.e})
        self.assertEqual(covered['any_transit'], {self.a, self.b, self.d, self.e})
        self.assertEqual(covered['any_transit_no_brightline'], {self.a, self.b, self.d})
        self.assertEqual(inventory['lynx']['null_headways'], 1)
        self.assertEqual(inventory['lynx']['frequent_selected_stops'], 2)
        self.assertEqual(selection['frequent_transit']['covered_hexagons'], 1)
        self.assertIsNone(inventory['sunrail']['frequency_field_used'])
        for invalid in (0, -1, math.nan, math.inf, True):
            with self.assertRaises(ValueError):
                c.scenarios_from_stops(layers, headway_minutes=invalid)

    def test_bad_geometry_and_unknown_headway_fail_loudly(self):
        for headway in (-1, 0, '15', math.nan, True):
            with self.assertRaisesRegex(ValueError, 'headway'):
                c.stop_cells(collection([(28.5, -81.3, {c.HEADWAY_FIELD: headway})]), c.HEADWAY_FIELD)
        with self.assertRaisesRegex(ValueError, 'missing headway'):
            c.stop_cells(collection([(28.5, -81.3, {})]), c.HEADWAY_FIELD)
        bad = collection([(28.5, -81.3, {})])
        bad['features'][0]['geometry']['type'] = 'LineString'
        with self.assertRaisesRegex(ValueError, 'Point'):
            c.stop_cells(bad)
        with self.assertRaisesRegex(ValueError, 'longitude/latitude'):
            c.stop_cells(collection([(91, -81.3, {})]))

    def test_reconciliation_detects_wrong_totals_and_lost_counts(self):
        result, _ = c.aggregate_flows(self.rows, {'fixture': {self.a, self.b}}, self.totals)
        groups = result['fixture']
        groups['home_only']['counts']['SE03'] -= 1
        with self.assertRaisesRegex(ValueError, 'reconciliation failed'):
            c.reconcile(groups, self.totals, 4)
        with self.assertRaisesRegex(ValueError, 'Input totals differ'):
            c.aggregate_flows(self.rows, {'fixture': set()})
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            c.aggregate_flows(self.rows + self.rows[:1], {'fixture': set()}, self.totals)
        for value in ('-1', '1.5', ''):
            with self.assertRaisesRegex(ValueError, 'integer job count'):
                c.aggregate_flows([{**self.rows[0], 'S000': value}], {'fixture': set()}, self.totals)

    def test_tiny_end_to_end_outputs_are_reproducible_and_inputs_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for mode, filename in c.STOP_FILES.items():
                props = {c.HEADWAY_FIELD: 15} if mode == 'lynx' else {}
                (root / filename).write_text(json.dumps(collection([(28.54, -81.38, props)])))
            with (root / c.FLOW_FILE).open('w', newline='') as target:
                writer = csv.DictWriter(target, fieldnames=('h_hex', 'w_hex', *c.COUNTS))
                writer.writeheader()
                writer.writerows(self.rows)
            before = {p.name: p.read_bytes() for p in root.iterdir()}
            with patch.object(c, 'EXPECTED_TOTALS', self.totals):
                summary, coverage = c.analyze(root, rings=0)
            output = root / 'output'
            c.write_outputs(summary, coverage, output)
            first = {p.name: p.read_bytes() for p in output.iterdir()}
            c.write_outputs(summary, coverage, output)
            self.assertEqual(first, {p.name: p.read_bytes() for p in output.iterdir()})
            self.assertEqual(before, {name: (root/name).read_bytes() for name in before})
            parsed = json.loads((output/'transit_coverage_summary.json').read_text())
            self.assertTrue(parsed['reconciled'])
            self.assertEqual(parsed['parameters']['catchment_citation'], 'TBD')
            scale = parsed['spatial_scale']
            self.assertGreater(scale['actual_stop_cell_directed_edges_m']['min'], 0)
            self.assertAlmostEqual(scale['approximate_k1_center_reach_m'], math.sqrt(3)*scale['global_average_edge_m'])
            self.assertIsNone(scale['actual_selected_k_center_distances_m'])
            with (output/'transit_coverage_hex8.csv').open() as source:
                records = list(csv.DictReader(source))
            self.assertEqual({r['scenario'] for r in records}, set(c.SCENARIOS))
            self.assertTrue(all(r['h3'] == self.a for r in records))


    def test_sensitivity_k0_k1_hand_checkable_flows(self):
        neighbor = sorted(h3.grid_ring(self.a, 1))[0]
        far = sorted(h3.grid_ring(self.a, 2))[0]
        lat, lon = h3.cell_to_latlng(self.a)
        layers = {'lynx': collection([(lat, lon, {c.HEADWAY_FIELD: 15})]),
                  'sunrail': collection([]), 'brightline': collection([])}
        covered, definitions = sensitivity.grid_coverage(layers)
        self.assertEqual(len(definitions), 8)
        self.assertTrue(all(row['headway_minutes'] is None for row in definitions
                            if row['scenario'] != 'frequent_transit'))
        rows = [{**row, 'h_hex': home, 'w_hex': work}
                for row, (home, work) in zip(self.rows,
                    [(self.a, neighbor), (neighbor, self.a), (far, self.a), (far, far)])]
        results, _ = c.aggregate_flows(rows, covered, self.totals)
        self.assertEqual([results['any_transit_k0'][g]['counts']['S000'] for g in c.GROUPS], [0, 6, 7, 2])
        self.assertEqual([results['any_transit_k1'][g]['counts']['S000'] for g in c.GROUPS], [10, 0, 3, 2])
        self.assertEqual(results['frequent_transit_k1_h15'], results['any_transit_k1'])

    def test_sensitivity_30_minute_inclusive_threshold(self):
        points = [(*h3.cell_to_latlng(cell), {c.HEADWAY_FIELD: minutes})
                  for cell, minutes in [(self.a, 15), (self.b, 30), (self.d, 30.1), (self.e, None)]]
        layers = {'lynx': collection(points), 'sunrail': collection([]), 'brightline': collection([])}
        covered, _ = sensitivity.grid_coverage(layers)
        self.assertEqual(covered['frequent_transit_k0_h15'], {self.a})
        self.assertEqual(covered['frequent_transit_k0_h30'], {self.a, self.b})
        audit = sensitivity.headway_audit(layers['lynx'])
        self.assertEqual([x['selected_stops'] for x in audit['threshold_counts']], [1, 2])
        self.assertEqual(audit['null_values'], 1)
        self.assertEqual(audit['missing_keys'], 0)
        self.assertEqual(audit['zero_values'], 0)
        with self.assertRaisesRegex(ValueError, 'invalid headway'):
            sensitivity.headway_audit(collection([(28.54, -81.38, {c.HEADWAY_FIELD: 0})]))

    def test_sensitivity_baseline_checks_all_columns_not_just_jobs(self):
        from copy import deepcopy
        mapping = {'any_transit': 'any_transit_k1', 'frequent_transit': 'frequent_transit_k1_h15',
                   'rail_only': 'rail_only_k1', 'any_transit_no_brightline': 'baseline_no_brightline'}
        results, inventory = c.aggregate_flows(self.rows, {key: {self.a, self.b} for key in mapping.values()}, self.totals)
        baseline = {'sources': {}, 'flow_inventory': inventory,
                    'scenarios': {name: deepcopy(results[key]) for name, key in mapping.items()}}
        with patch.object(sensitivity, 'PR34_BOTH_JOBS', {name: 6 for name in sensitivity.PR34_BOTH_JOBS}):
            sensitivity.verify_baseline(results, baseline, {}, inventory)
            results['any_transit_k1']['both_covered']['counts']['SE01'] += 1
            with self.assertRaisesRegex(ValueError, 'full counts/shares/rows'):
                sensitivity.verify_baseline(results, baseline, {}, inventory)
            results['any_transit_k1']['both_covered']['counts']['S000'] += 1
            with self.assertRaisesRegex(ValueError, 'both-covered jobs'):
                sensitivity.verify_baseline(results, baseline, {}, inventory)

    def test_sensitivity_outputs_preserve_baseline_and_include_all_group_earnings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for mode, filename in c.STOP_FILES.items():
                props = {c.HEADWAY_FIELD: 15} if mode == 'lynx' else {
                    'stop_name': sensitivity.DOWNTOWN_STATION_NAME, 'stop_id': 'fixture'}
                (root/filename).write_text(json.dumps(collection([(28.54, -81.38, props)])))
            with (root/c.FLOW_FILE).open('w', newline='') as target:
                writer = csv.DictWriter(target, fieldnames=('h_hex', 'w_hex', *c.COUNTS))
                writer.writeheader()
                writer.writerows(self.rows)
            with patch.object(c, 'EXPECTED_TOTALS', self.totals):
                baseline, covered = c.analyze(root)
                c.write_outputs(baseline, covered, root)
                before = {p.name: p.read_bytes() for p in root.iterdir()}
                expected = {name: baseline['scenarios'][name]['both_covered']['counts']['S000']
                            for name in sensitivity.PR34_BOTH_JOBS}
                with patch.object(sensitivity, 'PR34_BOTH_JOBS', expected):
                    summary = sensitivity.analyze(root)
            sensitivity.write_outputs(summary, root)
            first = {name: (root/name).read_bytes() for name in
                     ('transit_coverage_sensitivity.csv', 'transit_coverage_sensitivity.json')}
            sensitivity.write_outputs(summary, root)
            self.assertEqual(first, {name: (root/name).read_bytes() for name in first})
            self.assertEqual(before, {name: (root/name).read_bytes() for name in before})
            self.assertEqual(len(summary['rows']), 8)
            for row in summary['rows']:
                c.reconcile(row['groups'], self.totals, 4)
            with (root/'transit_coverage_sensitivity.csv').open() as source:
                rows = list(csv.DictReader(source))
            self.assertEqual(len(rows), 8)
            self.assertEqual(sum(r['headway_minutes'] == '' for r in rows), 4)
            scale = summary['downtown_geometry']
            self.assertGreater(scale['local_cell_area_m2'], 0)
            self.assertGreater(scale['local_edge_mean_m'], 0)
            self.assertEqual([r['covered_cells'] for r in scale['rings']], [1, 7])
            self.assertEqual(scale['rings'][0]['nonorigin_center_distance_max_m'], 0)
            self.assertGreater(scale['adjacent_center_distance_min_m'], 0)
            self.assertEqual(scale['adjacent_center_distance_max_m'], scale['rings'][1]['nonorigin_center_distance_max_m'])


if __name__ == '__main__':
    unittest.main()
