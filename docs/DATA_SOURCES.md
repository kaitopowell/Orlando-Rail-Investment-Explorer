# SOL/R data sources

## County boundaries

- Source: [U.S. Census Bureau 2025 cartographic county boundaries, 1:500,000](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip).
- Vintage: 2025.
- Downloaded: October 12, 2026 at 11:11 PM America/New_York, as supplied by the repository owner.
- Input: `data/raw/cb_2025_us_county_500k.zip`.
- Counties: Lake (12069), Orange (12095), Osceola (12097), Seminole (12117).
- Processing: `analysis/prepare_counties.py` filters the local archive, simplifies at 75 metres in NAD83 / UTM 17N, and exports WGS84 GeoJSON to `public/data`. Source metadata and the input checksum are in `public/data/counties-source.json`.
- This cartographic product is for regional visualization, not surveying or analytical inference.

## Basemap

[CARTO Dark Matter](https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json), with CARTO/OpenStreetMap attribution displayed on the map. External tile services require network access. Basemap labels are not project analytical datasets.

## Camera anchors and future layers

The approximate named coordinates in `src/config/mapViews.ts` configure the default camera only; they are not analytical observations. Population, Employment, Equity, and Existing transit are live, optional frontend layers. No ridership estimates, infrastructure costs, or optimization results are supplied.

## Tract population pipeline

Inputs are the supplied local `data/raw/acs_b01003_tracts_2024_5yr.csv`, `acs_b01003_counties_2024_5yr.csv` (ACS 2024 five-year B01003 population estimates and margins of error; ACS access date **2026-10-13**), and `cb_2024_12_tract_500k.zip`. The tract boundaries are the **2024 cartographic boundary file, 1:500,000**, from https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_12_tract_500k.zip. The county outlines already in this repository use the **2025** file; these vintages are distinct.

Run `/usr/bin/python3 analysis/prepare_population.py` (Python with GDAL/OGR bindings, available in the cloud image). It reads the ZIP directly through GDAL `/vsizip/`; it performs no downloads. CSV cells, including GEOID/state/county/tract, are read as strings. State (2), county (3), and tract (6) are zero-padded and concatenated into an 11-character GEOID, checked against the supplied GEOID. Only county FIPS 12069, 12095, 12097, and 12117 are included. Duplicate or invalid identifiers fail validation. Both directions of unmatched GEOIDs are printed, and unmatched inputs stop generation rather than silently dropping tracts.

`B01003_001E` becomes `pop_est`; `B01003_001M` becomes `pop_moe`. Blank or negative margins become JSON `null`; a genuine zero margin remains zero. Zero-population tracts are retained. Invalid/missing population estimates fail validation rather than being imputed. `density` is people per square kilometre of the boundary's original `ALAND` (square metres), not simplified polygon area or water area. Zero land area yields null density, not infinity. `county` contains the county name. Output properties are exactly GEOID, county, pop_est, pop_moe, density.

Geometry is projected to NAD83 / UTM 17N, simplified with a 30-metre topology-preserving tolerance, checked for validity, and exported as WGS84 GeoJSON. Individual polygon topology is preserved; this display simplification is not a coverage model for spatial analysis. Sorted GEOIDs and deterministic JSON make repeated output reproducible. Output: `public/data/population_tracts.geojson`. The script prints tract totals, joined totals, county estimates, and signed differences (tract minus county); it never adjusts estimates to force agreement or sums tract margins of error.

Validation on the supplied files: **490 matched tracts**, including **one zero-population tract**; no unmatched GEOIDs. County totals match exactly: Lake 412,924; Orange 1,471,937; Osceola 427,415; Seminole 481,470 (all differences zero). Run `/usr/bin/python3 -m unittest discover -s analysis -p 'test_*.py'` for identifier, missing-margin, zero-population, density, join-reporting, real-input, geometry, and reproducibility checks. Synthetic rows occur only in tests; no observations are invented in the exported dataset.

## Population visualization

The Population toggle fetches the generated local GeoJSON. deck.gl ColumnLayer places columns at area-weighted polygon centroids calculated in longitude/latitude coordinates, subtracting holes and weighting MultiPolygon parts by area. These are display locations, not population-weighted centers. Columns use a square-root scale: display height in metres = 20 × √(people/km² of land). No clipping, ranking, or population estimates are invented. Zero population and unavailable density produce no column; all tract polygons remain pickable. Missing margins and density are displayed as unavailable. The inspector displays the estimate ± its supplied margin of error and links the ACS 2024 five-year B01003 source (accessed 2026-10-13). The faint glow and outlines are display styling only.

Enabling Population tilts the map to 45° to reveal column height; the 2D / 3D control toggles tilt, and disabling the layer restores a flat view. The tract selector also provides keyboard access to every tract, including zero-population tracts. `npm run test:population` runs data/centroid/scale checks plus phone/laptop browser tests; start the dev server first and set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` in the cloud environment.

Population visual styling uses a 2.5-pixel minimum column radius at regional zoom, increasing with zoom to a capped 8-pixel radius. Width is a visibility aid, not another data measure. Tract fill opacity ranges from 8/255 to 32/255 using square-root density normalized to the dataset maximum; missing density stays unshaded. Outlines use a faint 0.75-pixel stroke. At zoom 9 and above, minor road/place labels and POIs are hidden while Population is active; city and major-road labels remain, and original label visibility is restored when the layer is disabled. Four counties retains the flat full-region overview; the 3D control restores the 45° tilt. Data and column-height scaling are unchanged.

In Population **3D only**, a deck.gl GeoJsonLayer extrudes the supplied tract polygons. Height is `80 × √density` metres: **4×** the original `20 × √density` display scale. There is no minimum height; zero population or missing density remains flat and dark, and every tract stays inspectable. The shared dark-teal → cyan → warm-white ramp uses square-root density normalized to the dataset maximum, for both polygon color and the 3D legend. Height and color mean people/km² of land, not building height. Fill alpha is 190/255; ambient plus directional light separates tops and sides, and thin lighter paths trace top rings (including holes). The 2D rendering and legend, data, 45° camera pitch, toggle and Four counties behavior remain unchanged. This replaces the former 3D beams; no additive glow remains.

## Existing transit

- SunRail: GTFS from https://corporate.sunrail.com/gtfs/google_transit.zip, accessed 2026-10-13, SHA1 `64321ecbdaa919208e097dddeebda4d0718ecf7c`, raw file `data/raw/sunrail_gtfs_2026-10-13.zip`. SunRail’s data page, https://corporate.sunrail.com/about-sunrail/gtfs-data-download/, provides the feed “as is” with an FDOT disclaimer and does not name a license.
- Brightline: GTFS, feed `f-brightline~trails`, producer URL http://feed.gobrightline.com/bl_gtfs.zip, downloaded through the Transitland REST API on 2026-10-13, SHA1 `5f0efcb0501d829cadc386953c8c1c3d49367d91`, raw file `data/raw/brightline_gtfs_2026-10-13.zip`. Transitland lists no license for this feed (all license fields blank), so the license is not specified. Brightline is the data producer. Credit: [Transitland](https://www.transit.land/), as required by its free-plan terms.
- Lines and stations were clipped to Lake, Orange, Osceola and Seminole counties using the 2025 county boundaries; stations outside those counties are excluded.
- Brightline is intercity service and is not counted as local baseline service.

`/usr/bin/python3 analysis/prepare_transit.py` reads the four supplied `data/processed/*_line.geojson` and `*_stations.geojson` files, simplifies lines with a 10 m topology-preserving tolerance in EPSG:26917, and writes WGS84 copies to `public/data/`. It preserves feature properties and station coordinates; no downloads or fabricated geometry. Two line features per service, 15 SunRail stations and one Brightline station are retained. Source line features have shape IDs but no route names; the inspector uses the service name instead of inventing route names.

The independent transit toggle draws orange SunRail and yellow Brightline with three additive passes, station glows, bright cores/rings and labels at zoom 10+. A subtle four-second pulse is disabled for reduced motion. Transit draws after Population with depth comparison `always` and depth writes disabled, so it remains visible in 2D and 3D. Click/tap or use the keyboard-accessible selector to inspect lines and stations.

## Modeled population hexagons

Kontur Population, United States, 400 m H3 hexagons, release 2023-11-01, from https://geodata-eu-central-1-kontur-public.s3.amazonaws.com/kontur_datasets/kontur_population_US_20231101.gpkg.gz, accessed **not recorded** (the supplied access date is the placeholder `[YYYY-MM-DD]`). The compressed file is 294,350,200 bytes with SHA1 `fb51c8cfe18eba25375bb56b765961faafeddb9b`; the layer is `population` in EPSG:3857 with 4,217,518 hexagons nationally. License: CC BY (Kontur, hosted on the Humanitarian Data Exchange). It is a modeled estimate that fuses GHSL, Facebook, Microsoft Buildings, Copernicus land cover, Land Information New Zealand and OpenStreetMap data, not a measured count.

The raw file is not committed; the processed file contains the 7,896 populated hexagons whose centers fall in Lake, Orange, Osceola and Seminole counties, assigned to counties and to 2024 Census tracts by center point. County sums compared with ACS 2020-2024 county totals: Lake -0.3%, Orange -2.2%, Osceola -5.0%, Seminole -1.3%.

`python3 analysis/prepare_kontur.py` publishes the supplied `data/processed/kontur_h3_four_counties.geojson` to `public/data/`. The supplied join has duplicate `tract_pop_acs_x` and `tract_pop_acs_y` fields: publication verifies equality and renames to `tract_pop_acs`. Geometry and values are unchanged; no download, coordinate quantization, resampling or extra cells. The public file is loaded only when the hexagon source is active and cached in memory after validation.

Population initially opens in 3D with Hexagons (Kontur, modeled). The source switch retains the Census tract rendering and inspector. Hexagon centers use the unchanged mean of exterior-ring vertices, excluding the closing duplicate. No source values, H3 IDs, geometry or inspection fields change; units remain modeled people per hexagon, not density. Inspector ACS values are totals for the entire associated tract.

Population contrast is a **display setting**, defined in `src/map/populationDisplay.ts`. Quantiles use linear interpolation at `(n − 1) × percentile` on a sorted copy of the supplied values. Emphasis 0–100 moves the floor from the 40th to 80th percentile and gamma from 1.6 to 4; default 50 uses the 60th percentile (176 people in the supplied data) and gamma 2.8. The ceiling is fixed at the 95th percentile (1,447 people). Below-floor positive values map to `0.002 × population / max(1, floor)`; zero maps to zero. Above the floor, `x = clamp((population − floor) / (ceiling − floor), 0, 1)`, then `t = 0.002 + 0.998 × transform(x)^gamma`. Transform is linear, square root (default), or `ln(1 + 9x) / ln(10)`. Equal floor/ceiling and empty inputs are guarded. The same `t` drives height, color and opacity; values at or above the ceiling share `t = 1`, while inspection always shows the original values. No derived field is written to the dataset.

The 3D renderer shares Employment's tapered, tip-fading ColumnLayer shader, with a 0.8-pixel base radius at width 0.35. Symbolic width remains adjustable. Display height = `max(8, 4,000 × t) × exaggeration` for positive values; zero remains flat. Exaggeration defaults to 1×, range 0.5×–5×. These are not building heights. In 2D, soft circle radius is `(0.5 + 8 × t^0.65) × clamp(1 + (zoom − 10) × 0.1, 0.65, 1.35)` pixels. Circle area is no longer proportional to raw population. The sequential very-dark-teal → neon cyan-green ramp uses `t` directly; alpha is `2 + (maximum alpha − 2) × t^1.2`, maximum 235 for needles (layer opacity 0.85) and 185 for circles. Only values in the upper 10% receive an unpickable halo, with alpha `32 × t²`. The halo uses the shared needle shader in 3D and soft circles in 2D. Source-over blending bounds repeated overlaps at the palette colors rather than adding RGB to white. Basemap labels draw above both views, and Population and Employment may remain enabled together.

## Employment

Census LEHD Origin-Destination Employment Statistics (LODES) version 8.4, year 2023, Florida workplace area characteristics (WAC), all jobs and all job types (`fl_wac_S000_JT00_2023.csv.gz`), from https://lehd.ces.census.gov/data/lodes/LODES8/fl/wac/fl_wac_S000_JT00_2023.csv.gz with SHA1 `efb0853a9cd0111699428e740b4d67cf7c6ff3a6`, and the Florida geographic crosswalk `fl_xwalk.csv.gz` from https://lehd.ces.census.gov/data/lodes/LODES8/fl/fl_xwalk.csv.gz with SHA1 `16e4010126b8bb414e685a82c068c1fdd4e9b540`. Accessed 2026-10-15. The 2024 file returned a 404 on the access date, so 2023 is the latest available. The raw files are not committed.

Method: 2020 census blocks, aggregated to 2024 tracts using the first 11 characters of the 15-character block ID, filtered to Lake, Orange, Osceola and Seminole counties by characters 3 to 5.

Limitations: jobs are counted at the employer’s location, jobs are not workers or visitors, privacy noise is added to protect confidentiality, and not all employment is covered.

`/usr/bin/python3 analysis/prepare_employment.py` reads the supplied `data/processed/lodes_wac_tracts_2023.csv` with string GEOIDs and joins it to the 2024 polygons in `public/data/population_tracts.geojson`. It reports unmatched identifiers and fails on missing matches or duplicate/invalid IDs. It publishes `public/data/employment_tracts.geojson` with NAMELSAD as name, the supplied jobs counts/density and all 20 CNS sectors, plus a `point` longitude/latitude pair computed with OGR PointOnSurface and checked to be inside the actual polygon. Geometry is unchanged. Blank density remains null (the zero-jobs tract has zero land area). Tests verify 490 tracts, 11-character string GEOIDs, 1,482,556 jobs, sector totals, inside points and the sole zero-jobs tract `12095990000`.

Employment opens in 3D and can remain enabled alongside Population. Transit remains independent and last in drawing order. The existing tract 3D source uses tapered, lit columns at representative points, 2.8-pixel base radii and additive base glows. Height = 4,000 display metres × exaggeration × transformed measure / transformed maximum. Defaults: total jobs, square root, 3× exaggeration. Linear and ln(1 + value), jobs/km² and 0.5×–6× exaggeration are selectable. A shared indigo/violet/magenta/pink/near-white ramp uses the square root of the normalized value. Zero-job tracts have no column but remain inspectable. In 2D, circles have area proportional to total jobs, with pixel radii scaled by zoom and additive blending; faint tract fill uses jobs/km². Display height is not building height. Inspector sector ranking follows CNS01–CNS20, with ties kept in that order.

## Equity

American Community Survey 5-year estimates 2020-2024 at the census tract level, tables B19013 (median household income), B08201 (household size by vehicles available, no-vehicle households), B17001 (poverty status) and B08301 (means of transportation to work), retrieved through the Census Data API at [https://api.census.gov/data/2024/acs/acs5](https://api.census.gov/data/2024/acs/acs5), accessed 2026-10-15, for Lake, Orange, Osceola and Seminole counties.

Method: shares are 100 times numerator divided by denominator, set to missing where the denominator is zero or the Census returned a negative not-available code; median income is capped by the Census at 250,001; small_base means fewer than 100 households, which is a project assumption and not a Census rule.

Limitations: the shares are estimates with margins of error that are large for small tracts, a tract is an averaged unit, and the commute-to-work transit share is sparse and noisy and reflects existing service, so it is not used as an equity measure.

### Kontur 3D display refinement

Only the 3D Kontur view uses thin six-sided ColumnLayer pillars. Centers come from the supplied polygon vertices; a common radius is 99% of the smallest inscribed radius across the supplied hexagons, so every pillar fits inside its hexagon even at maximum width. The `coverage` multiplier defaults to 0.35 and is adjustable from 0.1 to 1. Widths are not to scale and do not encode population or land area. No source geometry or data is modified.

The default height transform is now linear with 3× exaggeration: `2,000 m × 3 × population / maximum`. The supplied maximum of 6,000 people displays at 6,000 m, while the median of 85 people displays at 85 m. Square root and ln(1 + population), plus the existing exaggeration range, remain available. These are display heights, not building heights.

3D colors interpolate from dim blue-gray (alpha 45/255) to teal (155/255) below the 95th percentile; only values at or above that threshold use orange to yellow (215/255 to 245/255). The threshold uses linear interpolation at `(n-1) × 0.95`, with tied values kept together, so approximately the upper 5% receive warm colors. Soft ambient and directional lighting separates pillar faces. The 2D ramp and full polygon footprints, tract rendering and inspector are unchanged.

MapLibre 5 and deck.gl 9 support interleaved WebGL2 rendering. The shared overlay now uses this mode: 3D Kontur pillars (and Equity beneath them when enabled) are inserted before the first basemap symbol layer. City and street labels remain visible in the 3D Kontur view. Other demand views keep their existing ordering; transit remains last with depth comparison always. No fallback opacity slider is needed with this supported setup.

### Employment block needles

`data/processed/lodes_wac_blocks_2023.csv` is the supplied file from branch
`data/employment-blocks`. `/usr/bin/python3 analysis/prepare_employment_blocks.py`
publishes `public/data/employment_blocks.geojson` offline. `csv.DictReader` reads
all IDs as strings; only jobs/sector counts and coordinates are converted.
All 15,574 supplied blocks, 1,482,556 jobs, 20 CNS sectors, county names and tract
IDs are preserved. Two supplied tract IDs differ from the first 11 characters of
the block ID; the supplied mapping is preserved rather than recomputed.
Points use the supplied `lon`/`lat`, originating in the LODES crosswalk internal
point (`blklondd`, `blklatdd`). This point is guaranteed to be inside its block
but is **not a centroid**. The publisher validates finite coordinates against the
four-county bounding box from the committed county geometry, unique 15-character
block IDs, 11-character tract IDs, county FIPS and sector totals. It sorts by
block ID and writes deterministic UTF-8 GeoJSON. `analysis/test_employment_blocks.py`
asserts the exact count and jobs sum, string IDs, bounds and byte reproducibility.
No datasets are downloaded or synthesized; the tract data and 2D renderer are unchanged.

The 3D source defaults to **Blocks (LODES, finest)**; **Tracts (existing)** retains
the previous renderer. Blocks are symbolic 1.2-pixel-radius tapered needles with
additive blending, an unlit bright base and alpha fading to zero at the tip.
They render below the first basemap symbol layer when available; transit stays
above demand layers. Opacity defaults to 65% and is adjustable. Colors preserve
the indigo → violet → magenta → hot pink → near-white ramp using original job counts.
Height uses square root (default), linear or ln(1 + jobs), with 3× exaggeration
(default, range 0.5–6×). Height is `max(60 × exaggeration,
4000 × exaggeration × transform(min(jobs, limit)) / transform(limit))` display
metres. The minimum is a visibility floor, not an employment estimate or building height.

Clipping defaults on. Its limit is the 99th percentile of **all block counts**,
using linear interpolation at index `(n − 1) × 0.99` (type 7); off uses the actual
maximum. The legend reports the number strictly above the cap, cap, actual maximum
and maximum displayed value. For the supplied file this clips 156 needles at 1,511.54 jobs; the actual maximum is 84,289 jobs. Only displayed height is capped; colors and inspection
retain original values. Hover/click inspection and keyboard block-ID lookup show
block ID, supplied tract ID, county, jobs and the three largest CNS sectors (ties
in CNS order). Attribution: “Census LODES 8.4 (2023), jobs by workplace location;
block-level values include privacy noise”.

## Bus baseline (LYNX)

LYNX (Central Florida Regional Transportation Authority) GTFS feed. Producer URL:
http://gtfsrt.golynx.com/gtfsrt/google_transit.zip. Mobility Database listing:
mdb-347. Accessed **2026-10-16**. SHA1:
`951d151b999633151eba05207b7ca245e6f9f21c`. Feed validity:
**2026-10-02 to 2026-12-12**. Raw file:
`data/raw/lynx_gtfs_2026-10-16.zip`. License: **not specified in the Mobility Database listing**.

Method (all project assumptions): representative weekday is Wednesday
2026-10-14 (the nearest Wednesday without a holiday exception); peak windows are
7 to 9 am and 4 to 6 pm; headway is the 240 peak minutes divided by departures on
a stop’s best single route and direction; frequent thresholds are 15, 20 and 30
minutes. Most stop times in the feed are blank for non-timepoint stops, so
134,182 of 149,746 stop times were linearly interpolated by stop order between
scheduled timepoints, and about 90 percent of peak departures are interpolated.
The three LYMMO routes (60, 61 and 62) are excluded from the main measure and kept
as a separate version. Stops were clipped to Lake, Orange, Osceola and Seminole
counties using the 2025 county boundaries.

Limitations: this is scheduled frequency, not observed reliability; frequency on
one route does not mean the route goes where people need to travel; and
intermediate stop times are estimates.

`/usr/bin/python3 analysis/prepare_lynx.py` verifies the supplied ZIP checksum,
reads `data/processed/lynx_stops_peak_headway.geojson`, preserves the requested
properties (including null headways and string stop IDs), rounds point coordinates
to five decimals and writes `public/data/lynx_stops.geojson` in stop-ID order.
It prints county and mutually exclusive frequency-tier counts; it does not
recompute the supplied schedules or download data. `analysis/test_lynx.py` checks
fidelity, unique string IDs, county/bounds membership, non-LYMMO flag nesting and
exact threshold equivalence, no-service nulls, and byte reproducibility without
hard-coding stop counts.

The independent Bus baseline toggle sits in Existing transit. The display defaults
to ≤30 minutes, excludes LYMMO and hides infrequent stops. Thresholds select the
frequent set; showing infrequent stops adds all other served stops as small dim
blue-gray dots. No-peak-service stops remain hidden. The legend reports displayed
counts with mutually exclusive ≤15, >15–20, >20–30 tiers and the selected-threshold
infrequent tier. Opacity is adjustable. Demand layers draw below bus stops, rail
above them, and demand/bus stay below basemap label layers when available. Bus
toggling does not alter pitch. The inspector labels the supplied original
best-route names and all-route departure count separately from the selected
non-LYMMO headway/departure measure; separate non-LYMMO route names are not supplied.

## LODES home–work flows for rail analysis (2023)

`analysis/rail/od.py` downloads Florida LODES8 main OD JT00 for 2023 and the
2025 TIGER/Line Florida 2020 tabulation blocks into gitignored `data/raw/`:

- https://lehd.ces.census.gov/data/lodes/LODES8/fl/od/fl_od_main_JT00_2023.csv.gz
- https://www2.census.gov/geo/tiger/TIGER2025/TABBLOCK20/tl_2025_12_tabblock20.zip

Both home and work must be in Lake, Orange, Osceola or Seminole. String block IDs
join to `GEOID20`; the pure-Python `dbfread` reader reads only the ZIP's DBF
attribute table (`GEOID20`, `COUNTYFP20`, `INTPTLAT20`, `INTPTLON20`), without GDAL; `INTPTLAT20`/`INTPTLON20` internal points (not centroids) assign
blocks to H3 resolution 8. The script sums `S000`, `SE01`, `SE02`, `SE03` into
home–work cell pairs, reconciles each column against unmatched-row losses, and
compares every pair and count with the owner's reference before writing
`data/processed/lodes_od_hex8_2023.csv.gz`. The actual committed reference is the
uncompressed `data/processed/lodes_od_hex8_2023.csv`; it remains unchanged.

See the [output contract](../data/LODES_OD_HEX8_CONTRACT.md) for field meanings,
installation, reconciliation and reference-protection behavior. The successful
Windows source download/run date is 2026-10-30 (UTC); the original notebook's
download date was not supplied. The successful Windows verification supersedes the earlier sandbox proxy
failures as the pipeline's verification status.

### Verified end-to-end run

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

Counts are jobs, not people or trips. Only workers living **and** working in the
four counties are retained, about 69% of jobs located there in the supplied
Florida main OD file. Interstate auxiliary flows are excluded. Confidentiality
noise affects small flows; multi-site employers may be assigned to one location
(the top reference work hexagon has 61,428 jobs near Walt Disney World).
Tract-level data does not vary within a tract; any later tract-to-hexagon join
must preserve that limitation. No tract attributes or demand metrics are added
by this pipeline. Tiny synthetic fixture tests cover filtering, H3 placement,
integer reconciliation, unmatched endpoints, content comparison and write safety.

## Transit coverage screen for rail analysis

`analysis/rail/coverage.py` reads the unchanged authoritative OD CSV and the three
processed stop/station layers documented above. It converts Points to H3 r8 and
unions each stop cell's `grid_disk` with **K=1 (assumption; catchment citation TBD)**.
Four scenarios separately classify every directed flow as both ends covered,
home only, work only, or neither: any stop, frequent service, rail only, and any
stop excluding Brightline. All four job-count columns reconcile exactly.

LYNX frequency uses `headway_best_route_min` in **minutes**, the best single-route
peak headway **including LYMMO**, rather than combined service across routes.
The **≤15-minute threshold is an assumption**. There are 207 qualifying stops;
43 null-headway stops are excluded from frequent service but included in the
any-stop screen. Neither SunRail nor Brightline has a frequency field, so both
are explicitly excluded from the frequent scenario; no frequency is invented.

Outputs: `data/processed/transit_coverage_summary.json` (group counts and shares,
input SHA-256 hashes, parameters and inspected schemas) and
`data/processed/transit_coverage_hex8.csv` (covered cells per scenario).
Both-end proximity covers 398,770 jobs (39.6357%) for any stop, 20,235 (2.0113%)
for frequent LYNX, 6,610 (0.6570%) for rail only, and 398,742 (39.6329%) for any
stop without Brightline. These are **stop-proximity screens, not findings of
usable transit service or possible trips**. Rail frequency, timetable/route
connectivity, walking-network access and current operations are not verified.

H3 computes an r8 global-average edge of 531.41401 m and regular-hex K=1
center-reach estimate of 920.43607 m. Actual neighboring-center distances around
the supplied stop cells range from 841.34581 to 914.69422 m. Whole-cell coverage
is not a walking-distance bound and is not labeled a half-mile catchment. See
[TRANSIT_COVERAGE_CONTRACT.md](../data/TRANSIT_COVERAGE_CONTRACT.md) for all fields,
complete scenario results, schema inspection, assumptions, Windows commands,
limitations and source dates. The existing stop layers and frontend are unchanged.

### Coverage K/headway sensitivity grid

`analysis/rail/coverage_sensitivity.py` adds eight combinations for K=0/1:
any transit and rail only at each K, plus frequent LYNX at ≤15/≤30 minutes.
The new 30-minute threshold and the two K values are **sensitivity assumptions**;
catchment citation remains **TBD**. The field remains `headway_best_route_min`
in **minutes**, including LYMMO. There are 207 qualifying stops at 15 minutes
and 2,145 at 30, with 43 null values, 0 missing keys and 0 zero values. Nulls are
excluded from frequent service; missing keys or zero/invalid values fail the
unchanged original validation. Rail remains excluded from frequent service
because its station layers contain no frequency field.

New small outputs are `data/processed/transit_coverage_sensitivity.csv` and
`.json`. They do not replace the PR #34 summary or covered-cell CSV. Every row
reconciles all four job/earnings totals, and the original K=1 results are checked
exactly against the preserved baseline, including all group counts and shares.
Both-covered jobs at K=0 are 179,677 (any), 5,813 (15-minute LYNX), 96,434
(30-minute LYNX), and 418 (rail). At K=1 they are 398,770, 20,235, 265,698,
and 6,610 respectively. See the [complete grid and contract](../data/TRANSIT_COVERAGE_CONTRACT.md#kheadway-sensitivity-grid-pr-34-baseline-preserved).

Using the existing Church Street station as a downtown diagnostic anchor, H3
computes mean local edge 509.91824 m, cell area 673,352.94932 m², and adjacent
center distances 843.34566–912.55233 m. K=0 covers one whole cell, not zero walking
distance; K=1 adds neighbors and is not a half-mile walking catchment. These
geometric results do not establish usable transit connections or routed walks.
The OD reference, stop inputs, original results and frontend remain unchanged.
