# Implementation Notes: Village Generation Overhaul

**Plan:** [2026-08-09--047--village-generation-overhaul.md](./2026-08-09--047--village-generation-overhaul.md)

**Purpose:** repository-specific implementation guidance for Claude Code. This document is intentionally more concrete than the plan: it records the current architecture, the intended target architecture, important existing code paths, and guardrails so implementation does not require rediscovering the repository from scratch.

---

## 1. Scope and decisions

### v1

Implement the village-generation architecture around a single `VillagePlan` as the source of truth for settlement layout.

Village sizes are:

```text
OUTPOST → SM → MD → LG → XL
```

`OUTPOST` is the existing special single-house/single-NPC settlement. Do **not** introduce a separate `XS` size.

`VillageIdentity` v1 should contain the stable identity inputs needed by generation (at minimum type/size and the existing terrain/resource context), but **traits and history are explicitly deferred to v2**. Do not build a generalized trait/history framework as part of this task.

The architectural goal is not merely to add another data object. Existing generation systems should be migrated toward:

```text
VillageIdentity
      ↓
VillagePlan
      ↓
terrain / roads / zones / plots / buildings / props / NPC placement
```

`VillagePlan` should become the authoritative description of what a village is and where its parts belong. Rendering/build systems consume the plan rather than independently recomputing layout decisions.

### Important design principle

Prefer refactoring existing mechanisms into the new pipeline over creating parallel implementations. Seedvale deliberately shares systems between features; do not leave an old `SettlementDef` layout algorithm and a second unrelated `VillagePlan` layout algorithm both active.

---

## 2. Current repository architecture

The current implementation already contains much of the desired functionality, but it is distributed across several modules.

### `src/settlement/settlementGenerator.ts`

This is currently the main settlement-definition generator. It already owns/coordinates concepts such as:

- settlement cells and deterministic cell IDs/seeds,
- site selection / flat-site search,
- terrain-aware settlement definitions,
- settlement size selection,
- resource-aware settlement decisions,
- clearing/layout information,
- integration with family generation.

It should be treated as the main migration starting point rather than bypassed with a brand-new generator elsewhere.

### `src/settlement/families.ts`

Already contains:

- `VillageSize = 'SM' | 'MD' | 'LG' | 'OUTPOST'`,
- family generation,
- reserved home families,
- deterministic family/NPC generation,
- resource-role assignment,
- OUTPOST handling.

When adding `XL`, update this model deliberately rather than introducing a second size type. The current `SIZE_WEIGHTS` and `FAMILY_COUNT_RANGE` are the obvious places that must remain consistent with the new size model.

Do not break the reserved home families: Anna/Piotr and Kasia/Marek are deliberately retained because existing quest/dialogue behavior relies on them.

### `src/settlement/roadNetwork.ts`

The road network is already a substantial system, not something that needs to be invented by 047. It resolves settlement definitions, finds neighboring settlements, runs cached A* routes, and creates road/path segments.

Important existing behavior:

- neighbor discovery is based on actual settlement-site distance,
- road routes are deterministic and cached by settlement pair,
- open water is currently a hard reject (no bridges),
- mountains are traversable but expensive,
- minor-location paths are generated separately,
- route generation is analytic and can happen before chunks render.

047 should integrate road decisions into the `VillagePlan` rather than duplicate route generation. Keep `roadNetwork.ts` focused on route computation; the plan should describe which roads/paths belong to the village.

### `src/settlement/settlementTerrain.ts`

Contains terrain classification/sampling used by settlement generation. It should remain a reusable terrain/query layer, not become a second place where village layout is decided.

### `src/settlement/minorLocations.ts`

Provides village-adjacent/minor locations such as relevant resource/water access. Treat these as inputs to planning and infrastructure/path placement, not as an independent village-layout system.

### `src/settlement/SettlementsManager.ts`

This is the runtime/streaming side of settlements. It is responsible for ensuring settlement content is available as chunks become relevant.

Do not move runtime streaming concerns into `VillagePlan`. The plan should be deterministic/pure generation data; `SettlementsManager` should consume it and instantiate/update the world.

A recent bug fix also established an important sequencing rule: settlement props that depend on terrain height must not be built before the relevant chunks have been loaded/available. Preserve that behavior during the refactor.

---

## 3. Target architecture

The desired architecture is:

```text
                    ┌──────────────────────┐
                    │  deterministic input │
                    │ seed + cell + terrain│
                    │ + resources + config │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │   VillageIdentity    │
                    │ type / size / context│
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │     VillagePlan      │
                    │                      │
                    │ site / boundary     │
                    │ center / zones      │
                    │ plots / buildings   │
                    │ roads / paths        │
                    │ infrastructure      │
                    └───────┬───────┬──────┘
                            ↓       ↓
                 ┌─────────────┐ ┌─────────────┐
                 │ terrain     │ │ runtime      │
                 │ modifiers   │ │ instantiation│
                 └─────────────┘ └─────────────┘
```

The exact TypeScript shape can evolve during implementation, but the ownership boundaries should remain clear.

### Recommended ownership

- **Identity:** why this settlement is this settlement.
- **Plan:** where everything goes and what the settlement contains.
- **Terrain helpers:** answer terrain questions; do not own settlement layout state.
- **Road network:** calculate routes; the plan records the selected route/connection.
- **Families/NPC generation:** generate inhabitants from the plan's settlement size/context; do not independently decide physical layout.
- **Runtime manager:** instantiate/despawn/update objects from the plan.

---

## 4. `VillagePlan` should be data-first

Avoid putting Three.js objects, meshes, scene nodes, or runtime references into `VillagePlan`.

It should be possible to generate and inspect a plan without rendering the settlement.

Conceptually:

```ts
export type VillagePlan = {
  identity: VillageIdentity
  site: {
    x: number
    z: number
    elevation: number
    radius: number
  }
  zones: VillageZone[]
  plots: VillagePlot[]
  buildings: VillageBuildingPlan[]
  roads: VillageRoadPlan[]
  paths: VillagePathPlan[]
  infrastructure: VillageInfrastructurePlan[]
}
```

This is illustrative, not a requirement to copy the exact shape.

The important property is that downstream systems can consume the plan without asking a second generator where things should be.

---

## 5. Preserve deterministic generation

The whole settlement pipeline is procedural and seed-driven. New planning decisions must remain deterministic.

For the same world seed + settlement cell + relevant generation/config inputs:

```text
same VillageIdentity
        ↓
same VillagePlan
        ↓
same layout
```

Use the repository's existing seeded-random conventions (`createSeededRandom`, cell/family seed derivation, etc.) instead of `Math.random()`.

When adding new plan fields, derive them from stable settlement-specific seeds. Do not use iteration order over unrelated runtime collections as a seed source.

---

## 6. Village size: add XL, retain OUTPOST

Current family code defines:

```ts
export type VillageSize = 'SM' | 'MD' | 'LG' | 'OUTPOST'
```

Change this to:

```ts
export type VillageSize = 'SM' | 'MD' | 'LG' | 'XL' | 'OUTPOST'
```

`OUTPOST` remains a special case, not a weighted normal village size.

Update all size-dependent structures together:

- size weights,
- family count ranges,
- physical footprint/radius,
- building/plot counts,
- settlement generation branches,
- any UI/config/type guards,
- any tests or deterministic snapshots.

Do not introduce `XS`.

The exact XL numeric ranges should follow the plan/current balancing conventions rather than being duplicated in multiple modules. Prefer one configuration/table as the source of truth.

---

## 7. Existing resource-driven behavior must survive

Plan 032 already established resource-aware village generation. In particular, significant resources can influence settlement character and dedicated roles; OUTPOSTs are tied to significant resources/harsh terrain conditions.

047 should preserve this behavior while moving the decision into the new planning pipeline.

Do not reduce resource information to a cosmetic label. It is an input to the village's identity/plan and may influence:

- village size,
- dedicated family/role,
- food/source infrastructure,
- appropriate plots/zones,
- paths/access to the relevant resource.

Future resource/economy systems should be able to consume the plan rather than reverse-engineering the reason a village was generated.

---

## 8. Zones, plots and buildings

The key architectural improvement is to stop treating "clearing + houses + props" as one implicit layout operation.

The plan should make the major physical structure explicit, approximately:

```text
VillagePlan
 ├─ site/boundary
 ├─ zones
 │   ├─ residential
 │   ├─ central/public
 │   ├─ work/resource
 │   └─ food/source (where applicable)
 ├─ plots
 │   ├─ house plots
 │   ├─ work plots
 │   └─ infrastructure plots
 ├─ buildings
 ├─ roads
 └─ paths
```

The exact zone taxonomy should remain minimal in v1. Do not create an elaborate zoning simulation system.

The purpose is primarily architectural: a house should have a planned location/plot, rather than each downstream renderer independently deciding where it belongs.

---

## 9. Terrain integration

The current code already has clearing/smoothing and terrain-modifier concepts. Preserve them, but move their *inputs* toward the plan.

Desired direction:

```text
VillagePlan boundary/zones/roads
              ↓
terrain modifiers derived from plan
              ↓
chunk heightmap / terrain rendering
```

Avoid the reverse dependency where terrain generation has to reconstruct the village layout by rerunning settlement logic.

This is especially important because chunk generation can happen in workers. Do not introduce imports of main-thread-only settlement/runtime code into terrain workers.

The current `roadNetwork.ts` comments explicitly distinguish analytic/main-thread settlement logic from worker terrain generation; preserve that separation.

---

## 10. Roads and paths

Do not rewrite the existing A* routing algorithm as part of 047 unless required by the new plan abstraction.

Instead:

1. Generate village zones/plots.
2. Determine required internal connections.
3. Use existing route computation/helpers to produce route geometry/data.
4. Store selected road/path plans in `VillagePlan`.
5. Runtime/rendering consumes those planned segments.

Inter-settlement roads should continue to use the existing deterministic neighbor/routing system.

The architectural distinction should be:

```text
VillagePlan → which connection this village has / needs
roadNetwork → how to route that connection through terrain
```

This avoids making `VillagePlan` responsible for low-level A* implementation details.

---

## 11. NPC/family integration

Families are currently generated independently using `VillageSize`, home-settlement rules, and resource roles.

After the refactor, `VillagePlan` should provide the stable settlement context needed by family generation, but family generation should remain a separate concern.

Do not put `NpcAgent` instances into the plan.

Do not make the planner aware of live NPC state.

Keep these layers separate:

```text
VillagePlan
    ↓
FamilyDef[]
    ↓
NpcAgent runtime instances
```

The home settlement's reserved families must continue to work exactly as today.

---

## 12. Streaming/runtime integration

`VillagePlan` generation should be deterministic and cheap enough to resolve before visual instantiation.

`SettlementsManager` should:

1. resolve/generate the plan,
2. wait for required terrain chunks when actual world-space placement requires rendered terrain data,
3. instantiate settlement content from the plan,
4. dispose/unload runtime objects according to existing streaming rules.

Do not make `VillagePlan` responsible for waiting on chunks or scene lifecycle.

Preserve the existing fix for props/lights/vegetation being positioned against terrain before the settlement's chunks are ready.

---

## 13. Migration strategy

Prefer incremental migration over a flag-day rewrite.

Recommended order:

### Step 1 — model

Introduce/adjust the core types:

- `VillageIdentity`
- `VillagePlan`
- zone/plot/building/road/path plan types as needed
- `VillageSize` with `XL`

Keep them free of Three.js/runtime references.

### Step 2 — centralize generation

Refactor `settlementGenerator.ts` so the main settlement-generation entry point produces a `VillagePlan` (or produces the existing `SettlementDef` through a compatibility adapter temporarily).

Do not maintain two independent layout algorithms.

### Step 3 — migrate terrain

Make clearing/smoothing/terrain modifiers derive from the plan rather than recomputing village placement independently.

### Step 4 — migrate roads/paths

Keep `roadNetwork` as the route solver but make the selected results part of the plan.

### Step 5 — migrate buildings/props

Make house/prop placement consume planned plots/buildings. Remove duplicated placement calculations where practical.

### Step 6 — migrate NPC/families

Pass the planned identity/size/resource context into existing family generation.

### Step 7 — migrate runtime manager

Make `SettlementsManager` consume the plan as the source of truth for instantiation.

### Step 8 — remove obsolete paths

Once all consumers use the new plan, remove compatibility code and old duplicated layout calculations.

---

## 14. Compatibility guardrails

During implementation, explicitly verify these existing behaviors:

- home settlement remains valid,
- reserved Anna/Piotr and Kasia/Marek families remain present,
- OUTPOST remains one-house/one-resident,
- significant resources still influence settlement generation,
- settlement names/cultures remain deterministic,
- village clearing/smoothing still matches rendered terrain,
- roads remain deterministic and symmetric,
- open water remains unrouteable unless a future bridge system changes that rule,
- mountain routing behavior remains intact,
- minor-location paths still work,
- settlement props do not float due to sampling terrain before chunks are ready,
- chunk streaming still unloads settlement runtime objects correctly,
- the same seed produces the same village layout.

---

## 15. What NOT to include in 047

Explicitly defer:

- village traits,
- village history/lore generation,
- dynamic village evolution,
- population simulation,
- economy simulation redesign,
- trading/barter redesign,
- LLM-generated village content,
- new NPC relationship systems,
- new building assets unless required to represent the existing layout,
- player building/housing.

Those can consume `VillagePlan` later. They should not make v1 of the architecture unnecessarily large.

---

## 16. Verification checklist

After implementation, verify at minimum:

- multiple seeds produce visibly different but coherent village layouts,
- SM/MD/LG/XL have clearly different footprints/capacity,
- OUTPOST still behaves as the special minimal settlement,
- village buildings remain on valid terrain,
- roads/paths connect the intended locations,
- resource-specific settlements retain their intended role/source behavior,
- non-home settlements still stream correctly,
- home settlement still supports existing quests/dialogues,
- no duplicated village-layout algorithm remains active,
- changing the seed changes the plan deterministically rather than introducing runtime randomness,
- TypeScript/build/tests pass.

If a design conflict appears between this document and the main plan, prefer the main plan and update these notes before proceeding with implementation.
