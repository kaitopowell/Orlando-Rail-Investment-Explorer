# SOL/R rail model: assumptions and implementation plan

Status: DRAFT for review. No model code is written until this document is approved.
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

- `workers(i, j)`: workers living in area `i` and working in area `j` (LODES origin-destination).
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
   - Confirm whether the no-vehicle and poverty measures are shares or counts, and use shares for classification.
2. **Accessibility cross-check:** population-weighted jobs reachable within **TBD** minutes. Used to confirm the ranking of corridors is similar under a second method.
3. **Tourism (separate run):** visitor demand is not in LODES. It is added only as a clearly labeled second scenario (section 6), never mixed into the resident score.

## 3. Data requirements

| Input | Source | Use | Status |
|---|---|---|---|
| Home-to-work flows | Census LODES8 origin-destination files, Florida, main file, all jobs | `workers(i, j)` | **TBD**: confirm exact file name and year, record URL and access date |
| Jobs by industry | LODES workplace area characteristics | Share of hospitality jobs (accommodation/food, arts/entertainment/recreation) | Already partly loaded (employment layer) |
| Population | ACS 2020-2024 and Kontur hexagons (modeled) | Context, accessibility cross-check | Loaded |
| Equity indicators | ACS 2020-2024 (households with no vehicle, people below poverty, median household income) | Secondary equity score | Loaded |
| Hexagon geography | H3 resolution 8 (verified from hexagon IDs, e.g. 8844a90e4dfffff) | Common geography for all layers and the model | Verified |
| Existing transit | SunRail and Brightline GTFS, LYNX GTFS | Baseline travel times | Loaded as layers; routing use **TBD** |
| Visitor demand | Hotel and attraction locations, airport passengers, visitor counts | Tourism scenario only | **TBD**: sources not yet chosen |
| Rail construction costs | Published project cost datasets (for example NYU Marron Transit Costs Project, FTA filings) | Cost per mile by mode | **TBD**: cite exact table, year, and project list |
| Candidate corridors | Existing rail rights-of-way, highway medians, major arterials, minus water and protected land | The set the algorithm chooses from | **TBD**: build and document |

LODES origin-destination data is at census-block level. **Decision: aggregate to H3 resolution 8 hexagons**, consistent with the map. Default rule: each block is assigned to the hexagon containing its centroid (to be confirmed). Tract-level ACS indicators are assigned to each hexagon through the census tract ID already carried by the app. Limitation: tract-level indicators do not vary between hexagons in the same tract.

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
- Check that totals reconcile with LODES (workers counted equals source).
- All parameters trace to a cited source or are labeled assumptions.
- Project checks from the README (`npm run check`, `npm run build`, Python unittest discovery) still pass.

## 9. Decisions and open items

### Decided (2026-10-29)

1. **Geography:** H3 resolution 8 hexagons. Flows aggregated by block centroid. Tract indicators inherited via tract ID.
2. **Modes:** rail only. Bus rapid transit excluded.
3. **Brightline:** included in the baseline using its timetable; sensitivity run without it.
4. **Budget:** user-adjustable slider, default $10B.
5. **Equity:** households with no vehicle (primary) and people below poverty (secondary), top-quintile classes; median household income shown as context.
6. **Primary comparison:** Sunshine Corridor and other rail proposals; STAR secondary.

### Still open

1. Maximum value for the budget slider.
2. Who marks this document approved (update the AGENTS.md wording to match).
3. Block-centroid rule for assigning LODES blocks to hexagons (default above; confirm).
4. Which cost datasets and peer cities are used, and the low/high bounds.
5. How hospitality shares of jobs (LODES industry columns) are presented in the tourism story.
6. Whether the no-vehicle and poverty measures in the equity layer are shares or counts.
