# Baseline travel times: computed output contract

**Status: baseline computed in Google Colab (Linux, Python 3.13), as reported by
the owner.** The committed CSV was independently audited here on 2026-11-04;
**the routing script was not run or imported here**. Reading the output verifies
its contents, not reproduction of the routing computation or its provenance.

## File and schema

File: `data/processed/baseline_travel_times.csv.gz` (gzip CSV).
Verified SHA-256:
`2544ef1fdefae60565d1ca1c0b8ca093292b8b7cb31237f7132594e3a1237c33`.
The file is read-only for this change: no filtering, editing or regeneration.

| Column | Meaning | Type / units |
| --- | --- | --- |
| `h_hex` | Home H3 resolution-8 cell | String |
| `w_hex` | Work H3 resolution-8 cell | String |
| `S000` | Jobs for the pair, from the LODES flows file | Integer jobs, not unique people |
| `transit_min` | Existing-transit travel time | Float minutes; blank when unavailable |
| `car_min` | Driving reference travel time | Float minutes; blank when unavailable |

Verified against `data/processed/lodes_od_hex8_2023.csv`: **591,177 rows**,
**1,006,088 jobs**, **zero duplicate pairs**, **zero missing or extra pairs** and
**zero changed per-pair job counts**. There are **5,202 distinct home cells** and
**4,464 distinct work cells**; all H3 identifiers are valid at resolution 8.
No nonblank time is negative or nonfinite. The supplied full-run script asserts
row and job totals against the input before writing; the independent file audit
also checked exact pair membership and duplicates.

## Measured contents (before model filtering)

| Measure | Pairs | Jobs |
| --- | ---: | ---: |
| Transit time present | 154,991 | 347,462 |
| Car time present | 574,400 | 986,479 |
| Same home/work hexagon | 1,478 | 4,487 |
| No car time | 16,777 | 19,609 |
| Transit time strictly greater than 120 minutes | 435 | 653 |
| Car time strictly greater than 60 minutes | 360 | 379 |
| Transit/car ratio ≤1.5, with both times and car time >0 | 56 | 96 |

Transit-time coverage is **34.53594516583043%** of jobs (**34.5%** rounded to one
decimal). Car-time coverage is **98.05096572069242%** (**98.1%** rounded).
**Discrepancy:** the supplied summary says **98.0%**; its job count is correct,
but conventional one-decimal rounding gives 98.1%. This has not been silently
substituted or used to change the data.

The observed maxima are **179 minutes transit** and **85 minutes car**.
The configured **120-minute transit and 60-minute driving limits are search
limits, not strict output cutoffs**. Analysis must apply its own cutoffs while
preserving this source file.

Among **153,357 pairs** with both times and **positive car time**, the unweighted
per-pair transit/car ratio has inclusive, linearly interpolated quartiles
**4.916666666666667 / 6.111111111111111 / 8.11111111111111**, minimum **1.0** and
maximum **40.0**. These round to the supplied **4.9 / 6.1 / 8.1**. The **1.5**
ratio above is a descriptive check value, **not a model competitiveness threshold**.
There are another **1,486 pairs (4,497 jobs)** with both times but zero car time;
the ratio is undefined for them, so they are excluded from ratio statistics,
not silently assigned a finite ratio. These statistics precede search-limit,
suspected-placement and same-hexagon model rules.

## Blank times and the cell-count discrepancy

A blank time means the router did not return a time. Search limits or failure
to place an endpoint on the street network are possible explanations;
**a blank alone does not mean no route exists**. Causes are not encoded in this
CSV and were not confirmed by rerunning the router.

Build these lists from the **unfiltered CSV**, before applying model time limits.
A returned car time above 60 minutes still counts as present for this diagnostic.

The corrected description is **98 role entries across 86 distinct hexagons**
(**66 as home ends, 32 as work ends, 12 in both lists**):

- **66 home-role cells** have no nonblank car time in any row where they are home.
- **32 work-role cells** have no nonblank car time in any row where they are work.
- The sets overlap by **12 IDs**: **98 role entries across 86 distinct hexagons**.
- **61 distinct cells** have no car time anywhere, in either role. Thus “no car
  time in any pair” is also different from membership in the role-specific sets.

Excluding a row when its home belongs to the 66-cell home set **or** its work
belongs to the 32-cell work set affects **2,815 pairs (3,863 jobs)**, matching the
supplied job total. Excluding either endpoint whenever it belongs to the union
of 86 cells instead affects **3,571 pairs (4,904 jobs)**. These are different
rules with different scopes. The owner selected the **role-specific exclusion
rule**: exclude home ends in
the 66-cell list and work ends in the 32-cell list, affecting **3,863 jobs**.
The broader union rule is not adopted; it is shown only to explain the audit
discrepancy.

These cells are **suspected placement failures, not confirmed unplaced cells**.
Other blank car times are suspected to reflect journeys beyond the search limit,
but that explanation is also unconfirmed. A cell with only long journeys can
also satisfy a no-car-time test. Same-hexagon pairs have near-zero times and
need a model rule (**TBD**); they do not represent exact door-to-door access.

## Routing settings and provenance

The following settings are documented by the supplied script and owner, not
recoverable from the output CSV alone:

- Departure: **Wednesday 2026-11-04 08:00**, intended as **America/New_York** local
  time. The script uses a naive datetime; feed/network timezone is not recorded
  in this output.
- r5py defaults: **10-minute departure window**, **median travel time**. Versions
  are unpinned; confirm defaults when choosing pins.
- H3 resolution-8 centers as origins/destinations, with network snapping.
- Transit `max_time`: **120 minutes**; car `max_time`: **60 minutes**. The supplied
  revised script passes `CAR_MAX_TIME` as `max_time` for driving.
- **50 origins per batch**, implying **105 batches** for the verified 5,202 homes.
  This arithmetic does not independently verify the owner's actual batch logs.
- OpenStreetMap Florida extract from Geofabrik, clipped with **osmium** to
  **-82.1577,27.4431,-80.6732,29.4605** (west, south, east, north).
  **Map data timestamp: TBD** for this completed run; the earlier planned-run
  date is not treated as verified provenance of this output.

| Input expected by script | Supplied snapshot |
| --- | --- |
| `data/raw/gtfs/lynx.zip` | File dated 2026-10-16; previously documented validity 2026-10-02 to 2026-12-12 |
| `data/raw/gtfs/sunrail.zip` | File dated 2026-10-13; previously documented validity 2025-12-01 to 2026-12-31 |
| `data/raw/gtfs/brightline.zip` | File dated 2026-10-13; previously documented validity 2026-10-12 to 2027-08-09 |
| `data/raw/osm/orlando-region.osm.pbf` | Clipped Florida extract; data timestamp, original filename, download date, URL and hashes TBD |

Existing feed URLs and historical archive hashes are retained in
[DATA_SOURCES.md](../docs/DATA_SOURCES.md#baseline-routing-inputs). Hashes for the
actual routing aliases remain TBD; those files were not inspected here.

## Script, dependencies and saved progress

[`analysis/rail/baseline_times.py`](../analysis/rail/baseline_times.py) is the
supplied completed-run script, unchanged except for the permitted header.
It defaults to **`SAMPLE_ORIGINS = None`** (full run). Its Colab-specific
**`DRIVE = /content/drive/MyDrive/sol_r`** must exist; references to “Cell 2” and
“Cell 3” refer to the owner's notebook, not repository setup commands.
It saves chunks/config on Drive under `baseline_chunks/` (or
`baseline_chunks_test/` in sample mode), skips existing chunks, and copies the
completed output to Drive as well as the repository-relative output path.
Do not mistake the Drive path for a portable local path.

`run_config.json` rejects recorded setting changes but is not a complete input
hash or environment manifest. Resume only with unchanged inputs/settings. The
script prefers the compressed OD input if both `.csv.gz` and `.csv` exist;
verify its content matches the authoritative uncompressed flows before any
future rerun. This task does not run or alter either dataset.

Optional dependencies are in `analysis/rail/requirements-routing.txt`: h3,
r5py, geopandas, shapely and pandas, **unpinned; pins TBD**. Java **21+** is
required. The owner reports Google Colab Linux/Python **3.13** with
**`openjdk-21-jdk-headless`**. The CI/Windows OD requirements and CI workflow
are unchanged; no new tests import r5py.

Owner-reported performance: driving roughly **4–5 seconds per origin**, transit
**under 10 seconds per batch**, and **about 6 hours** for the full run on free
Google Colab. The driving cap reduced runtime only slightly. These timings
cannot be verified from the CSV and were not measured here.

## Limitations and model handling

- Free-flow driving omits congestion, making rail look worse in comparisons.
- One departure setting and a fall-2026 schedule snapshot; LYNX ends 2026-12-12.
- Hexagon centers approximate door-to-door access; same-hexagon rule TBD.
- Brightline's “Event Train” agency was not separated out; Brightline is intercity.
- Routing outside the clipped box is impossible, including useful detours.
- Analysis will treat transit >120 minutes as no option and car >60 minutes as
  no usable drive time, without editing the stored values.
- Exclude from time comparisons and report rows whose home is
  in the 66-cell no-car-home set or whose work is in the 32-cell no-car-work set.
  This affects 3,863 jobs and uses 98 role entries across 86 distinct hexagons
  (66 home, 32 work, 12 in both lists). Missingness is not proof of placement
  failure.
- The 1.5 check value is not an adopted competitiveness threshold, and these
  descriptive ratios are not a forecast of ridership or distinct commuters.
