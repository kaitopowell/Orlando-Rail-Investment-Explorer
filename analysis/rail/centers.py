"""Offline activity centers and illustrative connections; no transit/plan inputs."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path

import h3

# Modeling assumptions, not findings. Each source has its own observed-cell universe.
TOP_SHARE = 0.05
K_NEAREST = 3
MAX_KM = 40.0
RESOLUTION = 8
CLUSTER_RINGS = 1
PERCENTILES = (0, 25, 50, 75, 90, 95, 99, 100)
FLAGGED_WORK_HEX = '8844a9160dfffff'  # Diagnostic only; never alters selection/weights.
ROOT = Path(__file__).resolve().parents[2]
POPULATION_FILE = 'kontur_h3_four_counties.geojson'
WAC_FILE = 'lodes_wac_blocks_2023.csv'
OD_FILE = 'lodes_od_hex8_2023.csv'


def checked_cell(cell):
    if not isinstance(cell, str) or not h3.is_valid_cell(cell) or h3.get_resolution(cell) != RESOLUTION:
        raise ValueError(f'Expected an H3 resolution-{RESOLUTION} string: {cell!r}')
    return cell


def nonnegative(value):
    if isinstance(value, bool):
        raise ValueError('Boolean is not a count')
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise ValueError(f'Invalid count: {value!r}')
    return number


def integer_count(value):
    number = nonnegative(value)
    if not number.is_integer():
        raise ValueError(f'Expected integer jobs: {value!r}')
    return int(number)


def source_info(path):
    return {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def load_population(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
        raise ValueError('Population must be a FeatureCollection')
    values, keys, geometries = {}, set(), set()
    for feature in data['features']:
        props = feature['properties']
        cell = checked_cell(props['h3'])
        if cell in values:
            raise ValueError(f'Duplicate population cell: {cell}')
        values[cell] = nonnegative(props['population'])
        keys.update(props)
        geometries.add(feature['geometry']['type'])
    return values, {**source_info(path), 'features': len(values),
                    'properties': sorted(keys), 'geometry_types': sorted(geometries)}


def load_jobs(input_dir):
    path = input_dir / WAC_FILE
    fallback_reason = 'WAC file absent'
    if path.exists():
        with path.open(encoding='utf-8-sig', newline='') as source:
            reader = csv.DictReader(source)
            fields = reader.fieldnames or []
            if {'w_geocode', 'tract_geoid', 'county', 'jobs_total', 'lat', 'lon'} <= set(fields):
                jobs, seen, counties = {}, set(), set()
                for row in reader:
                    block = row['w_geocode']  # csv keeps all identifiers as strings.
                    if len(block) != 15 or not block.isdigit() or block in seen:
                        raise ValueError(f'Invalid/duplicate block ID: {block!r}')
                    if len(row['tract_geoid']) != 11 or not row['tract_geoid'].isdigit():
                        raise ValueError('Invalid tract ID')
                    seen.add(block)
                    counties.add(row['county'])
                    lat, lon = float(row['lat']), float(row['lon'])
                    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
                        raise ValueError('Invalid internal-point coordinates')
                    cell = h3.latlng_to_cell(lat, lon, RESOLUTION)
                    jobs[cell] = jobs.get(cell, 0) + integer_count(row['jobs_total'])
                return jobs, {**source_info(path), 'columns': fields, 'rows': len(seen),
                              'counties': sorted(counties), 'fallback': False,
                              'location': 'LODES crosswalk block internal point (lat, lon), not centroid'}
            fallback_reason = 'WAC required identifier/count/coordinate columns absent'
    # Only this explicit missing-schema/file case permits the requested fallback.
    # Corrupt present counts/coordinates fail rather than silently changing sources.
    path = input_dir / OD_FILE
    with path.open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        fields = reader.fieldnames or []
        if not {'w_hex', 'S000'} <= set(fields):
            raise ValueError('OD fallback lacks w_hex/S000')
        jobs, rows = {}, 0
        for row in reader:
            cell = checked_cell(row['w_hex'])
            jobs[cell] = jobs.get(cell, 0) + integer_count(row['S000'])
            rows += 1
    return jobs, {**source_info(path), 'columns': fields, 'rows': rows, 'fallback': True,
                  'fallback_reason': fallback_reason,
                  'limitation': 'Only workers living and working in the four counties; about 1,006,088 of 1,467,549 workplace jobs in the Florida main OD file.'}


def percentiles(values):
    ordered = sorted(values)
    result = {}
    for percentile in PERCENTILES:
        if not ordered:
            result[str(percentile)] = None
            continue
        index = (len(ordered) - 1) * percentile / 100
        lo, hi = math.floor(index), math.ceil(index)
        result[str(percentile)] = ordered[lo] + (ordered[hi] - ordered[lo]) * (index - lo)
    return result


def top_cells(values, share=TOP_SHARE):
    if not 0 < share <= 1 or not values:
        raise ValueError('Nonempty source and share in (0,1] required')
    ordered = sorted(values, key=lambda cell: (-values[cell], cell))
    count = math.ceil(len(ordered) * share)
    selected = set(ordered[:count])
    cutoff = values[ordered[count - 1]]
    return selected, {'observed_hexagons': len(values), 'selected_hexagons': count,
                      'selected_share': count / len(values), 'threshold': cutoff,
                      'cells_tied_at_threshold': sum(v == cutoff for v in values.values()),
                      'selected_at_threshold': sum(values[c] == cutoff for c in selected)}


def clusters(cells):
    remaining = set(cells)
    groups = []
    while remaining:
        first = min(remaining)
        remaining.remove(first)
        pending, group = [first], []
        while pending:
            cell = pending.pop()
            group.append(cell)
            neighbors = sorted(set(h3.grid_disk(cell, CLUSTER_RINGS)) & remaining)
            remaining.difference_update(neighbors)
            pending.extend(neighbors)
        groups.append(sorted(group))
    return sorted(groups)


def weighted_position(cells, weights):
    # Spherical weighted mean of H3 centers; no polygon/geometry dependencies.
    total = math.fsum(weights.get(c, 0) for c in cells)
    if total <= 0:
        raise ValueError('Selected cluster has neither positive jobs nor population')
    xyz = [[], [], []]
    for cell in sorted(cells):
        lat, lon = map(math.radians, h3.cell_to_latlng(cell))
        weight = weights.get(cell, 0) / total
        xyz[0].append(weight * math.cos(lat) * math.cos(lon))
        xyz[1].append(weight * math.cos(lat) * math.sin(lon))
        xyz[2].append(weight * math.sin(lat))
    x, y, z = (math.fsum(axis) for axis in xyz)
    return [math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y)))]


def make_centers(jobs, population):
    job_top, job_rule = top_cells(jobs)
    pop_top, pop_rule = top_cells(population)
    centers = []
    for members in clusters(job_top | pop_top):
        total_jobs = sum(jobs.get(c, 0) for c in members)
        total_population = math.fsum(population.get(c, 0) for c in members)
        criteria = 'both' if job_top.intersection(members) and pop_top.intersection(members) else 'jobs' if job_top.intersection(members) else 'population'
        properties = {'id': f'center_{min(members)}', 'hexagon_count': len(members),
                      'total_jobs': total_jobs, 'total_population': total_population,
                      'criteria': criteria, 'hexagons': members,
                      'jobs_selected_hexagons': len(job_top.intersection(members)),
                      'population_selected_hexagons': len(pop_top.intersection(members)),
                      'missing_job_hexagons': sum(c not in jobs for c in members),
                      'missing_population_hexagons': sum(c not in population for c in members),
                      'centroid_weight': 'jobs' if total_jobs > 0 else 'population'}
        centers.append({'type': 'Feature', 'properties': properties,
                        'geometry': {'type': 'Point', 'coordinates': weighted_position(members, jobs if total_jobs > 0 else population)}})
    centers.sort(key=lambda f: (-f['properties']['total_jobs'], f['properties']['id']))
    return centers, {'jobs': job_rule, 'population': pop_rule}


def connections(centers, k=K_NEAREST, max_km=MAX_KM):
    if k < 0 or not isinstance(k, int) or max_km < 0 or not math.isfinite(max_km):
        raise ValueError('Invalid neighbor count/distance')
    by_id = {f['properties']['id']: f for f in centers}
    if len(by_id) != len(centers):
        raise ValueError('Duplicate center IDs')
    pairs = {}
    for center_id in sorted(by_id):
        origin = by_id[center_id]['geometry']['coordinates']
        neighbors = []
        for other_id in sorted(by_id):
            if other_id == center_id:
                continue
            destination = by_id[other_id]['geometry']['coordinates']
            km = h3.great_circle_distance(origin[::-1], destination[::-1], unit='km')
            neighbors.append((km, other_id))
        for km, other_id in sorted(neighbors)[:k]:
            if km <= max_km:
                pair = tuple(sorted((center_id, other_id)))
                pairs[pair] = km
    return [{'type': 'Feature', 'properties': {'from_id': a, 'to_id': b, 'km': pairs[(a, b)]},
             'geometry': {'type': 'LineString', 'coordinates': [by_id[a]['geometry']['coordinates'], by_id[b]['geometry']['coordinates']]}}
            for a, b in sorted(pairs)]


def components(centers, edges):
    graph = {f['properties']['id']: set() for f in centers}
    for edge in edges:
        a, b = edge['properties']['from_id'], edge['properties']['to_id']
        graph[a].add(b)
        graph[b].add(a)
    remaining, result = set(graph), []
    while remaining:
        pending, group = [min(remaining)], []
        remaining.remove(pending[0])
        while pending:
            node = pending.pop()
            group.append(node)
            new = graph[node] & remaining
            remaining.difference_update(new)
            pending.extend(sorted(new))
        result.append(sorted(group))
    return sorted(result, key=lambda group: (-len(group), group)), sorted(c for c in graph if not graph[c])


def analyze(input_dir):
    population, pop_source = load_population(input_dir / POPULATION_FILE)
    jobs, job_source = load_jobs(input_dir)
    centers, selection = make_centers(jobs, population)
    edges = connections(centers)
    groups, isolated = components(centers, edges)
    all_jobs, all_population = sum(jobs.values()), math.fsum(population.values())
    captured_jobs = sum(f['properties']['total_jobs'] for f in centers)
    captured_population = math.fsum(f['properties']['total_population'] for f in centers)
    flagged = next((f['properties']['id'] for f in centers if FLAGGED_WORK_HEX in f['properties']['hexagons']), None)
    summary = {'parameters_assumptions': {'TOP_SHARE': TOP_SHARE, 'K_NEAREST': K_NEAREST, 'MAX_KM': MAX_KM, 'RESOLUTION': RESOLUTION, 'CLUSTER_RINGS': CLUSTER_RINGS, 'PERCENTILES': PERCENTILES},
               'h3_version': h3.__version__, 'sources': {'population': pop_source, 'jobs': job_source},
               'selection': selection, 'hexagon_percentiles': {'jobs': percentiles(jobs.values()), 'population': percentiles(population.values())},
               'all_jobs': all_jobs, 'all_population': all_population,
               'center_count': len(centers), 'jobs_inside_centers': captured_jobs,
               'population_inside_centers': captured_population,
               'jobs_share_inside_centers': captured_jobs / all_jobs if all_jobs else None,
               'population_share_inside_centers': captured_population / all_population if all_population else None,
               'source_join': {'jobs_cells_without_population': len(jobs.keys() - population.keys()), 'population_cells_without_jobs': len(population.keys() - jobs.keys())},
               'largest_work_hexagon': {'h3': min(jobs, key=lambda c: (-jobs[c], c)), 'jobs': max(jobs.values()),
                                         'note': 'Large workplace concentrations may reflect a multi-site employer assigned to one location; not corrected.'},
               'connection_count': len(edges), 'connection_km_percentiles': percentiles(e['properties']['km'] for e in edges),
               'connected_components': groups, 'isolated_centers': isolated,
               'flagged_work_hex': {'h3': FLAGGED_WORK_HEX, 'jobs': jobs.get(FLAGGED_WORK_HEX), 'center_id': flagged,
                                   'note': 'Near Walt Disney World; a large employer may be assigned to one location. Possibility to check, not a finding or correction.'},
               'interpretation': 'Illustrative straight-line candidates, not routes or proposals. No existing transit or plan inputs. No costs, speeds or ridership.'}
    return centers, edges, summary


def write_outputs(output_dir, centers, edges, summary):
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in [('candidate_centers.geojson', {'type': 'FeatureCollection', 'features': centers}),
                              ('candidate_connections.geojson', {'type': 'FeatureCollection', 'features': edges}),
                              ('candidate_connections_summary.json', summary)]:
        (output_dir / filename).write_text(json.dumps(content, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, default=ROOT / 'data/processed')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'data/processed')
    args = parser.parse_args()
    try:
        centers, edges, summary = analyze(args.input_dir)
        write_outputs(args.output_dir, centers, edges, summary)
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f'ERROR: {error}\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
