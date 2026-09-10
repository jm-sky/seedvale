# Implementation notes: ui-input-013 Character stats

Reviewed against `main` on 2026-09-09. Implemented 2026-09-10.

Reviewed against `main` on 2026-09-09. The plan is directionally consistent with the current architecture; the points below are the implementation details that are easy to miss from the plan alone.

## Current ownership and data flow

- `PlayerController.attributes` is the base SPEA source. `PlayerController.effectiveAttributes(nowDays)` delegates to `resolvePlayerEffectivePhysicalAttributes()` in `src/shared/effectivePhysicalAttributes.ts`.
- Player temporary conditions are authoritative in `PlayerController.temporaryConditions`; today `ConditionKind` contains only `poisoning`.
- `resolveEffectivePhysicalAttributes()` currently applies injury first, then temporary conditions. The player wrapper intentionally supplies no injury input; do not infer player injury from HP.
- `temporaryConditions.ts` is not purely observational: resolving condition modifiers lazily advances/removes recovered condition entries. Any breakdown API must therefore be part of the same resolution pass, not a second independent pass that resolves conditions again.
- Derived Stamina max is already synchronized from effective Endurance in `PlayerController.syncDerivedPhysicalCapabilities()`, called from `gameLoop.ts` before the Character snapshot is pushed. Character UI should display `player.needs.stamina.max`; do not recalculate it in presentation code.

## Effective SPEA breakdown

Extend `src/shared/effectivePhysicalAttributes.ts`; do not build a Character-only modifier resolver.

Recommended shape: add one detailed resolver returning `{ effective, contributions }`, then keep the existing `resolveEffectivePhysicalAttributes()` / player/NPC wrappers as compatibility wrappers that return `.effective`. This guarantees gameplay and presentation keep one calculation path.

The contribution must represent the actual applied delta after clamping, not merely the nominal source penalty. Example: if a base attribute is already near `0`, the displayed penalty must match `effective - base`. Otherwise a badge can claim `-12` while the visible/base-effective difference is smaller.

For poisoning, reuse `poisoningSpeaPenalties()` and the already-resolved severity. Avoid calling `applyConditionModifiersToAttributes()` and then separately reconstructing poisoning effects from state. A small internal helper in `temporaryConditions.ts` that resolves current condition contributions once is preferable if needed.

Keep categories domain-side (e.g. `illness`, `injury`, `fatigue`, `effect`) and source ids stable (`poisoning` is sufficient for the current source). Category labels belong in presentation; formulas and source classification do not.

Player has no authoritative physical-injury state. The shared injury seam exists for NPCs, but Character v1 should therefore produce no injury contribution unless a real player injury owner is added elsewhere.

## Character presentation snapshot

Current path is `gameLoop.ts -> Hud.setCharacterStats -> ui-vue/store.ts -> CharacterScreen.vue`. Preserve it.

`CharacterStats` is currently a small per-frame structure with a cheap equality bail in `setCharacterStats()`. Expanding it with arrays of attributes/skills/conditions can accidentally add per-frame allocation/reactivity churn while the screen is closed. Prefer one of these two patterns:

- keep primitive/current-state fields updated per frame and rebuild derived arrays only when their inputs change; or
- push the richer snapshot only while Character Screen is open, while preserving immediate refresh on open.

Do not allocate fresh modifier/condition arrays every frame unconditionally without a corresponding equality/change guard.

Skills should be projected from `PlayerController.skills`; `xp` is authoritative and `value` is derived. Reuse `SkillId` and `SKILL_LABEL`. Character Screen should show `value * 100` (matching the current UI scale); avoid presenting `value` as a raw `0..1` decimal.

Reputation and badges already have separate event/open-time refresh paths in `store.ts`. Do not fold them into the new per-frame stats payload.

## Skills Screen: actionable-only

Current `SkillsScreen.vue` hardcodes all eight skills and currently renders Medicine as a selectable targeted skill. The plan intentionally changes this.

`SKILL_USE` alone is insufficient for visibility because `medicine` is marked `targeted`, while `queryTargetedSkillAction()` has no Medicine consumer. The actual supported targeted consumers are encoded in `src/interaction/targetedSkillAction.ts` (`traps -> inspect-trap`, `repair -> repair-camp`).

Make consumer availability inspectable from the same dispatch/source used by `queryTargetedSkillAction()`; do not add an unrelated Vue list. A small dispatch map or exported predicate derived from the query dispatch is preferable. Then actionable visibility is:

- stance with a real handler: Sneak;
- targeted with at least one implemented consumer: Traps, Repair;
- contextual-only or targeted-without-consumer: hidden.

Update `src/interaction/targetedSkillAction.test.ts` (or a focused sibling test) so adding a future Medicine consumer naturally changes the visibility contract instead of requiring a second registry update.

## Vue structure

`CharacterScreen.vue` currently owns all markup directly and has `max-w-md`. The target two-column desktop layout will require a wider panel. Reuse `UiPanel.vue` where practical and split only genuinely reusable/readability-heavy presentation pieces (section/card, stat row, modifier badge) rather than introducing a component hierarchy for every row.

Keep desktop/mobile differences in Tailwind layout only. Do not duplicate screen state or create separate mobile data models.

## Tests worth adding

- Detailed effective resolver: no condition => no contributions; poisoning => identical effective SPEA to the old resolver plus correct category/source/applied deltas.
- Clamp edge case: contribution delta equals the actual `effective - prior/base` result.
- Aggregator: same-category contributions collapse per attribute; different categories stay separate; zero deltas do not create meaningless badges.
- Actionable skills: current result is exactly Sneak, Traps, Repair, derived from the same gameplay support metadata/dispatch.

Existing `src/shared/enduranceStamina.test.ts` already covers Stamina max mechanics; do not duplicate those formulas in Character tests.

## Likely touched files

Primary: `src/shared/effectivePhysicalAttributes.ts`, possibly `src/shared/temporaryConditions.ts`, `src/player/PlayerController.ts`, `src/app/gameLoop.ts`, `src/ui/createHud.ts`, `src/ui-vue/store.ts`, `src/ui-vue/screens/CharacterScreen.vue`, `src/ui-vue/screens/SkillsScreen.vue`, `src/interaction/targetedSkillAction.ts` and focused tests.

Do not change persistence schema: contributions, badges and Character view models are derived presentation data.