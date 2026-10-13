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

The approximate named coordinates in `src/config/mapViews.ts` configure the default camera only; they are not analytical observations. Population is a live, optional frontend layer. Employment, income, and transit remain planned. No ridership estimates, infrastructure costs, or optimization results are supplied.

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
