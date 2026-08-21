# Seedvale — Player Survival & World-Object Systems

**Purpose:** current-state reference for the player's own survival loop (needs, skills, rest) and the world objects/actions built around it (busy channels, wells, traps, planting, fishing/preservation).

**Not:** item-by-item catalog data (that's [items/CATALOG.md](../items/CATALOG.md)), combat mechanics (that's [combat.md](./combat.md)), or NPC/settlement systems (that's [SETTLEMENTS.md](../SETTLEMENTS.md)).

**Last verified:** 2026-08-21

When this file and the code disagree, the code wins — update this file.

---

## Survival needs

`PlayerController.needs` (`src/player/PlayerNeeds.ts`, plan 106) holds four pools: stamina, vigor, hunger, thirst. Sprint is gated on stamina. Vigor drains passively at idle/rest and faster with movement (`tickPlayerMovementVigor`). Hunger/thirst below a critical threshold (20% of the pool) accrue a starvation/dehydration duration (reset once the pool climbs back above critical); a growing duration first drains vigor/stamina faster, and only after a "severe" duration window does slow HP loss begin (`playerDamage.ts`'s `tickPlayerStarvationDamage`) — this reuses the existing player damage/downed path, it is not a second death system. During an active time-skip, world time scales by the day/night time multiplier instead of freezing, so needs and their HUD bars progress visibly through a rest/sleep skip.

Passive HP regen (`PlayerNeeds.ts`'s `tickHealthRegen`, plan 153) is slow and suppressed while starving/dehydrated; herbs/bandages heal faster.

Food and water are ordinary `Inventory` items with a `consumable` catalog flag ("Zjedz"/"Wypij"). `WaterSource` (`src/world/WaterSource.ts`) is the shared well/lake drink/fill abstraction — a lake is a synthetic per-frame candidate, not a discrete world object.

## Cooking & campfire capacity (plans 106, 175)

`items/campfireCooking.ts` is a flat recipe table (`raw_meat`/`deer_meat`/`wolf_meat`/`boar_meat`/`rabbit_meat`/`beef` → `roasted_meat`), `[R]` at a lit campfire — one row per input, no per-batch-size recipes. `resolveCookingCapacity(fire, inventory)`/`findCookingBatch()` batch that recipe against a station capacity: 1 for a bare fire, 2 with a carried `pan` (an ordinary inventory item, not a `HeldTool`/station), 4 once *that specific* fire has a grate — the grate always wins outright, never adds to the pan (never 6). The grate is a capability on the `VillageFire` instance itself (`hasGrate()`/`setGrate()`, `settlement/VillageFire.ts`), read directly by cooking rather than inferred from `PlacedFireKind`/`firepit`, so any fire type could carry one without a cooking-system change. Only player-built fires (`settlement/PlacedFires.ts`) can get one today: a persisted `PlacedFire.grate` flag, built one-time via the "Zbuduj ruszt" Quick Action (`app/userActions.ts`'s `buildGrate`/`GRATE_COST` = 2× branch/2× stone/2× iron_rod, re-resolving the nearest qualifying fire fresh on every press/availability check) with a procedural iron-frame visual attached as a child of the fire's own group. `iron_rod` is a new processed-material `ItemKind`, deliberately separate from the raw `iron` resource, obtainable only from the home trader in this plan (no smelting/production chain).

## Player skills

`PlayerController.skills` (`src/player/PlayerSkills.ts`) has five skills: sneak, survival, traps, defense, archery. There are no levels/perks/points — `SkillState { value, xp, active }`, where `xp` is the only persisted progression state and `value` is always derived through one shared curve (`xpToSkillValue()`, floor 0.2, asymptotic to 1). `awardSkillXp()` is the single mutation path; XP comes only from completed actions, never per frame (e.g. traps only on a confirmed capture, sneak per actually-sneaked metres, survival on ignite/tent-setup/cooking/camp-rest).

Sneak is toggled from the pause menu; active sneak slows movement and feeds `fauna/playerAwareness.ts`'s detection probability (no second detection system). Survival is passive: it shortens a few busy-channel durations and raises `roasted_meat`'s hunger relief, and reduces the camp-rest penalty below.

## Busy channels

Timed player actions (dig/chop/mine/bury/harvest/ignite/cook/tent-setup/destroy-spawner/well-work bout) run on `src/app/busyAction.ts`, a short real-time overlay — seconds, not minutes. Most show a progress bar and can be Esc-cancelled with nothing consumed (a tent, for example, is only spent when setup completes). Harvest pins the corpse being worked on so it can't despawn mid-channel. Taking damage during a busy channel or a rest/wait skip interrupts it — see [combat.md](./combat.md#combat-interruption-plan-186).

## Camp rest quality

`src/app/campRest.ts` is a pure module, not a manager. `CampRestContext { hasBlanket, hasTent, hasWarmFire }` is resolved once, when rest starts, from the existing `PlacedTents`/`PlacedFires` lists (a fire must be lit and within a warmth radius; village fires don't count — town rest is already full). `campRestQuality()` maps that context to a `[0,1]` quality (blanket only 0.55 < blanket+fire 0.75 < tent+blanket 0.8 < full camp 1.0), with the Survival skill closing up to 60% of the gap. `restoreNeedsFromSleep(needs, quality)` can only fail to fill the bar, never lower it below what it already had; stamina is always fully refilled regardless of quality. `app/actions/restActions.ts`'s `onSleepFinished()` owns applying the outcome.

## Player-built wells (plan 127)

`world/playerWell.ts` + `world/createPlayerWells.ts` use an **active-work** model: Quick Actions places a persistent record in the `pit` stage with zero progress, and each construction stage (`pit`/`well`/`roof`) only advances from hours of *active* player work (`workProgress`) — never from elapsed world time, so leaving the game does not finish a well. A `[E]` press runs one short busy-channel work bout; the measured world-time delta of that bout (not an assumed value) is credited to `workProgress` on both natural completion and Escape-cancellation, so an interruption keeps exactly the work done and resumes from there. The first bout of a new stage validates its tool requirement and atomically consumes that stage's material cost; resuming the same stage re-checks the tool but never re-charges materials. Once the `roof` stage's work is done, the well becomes a plain `well`-kind water source — the exact settlement-well drink/fill path, no parallel water system. NPCs may also target a completed player well for their own water-fetch when it's closer than the settlement's own well.

## Animal traps (plan 141)

`src/world/animalTraps.ts` + `createPlacedTraps.ts` are player-placed world objects in `WorldBundle`, the same persisted-record shape as tents/fires — there is no separate trap manager. Bought from the home trader, set down through the shared ground-placement evaluator, then `[E]` arms/disarms and `[R]` picks up. Detection is a pure function of the trap's quality (higher → lower detection floor) rolled against a deterministic per-`(trap, animal, attempt)` roll; an evasion sets a runtime-only cooldown, not persisted (wild fauna isn't persisted either). Only a fixed set of species can be caught. A catch only kills through the existing `AnimalAgent` damage/collapse/death path and deactivates the trap — it leaves an ordinary, un-harvested corpse; the player still knife-harvests it normally. Weather wears down an *armed* trap lazily, charged per completed weather cycle, not per frame. Bait (plan 159) is an optional food item consumed on arm for a detection-chance bonus, returned on disarm/collect before a catch. Per-item stats (durability, detection floor, price) are in [CATALOG.md](../items/CATALOG.md).

## Seed planting & natural food (plans 126, 159)

Quick Actions "Zasadź drzewo" consumes one generic `tree_seed` (species chosen by the same local-habitat-suitability signal procedural placement already uses) and enters the existing `TreeLifecycle` as a `sapling` anchored at the planting day — see [terrain-and-world-generation.md](./terrain-and-world-generation.md#trees). "Zasadź: marchew/ziemniak/kapustę" plants a crop lifecycle entity, only within reach of a settlement garden. Both reuse the shared ground-placement evaluator plus a short busy channel; the seed is spent only once the world mutation succeeds.

Natural food, fishing and preservation (plan 159) extend the existing consumable/spawner model rather than adding a parallel one: perishable food kinds track freshness via `Inventory`'s `FoodBatch[]` (see [CATALOG.md](../items/CATALOG.md) for the freshness/bait flags); a fishing rod casts at a lake shore through a busy channel with a deterministic catch roll (no fish population/agents); a settlement-landmark drying rack and wild hive each run a generic persistent `TimedProcess` (`items/timedProcess.ts`), resolved lazily so they survive reload/time-skip without a per-frame ticker.

## Carry capacity (plan 186)

`ItemCatalogEntry.carryCapacityBonus` (only `backpack` sets it today) is summed over currently-held matching counts into `Inventory.maxWeight`, which is a derived getter, not a stored/persisted field — the same "recompute after load" contract it already had. Feeds the existing overload/movement penalty (`player/playerEncumbrance.ts`) unchanged.

## Entry points

```text
src/player/PlayerNeeds.ts
src/player/PlayerSkills.ts
src/player/playerEncumbrance.ts
src/app/busyAction.ts
src/app/campRest.ts
src/app/actions/restActions.ts
src/app/actions/placementActions.ts
src/app/actions/gatheringActions.ts
src/app/actions/survivalActions.ts
src/items/campfireCooking.ts
src/settlement/VillageFire.ts
src/settlement/PlacedFires.ts
src/world/WaterSource.ts
src/world/playerWell.ts
src/world/animalTraps.ts
src/world/plantedTrees.ts
src/world/plantedCrops.ts
src/world/fishing.ts
src/world/dryingRacks.ts
src/world/beehives.ts
src/items/foodFreshness.ts
src/items/timedProcess.ts
```
