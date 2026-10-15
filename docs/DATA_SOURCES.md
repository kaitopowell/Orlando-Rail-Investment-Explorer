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

Population initially opens in 3D with Hexagons (Kontur, modeled). The source switch retains access to the unchanged Census tract rendering, legend and inspector, and the camera toggle works for either source. Hexagons are flat in 2D; only supplied polygons are drawn. Height scales are square root (default), linear and ln(1 + population), normalized to the maximum hexagon population. Display height in metres = 2,000 × vertical exaggeration × transformed population / transformed maximum; exaggeration defaults to 1× and ranges from 0.5× to 5×. These display metres are not building heights. A fixed square-root population color ramp runs dark blue → teal → orange → yellow. Units are people per hexagon, not density. Inspector ACS values are totals for the entire associated tract, not values for that hexagon. Transit remains above Population through the shared overlay composition.

## Employment

Census LEHD Origin-Destination Employment Statistics (LODES) version 8.4, year 2023, Florida workplace area characteristics (WAC), all jobs and all job types (`fl_wac_S000_JT00_2023.csv.gz`), from https://lehd.ces.census.gov/data/lodes/LODES8/fl/wac/fl_wac_S000_JT00_2023.csv.gz with SHA1 `efb0853a9cd0111699428e740b4d67cf7c6ff3a6`, and the Florida geographic crosswalk `fl_xwalk.csv.gz` from https://lehd.ces.census.gov/data/lodes/LODES8/fl/fl_xwalk.csv.gz with SHA1 `16e4010126b8bb414e685a82c068c1fdd4e9b540`. Accessed 2026-10-15. The 2024 file returned a 404 on the access date, so 2023 is the latest available. The raw files are not committed.

Method: 2020 census blocks, aggregated to 2024 tracts using the first 11 characters of the 15-character block ID, filtered to Lake, Orange, Osceola and Seminole counties by characters 3 to 5.

Limitations: jobs are counted at the employer’s location, jobs are not workers or visitors, privacy noise is added to protect confidentiality, and not all employment is covered.

`/usr/bin/python3 analysis/prepare_employment.py` reads the supplied `data/processed/lodes_wac_tracts_2023.csv` with string GEOIDs and joins it to the 2024 polygons in `public/data/population_tracts.geojson`. It reports unmatched identifiers and fails on missing matches or duplicate/invalid IDs. It publishes `public/data/employment_tracts.geojson` with NAMELSAD as name, the supplied jobs counts/density and all 20 CNS sectors, plus a `point` longitude/latitude pair computed with OGR PointOnSurface and checked to be inside the actual polygon. Geometry is unchanged. Blank density remains null (the zero-jobs tract has zero land area). Tests verify 490 tracts, 11-character string GEOIDs, 1,482,556 jobs, sector totals, inside points and the sole zero-jobs tract `12095990000`.

Employment opens in 3D and replaces Population as the active demand view; selecting Population replaces Employment. Transit remains independent and last in drawing order. The 3D display uses tapered, lit columns at representative points, 2.8-pixel base radii and additive base glows. Height = 4,000 display metres × exaggeration × transformed measure / transformed maximum. Defaults: total jobs, square root, 3× exaggeration. Linear and ln(1 + value), jobs/km² and 0.5×–6× exaggeration are selectable. A shared indigo/violet/magenta/pink/near-white ramp uses the square root of the normalized value. Zero-job tracts have no column but remain inspectable. In 2D, circles have area proportional to total jobs, with pixel radii scaled by zoom and additive blending; faint tract fill uses jobs/km². Display height is not building height. Inspector sector ranking follows CNS01–CNS20, with ties kept in that order.

## Equity

American Community Survey 5-year estimates 2020-2024 at the census tract level, tables B19013 (median household income), B08201 (household size by vehicles available, no-vehicle households), B17001 (poverty status) and B08301 (means of transportation to work), retrieved through the Census Data API at [https://api.census.gov/data/2024/acs/acs5](https://api.census.gov/data/2024/acs/acs5), accessed 2026-10-15, for Lake, Orange, Osceola and Seminole counties.

Method: shares are 100 times numerator divided by denominator, set to missing where the denominator is zero or the Census returned a negative not-available code; median income is capped by the Census at 250,001; small_base means fewer than 100 households, which is a project assumption and not a Census rule.

Limitations: the shares are estimates with margins of error that are large for small tracts, a tract is an averaged unit, and the commute-to-work transit share is sparse and noisy and reflects existing service, so it is not used as an equity measure.

### Kontur 3D display refinement

Only the 3D Kontur view uses thin six-sided ColumnLayer pillars. Centers come from the supplied polygon vertices; a common radius is 99% of the smallest inscribed radius across the supplied hexagons, so every pillar fits inside its hexagon even at maximum width. The `coverage` multiplier defaults to 0.35 and is adjustable from 0.1 to 1. Widths are not to scale and do not encode population or land area. No source geometry or data is modified.

The default height transform is now linear with 3× exaggeration: `2,000 m × 3 × population / maximum`. The supplied maximum of 6,000 people displays at 6,000 m, while the median of 85 people displays at 85 m. Square root and ln(1 + population), plus the existing exaggeration range, remain available. These are display heights, not building heights.

3D colors interpolate from dim blue-gray (alpha 45/255) to teal (155/255) below the 95th percentile; only values at or above that threshold use orange to yellow (215/255 to 245/255). The threshold uses linear interpolation at `(n-1) × 0.95`, with tied values kept together, so approximately the upper 5% receive warm colors. Soft ambient and directional lighting separates pillar faces. The 2D ramp and full polygon footprints, tract rendering and inspector are unchanged.

MapLibre 5 and deck.gl 9 support interleaved WebGL2 rendering. The shared overlay now uses this mode: 3D Kontur pillars (and Equity beneath them when enabled) are inserted before the first basemap symbol layer. City and street labels remain visible in the 3D Kontur view. Other demand views keep their existing ordering; transit remains last with depth comparison always. No fallback opacity slider is needed with this supported setup.
