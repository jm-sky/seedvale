# Implementation Notes: Systemic animal attraction — food, blood and trap lures

**Plan:** `fauna-023-systemic-animal-attraction-food-blood-and-trap-lures.md`  
**Reviewed against:** `main` 2026-09-12

## Current ownership and integration seams

### Trap attraction

- `src/world/animalTraps.ts`
  - owns `TrapDef`, `TRAP_DEFS`, `isSpeciesTrappable()` and current `TrapLureDescriptor`;
  - `TRAP_DEFS.simple.lureRadius = 6`, `TRAP_DEFS.good.lureRadius = 8`;
  - keep trigger/detection/capture semantics here; generalized attraction must not move capture logic into fauna.
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
  - wolf and fox carry `MEAT_DIET` even though predator hunger uses the carcass branch first; for them the live item-diet consumer today is mainly trap attraction.
- Do not add a second bait/food species matrix.
- Bear currently has neither `diet` nor `scavenging`. Do not silently special-case it into this feature.

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
- Avoid implementing animal consumption by calling `collect()`: that path semantically represents pickup and may reset producer state through callbacks (e.g. chicken egg lifecycle).

### Food freshness

- `src/items/foodFreshness.ts`
  - use `getFoodBatchFreshnessStage()` for stage-based attraction tuning;
  - use existing effective-age/decomposition state only; no scent timer;
  - `WORLD_SPOILED_FOOD_DECAY_DAYS` already determines how long spoiled dropped food remains physically present.
- Attraction strength should be derived at snapshot/query time, not persisted into `DroppedItem`.

### Blood traces

- `src/world/bloodTraces.ts`
  - authoritative state is `BloodTraceWorldState.traces`;
  - each trace already has stable session `id`, `x/z`, `size`, `createdAtDays`, `lifetimeDays`;
  - `bloodTraceRemainingFraction(trace, seed, elapsedDays)` is the correct freshness signal and already incorporates rain through `computeRainExposureDays()`;
  - `BLOOD_GLOBAL_CAP = 200`, local cluster cap = 6;
  - traces are not SaveData-persisted and this plan must not change that.
- Do not create a parallel blood-scent object/timer. Build attraction descriptors from the live trace records.

## Recommended module split

Prefer a two-layer split:

### Neutral source DTO

A small non-agent module, likely under `src/world/` or another existing neutral/shared location, defines only the plain-data descriptor and source-kind semantics.

Example shape:

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

A fauna-owned module (preferred: `src/fauna/animalAttraction.ts`) owns:

- source/species compatibility;
- scoring;
- deterministic tie-break;
- blood capability decision;
- pure resolver tests.

This avoids moving animal-specific semantics into `DroppedItems`/`bloodTraces` while also avoiding a God `AttractionManager`.

## Snapshot assembly

Current trap lures are produced once per fauna pass. Keep that behavior.

Preferred flow:

```text
PlacedTraps authoritative state
DroppedItems authoritative state
BloodTraceWorldState authoritative state
        ↓
small read-only attraction snapshot
        ↓
createFauna / AnimalAgent.update
        ↓
pure resolver per animal
```

Do not let each animal independently call all three world systems.

When implementing, inspect the exact `WorldBundle` public fields and `createFauna.update(...)` signature before choosing where snapshot assembly lives. The assembly site should own **no new state**; it only adapts already-authoritative records.

Use a reusable scratch array if the snapshot is rebuilt frequently enough to matter. Avoid `.map()`/`.filter()` chains in the fauna hot path; the current lure resolver was explicitly written allocation-free.

## Scoring

Keep one transparent scoring function.

A practical form is:

```text
score = effectiveStrength * weight - distance
```

or normalized distance falloff inside the source radius. Do not use random rolls for candidate choice.

Requirements that matter more than the exact formula:

- source outside radius is invalid;
- source strength is monotonic;
- tie-break on `source.id` for deterministic ordering;
- trap compatibility remains an explicit additional gate;
- diet compatibility remains the gate for item-based food/trap sources.

Do not infer blood attraction from `detectRange`; that field is predator/prey visual target detection and has different semantics.

## Blood compatibility

Current clean signals are insufficient to represent every future species perfectly:

- `role === 'predator'` would include bear, which currently has no meat diet/scavenging config;
- `scavenging` currently exists only on wolf and means corpse-phase fallback, not generic smell;
- `diet.items` cleanly identifies wolf/fox meat interest but is item-based, not explicitly blood-based.

Safest V1 options, in order:

1. derive blood capability from an existing unambiguous config combination if implementation recon confirms it remains semantically correct;
2. otherwise add one small declarative optional field/capability to `AnimalDef` rather than species-name branches.

Do not use `kind === 'wolf' || kind === 'fox'` inside runtime resolver.

## Dropped-food consume path

Recommended change in `createDroppedItems.ts`:

- reuse internal `disposeNode(id)`;
- add `consume(id)` (or equivalent reasoned-remove API);
- return the removed `DroppedItem`/needed food metadata;
- do not invoke `onCollected`;
- recompute any cached decomposition deadline if consuming the current earliest-expiry item can make `nextDecomposeAt` stale enough to matter. Current cache is safe when stale-low (extra reconciliation pass), but implementation should preserve its invariants deliberately.

At consume completion:

1. re-read exact source id;
2. validate item still exists and diet relief still resolves;
3. atomically remove it;
4. only after successful removal call existing `consumeFood(life, relief)`.

No claim object is required unless actual tests show repeated contested targets create unacceptable behavior. Atomic removal already prevents double relief.

## Freshness tuning seam

`FoodBatch` may be absent for some edible non-perishable item kinds. Do not require a batch for attraction.

For perishable dropped food with a batch, stage can be read using `getFoodBatchFreshnessStage()`.

Keep tuning constants near the attraction resolver/source adapter rather than changing core freshness semantics.

Recommended initial policy pending user confirmation:

- fresh: 1.0;
- medium: lower than 1.0;
- spoiled meat: still attractive to meat-oriented predators/scavengers;
- decomposed: impossible because the world record should already be gone.

Do not conflate attraction with safe hunger relief. Animal food-safety/disease is explicitly outside this plan.

## Blood investigation memory

A non-consumable source needs a completion state or it will be selected forever.

Implement a small per-`AnimalAgent` transient structure keyed by attraction source id. Preferred properties:

- store only recently investigated ids;
- expiry in simulation seconds or world time, whichever fits the existing agent timer conventions at the call site;
- cleanup opportunistically during lookup/insert;
- hard cap the number of remembered ids (small ring/map) to guarantee bounded memory.

Do not persist this state.

When the animal reaches a blood source:

- briefly hold/investigate using existing action/intent timing if possible;
- mark that source ignored;
- clear current attraction target;
- next resolution may select another nearby source.

The trail itself is never represented as an object.

## Interaction with trap evasion cooldown

`src/world/animalTraps.ts` already owns per-trap `animalId → expiry` detection cooldown after an animal detects/evades a trap.

During migration from `TrapLureDescriptor` to generic source:

- verify whether attraction currently keeps selecting an evaded active trap while its detection cooldown is active;
- if yes, expose/read the existing trap eligibility/cooldown rather than adding a second generic investigated cooldown for `trapBait`;
- blood investigation memory is a separate semantic because blood has no existing encounter cooldown.

## Interaction with existing foraging

Do not rewrite `animalForaging.ts` carcass behavior as part of the first implementation pass.

For dropped food there are two viable integration shapes:

1. attraction target owns approach, then commits via a small dropped-food consume adapter; or
2. add a dropped-item `SourceTarget` arm and let attraction selection feed it into existing source-target pursuit.

Prefer option 2 **only if** it reduces duplicate movement/action-timer logic without forcing trap/blood into `SourceTarget` (blood is not a food source and trap bait is not directly consumable). Otherwise keep generalized attraction as the current lure-style movement seam and share only consumption primitives.

The key invariant is one movement owner, not forcing every attraction kind into the same consumption state machine.

## Likely files

Primary implementation surface:

- `src/fauna/AnimalAgent.ts`
- `src/fauna/animalDefs.ts`
- new `src/fauna/animalAttraction.ts` (recommended)
- `src/fauna/createFauna.ts`
- `src/world/animalTraps.ts`
- `src/world/createPlacedTraps.ts`
- `src/world/bloodTraces.ts`
- `src/items/createDroppedItems.ts`
- `src/items/foodFreshness.ts` (reuse; likely no semantic change)
- `src/app/gameLoop.ts`
- `src/app/worldBundle.ts` only if a narrow read-only adapter is genuinely needed

Tests likely adjacent to:

- existing `src/fauna/trapLure.test.ts` — migrate/replace with generalized attraction tests rather than keeping two overlapping resolver suites;
- `src/items/createDroppedItems.test.ts` — atomic animal/world consume semantics;
- `src/world/createPlacedTraps.test.ts` — trap source regression;
- blood pure tests if strength adaptation is implemented outside an existing testable resolver.

## Avoid

- separate `DroppedFoodLureManager` / `BloodScentManager`;
- duplicating `AnimalDef.diet` in attraction config;
- world systems calling `AnimalAgent.steerToward()`;
- per-frame `animals × all world sources` construction;
- persisted attraction target or scent map;
- worker offload;
- camera/player-distance ownership of attraction;
- rewriting carcass lifecycle;
- silently broadening bear/boar diet.

## Implementation order

1. Introduce neutral attraction DTO + pure fauna resolver and migrate trap lure tests/behavior without changing gameplay.
2. Expose dropped-food candidates and atomic non-pickup consume path; wire approach → revalidate → consume → relief.
3. Adapt blood traces into attraction candidates using existing remaining fraction; add bounded investigated memory.
4. Consolidate once-per-fauna-pass snapshot assembly and remove obsolete `TrapLureDescriptor`/`activeLures` naming where fully superseded.
5. Add debug info and regression tests.
6. Update `docs/state/fauna.md` and player-systems docs to describe the generalized mechanism after code is final.

Important architectural/public functions and types should receive concise JSDoc and `@domain fauna`/appropriate domain tags where useful for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
