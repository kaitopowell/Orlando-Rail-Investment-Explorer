# Transit stop-proximity coverage of LODES home–work flows

## Meaning and scope

`analysis/rail/coverage.py` is an offline **proximity screen**, not a transit
router. It asks whether both endpoint hexagons of each directed home–work flow
are close to the supplied stops under a declared H3-ring rule. **Both ends
covered does not establish that the commute is possible or usable by transit.**
No connectivity, timetable, transfer, fare or travel-time calculation is made.
No scoring or greedy optimization is implemented.

The run on 2026-11-01 used only these read-only repository inputs:

- Authoritative uncompressed OD reference: `data/processed/lodes_od_hex8_2023.csv`.
  See [OD contract](LODES_OD_HEX8_CONTRACT.md) for the Census source URLs and
  verified provenance. Jobs are from 2023; both endpoints are in the four counties.
- `data/processed/lynx_stops_peak_headway.geojson`: LYNX GTFS, accessed 2026-10-16,
  producer http://gtfsrt.golynx.com/gtfsrt/google_transit.zip.
- `data/processed/sunrail_stations.geojson`: SunRail GTFS, accessed 2026-10-13,
  https://corporate.sunrail.com/gtfs/google_transit.zip.
- `data/processed/brightline_stations.geojson`: Brightline GTFS, accessed
  2026-10-13 through Transitland, producer http://feed.gobrightline.com/bl_gtfs.zip.
  Credit: [Transitland](https://www.transit.land/).

No new source downloads occur. SHA-256 hashes of all four inputs, H3 package
version, complete property-name inventories and geometry types are embedded in
the summary output. Existing feed dates, licenses and preparation caveats are
in [DATA_SOURCES.md](../docs/DATA_SOURCES.md#existing-transit) and its LYNX section.

## Inspected stop schema and frequency interpretation

All three inputs contain **Point** geometry in longitude/latitude (CRS84).
Coordinates come from GeoJSON geometry, not the duplicate rail `stop_lat` /
`stop_lon` string attributes. H3 conversion uses `latlng_to_cell(lat, lon, 8)`.

- **LYNX: 3,664 features.** Properties: `county`, `freq15`, `freq15_nl`,
  `freq20_nl`, `freq30`, `freq30_nl`, `headway_best_nonlymmo_min`,
  `headway_best_route_min`, `headway_combined_min`, `n_dep`,
  `n_dep_best_nonlymmo`, `route_long_name`, `route_short_name`, `stop_id`,
  `stop_name`.
- **SunRail: 15 features.** Properties: `county`, `stop_id`, `stop_lat`,
  `stop_lon`, `stop_name`, `stop_url`, `wheelchair_boarding`, `zone_id`.
- **Brightline: 1 feature.** Properties: `county`, `stop_code`, `stop_desc`,
  `stop_id`, `stop_lat`, `stop_lon`, `stop_name`, `stop_timezone`,
  `wheelchair_boarding`.

The chosen LYNX field is **`headway_best_route_min` in minutes**, which includes
LYMMO. Its units and method are documented in the existing LYNX source entry:
240 minutes across 07:00–09:00 and 16:00–18:00 on representative Wednesday
2026-10-14, divided by departures on the best single route and direction.
This is a **peak-time scheduled value**, not an all-day guarantee. The layer's
interpolated stop times are inherited, not recalculated or independently verified
here. Known values range from 6.2 to 240 minutes; **43 are null**.

Using best-route headway (rather than combined headway across potentially
unrelated routes) and including LYMMO are **analysis assumptions**. The map's
non-LYMMO default is not changed. The script filters the numeric headway field,
not precomputed `freq*` flags. Missing headway keys, nonnumeric/negative/zero
values or invalid coordinates fail; null headways are allowed but not frequent.

**Neither rail layer has a frequency field.** Neither railway is asserted to be
frequent. Both are excluded from the frequent scenario, with that exclusion
recorded in the summary. Their stations remain in the any-stop and rail-only
screens. No rail frequency is invented from station presence.

## Parameters and H3 geometry

Named defaults at the top of `coverage.py`:

| Parameter | Default | Status |
| --- | --- | --- |
| `RESOLUTION` | 8 | Inherited from the authoritative OD cells |
| `K_RINGS` | 1 | **Assumption**; catchment-distance citation **TBD** |
| `FREQUENT_HEADWAY_MINUTES` | 15 minutes | **Assumption**, inclusive threshold |
| `HEADWAY_FIELD` | `headway_best_route_min` | **Assumption**: best route, including LYMMO |

Every stop is converted to H3 before scenario selection. Coverage is the union
of `h3.grid_disk(stop_cell, K)`, including the stop cell itself. Duplicate stops
and overlapping disks contribute a cell only once. K=0 covers just stop cells.
The output retains covered cells with no OD flows and may extend beyond the
four-county boundary; only the unchanged OD rows are classified.

H3 4.4.2 computed these values for the default K=1 run:

- `average_hexagon_edge_length(8, unit='m')`: **531.41401 m**, the library's
  **global average**, not the exact length of every local cell edge.
- Actual spherical lengths from `edge_length` over all directed edges of the
  **820 unique any-transit stop cells**: **491.76149–533.68094 m**, mean
  **510.09265 m**. Shared edges can occur in both neighboring cells' samples.
- Regular-hex approximation of K=1 center-to-center reach:
  `sqrt(3) × average edge` = **920.43607 m**.
- Actual `great_circle_distance` from those stop-cell centers to their K=1
  neighboring centers: **841.34581–914.69422 m**, mean **883.49140 m**.

The exact unrounded computed numbers and selected-K values are printed and saved
in the summary. These are **geometric approximations of walking reach**, not
walking-network distances. A stop can lie anywhere within its cell, and coverage
includes entire neighboring cells: the center distance is not a maximum walk to
every point in those cells. **K=1 is not labeled a half-mile catchment.** The
catchment-distance citation remains **TBD**; this screen does not resolve the
model's eventual routing catchment assumption.

## Scenarios

| Scenario ID | Selected stops | Covered cells, K=1 |
| --- | --- | ---: |
| `any_transit` | All 3,664 LYNX stops, 15 SunRail and 1 Brightline station; null-headway LYNX stops included | 1,691 |
| `frequent_transit` | 207 LYNX stops with non-null best-route headway ≤15 minutes; rail excluded because frequency is unavailable | 154 |
| `rail_only` | All 15 SunRail and 1 Brightline station, without a frequency assertion | 106 |
| `any_transit_no_brightline` | All LYNX stops and SunRail stations; Brightline excluded as the intercity sensitivity | 1,684 |

These are separate, overlapping scenarios, not additive categories. The last
scenario follows the Brightline sensitivity in the model assumptions. The
including-Brightline scenarios measure station proximity, not local rail service
or a connected intra-region Brightline trip.

## Outputs and column meanings

`data/processed/transit_coverage_summary.json` contains:

- `schema_version`, `h3_version`, `sources`: format, implementation version,
  input filenames and SHA-256 fingerprints; no input files are rewritten.
- `parameters`: resolution and explicitly labeled assumptions, headway field,
  LYMMO inclusion, rail-frequency treatment, and the TBD catchment citation.
- `stop_inventory`, `scenario_selection`: inspected geometry/property names,
  stop counts, null-headway counts and selected features/unique cells/covered
  cells. These are audit counts, not ridership.
- `spatial_scale`: global average edge length, measured local directed-edge
  lengths and center distances (min/mean/max), and approximate K=1/selected-K
  center reach, all in **metres**. No actual walk path is computed.
- `flow_inventory`: **591,177 directed rows**, **5,430 distinct endpoint cells**,
  and the four source-column totals.
- `scenarios[scenario][group].flow_rows`: number of original directed OD rows in
  the group. `flow_share`: that count / 591,177.
- `scenarios[scenario][group].counts`: nonnegative integer sums of `S000`,
  `SE01`, `SE02`, `SE03`. Units are **jobs**, not people. Earnings bands retain
  their definitions in the linked OD contract; no recategorization is performed.
- `scenarios[scenario][group].shares`: each count divided by the **total of its
  own column**, as a fraction in [0,1], not a percentage. Thus an SE01 share is
  the share of all SE01 jobs in this group, not SE01's share of the group's jobs.
  Zero denominators are represented by null in fixture/general use; all real
  column denominators here are positive.
- `reconciled: true` is emitted only after every scenario passes exact integer
  reconciliation; `interpretation` repeats the proximity-only qualification.

Four mutually exclusive, exhaustive groups **within each scenario**:

| Group | Definition |
| --- | --- |
| `both_covered` | Both `h_hex` and `w_hex` are in the scenario's covered-cell set |
| `home_only` | Home is covered; work is not |
| `work_only` | Work is covered; home is not |
| `neither` | Neither endpoint is covered |

`data/processed/transit_coverage_hex8.csv` is UTF-8 CSV with columns:

| Column | Type | Meaning |
| --- | --- | --- |
| `scenario` | string | One of the four scenario IDs above |
| `h3` | string | A covered H3 resolution-8 cell; preserve as text |

The unique key is `(scenario, h3)`. Every row means covered; absent cells are not
covered under that scenario. Rows are sorted by scenario then H3 ID. No geometry,
flow records or new demographic values are exported. JSON and CSV contents are
deterministic for the same inputs, parameters and pinned H3 version.

## Reconciliation and observed default results

The source and each scenario's four groups must sum **exactly** to:
`S000=1,006,088`, `SE01=164,743`, `SE02=314,222`, `SE03=527,123`.
Group row counts must also reconcile to the actual input row count. Duplicate
home–work pairs, invalid H3 cells, invalid/noninteger counts and mismatched totals
fail loudly before outputs are written. No rows are dropped to make totals fit.

| Scenario | Both ends: jobs (share) | Home only: jobs (share) | Work only: jobs (share) | Neither: jobs (share) |
| --- | ---: | ---: | ---: | ---: |
| Any transit | 398,770 (39.6357%) | 89,195 (8.8655%) | 332,460 (33.0448%) | 185,663 (18.4540%) |
| Frequent LYNX; rail frequency unavailable | 20,235 (2.0113%) | 36,575 (3.6354%) | 222,378 (22.1032%) | 726,900 (72.2501%) |
| Rail only | 6,610 (0.6570%) | 21,545 (2.1415%) | 143,968 (14.3097%) | 833,965 (82.8919%) |
| Any transit, no Brightline | 398,742 (39.6329%) | 89,223 (8.8683%) | 332,438 (33.0426%) | 185,685 (18.4561%) |

Full earnings-group totals and unrounded shares are in the JSON. Rounded displayed
percentages can sum slightly above/below 100%; integer totals reconcile exactly.

## Reproduction and tests (no GDAL)

From the repository root on Windows Python 3.14:

```powershell
py -3.14 -m pip install -r analysis/rail/requirements.txt
py -3.14 analysis/rail/coverage.py
py -3.14 -m unittest discover -s analysis -p "test_rail_coverage.py"
```

`coverage.py` uses `json`, `csv` and other standard-library modules plus the
already-pinned `h3==4.4.2` v4 API. It imports neither `od.py` nor GDAL, GeoPandas
or Fiona. No dependency change is needed; H3's Windows CPython 3.14 x64 wheel
availability was checked during the OD work. This coverage run and tests were
executed on Linux Python 3.13, not on a Windows host. On Linux/macOS use the same
commands with a suitable virtual-environment Python in place of `py -3.14`.

Optional CLI parameters: `--rings K`, `--headway-minutes MINUTES`, `--input-dir`
and `--output-dir`. Keep the committed outputs at the documented defaults; use
a separate output directory for sensitivity runs. Fixtures are tiny synthetic
GeoJSON/CSV inputs with no network or real-data dependencies. They test four-way
classification and earnings denominators, exact ring membership, duplicate-cell
handling, inclusive headway filtering, nulls, rail exclusion, invalid inputs,
reconciliation failures, deterministic output, and read-only inputs.

## Limitations and unverified questions

- Stop location does **not** imply usable service. No route connectivity,
  direction, calendar, transfers, wait times, travel times, fares, accessibility
  or observed reliability is tested. Even different rail systems can produce
  a `both_covered` classification without a viable connecting trip.
- Headway is the supplied representative-weekday **peak-time** value. It does
  not establish all-day, weekend or present-day service; much of the underlying
  LYNX stop timing was interpolated. Null-headway stops remain in the any-stop
  screen because that scenario is explicitly location-only.
- K rings approximate walking proximity, not street-network distance. Lakes,
  highways, station entrances and barriers can invalidate geometric proximity.
  An uncovered endpoint also does not prove a trip impossible: longer walks or
  unmodeled services may exist. Whole H3 cells and block internal-point assignment hide within-cell variation.
- Brightline is **intercity**. Fares, timetable and the single supplied Orlando
  station do not establish local commute usability. Its removal is a sensitivity,
  not a finding that any affected job represents a real Brightline commuter.
- The stop layers are clipped to the four counties; nearby external stops and
  services not in these three layers are absent. OD includes only jobs whose
  home and work are both in the four counties; inbound workers are excluded.
- These are **jobs, not people** or observed transit trips. Confidentiality noise
  and the possible concentration of multi-site employers in LODES remain. The
  2023 OD data and October 2026 stop layers have different vintages.
- Baseline transit travel times from GTFS remain the next milestone. This screen
  does not verify what share of commutes is actually possible by transit today.

## K/headway sensitivity grid (PR #34 baseline preserved)

`analysis/rail/coverage_sensitivity.py` adds a separate, offline eight-row grid.
It imports the original coverage functions; it does not change `coverage.py`,
`transit_coverage_summary.json`, `transit_coverage_hex8.csv`, the OD CSV or any
stop layer. The original including/excluding-Brightline results remain intact.

### Grid assumptions and headway audit

Named constants are `K_VALUES = (0, 1)`, `SECOND_HEADWAY_MINUTES = 30.0`, and
`HEADWAY_THRESHOLDS_MINUTES = (15.0, 30.0)` (the 15-minute value is reused from
the original module). These are the requested **sensitivity assumptions**, not
validated catchment or frequency standards. The catchment-distance citation
remains **TBD**.

The headway field remains **`headway_best_route_min`, in minutes, including
LYMMO**. Numeric thresholds are inclusive and apply only to frequent LYNX:

| Audit of the supplied 3,664 LYNX stops | Count | Treatment |
| --- | ---: | --- |
| Positive headway ≤15 minutes | 207 | Selected for 15- and 30-minute frequent scenarios |
| Positive headway ≤30 minutes | 2,145 | Selected for the 30-minute frequent scenario; includes the 207 above |
| Null headway | 43 | Excluded from frequent service; retained in any-stop coverage |
| Missing headway key | 0 | Original validation fails if a key is missing |
| Zero headway | 0 | Original validation fails; zero is not instant/frequent service |

Negative, nonnumeric and non-finite values also fail. No values are imputed or
converted to a different unit. Neither rail station layer supports a frequency
filter; SunRail and Brightline remain **excluded from frequent LYNX**, while
both remain in any transit and rail only. Threshold is therefore not applicable
to any-transit/rail rows, rather than a second reason to duplicate those rows.

K=0 requires a stop within the **same H3 cell** as the flow endpoint; K=1 also
includes the first ring. The grid has two any-transit rows, four frequent-LYNX
rows, and two rail-only rows. No new no-Brightline grid is added; that existing
K=1 sensitivity is still compared against its preserved PR #34 result.

### Downtown Orlando geometry computed with H3

The diagnostic anchor is the **supplied Church Street SunRail station**, stop
ID `14`, at GeoJSON `[longitude, latitude] = [-81.38077, 28.538901]`. These are
input coordinates, not an invented downtown point. Its resolution-8 cell is
`8844a90097fffff`. Anchor choice affects only this geometry diagnostic, not any
scenario's coverage. All distances and areas below are computed by H3 4.4.2 at
runtime; none are constants in the analysis code.

| H3 measurement | Computed value |
| --- | ---: |
| Resolution-8 global average edge (`average_hexagon_edge_length`) | 531.41401 m |
| Resolution-8 global average cell area (`average_hexagon_area`) | 737,327.59759 m² |
| Church Street cell mean of its directed-edge lengths (`edge_length`) | 509.91824 m |
| Church Street cell edge minimum / maximum | 492.95760 / 532.44207 m |
| Church Street cell area (`cell_area`) | 673,352.94932 m² |
| Minimum center-to-center distance to an adjacent cell (`great_circle_distance`) | 843.34566 m |
| Maximum center-to-center distance to an adjacent cell | 912.55233 m |

| K | Cells in the anchor's disk | Summed spherical cell area | Distance from anchor center to other included centers |
| --- | ---: | ---: | --- |
| 0 | 1 | 673,352.94932 m² | 0 m: only the origin center is included |
| 1 | 7 | 4,713,470.57182 m² | 843.34566–912.55233 m to the six adjacent centers |

K=0 does **not** mean zero walking distance: the entire cell is included and a
stop/endpoint may be anywhere within it. K=1 does **not** define a half-mile
walk or a maximum stop-to-endpoint distance. The local measurements differ from
the earlier all-stop-cell measurements because this diagnostic concerns one
specified downtown cell. Neither these areas nor center distances account for
walkable streets, barriers or entrances. Catchment citation: **TBD**.

### Sensitivity results

The run on 2026-11-01 produced the following counts. All S000 shares use
1,006,088 jobs as the denominator. SE01–SE03 below are jobs in the both-covered
group; they are not household counts or identified workers.

| Scenario | K | Headway (min) | Both jobs (share) | Home only jobs (share) | Work only jobs (share) | Neither jobs (share) | Both SE01 | Both SE02 | Both SE03 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Any transit | 0 | — | 179,677 (17.8590%) | 93,307 (9.2742%) | 393,201 (39.0822%) | 339,903 (33.7846%) | 31,308 | 63,896 | 84,473 |
| Frequent LYNX | 0 | 15 | 5,813 (0.5778%) | 17,550 (1.7444%) | 166,036 (16.5031%) | 816,689 (81.1747%) | 1,078 | 2,000 | 2,735 |
| Frequent LYNX | 0 | 30 | 96,434 (9.5850%) | 77,904 (7.7433%) | 371,863 (36.9613%) | 459,887 (45.7104%) | 17,570 | 35,311 | 43,553 |
| Rail only | 0 | — | 418 (0.0415%) | 2,640 (0.2624%) | 71,773 (7.1339%) | 931,257 (92.5622%) | 36 | 76 | 306 |
| Any transit | 1 | — | 398,770 (39.6357%) | 89,195 (8.8655%) | 332,460 (33.0448%) | 185,663 (18.4540%) | 67,228 | 138,327 | 193,215 |
| Frequent LYNX | 1 | 15 | 20,235 (2.0113%) | 36,575 (3.6354%) | 222,378 (22.1032%) | 726,900 (72.2501%) | 3,546 | 7,094 | 9,595 |
| Frequent LYNX | 1 | 30 | 265,698 (26.4090%) | 104,262 (10.3631%) | 357,678 (35.5514%) | 278,450 (27.6765%) | 46,991 | 95,772 | 122,935 |
| Rail only | 1 | — | 6,610 (0.6570%) | 21,545 (2.1415%) | 143,968 (14.3097%) | 833,965 (82.8919%) | 847 | 1,482 | 4,281 |

### New output schemas and verification

- `data/processed/transit_coverage_sensitivity.csv`: eight data rows. Unique key:
  `(scenario, k_rings, headway_minutes)`. `scenario` uses `any_transit`,
  `frequent_transit` (frequent LYNX), or `rail_only`; `k_rings` is integer 0/1.
  `headway_minutes` is 15/30 for frequent LYNX and blank (not zero) otherwise.
  For each of `both_covered`, `home_only`, `work_only`, `neither`, the `_jobs`
  column is integer S000 and `_share` is its fraction of total jobs in [0,1].
  `both_covered_SE01`, `both_covered_SE02`, `both_covered_SE03` are integer counts
  of each original earnings category within the both-covered group. The source
  earnings definitions are unchanged. Row order is K, scenario, then headway.
- `data/processed/transit_coverage_sensitivity.json`: the same eight combinations
  in `rows`, with **all four groups' counts and shares for all four earnings/job
  columns** and flow-row counts. This exposes full earnings reconciliation even
  though the small CSV includes earnings only for the both-covered group.
  Additional fields record input SHA-256 hashes, original baseline-file hash,
  H3 version, named assumptions, headway audit, selected-stop/covered-cell counts,
  downtown geometry (full precision), `reconciled` and `baseline_reproduced`.
  Not-applicable headways are JSON null. Column-specific earnings shares retain
  the original contract's denominators; rounded displayed percentages may not
  sum to exactly 100%.

Every grid row's four groups must reconcile to **S000 1,006,088; SE01 164,743;
SE02 314,222; SE03 527,123**, and its group row counts to 591,177. All are
checked before either new file is written. The grid reuses the original strict
integer/H3/duplicate-pair validation without dropping flow rows.

The three K=1 baseline checks are explicit: any transit **398,770**,
frequent LYNX at 15 minutes **20,235**, and rail only **6,610** both-covered jobs.
In addition, all original four scenarios' group counts, earnings, shares and
flow-row counts are compared exactly to the existing PR #34 JSON, along with
source hashes and flow inventory. This also protects the existing no-Brightline
scenario. Any disagreement fails loudly before new outputs are written. The
original baseline JSON/CSV are read-only and are never regenerated by this entry
point. This is agreement with the supplied baseline, not independent validation
of the source timetables or actual travel conditions.

### Run the grid without overwriting PR #34 outputs

```powershell
py -3.14 -m pip install -r analysis/rail/requirements.txt
py -3.14 analysis/rail/coverage_sensitivity.py
py -3.14 -m unittest discover -s analysis -p "test_rail_coverage.py"
```

Optional `--input-dir` must contain the four original inputs and the preserved
`transit_coverage_summary.json`; `--output-dir` selects where the **new** CSV/JSON
are written. Use a temporary output directory to compare repeat runs. No new
pip dependency, GDAL, GeoPandas or Fiona is required. Validation ran on Linux
Python 3.13; Windows execution of the sensitivity script was not performed here.
The added fixture tests use tiny synthetic inputs, no network and no real files:
hand-checkable K=0/K=1 flow classifications, inclusive 30-minute filtering,
null/zero policy, complete baseline mismatch detection, output repeatability and
preservation of baseline/input bytes.

All prior limitations still apply. These are stop-proximity sensitivities, not
proof that any commute is possible, connected, affordable or timely by transit.
The 30-minute screen broadens eligibility; it does not validate all-day service.
Live service, GTFS routing, walking paths and the catchment-distance citation
remain unverified/TBD. No score or greedy model is created or changed.
