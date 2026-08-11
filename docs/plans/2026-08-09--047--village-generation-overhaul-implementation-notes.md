# Implementation Notes: Village Generation Overhaul

**Plan:** [2026-08-09--047--village-generation-overhaul.md](./2026-08-09--047--village-generation-overhaul.md)

**Purpose:** repository-specific implementation guidance for Claude Code. This document is intentionally more concrete than the plan: it records the current architecture, the intended target architecture, important existing code paths, ownership boundaries, and guardrails so implementation does not require rediscovering the repository from scratch.

---

## Progress log

### 2026-08-11 — steps 10–16 (implementation complete → verification needed)

- **Step 10:** `layoutClearingsFromPlan` in `villageClearing.ts`; generator uses plan plots/center. Legacy `layoutClearings` kept for unit tests.
- **Shared cache:** `settlementPlanCache.ts` — single `settlementDefFor` used by `SettlementsManager` + `RoadNetwork`; `clearRoadNetworkCaches` clears settlement + minor-location caches.
- **Steps 11–12:** props consume plan landmarks (well/stockpile/garden/field/market/campfire); `createSettlement` passes `def.plan`.
- **Step 13:** `attachPlannedDock` writes dock landmark+path onto plan; `minorLocationsFor` prefers planned dock; `findDockLocation(origin, …)`.
- **Steps 14–15:** inter-settlement + dock routes start/end at `entranceToward`; local terrain corridors from `pathPlansToCorridorData(def.plan.paths, …)`.
- **Step 16:** `villagePlanDebug.summarizeVillagePlan`; debug GUI “Log home VillagePlan” wired via `SettlementsManager.getHomeDef()`.
- Technical gates green (`tsc`, lint, build, 254 unit tests). Browser layout verification still open.

### 2026-08-11 — steps 1–9

- Added `src/settlement/villagePlan.ts` (plain-data plan types; `FoodSourceType` lives here and is re-exported from `settlementGenerator`).
- Extended `families.ts` with `XL` and `VILLAGE_SIZE_CONFIG` / `villageSizeConfig()`.
- Refactored `settlementGenerator.ts` into `generateSettlementCore()` → plan + families in one pass.
- Footprint-aware `findSettlementSite` + provisional size lock; shared `pathDryness.ts`.
- `villagePlanner.ts` fills boundary/center/pattern/zones/plots/buildings/landmarks.
- **Step 9:** `planLocalPathsAndEntrances` — semantic entrances + local paths (dry gated); `pathPlansToCorridorData` for worker-safe corridor projection. Global roads remain `RoadNetwork`.
- `layoutClearings` remains runtime compatibility until step 10.
- Next: step 10 — terrain adapter from plan.

---

## 1. Scope and decisions

### v1

Implement the village-generation architecture around a single `VillagePlan` as the source of truth for the generated plan of one settlement.

Village sizes are:

```text
OUTPOST → SM → MD → LG → XL
```

`OUTPOST` is the existing special single-house/single-NPC settlement. Do **not** introduce a separate `XS` size.

`VillageIdentity` v1 should contain the stable identity/context inputs needed by generation. This includes the existing settlement type/size/resource/terrain context as appropriate, but **traits and history are explicitly deferred to v2**. Do not build a generalized trait/history framework as part of this task.

The architectural goal is not merely to add another data object. Existing generation systems should be migrated toward:

```text
VillageIdentity
      ↓
VillagePlan
      ↓
terrain / local paths / zones / plots / buildings / landmarks / entrances
      ↓
settlement runtime

VillagePlan entrances
      ↓
RoadNetwork
      ↓
inter-settlement roads
```

`VillagePlan` is authoritative for the local spatial plan of one settlement. Rendering/build systems consume the plan rather than independently recomputing local layout decisions.

### Important ownership rules

- One settlement has one authoritative `VillagePlan`.
- Do not introduce a second layout generator or an independent cache containing overlapping village-layout decisions.
- `SettlementDef` is the current source-data/runtime boundary and should be migrated or adapted rather than duplicated indefinitely.
- `SettlementLandmarks`, `Place`, `minorLocations`, and livestock remain existing runtime/domain mechanisms; the plan becomes their planning/source-data layer instead of creating parallel replacements.
- `VillagePlan` contains **local** paths only. Roads between settlements do **not** belong to `VillagePlan`.
- `RoadNetwork` owns global village-to-village connectivity and route computation. It must consume semantic village entrances and must not care whether an entrance is rendered as a gate, sign, or nothing.

---

## 2. Current repository architecture

The current implementation already contains much of the desired functionality, but it is distributed across several modules.

### `src/settlement/settlementGenerator.ts`

This is currently the main settlement-definition generator and is the primary migration seam. `SettlementDef` currently contains:

- stable cell identity (`id`, `gx`, `gz`),
- selected site (`x`, `z`, `y`),
- `VillageSize`,
- generated `FamilyDef[]`,
- `ClearingLayout`,
- home-settlement flag,
- terrain classification,
- deterministic name and name culture,
- dominant natural resource,
- food-source type.

Generation is already deterministic and resource-aware: site selection responds to world resources, terrain is classified after site selection, exceptional mountain/resource combinations can become `OUTPOST`, and families/clearings are derived from the same settlement seed.

Do not bypass this with a second independent generator. Refactor this pipeline so its generated settlement data becomes the authoritative `VillagePlan` or is adapted into it during migration.

### `src/settlement/families.ts`

Already contains:

- `VillageSize = 'SM' | 'MD' | 'LG' | 'OUTPOST'`,
- family generation,
- reserved home families,
- deterministic family/NPC generation,
- resource-role assignment,
- OUTPOST handling.

When adding `XL`, update this model deliberately rather than introducing a second size type. Keep size-dependent configuration centralized so XL ranges are not duplicated across planner, props, livestock, or UI code.

Do not break the reserved home families: Anna/Piotr and Kasia/Marek are deliberately retained because existing quest/dialogue behavior relies on them.

### `src/settlement/roadNetwork.ts`

The road network is already a substantial global routing system. It currently:

- resolves `SettlementDef` data,
- discovers neighboring settlements by actual site distance,
- computes deterministic cached A* routes,
- rejects open water,
- treats mountains as expensive but traversable,
- also computes routes to settlement-adjacent minor locations such as docks,
- provides settlement signpost/midpoint helpers.

There is currently a module-level `SettlementDef` cache in `roadNetwork.ts`, separate from the `SettlementsManager` cache. This is an important migration target: do not preserve two independent authoritative settlement-definition caches once `VillagePlan` exists. `RoadNetwork` should consume/resolve plans through the single planning path instead of becoming another settlement generator.

Keep `roadNetwork.ts` focused on **global connections and route computation**. Its local-location routing helpers may remain during migration, but the resulting local path data should ultimately be represented by the village plan rather than recomputed independently by runtime consumers.

### `src/settlement/settlementTerrain.ts`

Contains terrain classification/sampling used by settlement generation. It should remain a reusable terrain/query layer, not become a second place where village layout is decided.

### `src/settlement/minorLocations.ts`

Currently derives settlement-adjacent locations such as docks analytically from `SettlementDef` and terrain samplers, with its own module-level cache. Treat these as planning inputs/results owned by the village plan. Do not introduce another `VillagePlan`-independent dock/location generator alongside the planner.

A dock is a concrete example of local infrastructure: the planner should decide whether/where it belongs, while existing runtime consumers can continue to instantiate it through the current mechanisms during migration.

### `src/settlement/props.ts`

`SettlementLandmarks` currently holds runtime `THREE.Vector3` landmarks such as `well`, `stockpile`, `garden`, `market`, `homes`, `trees`, optional `dock`, `dockRoute`, and optional `campfire`.

Do **not** move these runtime objects into `VillagePlan`. Instead, the plan should contain plain-data landmark/building/plot positions or intents, and runtime should instantiate those into the existing `SettlementLandmarks` structure. This preserves the current `Place` and NPC APIs while removing duplicated placement decisions.

### `src/settlement/places.ts`

`Place` is already the NPC-facing abstraction for `home`, `workplace`, `food`, and `social`. `workplaceFor()` derives role-specific workplaces from `SettlementLandmarks`.

The planner should not create a second `Place` system. Planned homes/landmarks should feed the existing runtime landmarks, and `Place` should continue to expose runtime positions to NPCs.

### `src/settlement/livestock.ts`

Livestock is already deterministic and house-anchored: it rolls ownership/count/species per home and spawns around the corresponding house. Keep this mechanism. The migration should make the source of `homes` come from planned house/building locations rather than letting livestock invent another placement model.

Do not put `AnimalAgent` instances into `VillagePlan`.

### `src/settlement/SettlementsManager.ts`

This is the runtime/streaming side of settlements. It currently has its own `SettlementDef` cache and calls `generateSettlementDef()` directly, then waits for the required terrain chunks before creating settlement runtime objects.

Do not move runtime streaming concerns into `VillagePlan`. The plan should be deterministic/pure generation data; `SettlementsManager` should resolve the plan and instantiate/update the world.

A recent bug fix also established an important sequencing rule: settlement props that depend on terrain height must not be built before the relevant chunks have been loaded/available. Preserve that behavior during the refactor.

---

## 3. Target architecture

The desired architecture is:

```text
                    ┌──────────────────────┐
                    │ deterministic input  │
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
                    │ zones / plots       │
                    │ buildings            │
                    │ landmarks            │
                    │ local paths          │
                    │ entrances            │
                    └───────┬───────┬──────┘
                            ↓       ↓
                 ┌─────────────┐ ┌──────────────┐
                 │ terrain     │ │ settlement   │
                 │ modifiers   │ │ runtime      │
                 └─────────────┘ └──────────────┘
                                      ↓
                               Place / landmarks /
                               livestock / NPCs

                 VillagePlan.entrances
                           ↓
                     RoadNetwork
                           ↓
                 entrance ↔ entrance
                 between settlements
```

The exact TypeScript shape can evolve during implementation, but the ownership boundaries are not optional.

### Recommended ownership

- **VillageIdentity:** why this settlement is this settlement — stable generation context, not live runtime state.
- **VillagePlan:** the complete local spatial plan for one settlement.
- **Terrain helpers:** answer terrain/resource questions; do not own settlement layout state.
- **RoadNetwork:** chooses/routes global inter-settlement connections and consumes entrances; it does not own entrance presentation.
- **Families/NPC generation:** generate inhabitants from the plan's settlement context; do not independently decide physical layout.
- **Settlement runtime:** instantiate/despawn/update objects from the plan.
- **Worker terrain pipeline:** receive only worker-safe numeric plan derivatives such as corridor/clearing/smoothing segments.

---

## 4. `VillagePlan` should be data-first and authoritative

Avoid putting Three.js objects, meshes, scene nodes, `NpcAgent`, `AnimalAgent`, or runtime references into `VillagePlan`.

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
  boundary: VillageBoundary
  zones: VillageZone[]
  plots: VillagePlot[]
  buildings: VillageBuildingPlan[]
  landmarks: VillageLandmarkPlan[]
  paths: VillagePathPlan[]
  entrances: VillageEntrance[]
}
```

This is illustrative, not a requirement to copy the exact shape.

The important properties are:

1. one plan is the source of truth for local layout;
2. all local spatial decisions can be derived from it;
3. downstream systems do not rerun placement logic to discover where things belong;
4. all fields are plain deterministic data;
5. global roads are represented by the separate `RoadNetwork`, not by `VillagePlan`.

### Explicit mapping from the current `SettlementDef`

During migration, make ownership explicit rather than allowing `SettlementDef` and `VillageIdentity` to silently duplicate each other.

A practical target mapping is:

| Current data | Target owner | Migration note |
|---|---|---|
| `id`, `gx`, `gz` | `VillageIdentity` / plan identity | Preserve stable settlement identity and streaming key. |
| `x`, `z`, `y` | `VillagePlan.site` | Site selection remains deterministic and terrain-aware. |
| `size` | `VillageIdentity.size` | Single authoritative size value. |
| `terrain` | `VillageIdentity` context | Keep as generation context; do not create another terrain-layout cache. |
| `dominantResource` | `VillageIdentity` context | Preserve resource-driven generation. |
| `foodSourceType` | identity/plan context as appropriate | Keep one authoritative value; runtime/UI may consume it. |
| `name`, `nameCulture` | identity/context | Preserve deterministic naming; do not duplicate authoritative values. |
| `families` | family-generation/runtime domain | Family generation remains separate; plan supplies stable settlement context. |
| `clearings` | `VillagePlan` terrain/layout data | Migrate clearing information into plan-derived terrain modifiers. |
| `isHome` | identity/runtime context | Preserve home-settlement semantics; it is not a second layout system. |

The final implementation may choose a slightly different split, but there must be one clear owner for every authoritative value. Avoid keeping a fully duplicated `SettlementDef` + `VillageIdentity` forever.

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

Use the repository's existing seeded-random conventions (`createSeededRandom`, `cellSeed`, family seed derivation, etc.) instead of `Math.random()`.

When adding new plan fields, derive them from stable settlement-specific seeds. Do not use iteration order over unrelated runtime collections as a seed source.

Resource generation remains a world-level deterministic layer. The settlement planner samples that existing resource field; it must not create a second resource field for the village.

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
- landmark/infrastructure rules,
- livestock behavior where appropriate,
- any UI/config/type guards,
- tests or deterministic snapshots.

Do not introduce `XS`.

The exact XL numeric ranges should follow the main plan and current balancing conventions rather than being duplicated in multiple modules. Prefer one configuration/table as the source of truth.

---

## 7. Existing resource-driven behavior must survive

Plan 032 established resource-aware village generation. The current generator already samples world resources before site selection, lets resource attraction influence the site, derives a dominant resource near the final site, uses it for resource-aware naming/family roles, and can turn exceptional mountain/resource combinations into an `OUTPOST`.

047 should preserve this behavior while moving the decisions into the new planning pipeline.

Do not reduce resource information to a cosmetic label. It is input to the village identity/plan and may influence:

- village size,
- dedicated family/role,
- food/source infrastructure,
- appropriate plots/zones,
- local paths/access to the relevant resource.

Future resource/economy systems should be able to consume the plan rather than reverse-engineering why a village was generated.

---

## 8. Zones, plots and buildings

The key architectural improvement is to stop treating `clearings + houses + props` as one implicit layout operation.

The plan should make the major physical structure explicit, approximately:

```text
VillagePlan
 ├─ site / boundary
 ├─ zones
 │   ├─ residential
 │   ├─ central/public
 │   ├─ work/resource
 │   ├─ food/source
 │   └─ livestock where applicable
 ├─ plots
 │   ├─ house plots
 │   ├─ work plots
 │   └─ infrastructure plots
 ├─ buildings
 ├─ landmarks
 ├─ local paths
 └─ entrances
```

The exact zone taxonomy should remain minimal in v1. Do not create an elaborate zoning simulation system.

A house should have a planned location/plot, rather than each renderer/livestock/NPC system independently deciding where it belongs.

---

## 9. Landmarks, `Place`, minor locations and livestock

These existing systems are migration seams, not systems to replace.

### Settlement landmarks

`SettlementLandmarks` is a runtime structure containing actual `THREE.Vector3` positions and runtime objects. `VillagePlan.landmarks` should therefore be a plain-data planning representation, not another runtime landmark type that duplicates `SettlementLandmarks` semantics.

Preferred direction:

```text
VillagePlan
  → planned landmarks / building locations
      → settlement runtime
          → SettlementLandmarks
          → Place queries
```

Existing landmarks such as well, garden, stockpile, market, homes, trees, campfire and dock should be represented once at the planning level and instantiated once at runtime.

### `Place`

Do not introduce `VillagePlanPlace` or another NPC-location abstraction. `Place` remains the runtime-facing abstraction. `workplaceFor()` should continue deriving role-specific workplaces from the instantiated `SettlementLandmarks` until/unless the plan itself becomes the direct source for future non-runtime queries.

### `minorLocations`

The current dock calculation is deterministic and analytic. Migrate its **decision and location data** into the village planning pipeline where the dock is appropriate. Keep the existing runtime dock/route consumers during migration, but eliminate a second independent dock-placement decision once the plan owns it.

The dock's local route is a **village path**, not an inter-settlement road.

### Livestock

Keep `spawnLivestock()` deterministic and house-anchored. Its input should ultimately come from planned house/farm/animal-area data. Do not create a separate livestock placement generator or put live `AnimalAgent` objects into the plan.

For v1, the planner does not need a sophisticated pasture simulation. It only needs to provide stable planned locations/areas sufficient for the existing deterministic livestock behavior.

---

## 10. Entrances and local/global road ownership

This is a hard architectural boundary.

### `VillagePlan` owns local entrances

A village plan should expose one or more **semantic entrances/exits**. An entrance is a logical point where the settlement connects to the outside road network, not necessarily a physical gate.

Conceptually:

```ts
type VillageEntrance = {
  x: number
  z: number
  angle: number
  visual: 'gate' | 'sign' | 'none'
}
```

The exact TypeScript contract may differ. The important properties are:

- plain numeric/world-space data,
- stable deterministic position/orientation,
- semantic meaning independent of presentation,
- visual representation selected by settlement/runtime rules.

Examples:

```text
OUTPOST / tiny settlement → visual: none or sign
small/medium village      → sign or gate
large village             → gate
```

Do not force every entrance to have a physical gate.

### `RoadNetwork` owns inter-settlement roads

Roads connecting two settlements do **not** belong to `VillagePlan`.

The global boundary is:

```text
VillagePlan
  └─ entrances

RoadNetwork
  ├─ chooses/uses village connections
  ├─ resolves entrance → entrance endpoints
  ├─ routes through world terrain
  └─ produces inter-settlement road segments
```

The route endpoint must be the selected entrance of each settlement, not the settlement center:

```text
entrance A → route → entrance B
```

not:

```text
center A → route → center B
```

`RoadNetwork` must not inspect `entrance.visual`. A gate, sign, or no visual object is irrelevant to routing.

The existing midpoint signpost system in `SettlementsManager` is runtime presentation and should remain outside `VillagePlan`; it may consume the global road/connection data.

### Local paths

`VillagePlan.paths` means paths **inside one settlement**: homes ↔ workplaces, homes ↔ shared infrastructure, center ↔ important local zones, dock ↔ settlement, etc.

Do not put global road segments into `VillagePlan.paths`.

The current `roadNetwork.ts` helpers that route from a settlement to a `minorLocation` are a migration seam: those local routes should become plan-owned local paths, while the A* implementation remains reusable.

---

## 11. Terrain integration and worker boundary

The current code already has clearing/smoothing and road-corridor concepts, and the terrain pipeline receives worker-safe numeric data such as `RoadCorridorSegment`, `ClearingSegment`, and `RegionalSmoothingSegment`.

Preserve this boundary.

Desired direction:

```text
VillagePlan boundary/zones/buildings/paths/entrances
              ↓
plain numeric terrain modifiers
              ↓
chunk heightmap / terrain rendering
```

Avoid the reverse dependency where terrain generation has to reconstruct village layout by rerunning settlement logic.

Do not introduce imports of `VillagePlan`, Three.js objects, `Settlement`, `Place`, `NpcAgent`, or other main-thread runtime objects into terrain workers.

The plan may be rich on the main thread, but worker-facing derivatives must remain plain numeric data.

---

## 12. NPC/family integration

Families are currently generated independently using `VillageSize`, home-settlement rules, and resource roles.

After the refactor, `VillagePlan` should provide the stable settlement context needed by family generation, but family generation should remain a separate concern.

Keep these layers separate:

```text
VillagePlan
    ↓
FamilyDef[]
    ↓
NpcAgent runtime instances
```

Do not put `NpcAgent` instances into the plan.

Do not make the planner aware of live NPC state.

The home settlement's reserved families must continue to work exactly as today.

---

## 13. Streaming/runtime integration

`VillagePlan` generation should be deterministic and cheap enough to resolve before visual instantiation.

`SettlementsManager` should:

1. resolve/generate the authoritative plan,
2. wait for required terrain chunks when actual world-space placement requires rendered terrain data,
3. instantiate settlement content from the plan,
4. dispose/unload runtime objects according to existing streaming rules.

Do not make `VillagePlan` responsible for waiting on chunks or scene lifecycle.

The current `SettlementsManager` has a local `SettlementDef` cache because streaming repeatedly asks for definitions. During migration, replace this with access to the authoritative plan source rather than adding a third cache. Likewise, the `roadNetwork` definition cache should not remain a second authoritative copy of settlement generation.

Preserve the existing fix for props/lights/vegetation being positioned against terrain before the settlement's chunks are ready.

---

## 14. Migration strategy

Prefer incremental migration over a flag-day rewrite.

Recommended order:

### Step 1 — model and ownership

Introduce/adjust the core data types:

- `VillageIdentity`,
- `VillagePlan`,
- zone/plot/building/landmark/path/entrance plan types as needed,
- `VillageSize` with `XL`.

Keep them free of Three.js/runtime references.

Before adding new caches, identify and consolidate the existing `SettlementDef` caches in `SettlementsManager`, `roadNetwork`, and `minorLocations` so they cannot become competing sources of truth.

### Step 2 — centralize generation

Refactor `settlementGenerator.ts` so the main settlement-generation entry point produces the authoritative `VillagePlan`, or produces the existing `SettlementDef` only through a temporary compatibility adapter.

Do not maintain two independent layout algorithms.

Explicitly map existing `SettlementDef` fields into identity, plan, family/runtime context, and compatibility data.

### Step 3 — migrate local layout

Move clearing/site/layout decisions into the plan:

- boundary,
- zones,
- plots,
- buildings,
- landmarks,
- local paths,
- entrances.

Keep the plan as the single source of truth for these decisions.

### Step 4 — migrate terrain

Make clearing/smoothing/terrain modifiers derive from the plan rather than recomputing village placement independently. Produce worker-safe numeric derivatives before crossing into the terrain worker pipeline.

### Step 5 — migrate local paths/minor locations

Use existing route computation to build plan-owned local paths, including paths to docks where appropriate. Preserve `minorLocations` and runtime APIs as compatibility seams until their placement decisions are fully sourced from the plan.

### Step 6 — migrate global roads

Keep `RoadNetwork` as the global connection/routing system. Change its endpoints from settlement centers to semantic `VillagePlan.entrances`. It must not depend on entrance visuals.

Do not move inter-settlement roads into `VillagePlan`.

### Step 7 — migrate buildings/props/runtime landmarks

Make house/prop placement consume planned plots/buildings/landmarks. Instantiate the existing `SettlementLandmarks` runtime structure from plan data. Remove duplicated placement calculations where practical.

### Step 8 — migrate NPC/families/livestock

Pass planned identity/size/resource context into existing family generation. Feed planned home/farm/animal-area locations into existing deterministic livestock spawning. Keep `Place` as the runtime-facing NPC abstraction.

### Step 9 — migrate `SettlementsManager`

Make `SettlementsManager` consume the authoritative plan source for streaming and instantiation. Remove its independent layout-generation path.

### Step 10 — remove obsolete paths

Once all consumers use the new plan, remove compatibility code and old duplicated layout calculations/caches. There should be one local village planner/source of truth.

---

## 15. Compatibility guardrails

During implementation, explicitly verify these existing behaviors:

- home settlement remains valid,
- reserved Anna/Piotr and Kasia/Marek families remain present,
- OUTPOST remains one-house/one-resident,
- significant resources still influence settlement generation,
- settlement names/cultures remain deterministic,
- village clearing/smoothing still matches rendered terrain,
- global roads remain deterministic and symmetric,
- inter-settlement routes use entrance-to-entrance endpoints rather than centers,
- `RoadNetwork` does not depend on entrance visual type,
- open water remains unrouteable unless a future bridge system changes that rule,
- mountain routing behavior remains intact,
- minor-location/dock paths still work,
- existing `SettlementLandmarks` and `Place` consumers continue to function,
- livestock remains deterministic and anchored to the planned homes/animal areas,
- settlement props do not float due to sampling terrain before chunks are ready,
- chunk streaming still unloads settlement runtime objects correctly,
- the same seed produces the same village plan/layout,
- no second authoritative village-layout/cache system remains active.

---

## 16. What NOT to include in 047

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
- player building/housing,
- a second global road/settlement-network abstraction inside `VillagePlan`,
- a separate livestock/Place/landmark runtime system parallel to the existing ones.

Those can consume `VillagePlan` later. They should not make v1 of the architecture unnecessarily large.

---

## 17. Verification checklist

After implementation, verify at minimum:

- multiple seeds produce visibly different but coherent village layouts,
- SM/MD/LG/XL have clearly different footprints/capacity,
- OUTPOST still behaves as the special minimal settlement,
- village buildings remain on valid terrain,
- local paths connect the intended locations,
- village entrances are stable, deterministic, and semantically meaningful,
- inter-settlement roads connect entrance-to-entrance rather than center-to-center,
- entrance visual type has no effect on `RoadNetwork` routing,
- resource-specific settlements retain their intended role/source behavior,
- docks/minor locations remain correct,
- existing `SettlementLandmarks` and `Place` behavior remains intact,
- livestock remains deterministic and tied to planned houses/areas,
- non-home settlements still stream correctly,
- home settlement still supports existing quests/dialogues,
- no duplicated village-layout algorithm or authoritative cache remains,
- worker terrain code receives only worker-safe numeric derivatives,
- changing the seed changes the plan deterministically rather than introducing runtime randomness,
- TypeScript/build/tests pass.

If a design conflict appears between this document and the main plan, prefer the main plan and update these notes before proceeding with implementation.
