# Implementation Notes: Vigor, Hunger, Thirst and Rest

**Plan:** `docs/plans/2026-08-19--165--vigor-hunger-thirst-and-rest.md`
**Reviewed:** 2026-08-19
**Status:** `planned`

## Review summary

Plan 165 has the right direction: it should refine the existing player survival pools rather than introduce a new survival framework. The most important implementation constraint is to keep `PlayerNeeds` as the owner of player-facing hunger/thirst/vigor/stamina state and to extend the existing shared pool primitives and rest/time-skip flow.

The current code confirms that the four pools already live in `src/player/PlayerNeeds.ts`, with shared `{ max, current }` state types in `src/shared/*State.ts`. `tickPlayerNeeds()` currently drains Hunger, Thirst and Vigor from simulation `dt`; `applyStarvationDamage()` currently applies HP damage whenever either pool reaches its threshold. `restoreNeedsFromSleep()` already owns sleep restoration for Vigor/Stamina. Do not create a second needs manager, survival manager, rest regeneration system or UI-owned timers.

The plan's `Depends on: none` is acceptable as a plan-index dependency, but implementation should explicitly account for earlier systems that established the current contracts: player needs/food, camp/rest/survival, and recent rest/mobile UI work. The code is the source of truth if any older plan wording differs.

## Existing mechanisms to extend

### 1. `src/player/PlayerNeeds.ts` — primary owner

This is the central integration point and should remain so.

Extend:

- `PlayerNeeds` with persistent/serialized starvation and dehydration duration state if the implementation determines that these durations must survive save/load. Prefer explicit state here rather than putting timers in `PlayerController` or HUD.
- `tickPlayerNeeds()` for the time-based progression of Hunger/Thirst and their long-term consequences.
- `tickPlayerStamina()` only if penalties must be applied through the existing stamina path; do not create another stamina pool or regen loop.
- `restoreNeedsFromSleep()` for any required interaction between rest/sleep and existing need state, but keep the existing sleep mechanism as the owner of restoration.
- `eatFood()` / `drinkWater()` as the existing refill entry points. These should also resolve the corresponding long-term starvation/dehydration state instead of adding new consumer-side reset logic.
- `applyStarvationDamage()` by replacing the current immediate `level == 0` damage rule with duration-gated consequences.

Important: `PlayerNeeds.ts` currently contains the numerical drain constants and the HP consequences. Do not scatter these constants across `gameLoop.ts`, HUD code, item consumers or rest code.

### 2. `src/shared/HungerState.ts` and `src/shared/ThirstState.ts`

Keep the existing `{ max, current }` pool semantics. `current` is satiation/hydration, not an NPC-style 0..1 urge.

The existing `isStarving()` / `isDehydrated()` functions currently use a threshold of `0`. Plan 165 should change the threshold semantics only if that is the cleanest place to represent the new critical level. Prefer named constants such as a critical threshold over hard-coded comparisons in `PlayerNeeds.ts`.

Do not convert these states into a different model. If duration belongs in `PlayerNeeds`, leave these shared pool types focused on the pool itself.

### 3. `src/shared/VigorState.ts`

Reuse `drainVigor()`, `restoreVigor()`, `isCollapsed()` and the existing `VIGOR_COLLAPSE_THRESHOLD`.

The current `VigorState` is intentionally generic and already shared by player/NPC systems. Do not introduce `PlayerVigorState`.

Plan 165's passive drain should be implemented by changing the existing player drain rate in `PlayerNeeds.ts`, not by modifying the generic `drainVigor()` semantics. The generic function should continue to mean "subtract this amount".

### 4. Existing movement/activity vigor costs

Before changing anything, trace every player path that calls `drainVigor()` or otherwise spends Vigor. The plan explicitly wants walking/activity to cost more than idling.

Keep the existing action-specific costs and extend them where necessary. Do not create `PlayerActivityVigorSystem`, `MovementFatigueSystem` or a second activity-cost table unless the current code has no reusable seam.

The desired model is:

```text
idle/rest passive cost
        +
existing movement/activity costs
        +
existing heavy-action costs
        ↓
existing VigorState
```

The passive component must be simulation-time based, not frame/UI based. A useful implementation shape is still `amountPerSimulationSecond * dt`; only the constant changes to produce approximately `1 point / 24 game hours` under the current `dayLengthSec`.

Do not use wall-clock seconds or render-frame frequency.

### 5. Food and water consumption

Food and water already refill the existing pools through `eatFood()` and `drinkWater()`. Keep that path.

Do not add `consumeFoodAndResetStarvation()` or separate player-only food/water managers. The reset/decay of long-term starvation state should happen at the same domain boundary where the corresponding pool is restored.

For food, use the existing item/catalog/consumption values. Plan 159 and the existing food pipeline should remain the source of nutrition values. Plan 165 changes the consequences of sustained deprivation, not the item economy.

For water, use the existing water/drink interaction and `drinkWater()` path. Do not invent a parallel hydration inventory or reservoir system.

### 6. Existing rest/camp/sleep flow

Plan 128 established the camp/rest model and explicitly chose existing rest mechanics rather than a new `CampManager`. Plan 165 should preserve that decision.

The existing sleep contract in `PlayerNeeds.ts` is:

- `restoreNeedsFromSleep(needs, quality)` restores Stamina fully;
- Vigor is raised to at least `max * quality`, never reduced;
- `quality` is already the bridge between lodging/camp quality and the need restoration.

Extend this contract rather than creating `restoreVigorFromLodging()`, `sleepRegen()`, or a new quality model.

If lodging/bed/town rest already supplies a quality value, keep that value as the input. Do not introduce another `sleepQuality` or `lodgingQuality` state just for plan 165.

The important integration question is not "how do we regenerate?" — that already exists. It is "when does the existing regeneration become observable during the time skip?"

### 7. Lodging / bed / camp quality

Treat lodging as an input to the existing rest system, not as a new needs subsystem.

Expected flow:

```text
lodging / camp context
        ↓
existing rest quality
        ↓
existing rest/sleep action
        ↓
restoreNeedsFromSleep(..., quality)
        ↓
PlayerNeeds
```

A town bed or full camp should continue to provide the existing high-quality rest. Rough camping should continue to use the existing lower quality where applicable.

Do not duplicate lodging information into `PlayerNeeds`. Needs should store the resulting pools and long-term deprivation state, not where the player slept.

## Hunger / starvation implementation

### Recommended state model

Keep Hunger as the current satiation bar and add a duration owned by `PlayerNeeds`, for example:

```ts
type PlayerNeeds = {
  stamina: StaminaState
  vigor: VigorState
  hunger: HungerState
  thirst: ThirstState
  starvationDuration: number
  dehydrationDuration: number
}
```

Use the repository's existing naming conventions and persistence approach if they point to a better representation. The important property is ownership: duration is simulation state, not UI state and not `PlayerController` action state.

### Tick ordering

Prefer a deterministic ordering inside the existing needs tick:

1. advance Hunger/Thirst pools;
2. determine whether each pool is below its critical threshold;
3. advance or reduce the corresponding duration using simulation `dt`;
4. derive Vigor/Stamina penalties from duration;
5. apply slow HP damage only after its configured duration gate;
6. allow food/water/rest actions to resolve the state through their existing APIs.

Avoid a separate per-frame starvation service.

### Penalties

Do not permanently subtract from `VigorState.max` or `StaminaState.max` unless the existing architecture explicitly supports temporary maximum modifiers. A deprivation penalty should preferably affect current recovery/cost or a bounded effective value, so eating/drinking immediately restores the character's normal capability without having to reconstruct max values.

If the implementation needs a reusable modifier, keep it as a pure calculation over existing state rather than introducing a new survival stat framework.

The first ~3 game days of starvation should primarily reduce performance/capability; HP damage should be delayed and slow. The exact values should be derived from current `dayLengthSec` and existing pool magnitudes, not chosen in wall-clock seconds.

## Thirst / dehydration implementation

Mirror the starvation model, but keep dehydration's time scale shorter than starvation.

Do not copy-paste a second system with independent mechanics. Prefer shared pure helpers where they remove duplication, for example a generic deprivation-duration calculation, while keeping Hunger and Thirst state names explicit and readable.

The important distinction is configuration:

```text
Hunger → longer critical duration → delayed HP loss
Thirst → shorter critical duration → earlier HP loss
```

Both must still use the existing `damageHealth()` path.

## Vigor passive drain

Current `PlayerNeeds.ts` defines Vigor as draining across one game day using the current `dayLengthSec`. That is the exact mechanism plan 165 should tune.

Target:

```text
idle/rest: approximately -1 Vigor / 24 game hours
```

At the current default `dayLengthSec = 480`, this corresponds to a very small per-simulation-second drain. Do not hard-code a real-time interpretation such as `1 / 86400` unless the codebase's simulation time is actually expressed in real seconds.

A useful implementation guard is to test the drain over a synthetic 24-hour simulation delta rather than waiting in the browser.

Activity costs should remain additive with the passive baseline only where that matches existing semantics. Inspect current movement/work/combat callers first; avoid accidentally charging the same activity twice after changing the baseline.

## Rest / time-skip / HUD synchronization

This is likely the most important technical integration point besides `PlayerNeeds`.

The plan says the bars must change during rest/sleep, not only after the action completes. The current architecture freezes normal per-frame simulation during a time skip and catches up the skipped duration at completion. That is fine for deterministic simulation, but the UI needs intermediate state updates if the rest UI is intended to show progression.

Do not add a second simulation loop just for the HUD.

Instead, inspect the existing rest/time-skip callback or progress mechanism and identify the single point where the skipped simulation time is applied. Make that existing flow expose updated `PlayerNeeds` to the existing HUD state after each meaningful rest increment.

The desired ownership is:

```text
rest/sleep time progression
        ↓
existing PlayerNeeds mutation
        ↓
existing player-state/HUD synchronization
        ↓
HudScreen.vue
```

If the current rest action applies the entire 8-hour delta atomically, the minimal solution may be to update the UI at the existing time-skip progress boundary rather than changing simulation granularity. Avoid frame-by-frame recomputation merely to animate a bar.

After the skip, perform the normal final synchronization so HUD and Player state cannot diverge.

## Persistence

The plan does not explicitly mention save compatibility, but starvation/dehydration durations are meaningful simulation state. Determine whether they must persist by checking the existing `SaveData` contract.

If the player can save while critically hungry/dehydrated, losing the duration on reload would reset a real gameplay consequence. Prefer persisting the durations if the save model already persists Hunger/Thirst/Vigor.

If adding fields to `SaveData`, follow the existing version/migration pattern. Do not store derived penalties if they can be recalculated from duration and current needs.

Do not persist Stamina if the existing save contract treats it as transient; preserve the established rule.

## Tests to add or adjust

Focus tests on pure logic and the existing `PlayerNeeds` boundary:

- 24 game hours of idle simulation consumes approximately 1 Vigor.
- UI/render tick frequency does not change passive Vigor consumption for the same simulation duration.
- Existing activity/movement Vigor costs still apply and are not double-counted.
- Hunger above the critical threshold does not advance starvation duration.
- Crossing the critical Hunger threshold starts duration accumulation.
- Eating through `eatFood()` reduces/resets starvation duration according to the chosen rule.
- Starvation penalty grows with duration.
- HP damage does not begin immediately at Hunger `0`.
- Long starvation eventually applies slow HP damage.
- Equivalent cases work for Thirst, with a shorter dehydration timescale.
- Drinking through `drinkWater()` resolves dehydration duration.
- Sleep continues to use `restoreNeedsFromSleep()` and does not introduce another Vigor/Stamina regeneration path.
- Rest quality still affects Vigor restoration.
- Stamina still returns according to the existing sleep contract.
- Existing HP regeneration interaction remains correct: starvation/dehydration should not accidentally allow `tickHealthRegen()` to heal through the new deprivation damage.

Prefer deterministic tests with synthetic `dt` over tests that depend on real timers.

## Browser/manual verification focus

Technical tests are not sufficient for the rest/HUD portion. After the implementation, manual browser verification should specifically inspect:

1. idle player over a known simulation period;
2. walking/active play versus standing still;
3. Hunger/Thirst entering critical state;
4. prolonged starvation/dehydration;
5. eating/drinking recovery;
6. camp rest;
7. sleep in existing lodging/bed context;
8. sleep/rest quality differences already supported by the camp/lodging system;
9. Vigor and Stamina bars changing while rest/sleep progresses;
10. final HUD values matching Player state after the skip.

Do not redesign the HUD as part of this plan. The HUD is a presentation of Player state.

## Files likely in scope

Start from the actual current code and confirm paths before editing:

- `src/player/PlayerNeeds.ts`
- `src/shared/HungerState.ts`
- `src/shared/ThirstState.ts`
- `src/shared/VigorState.ts`
- `src/shared/StaminaState.ts`
- `src/player/PlayerController.ts`
- existing rest/camp/time-skip implementation under `src/player/` / `src/app/` / `gameLoop.ts`
- existing lodging/bed/rest integration
- `src/items/...` food/water consumption paths
- `src/persistence/saveData.ts` and migrations if duration is persisted
- `src/ui-vue/.../HudScreen.vue` only at the existing synchronization seam
- relevant `PlayerNeeds` tests

The exact paths must be confirmed from current code; do not infer a new module from the plan.

## Things the implementing agent should explicitly avoid

- New `SurvivalNeedsManager` / `PlayerSurvivalSystem`.
- Separate Hunger and Thirst controllers.
- UI-owned starvation/dehydration timers.
- A new regeneration system for sleep/rest.
- A new lodging/comfort/temperature stat solely for plan 165.
- Replacing `VigorState`, `StaminaState`, `HungerState` or `ThirstState` with incompatible models.
- Duplicating food/water consumption logic.
- Changing NPC/fauna needs just because they share `VigorState` or similar concepts, unless the shared primitive itself is demonstrably wrong.
- Per-frame UI-specific simulation of rest.
- Permanent mutation of Vigor/Stamina maxima for temporary starvation penalties without an existing modifier contract.
- Unrelated refactors.

## Review conclusion

Plan 165 is implementable without a new system. The strongest seam is `PlayerNeeds.ts`: tune its existing Vigor drain, extend its Hunger/Thirst duration handling, keep food/water restoration there, and retain `restoreNeedsFromSleep()` as the single sleep regeneration mechanism. `HungerState`, `ThirstState`, `VigorState` and `StaminaState` should remain small reusable pool primitives.

The main implementation risk is not the formulas themselves but accidentally creating duplicate ownership between `PlayerNeeds`, rest/time-skip, lodging and HUD. The agent should first trace the existing rest progression and Player state → HUD synchronization, then make the smallest change that lets the existing simulation state remain authoritative throughout a rest/sleep action.

**Zrób git commit i push do main, rebase jeżeli trzeba**
