"""Tiny DBF-only fixtures built with the standard library; no GDAL or network."""
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path

from rail.od import block_records


class BlockAttributeTests(unittest.TestCase):
    def archive(self, directory, fields, values, members=('nested/blocks.DBF',)):
        # One dBASE III record, all text fields. This is synthetic test data.
        header_size = 32 + 32 * len(fields) + 1
        record_size = 1 + sum(width for _, width in fields)
        header = struct.pack('<BBBBIHH20x', 3, 126, 10, 30, 1, header_size, record_size)
        descriptors = b''.join(struct.pack('<11sc4xBB14x', name.encode().ljust(11, b'\0'),
                                           b'C', width, 0) for name, width in fields)
        record = b' ' + b''.join(value.encode().ljust(width, b' ')
                                 for (_, width), value in zip(fields, values))
        contents = header + descriptors + b'\r' + record + b'\x1a'
        path = Path(directory) / 'fixture.zip'
        with zipfile.ZipFile(path, 'w') as archive:
            for member in members:
                archive.writestr(member, contents)
        return path

    def test_four_expected_columns_without_geometry(self):
        fields = [('GEOID20', 15), ('COUNTYFP20', 3), ('INTPTLAT20', 11), ('INTPTLON20', 12)]
        values = ['010950001001001', '095', '+28.5400000', '-081.3800000']
        with tempfile.TemporaryDirectory() as directory:
            path = self.archive(directory, fields, values)
            rows = list(block_records(path))
        self.assertEqual(rows, [dict(zip((name for name, _ in fields), values))])
        self.assertTrue(all(isinstance(value, str) for value in rows[0].values()))
        self.assertEqual(len(rows[0]['GEOID20']), 15)

    def test_missing_columns_and_ambiguous_tables_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.archive(directory, [('GEOID20', 15)], ['120950001001001'])
            with self.assertRaisesRegex(ValueError, 'INTPTLAT20 must be a text field'):
                list(block_records(path))
            for members in ((), ('first.dbf', 'second.dbf')):
                path = self.archive(directory, [], [], members)
                with self.assertRaisesRegex(ValueError, 'exactly one DBF'):
                    list(block_records(path))


if __name__ == '__main__':
    unittest.main()
