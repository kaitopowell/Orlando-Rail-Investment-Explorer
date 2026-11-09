# Frontend place names and top commute flows

This browser view summarizes existing outputs. It does not rerun analysis,
modify any source output, infer place names, score rail, or predict ridership.
**Place names are editorial labels** written by the project author, not labels
derived from a demographic, employment, routing, or geographic dataset.

## Inputs and browser delivery

| Input | Actual schema / meaning |
| --- | --- |
| `data/center_labels.csv` | 146 rows; `center_id`, `name`, `confidence`, `note`. Author-written names; confidence and notes remain editorial metadata, not analytical metrics. |
| `data/processed/center_od_baseline.csv.gz` | 18,916 directed center-pair rows at the source summary's default 5 km radius. Columns listed below. |
| `data/processed/center_od_sensitivity.json` | Source parameters, totals, exclusions, three `scenarios` with `assign_max_km`, four assignment groups and intra-center totals/shares; additional access-distance and top-pair summaries. |
| `data/processed/candidate_centers.geojson` | 146 Point features; WGS84 centroid in geometry. Properties: `id`, `hexagon_count`, `total_jobs`, `total_population`, `criteria`, `hexagons`, `jobs_selected_hexagons`, `population_selected_hexagons`, `missing_job_hexagons`, `missing_population_hexagons`, `centroid_weight`. |
| `data/processed/candidate_connections.geojson` | 270 LineString features, two coordinates each; `from_id`, `to_id`, `km`. Illustrative candidate connections, not routes. |

OD columns: `home_center`, `work_center`, `intra_center`, `pair_count`, `jobs`,
`excluded_pair_count`, `excluded_jobs`, `transit_usable_jobs`, `transit_mean_min`,
`car_usable_jobs`, `car_mean_min`, `home_access_mean_km`, `work_access_mean_km`.
Jobs are counts, means are minutes, access distances are km. IDs remain strings.
See [CENTER_OD_BASELINE_CONTRACT.md](CENTER_OD_BASELINE_CONTRACT.md) for the
underlying cutoff, role-specific exclusion, assignment and access-distance rules.

The label CSV, baseline gzip and sensitivity JSON are copied **byte-identically**
to `public/data/`; the existing candidate browser copies are reused. No new
processed output is generated. `src/data/csv.ts`, `centerLabels.ts` and `flows.ts`
validate and adapt these files. Gzip is decoded with the browser's
`DecompressionStream`; already HTTP-decoded responses are detected by magic bytes.
No additional dependency or server API is needed.

All source center IDs in labels/flows must exist. Duplicate label IDs and directed
pairs, malformed CSV, invalid counts/times, inconsistent intra flags, impossible
usable-job counts and inconsistent summary totals/shares fail visibly. The OD
row count, jobs, source-pair count, exclusions, per-mode usable jobs and intra
jobs reconcile against the default scenario. A missing/malformed flow file shows
a sidebar error and Retry, with no partial flow lines. Missing/malformed labels
show their own error and Retry; validated geometry remains usable with fallback
names. An intentionally blank name is valid editorial input, but is reported
as a missing label. The supplied file has no unknown/duplicate IDs and one blank:
`center_8844a98d4bfffff`. It displays **Unnamed center**, with its ID secondary.
Names are used verbatim. Native select options put names first and IDs after a
separator; panels use small secondary ID text. Editorial notes are not used to
write explanations about the causes or character of a place.

## Ranking, means, and explanations

- The default-radius input has **843,604 assigned commuting jobs**. **66,807**
  (7.91923698797066%) start and end in the same center. These jobs remain in
  the share denominator, but intra-center lines are never drawn.
- Combine A→B and B→A by a canonical sorted center-ID key; do not double a
  same-center row. Rank all combined pairs by total jobs descending, ties by
  canonical ID. The **all-pair ranks include 143 intra-center pairs**: 10,574
  total ranked pairs, of which 10,431 are inter-center. Draw only the first N
  inter-center pairs. List numbering can skip ranks occupied by intra-center
  pairs; the sidebar explicitly explains this. A missing reverse direction
  says “No recorded flow in this direction,” rather than inventing observations.
- A combined mode's mean is `sum(direction_mean * direction_usable_jobs) /
  sum(direction_usable_jobs)`, not an unweighted average or weighted by all
  jobs. Null means with zero usable jobs do not contribute; a zero mean with
  positive usable jobs is valid. All-zero usable counts display “Unavailable”.
  These means recombine the source's six-decimal means; original hexagon times
  are not reprocessed and excess precision is not implied by the UI.
- Flow share = combined jobs / **all assigned jobs**, including intra-center.
  Transit-option share = combined transit-usable jobs / combined jobs. It
  inherits the source's ≤120-minute transit rule and role-specific exclusions;
  blank time is not proof that no route exists. Driving means inherit the
  ≤60-minute rule and are free-flow, without congestion. Mean times use
  mode-specific subsets and are not a competitiveness comparison.
- Direct candidate connection is an undirected exact endpoint lookup in the
  candidate connections file, not geographic overlap or an inferred route.
- The Disney caveat is shown only if either center's supplied `hexagons` contains
  `8844a9160dfffff`. The possible large-employer location assignment is flagged,
  not asserted as fact or corrected.
- `describeFlow` uses a fixed template: place names, job total and assigned-job
  share, all-pair rank, free-flow driving mean and its usable-job count,
  transit-option share and usable transit mean, and direct-candidate yes/no.
  Directional panels retain the original two directions separately. No causes,
  predictions, rail benefits, or claims about why a place is a job center are
  generated. Access distances are **not charged as time**.

Sensitivity displays the supplied 3/5/8 km shares of **all 1,006,088 input jobs**,
not the 843,604-job default assigned denominator used for individual flows:

| Radius | Both assigned | Home only | Work only | Neither |
| ---: | ---: | ---: | ---: | ---: |
| 3 km | 68.43% | 5.08% | 22.56% | 3.93% |
| 5 km | 83.85% | 2.59% | 11.97% | 1.59% |
| 8 km | 93.81% | 1.04% | 4.74% | 0.41% |

The leading combined flow is Downtown Orlando to Universal / I-Drive / Millenia
area: **16,799 jobs**, comprising **4,041** and **12,758** in the two directions.
It is rank **1 of 10,574** and **1.99%** of assigned jobs. Usable driving mean:
**16.4 minutes**; transit-option share **89.14%**, with usable transit mean
**78.5 minutes**. There is **no direct candidate connection** between these IDs.
These rounded examples are verified against the adapter; they are not hardcoded
into the rendering or explanation template.

## Display assumptions and accessibility

- `DEFAULT_TOP_N=10`; `TOP_N_OPTIONS=[5,10,20]`. This is a display selection,
  not an optimization result or a precision guarantee. Small flows carry Census
  privacy noise; only the largest inter-center flows are highlighted.
- `FLOW_STYLE` in `src/map/flowLayers.ts`: uniform coral [239,112,91,175],
  width `0.04 * sqrt(jobs)` pixels bounded to 1.2–6 pixels. Highlight changes
  color, not analytical width. Arc height 0.18, tilt 30 degrees are illustrative
  curvature choices, not altitude, route geometry or service characteristics.
- `PLACE_LABEL_STYLE` in `src/map/placeLabels.ts`: center job threshold 20,000
  workplace jobs, general minimum zoom 8.5, threshold-center minimum zoom 9.5,
  font 11 px, collision padding 5 px and vertical offset −15 px. These are
  cartographic assumptions only. Candidate center selection/data remain intact.
- Eligible map labels are top-flow endpoints plus centers meeting the job
  threshold. Labels prioritize a selected flow, then top-flow endpoints, then
  jobs/ID. Screen-space text boxes use measured text widths to suppress overlaps
  and reject collisions with rendered basemap symbols. Labels can be suppressed
  at low zoom, offscreen or by collisions; all names remain available in the
  selectors, ranked list and inspection panels. This does not change basemap
  label behavior. Both new deck layers sit beneath basemap labels.
- Toggles are independent and off by default. Native controls, an ordered list
  of buttons, visible focus and textual ranks/jobs make inspection available
  without a mouse or color discrimination. Candidate IDs remain accessible.
  There are no animations or hover transitions, including under reduced motion.
  Fetches abort and map event listeners/overlay layers clear on unmount.

## Limitations and verification

“Today” refers to the stored baseline snapshot, not live schedules. Assignment
radius affects membership and coverage; only the default-radius table is drawn.
Straight arcs are visual summaries of paired centers, not usable travel routes,
proposals or construction alignments. Counts are jobs, not unique people or
forecast ridership. Existing LODES privacy noise, possible employer-location
concentration, modeled center population, free-flow driving, snapping failures,
and snapshot/centroid routing limitations still apply.

`npm run test:flows` checks source-copy equality, CSV/label/flow validation,
missing-label fallback, weighting, ties, ranks, fixed-template values, membership
caveats and connection lookup, plus browser controls, picking, error/retry and
coexistence at laptop and phone widths. Existing sidebar and candidate smoke
assertions are updated only for the extra toggle and new place-label layer.
Browser regressions use controlled basemap fixtures, not a live-service guarantee.
