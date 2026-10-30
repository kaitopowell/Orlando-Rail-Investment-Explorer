#!/usr/bin/env python3
"""Florida LODES OD -> H3 r8 job flows, with reference-safe verification.

Run with Python GDAL bindings and analysis/rail/requirements.txt installed.
Default: download/cache sources, reconcile, compare every pair/count against the
existing reference, then write deterministic gzip only if all checks pass.
--verify-only never writes the output. Raw download metadata stays gitignored.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
import re
import shutil
import sys
import tempfile
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OD_URL = 'https://lehd.ces.census.gov/data/lodes/LODES8/fl/od/fl_od_main_JT00_2023.csv.gz'
BLOCK_URL = 'https://www2.census.gov/geo/tiger/TIGER2025/TABBLOCK20/tl_2025_12_tabblock20.zip'
COUNTIES = frozenset({'069', '095', '097', '117'})
COUNTS = ('S000', 'SE01', 'SE02', 'SE03')
COLUMNS = ('h_hex', 'w_hex', *COUNTS)
RESOLUTION = 8
EXPECTED = {
    'input_rows': 8_416_045,
    'input_jobs': 9_491_708,
    'both_counties_jobs': 1_006_088,
    'work_counties_jobs': 1_467_549,
    'blocks': 39_751,
    'hexagons': 6_928,
    'pairs': 591_177,
    'unmatched_blocks': 0,
}


def block_id(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{15}', value):
        raise ValueError(f'Block ID must be 15 digits of text: {value!r}')
    return value


def in_region(value: str) -> bool:
    return value[:2] == '12' and value[2:5] in COUNTIES


def integer(value: str) -> int:
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]+', value):
        raise ValueError(f'Expected nonnegative integer count, got {value!r}')
    return int(value)


def open_csv(path: Path):
    return (gzip.open if path.suffix == '.gz' else open)(
        path, 'rt', encoding='utf-8-sig', newline='')


def sha256(path: Path) -> str:
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def download(url: str, directory: Path) -> dict:
    """Atomic, TLS-verified download; reuse caches without inventing their date."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / url.rsplit('/', 1)[1]
    metadata_path = path.with_name(path.name + '.download.json')
    if path.exists():
        digest = sha256(path)
        if metadata_path.exists():
            metadata = json.loads(metadata_path.read_text())
            if metadata['url'] != url or metadata['sha256'] != digest:
                raise ValueError(f'Cached download provenance/checksum mismatch: {path}')
        else:
            metadata = {'url': url, 'sha256': digest, 'downloaded_at_utc': None}
        return {**metadata, 'path': str(path), 'cached': True}
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as target:
            temporary = Path(target.name)
            with urllib.request.urlopen(url, timeout=120) as source:
                shutil.copyfileobj(source, target)
        metadata = {'url': url, 'sha256': sha256(temporary),
                    'downloaded_at_utc': datetime.now(timezone.utc).isoformat()}
        temporary.replace(path)
        metadata_path.write_text(json.dumps(metadata, indent=2) + '\n')
        return {**metadata, 'path': str(path), 'cached': False}
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def block_records(archive: Path):
    """Use DBF string fields and internal points; do not calculate centroids."""
    from osgeo import ogr
    ogr.UseExceptions()
    dataset = ogr.Open(f'/vsizip/{archive.resolve()}')
    if dataset is None:
        raise ValueError(f'Cannot open Census block archive: {archive}')
    layer = dataset.GetLayer(0)
    required = ('GEOID20', 'INTPTLAT20', 'INTPTLON20')
    definition = layer.GetLayerDefn()
    for name in required:
        index = definition.GetFieldIndex(name)
        if index < 0 or definition.GetFieldDefn(index).GetType() != ogr.OFTString:
            raise ValueError(f'{name} must be a text field in the Census archive')
    layer.SetIgnoredFields(['OGR_GEOMETRY'])
    for feature in layer:
        yield {name: feature.GetFieldAsString(name) for name in required}


def assign_blocks(records) -> dict[str, str]:
    import h3
    result = {}
    for row in records:
        geoid = block_id(row['GEOID20'])
        if not in_region(geoid):
            continue
        if geoid in result:
            raise ValueError(f'Duplicate Census block: {geoid}')
        lat, lon = float(row['INTPTLAT20']), float(row['INTPTLON20'])
        if not (math.isfinite(lat) and math.isfinite(lon) and
                -90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f'Invalid internal point for block {geoid}')
        result[geoid] = h3.latlng_to_cell(lat, lon, RESOLUTION)
    if not result:
        raise ValueError('No four-county Census blocks found')
    return result


def reconcile(flows, before, unmatched):
    after = [sum(counts[i] for counts in flows.values()) for i in range(len(COUNTS))]
    expected = [a - b for a, b in zip(before, unmatched)]
    if after != expected:
        raise ValueError(f'Reconciliation failed: aggregated {after}; '
                         f'before {before} minus unmatched {unmatched} = {expected}')
    return dict(zip(COUNTS, after))


def aggregate(rows, blocks: dict[str, str]):
    """Stream OD rows; count an unmatched flow once even if both ends are absent."""
    flows = {}
    stats = dict.fromkeys(('input_rows', 'input_jobs', 'work_counties_jobs',
                          'both_counties_jobs', 'both_counties_rows', 'unmatched_rows'), 0)
    before, missing = [0] * 4, [0] * 4
    missing_blocks = set()
    for row in rows:
        home, work = block_id(row['h_geocode']), block_id(row['w_geocode'])
        counts = [integer(row[name]) for name in COUNTS]
        stats['input_rows'] += 1
        stats['input_jobs'] += counts[0]
        if not in_region(work):
            continue
        stats['work_counties_jobs'] += counts[0]
        if not in_region(home):
            continue
        stats['both_counties_rows'] += 1
        stats['both_counties_jobs'] += counts[0]
        before = [a + b for a, b in zip(before, counts)]
        absent = {code for code in (home, work) if code not in blocks}
        if absent:
            missing_blocks.update(absent)
            stats['unmatched_rows'] += 1
            missing = [a + b for a, b in zip(missing, counts)]
            continue
        key = blocks[home], blocks[work]
        totals = flows.setdefault(key, [0] * 4)
        for i, count in enumerate(counts):
            totals[i] += count
    totals = reconcile(flows, before, missing)
    work_totals = Counter()
    for (_, work), counts in flows.items():
        work_totals[work] += counts[0]
    stats.update(blocks=len(blocks), hexagons=len(set(blocks.values())), pairs=len(flows),
                 flow_hexagons=len({cell for pair in flows for cell in pair}),
                 unmatched_blocks=len(missing_blocks), unmatched_block_ids=sorted(missing_blocks),
                 before_counts=dict(zip(COUNTS, before)), unmatched_counts=dict(zip(COUNTS, missing)),
                 aggregated_counts=totals,
                 top_work_hexagon=work_totals.most_common(1))
    return flows, stats


def compare_reference(flows, path: Path) -> dict:
    """Compare keyed integer content, independent of CSV row order/gzip bytes."""
    import h3
    seen = set()
    missing, changed, examples = 0, 0, []
    with open_csv(path) as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or set(reader.fieldnames) != set(COLUMNS) or len(reader.fieldnames) != len(COLUMNS):
            raise ValueError(f'Reference columns differ: {reader.fieldnames!r}')
        for row in reader:
            key = row['h_hex'], row['w_hex']
            if not all(h3.is_valid_cell(cell) and h3.get_resolution(cell) == RESOLUTION for cell in key):
                raise ValueError(f'Invalid H3 resolution-8 reference pair: {key}')
            if key in seen:
                raise ValueError(f'Duplicate reference pair: {key}')
            seen.add(key)
            counts = [integer(row[name]) for name in COUNTS]
            if key not in flows:
                missing += 1
            elif flows[key] != counts:
                changed += 1
            else:
                continue
            if len(examples) < 5:
                examples.append({'pair': key, 'reference': counts, 'generated': flows.get(key)})
    added = len(flows.keys() - seen)
    return {'path': str(path), 'rows': len(seen), 'missing_pairs': missing,
            'extra_pairs': added, 'changed_pairs': changed, 'examples': examples,
            'matches': not (missing or added or changed)}


def write_output(flows, path: Path):
    """Deterministic row order/compression, atomic replacement, no partial output."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as raw:
            temporary = Path(raw.name)
            with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
                with io.TextIOWrapper(compressed, encoding='utf-8', newline='') as text:
                    writer = csv.writer(text, lineterminator='\n')
                    writer.writerow(COLUMNS)
                    for key in sorted(flows):
                        writer.writerow((*key, *flows[key]))
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def verify(flows, stats, reference: Path) -> dict:
    differences = {name: {'expected': value, 'actual': stats.get(name)}
                   for name, value in EXPECTED.items() if stats.get(name) != value}
    comparison = compare_reference(flows, reference)
    return {'summary_differences': differences, 'reference': comparison,
            'verified': not differences and comparison['matches']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir', type=Path, default=ROOT / 'data/raw')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/processed/lodes_od_hex8_2023.csv.gz')
    parser.add_argument('--reference', type=Path, help='Existing CSV or CSV.gz; never overwritten on mismatch')
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--report', type=Path, help='Write machine-readable provenance and verification report')
    args = parser.parse_args(argv)
    reference = args.reference
    if reference is None:
        candidates = [ROOT / 'data/processed/lodes_od_hex8_2023.csv.gz',
                      ROOT / 'data/processed/lodes_od_hex8_2023.csv']
        reference = next((path for path in candidates if path.exists()), candidates[0])
    if not reference.is_file():
        parser.error(f'Reference not found: {reference}; supply --reference')
    if args.report and args.report.resolve() in {reference.resolve(), args.output.resolve()}:
        parser.error('--report must not replace the reference or output')
    report = {'verified': False, 'reference_path': str(reference),
              'reference_sha256': sha256(reference),
              'source_urls': [OD_URL, BLOCK_URL], 'sources': []}
    try:
        for url in (OD_URL, BLOCK_URL):
            report['sources'].append(download(url, args.raw_dir))
        blocks = assign_blocks(block_records(Path(report['sources'][1]['path'])))
        with open_csv(Path(report['sources'][0]['path'])) as source:
            flows, stats = aggregate(csv.DictReader(source), blocks)
        report['statistics'] = stats
        report.update(verify(flows, stats, reference))
        if not report['verified']:
            raise ValueError('Reference verification failed; output and reference left unchanged')
        if not args.verify_only:
            # Preserve even the compression bytes of an already matching output.
            if args.output.exists():
                if not compare_reference(flows, args.output)['matches']:
                    raise ValueError('Existing output differs; refusing to overwrite it')
                report['output'] = 'Already matches; left unchanged'
            else:
                write_output(flows, args.output)
                report['output'] = str(args.output)
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, ImportError) as exc:
        report['verified'] = False
        report['error'] = str(exc)
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1
    finally:
        serialized = json.dumps(report, indent=2) + '\n'
        print(serialized, end='')
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(serialized)


if __name__ == '__main__':
    sys.exit(main())
