"""Tiny offline fixtures: no large files, network, routing or plan inputs."""
import csv
import json
import tempfile
import unittest
from pathlib import Path

import h3

try:
    from . import centers as c
except ImportError:
    import centers as c


class CentersTests(unittest.TestCase):
    def setUp(self):
        self.a = h3.latlng_to_cell(28.54, -81.38, 8)
        self.b = min(set(h3.grid_disk(self.a, 1)) - {self.a})
        self.far = min(h3.grid_ring(self.a, 5))

    def test_top_share_ceiling_and_id_ties(self):
        values = {'c': 5, 'a': 5, 'b': 5, 'd': 1, 'e': 0}
        selected, rule = c.top_cells(values, .3)
        self.assertEqual(selected, {'a', 'b'})
        self.assertEqual(rule['threshold'], 5)
        self.assertEqual(rule['cells_tied_at_threshold'], 3)
        self.assertEqual(rule['selected_at_threshold'], 2)
        self.assertEqual(c.top_cells({'a': 2}, .05)[0], {'a'})
        self.assertEqual(c.top_cells(dict(reversed(list(values.items()))), .3), (selected, rule))
        with self.assertRaises(ValueError):
            c.top_cells({}, .05)

    def test_adjacent_union_and_disconnected_cluster(self):
        self.assertEqual(c.clusters([self.far, self.b, self.a]),
                         sorted([sorted([self.a, self.b]), [self.far]]))
        self.assertEqual(c.clusters([self.a, self.b, self.far]),
                         c.clusters([self.far, self.b, self.a]))
        self.assertEqual(c.clusters([]), [])

    def test_weights_fallback_criteria_and_missingness(self):
        # With 20 observed cells, each ranking selects exactly one. The two
        # winners touch, so their union must become one center, meeting both.
        cells = sorted(h3.grid_disk(self.a, 3))[:20]
        cells = sorted(set(cells) | {self.a, self.b})[:]
        jobs = {cell: 0 for cell in cells}
        population = {cell: 0 for cell in cells}
        jobs[self.a], population[self.b] = 100, 200
        # Choose exactly 20 cells, keeping both winners.
        keep = [self.a, self.b] + [v for v in cells if v not in (self.a, self.b)][:18]
        jobs = {cell: jobs[cell] for cell in keep}
        population = {cell: population[cell] for cell in keep}
        features, _ = c.make_centers(jobs, population)
        self.assertEqual(len(features), 1)
        props = features[0]['properties']
        self.assertEqual((props['total_jobs'], props['total_population'], props['criteria']), (100, 200, 'both'))
        expected = list(h3.cell_to_latlng(self.a))[::-1]
        for actual, value in zip(features[0]['geometry']['coordinates'], expected):
            self.assertAlmostEqual(actual, value)
        # Disjoint source inventories must not silently label missing data measured zero.
        features, _ = c.make_centers({self.a: 10}, {self.far: 20})
        fallback = next(f for f in features if self.far in f['properties']['hexagons'])
        self.assertEqual(fallback['properties']['centroid_weight'], 'population')
        self.assertEqual(fallback['properties']['missing_job_hexagons'], 1)
        self.assertEqual(c.make_centers(dict(reversed(list(jobs.items()))), dict(reversed(list(population.items()))))[0],
                         c.make_centers(jobs, population)[0])

    @staticmethod
    def point(name, lon, lat):
        return {'type': 'Feature', 'properties': {'id': name},
                'geometry': {'type': 'Point', 'coordinates': [lon, lat]}}

    def test_nearest_ties_cap_and_undirected_dedup(self):
        points = [self.point('a', 0, 0), self.point('b', .1, 0), self.point('c', -.1, 0), self.point('z', 10, 0)]
        edges = c.connections(points, k=1, max_km=40)
        self.assertEqual([(e['properties']['from_id'], e['properties']['to_id']) for e in edges], [('a', 'b'), ('a', 'c')])
        self.assertEqual(edges, c.connections(list(reversed(points)), k=1, max_km=40))
        self.assertTrue(all(len(e['geometry']['coordinates']) == 2 for e in edges))
        self.assertEqual(c.connections(points, k=1, max_km=1), [])
        groups, isolated = c.components(points, edges)
        self.assertEqual(groups, [['a', 'b', 'c'], ['z']])
        self.assertEqual(isolated, ['z'])
        # b and c are equidistant from a; give each a closer neighbor,
        # so the a-b versus a-c tie is observable after undirected deduplication.
        points = [self.point('a', 0, 0), self.point('b', -.1, 0),
                  self.point('c', .1, 0), self.point('d', -.1, .01), self.point('e', .1, .01)]
        pairs = {(e['properties']['from_id'], e['properties']['to_id'])
                 for e in c.connections(points, k=1)}
        self.assertIn(('a', 'b'), pairs)
        self.assertNotIn(('a', 'c'), pairs)

    def test_percentiles_and_singleton(self):
        self.assertEqual(c.percentiles([0, 10])['25'], 2.5)
        self.assertIsNone(c.percentiles([])['50'])
        points = [self.point('only', 0, 0)]
        self.assertEqual(c.connections(points), [])
        self.assertEqual(c.components(points, []), ([['only']], ['only']))

    def test_tiny_file_pipeline_reproducible_and_input_immutable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            features = [{'type': 'Feature', 'properties': {'h3': cell, 'population': value},
                         'geometry': {'type': 'Polygon', 'coordinates': []}}
                        for cell, value in [(self.a, 10), (self.b, 20)]]
            (root / c.POPULATION_FILE).write_text(json.dumps({'type': 'FeatureCollection', 'features': features}))
            with (root / c.WAC_FILE).open('w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=['w_geocode','tract_geoid','county','jobs_total','lat','lon'])
                writer.writeheader()
                for block, jobs in [('012345678901234', 3), ('012345678901235', 4)]:
                    lat, lon = h3.cell_to_latlng(self.a)
                    writer.writerow(dict(w_geocode=block,tract_geoid='01234567890',county='synthetic',jobs_total=jobs,lat=lat,lon=lon))
            original = {p.name: p.read_bytes() for p in root.iterdir()}
            first = c.analyze(root)
            self.assertEqual(first[2]['all_jobs'], 7)
            self.assertFalse(first[2]['sources']['jobs']['fallback'])
            self.assertEqual(first[2]['all_population'], 30)
            c.write_outputs(root/'out1', *first)
            c.write_outputs(root/'out2', *c.analyze(root))
            for name in original:
                self.assertEqual((root/name).read_bytes(), original[name])
            for file in (root/'out1').iterdir():
                self.assertEqual(file.read_bytes(), (root/'out2'/file.name).read_bytes())
            # Absence of WAC allows the explicit, labeled OD fallback.
            (root/c.WAC_FILE).unlink()
            (root/c.OD_FILE).write_text(f'w_hex,S000\n{self.a},5\n{self.a},7\n')
            jobs, info = c.load_jobs(root)
            self.assertEqual(jobs, {self.a: 12})
            self.assertTrue(info['fallback'])


if __name__ == '__main__':
    unittest.main()
