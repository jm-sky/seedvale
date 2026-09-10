# Implementation Notes: Interaction Targeting and Action Semantics

**Reviewed:** 2026-09-10  
**Plan:** `ui-input-015-interaction-targeting-and-action-semantics.md`  
**Codebase baseline:** `main`

## Current ownership

### Target candidates

`src/app/interactables.ts::buildInteractables()` is the per-frame candidate gatherer. It already normalizes NPCs, animals, items, water edges, camp objects, buildables, storage, resources and other world objects into `Interactable[]`.

Do not add another registry or raycast layer.

`Interactable` is intentionally a thin adapter. Most variants carry only stable ids/live references plus display snapshots needed by the current frame. Mutation authority remains in domain owners.

### Gaze selection

`src/interaction/findInteractionTarget.ts::pickInGaze()` currently:

- computes yaw forward vector,
- filters by `range` / optional per-candidate `interactRange`,
- filters by `minDot`,
- picks strict highest dot,
- has no distance/actionability tie-break,
- has no previous-target hysteresis.

This is the correct place for generic gaze ranking. Prefer enriching its inputs/results or adding a nearby pure ranking helper rather than moving world/domain knowledge into it.

### Current-target composition

`src/app/gameLoop.ts` currently composes target selection from:

- combat soft-lock / combat cycle state,
- world cycle state,
- normal `cycleCandidates`,
- `pickInGaze(...)`,
- synthetic `buildDigTarget(...)`,
- synthetic `buildCombatTarget(...)`.

Normal `cycleCandidates` are currently only distance-filtered (`INTERACT_RANGE`) and therefore can include targets outside the gaze cone. Their order is inherited from `buildInteractables()` source iteration order.

Do not alter combat soft-lock semantics unless required for compatibility. The plan's cycling change is about non-combat world interaction.

### Prompt presentation

`src/ui-vue/screens/FlavorDialog.vue` renders the shared gaze prompt. Current behavior:

```ts
ui.flavorDialog.prompt.startsWith('[')
  ? prompt
  : `[E] ${prompt}`
```

Therefore many `promptLabel` strings implicitly encode action slots. `gameLoop.ts` then appends cycle and inspect hints as text.

`FlavorDialog` already has a separate modal action contract (`InteractionPanelAction`) with `enabled` and `reasonLabel`; this is useful precedent but not the same thing as the lightweight gaze prompt view.

### Inspect

`src/app/inspection/inspectionTarget.ts::inspectionTargetRef()` is the canonical capability check created by `ui-input-014`.

Current inspectable variants:

- `palisade`,
- `playerWell`,
- `residentialBuilding`,
- `standingTorch`,
- `terrainPreparation`.

Do not duplicate inspectability in a second boolean table. The new interaction view should derive inspect action availability from this seam.

### Touch

`src/ui-vue/screens/TouchChrome.vue` currently:

- always renders E,
- always renders R,
- conditionally renders Inspect from `ui.touch.inspectAvailable`,
- conditionally renders Cycle from `ui.touch.cycleTargetAvailable`.

`src/input/createTouchControls.ts` maps those callbacks into the same `KeyState` edges desktop uses. Keep this shared input path.

Important: mobile E uses pointer-down + pointer-up because ranged combat depends on draw/release. Do not convert it to simple click semantics.

## Interaction-view placement

Prefer a small module near current interaction types, e.g.:

`src/interaction/interactionView.ts`

Responsibilities:

- derive target/action presentation from the already-selected `Interactable`,
- expose primary/alternate/inspect slots,
- carry `enabled` + `reasonLabel`,
- contain no mutation callbacks if the lightweight HUD only needs view data,
- use application-provided/read-only context for inventory/capability/state checks where necessary.

Avoid importing Vue or UI store types here.

Do not make the view resolver responsible for selecting the target. Keep these two concerns separate:

```text
candidate gathering + ranking
→ selected Interactable
→ interaction view/query
→ prompt/touch rendering
```

## Migration strategy for `promptLabel`

A full removal of `promptLabel` from every `Interactable` in one patch is unnecessary and risky.

Recommended sequence:

1. Add the structured view.
2. Cover representative/high-frequency target kinds first.
3. For uncovered targets, temporarily adapt existing `promptLabel` to one primary action/status view without changing gameplay.
4. Move key/action semantics out of hard-coded label strings incrementally.
5. Remove obsolete key tokens from `promptLabel` only when their structured replacement is in place.

The compatibility adapter must not become permanent domain logic in Vue.

## Representative current prompt inconsistencies

`src/app/interactables.ts` currently includes examples such as:

- tent: `[E] Odpocznij · [R] Zbadaj`,
- bedroll/platform: `[E] Zbadaj ...`,
- container: `[E] Otwórz ... · [R] Podnieś ...`,
- drying rack inactive: `[E] Zacznij suszenie`, but active incomplete: `Suszy się…`,
- hive: sometimes E+R, sometimes only R, sometimes flavor-only,
- animal: often bare `Atakuj`, `Steruj`, `Dosiądź`, `Obserwuj`,
- land plot: bare `Kup działkę — N monet`,
- tree/deposit/corpse: often bare verb without explicit `[E]`,
- water/campfire: optimistic E/R labels even when inventory requirements are not met.

These are the reason structured slots are needed. Do not try to solve them by more string conventions.

## Actionability for ranking

The generic gaze picker should not import all domain rules.

Preferred approach:

- derive a lightweight candidate presentation/actionability classification before ranking, or
- provide a generic callback/rank metadata computed by the interaction-view layer/application layer.

The only semantic distinction required by the plan is:

```text
actionable > status/flavor-only
```

when centeredness is effectively tied.

Do not introduce a global `kind -> priority` map such as NPC/item/buildable weights without a separate product decision.

## Stable deterministic fallback

Because many candidates do not share a common `id` field, avoid depending on JS source-array order for exact ties.

A small helper may derive a stable key from `Interactable` discriminant + its stable identity where one exists. If a variant genuinely lacks stable identity, distance + kind plus a deterministic coordinate fallback is acceptable for presentation-only tie-breaking.

Do not persist this key.

## Hysteresis state ownership

Previous selected interaction target belongs to runtime application/input state, near the current target logic in `gameLoop.ts` or a small extracted target-selection helper.

Do not add it to:

- SaveData,
- domain world records,
- Vue store as authoritative selection state.

Store the minimum identity/reference needed to compare previous target to the new candidate set each frame.

When target disappears or becomes ineligible, clear it immediately.

## Synthetic targets

`buildDigTarget()` and `buildCombatTarget()` are intentional fallback paths. Preserve their priority relationship:

- real interactables should continue to win over synthetic ground work,
- combat fallback remains tied to held melee/ranged tools,
- do not inject synthetic dig targets into the main world candidate array just to make cycling easier.

If the structured interaction view needs to represent them, treat the returned synthetic `Interactable` normally after selection.

## Quest range override

`Interactable.animal.interactRange` exists for quest-driven spot-animal reach and ranged tools can also widen animal candidate range. Any refactor of ranking/cycle eligibility must continue honoring per-candidate range overrides.

Do not collapse all eligibility back to a flat `INTERACT_RANGE`.

## Combat separation

`src/player/playerCombat.ts` has its own:

- living target ranking,
- soft lock,
- combat cycle index,
- world cycle mode.

Normal interaction-target hysteresis/ranking must not accidentally replace or double-rank combat soft-lock targets.

When `playerCombat.isActive()` is true, preserve current combat selection precedence unless a compatibility bug is directly caused by the new interaction view.

The mobile `Shift+Tab` parity question is explicitly deferred by the plan.

## Blocked reasons

Good existing patterns to reuse:

- `FlavorDialog` action `{ enabled, reasonLabel }`,
- `buildWorldInspection()` action models,
- `describeWellWork(...)`,
- `describeWellRoofRepair(...)`,
- construction/repair preflight helpers,
- `ITEM_CATALOG` capabilities,
- inventory capacity helpers,
- water-source gates.

Where gameplay code currently only discovers failure during execution, do not copy the mutation branch into the presentation resolver. Extract/reuse a read-only predicate/result alongside the domain action only when it is cheap and stable.

Execution toasts remain necessary because state can change between prompt render and input.

## Targeted skills

Current flow in `gameLoop.ts`:

```text
selectedSkill + target
→ queryTargetedSkillAction(...)
→ targetedSkillPrompt(...)
→ E executes executeTargetedSkillAction(...)
```

Keep the skill query as an override of the primary slot. Do not duplicate candidate gathering or add a skill-only target picker.

If the structured interaction view API can cleanly accept an optional primary override, prefer that over special string concatenation in `gameLoop.ts`.

## UI state

`src/ui-vue/store.ts` currently exposes:

- flavor prompt string/highlight/progress,
- touch cycle availability,
- touch inspect availability.

The plan likely needs a minimal structured gaze-prompt state and touch primary/alternate availability.

Keep store state presentation-only. Do not store selected `Interactable` objects in Vue.

## Tests to place near pure logic

Prefer unit tests for ranking/view construction rather than testing the whole render loop.

Likely locations:

- `src/interaction/findInteractionTarget.test.ts`,
- new `src/interaction/interactionView.test.ts`,
- existing touch/store tests for availability wiring,
- targeted-skill tests for override compatibility.

Important regression coverage:

- quest `interactRange`,
- flavor-only vs actionable tie,
- distance tie-break,
- hysteresis threshold,
- normal cycle excludes behind-camera targets,
- touch R hidden/disabled correctly,
- ranged touch E still preserves press/release.

## Overlap guardrails

### `ui-input-014`

Already owns construction `V` inspection, `WorldInspectionView`, inspection action execution and touch Inspect capability. Reuse it; do not rebuild it.

### `items-player-022`

Already owns:

- composite camp interaction target,
- structured camp inspection details,
- per-component camp repair actions,
- dropped-item target grouping,
- house entrance marker/placement polish,
- standing-torch burn duration.

`ui-input-015` may make those interactions render more consistently later, but must not implement those feature-specific changes itself.

## Documentation

After implementation, update only docs whose current-state description materially changed, likely:

- `docs/STATE.md` UI/input summary,
- `docs/state/player-systems.md` interaction/input description,
- `docs/CODE_INDEX.md` if a new important `interactionView.ts` entry point is introduced,
- implementation summary in this notes file.

Do not manually edit generated plan indexes if the repository workflow owns them.

## Verification

Automated checks should cover TypeScript, lint and relevant tests/build according to repository conventions.

Browser/manual verification is performed by the User, not the AI agent. Use the scenarios from the plan; do not run browser verification yourself.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
