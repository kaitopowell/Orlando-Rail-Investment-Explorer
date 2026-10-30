# Geographic analysis

`prepare_counties.py` is an offline Python/GDAL pipeline reading the supplied Census ZIP in `data/raw/`. Run `/usr/bin/python3 analysis/prepare_counties.py` to regenerate `public/data`, and `/usr/bin/python3 analysis/test_counties.py` to validate it. The cloud environment already provides GDAL 3.10.3; no downloads are performed. See the root README for source, vintage, download date, projection, and simplification details.

Keep future Pandas/GeoPandas analysis separate from rendering. Document source, license, coverage, field definitions, missing-data handling, and transformations for each dataset. Export browser-facing GeoJSON in WGS84 (EPSG:4326). Document model requirements and assumptions before optimization; linear regression is prohibited. Never substitute fabricated demographics or costs.

### Equity

Run `python3 analysis/prepare_equity.py` to join the unchanged supplied
`data/processed/acs_equity_tracts_2024_5yr.csv` to the existing 2024 population
tract polygons. Standard-library CSV reading preserves string GEOIDs. Invalid,
duplicate or unmatched IDs stop generation. Geometry is unchanged; all 490
tracts remain. Blank, negative and non-finite numeric values become null.
Run `python3 -m unittest discover -s analysis -p 'test_equity.py'` for the
real-input counts, missing values, zero households, top code and geometry checks.

The frontend uses five quantile classes, excluding nulls separately for each
measure. Breaks are the 20th/40th/60th/80th percentiles with linear interpolation
at `(n-1)*p` (type 7). Values equal to a break belong to the lower class. Legend
labels round to two decimals; classification uses unrounded breaks. Income
reverses the dark-green to neon-lime ramp so lower income indicates higher need.

On the supplied data, the four breaks are: no-vehicle share
1.4315072596328762, 2.784297211304511, 4.555533107658448, 8.41136486219713%;
poverty share 5.625319903861305, 8.218314851606467, 12.08204835825537,
18.970607565181936%; income $56,532.4, $69,644.8, $85,127.8, $107,983.4.

### Rail home–work input

`rail/od.py` downloads/caches Florida LODES8 OD and TIGER block internal points,
filters both ends to the four counties, and aggregates directed H3 resolution-8
job flows. It verifies every pair/count against the supplied notebook reference
and the requested summary totals before creating compressed output. See
[`data/LODES_OD_HEX8_CONTRACT.md`](../data/LODES_OD_HEX8_CONTRACT.md) for installation,
commands, provenance, verification status, and limitations. H3 is pinned in
`rail/requirements.txt`; GDAL bindings must match the system installation.
`test_rail_od.py` uses tiny synthetic fixtures only and requires no network.
