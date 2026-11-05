# Candidate centers and connections

These are **illustrative candidates for a rail model, not routes or proposals**.
The offline pipeline reads only the local population and workplace-job files
below. Existing transit and existing plans are not inputs to selection,
clustering, weighting, neighbor choice or pruning. No raw data is downloaded.

## Inputs and schema findings

- `data/processed/kontur_h3_four_counties.geojson`: FeatureCollection of **7,896
  Polygon features**. Properties: `h3`, `population`, `county`, `tract_geoid`,
  `tract_pop_acs_x`, `tract_pop_acs_y`. Only validated resolution-8 `h3` and
  numeric `population` are used; ACS tract totals and polygon geometry are not
  used as weights. Total supplied modeled population: **2,732,377**. Kontur
  release **2023-11-01**, modeled people rather than a measured census count.
- `data/processed/lodes_wac_blocks_2023.csv`: **15,574 rows**, with string
  `w_geocode`, `tract_geoid`, `county`, integer `jobs_total`, `CNS01`–`CNS20`,
  and complete `lat`, `lon` columns. IDs remain strings. Coordinates are block
  internal points from the LODES crosswalk, not centroids. Sum `jobs_total` by
  `h3.latlng_to_cell(lat, lon, 8)`: **1,482,556 jobs in 4,503 observed cells**.
  Only job totals are used; no sector weights or additional metrics are created.
  This is the 2023 workplace-based source used by Employment, including workers
  regardless of whether their homes are in the four counties.

**No OD fallback was used.** If WAC is absent or lacks required columns, the
script explicitly labels a fallback that sums `S000` by `w_hex` from the local
`lodes_od_hex8_2023.csv`. That fallback would represent only workers who live
and work in the four counties (about 1,006,088 of 1,467,549 workplace jobs in the
Florida main OD file). Corrupt present IDs, counts or coordinates fail loudly
rather than silently changing sources. Input hashes and inspected schemas are
recorded in the summary JSON. Existing source attribution remains in
[DATA_SOURCES.md](../docs/DATA_SOURCES.md).

## Method and named assumptions

| Constant | Value | Meaning |
| --- | ---: | --- |
| `TOP_SHARE` | 0.05 | Select the top 5% independently in each source's observed-cell universe |
| `K_NEAREST` | 3 | Each center nominates its three nearest other centers |
| `MAX_KM` | 40 | Keep nominations at or below 40 great-circle km |
| `RESOLUTION` | 8 | Common H3 cell resolution |
| `CLUSTER_RINGS` | 1 | Adjacency for connected clustering via `h3.grid_disk` |
| `PERCENTILES` | 0, 25, 50, 75, 90, 95, 99, 100 | Descriptive report levels; no selection or modeling effect |

These are **assumptions, not findings or calibrated values**. The two arbitrary
threshold constants (`TOP_SHARE`, `MAX_KM`) and the neighbor-count choice affect
the resulting centers and graph. They were not tuned against existing plans.

1. Rank each source's observed cells descending by its value, then ascending
   by H3 ID. Select exactly `ceil(TOP_SHARE * observed_cell_count)`. Do not expand
   ties to include every cell at the cutoff. Do not pad either ranking with
   cells missing from that source. Thus the selected fraction can slightly
   exceed 5% because counts are discrete.
2. Union the selected IDs, then merge transitively adjacent selected cells
   into connected clusters. Unselected intermediate cells are not bridges.
3. ID each cluster as `center_` plus its smallest member H3 ID. This is stable
   under input reordering, not a persistent identity if membership changes.
   Sum represented jobs and population across **all member cells**, not merely
   whichever criterion selected each cell. A missing cross-source value
   contributes nothing to the represented total; it is **not a measured zero**.
   Missing-member counts are explicit. There are 140 job cells absent from the
   population source, and 3,533 population cells absent from the job source.
4. Compute a spherical weighted mean of member H3 cell centers, weighted by
   jobs; use population weights if total jobs are zero. This point is not a
   station/site recommendation, polygon centroid or population distribution
   within a cell. A cluster with neither positive jobs nor population fails
   rather than inventing weights. Sort centers by descending total jobs, then ID.
5. Use `h3.great_circle_distance` between center points. Rank neighbors by exact
   distance, then ID, nominate up to `K_NEAREST`, and skip distances >`MAX_KM`.
   Keep the union of nominations as undirected pairs; mutual nomination is not
   required. Canonicalize endpoint IDs ascending, deduplicate, and sort pairs.
   An undirected center can consequently have degree greater than three.
6. Report all connected components and any degree-zero center. No connecting
   edge is invented to force a connected graph. All ordering is deterministic;
   there is no randomness. Percentiles use linear interpolation at `(n-1)*p`.

## Output schema

All geometry is WGS84 longitude/latitude in GeoJSON; no projected CRS declaration.

`data/processed/candidate_centers.geojson` — Point features:

| Property | Meaning / units |
| --- | --- |
| `id` | Stable-with-membership center identifier |
| `hexagon_count`, `hexagons` | Member count and sorted original H3 IDs |
| `total_jobs` | Represented workplace jobs, integer |
| `total_population` | Represented modeled people, numeric |
| `criteria` | `jobs`, `population`, or `both`; criteria met across member cells |
| `jobs_selected_hexagons`, `population_selected_hexagons` | Members selected by each ranking; may overlap |
| `missing_job_hexagons`, `missing_population_hexagons` | Members absent from the corresponding source |
| `centroid_weight` | `jobs` or `population` |

The Point coordinates are the weighted centroid. `both` can mean different
members met different criteria; it does not require a single cell to meet both.

`data/processed/candidate_connections.geojson` — LineString features, exactly
two endpoint coordinates; properties `from_id`, `to_id` (canonical center IDs),
and `km` (great-circle kilometers). The drawn segment is illustrative; `km` is
not rail construction length, routed distance or travel time.

`data/processed/candidate_connections_summary.json` — parameters, H3 version,
source hashes/schemas and fallback flag, ranking denominators/thresholds/ties,
hexagon percentiles, totals/shares inside centers, cross-source missingness,
connection-length percentiles, all component memberships, isolated centers,
and the job-concentration flags. Shares use each full supplied source total,
not OD commuter jobs. An empty distance distribution has null percentiles.

## Actual output and interpretation

The job ranking selects **226 of 4,503 cells**, minimum selected **1,429 jobs**.
The population ranking selects **395 of 7,896 cells**, minimum selected **1,447
modeled people**; three cells tie there, and two are selected by ascending ID.
The interpolated 95th percentile is distinct from the rank-selection cutoff.

There are **146 centers** containing **936,432 jobs (63.16335%)** and **858,238
modeled people (31.40994%)**, and **270 undirected connections**. There are
**no degree-zero centers**, but **three disconnected components of 136, 5 and
5 centers**. The summary lists every component's IDs, including both five-center
components disconnected from the largest component.

The requested diagnostic cell **`8844a9160dfffff`**, near Walt Disney World,
contains **4,252 jobs in this WAC aggregation**, not the largest count in this
source. The largest WAC cell is **`8844a9166bfffff` with 84,289 jobs**. The supplied
OD-based hotspot description must not be substituted for WAC values. Both are
flagged; counts are not corrected, capped or redistributed. A large concentration
**may** reflect LODES assigning a multi-site employer to one location; this is a
possibility to check, not a finding about an employer or its actual sites.

## Reproduction and tests

From the repository root, using the existing dependency environment:

```text
py -3.14 -m pip install -r analysis/rail/requirements.txt
py -3.14 analysis/rail/centers.py
py -3.14 -m unittest analysis.rail.test_rail_centers
```

The generator itself imports only standard-library modules and H3 v4; it needs
no GDAL, pandas, geopandas or shapely. Dependencies are unchanged. Optional
`--input-dir` and `--output-dir` arguments support local fixtures or separate
output directories. The script writes only the three new output filenames.
Fixture tests cover selection/rounding/ties, connected adjacency, weights and
missingness, nearest neighbors/cap/deduplication, graph isolation and deterministic
byte output. No fixture needs network access or large files. Windows Python
3.14 execution was not performed in this Linux environment.

## Limitations

- Straight lines are not routes; they ignore water, terrain, barriers, land
  ownership, rights-of-way and engineering feasibility. Centroids may lie in
  unsuitable places or outside the member-cell shapes.
- Threshold and neighbor choices are arbitrary assumptions, not inferred
  optimal service patterns. Source-specific ranking universes and missing data
  affect selection; absent observations are not established zeros.
- Kontur's 2023-11-01 release is a modeled estimate combining inputs of differing
  vintages, whereas LODES is a 2023 administrative workplace-job count with
  confidentiality noise and employer-location limitations. They are not
  contemporaneous measured counts of the same population; jobs are not people.
- Source coverage and releases are accepted as supplied; no live-source or field
  validation was performed. Population and job point assignment differ from
  tract-based layers and need not align with them.
- No costs, speeds, ridership, schedules or rail modes are included or implied.
  No routing, scoring or optimization is performed. Independence from existing
  plans is intentional so that later comparison is meaningful.
