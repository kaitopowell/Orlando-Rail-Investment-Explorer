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

With the dev server running, run `npx playwright install chromium` once, then `npm run test:smoke`, `npm run test:candidates`, `npm run test:flows`, and `npm run test:rail-plan`. To use an installed Chromium instead, run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:smoke`.

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

Kontur Population uses a display-only emphasis curve to reveal hotspots. The
emphasis slider ranges from a 40th- to an 80th-percentile floor and power 1.6–4;
default 50% uses the 60th-percentile floor and power 2.8. The ceiling is the
95th percentile. Values below the floor map to at most 0.002; values above the
ceiling map to 1. The selected linear, square-root or normalized-log transform
is applied before the power curve. Height, color and opacity share that result.
This changes the display, never the modeled population values.

In 3D, tapered needles share Employment's tip-fading shader, with 0.8-pixel
base radii at width 0.35. Height is 4,000 display metres × exaggeration × display
value, with an 8 m × exaggeration floor for positive values; default exaggeration
is 1×. In 2D, small soft circles use the same display value for radius and color.
Only the top 10% receive a faint halo. A very-dark-teal → neon cyan-green ramp
and bounded alpha blending prevent Population overlaps from clipping to white.
Basemap labels stay above the data. Controls and inspectors remain usable with
Employment enabled. All 7,896 source hexagons remain inspectable, including faint
low values; the H3 IDs, centers and data are unchanged. These are modeled estimates,
not measured counts. The ACS tract rendering remains unchanged.

### Illustrative train motion

Turn on **Rail · SunRail / Brightline** under Existing transit to reveal the
optional **Train motion** toggle and **Pause / Play** button. Motion starts off,
including when `prefers-reduced-motion` is set. Use Space to toggle the checkbox
and Space or Enter on the pause/play button. Enabling reduced motion while it
runs switches motion off; explicit opt-in remains available. Hiding rail or
turning motion off removes the animated layer; the underlying lines, stations
and inspectors retain their existing behavior.

**Illustrative train motion. Not real schedules.** Three short, translucent cyan
trails per line path run in a simple one-way loop, restarting at the beginning.
Their fixed decorative speed and spacing do not represent frequency, ridership,
schedules or analysis. Settings are named in `src/map/trainMotion.ts`.
Timestamps are precomputed from distances along the existing GeoJSON paths;
no new data files are created. Motion sits above the rail lines and below
station markers, labels and county outlines. Pause preserves position, hidden
tabs do not advance the clock, and unmount cancels animation and clears layers.

### Candidate connections

Under **Model candidates**, enable **Candidate connections** (off by default).
Amber circles are sized by the square root of workplace jobs, bounded to 3–11
pixels; faint pale arcs have uniform width and do not encode importance. These
static layers sit below labels, work in flat or pitched views, and can coexist
with Population and Employment. Hover highlights; click a center or arc to open
its sidebar inspection. The **Inspect candidate center** and **Inspect candidate
connection** selectors offer the same information by keyboard, including each
center’s neighbors and connected group. No animation or hover transitions run.

Expand **Assumptions and sources** for the summary-derived parameters and source
links. Counts and shares come from the supplied summary; disconnected groups are
computed from the loaded connections. Population is a modeled estimate, not a
measured count. These candidates are built independently of existing plans.
Straight lines are not routes, ignore water and terrain, and imply no costs,
speeds or ridership. The flagged Disney-area cell is preserved; the sidebar
separately identifies the actual largest WAC cell from the summary rather than
confusing it with the OD hotspot. Employer location assignment is a possibility
to check, not a finding.

The two candidate GeoJSON files and `candidate_connections_summary.json` in
`public/data/` are byte-identical copies of PR #42’s processed outputs; no analysis
is rerun. All three files are validated together. Missing or inconsistent files
produce a visible sidebar error and Retry button, with no partial candidate
layer. `npm run test:candidates` checks delivery, validation, graph topology,
keyboard/pointer inspection, failures, cleanup and demand-layer coexistence on
phone and laptop. Browser tests use a controlled basemap fixture; this does not
verify live basemap availability.

### Place names and top commute flows

**Place names are editorial labels** supplied by the author in
`data/center_labels.csv`. Names lead candidate selectors and panels; IDs remain
secondary. Missing names display **Unnamed center**, with a sidebar report.
Missing or invalid label files show an error and Retry without discarding valid
map geometry. Notes/confidence are editorial metadata, not analytical findings.

Enable **Top commute flows** under **Commute demand** independently of
**Candidate connections**. Choose 5, 10 or 20 combined bidirectional pairs.
Coral arc widths scale with √jobs; these are commute summaries, not routes or
rail proposals. Intra-center jobs are reported but not drawn. Ordered-list ranks
include intra-center pairs, so some numbers are skipped. Click a line or press
Enter/Space on its ranked-list button to inspect both directions and a computed
“Why it stands out” explanation. Expand the assignment-radius section to compare
3/5/8 km coverage. Population, Employment and candidates can remain enabled in
flat or pitched views; existing narrow-screen demand panels still occupy map space.

Combined mean times use **usable-job counts for each mode**, not all jobs or an
unweighted average of directions. Driving is free-flow, without congestion;
“today” means the stored baseline snapshot, not live service. A blank time alone
does not establish no route. Small flows carry Census privacy noise, and results
depend on assignment radius. Jobs are not unique people or predicted riders.
Access distance is not charged as time. The Disney caveat is based on center
membership, and direct candidate linkage is looked up in the existing edges.

Place labels are limited to top-flow endpoints and centers with at least 20,000
workplace jobs, with zoom gates and screen-space collision handling that gives
basemap symbols priority. Some map names are hidden to avoid clutter; all remain
available in the controls. No animation or hover transitions are added.
`npm run test:flows` (dev server running) validates the adapters and browser
behavior. A modern browser supporting `DecompressionStream('gzip')` is required.
See [the frontend data contract](data/TOP_COMMUTE_FLOWS_CONTRACT.md) for source
schemas, denominators, display constants and limitations.

### Proposed rail network

Enable **Proposed rail network** under **Rail plan**. The default is $10B,
low costs, 20-minute wait/access overhead, and minutes saved. Switch the objective
and assumptions to select a supplied scenario; the two objectives are never added.
The budget slider advances through build-step costs and the six published budgets,
including zero and $30B. Preset buttons preserve exact published budget selection.
Only fully affordable steps are drawn. Build order buttons focus and highlight
that step; links and stations support hover/tap inspection and stations also have
a keyboard selector. Reduced motion disables the camera flight.

Phase colors use six budget bands; link-type colors are an alternative. The legend,
build order and inspectors identify lines without relying only on color. Core
highlighting emphasizes the supplied common $10B minutes-saved links. Normal-alpha
lines have dark casings, white outlined stations, and collision-filtered labels;
anchors are eligible at all zooms and other stations at zoom 11+. In crowded views,
colliding labels may be suppressed; every built station remains in the selector.
Existing basemap styling and other layer controls are unchanged.

**Who does this serve?** reports the supplied 0.8 km and 2 km equity snapshots
separately from commute scores. The data contains snapshots only at $2.5B, $5B,
$10B, $15B, $20B and $30B. Other slider stops reuse a snapshot only if it represents
exactly the same links; otherwise equity is explicitly unavailable, never
interpolated. The all-candidate-centers benchmark is expandable at each radius.
The top-level equity radius list currently omits 2 km, but both per-budget radius
records exist and are used. Scenario IDs use `r2.0`/`r3.0` in the actual files.

All source caveats and equity notes are displayed verbatim. Lines are straight
connections, not surveyed routes; costs omit stations, vehicles and station access.
Model outputs are not measured benefits or an optimal plan. The frontend loads
`public/data/rail_plan.json` and `rail_equity.json` once and does not recompute the
analysis or modify these files. Run `npm run test:rail-plan` with the dev server
running for real-file reference/budget checks and laptop/phone browser controls,
inspection, failures, cleanup and 2D/3D coexistence.
