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
