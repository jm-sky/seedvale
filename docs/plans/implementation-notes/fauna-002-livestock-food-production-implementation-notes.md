# Implementation Notes: Livestock Food Production

**Reviewed:** 2026-08-28  
**Plan:** `fauna-002-livestock-food-production.md`  
**Status:** review complete

## 1. Review verdict

Plan is still valid, but its biggest assumption is now satisfied: `items-player-001` is implemented.

The implementation should be a **small extension of the existing settlement livestock + AnimalAgent lifecycle**, not a new livestock subsystem.

Current relevant ownership:

- `src/settlement/livestock.ts` creates house-owned `AnimalAgent` instances for `cow`, `sheep`, `chicken`.
- Livestock is stored on `Settlement.livestock` and updated through `Settlement.update()`.
- Livestock IDs are deterministic: `<kind>-house<index>-<animalIndex>`.
- `AnimalAgent` already owns animal simulation state and is the correct place for per-animal production state.
- Portable liquid containers are already real `ItemInstance`s. Use `src/items/liquidContainer.ts`; do not create another bucket/milk representation.
- `DroppedItems.drop()` is the existing world-item path and is persisted through `SaveData.droppedItems`.

## 2. Important architectural correction: do not use a frame/dt production timer

Settlement livestock is streamed and can disappear/reappear with the settlement. Therefore a production timer based only on accumulated `dt` would stop while the settlement is unloaded.

Use **absolute world-time anchors** (elapsed game days), consistent with the current lazy systems such as crops, timed processes and weather.

Recommended state on the individual livestock agent:

- production kind/config derived from `AnimalKind`;
- `nextEggAtDays` / equivalent production anchor;
- for chicken: `eggAvailable` (or equivalent single-produced-item state);
- for milk animals: `lastMilkedAtDays` or `nextMilkAtDays`.

Resolve elapsed production when the livestock is updated or recreated. Do not simulate every production interval while off-screen.

This also makes time-skip correct without inventing a second accelerated simulation loop.

## 3. Persistence is currently a real gap

Current `SaveData v1` does **not** persist livestock production state. Livestock themselves are deterministically recreated by settlement/house seed, but their runtime state currently is not persisted.

Plan §12 therefore requires a real SaveData addition.

Prefer a sparse authoritative map keyed by deterministic livestock `animalId`, e.g. a livestock-production record/map containing only production state that differs from deterministic defaults.

Do not persist Three.js objects or duplicate the whole animal definition.

Because livestock IDs are deterministic and documented as reload-stable, they are suitable keys. Validate saved IDs/state in `src/persistence/saveData.ts`.

Do not add a migration/version chain: current architecture is hard-cut `SaveData v1`.

World rebuild/load must pass restored production state into `spawnLivestock()` rather than resetting it when `AnimalAgent` is recreated.

## 4. Time-skip / unloaded settlement behaviour

Current time architecture deliberately freezes `SettlementsManager.update()` during time-skip and resolves skipped effects once afterwards.

Production should follow the same rule:

- normal progression: resolve production from current `elapsedDays`;
- time-skip: do not run hidden accelerated livestock frames;
- after skip: resolve the skipped interval deterministically exactly once;
- unloaded settlement: production must still become correct when the settlement is recreated.

For chickens, do **not** accumulate multiple eggs during an arbitrary elapsed interval. The plan explicitly caps the state at one uncollected egg. Once an egg is available, the production cycle is blocked until collection.

For milk, cooldown should be represented as an absolute next-available time, not a decrementing frame timer.

## 5. Reuse the existing liquid-container model

`items-player-001` already implemented:

- `LiquidContainerItemInstance`;
- partial litre amounts;
- water/milk content;
- capacity derived from `ITEM_CATALOG`;
- `fillLiquidContainer()`;
- `canFillLiquidContainer()`;
- instance persistence;
- liquid mass in inventory weight.

For milking, mutate the **same bucket instance** using these domain functions. Do not remove a bucket and create a different full-bucket item.

The operation should be atomic:

1. identify a compatible carried liquid-container instance;
2. calculate available capacity;
3. start/complete the milking action for that amount;
4. on completion fill only the available litres;
5. update the same instance.

A full bucket must not start a milking action.

If a partially filled milk bucket has 3 l free and a cow produces 5 l, the plan's “respect free capacity” rule means only 3 l can be transferred. Do not silently overflow or create a second container unless the plan is deliberately changed.

## 6. Milking should reuse BusyAction

`src/app/busyAction.ts` is already used by timed player actions such as fishing. Reuse it for the player-facing milking action.

Do not create `MilkingSystem`, `MilkingTimer` or another action scheduler.

The action duration should be derived from the amount actually being collected, with one shared configurable rate/base duration. Consequently 2 l of sheep milk is shorter than 5 l of cow milk.

The completion callback must re-check the authoritative animal/container state. Do not trust the interactable snapshot captured when the action started.

Real-time action duration and world-time production/cooldown are separate concepts; do not convert BusyAction duration mechanically into game days.

## 7. Interaction ownership

Extend the existing `Interactable` animal branch and action wiring. Do not create a second animal interaction system.

Current animal interaction already covers settlement livestock and wild fauna through `src/app/interactables.ts`.

For milking, availability should depend on:

- live cow/sheep;
- animal currently milkable;
- compatible bucket instance available;
- remaining bucket capacity > 0.

For chicken, expose collection only when its authoritative egg state is ready.

Avoid putting litres, cooldowns or production state in Vue/UI.

## 8. Eggs must use DroppedItems, not a new EggEntity

Add `egg` as a normal `ItemKind`, with the normal item definition/catalog entries and model/fallback handling.

When a chicken completes production:

- create one normal dropped item through `bundle.droppedItems.drop('egg', chickenPosition.x, chickenPosition.z)`;
- mark the chicken's egg as collected/consumed state;
- start the next production cycle only when the egg is collected, per the plan.

The dropped item must therefore be the world representation. Do not keep a second egg object attached to the chicken.

Important ordering: production state must not claim the egg is collected before the world drop succeeds.

`DroppedItems` already persists dropped-item records through SaveData, so do not add a second egg persistence collection.

## 9. Egg location and movement

Use the chicken's current authoritative position at production time. The egg is not anchored to the house, spawn point or chicken mesh after creation.

Do not attach the egg mesh to the chicken.

The existing dropped-item placement already resolves the ground presentation; no new egg placement system is needed.

## 10. NPC collection is not an established generic path

The plan says products can be collected by player or NPC, but current code has a clear player-side world-item pickup path and does not expose an equivalent generic NPC “collect arbitrary dropped item” mechanism.

Do **not** invent a generic NPC item-collection subsystem inside this plan.

Implement egg production + normal world pickup first. If NPC collection is required by acceptance criteria, extend an existing NPC logistics/action mechanism only after verifying that it can own the pickup and inventory transfer cleanly. Otherwise record the limitation rather than creating a parallel system.

Milk currently has an even cleaner boundary: it is transferred directly into the player's existing liquid-container instance during the milking action.

## 11. Production configuration

Keep species differences data-driven and local to fauna definitions/configuration.

Minimum configuration:

| Kind | Product | Amount | Collection |
|---|---|---:|---|
| chicken | egg | 1 | world item |
| cow | milk | 5 l | milking |
| sheep | milk | 2 l | milking |

Production interval and milk cooldown should also be configuration values, not literals inside interaction code.

Do not create three species-specific systems.

## 12. Do not confuse milk production with animal feeding

Existing livestock already has needs/thirst and household water integration through `AnimalAgent`. That system should remain untouched.

Milk production is an output/cooldown state, not another animal need.

Likewise, do not make milk production depend on the household's `food` stock unless a later design explicitly adds nutrition/lactation rules.

## 13. Lifecycle / identity pitfalls

`AnimalAgent.animalId` is the stable gameplay identity for deterministic livestock. Do not key production state by:

- mesh identity;
- array index alone;
- object reference;
- settlement-local runtime object identity.

When livestock is disposed/recreated during a `WorldBundle` rebuild, its production state must be restored by stable ID.

Also preserve the existing distinction between settlement livestock and wild fauna. Only `cow`, `sheep` and `chicken` owned by settlements should participate in this production feature.

## 14. Persistence of eggs vs production state

These are separate authoritative states:

```text
Chicken production state
        ↓
egg becomes a DroppedItem
        ↓
DroppedItems persistence
        ↓
player pickup
        ↓
chicken becomes eligible for next cycle
```

Do not persist both “egg dropped” and a duplicate egg flag that can disagree.

A chicken's “one egg available” state is useful only while the produced egg has not yet been represented/collected. Once the egg is materialized as a persistent DroppedItem, choose one source of truth and keep the lifecycle transition atomic.

## 15. Suggested implementation shape

Prefer the smallest extension:

- `AnimalAgent.ts`: production state + pure production/cooldown helpers + lifecycle resolution.
- `settlement/livestock.ts`: pass restored production state into constructed agents.
- `SettlementsManager/createSettlement`: forward current world time / restored production state only where the existing ownership boundary requires it.
- `items/items.ts` + `items/itemCatalog.ts`: `egg`.
- `app/interactables.ts`: state-dependent chicken/milking candidates.
- existing action module(s): chicken collection and milking through current interaction/busy-action flow.
- `persistence/saveData.ts` + save assembly/restore wiring: sparse livestock production state.
- tests for pure production timing, persistence, container capacity and interaction eligibility.

Do not introduce a new manager unless implementation proves an existing owner cannot support the state cleanly.

## 16. High-value tests

At minimum:

1. chicken production is individual and deterministic;
2. chicken never has more than one uncollected egg;
3. production resolves correctly after a long unloaded interval;
4. time-skip does not double-produce;
5. livestock production survives SaveData round-trip;
6. cow produces 5 l;
7. sheep produces 2 l;
8. sheep milking duration is shorter than cow milking for their configured amounts;
9. empty bucket accepts milk;
10. partial bucket receives only available capacity;
11. full bucket cannot start milking;
12. milk remains on the same `ItemInstance`;
13. egg is a normal `DroppedItem` and can be picked up;
14. deterministic livestock IDs remain the persistence key;
15. wild animals do not accidentally gain livestock production state.

## 17. Main pitfalls

Avoid these specifically:

- decrementing a production timer every frame;
- resetting production whenever a settlement reloads;
- spawning eggs every update after the interval has elapsed;
- creating a separate `EggEntity`;
- representing milk as count-based `milk: N` inventory;
- keeping legacy/full-bucket and numeric milk state in parallel;
- starting milking with a full/incompatible container;
- trusting an old interactable snapshot after a timed action;
- adding NPC item pickup as a new generic subsystem;
- putting production state in the UI;
- persisting mesh/runtime references;
- adding a SaveData migration/version bump.

## 18. Scope recommendation

The plan can be implemented now and should remain **M-sized** if kept to:

`AnimalAgent` production state → existing settlement update/time model → existing item/drop system → existing liquid-container instances → existing interaction/BusyAction → SaveData v1.

The only part of the original plan that should be treated as potentially larger than M is generic NPC egg collection. Do not let that requirement expand the plan into a new NPC logistics system.

**Zrób git commit i push do main, rebase jeżeli trzeba**
