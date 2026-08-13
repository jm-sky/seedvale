# Plan 094 — Implementation Notes

**Plan:** `2026-08-13--094--fauna-food-water-for-satiety-hydration.md`
**Review date:** 2026-08-13
**Purpose:** review the plan against the current codebase and provide an implementation handoff. The plan is directionally correct, but a few details need to be made explicit before coding.

## 1. Review verdict

**Approve with implementation adjustments.**

The plan fits the current architecture well: real feeding/drinking should extend `AnimalAgent` / `AnimalLife` rather than introduce another fauna AI/FSM or a `FaunaNeedsManager`.

The main correction is that the plan currently describes **sources** conceptually, while the code has no query/target representation for them yet. The implementation should add the smallest possible target/interaction seam inside `AnimalAgent` and keep world queries cheap and event/retarget driven.

Current code confirms:

- `AnimalAgent` owns `AnimalLifeState` and already decides movement/intent.
- `AnimalLife` owns hunger/thirst ticking and currently exposes the old abstract `relieveElevatedNeeds()`.
- `wander()` currently calls `relieveElevatedNeeds()` on timer expiry **or arrival**, so the existing abstraction must be removed/replaced for plan 094.
- `isWalkable()` already uses `sampleHeight()` + `waterLevel + WATER_MARGIN` and movement explicitly avoids water.
- `AnimalAgent.update()` already has a clear priority chain: player/environmental threat → predator/prey behavior → wander.
- predator attack already damages prey and leaves the prey as a 60-second corpse.
- `sampleForestFactor` already exists in the fauna creation path and is the correct existing habitat signal to reuse.

These seams are visible in `AnimalLife.ts`, `AnimalAgent.ts` and `createFauna.ts`; `docs/STATE.md` also confirms that predator scavenging is not yet implemented. fileciteturn8file0L2-L6 fileciteturn13file0L2-L2 fileciteturn9file0L2-L2

## 2. Important scope correction: which animals eat what

The plan names deer/stag as prey and wolf/fox as predators, which is fine for the first visible gameplay case, but `AnimalAgent` currently has more prey-like animals:

- wild prey: deer, stag, rabbit, boar, duck;
- domestic prey/livestock: sheep and chicken are currently `role: 'prey'`;
- horse/donkey/cow are `role: 'livestock'` and are domestic.

Do **not** redesign animal roles as part of this plan.

For v1, use the existing role plus a small feeding profile in `AnimalDef` or a similarly local definition:

- `predator`: meat/carcass;
- herbivore/prey: forage;
- domestic livestock: forage as well, if the existing livestock path already uses `AnimalAgent` hunger/thirst.

If the implementation intentionally limits real forage to deer/stag, document that explicitly and leave other herbivore hunger as the existing fallback until a later plan. Avoid silently making `role === 'prey'` mean "can forage" if that changes current livestock semantics.

## 3. Do not create a generic resource system yet

The plan correctly says not to add a `FaunaNeedsManager`. Keep that decision.

Recommended ownership:

```text
AnimalLife
  └─ hunger / thirst values + pure consume/relief helpers

AnimalAgent
  ├─ decides whether food/water is currently needed
  ├─ queries a nearby source when retargeting
  ├─ moves to the source
  └─ performs the short eat/drink action
```

No new global `FaunaFoodSystem`, `WaterSourceManager`, item drops, food entities or second FSM.

A future generalized resource/query system can emerge when NPCs, fauna and world simulation genuinely need the same abstraction. Plan 094 does not need that complexity.

## 4. Replace abstract relief, don't layer real feeding on top of it

`AnimalLife.relieveElevatedNeeds()` is currently the old abstraction: it subtracts `0.25` from both hunger and thirst. The current `wander()` invokes it when the timer expires or the target is reached. fileciteturn8file0L2-L2

For plan 094:

- remove its use from `wander()`;
- preferably replace it with explicit pure helpers such as `consumeFood()` and `drinkWater()` rather than keeping a generic "relief" function;
- keep clamping and biological ticking in `AnimalLife`;
- let `AnimalAgent` decide when the helper is valid to call.

The semantic invariant should be:

```text
arrived at arbitrary wander target → no relief
arrived at valid food target + completed eating → hunger decreases
arrived at valid water target + completed drinking → thirst decreases
```

This is the most important correctness change in the plan.

## 5. Recommended action model

Do not add a second FSM. Reuse the existing `setIntent()` / `PlannedAction` seam and movement lifecycle.

The current `FaunaActionKind` is:

```ts
'tattack' | 'chase' | 'flee' | 'wander'
```

For plan 094, adding explicit action kinds is preferable to hiding feeding inside `wander`, for example:

```ts
'attack' | 'chase' | 'flee' | 'wander' | 'forage' | 'drink' | 'eat'
```

The exact names are implementation detail, but the behavior should remain one lifecycle, not a new state machine.

A short eat/drink action should:

1. stop movement;
2. remain at the source for a small fixed duration;
3. apply relief once when the action completes;
4. retarget afterwards.

Do not continuously subtract hunger/thirst every frame while standing at the source; that makes the effect dependent on frame/update rate and makes interruption harder to reason about.

## 6. Water implementation

The plan's shoreline approach is viable, but "nearest shoreline" should not mean a scan every frame.

Recommended approach:

- only search for water when thirst crosses the elevated threshold or when the current drink target becomes invalid;
- sample a small deterministic/randomized set of points around the animal/home range;
- accept a candidate when the point itself is walkable and one or more nearby samples are at/below the water threshold;
- score by distance, with a small preference for a clearly detectable shore rather than merely the first candidate;
- cache the selected coordinate until arrival, invalidation, or threat interruption.

Use the existing water contract (`sampleHeight` + `waterLevel` / `WATER_MARGIN`). Do not introduce a second water-height definition.

Important: a single global `waterLevel` comparison must not be treated as a complete water-body query if terrain/water representation later contains local floor/water distinctions. Keep the query isolated so it can be upgraded to the project's water-domain API without changing the behavior layer.

### Water action

At a valid shore target:

```text
thirst elevated
→ move to shore
→ arrive within drink radius
→ drink for short duration
→ thirst decreases
→ hydration bar rises
```

The animal must remain on land. Never move the agent into the water just to satisfy thirst.

## 7. Forage implementation

The current code already has the right habitat input: `createFauna()` receives `sampleForestFactor`, and `AnimalAgent` receives the current forest factor. fileciteturn9file0L2-L2

The limitation is that `AnimalAgent` currently receives only the **current** forest value, so it cannot choose a better forage coordinate. The smallest change is to give it access to the existing sampler callback, rather than creating a new forest/vegetation manager.

Recommended:

```ts
sampleForestFactor: (x: number, z: number) => number
```

Then forage target selection can score sampled walkable candidates using:

- distance;
- forest factor / habitat suitability;
- dry-land requirement;
- existing village avoidance for wild animals.

Do not add actual grass/berry/tree food props in v1. "Forage" is a world location/behavior, not an inventory item.

A simple species preference is enough. For example, deer/stag can prefer meadow/forest edge rather than requiring a specific plant type. Avoid pretending that `sampleForestFactor` identifies a literal edible plant; it is only a habitat proxy in this version.

## 8. Predator food / carcasses

This part needs slightly more explicit design than the original plan.

`AnimalAgent` already keeps dead prey in the `others` array for up to 60 seconds, and `nearest()` already filters by role and `health.dead`. The current state explicitly says predator scavenging is not implemented. fileciteturn13file0L2-L2

Recommended v1:

- predator searches nearby dead prey when hunger is elevated and no live-prey chase has priority;
- a corpse can be selected as a food target;
- predator moves to the corpse and performs a short eating action;
- eating reduces hunger once;
- corpse remains visually present for the existing corpse lifetime.

### Avoid multiple predators feeding infinitely

Add a minimal per-corpse feeding/consumption guard on `AnimalAgent`, not a global carcass manager. For example:

```text
corpse.foodClaimedBy: AnimalAgent | null
```

or an equivalent private/token-based guard.

The guard should only prevent simultaneous/repeated completion from multiple predators. Do not introduce itemized meat or a resource entity for v1.

### After a successful kill

No special parallel "kill reward" system is needed. The dead prey becomes the normal corpse food target on the next decision cycle. This keeps kill → corpse → feeding as one coherent interaction.

## 9. Behavior priority

The existing priority chain should remain authoritative:

```text
player / fire threat
    ↓
predator chase / prey flee
    ↓
food / water search
    ↓
normal wander
```

Food/drink must never override an active flee or chase.

When threat interrupts feeding/drinking:

- cancel the pending food/water action;
- do not apply relief unless the action had already completed;
- release the corpse claim if one exists;
- allow the normal threat behavior to resume immediately.

This is especially important for prey: a hungry deer should not stand still and graze while a wolf is inside its flee range.

## 10. Target invalidation

A cached target must not become a permanent destination.

Invalidate/research when:

- the target is no longer walkable;
- the animal exceeds its home/roam bound;
- a corpse disappears or is buried;
- a claimed corpse is claimed/consumed by another predator;
- the need is no longer elevated;
- the action is interrupted by threat.

Do not re-query every frame. Retarget on need transition, arrival, timeout, or invalidation.

## 11. Interaction with existing wander bias

The existing `needWanderBias()` should remain useful as a fallback, but it must no longer be the mechanism that satisfies needs.

Recommended semantics:

```text
need elevated
  ├─ source found → target source
  └─ no source found → existing biased wander/search
```

This preserves the existing behavior when no valid source is nearby and avoids an abrupt "animal freezes because no source was found" behavior.

The biased wander should not call any hunger/thirst relief.

## 12. Stamina and action cost

Do not add a separate feeding/drinking stamina resource.

Eating and drinking are short low-effort actions and should normally allow stamina regeneration through the existing `StaminaState` behavior.

Chase/flee remains the primary stamina-consuming behavior. This preserves the existing shared stamina architecture described in `docs/STATE.md`.

## 13. Suggested constants

Keep tuning local and centralized. Exact values should be tuned in-browser, but the implementation should have explicit constants for:

- `FOOD_SEARCH_RADIUS`;
- `WATER_SEARCH_RADIUS`;
- `FOOD_INTERACTION_RANGE`;
- `WATER_INTERACTION_RANGE`;
- `EAT_DURATION_SEC`;
- `DRINK_DURATION_SEC`;
- `FOOD_RELIEF`;
- `WATER_RELIEF`;
- target search/retarget cooldown if needed.

Do not reuse `NEED_RELIEF_ON_ARRIVAL` after real feeding is introduced; its name/semantics belong to the old abstraction.

## 14. Tests

Extend the existing `AnimalLife.test.ts` with pure state tests for:

- food consumption reduces hunger and clamps at zero;
- water consumption reduces thirst and clamps at zero;
- food does not change thirst;
- water does not change hunger;
- consumption works below/above the elevated threshold according to the chosen helper contract.

Keep target-selection tests pure where practical. Useful helpers include:

- shoreline candidate scoring;
- forage candidate scoring;
- forage/water target validity.

Do not try to unit-test the complete Three.js movement loop if the behavior can be expressed as small pure functions.

Browser verification is mandatory for this plan because the core acceptance criteria are behavioral.

## 15. Verification checklist

- `npm run test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- spawn/observe hungry deer/stag and confirm they move toward plausible forage locations;
- confirm they stop and visibly perform a short feeding action;
- confirm the satiety bar rises only after successful feeding;
- confirm thirsty animals move to a land shoreline and never enter water to drink;
- confirm the hydration bar rises only after successful drinking;
- confirm arbitrary wander arrival no longer changes hunger/thirst;
- kill a prey animal with a predator and confirm the predator can eat the corpse;
- confirm predator hunger decreases after eating and does not immediately refill repeatedly from the same corpse;
- confirm flee/chase interrupts food/drink behavior;
- confirm wild animals still respect village avoidance;
- confirm no noticeable per-frame terrain/water scanning is introduced.

## 16. Files expected to change

Likely:

- `src/fauna/AnimalLife.ts`
- `src/fauna/AnimalLife.test.ts`
- `src/fauna/AnimalAgent.ts`
- `src/fauna/createFauna.ts`

Potentially only if existing contracts require it:

- a small pure helper/test module under `src/fauna/` for source scoring/query logic.

Do **not** modify NPC `Needs`, settlement wells, gardens, item definitions, terrain water rendering, or the save system as part of this plan.

## 17. Final implementation direction

The intended architecture after plan 094 is:

```text
AnimalLife
  hunger/thirst
       ↓
AnimalAgent
  need pressure
       ↓
  source search / biased fallback
       ↓
  forage / drink / eat action
       ↓
  real world effect on AnimalLife
```

This is a natural extension of the existing `needs → behavior → action` architecture. It closes the current gap identified by the plan without turning fauna into a second resource-management or AI framework.

**Key rule:** an animal may only receive food/water relief after it has actually reached and completed the corresponding real-world action. Wandering alone never satisfies hunger or thirst.

## Implementation status (2026-08-13)

**Implemented, technically verified** (`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` all pass — 469/469 tests). **Browser/manual verification not yet done** — see the checklist in §15 above; still needs to be run against the live dev server before this plan can move to `done`.

Files actually changed, matching §16's prediction exactly:

- `src/fauna/AnimalLife.ts` — removed `relieveElevatedNeeds()`/`NEED_RELIEF_ON_ARRIVAL`; added `FOOD_RELIEF`/`WATER_RELIEF` (0.5 each) and pure `consumeFood()`/`drinkWater()`, applied unconditionally (not gated on the elevated threshold — that gate now lives in whether `AnimalAgent` decides to search for/pursue a source at all).
- `src/fauna/AnimalLife.test.ts` — replaced the old relief tests with `consumeFood`/`drinkWater` coverage per §14.
- `src/fauna/AnimalAgent.ts` — the bulk of the work:
  - `FaunaActionKind` extended with `'forage' | 'drink' | 'eat'`.
  - New `SourceTarget` (`water` / `forage` / `carcass`) cached on the agent, searched only when absent and off cooldown (`SOURCE_SEARCH_COOLDOWN_SEC = 3`), re-validated every `pursueNeeds()` call, released on threat interrupt (`cancelSourceTarget()`), and given a `SOURCE_TARGET_TIMEOUT_SEC = 20` pursuit ceiling so a technically-valid-but-unreachable target can't stick forever.
  - `pursueNeeds()` is called from both `updatePredator`/`updatePrey` after the existing threat/chase/flee branches and before falling through to `wander()` — priority chain matches §9 exactly.
  - **Priority decision when both needs are elevated:** thirst is searched first, hunger second (not specified explicitly in the plan; picked as the more urgent biological need). Once a target is picked, the animal finishes that pursuit even if the other need also crosses the threshold mid-walk — no re-evaluation mid-pursuit, since need levels can't drop except via the animal's own completed action.
  - `findWaterTarget()`/`findForageTarget()` do randomized-candidate + score search (10–14 attempts) rather than a single nearest-candidate scan; scoring is exposed as two pure, unit-tested functions — `shoreProbeHits()` (4-point water-edge probe) and `forageEdgeScore()` (peaks at `forestFactor ≈ 0.45`, i.e. forest edge, not open meadow or deep forest).
  - `findCarcassTarget()` reuses the existing `others`/`health.dead`/corpse-lifetime machinery; added a minimal `foodClaimedBy: AnimalAgent | null` claim plus `foodConsumed` after a completed eat so the same carcass cannot refill hunger on the next frame (`isCarcassEdible`, unit-tested). Not a global carcass manager.
  - Eat/drink is a real timed action (`EAT_DURATION_SEC = 3`, `DRINK_DURATION_SEC = 2`) applied once on completion, not a per-frame drain, per §5.
- `src/fauna/createFauna.ts` — `spawnAgent()` now passes the settlement's `sampleForestFactor` into `AnimalAgent`'s constructor.
- `src/fauna/foodWaterTargeting.test.ts` (new) — pure unit tests for `shoreProbeHits`/`forageEdgeScore` per §14's "keep target-selection tests pure where practical"; later extended with `isCarcassEdible` (consumed / claimed-by-other / expired).

Follow-up on the same day after the first 094 commit: a completed eat released the corpse claim, so a starving predator (`hunger` 1.0 → 0.5, then one `tickAnimalLife`) could start eating the same carcass the next frame. `foodConsumed` closes that. `updatePredator` also calls `pursueNeeds()` when live chase is blocked (prey inside village, or predator exhausted) so drinking/scavenging are not skipped just because a huntable-but-unreachable prey exists.

**Deliberate scope call on §2/§7 (which animals really forage):** rather than special-casing deer/stag, forage was implemented generically for any non-predator (`role !== 'predator'`). That covers wild prey (deer, stag, rabbit, duck, boar) and all domestic animals that already use `AnimalAgent` hunger/thirst — sheep/chicken (`role: 'prey'`) and horse/donkey/cow (`role: 'livestock'`). `sampleForestFactor` is an **optional** constructor parameter (`undefined` for `src/settlement/livestock.ts`'s spawn path, unchanged call site), so village livestock forage with distance-only scoring (`suitability` defaults to `0.5`) instead of habitat-biased scoring. This matches §2 ("domestic livestock: forage as well, if the existing livestock path already uses `AnimalAgent` hunger/thirst") and keeps the seam small — no threading `sampleForestFactor` through `spawnLivestock()`/settlement creation.
