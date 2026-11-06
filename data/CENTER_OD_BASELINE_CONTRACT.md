# Center-level commute baseline contract

This is an offline aggregation of existing baseline times into the independent
PR #42 activity centers, **not a routing run, ridership estimate, or rail score**.
No competitiveness ratio or threshold is computed. No source data is edited.

## Inputs and inspected schemas

- `data/processed/baseline_travel_times.csv.gz`: gzip CSV with exactly
  `h_hex`, `w_hex`, `S000`, `transit_min`, `car_min`. IDs are text, H3 resolution
  8; S000 is positive integer jobs; times are finite nonnegative float minutes
  or blank. The supplied SHA-256 is verified before any output is written.
  The file has 591,177 unique directed home/work pairs and 1,006,088 jobs.
- `data/processed/candidate_centers.geojson`: 146 GeoJSON Point features.
  Point coordinates are the existing weighted centroid, in WGS84 [lon, lat].
  Properties: `id`, `hexagon_count`, `total_jobs`, `total_population`, `criteria`,
  `hexagons`, `jobs_selected_hexagons`, `population_selected_hexagons`,
  `missing_job_hexagons`, `missing_population_hexagons`, `centroid_weight`.
  **594 distinct member hexagons are already listed in `hexagons`**; no membership
  recomputation or additional membership file is needed. Workplace totals and
  modeled population are not used as weights in this aggregation: S000 is.
- Rules come from `data/BASELINE_TRAVEL_TIMES_CONTRACT.md`,
  `data/CANDIDATE_CONNECTIONS_CONTRACT.md`, and
  `docs/rail-model-assumptions.md`. Existing candidate connections and their
  summary are hashed as protected outputs, but are not used to assign demand.
  No existing transit geometry or external plan influences assignment.

Hashes verified before and after generation (source files remain byte-identical):

| Input / protected file | SHA-256 |
| --- | --- |
| `BASELINE_TRAVEL_TIMES_CONTRACT.md` | `407d295a72b45a0d62b5fed14656aea833420d9b28b17232ace26b694194849b` |
| `CANDIDATE_CONNECTIONS_CONTRACT.md` | `73b05195e1188dbe4e40763c0989b7344776f32721d665df52da3b80bb57f995` |
| `baseline_travel_times.csv.gz` | `2544ef1fdefae60565d1ca1c0b8ca093292b8b7cb31237f7132594e3a1237c33` |
| `candidate_centers.geojson` | `ef9da498b027f32eadf3520a558647a45a01408523b344788a72689e3e2f11cc` |
| `candidate_connections.geojson` | `39fae03c9e8f0be5a832caf89913ccd011005fa479d167b3baec10d7163a1b16` |
| `candidate_connections_summary.json` | `809cb0dcb9b8a8be5bd2f692085604692fa58b8fcc9cbd400d6c8b4fdb795247` |

Source provenance remains in the input contracts: LODES 2023 workplace flows
and the owner's existing r5py baseline, with Kontur modeled population and WAC
workplace jobs defining PR #42's centers. No source was downloaded for this run;
routing was neither imported nor rerun. This validates aggregation of the stored
baseline, not reproduction of its routing computation.

## Parameters and method

All analysis choices below are **assumptions, not calibrated findings**. The two
time cutoffs carry forward the already documented model rules. Reporting choices
and numeric precision do not define a competitiveness threshold.

| Named constant | Value | Meaning |
| --- | --- | --- |
| `ASSIGN_MAX_KM` | 5 | Default maximum nearest-centroid distance for nonmembers |
| `ASSIGN_RADII_KM` | (3, 5, 8) | Full sensitivity grid, kilometers |
| `RESOLUTION` | 8 | Input H3 geography |
| `TRANSIT_MAX_MIN` | 120 | Inclusive maximum usable transit time, minutes |
| `CAR_MAX_MIN` | 60 | Inclusive maximum usable car time, minutes |
| `LARGE_FLOW_JOBS` | 50 | Inclusive reporting threshold for number of large center pairs |
| `TOP_PAIR_COUNT` | 20 | Number of largest directed pairs reported |
| `CONCENTRATION_PAIR_COUNT` | 100 | Top-pair concentration reporting count |
| `MEAN_DECIMALS` | 6 | Decimal places in saved weighted means; counts remain exact |

The expected 591,177 pairs, 1,006,088 jobs, 66/32 no-car role counts, 3,863
excluded jobs, and baseline hash are **reference invariants**, not tunable
parameters. Mismatches fail loudly before writing outputs.

1. A member hexagon always belongs to its listed center, regardless of its
   distance to that center's centroid. For every other hexagon appearing in the
   baseline, use `h3.cell_to_latlng` and `h3.great_circle_distance(..., unit='km')`
   to the existing center points. Choose the nearest, break exact distance ties
   by ascending center ID, and assign only if distance **≤** the radius. The
   nearest search is cached across the three radii; no randomness is used.
2. Derive no-car lists from the **unfiltered** baseline: a home cell has no
   nonblank car time in any home-role row; analogously for work. A car time
   above 60 still counts as present for this diagnostic. The lists match
   **66 home-role cells and 32 work-role cells: 98 role entries across 86
   distinct hexagons, with 12 in both lists**. The lists are saved in the JSON.
3. A row is excluded from **both modes' time averages** when its home is in
   the home list **or** its work is in the work list. Do not apply the union
   of cell IDs to both roles. The resulting **2,815 pairs / 3,863 jobs** remain
   in job and pair totals and are separately counted in each aggregate and
   unassigned group. These are suspected placement failures, not confirmed.
4. For each mode separately, discard blank times and times strictly greater
   than its cutoff, then compute `sum(S000 * time) / sum(S000)` over the
   remaining, nonexcluded rows. Denominators can differ between modes. Zero
   and equality at the cutoff are usable. An absent mean is blank/null, never
   a fabricated zero. No time ratio, access penalty or new route is calculated.
5. Aggregate **directed** `(home_center, work_center)` pairs. Reverse directions
   remain separate. Same-center pairs are retained and flagged `intra_center`;
   they are not restricted to same-hexagon pairs. Same-hexagon zero/near-zero
   times are retained without choosing the future model's still-TBD rule.
6. Classify all original rows into four exhaustive groups and reconcile both
   pair counts and jobs at each radius. The center-pair aggregates also
   reconcile to their assigned-both group for jobs, counts, exclusions and
   both mode-specific usable-job counts. Sort center pairs by home/work ID;
   sort the unassigned table by radius/category. Rank report pairs by descending
   jobs, then home/work ID. JSON keys and gzip metadata are deterministic.

## Outputs

### `data/processed/center_od_baseline.csv.gz`

One row per observed assigned/assigned directed center pair at **5 km**; no
zero-flow pairs are inserted. There are **18,916 rows**.
The pair count in this schema counts original hexagon OD rows, not center pairs.

| Column | Meaning / units |
| --- | --- |
| `home_center`, `work_center` | Original PR #42 center IDs, strings |
| `intra_center` | 1 when the two center IDs match, otherwise 0 |
| `pair_count` | Number of baseline hexagon pairs in this center pair |
| `jobs` | Sum of S000, integer jobs (not unique people), including exclusions |
| `excluded_pair_count`, `excluded_jobs` | Role-specific no-car exclusions from time averages only |
| `transit_usable_jobs`, `car_usable_jobs` | S000 denominator for each mode's mean after exclusions/cutoffs |
| `transit_mean_min`, `car_mean_min` | Job-weighted mean of original hexagon-pair times, float minutes; blank if denominator zero |
| `home_access_mean_km`, `work_access_mean_km` | Job-weighted mean great-circle access distance at each end, kilometers; denominator is all `jobs` in the center pair, including time-excluded jobs |

These are **not times rerouted between center centroids**. Job totals reconcile
only when the separate unassigned categories are added. The output has no
competitiveness score or predicted passengers.

### `data/processed/center_od_unassigned.csv`

Nine rows: three role categories at each radius. Columns: `assign_max_km`
(kilometers), `category`, `pair_count`, `jobs`, `excluded_pair_count`,
`excluded_jobs` (counts as above). `home_unassigned` means only the work end is
assigned; `work_unassigned` means only home is assigned; `both_unassigned`
means neither end is assigned. These categories are mutually exclusive.

### `data/processed/center_od_sensitivity.json`

- `parameters_assumptions`, `sources` (hashes), `h3_version`, input totals,
  center/membership counts, and `exclusions` (role lists/counts, overlap,
  distinct count and excluded pair/job totals).
- `scenarios`: one object per radius. `groups` has `assigned_both`, `home_only`,
  `work_only`, `unassigned` (neither). Each reports pair/job totals, exclusion
  totals, per-mode usable jobs/means and `share_jobs` of **all 1,006,088 jobs**.
- `center_pair_count`, `center_pairs_at_least_50_jobs`, `intra_center_jobs`,
  `intra_center_share_all_jobs`, `intra_center_share_assigned_jobs`, and
  `top_100_share_assigned_jobs`. Top-100 includes intra-center pairs.
- `centers_without_assigned_pair_flows` checks centers occurring in assigned/
  assigned output; `centers_without_any_endpoint_flows` also counts an assigned
  endpoint whose opposite end is unassigned. Empty lists mean all centers occur.
- `default_top_20_pairs`: the default CSV fields plus `transit_option_share`
  = usable-transit jobs / all jobs in that center pair, including exclusions
  in the denominator. `default_top_20_transit_option_share` is job-weighted
  across those 20 pairs. Shares are fractions in [0,1], not percentages.

## Actual results

| Radius (km) | Both assigned jobs (share) | Home only jobs (share) | Work only jobs (share) | Neither jobs (share) | Intra-center jobs (share of all) | Center pairs ≥50 jobs |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 688,460 (68.4294%) | 51,070 (5.0761%) | 227,008 (22.5634%) | 39,550 (3.9311%) | 55,126 (5.4792%) | 2,265 |
| 5 | 843,604 (83.8499%) | 26,026 (2.5869%) | 120,466 (11.9737%) | 15,992 (1.5895%) | 66,807 (6.6403%) | 2,865 |
| 8 | 943,800 (93.8089%) | 10,470 (1.0407%) | 47,690 (4.7401%) | 4,128 (0.4103%) | 76,303 (7.5841%) | 3,174 |

At 5 km, intra-center jobs are **66,807**:
**6.6403% of all jobs**, or
**7.9192% of assigned jobs**.
The top 100 center pairs hold **24.3242%**
of assigned jobs. Across the largest 20 pairs, **79.4283%**
of jobs have a usable transit option after the stated rules. All 146 centers
have flows at every radius, under both definitions above. Detailed top-20
values are in the JSON, with no competitiveness interpretation.

## Reproduce and test

Windows Python 3.14, no GDAL (dependencies unchanged):

```powershell
py -3.14 -m pip install -r analysis/rail/requirements.txt
py -3.14 analysis/rail/center_od.py
py -3.14 -m unittest discover -s analysis/rail -p test_rail_center_od.py
```

On Linux, replace `py -3.14` with `python3`. The analysis itself imports only
standard library modules and h3 v4; it does not import the routing stack.
Use `--output-dir <directory>` to reproduce into a separate directory for
comparison. Only the four documented outputs are written. No center-membership recomputation, raw data, baseline routes or candidate-center outputs are regenerated.

The supplied files were processed here using Linux Python 3.13 and h3 4.4.2.
Windows Python 3.14 execution was not directly tested. Fixture tests use tiny
synthetic data without network or large inputs.

## Limitations

- Aggregation hides within-center structure and variation in route availability.
  Mean times use different subsets per mode and should not be subtracted as if
  they necessarily represented the same jobs. Consult usable-job denominators.
- Endpoints outside membership and the chosen catchment remain unassigned;
  those workers are not served by this aggregated model. Assignment distance is
  great-circle distance, not a measured walking route, service catchment or
  proof of rail access. The radius is an arbitrary sensitivity assumption.
- LODES privacy noise affects small flows; only large flows should be quoted.
  The 50-job reporting screen is an assumption, not a guarantee of precision.
  Counts are jobs, not people or forecast ridership.
- Centers may inherit LODES's large-employer location effect near Walt Disney
  World. This is a possibility to check, not a corrected or proven finding.
- Hexagon-centroid times approximate door-to-door travel. The input's one
  departure snapshot, free-flow driving, clipped routing extent and suspected
  snapping failures remain limitations. Blank time does not establish no route.
- No competitiveness threshold is applied; its cited value and the same-
  hexagon model treatment remain open decisions. No score or greedy code is
  created or edited by this task.


## Access distance extension (follow-up to PR #44)

**Access distance is carried forward for a later model step and is not charged
in this dataset.** No speeds, access penalties, distance-to-time conversion or
changes to stored transit/car times are introduced. Those model choices require
cited sources and remain outside this task. All pre-existing CSV columns and
JSON values are preserved; `center_od_unassigned.csv` remains byte-identical.

For every assigned baseline hexagon, compute
`h3.great_circle_distance(h3.cell_to_latlng(hexagon), assigned_centroid, unit='km')`.
This is distance to the **assigned** center, not necessarily the closest center
for member hexagons. The PR #44 zero marker for member assignment is not used as
an access measurement. Members retain their original owner regardless of distance;
therefore actual access distances can exceed 3, 5 or 8 km even in that radius's
scenario. Nonmembers retain the existing inclusive radius and nearest-ID tie rules.
These are straight-line distances, not routed walking distances or travel times.

### Per-hexagon record

`data/processed/center_hex_access.csv.gz` has one row per assigned baseline
hexagon **per radius**, sorted by radius and H3 ID:

| Column | Meaning / units |
| --- | --- |
| `assign_max_km` | Existing assignment scenario: 3, 5 or 8 km |
| `hexagon` | Original H3 resolution-8 ID, string |
| `center_id` | Assigned PR #42 center ID, string |
| `access_km` | Actual great-circle distance to the assigned centroid, kilometers |

A hexagon appearing in both roles has a single record per radius. Unassigned
hexagons have no record for that radius; no zero distance is fabricated for them.
The file records assignments for baseline hexagons, not unused center members.

### Pair means and sensitivity percentiles

The two new columns at the end of `center_od_baseline.csv.gz` use
`sum(S000 * endpoint_access_km) / sum(S000)` for all original rows in the
assigned/assigned center pair. They use the existing six-decimal output precision.
Time exclusions and missing/over-limit times do not remove geometrically assigned
jobs from these distance means. Intra-center pairs can have nonzero access at both
ends. Existing time means, denominators, job counts and exclusions do not change.

Each sensitivity scenario adds `access_distance_km` with `home`, `work`, and
`pooled_ends` objects. Each reports `assigned_job_ends`, `median_km`, and `p90_km`:

- Home and work distributions weight each assigned endpoint distance by S000,
  including rows whose other end is unassigned and jobs excluded from time means.
- The pooled distribution combines the two role distributions. A job with both
  ends assigned contributes **two endpoint observations**, one per end; a job
  with only one assigned end contributes one. This is not a distinct-job count
  or the distribution of summed home-plus-work distance per commute.
- Percentiles use the **inverse weighted empirical CDF**: the smallest distance
  where cumulative job weight reaches at least 50% or 90%. There is no linear
  interpolation. Values are computed from unrounded distances; empty weighted
  distributions would report null percentiles and zero assigned job ends.

The observed results below are in km, rounded to six decimals for this table;
JSON and per-hexagon records retain full calculated float precision.

| Radius | Home median | Home P90 | Work median | Work P90 | Pooled median | Pooled P90 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 1.676089 | 4.908167 | 1.443411 | 3.290854 | 1.523261 | 4.088335 |
| 5 | 1.827040 | 4.720980 | 1.492857 | 3.901194 | 1.661028 | 4.287730 |
| 8 | 2.191412 | 6.138537 | 1.513988 | 4.241441 | 1.764833 | 5.278447 |

These conditional distributions need not vary monotonically with assignment
radius: additional assigned jobs change their weights, while member distances
remain unconstrained by the radius. No distance is capped or converted to time.
