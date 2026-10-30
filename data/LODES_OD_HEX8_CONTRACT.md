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
  https://lehd.ces.census.gov/data/lodes/LODES8/LODESTechDoc.pdf
- These are public US Census Bureau data; retain source attribution and the
  confidentiality and coverage qualifications below.

**Download date:** the owner's manual-run download date was not supplied. The
attempt on **2026-10-30** was blocked by the cloud environment's HTTP proxy (403);
this is an attempted access date, not a successful download date. Do not infer a
download date from the reference commit or filesystem timestamp. Each successful
pipeline download records its actual UTC timestamp, URL and SHA-256 in the
adjacent `data/raw/*.download.json` sidecar and includes that provenance in the
verification report. A pre-existing cache without a sidecar has an explicitly
unknown (`null`) download date. New raw files and sidecars are gitignored.

## Method and reconciliation

`analysis/rail/od.py` reads both block identifiers as 15-character strings.
It selects Florida (`12`) home and work blocks whose county substring
`geocode[2:5]` is Lake `069`, Orange `095`, Osceola `097`, or Seminole `117`.
The Florida main file contains in-state home/work pairs; interstate auxiliary
flows are not loaded. Both endpoints must pass the region filter.

Read `GEOID20`, `INTPTLAT20` and `INTPTLON20` from the Census archive's text
fields. Map each four-county block with
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
Also require the manual-run expectations below; differences are reported and
prevent output creation/replacement. A pre-existing output is also compared and
never overwritten on disagreement. Matching existing files are left untouched.

| Manual-run check | Expected |
| --- | ---: |
| Florida input rows | 8,416,045 |
| Florida input `S000` | 9,491,708 |
| `S000`, both endpoints in the four counties | 1,006,088 |
| `S000`, work endpoint in the four counties (Florida main file) | 1,467,549 |
| Four-county Census blocks mapped (including blocks without retained flows) | 39,751 |
| Distinct H3 cells of all mapped blocks | 6,928 |
| Directed pairs after aggregation | 591,177 |
| Unmatched unique blocks | 0 |

The committed reference independently contains 591,177 unique pairs, 1,006,088
`S000`, 164,743 `SE01`, 314,222 `SE02`, and 527,123 `SE03`. It uses **5,430**
distinct endpoint cells; that is a different population of cells from the 6,928
cells of *all mapped blocks*. The largest work-cell total is **61,428** jobs at
`8844a9160dfffff`. Input row totals, full block/cell coverage, unmatched counts,
and pair-for-pair reproduction remain **unverified until raw download access is
available**; the supplied aggregates cannot establish those facts independently.

## Reproduction

Use Python 3.11+ with GDAL Python bindings matching the installed GDAL. Install
H3 from `analysis/rail/requirements.txt` into a virtual environment that can see
those system bindings, for example:

```sh
/usr/bin/python3 -m venv --system-site-packages /tmp/rail-od-venv
/tmp/rail-od-venv/bin/python -m pip install -r analysis/rail/requirements.txt
/tmp/rail-od-venv/bin/python analysis/rail/od.py --verify-only \
  --report /tmp/lodes-od-verification.json
/tmp/rail-od-venv/bin/python analysis/rail/od.py \
  --report /tmp/lodes-od-verification.json
/tmp/rail-od-venv/bin/python -m unittest discover -s analysis -p 'test_rail_od.py'
```

The first run downloads the two sources to `data/raw/`; later runs reuse them.
The first command only verifies; the second writes the compressed output if
all checks pass. `--reference` accepts an alternate CSV/CSV.gz reference.
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
