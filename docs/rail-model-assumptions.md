# SOL/R rail model: assumptions and implementation plan

Status: **OD pipeline verified** end to end on 2026-10-30 (UTC), per the owner's Windows Python 3.14.6 run. **Next milestone: baseline transit travel times from existing GTFS** (SunRail, Brightline and LYNX). Optimization assumptions remain DRAFT for review; optimization implementation still requires approval of this document.
Decisions in section 9 were made by the project owner on 2026-10-29; remaining TBDs need cited sources.
Location in repo: `docs/rail-model-assumptions.md`

The README requires optimization data requirements and assumptions to be documented before a model is implemented. This is that document. Anything marked **TBD** must be filled with a cited source before use. Nothing here may be invented.

---

## 1. Question the model answers

Given a fixed budget, which rail links should be built, and in what order, to save the most commute time for the most workers in Orange, Seminole, Lake, and Osceola counties?

The model produces a **ranked build order**, not a prediction of ridership. Linear regression is not used.

Scope: **rail only** (light rail and heavy rail). Bus rapid transit is out of scope.

## 2. Objective (primary score)

Commute-weighted time savings:

```
benefit(network) = sum over home-work pairs (i, j) of:
                   workers(i, j) * max(0, baseline_minutes(i, j) - network_minutes(i, j))
```

- `workers(i, j)`: legacy notation for the LODES **job count** linking home area `i` to work area `j`, not a count of unique people; one person can hold multiple jobs.
- `baseline_minutes`: best existing transit time today (SunRail, Brightline, LYNX).
- `network_minutes`: best transit time with the candidate rail links added.
- Pairs where rail is not faster contribute zero. No negative benefit.

Selection rule: greedy by **benefit gained per dollar**. Add the corridor with the best ratio, update, repeat until the budget is spent. The order of selection is the proposed phasing.

### Secondary scores (reported, not optimized in v1)

1. **Equity:** the same time savings, reported separately for workers living in high-need tracts. "High need" uses the equity layer's existing ACS 2020-2024 indicators and its existing quintile classes (no new thresholds):
   - Primary: **households with no vehicle** (direct measure of transit dependence). High need = top quintile.
   - Secondary: **people below poverty**. High need = top quintile.
   - Context only: **median household income** (bottom quintile = lower income). Not used as a need flag, since it is a weaker proxy for transit dependence.
   - Tracts with missing values are excluded and reported; tracts flagged as small sample (fewer than 100 households) are reported with that caveat.
   - Both measures are **shares**, not counts: no-vehicle households as a percent of households; people below poverty as a percent of people in the poverty universe. High need means **strictly above the existing 80th-percentile break**: no-vehicle share > **8.41136486219713%**; poverty share > **18.970607565181936%**. Exact cutoffs are copied from the [Equity section of `analysis/README.md`](../analysis/README.md#equity); values equal to a break stay in the lower class.
2. **Accessibility cross-check:** population-weighted jobs reachable within **TBD** minutes. Used to confirm the ranking of corridors is similar under a second method.
3. **Tourism (separate run):** visitor demand is not in LODES. It is added only as a clearly labeled second scenario (section 6), never mixed into the resident score.

## 3. Data requirements

| Input | Source | Use | Status |
|---|---|---|---|
| Home-to-work flows | Census LODES8 origin-destination files, Florida, main file, all jobs | `workers(i, j)` | **Verified 2026-10-30 UTC**: `fl_od_main_JT00_2023.csv.gz` (2023); [source URL, hashes and verification](../data/LODES_OD_HEX8_CONTRACT.md#verified-end-to-end-run) |
| Jobs by industry | LODES workplace area characteristics | Share of hospitality jobs (accommodation/food, arts/entertainment/recreation) | Already partly loaded (employment layer) |
| Population | ACS 2020-2024 and Kontur hexagons (modeled) | Context, accessibility cross-check | Loaded |
| Equity indicators | ACS 2020-2024 (households with no vehicle, people below poverty, median household income) | Secondary equity score | Loaded |
| Hexagon geography | H3 resolution 8 (verified from hexagon IDs, e.g. 8844a90e4dfffff) | Common geography for all layers and the model | Verified |
| Existing transit | SunRail and Brightline GTFS, LYNX GTFS | Baseline travel times | Loaded as layers; routing use **TBD** |
| Visitor demand | Hotel and attraction locations, airport passengers, visitor counts | Tourism scenario only | **TBD**: sources not yet chosen |
| Rail construction costs | Published project cost datasets (for example NYU Marron Transit Costs Project, FTA filings) | Cost per mile by mode | **TBD**: cite exact table, year, and project list |
| Candidate corridors | Existing rail rights-of-way, highway medians, major arterials, minus water and protected land | The set the algorithm chooses from | **TBD**: build and document |

LODES origin-destination data is at census-block level. **Decision: aggregate to H3 resolution 8 hexagons**, consistent with the map. The verified OD pipeline assigns each block using its supplied Census internal point (`INTPTLAT20`, `INTPTLON20`), not a centroid; see the [OD contract](../data/LODES_OD_HEX8_CONTRACT.md). Tract-level ACS indicators are assigned to each hexagon through the census tract ID already carried by the app. Limitation: tract-level indicators do not vary between hexagons in the same tract.

### Industry and earnings: what the OD file can identify

The OD industry's `SI01`–`SI03` columns are **three broad groups** (goods
producing; trade, transportation and utilities; other services). They **cannot
identify hospitality workers**. Hospitality job shares come from the
**workplace-based WAC files**, using the detailed industry columns by **workplace
location**: `CNS17` (NAICS 71, arts/entertainment/recreation) and `CNS18` (NAICS 72,
accommodation/food services). These workplace shares are not a hospitality
classification of individual home–work flows; do not assign them to commuters
as though the OD file identified their detailed industry.

The OD earnings columns **`SE01`–`SE03` are the only worker-level proxy for
low-wage commuters used here**. They count jobs in broad monthly-earnings bands,
not identified workers, hourly wages, hours worked or household income:

| OD column | Published monthly-earnings band |
| --- | --- |
| `SE01` | Jobs with earnings $1,250/month or less |
| `SE02` | Jobs with earnings $1,251/month to $3,333/month |
| `SE03` | Jobs with earnings greater than $3,333/month |

Cited specification: US Census Bureau, **LODES Dataset Structure, Format Version
8.4**, [technical documentation](https://lehd.ces.census.gov/data/lodes/LODES8/LODESTechDoc8.4.pdf),
OD file structure and workforce segments. These are source-defined bands, not
new model thresholds. Source-access note: the sandbox could not retrieve the
Census PDF (proxy HTTP 403), so direct inspection of that primary document is
not claimed. The exact earnings labels were checked against an accessible
[OD/segment transcription citing Format Version 8.2](https://github.com/twgonzalez/csf-sandag/blob/018843807510ec64d3ded6726ec4e2e79869c78a/config.py#L118-L126)
and the matching earnings and industry definitions in the
[Format Version 8.4-derived schema](https://github.com/basedosdados/pipelines/blob/b8b85f20a1c81e6042f55a7d5f7f1f78ec1a9294/pipelines/datasets/us_census_lodes/constants.py).
The original Census document remains the authority; direct PDF confirmation is
still required to complete the requested primary-document lookup. This access
limitation concerns the citation lookup, **not** the owner's verified OD run.

## 4. Assumptions (all must be cited or labeled)

Every parameter below shows in the UI as an assumption, with its source.

| Parameter | Value | Source |
|---|---|---|
| Station catchment (walk distance) | **TBD** (half mile is the common planning convention; confirm and cite) | |
| Rail average speed incl. stops, by mode | **TBD** | Agency documentation or TCRP |
| Wait time model (headway / 2) and headway by mode | **TBD** | |
| Transfer penalty | **TBD** | |
| Access/egress time to a station | **TBD** | |
| Cost per mile, light rail | **TBD**, run low and high | |
| Cost per mile, heavy rail | **TBD**, run low and high | |
| Station cost | **TBD** | |
| Budget | User-adjustable slider. Default $10B (project framing); maximum **TBD** | Project decision |
| Mode assignment thresholds (light vs heavy rail only) | **TBD** | Published planning guidance, cited |

Cost reference cities: Houston as a lower-cost light rail reference in a car-oriented region, Boston as an upper bound. Reasons for each choice must be stated in the presentation. Other peers worth considering: Charlotte, Salt Lake City, Dallas.

### Modeling simplifications (state these on the limitations slide)

- Travel time between areas is computed centroid to centroid.
- Drivers are assumed to switch to rail only where rail beats the existing transit option. Driving time is not modeled in v1, so benefit estimates describe time saved for transit users and potential users, not forecast ridership.
- No induced development or land-use change is modeled.
- Costs are order-of-magnitude benchmarks, not engineering estimates.
- Greedy selection is not guaranteed to be globally optimal.
- Brightline is intercity service. It is included in the baseline using its published timetable, but its fares and schedule are not designed for commuting. A sensitivity run excludes it and reports the difference.
- Tract-level equity indicators are the same for every hexagon in a tract.
- Only about **69%** of jobs located in the four counties in the Florida main OD file (**1,006,088 of 1,467,549**) are held by workers who also live there. Inbound commuters living outside the four counties are not in this model. The main-file denominator excludes interstate auxiliary flows as well.
- LODES counts are **jobs, not people**; a person can hold multiple jobs. Job-weighted time savings are not a count of distinct beneficiaries or predicted ridership.
- The top work hexagon, **`8844a9160dfffff` near Walt Disney World**, holds **61,428 jobs**. This **may** reflect LODES assigning a large multi-site employer's jobs to one location. Treat that as a possibility to check, **not a finding** about the employer or the physical distribution of jobs.

## 5. Implementation plan

Keep modeling code in `analysis/`, separate from rendering. Interchange format: GeoJSON, per the README.

```
analysis/
  rail/
    graph.py        build the candidate network graph (nodes, edges, lengths, costs)
    od.py           load and aggregate LODES OD flows to the chosen geography
    traveltime.py   shortest-path times: baseline and with candidate links
    score.py        benefit function (HAND-WRITTEN)
    greedy.py       selection loop (HAND-WRITTEN)
    modes.py        mode assignment rule
    compare.py      scoring and overlap against external proposals (STAR)
  test_rail_*.py    unit tests on toy graphs
data/
  rail/             documented outputs, with a README for each file
```

### Milestones

1. **Data contracts.** Document the schema of each input and output file in `data/`. Pull LODES OD and record provenance.
2. **Baseline.** Compute `baseline_minutes` for home-work pairs from existing transit. Report coverage: what share of workers have a transit option at all.
3. **Toy model.** Implement `score.py` and `greedy.py` on a 5-node graph with an answer verifiable by hand. Write the tests first.
4. **Real run, single scenario.** Candidate corridors, one cost assumption, one objective.
5. **Sensitivity.** Rerun with low and high costs, different catchment distances, and the accessibility cross-check. Record which corridors stay in the top ranks.
6. **Secondary scores.** Equity report on the same networks.
7. **Tourism scenario.** Separate run with visitor demand added, labeled as an assumption.
8. **STAR comparison** (section 6).
9. **Frontend.** Show the build order, per-link explanation, and all assumptions in the UI.

### Efficiency note for the greedy loop

Adding one link only changes travel times for pairs whose shortest path now uses it. Recompute only those pairs each iteration, not every pair. Document the approach and verify results match a full recompute on the toy graph.

### Determinism

Ties are broken by corridor ID in ascending order. The same inputs must always produce the same build order.

### Budget slider

The greedy loop is run once, up to the maximum budget, and the full ordered list of corridors with cumulative cost is saved. The UI slider shows the prefix of that list that fits the chosen budget. Document the tie rule for a corridor that does not fit exactly: the build order stops at the first corridor that would exceed the budget (no skipping), so the slider always shows a true prefix of one ordered plan. Cost scenarios (low and high) are separate saved runs.

## 6. Comparison with STAR and other proposals

This model is rail only. The primary comparison is against **rail-based proposals**, starting with the Sunshine Corridor program (SunRail extension to the airport and convention center, plus Brightline extension). Current status and geometry must be sourced and dated before use. STAR is a secondary comparison, limited to its corridors that could be served by rail.


- Obtain the official STAR corridor list from the proponent (Sunrise Movement Orlando) or the county, and record the URL and date. Public reporting disagrees on the number of corridors, so do not rely on press summaries.
- Score STAR's corridors as a candidate network under every objective, at the same budget and cost assumptions.
- Report overlap: share of commute-weighted benefit and of population and jobs within the catchment distance, for each network.
- STAR is mode-agnostic and includes bus rapid transit. Compare corridor geometry, not mode, and state that STAR corridors may be proposed as bus service.
- **Do not tune parameters to resemble STAR.** Where the model disagrees with STAR, report it as a finding.

## 7. Outputs

For each run:

1. Ordered list of built corridors with cost and cumulative cost.
2. For every corridor: commute-weighted minutes saved, workers affected, home areas that gain, job centers that gain.
3. Totals for the primary, equity, and cross-check scores, side by side.
4. Sensitivity table: which corridors persist across assumptions.
5. The parameters used, with sources.

## 8. Validation

- Unit tests on toy graphs with hand-verified answers.
- Determinism test (same inputs, same order).
- Incremental recompute equals full recompute.
- Check that job-count totals reconcile with LODES (not unique people).
- All parameters trace to a cited source or are labeled assumptions.
- Project checks from the README (`npm run check`, `npm run build`, Python unittest discovery) still pass.

## 9. Decisions and open items

### Decided (2026-10-29)

1. **Geography:** H3 resolution 8 hexagons. Flows aggregated using block internal points, as documented by the verified OD pipeline (2026-10-30 update). Tract indicators inherited via tract ID.
2. **Modes:** rail only. Bus rapid transit excluded.
3. **Brightline:** included in the baseline using its timetable; sensitivity run without it.
4. **Budget:** user-adjustable slider, default $10B.
5. **Equity:** households with no vehicle (primary) and people below poverty (secondary), top-quintile classes; median household income shown as context.
6. **Primary comparison:** Sunshine Corridor and other rail proposals; STAR secondary.

### Open items and resolutions

1. Maximum value for the budget slider.
2. Who marks this document approved (update the AGENTS.md wording to match).
3. Confirm the model's block-location rule: the verified OD input pipeline currently uses Census block internal points, not centroids, for H3 assignment.
4. Which cost datasets and peer cities are used, and the low/high bounds.
5. How hospitality shares of jobs (LODES WAC workplace industry columns) are presented in the tourism story.
6. **Resolved (2026-10-30):** no-vehicle and poverty measures are shares (percent of households / people in the poverty universe). High need is strictly above the equity layer's existing 80th-percentile break: **8.41136486219713%** for no-vehicle share and **18.970607565181936%** for poverty share. These exact strings are copied from the [Equity section of `analysis/README.md`](../analysis/README.md#equity); equality belongs to the lower class.
