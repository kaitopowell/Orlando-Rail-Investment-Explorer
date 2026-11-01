#!/usr/bin/env python3
"""Offline stop-proximity screening of LODES job flows; not transit routing.

Requires only h3 v4 and the Python standard library. Inputs are read-only.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
from pathlib import Path

import h3

# Analysis assumptions, not established walking-distance or service standards.
K_RINGS = 1
FREQUENT_HEADWAY_MINUTES = 15.0
HEADWAY_FIELD = 'headway_best_route_min'  # Minutes, best route incl. LYMMO.
RESOLUTION = 8  # Inherited from the authoritative OD input.
ROOT = Path(__file__).resolve().parents[2]
COUNTS = ('S000', 'SE01', 'SE02', 'SE03')
EXPECTED_TOTALS = dict(zip(COUNTS, (1_006_088, 164_743, 314_222, 527_123)))
GROUPS = ('both_covered', 'home_only', 'work_only', 'neither')
STOP_FILES = {
    'lynx': 'lynx_stops_peak_headway.geojson',
    'sunrail': 'sunrail_stations.geojson',
    'brightline': 'brightline_stations.geojson',
}
FLOW_FILE = 'lodes_od_hex8_2023.csv'
SCENARIOS = ('any_transit', 'frequent_transit', 'rail_only', 'any_transit_no_brightline')


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def positive_number(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value > 0)


def stop_cells(collection, headway_field=None):
    """Return a cell per original Point and an inventory of the actual schema."""
    if collection.get('type') != 'FeatureCollection':
        raise ValueError('Stop layer must be a GeoJSON FeatureCollection')
    features = collection.get('features')
    if not isinstance(features, list):
        raise ValueError('Stop features must be an array')
    crs = collection.get('crs', {}).get('properties', {}).get('name')
    if crs not in (None, 'urn:ogc:def:crs:OGC:1.3:CRS84', 'EPSG:4326',
                   'urn:ogc:def:crs:EPSG::4326'):
        raise ValueError(f'Unsupported stop coordinate reference system: {crs}')
    cells, headways, properties, geometries = [], [], set(), set()
    for index, feature in enumerate(features):
        geometry, props = feature.get('geometry'), feature.get('properties')
        if not isinstance(geometry, dict) or geometry.get('type') != 'Point':
            raise ValueError(f'Stop {index} must be a Point')
        if not isinstance(props, dict):
            raise ValueError(f'Stop {index} properties must be an object')
        coords = geometry.get('coordinates')
        if not isinstance(coords, list) or len(coords) < 2:
            raise ValueError(f'Stop {index} has invalid coordinates')
        lon, lat = coords[:2]
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool)
                   and math.isfinite(v) for v in (lat, lon)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f'Stop {index} has invalid longitude/latitude')
        cells.append(h3.latlng_to_cell(lat, lon, RESOLUTION))
        properties.update(props)
        geometries.add(geometry['type'])
        if headway_field is not None:
            if headway_field not in props:
                raise ValueError(f'Stop {index} missing headway field {headway_field}')
            headway = props[headway_field]
            if headway is not None and not positive_number(headway):
                raise ValueError(f'Stop {index} has invalid headway: {headway!r}')
            headways.append(headway)
    inventory = {'features': len(features), 'geometry_types': sorted(geometries),
                 'property_names': sorted(properties), 'unique_stop_cells': len(set(cells)),
                 'frequency_field_used': headway_field}
    if headway_field is not None:
        known = [v for v in headways if v is not None]
        inventory.update(headway_units='minutes', null_headways=len(headways)-len(known),
                         headway_min=min(known) if known else None,
                         headway_max=max(known) if known else None)
    else:
        inventory['frequency_note'] = 'No frequency field in the inspected rail layer; excluded from frequent_transit.'
    return cells, headways, inventory


def expand_cells(cells, rings=K_RINGS):
    if isinstance(rings, bool) or not isinstance(rings, int) or rings < 0:
        raise ValueError('K rings must be a nonnegative integer')
    covered = set()
    for cell in set(cells):
        if not h3.is_valid_cell(cell) or h3.get_resolution(cell) != RESOLUTION:
            raise ValueError(f'Invalid resolution-8 stop cell: {cell}')
        covered.update(h3.grid_disk(cell, rings))
    return covered


def scenarios_from_stops(layers, rings=K_RINGS, headway_minutes=FREQUENT_HEADWAY_MINUTES):
    if not positive_number(headway_minutes):
        raise ValueError('Frequent headway threshold must be positive finite minutes')
    converted, inventory = {}, {}
    for mode in STOP_FILES:
        cells, headways, inventory[mode] = stop_cells(layers[mode], HEADWAY_FIELD if mode == 'lynx' else None)
        converted[mode] = cells
        if mode == 'lynx':
            frequent = [cell for cell, minutes in zip(cells, headways)
                        if minutes is not None and minutes <= headway_minutes]
            inventory[mode]['frequent_selected_stops'] = len(frequent)
    seeds = {
        'any_transit': converted['lynx'] + converted['sunrail'] + converted['brightline'],
        'frequent_transit': frequent,
        'rail_only': converted['sunrail'] + converted['brightline'],
        'any_transit_no_brightline': converted['lynx'] + converted['sunrail'],
    }
    coverage = {name: expand_cells(cells, rings) for name, cells in seeds.items()}
    selection = {name: {'selected_stop_features': len(cells),
                        'unique_stop_cells': len(set(cells)), 'covered_hexagons': len(coverage[name])}
                 for name, cells in seeds.items()}
    return coverage, inventory, selection, set(seeds['any_transit'])


def spatial_scale(cells, rings=K_RINGS):
    """H3 global average plus actual spherical lengths at the supplied stop cells."""
    average = h3.average_hexagon_edge_length(RESOLUTION, unit='m')
    edges = [h3.edge_length(edge, unit='m') for cell in sorted(cells)
             for edge in h3.origin_to_directed_edges(cell)]
    distances = [h3.great_circle_distance(h3.cell_to_latlng(cell), h3.cell_to_latlng(neighbor), unit='m')
                 for cell in sorted(cells) for neighbor in h3.grid_disk(cell, rings) if cell != neighbor]

    def describe(values):
        return {'min': min(values), 'mean': sum(values)/len(values), 'max': max(values)} if values else None

    return {'units': 'metres', 'global_average_edge_m': average,
            'actual_stop_cell_directed_edges_m': describe(edges),
            'approximate_k1_center_reach_m': math.sqrt(3)*average,
            'approximate_selected_k_center_reach_m': rings*math.sqrt(3)*average,
            'actual_selected_k_center_distances_m': describe(distances),
            'method': 'H3 edge_length and great_circle_distance; regular-hex approximation K*sqrt(3)*average edge. Not walking-network distance or a bound on stop-to-point distance.'}


def classify(home, work, covered):
    h, w = home in covered, work in covered
    return 'both_covered' if h and w else 'home_only' if h else 'work_only' if w else 'neither'


def reconcile(groups, expected_totals, expected_rows):
    actual = {column: sum(group['counts'][column] for group in groups.values()) for column in COUNTS}
    rows = sum(group['flow_rows'] for group in groups.values())
    if set(groups) != set(GROUPS) or actual != expected_totals or rows != expected_rows:
        raise ValueError(f'Coverage reconciliation failed: counts={actual}, expected={expected_totals}; rows={rows}, expected_rows={expected_rows}')


def aggregate_flows(rows, coverage, expected_totals=None):
    if expected_totals is None:
        expected_totals = EXPECTED_TOTALS
    results = {scenario: {group: {'flow_rows': 0, 'counts': dict.fromkeys(COUNTS, 0)} for group in GROUPS}
               for scenario in coverage}
    totals, pairs, cells = dict.fromkeys(COUNTS, 0), set(), set()
    for row in rows:
        pair = (row['h_hex'], row['w_hex'])
        if pair in pairs:
            raise ValueError(f'Duplicate home-work pair: {pair}')
        pairs.add(pair)
        for cell in pair:
            if cell not in cells:
                if not isinstance(cell, str) or not h3.is_valid_cell(cell) or h3.get_resolution(cell) != RESOLUTION:
                    raise ValueError(f'Invalid resolution-8 flow cell: {cell!r}')
                cells.add(cell)
        counts = {}
        for column in COUNTS:
            value = row[column]
            if not isinstance(value, str) or not re.fullmatch(r'[0-9]+', value):
                raise ValueError(f'Invalid integer job count {column}: {value!r}')
            counts[column] = int(value)
            totals[column] += counts[column]
        for scenario, covered in coverage.items():
            group = results[scenario][classify(*pair, covered)]
            group['flow_rows'] += 1
            for column in COUNTS:
                group['counts'][column] += counts[column]
    if totals != expected_totals:
        raise ValueError(f'Input totals differ from authoritative reference: {totals}; expected {expected_totals}')
    for groups in results.values():
        reconcile(groups, expected_totals, len(pairs))
        for group in groups.values():
            group['flow_share'] = group['flow_rows']/len(pairs) if pairs else None
            group['shares'] = {column: group['counts'][column]/totals[column] if totals[column] else None
                               for column in COUNTS}
    return results, {'flow_rows': len(pairs), 'flow_hexagons': len(cells), 'counts': totals}


def analyze(input_dir, rings=K_RINGS, headway_minutes=FREQUENT_HEADWAY_MINUTES):
    layers, sources = {}, {}
    for mode, filename in STOP_FILES.items():
        path = input_dir / filename
        layers[mode] = json.loads(path.read_text(encoding='utf-8'))
        sources[mode] = {'file': filename, 'sha256': digest(path)}
    coverage, inventory, selection, seeds = scenarios_from_stops(layers, rings, headway_minutes)
    path = input_dir / FLOW_FILE
    sources['flows'] = {'file': FLOW_FILE, 'sha256': digest(path)}
    with path.open(encoding='utf-8-sig', newline='') as source:
        rows = csv.DictReader(source)
        if rows.fieldnames is None or not set(('h_hex', 'w_hex', *COUNTS)) <= set(rows.fieldnames):
            raise ValueError('Missing required flow columns')
        results, flow_inventory = aggregate_flows(rows, coverage)
    summary = {
        'schema_version': 1, 'h3_version': h3.__version__, 'sources': sources,
        'parameters': {'resolution': RESOLUTION, 'k_rings_assumption': rings,
                       'frequent_headway_minutes_assumption': headway_minutes,
                       'lynx_headway_field': HEADWAY_FIELD, 'lymmo_included': True,
                       'frequent_rail_treatment': 'Excluded: neither rail station layer has frequency fields.',
                       'catchment_citation': 'TBD'},
        'spatial_scale': spatial_scale(seeds, rings), 'stop_inventory': inventory,
        'flow_inventory': flow_inventory, 'scenario_selection': selection,
        'scenarios': results, 'reconciled': True,
        'interpretation': 'Stop proximity only. Both ends covered does not establish a usable or connected transit trip, travel time, ridership, or unique people.'}
    return summary, coverage


def write_outputs(summary, coverage, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / 'transit_coverage_summary.json').write_text(
        json.dumps(summary, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    with (output_dir / 'transit_coverage_hex8.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(('scenario', 'h3'))
        for scenario in sorted(coverage):
            for cell in sorted(coverage[scenario]):
                writer.writerow((scenario, cell))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, default=ROOT / 'data/processed')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'data/processed')
    parser.add_argument('--rings', type=int, default=K_RINGS)
    parser.add_argument('--headway-minutes', type=float, default=FREQUENT_HEADWAY_MINUTES)
    args = parser.parse_args()
    try:
        summary, coverage = analyze(args.input_dir, args.rings, args.headway_minutes)
        write_outputs(summary, coverage, args.output_dir)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'ERROR: {error}\n')
    print(json.dumps(summary['spatial_scale'], indent=2))
    for scenario, groups in summary['scenarios'].items():
        print(scenario)
        for group, values in groups.items():
            print(f"  {group}: {values['flow_rows']:,} flow rows; "
                  + ', '.join(f"{column}={values['counts'][column]:,} ({values['shares'][column]:.4%})" for column in COUNTS))
    print('All four groups reconcile in every scenario. Stop proximity is not verified transit usability.')


if __name__ == '__main__':
    main()
