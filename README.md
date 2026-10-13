# ORBIT — Orlando Rail Investment Explorer

A UCF COP4283 geographic research project exploring future rail investment in Greater Orlando. Milestone 01 establishes the interactive frontend; it does not produce investment recommendations.

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

Full-screen MapLibre dark basemap centered on Greater Orlando, navigation and recenter controls, collapsible responsive sidebar, accessible disabled placeholders for population, employment, income, and transit. An empty deck.gl overlay provides the integration boundary for future layers. No mock observations, demographic statistics, rail optimization, or Gaussian splatting are included.

The visual direction follows the supplied description of Common Ground: restrained typography, a dark geographic canvas, subtle cyan accents, and a compact research interface. The reference page was not accessible from the development environment.

## Architecture

- `src/components/`: interface components.
- `src/map/`: MapLibre lifecycle and deck.gl overlay ownership.
- `src/data/`: layer metadata, later data adapters.
- `analysis/`: future Python/Pandas/GeoPandas pipelines.
- `data/`: geographic data contracts and provenance guidance.

The basemap requires WebGL and external network access to CARTO (`basemaps.cartocdn.com`, `*.basemaps.cartocdn.com`) and resources referenced by its style. Map attribution is supplied by the provider (CARTO/OpenStreetMap). Optional Google Fonts use `fonts.googleapis.com` and `fonts.gstatic.com`; system fonts provide a fallback. Basemap labels are not project analytical datasets. Network/WebGL failures show an explicit message. No API key or backend is required.

## Next milestone

Document and acquire authoritative regional datasets, validate licenses/coverage/CRS and field meanings, then build reproducible Python ingestion and GeoJSON exports. Wire one validated layer end-to-end with attribution and legend before adding further layers, analytical charts, or optimization. Document model assumptions and data needs first. Linear regression is prohibited.

## Browser smoke checks

With the dev server running, run `npx playwright install chromium` once, then `npm run test:smoke`. To use an installed Chromium instead, run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:smoke`.

The smoke check explicitly substitutes an empty test-only map style to verify WebGL/deck.gl initialization, disabled layer controls, sidebar collapse and keyboard expansion, navigation buttons, mobile overflow, and resource-failure messaging. It does **not** validate live geographic tiles. No fixture data appears in the application.

Current environment validation: TypeScript, production build, and browser smoke checks passed. Live CARTO requests returned a network-policy 403; external basemap rendering remains to be verified after the saved environment network additions are applied. Vite reports a large mapping-library bundle; future performance work should measure and split it as needed.

## Four-county Census boundaries

Source: [U.S. Census Bureau 2025 cartographic county boundaries, 1:500,000](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip). Vintage: **2025**. Original download date: **October 12, 2026 at 11:11 PM America/New_York**, supplied by the repository owner. The raw ZIP is supplied on `data/county-boundaries`; the pipeline never downloads data.

Run `/usr/bin/python3 analysis/prepare_counties.py` from the repository (Python with GDAL/OGR bindings required; the cloud image already provides them). It filters GEOID 12069 (Lake), 12095 (Orange), 12097 (Osceola), and 12117 (Seminole), reprojects to NAD83 / UTM zone 17N, simplifies at 75 metres while preserving each geometry's topology, validates geometries, and exports WGS84 GeoJSON plus source metadata and a SHA-256 of the input ZIP to `public/data`. This cartographic product is for regional visualization, not surveying.

Map bounds are computed from the exported coordinates. The initial fit and minimum zoom adapt to viewport size and sidebar width; the fitted extent plus 12% padding sets pan limits. Resize and recenter recalculate these limits. Mobile starts with the sidebar collapsed. Rotation/pitch are disabled to keep the constrained regional view predictable.
