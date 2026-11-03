# Baseline travel times: planned output contract

**Status: script added; full run not completed.** No full-run routing results
are available. The script was not run or imported in this sandbox. The owner
reports testing it in Google Colab (Linux, Python 3.13) with
`openjdk-21-jdk-headless`. Test observations below are supplied context, not
full-run findings or independently reproduced results.

## File and row meaning

Planned output: `data/processed/baseline_travel_times.csv.gz`, a gzip-compressed
CSV with one row for each home–work pair in the authoritative, uncompressed
`data/processed/lodes_od_hex8_2023.csv`. The complete output must contain exactly
**591,177 pairs** and **1,006,088 jobs**. These are required input reconciliation
totals, not results of a completed routing run.

| Column | Meaning | Type / units |
| --- | --- | --- |
| `h_hex` | Home H3 resolution-8 cell | String |
| `w_hex` | Work H3 resolution-8 cell | String |
| `S000` | Jobs for this pair, preserved from the LODES flows file | Integer jobs, not people |
| `transit_min` | Existing-transit travel time between hexagon centers | Float minutes; blank allowed |
| `car_min` | Driving reference time between hexagon centers | Float minutes; blank allowed |

A blank `transit_min` means no transit trip returned within the 120-minute
limit, or an endpoint could not be placed (snapped) on the street network.
A blank `car_min` means no drive returned within `CAR_MAX_TIME` (60 minutes),
or the same snapping failure. **A blank alone does not establish that no route
exists** and must not automatically be classified as no transit baseline.
Transit times slightly above 120 minutes can appear because of walking legs.

Same-hexagon home–work pairs get near-zero times. Their treatment in the model
is **TBD**; these must not silently stand in for actual door-to-door journeys.

## Script and environment

Entry point: [`analysis/rail/baseline_times.py`](../analysis/rail/baseline_times.py).
The supplied script is preserved unchanged. Install routing dependencies from
`analysis/rail/requirements-routing.txt` in a separate routing environment;
all versions are unpinned and **pins are TBD**. Java 21 or newer is required for
r5py. Routing dependencies are not added to `analysis/rail/requirements.txt`,
imported by new tests, or executed by CI. The existing Windows OD setup remains
separate from this Colab/Java routing environment.

The delivered script defaults to `SAMPLE_ORIGINS = 20`, `SAMPLE_SEED = 1`,
`CHUNK = 50` origins and `RESTRICT_DESTINATIONS = True`. It routes only to work
hexagons needed by each batch. For a future full run, the operator must set
`SAMPLE_ORIGINS = None`; no such change or run was made here. Sample mode does
not write the planned final output. Full mode asserts that the output row and
job totals equal the loaded flows totals before writing the final CSV. It does
not hard-code the expected totals above or separately assert unique pair IDs;
the full-run review must check exact pair membership against the reference.

The script tries `lodes_od_hex8_2023.csv.gz` before `.csv` if both exist. The
uncompressed `.csv` remains authoritative: before a future run, ensure any
compressed alternative contains exactly the same reference flows. This task
does not create, rename, recompress or modify either input.

Batches and `run_config.json` are saved in
`data/processed/baseline_chunks_test/` for samples and
`data/processed/baseline_chunks/` for a full run. Existing batch files are skipped
on resume, and recorded setting differences cause an exit. The saved config is
not a complete provenance manifest: it does not hash source files or record all
library defaults. Resume only with unchanged inputs, environment and settings;
archive incompatible progress separately before starting a new run. Chunk and
sample outputs are ignored by Git and are not committed.

## Routing settings (assumptions)

- Departure: **Wednesday 2026-11-04 at 08:00, America/New_York**, within the
  supplied service-date ranges. The script passes a naive local `datetime`;
  confirm the feed/network timezone in the routing environment, rather than
  treating it as UTC.
- Transit limit: **120 minutes** (`MAX_TIME`).
- Driving cap: **60 minutes** (`CAR_MAX_TIME`, passed as `max_time_driving`);
  the common routing call also passes the 120-minute `max_time`.
- r5py default **10-minute departure window** and **median travel time**. The
  script leaves these at library defaults; confirm them when pins are chosen.
- Origins and destinations: H3 resolution-8 **hexagon centers**, snapped to the
  street network, approximating door-to-door travel.
- r5py is used for both existing transit and driving. Driving is free-flow,
  with no congestion.

## Input provenance

The supplied routing file names and provenance dates are recorded below.
URLs and existing historical feed hashes are documented in
[`docs/DATA_SOURCES.md`](../docs/DATA_SOURCES.md#baseline-routing-inputs).
Hashes for the routing aliases and OSM files remain **TBD** until those exact
files are checked; historical archive hashes are not verification of an alias.

| Input expected by script | Snapshot / service validity |
| --- | --- |
| `data/raw/gtfs/lynx.zip` | File dated 2026-10-16; valid 2026-10-02 to 2026-12-12 |
| `data/raw/gtfs/sunrail.zip` | File dated 2026-10-13; valid 2025-12-01 to 2026-12-31 |
| `data/raw/gtfs/brightline.zip` | File dated 2026-10-13; valid 2026-10-12 to 2027-08-09 |
| `data/raw/osm/orlando-region.osm.pbf` | OpenStreetMap Florida extract from Geofabrik; data timestamp 2026-11-01; clipped with osmium |
| `data/processed/lodes_od_hex8_2023.csv` | Authoritative 2023 LODES OD reference; see [OD contract](LODES_OD_HEX8_CONTRACT.md) |

The osmium clip box is **-82.1577,27.4431,-80.6732,29.4605**
(west, south, east, north), the hexagon extent plus **0.2 degrees**.
The original Florida-extract filename, source URL, download date and hashes
are **TBD**; the data timestamp is not a claimed download date.
No source files were downloaded or inspected for this change. The script's
calendar check uses `calendar.txt` range endpoints; it is not a full service
exception or timezone audit.

## Limitations and pending decisions

- Driving times are free-flow without congestion, understating driving time
  and making rail look worse in comparisons.
- Schedules are a fall-2026 snapshot; the LYNX feed ends **2026-12-12**.
- Only one departure setting is represented, with the default departure window;
  this is not an all-day, weekend or seasonal analysis.
- Brightline's feed includes an **“Event Train”** agency that has not been
  separated out. Brightline is intercity service.
- Some centers could not be snapped to the street network: the owner reports
  **about 0.9% of jobs in a 100-origin test**. This is a test limitation only;
  the full-run share has **not** been measured and must not be extrapolated.
- Center-to-center travel approximates door-to-door travel, not exact household
  or workplace access. The same-hexagon rule is **TBD**.
- Routing outside the clipped box is impossible, including useful detours.
- Walking legs can produce a transit time slightly above 120 minutes.
- Blank times conflate search limits and snapping failures; they alone cannot
  support a claim of no route. LODES weights count jobs, not unique people.

The full run, reconciliation, output validation, dependency pins and
same-hexagon modeling rule remain pending. No full-run result statistics are
reported here.
