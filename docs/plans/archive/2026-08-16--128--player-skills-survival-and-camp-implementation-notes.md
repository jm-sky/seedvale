# Implementation notes: Player Skills v2 — Survival & Camp (plan 128)

## Review summary

Plan 128 is still `planned` and its dependency on plan 124 is satisfied. The repository already contains the Skills foundation and the complete first-pass Sneak implementation from plan 124, but there is **no skill XP/progression, no Survival skill, and no skill persistence** yet. `PlayerSkills` is deliberately minimal today: `SkillId = 'sneak'`, `SkillState = { value, active }`, Sneak fixed at `0.5`. fileciteturn7file0

The camp pieces are more complete than the plan's wording suggests. The code already has player-built fires, player-built tents, blanket/rest visuals, tent rest and town/camp rest flows, plus the four player survival pools. `restCampSequence.ts` is the main existing camp-rest sequence and should be extended rather than replaced. fileciteturn19file0

The main architectural gap is therefore **composition**, not creation: add progression and Survival modifiers around existing actions, then derive a small camp/rest context from the existing fire/tent/rest state.

## Important discrepancies / corrections to the plan

1. **Skills UI is no longer hypothetical.** `SkillsScreen.vue` and its store/mount wiring were added by plan 124. Do not create another screen or another skills state path. The existing implementation notes for plan 124 document the exact wiring through `ui-vue/store.ts`, `mount.ts`, `App.vue`, `PauseMenuEntriesMain.vue`, `createApp.ts` and `gameLoop.ts`. fileciteturn21file0

2. **Player needs are already implemented and persisted.** `PlayerNeeds` contains stamina, vigor, hunger and thirst; stamina is transient while hunger/thirst/vigor are persisted. Rest currently restores vigor and stamina fully. Do not introduce another survival/needs model. fileciteturn17file0

3. **Camp rest already has a dedicated sequence.** `restCampSequence.ts` owns crouch → blanket → lie → sleep → teardown → stand, with a `variant` of `camp` or `tent`. For a normal camp it creates a temporary blanket prop; for tent rest it skips placing that prop. Extend this flow or the caller's rest-resolution logic instead of introducing `CampManager`. fileciteturn19file0

4. **Tents are persistent world objects.** `createPlacedTents.ts` owns `PlacedTent`, placement and packing, and exposes `list()`/`nodes()`; persistence already stores their position/yaw. Use this API for proximity checks. fileciteturn10file0

5. **Campfires already have a shared `PlacedFires` representation and interaction path.** `interactables.ts` includes nearby player fires and exposes their `fire.isLit()` state. The same file also exposes nearby tents as interactables. Reuse these existing proximity mechanisms. fileciteturn24file0

6. **Cooking is already expanded to species-specific raw meat, but still converges to one `roasted_meat` output.** `campfireCooking.ts` is a flat recipe table and `COOK_DURATION_SEC` is currently 5 seconds. Survival should modify the resulting food effect, not the recipe/output item and not the cooking duration. fileciteturn15file0

7. **The plan's suggested file names are partly stale.** Current tent code is under `src/items/createPlacedTents.ts`; camp-rest orchestration is `src/app/restCampSequence.ts`; fires are under `src/settlement/PlacedFires.ts`. Verify exact paths before changing anything.

8. **Plan 128 has no `domain:` frontmatter even though `docs/plans/README.md` now asks new plans to declare one.** The natural domain is `items-player`, with persistence as a secondary concern. This is documentation hygiene, not an implementation dependency. fileciteturn4file0

## Current architecture to preserve

### Skills

`src/player/PlayerSkills.ts` is intentionally not a generic registry/framework. Keep it small. The current code explicitly says to extend `SkillId`/`PlayerSkills` only when a second skill is actually implemented. Add `survival` directly and introduce only the minimum progression helpers needed by the two existing skills. fileciteturn7file0

Recommended shape:

```ts
type SkillState = {
  value: number
  xp: number
  active: boolean
}

type SkillId = 'sneak' | 'survival'
```

Do not introduce a separate `SkillManager`, registry, perk system or event bus just for XP.

### Player controller

`PlayerController` owns `skills` and already exposes movement state used by Sneak. Keep skill state owned by the player. Skill effects should be calculated at the existing action boundary, not in a global per-frame modifier pass.

Sneak should continue using `player.skills.sneak.value` everywhere it currently uses the fixed value. Its movement and fauna-perception integration should remain unchanged apart from the source value. Plan 124 already established the correct extension point and deliberately avoided a second detection system. fileciteturn21file0

### Player survival needs

Use `PlayerNeeds` and existing `restoreNeedsFromSleep()`/`vigor`/`stamina` behaviour. The plan's camp-quality effects should change the existing rest outcome, not introduce `comfort`, `sleepQuality`, `temperature` or another parallel pool. fileciteturn17file0

### Camp objects

Use:

- `PlacedFires.list()` → fire position + `fire.isLit()`;
- `PlacedTents.list()` → persistent tent positions;
- existing blanket prop/`restCampSequence.ts` for the temporary blanket visual;
- existing rest/town/tent interaction flow in `gameLoop.ts`.

`interactables.ts` already builds both campfire and tent candidates from proximity, so there is no need for a second object-query system. fileciteturn24file0

## Concrete implementation approach

### 1. Add minimal skill progression primitives

Extend `PlayerSkills.ts` with:

- `survival` in `SkillId`;
- `xp` in `SkillState`;
- default Survival state;
- a small pure function for XP → normalized `value`;
- a small function to award XP to a skill and clamp state safely.

Prefer one deterministic curve shared by both skills. The plan requires continuous progression, not RPG levels. A simple bounded curve such as a monotonic `xpToValue()` with diminishing returns is sufficient. Keep `value` in `[0, 1]` because existing Sneak consumers already treat it as a normalized multiplier input.

Do not add integer levels unless the UI needs a display-only derived level. XP should be the authoritative persisted progression and `value` should be derived or kept synchronized from it.

Important: avoid per-frame XP. XP should be awarded only from successful completion callbacks/state transitions.

### 2. Sneak XP

The existing Sneak state is toggled through the Skills screen and movement state is already available. Add XP at meaningful completed use intervals rather than every frame.

A practical implementation is a small accumulated-use timer/distance counter owned by the player skill logic or an existing movement path, with XP awarded after a threshold while Sneak is active and the player is actually moving. Do not award XP while stationary merely because the toggle is on.

Reset/clear the temporary accumulator when Sneak is disabled or the relevant action is cancelled. Do not persist this temporary accumulator.

If the existing movement update is the only sensible hook, keep the calculation cheap and avoid allocations.

### 3. Survival XP event points

Award XP only after the existing action has successfully completed:

- ignite: after `ignite` channel completes and the fire is actually lit;
- tent setup: after placement/setup succeeds;
- camp rest: after the rest completes, not when it starts;
- cooking: after raw meat is consumed and `roasted_meat` is added;
- tent rest: after the existing tent-rest completion path succeeds if the plan treats this as a separate meaningful use.

Avoid double-awarding when an action is cancelled. The existing busy-channel flow has explicit completion/cancellation semantics; attach XP to the success branch rather than polling the channel each frame.

The repository's current cooking model is a simple recipe lookup and 5-second busy action, so keep that mechanism intact. fileciteturn15file0

### 4. Survival → ignite duration

Find the existing `ignite` duration constant / busy-channel duration path in `gameLoop.ts` / related duration helpers. Do not create a second ignition action.

Implement a pure modifier such as:

```ts
modifiedIgniteDuration = baseIgniteDuration * survivalDurationMultiplier(value)
```

Keep the multiplier bounded and modest. Do not decide final balance values until the current base duration is confirmed from code/tests.

The modifier should be evaluated once when the action starts. Do not continuously mutate a running channel's duration as XP changes.

### 5. Survival → tent setup duration

The current persistent tent representation only stores placement state; the setup/packing interaction is in the app interaction/rest flow. fileciteturn10file0

Find the actual tent-placement busy duration and apply the Survival multiplier there. Do not modify `createPlacedTents.ts` merely to support timing. That module should remain responsible for world-object state.

Packing should remain unchanged unless the current code already has a timed pack action.

### 6. Survival → cooked meat value

Keep all current recipes and the single `roasted_meat` output. The repository already maps multiple raw meat types to `roasted_meat`. fileciteturn15file0

Locate the existing consumable definition/eat-food path for `roasted_meat`. Apply a Survival multiplier to the hunger restoration value at consumption time.

This is preferable to mutating the item catalog globally because the effect belongs to the player using the food and must not create a second item variant.

Avoid changing inventory quantities or recipe output based on skill.

### 7. Build a small camp-context calculation

Do not create `CampManager`.

Introduce a small pure/runtime helper close to the existing rest flow, for example a `CampRestContext` shape:

```ts
type CampRestContext = {
  hasBlanket: boolean
  hasTent: boolean
  hasWarmFire: boolean
}
```

The exact name is flexible; the important point is that this is **derived context**, not persistent world state.

Resolve it from existing objects at the moment rest begins:

- blanket is true for the camp-rest path that already creates the blanket, or whenever the existing rest contract explicitly supplies it;
- tent is true for the tent-rest variant / nearby selected tent;
- warm fire is true only when a `PlacedFire` is lit and within a small configured XZ radius.

Do not scan all fires every frame. Rest is an infrequent action, so a one-time proximity lookup at rest start is cheap. If `PlacedFires` already has a nearest/query helper, use it; otherwise a bounded `list()` scan at rest start is sufficient.

### 8. Rest quality mapping

Use the four combinations from the plan as a small deterministic table/function:

- blanket only → baseline/poorest rest;
- tent + blanket → better;
- blanket + lit nearby fire → better;
- tent + blanket + lit nearby fire → best.

Do not add new player stats. Express the effect through the existing rest outcome, primarily the existing vigor/stamina restore path and any existing rest penalty. `PlayerNeeds.restoreNeedsFromSleep()` currently fully restores vigor/stamina, so inspect the actual rest caller before deciding whether quality should change a penalty/delta around the skip rather than modifying the shared restore function globally. fileciteturn17file0

If current rest is always a full restore with no penalty, the plan's "better/worse rest" requirement cannot be implemented by simply adding another full restore. In that case, the cleanest interpretation is to modify the existing rest result/penalty mechanism at the caller, not to invent a new `comfort` pool.

### 9. Fire warmth

Use `PlacedFires` and `fire.isLit()` as the source of truth. `interactables.ts` already distinguishes lit/unlit fires. fileciteturn24file0

A fire that is merely placed but extinguished must never contribute to warm rest.

Use XZ distance; terrain height is irrelevant for the initial simple radius. Keep the radius small enough that a distant fire elsewhere in the world cannot affect rest.

### 10. Skills persistence

Current canonical save schema is v13 and currently persists `playerNeeds`, but no skills. fileciteturn13file0

Add a new version rather than altering v13 in place. Follow the existing `SaveDataV1...SaveDataV13` migration chain and validators.

Persist:

- Sneak XP/value;
- Survival XP/value.

Do not persist `active` if it remains runtime state, and do not persist action/busy-channel progress or temporary Sneak XP accumulation.

For old saves:

- Sneak must restore to the existing fixed 0.5 behaviour when no progression data exists;
- Survival must start at its default zero/initial state;
- `active` must be false.

Prefer a migration that constructs a complete default skill object and then overlays validated persisted fields. Defensively clamp malformed XP/value rather than allowing NaN/out-of-range values into movement/fauna calculations.

Update `saveData.test.ts` with at least one migration test from v13 and one round-trip test for the new schema.

### 11. Skills UI

Extend the existing `SkillsScreen.vue`; do not add another screen.

Expose both skills and XP/value through the existing `ui-vue/store.ts` path. The current screen already supports Sneak and is presentation-only, with writes routed back to the game layer. Preserve that ownership model. fileciteturn21file0

Show:

- normalized progress / percentage;
- XP progress bar;
- concise effect description for each skill;
- Sneak active state/toggle exactly as today.

Survival should be passive, so do not add an activation toggle for it.

## Suggested file ownership

Likely touch points after confirming exact current code:

- `src/player/PlayerSkills.ts` — skill model, XP/progression helpers;
- `src/player/PlayerSkills.test.ts` — progression tests;
- `src/player/PlayerController.ts` — only if a clean Sneak-use accumulation hook is needed;
- `src/app/gameLoop.ts` — action completion hooks, rest context, cooking/food effect integration where currently wired;
- `src/app/restCampSequence.ts` — only if the sequence needs to expose the chosen rest variant/context; avoid changing its visual state machine unnecessarily;
- `src/app/busyChannelDurations.ts` / related duration constants — existing `ignite`/tent timing source, if present;
- `src/items/campfireCooking.ts` — likely no structural change; preserve recipe table;
- `src/items/itemCatalog.ts` or current consumable definition — locate `roasted_meat` hunger value;
- `src/items/createPlacedTents.ts` — read/use API, probably no change;
- `src/settlement/PlacedFires.ts` — read/use API, probably no change unless a nearest-fire helper is clearly reusable;
- `src/app/interactables.ts` — reuse existing tent/fire interaction model; avoid duplicating candidate logic;
- `src/persistence/saveData.ts` — schema + migration + validation;
- `src/persistence/saveData.test.ts` — persistence coverage;
- `src/ui-vue/store.ts`, `src/ui-vue/mount.ts`, `src/ui-vue/screens/SkillsScreen.vue` — extend existing Skills UI state;
- `src/ui-vue/App.vue` / pause menu only if the current screen wiring requires it (plan 124 already added it).

## Dependencies

Plan 124 is the direct prerequisite and is implemented; `docs/plans/README.md` marks plan 128 ready from the dependency perspective. fileciteturn4file0

Relevant existing foundations:

- plan 106: player needs, food, cooking, rest;
- plan 124: PlayerSkills + Sneak + Skills UI;
- existing placed fire/tent persistence;
- current v13 SaveData schema.

No new external dependency should be required.

## Edge cases

- Loading an old save must not accidentally make Sneak active.
- Loading malformed skill values must clamp to safe `[0,1]` values.
- XP awards must be idempotent with respect to cancelled/retried busy actions.
- Do not award XP twice when an action completion also triggers another callback/path.
- Rest cancelled during setup must give no Survival XP and must not alter camp quality state.
- A fire that extinguishes before rest begins gives no warmth; a fire becoming extinguished after the sleep skip starts should not retroactively change the already selected rest result unless the existing design explicitly models that.
- A tent that is packed/removed before rest starts cannot be used as tent context.
- Rest must not accidentally use a settlement NPC fire or other fire representation if the plan specifically means player campfires. If the intended behaviour includes settlement fires, document that explicitly and use the same lit-state abstraction rather than a second campfire concept.
- Cooking XP should be awarded after successful inventory mutation, not when `[R]` is pressed.
- Cooking from all current raw meat variants must still produce the same `roasted_meat` item.
- Sneak XP should not accrue while toggled on but inactive because the player is resting, crouched, or otherwise not actually using the movement mechanic.
- Do not introduce per-frame proximity scans for campfires/tents; rest is an event boundary.
- Do not persist temporary busy-channel progress.

## Risks / design cautions

### Rest quality vs current full restore

This is the biggest plan/code mismatch. `restoreNeedsFromSleep()` currently restores vigor and stamina fully. If there is no existing rest penalty to tune, the implementation needs a small extension at the rest-resolution boundary; do not weaken the global `restoreNeedsFromSleep()` function because that would affect town/tent rest indiscriminately. fileciteturn17file0

### XP curve ownership

Avoid making `value` and `xp` independently mutable without a synchronization rule. Prefer XP as the progression source and derive normalized value from it, or make one explicit helper the only mutation path.

### UI state frequency

Skills UI does not need per-frame XP animation. Push skill state using the same cheap UI update pattern already used by the current Sneak screen, and only update when a skill actually changes if the current store architecture makes that straightforward.

### Persistence versioning

Do not silently add optional skill fields to v13 while calling it canonical v13. The current file explicitly defines v13 as canonical and has a migration chain. Add the next version cleanly. fileciteturn13file0

### Plan 040 weather

Do not pull weather into this implementation. Weather already exists and plan 128 explicitly keeps weather effects out of scope. A future weather→camp integration can consume the same camp context later without changing this architecture.

## Tests to add

At minimum:

- skill XP award and clamping;
- deterministic XP → value curve;
- Sneak progression;
- Survival progression;
- ignite duration modifier monotonicity and bounds;
- tent setup duration modifier monotonicity and bounds;
- roasted meat value increases with Survival and never changes item kind;
- camp context detection for each fire/tent/blanket combination;
- extinguished fire gives no warmth;
- rest-quality mapping for all four combinations;
- save/load round-trip for both skills;
- v13 → new save migration with default Survival and legacy Sneak 0.5;
- malformed persisted skill data is clamped/rejected safely.

Keep these pure where possible. Avoid browser-only tests for simple progression/context calculations.

## Verification notes for Claude

Before implementation, inspect the exact current rest/tent/cooking completion branches in `gameLoop.ts` and the current busy-channel duration definitions. The plan names several mechanisms that have moved since it was written.

After implementation, run the normal technical checks and then browser verification specifically for:

1. Sneak XP grows only from actual use.
2. Survival XP grows after successful ignite, tent setup, cooking and rest.
3. Cancelled actions do not award XP.
4. Existing Sneak movement/fauna effects still use the progressed value.
5. Survival shortens ignite/tent setup without making them instantaneous.
6. `roasted_meat` remains one item and restores more hunger at higher Survival.
7. Blanket-only rest is the weakest camp outcome.
8. Tent + blanket and blanket + lit fire are better than blanket alone.
9. Tent + blanket + lit fire is the best outcome.
10. Extinguished/distant fires do not provide warmth.
11. Reload preserves XP/progress.
12. No per-frame camp scans or noticeable new frame-time cost appear.

## Out of scope / do not accidentally add

- perk trees;
- manual skill points;
- classes;
- new RPG stats;
- separate Survival/camp managers;
- new cooking item variants;
- new temperature/comfort stats;
- weather-dependent camping;
- multiplayer progression;
- LLM-driven skill progression.

The existing architecture is already sufficient. The implementation should be a set of small extensions at existing action boundaries, not a new gameplay framework.

**Repository source of truth:** current code on `main`, with `docs/STATE.md` and `docs/plans/README.md` used only for context/status. fileciteturn5file0 fileciteturn4file0
