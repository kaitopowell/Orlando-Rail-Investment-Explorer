"""Tiny synthetic fixtures only: no downloads or production dataset assertions."""
import csv
import gzip
import io
import json
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import patch

from rail import od


class ODTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.a = '120950001001001'
        self.b = '121170001001001'
        self.c = '120690001001001'
        self.d = '120970001001001'
        self.out = '120010001001001'
        self.missing = '120950001001009'
        self.records = [dict(GEOID20=key, INTPTLAT20=lat, INTPTLON20=lon)
                        for key, lat, lon in [
                            (self.a, '28.54', '-81.38'),
                            (self.b, '28.54', '-81.38'),
                            (self.c, '28.80', '-81.70'),
                            (self.d, '28.30', '-81.40'),
                            (self.out, '29.60', '-82.30')]]
        self.blocks = od.assign_blocks(self.records)

    def row(self, h, w, counts=(6, 1, 2, 3)):
        return dict(zip(('h_geocode', 'w_geocode', *od.COUNTS), (h, w, *map(str, counts))))

    def test_counties_direction_and_coalescing(self):
        rows = [self.row(self.a, self.c), self.row(self.b, self.c),
                self.row(self.c, self.a), self.row(self.d, self.d),
                self.row(self.out, self.a), self.row(self.a, self.out)]
        flows, stats = od.aggregate(rows, self.blocks)
        self.assertEqual(len(self.blocks), 4)
        self.assertEqual(len(set(self.blocks.values())), 3)
        self.assertEqual(stats['input_rows'], 6)
        self.assertEqual(stats['input_jobs'], 36)
        self.assertEqual(stats['work_counties_jobs'], 30)
        self.assertEqual(stats['both_counties_jobs'], 24)
        self.assertEqual(stats['pairs'], 3)
        self.assertEqual(stats['aggregated_counts'], dict(zip(od.COUNTS, (24, 4, 8, 12))))
        self.assertEqual(flows[self.blocks[self.a], self.blocks[self.c]], [12, 2, 4, 6])
        self.assertEqual(flows[self.blocks[self.c], self.blocks[self.a]], [6, 1, 2, 3])
        self.assertIn((self.blocks[self.d], self.blocks[self.d]), flows)
        self.assertEqual(stats['unmatched_blocks'], 0)

    def test_unmatched_flow_counted_once_for_two_missing_ends(self):
        rows = [self.row(self.a, self.c), self.row(self.missing, self.missing),
                self.row(self.a, self.missing, (3, 0, 1, 2))]
        flows, stats = od.aggregate(rows, self.blocks)
        self.assertEqual(stats['unmatched_blocks'], 1)
        self.assertEqual(stats['unmatched_rows'], 2)
        self.assertEqual(stats['unmatched_counts'], dict(zip(od.COUNTS, (9, 1, 3, 5))))
        self.assertEqual(stats['aggregated_counts']['S000'], 6)
        self.assertEqual(len(flows), 1)
        with self.assertRaisesRegex(ValueError, 'Reconciliation failed'):
            od.reconcile(flows, [15, 2, 5, 9], [9, 1, 3, 5])

    def test_ids_and_invalid_input_fail_loudly(self):
        self.assertEqual(od.block_id('010010001001001'), '010010001001001')
        self.assertFalse(od.in_region('010950001001001'))
        for value in (120950001001001, '12095000100100', '12095000100100x'):
            with self.assertRaises(ValueError):
                od.block_id(value)
        for count in ('', '-1', '1.5', 'nan'):
            with self.assertRaises(ValueError):
                od.aggregate([self.row(self.a, self.c, (count, 0, 0, 0))], self.blocks)
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            od.assign_blocks(self.records + self.records[:1])
        for lat in ('nan', '91'):
            with self.assertRaises(ValueError):
                od.assign_blocks([{**self.records[0], 'INTPTLAT20': lat}])

    def test_internal_points_not_geometry(self):
        import h3
        from osgeo import ogr
        folder = self.root / 'shape'
        folder.mkdir()
        dataset = ogr.GetDriverByName('ESRI Shapefile').CreateDataSource(str(folder))
        layer = dataset.CreateLayer('blocks', geom_type=ogr.wkbPoint)
        for name in ('GEOID20', 'INTPTLAT20', 'INTPTLON20'):
            field = ogr.FieldDefn(name, ogr.OFTString)
            field.SetWidth(20)
            layer.CreateField(field)
        for row in self.records:
            feature = ogr.Feature(layer.GetLayerDefn())
            for name, value in row.items():
                feature.SetField(name, value)
            # Deliberately remote geometry: placement must use the internal point.
            feature.SetGeometry(ogr.CreateGeometryFromWkt('POINT (0 0)'))
            layer.CreateFeature(feature)
        feature = layer = dataset = None
        archive = self.root / 'blocks.zip'
        with zipfile.ZipFile(archive, 'w') as zipped:
            for path in folder.iterdir():
                zipped.write(path, path.name)
        actual = od.assign_blocks(od.block_records(archive))
        self.assertEqual(actual, self.blocks)
        self.assertEqual(actual[self.a], h3.latlng_to_cell(28.54, -81.38, 8))
        self.assertTrue(all(isinstance(key, str) and len(key) == 15 for key in actual))

    def test_content_comparison_ignores_order_and_compression(self):
        flows, _ = od.aggregate([self.row(self.a, self.c), self.row(self.d, self.a)], self.blocks)
        output = self.root / 'flows.csv.gz'
        od.write_output(flows, output)
        first_bytes = output.read_bytes()
        od.write_output(flows, output)
        self.assertEqual(first_bytes, output.read_bytes())
        self.assertTrue(od.compare_reference(flows, output)['matches'])
        plain = self.root / 'reference.csv'
        with gzip.open(output, 'rt') as source:
            lines = source.readlines()
        plain.write_text(lines[0] + ''.join(reversed(lines[1:])))
        self.assertTrue(od.compare_reference(flows, plain)['matches'])
        changed = {key: counts[:] for key, counts in flows.items()}
        changed[next(iter(changed))][1] += 1  # S000 unchanged; SE01 must still compare.
        self.assertEqual(od.compare_reference(changed, plain)['changed_pairs'], 1)
        removed = dict(flows)
        removed.pop(next(iter(removed)))
        self.assertEqual(od.compare_reference(removed, plain)['missing_pairs'], 1)
        extra = dict(flows)
        extra[self.blocks[self.d], self.blocks[self.d]] = [1, 0, 0, 1]
        self.assertEqual(od.compare_reference(extra, plain)['extra_pairs'], 1)
        plain.write_text(plain.read_text() + lines[1])
        with self.assertRaisesRegex(ValueError, 'Duplicate reference'):
            od.compare_reference(flows, plain)

    def test_main_protects_reference_and_existing_output_on_mismatch(self):
        raw = self.root / 'raw'
        raw.mkdir()
        with gzip.open(raw / od.OD_URL.rsplit('/', 1)[1], 'wt', newline='') as source:
            writer = csv.DictWriter(source, fieldnames=('h_geocode', 'w_geocode', *od.COUNTS))
            writer.writeheader()
            writer.writerow(self.row(self.a, self.c))
        (raw / od.BLOCK_URL.rsplit('/', 1)[1]).write_bytes(b'fixture replaced by patched record reader')
        flows, stats = od.aggregate([self.row(self.a, self.c)], self.blocks)
        reference = self.root / 'reference.csv.gz'
        od.write_output(flows, reference)
        original = reference.read_bytes()
        output = self.root / 'output.csv.gz'
        report = self.root / 'report.json'
        args = ['--raw-dir', str(raw), '--reference', str(reference), '--output', str(output), '--report', str(report)]
        with patch.object(od, 'block_records', return_value=iter(self.records)), redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(od.main(args), 1)  # Real-run expectations intentionally differ.
        self.assertFalse(output.exists())
        self.assertEqual(reference.read_bytes(), original)
        self.assertIn('input_rows', json.loads(report.read_text())['summary_differences'])
        expected = {key: stats[key] for key in od.EXPECTED}
        with patch.object(od, 'EXPECTED', expected), patch.object(od, 'block_records', side_effect=lambda _: iter(self.records)), redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(od.main(args + ['--verify-only']), 0)
            self.assertFalse(output.exists())
            self.assertEqual(od.main(args), 0)
            self.assertTrue(od.compare_reference(flows, output)['matches'])
            changed = {key: [2, 0, 1, 1] for key in flows}
            od.write_output(changed, output)
            old_output = output.read_bytes()
            self.assertEqual(od.main(args), 1)
            self.assertEqual(output.read_bytes(), old_output)
            od.write_output(changed, reference)
            changed_reference = reference.read_bytes()
            self.assertEqual(od.main(args), 1)
            self.assertEqual(reference.read_bytes(), changed_reference)

    def test_download_provenance_cache_and_failure_cleanup(self):
        url = 'https://example.test/fixture.gz'
        with patch.object(od.urllib.request, 'urlopen', return_value=io.BytesIO(b'fixture')):
            downloaded = od.download(url, self.root)
        self.assertFalse(downloaded['cached'])
        self.assertIsNotNone(downloaded['downloaded_at_utc'])
        with patch.object(od.urllib.request, 'urlopen', side_effect=AssertionError('must use cache')):
            self.assertTrue(od.download(url, self.root)['cached'])
        Path(downloaded['path']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            od.download(url, self.root)
        other = self.root / 'failure'
        with patch.object(od.urllib.request, 'urlopen', side_effect=OSError('network blocked')):
            with self.assertRaises(OSError):
                od.download(url, other)
        self.assertEqual(list(other.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
