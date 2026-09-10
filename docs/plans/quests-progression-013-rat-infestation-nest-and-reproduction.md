# Plan: Rat infestation nest and reproduction

**Created:** 2026-09-09
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~quests-progression-006~~
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `rats` `infestation` `nest` `dogs`
**Roadmap:** -

## Goal

Extend the existing settlement rat infestation so it has a physical, persistent world cause that the player can address: an active rat nest placed behind a residential house.

The change must also make rat population recovery more systemic:

- food remains the basis of normal rat carrying capacity,
- damaged infested storage adds temporary infestation population pressure,
- an active infestation nest enables infestation replenishment,
- dogs physically hunt rats and reduce infestation replenishment by 10% per living dog,
- destroying the nest stops infestation replenishment,
- repairing storage removes the infestation carrying-capacity bonus,
- existing rats are not deleted merely because the population target falls.

The infestation remains settlement/world state. `QuestManager` observes that state and must not own the nest, rat population or infestation lifecycle.

## Current behaviour to replace/extend

Current `src/settlement/rats.ts` combines two different dog effects:

1. dogs physically pursue rats through existing fauna behaviour,
2. `RAT_DOG_SUPPRESSION` subtracts `dogCount * 1.5` from the normal rat population target.

The second effect is abstract and can cause population reconciliation to remove rats without an in-world cause. Remove dog suppression from the population target and express dog pressure through infestation replenishment instead.

Current storage infestation persistence is also narrower than the new world state: `src/settlement/storageInfestation.ts` stores only `'active' | 'repaired'`. Generalize this existing settlement-owned registry rather than adding a parallel nest or quest registry.

## 1. Generalize authoritative infestation state

Replace the storage-only condition with an infestation state capable of representing the independent world changes, conceptually:

```ts
type RatInfestationState = {
  storageDamaged: boolean
  nestDestroyed: boolean
}
```

Use the exact final shape that best fits the existing registry and serialization contract, but preserve these two independent facts.

Rename/generalize `StorageInfestationRegistry` and its public seams where necessary so the names no longer imply that storage damage is the whole infestation.

The registry remains:

- keyed by stable `settlementId`,
- owned by `SettlementsManager`,
- alive across settlement stream-out/in,
- carried across `WorldBundle` rebuild,
- persisted through the existing save/load infestation path.

Do not add `RatNestManager`, quest-owned state or another authoritative registry.

The existing authored V1 home-infestation trigger (`seedHomeStorageInfestation`) should seed the generalized infestation state with damaged storage and an intact nest when no persisted state exists. Rename the seam if appropriate to reflect the broader meaning.

## 2. Separate carrying capacity from replenishment

Keep normal rat population capacity food-driven.

Remove `dogCount * RAT_DOG_SUPPRESSION` from `ratNormalPopulationTarget()` and remove/replace `RAT_DOG_SUPPRESSION`.

Normal target continues to use the existing food-pressure constants and normal population cap.

While the infestation storage is damaged, retain the existing infestation pressure semantics:

```text
infestation target = max(normal target + 3, 7)
```

Once storage is repaired, remove that bonus/floor and return to normal food-driven carrying capacity.

The nest does not define carrying capacity. It controls the additional replenishment associated with the infestation.

## 3. Infestation replenishment

Extend the existing rat reconciliation in `src/settlement/rats.ts`; do not introduce a generic fauna reproduction framework for this plan.

When the infestation has an intact nest and the live population is below the applicable target, allow at most one infestation replenishment spawn per existing reconciliation opportunity.

At zero dogs, preserve today's effective recovery rate: the base infestation replenishment chance is `1.0` per eligible reconciliation opportunity.

This makes the new probability layer behaviour-preserving when there are no dogs rather than silently retuning the infestation.

Destroying the infestation nest disables this additional infestation replenishment completely.

Normal food-driven rat ecology must remain possible after the infestation is resolved. `nestDestroyed` must not become a permanent "rats can never reproduce in this settlement" flag. The nest represents the additional infestation source, not all rat ecology.

## 4. Dog reproduction pressure

Dogs no longer change rat carrying capacity.

For infestation replenishment use:

```ts
const RAT_DOG_REPRODUCTION_PRESSURE = 0.10
const RAT_MIN_REPRODUCTION_MULTIPLIER = 0.50

const multiplier = Math.max(
  RAT_MIN_REPRODUCTION_MULTIPLIER,
  1 - dogCount * RAT_DOG_REPRODUCTION_PRESSURE,
)
```

Expected values:

| Living dogs | Infestation replenishment multiplier |
| ---: | ---: |
| 0 | 1.00 |
| 1 | 0.90 |
| 2 | 0.80 |
| 3 | 0.70 |
| 4 | 0.60 |
| 5+ | 0.50 |

Apply this only to infestation replenishment, not to the normal rat population target.

Dogs retain their existing physical pest behaviour (`resolveDogPestTarget()` → chase → attack). Do not add quest-specific dog AI.

## 5. Deterministic replenishment roll

The new probability must not depend on `Math.random()`, FPS or observation by the player.

Derive the replenishment roll deterministically from stable simulation inputs such as:

- settlement/world seed,
- settlement identity,
- reconciliation/day bucket,
- a dedicated rat-infestation reproduction salt.

The same simulation state/bucket must produce the same result after reconstruction.

Continue to spawn at most one rat per eligible reconciliation opportunity so the change does not introduce population bursts.

## 6. Do not use target reconciliation to erase live rats

A falling target must not directly remove otherwise-live rats.

In particular, repairing storage may change the target from the infestation floor back to the normal food-driven target. The excess live rats must remain physical inhabitants until reduced through actual lifecycle mechanisms such as combat/predation and future systemic lifecycle behaviour.

Remove `despawnFarthest()` from its role as ecological population reduction when `alive > target`, or constrain it strictly to a technical lifecycle/streaming case if one is independently required by current code.

Do not replace it with another immediate population-deletion mechanism.

Future population pressure may support migration/emigration, but that is out of scope here.

## 7. Deterministic rat nest placement

An active authored infestation has one physical rat nest in the affected settlement.

Derive its location deterministically from the settlement's existing authoritative `VillagePlan` / `VillageBuildingPlan` data:

1. choose a residential building deterministically from stable settlement seed/id plus a dedicated nest-placement salt,
2. use its position, rotation and footprint,
3. derive a point behind the house with sufficient clearance from the footprint,
4. resolve terrain Y through the existing settlement terrain/height seam,
5. keep the result stable across save/load, stream-out/in and `WorldBundle` rebuild.

Do not persist a Three.js transform when the position can be reconstructed deterministically. Persist the authoritative destroyed/intact state instead.

If the first derived location is invalid because of terrain/water/collision constraints, use a deterministic bounded fallback over other eligible residential buildings/offsets. Do not use nondeterministic retry loops.

## 8. Nest world representation

Represent the nest through the existing settlement prop/interactable composition lifecycle rather than a standalone manager.

Add a small nest asset, expected path/name following current asset conventions (for example `rat_nest.glb`), depicting a ground burrow/nest with simple surrounding material such as dirt, straw, wood scraps or rubbish.

The prop must reflect authoritative state:

- intact state: visible/interactable,
- destroyed state: no active nest interaction; either omit the intact prop or render a cheap destroyed representation if that fits the existing prop lifecycle without adding duplicate state.

Asset/model presentation is not authoritative state.

## 9. Destroy-nest interaction

Reuse the existing contextual interaction and busy-action mechanisms.

Expose an action equivalent to:

```text
[E] Zniszcz gniazdo szczurów
```

Destroying the nest is a short physical busy action and commits `nestDestroyed = true` only on successful completion.

Require an equipped tool with the existing `soil_digging` `ItemCapability`. `ITEM_CATALOG[kind].capabilities` remains the source of truth; do not check `kind === 'shovel'` directly and do not create a quest-specific capability.

Use the existing action-blocking/cancellation/commit conventions so interrupted actions do not mutate authoritative state.

After commit, refresh the interaction/presentation and poll the existing rat-infestation quest objective seam.

## 10. Storage repair remains independent

Keep the current storage repair action and its existing cost of `2 × beam`.

Repairing storage:

- sets `storageDamaged = false`,
- removes infestation carrying-capacity bonus/floor,
- does not destroy the nest,
- does not remove living rats.

Destroying the nest:

- sets `nestDestroyed = true`,
- stops infestation replenishment,
- does not repair storage,
- does not remove living rats.

These are independent world changes even though the quest requires both.

## 11. Quest completion observes three conditions

Extend the existing narrow `SettlementRatInfestationSnapshot` rather than giving `QuestManager` direct settlement/fauna dependencies.

The snapshot should expose the facts needed to evaluate the objective, conceptually:

```ts
type SettlementRatInfestationSnapshot = {
  storageDamaged: boolean
  nestDestroyed: boolean
  aliveRatCount: number
}
```

The quest resolves only when:

```ts
!snapshot.storageDamaged
  && snapshot.nestDestroyed
  && snapshot.aliveRatCount <= 1
```

Do not add a kill counter. Current live world state remains authoritative.

Update the objective description and reminder/dialogue so the player can understand the remaining work. Reminder logic should derive from the three facts rather than maintain separate quest progress flags.

## 12. Persistence and reconstruction

Extend the existing infestation save/load path to serialize the generalized `RatInfestationState`.

Verify all current lifecycle paths:

- new authored world,
- normal save/load,
- `WorldBundle` rebuild,
- settlement stream-out/in.

After reconstruction:

- repaired storage remains repaired,
- destroyed nest remains destroyed,
- an intact nest resolves to the same deterministic location,
- rat individual persistence continues to use the existing rat registry,
- no quest state is needed to reconstruct the infestation.

If the persisted representation changes incompatibly, follow the current SaveData version/migration mechanism rather than silently accepting ambiguous legacy values. Map existing `'active' | 'repaired'` data explicitly if required by the current persistence contract.

## 13. Dog → rat combat tuning

Current fauna combat has no explicit dog→rat entry, so generic fallback damage can one-shot a rat.

Add an explicit dog→rat damage value through the existing central fauna combat damage contract. V1 target:

```text
dog → rat damage = 2
rat max HP = 6
```

With the existing `AnimalAgent` attack cooldown this requires three successful hits from full health rather than one generic-fallback hit.

Do not add dog-specific attack timing or quest-specific combat code.

Rat perception/fleeing from dogs is explicitly out of scope for this plan. If desired later, extend the shared fauna threat/perception mechanisms rather than adding rat-infestation-specific fleeing logic.

## 14. Ownership boundaries

Preserve this ownership model:

```text
RatInfestationRegistry / SettlementsManager
  owns storage damage + nest state

settlement rats reconciliation
  owns live rat population + infestation replenishment

AnimalAgent / fauna combat
  owns dog chase + physical attacks

QuestManager
  reads a narrow infestation snapshot
```

The quest must not create/destroy props directly, spawn/despawn rats, command dogs or mutate storage/nest state except through the existing world action seams.

## 15. Tests

Add focused tests for the new pure/stateful contracts.

### Population target

Verify:

- dog count no longer changes normal target,
- food pressure still changes normal target,
- normal population cap remains unchanged,
- damaged infestation storage retains existing bonus/floor,
- repaired storage removes the infestation bonus/floor.

### Dog pressure

Verify the multiplier at 0–5+ dogs, including the 0.50 floor.

### Replenishment

Verify:

- no infestation replenishment at/above target,
- intact nest enables it,
- zero dogs preserves the existing eligible-spawn rate,
- dogs reduce deterministic success according to the multiplier,
- destroyed nest blocks infestation replenishment,
- deterministic inputs reproduce the same roll,
- at most one rat is spawned per reconciliation opportunity.

### No target-driven deletion

Verify that lowering the target does not remove live rats solely because `alive > target`.

### Infestation state

Verify independent storage/nest transitions and serialization/hydration.

### Nest placement

Verify deterministic building selection/placement and stable reconstruction. Cover deterministic fallback if invalid-site filtering is required.

### Quest evaluator

At minimum:

```text
storage damaged + nest destroyed + 0 rats → unresolved
storage repaired + nest intact + 0 rats   → unresolved
storage repaired + nest destroyed + 2     → unresolved
storage repaired + nest destroyed + 1     → resolved
storage repaired + nest destroyed + 0     → resolved
```

### Dog combat

Verify an explicit dog→rat damage contract and that one hit cannot kill a full-health rat.

## 16. Documentation and implementation notes

Create:

`docs/plans/implementation-notes/quests-progression-013-rat-infestation-nest-and-reproduction-implementation-notes.md`

Before implementation, record only recon that saves the implementation agent meaningful rediscovery: exact current symbols/files, persistence seams, settlement composition/interactable seams, deterministic RNG helpers and action/capability patterns.

Update canonical state documentation where the implementation changes rat ecology, infestation ownership or persistence.

Where old `quests-progression-006` implementation notes describe dog population suppression or the two-condition completion rule, preserve historical context but clearly point to this plan as the superseding behaviour rather than rewriting history as if it had always worked this way.

Add/update JSDoc for important architectural/public functions and types introduced or generalized by this work, using appropriate `@domain` tags for preflight discovery.

## Non-goals / guardrails

- No `RatManager`.
- No `RatNestManager`.
- No quest-owned infestation/nest state.
- No kill counter.
- No immediate rat deletion after storage repair or nest destruction.
- No dog subtraction from rat population target.
- No quest-specific dog AI or combat path.
- No generic fauna reproduction framework.
- No generic settlement-problem framework.
- No permanent extinction flag for normal settlement rats.
- No rat-specific dog-flee perception in this scope.
- No unrelated fauna/settlement refactor.

## Verification

AI verification:

- focused unit tests for infestation, rats, quest evaluator and fauna combat,
- relevant broader tests,
- typecheck,
- build.

Do not perform browser verification. The user performs manual browser verification, including nest placement/interaction, dog hunting behaviour, save/load and quest progression.

`pnpm docs:sync` does not need to be run manually; repository automation handles it.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
