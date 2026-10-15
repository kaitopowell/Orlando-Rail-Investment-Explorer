"""Publish supplied Kontur hexagons offline, normalizing duplicate ACS join columns."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def prepare(data):
    result = json.loads(json.dumps(data))
    for feature in result['features']:
        props = feature['properties']
        if 'tract_pop_acs' not in props:
            if props['tract_pop_acs_x'] != props['tract_pop_acs_y']:
                raise ValueError('Conflicting ACS tract totals')
            props['tract_pop_acs'] = props.pop('tract_pop_acs_x')
            del props['tract_pop_acs_y']
    return result

if __name__ == '__main__':
    source = ROOT / 'data/processed/kontur_h3_four_counties.geojson'
    target = ROOT / 'public/data/kontur_h3_four_counties.geojson'
    target.write_text(json.dumps(prepare(json.loads(source.read_text())), separators=(',', ':')) + '\n')
    print(f'Published {target.name}; local data only, geometry unchanged')
