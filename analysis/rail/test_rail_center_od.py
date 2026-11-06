"""Tiny synthetic center/flow fixtures; no large files, network or routing."""
import csv
import gzip
import json
import tempfile
import unittest
from pathlib import Path

import h3

try:
    from . import center_od as c
except ImportError:
    import center_od as c


class CenterODTests(unittest.TestCase):
    def setUp(self):
        self.a = h3.latlng_to_cell(28.54, -81.38, 8)
        self.b, self.d = sorted(set(h3.grid_disk(self.a, 1)) - {self.a})[:2]
        self.position = h3.cell_to_latlng(self.a)

    def test_member_ownership_overrides_nearest_and_radius(self):
        centers = [c.Center('owner', 0, 0, (self.a,)), c.Center('near', *self.position, (self.b,))]
        nearest = c.nearest_centers([self.a], centers)
        self.assertEqual(c.assignments(nearest, 0)[self.a], 'owner')

    def test_nearest_cutoff_equality_and_id_tie(self):
        point = h3.cell_to_latlng(self.b)
        centers = [c.Center('z', *point, ()), c.Center('a', *point, ())]
        nearest = c.nearest_centers([self.a], centers)
        distance = h3.great_circle_distance(self.position, point, unit='km')
        self.assertEqual(nearest[self.a], ('a', distance))
        self.assertEqual(c.assignments(nearest, distance)[self.a], 'a')
        self.assertIsNone(c.assignments(nearest, distance / 2)[self.a])
        self.assertEqual(nearest, c.nearest_centers([self.a], list(reversed(centers))))
        with self.assertRaises(ValueError):
            c.assignments(nearest, -1)

    def test_role_lists_are_pre_cutoff_and_role_specific(self):
        rows = [c.Flow('h0', 'w0', 2, 10, None), c.Flow('h1', 'w1', 3, 10, 61),
                c.Flow('h1', 'h0', 5, 20, 30), c.Flow('h1', 'w0', 7, 10, None)]
        homes, works = c.no_car_roles(rows)
        self.assertEqual(homes, {'h0'})
        self.assertEqual(works, {'w0'})
        mapping = {id_: 'center' for row in rows for id_ in (row.home, row.work)}
        pairs, groups, _ = c.aggregate(rows, mapping, homes, works, 4, 17)
        row = pairs[0]
        self.assertTrue(row['intra_center'])
        self.assertEqual(row['jobs'], 17)
        self.assertEqual(row['excluded_jobs'], 9)
        self.assertEqual(row['excluded_pair_count'], 2)
        self.assertEqual(row['transit_usable_jobs'], 8)
        self.assertEqual(row['transit_mean_min'], 16.25)
        self.assertEqual(row['car_usable_jobs'], 5)
        self.assertEqual(row['car_mean_min'], 30)
        self.assertEqual(groups['assigned_both']['excluded_jobs'], 9)

    def test_time_cutoffs_weights_zero_and_missing(self):
        rows = [c.Flow('a', 'b', 2, 120, 60), c.Flow('c', 'd', 6, 20, 10),
                c.Flow('e', 'f', 3, 121, 61), c.Flow('g', 'h', 1, None, None),
                c.Flow('i', 'j', 2, 0, 0)]
        mapping = {id_: ('home' if role == 'home' else 'work')
                   for row in rows for role, id_ in [('home', row.home), ('work', row.work)]}
        pairs, _, _ = c.aggregate(rows, mapping, set(), set(), 5, 14)
        row = pairs[0]
        self.assertEqual(row['transit_usable_jobs'], 10)
        self.assertEqual(row['transit_mean_min'], 36)
        self.assertEqual(row['car_usable_jobs'], 10)
        self.assertEqual(row['car_mean_min'], 18)
        self.assertFalse(row['intra_center'])
        empty, _, _ = c.aggregate([c.Flow('a', 'b', 1, None, None)], mapping, set(), set(), 1, 1)
        self.assertIsNone(empty[0]['transit_mean_min'])
        self.assertIsNone(empty[0]['car_mean_min'])
        self.assertEqual(pairs, c.aggregate(list(reversed(rows)), mapping, set(), set(), 5, 14)[0])

    def test_four_groups_and_reconciliation(self):
        rows = [c.Flow('a', 'a', 2, 10, 10), c.Flow('a', 'x', 3, None, None),
                c.Flow('x', 'b', 5, 20, 20), c.Flow('x', 'x', 7, None, None)]
        pairs, groups, active = c.aggregate(rows, {'a': 'A', 'b': 'B', 'x': None}, {'x'}, set(), 4, 17)
        self.assertEqual([groups[k]['jobs'] for k in c.GROUPS], [2, 3, 5, 7])
        self.assertEqual(sum(g['excluded_jobs'] for g in groups.values()), 12)
        summary = c.summarize(5, pairs, groups, {'A', 'B', 'C'}, active)
        self.assertEqual(summary['centers_without_assigned_pair_flows'], ['B', 'C'])
        self.assertEqual(summary['centers_without_any_endpoint_flows'], ['C'])
        self.assertEqual(summary['intra_center_share_all_jobs'], 2 / 17)
        self.assertEqual(summary['intra_center_share_assigned_jobs'], 1)
        self.assertEqual(summary['top_100_share_assigned_jobs'], 1)
        with self.assertRaisesRegex(ValueError, 'Reconciliation'):
            c.reconcile(groups, 5, 17)
        with self.assertRaisesRegex(ValueError, 'Reconciliation'):
            c.reconcile(groups, 4, 18)

    def test_member_access_is_actual_distance_without_changing_assignment(self):
        owner_position = h3.cell_to_latlng(self.b)
        centers = [c.Center('owner', *owner_position, (self.a,)),
                   c.Center('closer', *self.position, ())]
        nearest = c.nearest_centers([self.a], centers)
        mapping = c.assignments(nearest, 0)
        distance = c.access_distances(nearest, centers)[self.a]
        self.assertEqual(mapping[self.a], 'owner')
        self.assertGreater(distance, 0)
        self.assertEqual(distance, h3.great_circle_distance(self.position, owner_position, unit='km'))
        self.assertEqual(nearest[self.a], ('owner', 0.0))

    def test_access_job_weights_partial_assignment_and_unchanged_fields(self):
        rows = [c.Flow('h1', 'w', 1, 10, 5), c.Flow('h2', 'w', 3, None, None),
                c.Flow('h1', 'u', 6, None, None), c.Flow('u', 'u', 99, None, None)]
        mapping = {'h1': 'A', 'h2': 'A', 'w': 'A', 'u': None}
        pairs, groups, active = c.aggregate(rows, mapping, {'h2'}, set(), 4, 109)
        original = json.loads(json.dumps(pairs))
        summary = c.add_access(rows, mapping, {'h1': 1.0, 'h2': 5.0, 'w': 2.0}, pairs)
        for old, new in zip(original, pairs):
            self.assertEqual(old, {key: new[key] for key in old})
        self.assertTrue(pairs[0]['intra_center'])
        self.assertEqual(pairs[0]['excluded_jobs'], 3)
        self.assertEqual(pairs[0]['home_access_mean_km'], 4.0)
        self.assertEqual(pairs[0]['work_access_mean_km'], 2.0)
        self.assertEqual(summary['home'], {'assigned_job_ends': 10, 'median_km': 1.0, 'p90_km': 5.0})
        self.assertEqual(summary['work'], {'assigned_job_ends': 4, 'median_km': 2.0, 'p90_km': 2.0})
        self.assertEqual(summary['pooled_ends'], {'assigned_job_ends': 14, 'median_km': 1.0, 'p90_km': 5.0})
        self.assertEqual(c.weighted_access_percentiles({}, {}),
                         {'assigned_job_ends': 0, 'median_km': None, 'p90_km': None})
        self.assertEqual(c.weighted_access_percentiles({'a': 1, 'b': 9}, {'a': 1, 'b': 10})['median_km'], 10)

    def test_tiny_file_validation_and_deterministic_gzip(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            centers = directory / 'centers.json'
            feature = {'type': 'Feature', 'properties': {'id': 'A', 'hexagon_count': 1, 'hexagons': [self.a]},
                       'geometry': {'type': 'Point', 'coordinates': list(reversed(self.position))}}
            centers.write_text(json.dumps({'type': 'FeatureCollection', 'features': [feature]}))
            self.assertEqual(c.read_centers(centers)[0].members, (self.a,))
            centers.write_text(json.dumps({'type': 'FeatureCollection', 'features': [feature, feature]}))
            with self.assertRaises(ValueError):
                c.read_centers(centers)
            path = directory / 'baseline.csv.gz'
            with gzip.open(path, 'wt', newline='') as stream:
                writer = csv.writer(stream)
                writer.writerow(['h_hex', 'w_hex', 'S000', 'transit_min', 'car_min'])
                writer.writerow([self.a, self.b, 2, '', 61])
            self.assertEqual(c.read_baseline(path), [c.Flow(self.a, self.b, 2, None, 61)])
            for value in ('nan', 'inf', '-1'):
                with self.assertRaises(ValueError):
                    c.parse_time(value)
            for name in ('one.gz', 'two.gz'):
                c.write_csv(directory / name, ('a', 'b'), [{'a': 1, 'b': None}], compressed=True)
            self.assertEqual((directory / 'one.gz').read_bytes(), (directory / 'two.gz').read_bytes())


if __name__ == '__main__':
    unittest.main()
