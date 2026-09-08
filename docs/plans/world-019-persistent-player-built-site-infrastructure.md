# Plan: Persistent Player-built Site Infrastructure

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** none
**Domain:** `world`
**Subdomains:** `places` `resources` `simulation`
**Tags:** `terrain-preparation` `construction` `garden` `well` `spatial-query`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Make ordinary Player-built infrastructure persist and remain queryable as authoritative world state so future systems can inspect a world site and decide what physical infrastructure already exists there.

The abandoned-gold-mine colony is the motivating consumer, but this plan must not implement quest logic, colony readiness booleans or settlement bootstrap.

The intended flow is:

```text
Player prepares terrain / builds well / builds garden
→ normal persistent world state
→ generic bounded site query
→ future caller applies its own rules
→ the same objects remain available to NPCs and settlements
```

## Core invariants

> **Do not create quest-specific infrastructure objects or persisted readiness booleans.**

> **Terrain preparations, Player wells and Player gardens remain owned by their existing authoritative systems.**

> **The site query is read-only aggregation, not another infrastructure registry.**

> **Player and NPC shared work continue mutating the same construction records.**

> **Future settlement farming should consume Player-built cultivation through a shared cultivation-anchor contract, not by copying or converting the garden.**

> **Readiness policy belongs to the caller; the world layer reports facts.**

## Current state confirmed by recon

### Terrain preparation

Current preparation ownership is split between:

- `src/terrain/terrainPreparation.ts` — pure domain rules;
- `src/world/createTerrainPreparations.ts` — runtime/world lifecycle;
- `src/app/actions/terrainPreparationActions.ts` — active Player work;
- `ChunkManager.applyExactHeights(...)` — terrain mutation.

`PreparationSize` is currently discrete:

```ts
2 | 3 | 4 | 9
```

The footprint implementation itself is metre-based and resolution-aware through `resolvePreparationSamples(...)` / `preparationSamplesPerSide(...)`; there is no need for a parallel plot mechanism.

The roadmap wording implying continuously selectable `2×2 → 9×9` is therefore stale relative to current `main`.

### Completed terrain preparations

`TerrainPreparationRecord` is active-work state. On completion the final heights remain applied, but the record is deleted. The semantic fact that a specific prepared area existed is therefore not durable across save/load.

This blocks later queries such as:

```text
which completed prepared areas exist inside this site?
what footprint did each completed preparation have?
```

### Player-built well

Player wells already exist as normal persistent world objects. Their construction uses the existing staged well logic and shared work mechanisms, and completed/usable wells integrate with the normal `WaterSource` path.

No new water-source type is required.

### Player-built garden

Player gardens already exist as normal persistent constructions. They own placement/collider/care/hydration state while planted crops remain ordinary shared `CropPlacement`s.

No `QuestGarden` or copied settlement garden is required.

### Settlement farming gap

NPC Farmer work currently anchors cultivation around settlement garden landmarks, notably `ctx.landmarks.garden`. A Player-built garden is compatible with the same crop world state but is not yet a first-class cultivation anchor for settlement Farmer work.

## Scope

### 1. Generalize terrain-preparation sizes across the existing `2…9` range

Keep the current terrain-preparation system as the only owner and extend its size model so ordinary preparation can use integer metre sizes from `2` through `9` inclusive.

Do not add a colony-specific `6×6` mode.

Prefer a bounded domain representation such as a validated integer/range contract over a quest-driven union that merely adds `6` to `2 | 3 | 4 | 9`.

Required behavior:

- existing `2`, `3`, `4`, `9` behavior remains valid;
- `5`, `6`, `7`, `8` become valid ordinary preparation sizes;
- existing footprint resolution remains metre-based and terrain-resolution-aware;
- placement/collision validation continues using the existing preparation footprint mechanism;
- work/cost calculations use the selected area through existing formulas;
- UI/input cycles or selects only valid bounded sizes.

Do not introduce free-form arbitrary sizes outside the existing intended `2…9` range in this plan.

### 2. Preserve completed prepared areas as compact persistent world facts

Introduce the smallest durable completed representation necessary to describe the physical prepared area after active construction state is gone.

Conceptually:

```ts
type CompletedTerrainPreparation = {
  id: string
  center: GridSample
  size: PreparationSize
}
```

Exact naming and shape should follow current terrain-preparation ownership.

Persist only information needed to identify/query the completed footprint. Do not retain construction-only fields such as `originalHeights`, `requiredWork` or `completedWork` after completion.

Do not duplicate terrain geometry truth. Final exact heights remain owned by the existing terrain modification/persistence path.

Completion invariant:

```text
active TerrainPreparationRecord removed
+
compact completed-area record created
+
final terrain heights remain applied
```

The transition must be idempotent and must work identically whether the final contribution came from the Player or NPC/shared Work Contract work.

### 3. Persist completed preparation metadata

Extend SaveData/current persistence ownership so completed prepared areas survive save/load.

Requirements:

- active preparation persistence remains intact;
- completed preparation identity, center and size round-trip;
- old saves without completed records restore with an empty collection;
- terrain final-height reconstruction remains owned by the existing terrain persistence mechanism;
- do not store a second authoritative copy of final terrain heights inside the completed-area record.

### 4. Add a bounded read-only site infrastructure query

Add a small world-level query that receives caller-provided site geometry and returns matching authoritative infrastructure records.

Conceptually:

```ts
querySiteInfrastructure(site) => {
  completedTerrainPreparations,
  wells,
  cultivationAreas,
}
```

The query reports what exists. It must not evaluate colony-specific readiness rules.

Return actual records/references or stable read models derived directly from the authoritative stores rather than booleans such as:

```text
hasTwoPlots
hasWell
hasGarden
readyForColony
```

A minimal V1 site geometry may be center + radius if that matches existing spatial helpers. Keep the query boundary generic enough that future callers can evolve their site geometry without changing infrastructure ownership.

The query should be on-demand/event-driven. Do not add per-frame world-wide scans or a new spatial database.

### 5. Keep qualification policy outside the world query

The generic query must not encode the abandoned-mine colony's future requirements such as:

- exactly or at least two prepared plots;
- minimum `6×6` footprint;
- mine-entrance clearance;
- minimum separation between plots;
- a hard-coded colony site radius.

A future caller should be able to do conceptually:

```ts
const infra = querySiteInfrastructure(site)
const plots = infra.completedTerrainPreparations.filter((p) => p.size >= 6)
```

The world layer provides the facts; quest/settlement/bootstrap logic provides policy.

### 6. Reuse the existing well availability contract

A well exposed as usable site infrastructure must use the existing well-stage/water-availability rule.

Do not treat every placed well record as usable water.

The returned object remains the same Player-built well and the same real `WaterSource`; no settlement-owned copy or adopted-well state is introduced.

### 7. Expose Player-built gardens as cultivation infrastructure

Live Player gardens inside the site must be discoverable through the site query.

A Player garden remains owned by `PlayerGardens`; crops remain normal `CropPlacement`s.

Do not introduce:

- `QuestGarden`;
- `SettlementAdoptedGarden`;
- duplicated garden state;
- duplicated crop state.

A removed/fully decayed garden does not qualify merely because historical metadata once existed.

The site query answers whether cultivation infrastructure exists; it does not require a crop to be planted at query time.

### 8. Introduce a small shared cultivation-anchor contract

Refactor Farmer cultivation targeting so it is not fundamentally tied to a single `SettlementLandmarks.garden` position.

Introduce the smallest shared read contract needed by farming work, conceptually:

```ts
interface CultivationAnchor {
  position: { x: number; z: number }
  radius: number
}
```

The exact shape should follow current geometry/types and may use existing vector/position types.

Both existing settlement garden infrastructure and Player-built gardens should be representable as cultivation anchors without changing their state ownership.

This also provides a place to preserve actual cultivation radius/scale instead of forcing Farmer work to infer it from a position-only landmark.

Avoid branching the farming algorithm into separate PlayerGarden vs SettlementGarden implementations.

### 9. Make Farmer work consume a supplied/resolved cultivation anchor

Adapt normal Farmer profession work so planting/harvesting can operate around a cultivation anchor rather than only `ctx.landmarks.garden`.

Required behavior:

- existing settlement garden farming continues to work;
- a future bootstrap caller can supply/select an existing Player garden as the settlement's cultivation anchor;
- harvest continues querying the shared crop state;
- planting continues consuming real household seed through existing economy/inventory rules;
- Player garden ownership is not transferred or duplicated merely because NPCs work there.

This plan does not decide when a future settlement adopts/chooses a Player garden. It only makes the farming mechanism capable of using the same physical infrastructure once selected.

### 10. Preserve shared construction work

Terrain preparation and well construction already support shared Player/NPC work contracts over the same records.

Do not introduce new progress stores, actor-specific copies or new Work Contract concepts.

Any terrain-preparation lifecycle changes in this plan must preserve current remaining-work and contribution semantics.

## Ownership boundaries

| Concern | Owner |
|---|---|
| active terrain preparation | existing terrain-preparation system |
| completed prepared-area metadata | terrain-preparation world state |
| final terrain heights | existing terrain/exact-height persistence |
| Player well | existing PlayerWells system |
| water availability | existing well / `WaterSource` logic |
| Player garden | existing PlayerGardens system |
| planted crops | existing shared crop world state |
| settlement garden definition | existing settlement infrastructure |
| cultivation anchor | small shared read contract, no state ownership |
| Farmer planting/harvest decisions | existing profession-work system |
| site infrastructure query | read-only world aggregation |
| colony/quest readiness policy | future caller, outside this plan |

Do not add an `InfrastructureManager` that owns copies of terrain preparations, wells or gardens.

## Likely implementation areas

Reconfirm exact symbols during implementation, but focused recon identified these areas:

```text
src/terrain/terrainPreparation.ts
src/world/createTerrainPreparations.ts
src/app/actions/terrainPreparationActions.ts

src/world/playerWell.ts
src/world/createPlayerWells.ts
src/world/WaterSource.ts

src/world/playerGarden.ts
src/world/createPlayerGardens.ts
src/world/plantedCrops.ts
src/world/cropLifecycle.ts

src/ai/npcProfessionWork.ts
src/settlement/props.ts
src/settlement/gardenScale.ts

src/persistence/saveData.ts
```

Use the existing app/world composition point for dependency wiring rather than introducing global lookups.

Add JSDoc for important architectural/public query functions and types where it improves preflight discovery; use `@domain world` where appropriate.

## Tests

Add focused tests for at least:

### Preparation sizes

- all integer sizes `2…9` are accepted by the ordinary preparation mechanism;
- sizes outside the supported range are rejected/absent from the selection contract;
- existing footprint/sample resolution remains correct for representative sizes including `2`, `6`, `9`;
- placement/collision footprint scales correctly with selected size.

### Completion and persistence

- completion removes active state and creates exactly one completed-area record;
- repeated/final concurrent contribution cannot double-complete;
- Player and NPC/shared-work final contributions produce the same terminal state;
- completed center/size survive save/load;
- old saves without completed-area metadata restore safely;
- final terrain persistence continues to work without copying terrain heights into completed metadata.

### Site query

Given a bounded site:

- completed preparations inside it are returned;
- active unfinished preparations do not appear as completed;
- outside preparations are excluded;
- usable Player wells are returned;
- unfinished/unusable wells do not qualify as usable water infrastructure;
- live Player gardens are returned;
- removed gardens are not returned;
- query results reference authoritative objects/read models and are not persisted readiness state.

### Farming interoperability

- existing settlement-garden Farmer work remains valid;
- settlement garden can be represented through the shared cultivation anchor;
- Player garden can be represented through the same contract;
- Farmer planting and harvesting work against a supplied Player-garden anchor;
- planting still consumes real seed;
- harvest still mutates the existing crop/food state;
- no duplicate garden or crop record is created.

## Documentation

Update current-state documentation where needed to reflect:

- supported ordinary preparation sizes `2…9`;
- persistent completed prepared-area metadata;
- generic site infrastructure querying;
- shared cultivation-anchor semantics;
- Player-built gardens being reusable by settlement Farmer work.

Correct the abandoned-gold-mine roadmap statement that currently describes preparation size as continuously selectable if the implemented UI remains discrete integer selection.

Derived plan indexes/next IDs/implementation-note presence are generated automatically; update source files only and do not manually run generated-document sync solely for this plan.

## Non-goals

Do not implement:

- abandoned gold mine quest stages;
- quest objectives/checklists;
- colony readiness persisted state;
- future colony site selection;
- mine-entrance clearance rules;
- exact two-plot rule;
- hard-coded `>= 6` rule in the world subsystem;
- plot separation policy;
- expedition NPCs;
- mining camp creation;
- settlement bootstrap;
- transfer of ownership of well/garden to a settlement;
- tents becoming settlement housing;
- colony economy or gold profit sharing;
- generic settlement expansion;
- a new construction manager;
- a new global spatial index.

## Future abandoned-mine colony use

After this plan, future colony/bootstrap logic should be able to derive its requirements from current world state approximately as:

```text
infra = querySiteInfrastructure(colonySite)

qualifyingPlots =
  infra.completedTerrainPreparations
    .filter(size >= 6)
    .filter(colony-specific clearance/separation policy)

usableWell = choose usable well from infra.wells
cultivation = choose usable cultivation anchor from infra.cultivationAreas

ready =
  qualifyingPlots.length >= 2
  && usableWell exists
  && cultivation exists
```

`ready` remains derived and is not persisted by this plan.

The selected Player-built well/garden/prepared terrain remain the same normal world objects when settlement bootstrap later occurs.

## Success criteria

1. Ordinary terrain preparation supports bounded integer sizes from `2×2` through `9×9` using the existing mechanism.
2. Completed preparations retain a compact persistent semantic footprint after active work ends.
3. Save/load preserves completed preparation identity/position/size without duplicating terrain-height authority.
4. A caller can query a bounded world site for completed prepared areas, usable Player wells and live Player cultivation infrastructure.
5. The query returns world facts rather than colony-specific readiness booleans.
6. Settlement and Player gardens share a small cultivation-anchor contract.
7. Normal Farmer work can use a supplied Player-built garden through the same crop mechanics as settlement cultivation.
8. Existing settlement garden farming, wells, crops, placement and Work Contracts remain compatible.
9. No quest-specific infrastructure object or duplicated state is introduced.

## Verification

Run focused affected tests first, then repository verification required by the current project scripts, including typecheck/build/test commands that exist on current `main`.

Do not perform browser verification. Browser/manual verification is performed by the User.

Suggested manual checks for the User:

- prepare representative `2×2`, `6×6` and `9×9` areas;
- finish a `6×6` preparation, save/load and confirm terrain plus completed semantic record remain;
- build a well and garden at the same remote site;
- save/load and confirm all infrastructure persists;
- inspect/debug-query the site and confirm it returns actual existing infrastructure;
- verify Farmer work can operate around a selected Player-built garden without creating a duplicate garden/crop state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
