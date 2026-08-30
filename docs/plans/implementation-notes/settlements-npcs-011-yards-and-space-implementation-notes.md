# Implementation Notes: Household Yards & Settlement Space

**Reviewed:** 2026-08-30  
**Plan:** `settlements-npcs-011-yards-and-space.md`

## Review conclusion

Plan 011 is valid, but the current code is already further along than the plan implies. The important change is **spatial capacity/calibration**, not a new yard system.

The main architectural seam is the existing `VillagePlan`: it already owns the authoritative settlement boundary, zones, plots, buildings, landmarks and paths. Extend that pipeline rather than adding a separate spatial manager.

One important discrepancy: current gardens are **settlement-level garden landmarks**, not one garden per household. Do not silently reinterpret them as household-owned gardens during this plan. If the intended design is one garden per household, that is a separate layout decision and should be made explicitly before implementation.

## Existing systems to reuse

### `families.ts`

`VILLAGE_SIZE_CONFIG` is the single source of truth for family count, `footprintRadius`, `houseSpacing`, `houseRingMax`, and zone/infrastructure budgets. Do not duplicate SM/MD/LG/XL values elsewhere.

Current values:

| Size | Families | footprint | house ring | spacing |
|---|---:|---:|---:|---:|
| SM | 1–3 | 40 | 28 | 12 |
| MD | 3–5 | 48 | 32 | 14 |
| LG | 5–7 | 56 | 36 | 16 |
| XL | 7–9 | 72 | 48 | 18 |

### `settlementGenerator.ts` + `findSettlementSite.ts`

Generation is already plan-first:

```
cell/context
→ provisional size
→ footprint-aware site search
→ identity/families
→ VillagePlan
→ SettlementDef compatibility projection
```

`findSettlementSite()` already evaluates `footprintRadius` and `houseRingMax` for dry land, height spread, slope and dry paths. A larger settlement footprint therefore automatically participates in site selection.

Do not add a second site-selection pass.

Important limitation: the candidate search box is still `DEFAULT_SITE_SEARCH_MARGIN = 24` for normal settlements. A larger footprint does **not** widen the search area. This is probably desirable for deterministic locality and grid spacing; only change it if verification shows the larger footprint needs a wider search.

### `villagePlanner.ts`

`planVillageLayout()` sets `boundary.radius = villageSizeConfig(size).footprintRadius` and then places all plots through the shared `pickPlot()` scorer.

House plots currently use fixed `HOUSE_PLOT_RADIUS = 4.5`, preferred ring `houseRingMax * 0.85`, minimum center distance from the plaza, `houseSpacing`, house-spoke avoidance, and terrain/water/path checks.

The scorer's boundary handling is a **soft penalty**, not a hard containment rule. A candidate can technically extend outside the boundary if its score still wins. This matters when increasing the boundary: do not assume boundary radius is a strict geometric enclosure.

### Gardens

`gardenScale.ts` is the authoritative garden sizing model:

- S plot radius: 4.8
- M: 6.4
- L: 8.4
- clearing radius is larger than plot radius because it includes the actual beds + skirt.

Garden count is derived from house count: `ceil(houseCount / 3)` → `packGardenScales()`.

The planner places these gardens as shared settlement infrastructure, normally outside the plaza. `layoutClearingsFromPlan()` then creates garden clearings from the same landmarks.

Do not duplicate garden dimensions in plan 011.

### `villageClearing.ts`

Clearings are a projection of the authoritative `VillagePlan`, not an independent layout.

House clearings use `max(params.houseRadius, plot.radius * 0.85)`. Garden clearings use `gardenClearingRadius(scale)`. Regional smoothing already covers `plan.boundary.radius`.

This means increasing the boundary is already understood by the terrain-clearing layer; avoid introducing another yard clearing unless the yard itself must receive terrain treatment.

### `props.ts`

Household props already exist around each house, including household storage, barrel and trough. They are presentation projections and should continue to use authoritative household/economy state elsewhere.

Current placement is still partly offset-based. In particular, storage/barrel/trough placement should not become a second spatial solver in 009/010. If 011 exposes a shared household-space calculation, these consumers can use it.

The forest/decorative placement code already uses the concept of a residential `courtyardRadius` and rejects trees inside it. Reuse/align with this existing notion rather than creating another unrelated radius.

### Livestock

Livestock has `ownerHouseId`, but its movement is not constrained to a household yard. This is compatible with the plan.

Do not expand settlement boundary to accommodate livestock wandering. Animal movement remains an ecosystem/fauna concern.

## Recommended implementation

### 1. Derive required settlement extent from actual layout

Do not simply hard-code `SM 46 / MD 54 / LG 64 / XL 80`. Those values are starting hypotheses, not established requirements.

The implementation should calculate/check the outer extent needed by the generated static layout:

```
house plot
+ required household yard margin
+ garden/household-space requirement
+ edge margin
```

The result should be compared with `VILLAGE_SIZE_CONFIG.footprintRadius`.

Prefer a small number of centralized size/layout constants over many per-prop offsets.

### 2. Keep house spacing independent

Do not increase `houseSpacing` merely because the settlement boundary grows. `houseSpacing` controls relationships between plot centers; `footprintRadius` controls the available settlement envelope.

Only change spacing if generated layouts demonstrate house-to-house collision/overlap after accounting for yard requirements.

### 3. Give the yard a logical spatial contract, not a manager

A useful implementation seam is a derived household-space requirement used by layout/placement code. It should describe required clearance around the house rather than own runtime objects.

Do not create `YardManager`, `SettlementAreaManager`, a global spatial registry, or another placement solver.

### 4. Gardens need an explicit interpretation

Current gardens are shared settlement garden clusters. The plan currently says each household needs room for an “ogród”, but that does not match the implementation.

For this plan, the safest interpretation is:

```
household yard = space reserved around the house
garden allowance = space that must not be consumed by neighboring/static props
```

without changing garden ownership.

If later the design requires one private garden per household, that should extend `VillagePlan`/house plots explicitly rather than be inferred from the existing shared garden landmarks.

### 5. Boundary calibration

Increasing `footprintRadius` also affects zone radius, zone offsets, garden preferred rings, sale plot positions, livestock/work/food zone positions, site suitability scoring, regional terrain smoothing, and decorative forest bands.

Therefore test the whole generated layout, not just house placement. Avoid compensating for one changed radius with unrelated hard-coded offsets.

### 6. Settlement grid safety

`SETTLEMENT_GRID_STEP = 280`. Even an ~80-unit settlement boundary remains comfortably below the inter-settlement grid spacing. There is no reason to modify the settlement grid as part of this plan.

## Potential pitfalls

- **Boundary is not a hard containment guarantee.** `pickPlot()` applies an outside-boundary score penalty; verify final plot extents rather than assuming containment.
- **House plot radius is fixed at 4.5**, while actual assembled house geometry has several variants. Do not assume every house has identical visual footprint; use existing house footprint/collider helpers if exact clearance is required.
- **Garden plot radius and garden clearing radius differ.** Use the appropriate one for spacing vs terrain/visual clearance.
- **Current garden count is based on total houses, not household ownership.**
- **Increasing boundary changes zone placement**, so a seemingly harmless radius change can move public/food/production/livestock infrastructure.
- **Site selection samples only a small number of footprint points.** It is a suitability heuristic, not a full collision/layout validation.
- **Deterministic RNG streams matter.** Avoid inserting unrelated random calls into existing layout streams unless the resulting deterministic layout change is intentional.
- **Do not involve livestock wandering in boundary calculations.**

## Suggested verification

For a fixed seed, inspect every size:

1. Generate SM/MD/LG/XL.
2. Record actual house centers and plot radii.
3. Record garden landmark centers and `gardenClearingRadius`.
4. Measure the outermost static layout extent.
5. Check house↔house, house↔garden and house↔infrastructure clearances.
6. Check paths/entrances after any radius change.
7. Check terrain clearing/regional smoothing coverage.
8. Generate several deterministic seeds per size to catch unlucky layouts.
9. Confirm the same seed still produces the same plan.
10. Browser-verify the resulting settlement visually.

Do not use livestock positions as a failure criterion.

## Recommended implementation scope

Keep 011 focused on the **static settlement envelope and household-space contract**.

A likely implementation sequence is:

```
1. Measure current generated extents.
2. Define the minimum household-yard clearance.
3. Derive/check required boundary radius per size.
4. Adjust VILLAGE_SIZE_CONFIG only where measurements require it.
5. Align household prop placement with the shared space assumptions.
6. Verify gardens and existing infrastructure still fit.
7. Run deterministic/layout tests.
8. Browser-verify several sizes/seeds.
```

Plan 009 can then consume the resulting household storage positions/space without inventing another placement model.