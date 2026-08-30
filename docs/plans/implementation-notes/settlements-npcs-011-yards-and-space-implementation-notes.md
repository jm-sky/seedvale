# Implementation Notes: Household Yards & Settlement Space

**Reviewed:** 2026-08-30  
**Plan:** `settlements-npcs-011-yards-and-space.md`  
**Status:** `reviewed`

## Review conclusion

Plan 011 is valid, but the current code is already significantly further along than the plan description suggests.

The correct implementation target is **not a new yard/spatial system**. The main task is to establish a shared, measurable household-space contract and calibrate the existing settlement envelope/placement pipeline around it.

The authoritative spatial pipeline is already:

```
settlementGenerator
  → findSettlementSite
  → VillagePlan
      → zones
      → plots
      → landmarks
      → paths / entrances
  → props / clearings runtime projection
```

Extend this pipeline. Do **not** add `YardManager`, `SettlementAreaManager`, a global spatial registry, or a second placement solver.

## Important finding: gardens are not household-owned

The plan currently says every household needs space for a garden.

That does **not** match the code.

Current garden generation is shared settlement infrastructure:

- `gardenUnitsFromHouses()` derives garden capacity from total house count;
- `packGardenScales()` creates S/M/L garden clusters;
- gardens are `VillagePlan` infrastructure plots/landmarks;
- `landmarks.gardens` is settlement-level;
- `layoutClearingsFromPlan()` creates garden clearings from those landmarks.

Relevant files:

- `src/settlement/gardenScale.ts`
- `src/settlement/villagePlanner.ts`
- `src/settlement/villageClearing.ts`
- `src/settlement/props.ts`

For plan 011, interpret this as:

```
household yard
  = private/residential clearance around the house

garden allowance
  = settlement layout capacity reserved for the existing shared gardens
```

Do not silently change garden ownership or create one private garden per household. That would be a separate design decision.

## Current size configuration

`src/settlement/families.ts` is the single source of truth:

| Size | Families | footprint | house ring | spacing |
|---|---:|---:|---:|---:|
| SM | 1–3 | 40 | 28 | 12 |
| MD | 3–5 | 48 | 32 | 14 |
| LG | 5–7 | 56 | 36 | 16 |
| XL | 7–9 | 72 | 48 | 18 |

Do not duplicate these values.

The house ring used by the planner is:

```
houseRing = houseRingMax * 0.85
```

so the nominal preferred house-center radius is:

- SM: 23.8
- MD: 27.2
- LG: 30.6
- XL: 40.8

The planner house plot radius is currently `4.5`.

The existing household props are placed from the **actual house landmark footprint**:

```
barrel:  footprint + 0.85
trough:  footprint + 1.35
storage: footprint + 1.90
```

This is important: storage is already a real physical yard prop, not merely a future placeholder.

## Existing household-yard placement

`src/settlement/props.ts` contains `houseYardPlacements()`.

Current behaviour:

```
house center
  → radial direction from settlement core
  → actual house footprintRadius
  → fixed offset
  → small angular jitter
```

It is currently used for:

- household barrel,
- animal trough,
- household storage crate.

The storage position is exposed through:

```
SettlementLandmarks.householdStorages
```

and `createSettlement.ts` zips those positions with households by family index.

Therefore plan 011 should **align and harden this existing mechanism**, not replace it.

## Existing planner boundary behaviour

`src/settlement/villagePlanner.ts` uses a shared `pickPlot()` scorer.

Important detail:

```
outside = distanceFromCenter + plot.radius - boundary.radius
```

outside-boundary placement receives a strong score penalty, but it is **not a hard containment rule**.

Therefore increasing `footprintRadius` does not by itself prove that every plot/prop fits. Verification must measure final generated extents.

House placement already has:

- house plot radius = `4.5`;
- preferred ring = `houseRingMax * 0.85`;
- minimum distance from plaza;
- house-to-house spacing;
- house-spoke avoidance;
- terrain/water/path gates.

House spacing is independent from the settlement envelope. **Do not increase `houseSpacing` just because the boundary changes.**

## Existing site selection

`src/settlement/findSettlementSite.ts` already evaluates the requested settlement footprint.

It samples:

- `houseRingMax * 0.55`;
- `houseRingMax`;
- `footprintRadius` when materially larger;
- dry ratio;
- height spread;
- average slope;
- dry paths back to the site.

The hard footprint dry-ratio threshold is currently `0.4`.

Normal settlements still use:

```
DEFAULT_SITE_SEARCH_MARGIN = 24
```

A larger footprint therefore already participates in site suitability, but the search box is not automatically widened.

Do not add another site-selection pass.

Only revisit the search margin if browser/determinism tests demonstrate that the larger required layout cannot reliably fit within the existing search locality.

## Existing clearing / terrain integration

`src/settlement/villageClearing.ts` projects the authoritative `VillagePlan`.

Current behaviour:

- house clearings use `max(params.houseRadius, plot.radius * 0.85)`;
- garden clearings use `gardenClearingRadius(scale)`;
- regional smoothing uses `plan.boundary.radius`.

Therefore boundary changes already propagate into terrain clearing.

Do not create a separate yard clearing system unless implementation proves that yard terrain itself needs a distinct smoothing/rejection contract.

## Existing decorative forest / courtyard concept

`src/settlement/props.ts` already calculates a residential `courtyardRadius` for forest/decorative placement.

It is derived from:

```
max(
  clearings.core.radius * 1.6,
  minimum house-to-core distance * 0.55
)
```

Trees/clusters are rejected from this area.

This is an existing residential-space concept. If plan 011 needs a common residential clearance, first determine whether this concept can be promoted/reused instead of introducing another radius with overlapping meaning.

Do not blindly rename it into a new API.

## Recommended implementation

### 1. Measure before changing constants

Do not start by changing:

- `footprintRadius`,
- `houseSpacing`,
- `houseRingMax`,
- search margins.

First instrument/test the generated layout for several deterministic seeds.

For every SM/MD/LG/XL case collect:

```
house center + plot radius
house actual footprint
household barrel
trough
storage
garden center + gardenPlotRadius
garden clearing radius
stockpile / well / market / campfire
sale plots
local paths
settlement boundary
```

Measure the maximum radial extent from `plan.center`.

The goal is to answer:

```
requiredExtent(size, seed)
  = max(all static household/infrastructure extents)
```

Then compare it with `VILLAGE_SIZE_CONFIG[size].footprintRadius`.

### 2. Define the household-space contract

The contract should be a **pure layout/geometry calculation**, not an owner/manager.

It should answer approximately:

```
What clearance does one household require around its house
so its known yard props and access remain usable?
```

It must not own:

- households,
- props,
- NPCs,
- runtime objects,
- persistence.

Prefer a small shared helper or existing plot/landmark data over a new system.

### 3. Keep garden ownership unchanged

Do not make gardens household plots in 011.

The planner already knows the garden footprint and count. Use those existing dimensions when checking household/infrastructure capacity.

The garden model is:

```
house count
→ garden units
→ S/M/L garden scales
→ garden plot radius
→ garden clearing radius
```

Reuse these functions rather than copying their numbers.

### 4. Align household prop placement

The existing `houseYardPlacements()` is the natural integration point.

If review/testing shows collisions, improve this helper or move its pure geometric calculation into an appropriate shared module.

Do not create a second household-prop placement algorithm.

At minimum, the final placement must be checked against:

- the house footprint,
- neighboring house footprints,
- garden clearings,
- settlement core/infrastructure,
- local path corridors.

Avoid adding a general-purpose spatial collision engine for this.

### 5. Prefer conservative layout capacity over arbitrary spacing

If measurements show insufficient capacity, prefer this order:

1. improve household-space/plot clearance assumptions;
2. adjust `footprintRadius` per size;
3. only then consider `houseRingMax`;
4. change `houseSpacing` only if actual house-to-house overlap is demonstrated.

This preserves the existing meaning of `houseSpacing`.

### 6. Do not hard-code guessed radii

Do not introduce values such as:

```
SM = 46
MD = 54
LG = 64
XL = 80
```

without measurements.

Those are only possible hypotheses, not validated requirements.

## Likely files

### Primary

- `src/settlement/families.ts`
  - `VILLAGE_SIZE_CONFIG`
  - size-dependent footprint/spacing configuration.

- `src/settlement/villagePlanner.ts`
  - authoritative `VillagePlan`;
  - house/infrastructure plot placement;
  - shared plot scoring;
  - garden placement.

- `src/settlement/props.ts`
  - actual house construction;
  - `houseYardPlacements()`;
  - household storage/barrel/trough placement;
  - residential/courtyard decorative exclusion.

- `src/settlement/villageClearing.ts`
  - terrain clearing projection;
  - regional settlement smoothing.

- `src/settlement/findSettlementSite.ts`
  - footprint-aware site suitability.

### Secondary

- `src/settlement/gardenScale.ts`
  - reuse garden dimensions/count; do not duplicate.

- `src/settlement/createSettlement.ts`
  - confirms household ↔ house ↔ storage index mapping;
  - avoid changing ownership/lifecycle.

- `src/settlement/villagePlan.ts`
  - inspect types before adding any new layout field.

- `src/settlement/houseBuilder.ts`
  - use only if exact assembled-house footprint/collision data is needed.

- `src/settlement/places.ts`
  - do not create a new Place type for yards; a yard is spatial capacity, not an NPC Place.

## Tests

Prefer tests around pure deterministic layout calculations.

Likely targets:

- `src/settlement/villagePlanner.test.ts`
- `src/settlement/families.test.ts`
- existing garden/layout tests where relevant.

Test:

1. same seed → same `VillagePlan`;
2. SM/MD/LG/XL produce valid house counts;
3. household-space extent fits the configured boundary;
4. house-to-house clearance remains valid;
5. garden clearings do not overlap household-required space;
6. storage/trough/barrel positions remain outside house footprints;
7. local paths remain usable;
8. several seeds do not produce pathological layouts.

Avoid asserting exact coordinates unless the test is specifically a deterministic-regression test.

## Determinism

Be careful with seeded RNG.

`villagePlanner.ts`, `props.ts`, livestock and settlement generation already use independent seeded streams.

If adding calculations that do not require randomness, keep them pure.

If randomness is unavoidable, use a dedicated stream so adding yard placement does not reshuffle unrelated settlement generation.

## Performance

Plan 011 should remain cheap.

Do not add per-frame spatial queries.

Settlement layout happens during generation/build, so bounded measurements or candidate checks are acceptable.

Do not introduce a general spatial index or worker solely for this plan.

## Livestock

The current livestock system has `ownerHouseId`, but animal movement is deliberately not constrained to settlement/yard boundaries.

Keep this unchanged.

Do not include livestock wandering distance in settlement boundary calculations.

The plan's statement that livestock can leave the settlement is already compatible with the current architecture.

## Browser verification

Technical tests cannot prove the final visual layout.

Browser verification should inspect at least:

- one SM;
- one MD;
- one LG;
- one XL;
- several seeds;
- house ↔ storage/trough/barrel clearance;
- house ↔ garden clearance;
- house ↔ house spacing;
- path entrances;
- well/market/stockpile/campfire placement;
- terrain clearing;
- settlement edge;
- livestock leaving the settlement normally.

For visual layout, classify the result as **browser/manual verified** only after actual gameplay observation.

## Recommended implementation sequence

```
1. Add/extend deterministic layout measurement tests.
2. Measure current SM/MD/LG/XL extents across several seeds.
3. Define the minimum household-yard clearance from actual current props.
4. Reuse the existing VillagePlan / plot pipeline for that requirement.
5. Fix household prop placement only where measurements show real conflicts.
6. Adjust VILLAGE_SIZE_CONFIG footprint only where measured capacity is insufficient.
7. Re-check site selection and terrain clearing after any footprint change.
8. Run deterministic/layout tests.
9. Browser-verify several sizes and seeds.
```

The expected result is a **small extension of the existing settlement layout pipeline**, not a new spatial subsystem.

## Relationship to plans 009/010

Plan 009 already uses physical household storage destinations and `landmarks.householdStorages`.

Plan 010 is about physical storage visualization.

Plan 011 should therefore establish the **space contract and placement quality** that 009/010 can consume, rather than duplicating storage ownership or logistics.

Do not expand 011 into storage/economy changes.

**Zrób git commit i push do main, rebase jeżeli trzeba**
