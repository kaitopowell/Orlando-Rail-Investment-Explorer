#!/usr/bin/env python3
"""Offline eight-row coverage grid; preserves and checks PR #34's outputs."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import h3

if __package__:
    from . import coverage as c
else:
    import coverage as c

# Requested sensitivity assumptions; no walking-distance standard is implied.
K_VALUES = (0, 1)
SECOND_HEADWAY_MINUTES = 30.0
HEADWAY_THRESHOLDS_MINUTES = (c.FREQUENT_HEADWAY_MINUTES, SECOND_HEADWAY_MINUTES)
GRID_SCENARIOS = ('any_transit', 'frequent_transit', 'rail_only')
DOWNTOWN_STATION_NAME = 'Church Street'  # Existing input feature, not invented coordinates.
PR34_BOTH_JOBS = {'any_transit': 398_770, 'frequent_transit': 20_235, 'rail_only': 6_610}
BASELINE_FILE = 'transit_coverage_summary.json'
CSV_COLUMNS = ('scenario', 'k_rings', 'headway_minutes',
               *(name for group in c.GROUPS for name in (f'{group}_jobs', f'{group}_share')),
               *(f'both_covered_{column}' for column in ('SE01', 'SE02', 'SE03')))


def grid_coverage(layers):
    """Build eight distinct combinations; thresholds do not duplicate nonbus rows."""
    coverage, definitions = {}, []
    for rings in K_VALUES:
        for threshold in HEADWAY_THRESHOLDS_MINUTES:
            scenarios, _, selections, _ = c.scenarios_from_stops(layers, rings, threshold)
            for scenario in GRID_SCENARIOS:
                if scenario != 'frequent_transit' and threshold != HEADWAY_THRESHOLDS_MINUTES[0]:
                    continue
                minutes = threshold if scenario == 'frequent_transit' else None
                key = f'{scenario}_k{rings}' + (f'_h{minutes:g}' if minutes is not None else '')
                coverage[key] = scenarios[scenario]
                definitions.append({'key': key, 'scenario': scenario, 'k_rings': rings,
                                    'headway_minutes': minutes, **selections[scenario]})
            if rings == 1 and threshold == c.FREQUENT_HEADWAY_MINUTES:
                # Validate the fourth original scenario too, without exporting an
                # unrequested ninth grid row or altering its original output.
                coverage['baseline_no_brightline'] = scenarios['any_transit_no_brightline']
    definitions.sort(key=lambda row: (row['k_rings'], GRID_SCENARIOS.index(row['scenario']), row['headway_minutes'] or 0))
    return coverage, definitions


def headway_audit(collection):
    # Reuse original validation: zero is an invalid headway, not instant service.
    _, values, _ = c.stop_cells(collection, c.HEADWAY_FIELD)
    props = [feature['properties'] for feature in collection['features']]
    return {'field': c.HEADWAY_FIELD, 'units': 'minutes', 'lymmo_included': True,
            'stop_features': len(props), 'missing_keys': sum(c.HEADWAY_FIELD not in p for p in props),
            'null_values': sum(c.HEADWAY_FIELD in p and p[c.HEADWAY_FIELD] is None for p in props),
            'zero_values': sum(value == 0 for value in values),
            'threshold_counts': [{'headway_minutes': threshold,
                                  'selected_stops': sum(v is not None and v <= threshold for v in values)}
                                 for threshold in HEADWAY_THRESHOLDS_MINUTES],
            'policy': 'Nulls excluded from frequent service, retained in any-stop scenarios. Missing keys, zero, negative and nonnumeric values fail original validation; no imputation.'}


def downtown_scale(sunrail):
    matches = [f for f in sunrail['features'] if f['properties'].get('stop_name') == DOWNTOWN_STATION_NAME]
    if len(matches) != 1:
        raise ValueError('Expected exactly one Church Street station for downtown geometry audit')
    feature = matches[0]
    cells, _, _ = c.stop_cells({'type': 'FeatureCollection', 'features': [feature]})
    cell = cells[0]
    center = h3.cell_to_latlng(cell)
    edges = [h3.edge_length(edge, unit='m') for edge in h3.origin_to_directed_edges(cell)]
    adjacent = [h3.great_circle_distance(center, h3.cell_to_latlng(other), unit='m')
                for other in h3.grid_ring(cell, 1)]
    rings = []
    for k in K_VALUES:
        disk = h3.grid_disk(cell, k)
        distances = [h3.great_circle_distance(center, h3.cell_to_latlng(other), unit='m')
                     for other in disk if other != cell]
        rings.append({'k_rings': k, 'covered_cells': len(disk),
                      'covered_area_m2': sum(h3.cell_area(other, unit='m^2') for other in sorted(disk)),
                      'nonorigin_center_distance_min_m': min(distances, default=0),
                      'nonorigin_center_distance_max_m': max(distances, default=0)})
    return {'resolution': c.RESOLUTION,
            'anchor': {'source': c.STOP_FILES['sunrail'], 'stop_id': feature['properties']['stop_id'],
                       'stop_name': DOWNTOWN_STATION_NAME, 'coordinates_lon_lat': feature['geometry']['coordinates'],
                       'h3': cell, 'cell_center_lat_lon': list(center)},
            'global_average_edge_m': h3.average_hexagon_edge_length(c.RESOLUTION, unit='m'),
            'global_average_area_m2': h3.average_hexagon_area(c.RESOLUTION, unit='m^2'),
            'local_edge_mean_m': sum(edges)/len(edges),
            'local_edge_min_m': min(edges), 'local_edge_max_m': max(edges),
            'local_cell_area_m2': h3.cell_area(cell, unit='m^2'),
            'adjacent_center_distance_min_m': min(adjacent), 'adjacent_center_distance_max_m': max(adjacent),
            'rings': rings,
            'interpretation': 'H3 spherical geometry at the supplied Church Street point. K=0 includes one entire cell, not zero walking distance. K=1 includes its neighbors. Center distances are not stop-to-endpoint distances or routed walks; catchment citation TBD.'}


def verify_baseline(results, baseline, sources, flow_inventory):
    mapping = {'any_transit': 'any_transit_k1', 'frequent_transit': 'frequent_transit_k1_h15',
               'rail_only': 'rail_only_k1', 'any_transit_no_brightline': 'baseline_no_brightline'}
    for scenario, expected in PR34_BOTH_JOBS.items():
        actual = results[mapping[scenario]]['both_covered']['counts']['S000']
        if actual != expected:
            raise ValueError(f'PR #34 baseline mismatch: {scenario} both-covered jobs {actual}, expected {expected}')
    if baseline['sources'] != sources or baseline['flow_inventory'] != flow_inventory:
        raise ValueError('PR #34 baseline input hashes or flow inventory differ')
    for scenario, key in mapping.items():
        if results[key] != baseline['scenarios'][scenario]:
            raise ValueError(f'PR #34 baseline mismatch in full counts/shares/rows: {scenario}')


def analyze(input_dir):
    layers, sources = {}, {}
    for mode, filename in c.STOP_FILES.items():
        path = input_dir / filename
        layers[mode] = json.loads(path.read_text(encoding='utf-8'))
        sources[mode] = {'file': filename, 'sha256': c.digest(path)}
    audit = headway_audit(layers['lynx'])
    coverage, definitions = grid_coverage(layers)
    path = input_dir / c.FLOW_FILE
    sources['flows'] = {'file': c.FLOW_FILE, 'sha256': c.digest(path)}
    with path.open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or not set(('h_hex', 'w_hex', *c.COUNTS)) <= set(reader.fieldnames):
            raise ValueError('Missing required flow columns')
        # All eight grid rows and the extra baseline check reconcile every earnings
        # column across all four groups using the original exact source totals.
        results, inventory = c.aggregate_flows(reader, coverage)
    baseline_path = input_dir / BASELINE_FILE
    baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
    verify_baseline(results, baseline, sources, inventory)
    rows = [{**definition, 'groups': results[definition['key']]} for definition in definitions]
    return {'schema_version': 1, 'h3_version': h3.__version__, 'sources': sources,
            'baseline_reference': {'file': BASELINE_FILE, 'sha256': c.digest(baseline_path)},
            'parameters': {'k_values_assumption': list(K_VALUES),
                           'headway_thresholds_minutes_assumption': list(HEADWAY_THRESHOLDS_MINUTES),
                           'catchment_citation': 'TBD',
                           'rail_frequency_policy': 'Rail excluded from frequent_transit: no frequency fields in station layers.'},
            'headway_audit': audit, 'downtown_geometry': downtown_scale(layers['sunrail']),
            'flow_inventory': inventory, 'baseline_reproduced': True, 'reconciled': True,
            'rows': rows, 'interpretation': baseline['interpretation']}


def flat_rows(summary):
    for row in summary['rows']:
        result = {key: row[key] for key in ('scenario', 'k_rings', 'headway_minutes')}
        for group in c.GROUPS:
            result[f'{group}_jobs'] = row['groups'][group]['counts']['S000']
            result[f'{group}_share'] = row['groups'][group]['shares']['S000']
        for column in ('SE01', 'SE02', 'SE03'):
            result[f'both_covered_{column}'] = row['groups']['both_covered']['counts'][column]
        yield result


def write_outputs(summary, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / 'transit_coverage_sensitivity.json').write_text(
        json.dumps(summary, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    with (output_dir / 'transit_coverage_sensitivity.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.DictWriter(target, fieldnames=CSV_COLUMNS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(flat_rows(summary))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, default=c.ROOT / 'data/processed')
    parser.add_argument('--output-dir', type=Path, default=c.ROOT / 'data/processed')
    args = parser.parse_args()
    try:
        summary = analyze(args.input_dir)
        write_outputs(summary, args.output_dir)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'ERROR: {error}\n')
    print(json.dumps(summary['headway_audit'], indent=2))
    print(json.dumps(summary['downtown_geometry'], indent=2))
    for row in flat_rows(summary):
        print(json.dumps(row))
    print('All grid rows reconcile; PR #34 baseline reproduced exactly. Proximity does not verify usable transit trips.')


if __name__ == '__main__':
    main()
