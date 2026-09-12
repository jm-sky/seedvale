# Implementation Notes: Systemic animal attraction — food, blood and trap lures

**Plan:** `fauna-023-systemic-animal-attraction-food-blood-and-trap-lures.md`  
**Reviewed against:** `main` 2026-09-12

## Current ownership and integration seams

### Trap attraction

- `src/world/animalTraps.ts`
  - owns `TrapDef`, `TRAP_DEFS`, `isSpeciesTrappable()` and current `TrapLureDescriptor`;
  - `TRAP_DEFS.simple.lureRadius = 6`, `TRAP_DEFS.good.lureRadius = 8`;
  - keep trigger/detection/capture semantics here; generalized attraction must not move capture logic into fauna;
  - `bear` is intentionally absent from both trap species sets and must remain so in this plan.
- `src/world/createPlacedTraps.ts`
  - owns live placed-trap entries and exposes `activeLures()` from authoritative `state === 'active' && baitKind != null` state;
  - bait persistence stays in `PlacedTrapRecord.baitKind`.
- `src/fauna/AnimalAgent.ts`
  - current `resolveLureTarget()` is pure, deterministic and allocation-free;
  - filters trap candidates by `isSpeciesTrappable()`, `dietAcceptsItem()` and `TRAP_DEFS[kind].lureRadius`;
  - this is the resolver shape to generalize rather than adding sibling `resolveDroppedFoodTarget()` / `resolveBloodTarget()` scans.
- `src/app/gameLoop.ts`
  - currently calls `bundle.placedTraps.activeLures()` once per fauna pass and forwards the same snapshot through `createFauna` into all animal updates;
  - preserve this once-per-pass snapshot pattern.

### Species compatibility / diet

- `src/fauna/animalDefs.ts`
  - `AnimalDef.diet` is the existing item-edibility authority;
  - `dietAcceptsItem(diet, itemKind)` is already used by trap attraction;
  - `MEAT_DIET` currently includes `raw_meat`, `deer_meat`, `wolf_meat`, `boar_meat`, `rabbit_meat`, `beef`;
  - wolf and fox carry `MEAT_DIET` even though predator hunger uses the carcass branch first; for them the live item-diet consumer today is mainly trap attraction;
  - current bear is `role: 'predator'` with neither `diet` nor `scavenging`.
- Do not add a second bait/food species matrix.

### Bear decision resolved by this plan

Use the existing contracts rather than a bear-specific runtime branch:

1. Add `BEAR_DIET: AnimalDietConfig` and assign it to `ANIMAL_DEFS.bear.diet`.
2. Compose its meat entries from the existing `MEAT_DIET.items` authority where practical, then add existing food `ItemKind`s: `fish`, `berries`, `apple`, `nuts`, `honey`.
3. Do **not** give bear `grass`; it must not enter the `GrassForagePatch` herbivore path.
4. Keep predator hunger dispatch unchanged: `findFoodTarget()` still sends bear to the carcass branch. The new diet is for item compatibility/relief in dropped-food attraction, not a second predator foraging system.
5. Extend `ScavengingConfig` minimally so `rottingValue` and `bonesValue` can be independently absent. Bear gets rotting only; wolf keeps rotting+bones; fox remains fresh-only.
6. Use `role === 'predator'` as V1 blood compatibility. This correctly includes wolf/fox/bear and excludes dog despite dog's meat diet. Only add a separate blood capability later if a real species contradicts this semantic.
7. Trap bait remains additionally gated by `isSpeciesTrappable()`, so bear ignores bait inside current `simple`/`good` traps even when the bait item is in `BEAR_DIET`.

### Scavenging contract

`src/fauna/animalForaging.ts` currently defines the semantics:

- `fresh` corpse → value `1` for every predator, independent of `scavenging`;
- `rotting`/`bones` → require `scavenging` and hunger thresholds;
- `carcassFoodValue()` is the single phase-value gate used by selection and completion-time validation.

The current `ScavengingConfig` shape requires both values. Change it to optional per-phase values rather than introducing a second bear carrion config. `carcassFoodValue()` must return `null` when the field for the current phase is absent.

Target semantics:

```text
wolf → fresh + rotting + bones
fox  → fresh only
bear → fresh + rotting, no bones
```

Keep bear's rotting value below fresh value `1`; exact tuning is not architecture.

### Needs / food consumption

- `src/fauna/animalForaging.ts`
  - owns food/water target selection, validation and atomic relief;
  - `dietItemReliefScale()` and `consumeFood()` are existing relief semantics to reuse;
  - current `SourceTargetKind` covers `water | forage | carcass | feed | grassPatch` but not a world dropped-item source;
  - carcass selection/claim/consumption is already coherent and must not be duplicated by the attraction layer.
- `AnimalAgent` still owns movement/intent/timers around source pursuit. Generalized attraction should feed that existing movement path rather than creating world-owned steering.

### Dropped items

- `src/items/createDroppedItems.ts`
  - authoritative `DroppedItem`: `{ id, kind, x, z, instance?, foodBatch? }`;
  - `nodes()` exposes current records;
  - `collect(id)` removes the record/mesh and fires runtime `onCollected` when present;
  - `disposeNode()` is currently internal and already centralizes record + mesh + falling/callback cleanup;
  - `reconcilePerishableLifecycle(nowDays)` removes decomposed dropped food and deliberately does **not** fire `onCollected`.
- Recommended implementation seam: expose a second atomic removal path for world consumption that reuses `disposeNode()` but does not call `onCollected`.
- Avoid implementing animal consumption by calling `collect()`: that path semantically represents pickup and may reset producer state through callbacks.

### Food freshness

- `src/items/foodFreshness.ts`
  - use `getFoodBatchFreshnessStage()` for stage-based attraction tuning;
  - use existing effective-age/decomposition state only; no scent timer;
  - `WORLD_SPOILED_FOOD_DECAY_DAYS` already determines how long spoiled dropped food remains physically present.
- `src/items/itemCatalog.ts`
  - use existing `food.bait === 'meat'` metadata to classify spoiled meat; do not add another meat list.
- V1 compatibility:
  - fresh → compatible if `dietAcceptsItem()`;
  - medium → compatible if `dietAcceptsItem()`, lower strength;
  - spoiled meat → compatible only when species has matching diet **and** a scavenging capability;
  - spoiled plant food → excluded in V1;
  - decomposed → no record, therefore no source.

This gives a meaningful wolf/fox/bear distinction without a new spoiled-food capability: wolf/bear can investigate spoiled meat; fox cannot.

### Blood traces

- `src/world/bloodTraces.ts`
  - authoritative state is `BloodTraceWorldState.traces`;
  - each trace already has stable session `id`, `x/z`, `size`, `createdAtDays`, `lifetimeDays`;
  - `bloodTraceRemainingFraction(trace, seed, elapsedDays)` is the correct freshness signal and already incorporates rain through `computeRainExposureDays()`;
  - `BLOOD_GLOBAL_CAP = 200`, local cluster cap = 6;
  - traces are not SaveData-persisted and this plan must not change that.
- Do not create a parallel blood-scent object/timer. Build attraction descriptors from the live trace records.

## Recommended module split

Prefer a two-layer split.

### Neutral source DTO

A small non-agent module, likely under `src/world/` or another existing neutral/shared location, defines only the plain-data descriptor and source-kind semantics.

```ts
export type AnimalAttractionSource = {
  id: string
  kind: 'food' | 'blood' | 'trapBait'
  x: number
  z: number
  strength: number
  radius: number
  itemKind?: ItemKind
  trapKind?: TrapKind
}
```

Keep it free of `AnimalDef`, `AnimalAgent`, Three.js objects and mutable callbacks.

### Fauna resolver

Preferred new module: `src/fauna/animalAttraction.ts`.

Own here:

- source/species compatibility;
- scoring;
- deterministic tie-break;
- freshness-stage attraction eligibility;
- blood compatibility (`role === 'predator'` in V1);
- pure resolver tests.

Do not move animal-specific semantics into `DroppedItems` or `bloodTraces`, and do not introduce a mutable global `AttractionManager`.

## Snapshot assembly

Preserve the current fauna-014 performance shape:

```text
PlacedTraps authoritative state
DroppedItems authoritative state
BloodTraceWorldState authoritative state
        ↓
small read-only attraction snapshot once per fauna pass
        ↓
createFauna / AnimalAgent.update
        ↓
pure resolver per animal
```

Do not let each animal independently call all three world systems. Avoid `.map()`/`.filter()` allocation chains in the fauna hot path; use a reusable scratch array if needed.

## Scoring

Keep one transparent deterministic scoring function, e.g. effective strength minus/with bounded distance falloff.

Hard requirements:

- source outside its radius is invalid;
- source strength is monotonic;
- tie-break on stable `source.id`;
- no `Math.random()` in target choice;
- trap compatibility is an explicit additional gate;
- diet compatibility remains the item gate;
- do not infer blood sensing from `detectRange`.

## Dropped-food consume path

Recommended `createDroppedItems.ts` seam:

- reuse internal `disposeNode(id)`;
- add `consume(id)` or equivalent reasoned-remove API;
- return removed `DroppedItem` / needed food metadata;
- do not invoke `onCollected`;
- preserve decomposition-deadline cache invariants.

Completion contract:

```text
re-read exact source id
→ validate live item + diet/freshness compatibility
→ atomically remove
→ only after success apply existing consumeFood() relief
```

No claim system is needed unless tests prove atomic first-wins insufficient.

## Blood investigation memory

Blood is non-consumable and therefore needs a bounded transient completion state.

Use small per-`AnimalAgent` recent-source memory:

- id → ignore-until;
- opportunistic expiry cleanup;
- hard cap;
- runtime only, never persisted.

On reaching blood: briefly investigate/linger using existing timing where possible, mark id ignored, clear target, allow another source to win next resolution.

Trap evasion already has its own trap/animal cooldown; reuse/expose that eligibility rather than adding a second generic trap cooldown.

## Interaction with existing foraging

Do not rewrite carcass behavior.

For dropped food, prefer adding a dropped-item `SourceTarget` arm only if it genuinely reuses existing pursuit/action timing without forcing blood/trap into the food state machine. Otherwise keep attraction movement in the generalized lure-style path and share only consumption primitives.

The invariant is one movement owner.

For bear specifically:

- do not route `role: 'predator'` through `findDietTarget()` after adding `BEAR_DIET`;
- fresh/rotting carcasses remain under existing claim/consume lifecycle;
- loose food uses attraction + atomic dropped-item consume;
- blood uses investigation, not food consumption;
- trap bait is rejected before movement by trap compatibility.

## Likely files

Primary implementation surface:

- `src/fauna/AnimalAgent.ts`
- `src/fauna/animalDefs.ts`
- `src/fauna/animalForaging.ts` — narrow optional scavenging fields + phase checks only, no rewrite
- new `src/fauna/animalAttraction.ts` (recommended)
- `src/fauna/createFauna.ts`
- `src/world/animalTraps.ts`
- `src/world/createPlacedTraps.ts`
- `src/world/bloodTraces.ts`
- `src/items/createDroppedItems.ts`
- `src/items/foodFreshness.ts` (reuse)
- `src/items/itemCatalog.ts` (reuse meat metadata; likely no semantic change)
- `src/app/gameLoop.ts`
- `src/app/worldBundle.ts` only if a narrow read-only adapter is genuinely needed

Tests likely adjacent to:

- existing `src/fauna/trapLure.test.ts` — migrate/replace with generalized attraction tests;
- `src/fauna/foodWaterTargeting.test.ts` — scavenging phase regression and bear/wolf/fox distinctions;
- `src/items/createDroppedItems.test.ts` — atomic world-consume semantics;
- `src/world/createPlacedTraps.test.ts` — trap source regression.

## Required bear-focused tests

At minimum cover:

- bear diet accepts raw meat, fish, berries, apple, nuts, honey;
- bear diet has no grass;
- bear accepts fresh/rotting carcass but not bones;
- wolf behavior remains fresh/rotting/bones;
- fox remains fresh-only for carcasses;
- bear selects compatible dropped meat and plant food;
- bear and wolf may select spoiled meat, fox may not;
- bear/wolf/fox react to blood; dog does not;
- bear rejects baited simple/good trap because `isSpeciesTrappable()` fails;
- adding bear diet does not move predator hunger into the herbivore/diet search branch.

## Avoid

- separate `DroppedFoodLureManager` / `BloodScentManager`;
- duplicating `AnimalDef.diet` in attraction config;
- `kind === 'bear'`/`wolf`/`fox` resolver branches;
- a new omnivore enum/model;
- another meat item list;
- expanding trap coverage to bear;
- routing bear to grass forage;
- world systems calling `AnimalAgent.steerToward()`;
- per-frame `animals × all world sources` construction;
- persisted attraction target or scent map;
- worker offload;
- camera/player-distance ownership of attraction;
- rewriting carcass lifecycle;
- broadening boar diet in this plan.

## Implementation order

1. Update species contracts first: optional per-phase scavenging + `BEAR_DIET`; lock behavior with pure tests.
2. Introduce neutral attraction DTO + pure fauna resolver and migrate trap lure tests/behavior without changing capture semantics.
3. Expose dropped-food candidates and atomic non-pickup consume path; wire approach → revalidate → consume → relief.
4. Adapt blood traces into attraction candidates using existing remaining fraction; add bounded investigated memory.
5. Consolidate once-per-fauna-pass snapshot assembly and remove obsolete `TrapLureDescriptor`/`activeLures` naming where fully superseded.
6. Add debug info and regression tests.
7. Update `docs/state/fauna.md` and player-systems docs after code is final.

Important architectural/public functions and types should receive concise JSDoc and `@domain fauna`/appropriate domain tags where useful for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
