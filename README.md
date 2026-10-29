# SOL/R

Seminole · Orange/Osceola · Lake · Rail

A UCF COP4283 geographic research project exploring future rail investment in Greater Orlando. The current milestone adds a constrained four-county map and Census boundary layer; it does not produce investment recommendations.

## Run

Use Node 22.12+ (validated with Node 24) and npm:

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

```sh
npm run check
npm run build
npm run preview -- --host 0.0.0.0
```

## Current milestone

Full-screen MapLibre dark basemap constrained to Orange, Seminole, Lake, and Osceola counties, navigation and regional recenter controls, a default-on toggleable Census county layer, and an optional live Population layer and disabled placeholders for employment, income, and transit. Thin outlines have no visible fill; county names fade out between regional zoom and zoom 11. Hover or tap a county for its name and a subtle outline highlight. A persistent 99%-opaque dark mask hides the basemap and its labels outside the four counties. Turning the county layer off hides only outlines, county labels, and hover; the world mask and camera constraints stay active. The deck.gl Population overlay shows density-scaled columns, faint tract outlines, and click/tap inspection. Its legend documents the square-root height scale; zero-population tracts remain inspectable without a column. The population layer uses the supplied ACS dataset; no mock observations, rail optimization, or Gaussian splatting are included.

The visual direction follows the supplied description of Common Ground: restrained typography, a dark geographic canvas, subtle cyan accents, and a compact research interface. The reference page was not accessible from the development environment.

See [Data sources and provenance](docs/DATA_SOURCES.md) for current geographic sources.

## Architecture

- `src/components/`: interface components.
- `src/map/`: MapLibre lifecycle and deck.gl overlay ownership.
- `src/data/`: layer metadata, later data adapters.
- `analysis/`: future Python/Pandas/GeoPandas pipelines.
- `data/`: geographic data contracts and provenance guidance.

The basemap requires WebGL and external network access to CARTO (`basemaps.cartocdn.com`, `*.basemaps.cartocdn.com`) and resources referenced by its style. Map attribution is supplied by the provider (CARTO/OpenStreetMap). Optional Google Fonts use `fonts.googleapis.com` and `fonts.gstatic.com`; system fonts provide a fallback. Basemap labels are not project analytical datasets. Network/WebGL failures show an explicit message. No API key or backend is required.

## Next milestone

Document and acquire authoritative regional datasets, validate licenses/coverage/CRS and field meanings, then build reproducible Python ingestion and GeoJSON exports. Use the county layer as the geographic reference when adding the first validated demographic or transportation layer, with attribution and a legend, before analytical charts or optimization. Document model assumptions and data needs first. Linear regression is prohibited.

## Browser smoke checks

With the dev server running, run `npx playwright install chromium` once, then `npm run test:smoke`. To use an installed Chromium instead, run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:smoke`.

The smoke check substitutes an empty test-only basemap style but loads the real generated Census geometry. It checks phone (390 px), laptop (1440 px), and ultrawide (2560 px) camera constraints, county toggle, hover, label fading, attribution, disabled analytical controls, sidebar keyboard access, and data/resource failures. It does **not** validate live geographic tiles. No fixture data appears in the application.

Current environment validation: TypeScript, production build, browser smoke checks, and four Python data checks passed. External CARTO tiles are not exercised by the smoke suite. Separately, live-basemap screenshots validated both presets at 390×844, 1440×900, and 2560×1080; capture used the platform proxy through TLS-verified curl resource forwarding. The county pipeline uses only the supplied local ZIP and no network requests. Vite reports a large mapping-library bundle; future performance work should measure and split it as needed.

## Four-county Census boundaries

Source: [U.S. Census Bureau 2025 cartographic county boundaries, 1:500,000](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip). Vintage: **2025**. Original download date: **October 12, 2026 at 11:11 PM America/New_York**, supplied by the repository owner. The raw ZIP is supplied on `data/county-boundaries`; the pipeline never downloads data.

Run `/usr/bin/python3 analysis/prepare_counties.py` from the repository (Python with GDAL/OGR bindings required; the cloud image already provides them). It filters GEOID 12069 (Lake), 12095 (Orange), 12097 (Osceola), and 12117 (Seminole), reprojects to NAD83 / UTM zone 17N, simplifies at 75 metres while preserving each geometry's topology, validates geometries, and exports WGS84 GeoJSON plus source metadata and a SHA-256 of the input ZIP to `public/data`. This cartographic product is for regional visualization, not surveying.

Map bounds are computed from the exported coordinates, with just 1% padding for `maxBounds`. The default Orlando camera fits named approximate anchors for downtown, UCF, MCO, Disney Springs, and International Drive in `src/config/mapViews.ts`; these are camera configuration, not analytical data. The “Orlando” button restores this view. “Four counties” flies to the regional overview at the dynamically calculated minimum zoom, accounting for viewport size and sidebar space. Resize and orientation changes recalculate the minimum. Mobile starts with the sidebar collapsed. Rotation/pitch are disabled.

MapLibre's supported `setTransformConstrain` hook constrains the camera center to the padded county bounds without its normal viewport-filling zoom adjustment. This allows the entire tall county region to fit an ultrawide viewport; extra screen space is darkly masked instead of expanding the explorable world. The minimum zoom remains the `cameraForBounds` result. User exploration is preserved across resize where possible; active preset views are refitted.

The same script unions the simplified counties and subtracts that union from a display-world rectangle to generate `outside-counties.geojson`; it does not draw substitute county boundaries. Labels use interior points derived from each county geometry. Simplification preserves each polygon's topology, but this is a cartographic display product, not a survey or a coverage suitable for geographic analysis.

Run `/usr/bin/python3 analysis/test_counties.py` for four checks: exact FIPS/names, valid geometries and interior labels, mask exclusion of county interiors, and byte-for-byte reproducibility plus input checksum. Pipeline validated with GDAL 3.10.3. Outputs are committed, so frontend development requires no Python setup.

Population validation (dev server running): `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:population`. This verifies scale/centroid calculations and real-data inspection on phone and laptop, including the zero-population tract, toggle cleanup, load failure, and retry.

Equity is an independent layer with ACS 2020–2024 no-vehicle household share,
poverty share and median household income. Its five-class quantile choropleth
stays flat in both camera modes, below Population/Employment and transit.
Use the measure and tract selectors or click/tap a tract; collapse the Equity
legend to make more room on small screens. Gray marks missing values, dimmer
tracts have fewer than 100 households, and brighter colors indicate higher need
(lower income for the income measure). Shares are estimates with sampling error.

Kontur Population uses a display-only emphasis curve. The slider moves the floor
from the 40th to 80th percentile and power from 1.6 to 4; default 50% uses the
60th-percentile floor and power 2.8. Source values and inspection are unchanged.

In 3D the ceiling is the 99.5th percentile, with height proportional to the square
of the stretched value and 3× default exaggeration. Only the upper tail becomes
very tall. Thin 0.65-pixel needles share Employment's additive blending and its
bright-base, transparent-tip taper. A faint 3×-wider pass sits beneath every
spike, with a subtle ground glow for the top 3%. The teal/cyan ramp reaches
cyan-white at the high end. Layer opacity is 0.28, and final fragment alpha is
capped at 0.45 after deck.gl's opacity correction. This caps each spike's light
contribution; additive overlaps can still saturate locally. The default Population
camera pitch is 52°, and map labels remain above the data.

The 2D view retains its 95th-percentile ceiling, small soft circles, bounded
source-over blending and upper-10% halo. Population and Employment can remain
enabled together. All 7,896 source hexagons remain inspectable with their original
H3 IDs, centers and modeled estimates, not measured counts. Display heights and
widths are symbolic, not building heights or land area. The ACS tract renderer
remains available.
