# LODES 2023 home–work flows, H3 resolution 8

## Files and meaning

Generated output: `data/processed/lodes_od_hex8_2023.csv.gz`, a UTF-8,
gzip-compressed CSV with a header. One row is one **directed home H3 cell → work
H3 cell** pair, including within-cell pairs. Rows aggregate all qualifying block
pairs; they are not individual workers, journeys, observed commutes or ridership.
The primary key is `(h_hex, w_hex)`; rows are sorted by that key. Missing pairs
have no published flow in this filtered source, not proof of zero real travel.

The repository owner's notebook reference is actually stored as the plain CSV
`data/processed/lodes_od_hex8_2023.csv` (added in commit `450909c`). The pipeline
accepts plain or compressed references and compares parsed keyed counts, never
gzip bytes. The reference must remain unchanged if any comparison differs.

| Column | Type | Meaning / units |
| --- | --- | --- |
| `h_hex` | string | Home H3 resolution-8 cell ID; preserve as text |
| `w_hex` | string | Work H3 resolution-8 cell ID; preserve as text |
| `S000` | nonnegative integer | Total jobs, JT00 (all job types), 2023 |
| `SE01` | nonnegative integer | Jobs with earnings ≤ $1,250/month |
| `SE02` | nonnegative integer | Jobs with earnings > $1,250 and ≤ $3,333/month |
| `SE03` | nonnegative integer | Jobs with earnings > $3,333/month |

No nulls, duplicate pairs, invalid H3 cells or non-integer counts are allowed.
Counts use integer addition without rounding or weighting. These earnings
categories are job counts, not dollar amounts.

## Sources, vintage and provenance

- US Census Bureau LEHD Origin–Destination Employment Statistics, LODES8,
  Florida **2023**, main OD, JT00:
  https://lehd.ces.census.gov/data/lodes/LODES8/fl/od/fl_od_main_JT00_2023.csv.gz
- US Census Bureau **2025 TIGER/Line, 2020 tabulation blocks**, Florida:
  https://www2.census.gov/geo/tiger/TIGER2025/TABBLOCK20/tl_2025_12_tabblock20.zip
- LODES technical documentation:
  https://lehd.ces.census.gov/data/lodes/LODES8/LODESTechDoc8.4.pdf
- These are public US Census Bureau data; retain source attribution and the
  confidentiality and coverage qualifications below.

**Verified source download/run date:** 2026-10-30 (UTC), from the owner's
Windows end-to-end run documented below. Earlier sandbox download attempts were
blocked by its proxy; the successful Windows run is the verification record. The original notebook's download date was not supplied.
The pipeline records timestamps, URLs and SHA-256 checksums in gitignored raw
sidecars; a pre-existing cache without a sidecar has an unknown (`null`) date.

## Method and reconciliation

`analysis/rail/od.py` reads both block identifiers as 15-character strings.
It selects Florida (`12`) home and work blocks whose county substring
`geocode[2:5]` is Lake `069`, Orange `095`, Osceola `097`, or Seminole `117`.
The Florida main file contains in-state home/work pairs; interstate auxiliary
flows are not loaded. Both endpoints must pass the region filter.

Read `GEOID20`, `COUNTYFP20`, `INTPTLAT20` and `INTPTLON20` as text from
only the ZIP's DBF attribute table using `dbfread==2.0.7`. This pure-Python
package has a universal wheel and requires neither GDAL nor a native compiler.
The reader streams records from a temporary copy of the single DBF and never
reads SHP geometry. The original three-field fixtures remain supported when
`COUNTYFP20` is absent; county filtering still uses `GEOID20[2:5]`, unchanged.
Map each four-county block with
`h3.latlng_to_cell(float(INTPTLAT20), float(INTPTLON20), 8)` using H3 Python
4.4.2. Use the provided internal point directly (latitude then longitude), not
polygon centroids, polygon overlaps or an area-weighted allocation. Internal
points locate a block inside its boundary; they are not necessarily centroids.
TIGER internal-point coordinates are geographic NAD83; this notebook-compatible
method passes those supplied coordinates directly to H3 without a datum shift.
Whole block flows are assigned to that single cell.

Sum `S000`, `SE01`, `SE02`, `SE03` by `(h_hex, w_hex)`. Report unmatched unique
block IDs, affected row count and all four affected job counts. If either end
is unmatched, omit that row **once**, even when both endpoints are missing.
For each count column, require:

```
aggregated = four-county counts before mapping − counts on unmatched rows
```

Any reconciliation failure exits nonzero. Then compare every generated pair and
all four count columns against the reference, ignoring row/column order and
compression. Duplicate reference pairs fail rather than being silently summed.
Also require the verified summary values below; differences are reported and
prevent output creation/replacement. A pre-existing output is also compared and
never overwritten on disagreement. Matching existing files are left untouched.

## Verified end-to-end run

The project owner reports that `analysis/rail/od.py` was run end to end on real
Census data on **2026-10-30 (UTC)**, on **Windows with Python 3.14.6**, using:

```powershell
py -3.14 analysis/rail/od.py --verify-only
```

This command downloads both source files, runs the full pipeline, and compares
its in-memory result to the reference without writing the generated output.
The run reproduced the reference exactly: **`summary_differences: {}`**,
**`missing_pairs: 0`**, **`extra_pairs: 0`**, **`changed_pairs: 0`**. This records
the owner's supplied verification result, not a new sandbox reproduction.

| File | SHA-256 recorded for the verified run |
| --- | --- |
| `fl_od_main_JT00_2023.csv.gz` | `cad279a7fdd24629855d903759bd83aec4d08654c108a8edb2b291d0e59498ed` |
| `tl_2025_12_tabblock20.zip` | `5daad2fae38f8a652072473ad6c8f353ac5f6219654a03fc72d5f55bc34d31de` |
| Authoritative reference: `lodes_od_hex8_2023.csv` | `febfaabca41806e3b091c99a00b3101eb6d87ee9033533295fdf3d8b4a12b8ad` |

| Verified statistic | Value |
| --- | ---: |
| Florida input rows | 8,416,045 |
| Florida input jobs (`S000`) | 9,491,708 |
| Jobs with work end in the four counties | 1,467,549 |
| Jobs with both ends in the four counties | 1,006,088 |
| Rows with both ends in the four counties | 825,335 |
| Four-county Census blocks | 39,751 |
| H3 cells of all mapped blocks | 6,928 |
| Directed home–work pairs | 591,177 |
| Distinct H3 cells appearing in flows | 5,430 |
| Unmatched blocks | 0 |

| Count column | Before aggregation (both ends in region) | After aggregation |
| --- | ---: | ---: |
| `S000` | 1,006,088 | 1,006,088 |
| `SE01` | 164,743 | 164,743 |
| `SE02` | 314,222 | 314,222 |
| `SE03` | 527,123 | 527,123 |

The **uncompressed** `data/processed/lodes_od_hex8_2023.csv` is the authoritative
reference for reproduction. The script's documented generated output is
`data/processed/lodes_od_hex8_2023.csv.gz`; that compressed derivative does not
supersede the reference. Comparison is by parsed content, not compression bytes.
No reference file was renamed or recompressed for this documentation update.

## Reproduction

Use Python 3.11+; the OD script has no GDAL/`osgeo` dependency. Both packages
are pinned in `analysis/rail/requirements.txt`. Pip downloads were verified for
64-bit Windows CPython 3.14: `h3-4.4.2-cp314-cp314-win_amd64.whl` and
`dbfread-2.0.7-py2.py3-none-any.whl`. Those earlier Linux checks established wheel availability; the owner subsequently
verified the full pipeline on Windows Python 3.14.6 as recorded above.

From the repository root on Windows (PowerShell or Command Prompt):

```powershell
py -3.14 -m pip install -r analysis/rail/requirements.txt
py -3.14 analysis/rail/od.py --verify-only --report data/raw/lodes-od-verification.json
py -3.14 analysis/rail/od.py --report data/raw/lodes-od-verification.json
py -3.14 -m unittest discover -s analysis -p "test_rail_od_dbf.py"
```

On Linux/macOS, use a normal virtual environment (no system GDAL required):

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r analysis/rail/requirements.txt
.venv/bin/python analysis/rail/od.py --verify-only --report data/raw/lodes-od-verification.json
.venv/bin/python analysis/rail/od.py --report data/raw/lodes-od-verification.json
.venv/bin/python -m unittest discover -s analysis -p 'test_rail_od_dbf.py'
```

The new attribute-reader tests build tiny DBF-only ZIPs with the standard
library, check all four text columns (including leading zeroes), and reject
missing required columns or ambiguous archives. The original `test_rail_od.py`
fixtures and reference-verification logic are unchanged. One original test
still uses GDAL **to create its synthetic shapefile fixture**, so running that
legacy test or the complete analysis suite needs the existing GDAL test
environment. This is not a dependency of the OD script or the new reader tests.

The first run downloads the two sources to `data/raw/`; later runs reuse them.
The `--verify-only` invocation only verifies; omitting that flag writes the
compressed output if all checks pass. `--reference` accepts an alternate CSV/CSV.gz reference.
`--raw-dir` can point at an existing download cache. Downloads use normal proxy
and TLS trust configuration, write atomically, and preserve source checksums.
The report records summary differences and up to five changed/missing reference
pairs. These commands require both Census hosts to be allowed by the environment.

## Known limitations

- Counts are **jobs, not people**. A person can hold multiple jobs. These are not
  mode choices, trips, measured station demand or predicted rail ridership.
- Only workers who both live and work in the four counties are included: about
  **69%** (1,006,088 / 1,467,549 ≈ 68.6%) of jobs located in those counties in the
  supplied Florida main OD file. Workers living elsewhere are excluded; the
  denominator also excludes interstate workers in the auxiliary file.
- LODES confidentiality protection/noise affects small flows. Small differences
  and individual cell pairs should not be interpreted as exact people counts.
- Large multi-site employers may be assigned to one location. The reference's
  top work hexagon holds **61,428 jobs near Walt Disney World**; it does not
  establish that every job is physically concentrated at a single site.
- Internal-point assignment represents an entire block with one location; it
  does not recover the spatial distribution of jobs or homes within that block.
- Tract-level data does not vary within a tract. If these flows are later joined
  to ACS tract characteristics, hexagon display must not imply independent
  within-tract measurements. This pipeline does not perform that join.
- 2023 jobs and 2020 blocks in the 2025 TIGER release have different vintages.
  Any missing identifiers are reported, not guessed or silently redistributed.
