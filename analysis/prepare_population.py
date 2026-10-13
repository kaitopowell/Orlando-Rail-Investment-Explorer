#!/usr/bin/env python3
"""Join supplied ACS 2024 5-year B01003 CSVs to local 2024 tract geometry, offline."""
import argparse
import csv
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from osgeo import ogr, osr

ROOT = Path(__file__).resolve().parents[1]
COUNTIES = {'12069': 'Lake', '12095': 'Orange', '12097': 'Osceola', '12117': 'Seminole'}


def code(value, width):
    # Never coerce geography identifiers through integer or floating-point types.
    if not isinstance(value, str) or not value.strip().isascii() or not value.strip().isdigit() or len(value.strip()) > width:
        raise ValueError(f'Invalid {width}-digit geographic code: {value!r}')
    return value.strip().zfill(width)


def geoid(row, tract=True):
    result = code(row['state'], 2) + code(row['county'], 3)
    if tract:
        result += code(row['tract'], 6)
    if row.get('GEOID', '').strip() and code(row['GEOID'], len(result)) != result:
        raise ValueError(f'GEOID disagrees with component codes: {row["GEOID"]!r}, {result}')
    return result


def population_number(value, margin=False):
    value = value.strip()
    if not value and margin:
        return None
    try:
        number = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError(f'Invalid population value: {value!r}') from exc
    if not number.is_finite():
        raise ValueError(f'Nonfinite population value: {value!r}')
    if number < 0 and margin:
        return None
    if number < 0 or number != number.to_integral_value():
        raise ValueError(f'Invalid population count: {value!r}')
    return int(number)  # Counts only; identifiers always remain strings.


def read_acs(path, tract=True):
    records = {}
    with path.open(newline='', encoding='utf-8-sig') as stream:
        reader = csv.DictReader(stream)  # Every CSV cell, including GEOID, stays a string.
        required = {'state', 'county', 'GEOID', 'B01003_001E', 'B01003_001M'} | ({'tract'} if tract else set())
        if not required <= set(reader.fieldnames or []):
            raise ValueError(f'Missing CSV columns in {path}: {sorted(required - set(reader.fieldnames or []))}')
        for row in reader:
            key = geoid(row, tract)
            if key[:5] not in COUNTIES:
                continue
            if key in records:
                raise ValueError(f'Duplicate ACS GEOID: {key}')
            records[key] = {'pop_est': population_number(row['B01003_001E']),
                            'pop_moe': population_number(row['B01003_001M'], margin=True)}
    return records


def density(estimate, land_area):
    if land_area < 0:
        raise ValueError('Negative boundary ALAND')
    return estimate / (land_area / 1_000_000) if land_area > 0 else None


def reconciliation(tracts, boundaries, counties):
    report = {'acs_only': sorted(tracts.keys() - boundaries.keys()),
              'boundaries_only': sorted(boundaries.keys() - tracts.keys()), 'county_totals': {}}
    for fips, name in COUNTIES.items():
        total = sum(r['pop_est'] for key, r in tracts.items() if key.startswith(fips))
        joined = sum(tracts[key]['pop_est'] for key in tracts.keys() & boundaries.keys() if key.startswith(fips))
        expected = counties.get(fips, {}).get('pop_est')
        report['county_totals'][fips] = {'county': name, 'tract_total': total, 'joined_total': joined,
                                         'county_estimate': expected,
                                         'difference': None if expected is None else total - expected,
                                         'joined_difference': None if expected is None else joined - expected}
    return report


def generate(raw_dir, output):
    ogr.UseExceptions()
    tracts = read_acs(raw_dir / 'acs_b01003_tracts_2024_5yr.csv')
    counties = read_acs(raw_dir / 'acs_b01003_counties_2024_5yr.csv', tract=False)
    archive = (raw_dir / 'cb_2024_12_tract_500k.zip').resolve()
    dataset = ogr.Open(f'/vsizip/{archive}')
    if dataset is None:
        raise ValueError(f'Cannot read boundary archive: {archive}')
    layer = dataset.GetLayer(0)
    source = layer.GetSpatialRef().Clone()
    projected, target = osr.SpatialReference(), osr.SpatialReference()
    projected.ImportFromEPSG(26917)
    target.ImportFromEPSG(4326)
    for crs in (source, projected, target):
        crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    to_metres = osr.CoordinateTransformation(source, projected)
    to_wgs84 = osr.CoordinateTransformation(projected, target)
    boundaries = {}
    for record in layer:
        key = geoid({'state': record.GetFieldAsString('STATEFP'), 'county': record.GetFieldAsString('COUNTYFP'),
                     'tract': record.GetFieldAsString('TRACTCE'), 'GEOID': record.GetFieldAsString('GEOID')})
        if key[:5] not in COUNTIES:
            continue
        if key in boundaries:
            raise ValueError(f'Duplicate boundary GEOID: {key}')
        boundaries[key] = (record.GetGeometryRef().Clone(), record.GetFieldAsInteger64('ALAND'))
    report = reconciliation(tracts, boundaries, counties)
    print(json.dumps(report, indent=2))
    if not tracts or not boundaries:
        raise ValueError('No selected tract records or boundaries')
    # Never silently drop unmatched geographies or produce an incomplete layer.
    if report['acs_only'] or report['boundaries_only'] or set(counties) != set(COUNTIES):
        raise ValueError('Unmatched GEOIDs or missing county totals; output was not written')
    features = []
    for key in sorted(tracts):
        geometry, land = boundaries[key]
        geometry.Transform(to_metres)
        geometry = geometry.SimplifyPreserveTopology(30)  # Display geometry only; ALAND is unchanged.
        if geometry.IsEmpty() or not geometry.IsValid():
            raise ValueError(f'Invalid simplified geometry: {key}')
        geometry.Transform(to_wgs84)
        properties = {'GEOID': key, 'county': COUNTIES[key[:5]], **tracts[key],
                      'density': density(tracts[key]['pop_est'], land)}
        features.append({'type': 'Feature', 'properties': properties,
                         'geometry': json.loads(geometry.ExportToJson())})
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, allow_nan=False, separators=(',', ':')) + '\n')
    print(f'Wrote {len(features)} tracts, including {sum(f["properties"]["pop_est"] == 0 for f in features)} zero-population tracts; density in people/km² of ALAND.')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir', type=Path, default=ROOT / 'data/raw')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/data/population_tracts.geojson')
    args = parser.parse_args()
    generate(args.raw_dir, args.output)
