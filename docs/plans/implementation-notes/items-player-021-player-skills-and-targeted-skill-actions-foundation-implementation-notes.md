# Implementation Notes: items-player-021 — Player skills and targeted skill actions foundation

## Current skill ownership

- `src/player/PlayerSkills.ts` is the current source of truth for `SkillId`, `SkillState`, `PlayerSkills`, labels, the shared XP curve, `createPlayerSkills()`, `awardSkillXp()`, restore, debug setters and existing skill modifiers.
- `xp` is authoritative progression state; `value` is derived. `active` is runtime-only and currently meaningful for Sneak. Do not reuse it as the targeted-skill selection state.
- `createPlayerSkills()` currently constructs all six skills explicitly. Adding `medicine`/`repair` to `SkillId` therefore requires updating this constructor and all exhaustive `Record<SkillId, ...>` sites rather than weakening the type to make compilation pass.
- The header comment in `PlayerSkills.ts` still says "two skills" although the code owns six. Fix stale architectural comments encountered in the touched skill surface rather than preserving that contradiction.

## Persistence contract

- `src/persistence/saveData.ts` imports `SkillId`; `SaveSkills` is currently `Record<SkillId, SaveSkill>`. Expanding `SkillId` therefore changes the required serialized shape at the type level.
- `restorePersistedSkills()` already overlays a `Partial<Record<SkillId, { xp: number }>>` onto a fresh `createPlayerSkills()` set and defaults absent/non-positive XP to `0`. Preserve/reuse that behavior for old saves rather than adding special Medicine/Repair restore branches in gameplay code.
- Inspect the current save schema parser/migration path before changing the serialized contract. If the parser currently requires every key because `SaveSkills` is a required `Record`, normalize/migrate older saves through the existing persistence pipeline so missing `medicine`/`repair` become `{ xp: 0 }` (or equivalent canonical representation).
- Never persist derived `value`, `active` or the selected targeted skill.

## Existing world interaction boundary

- `src/interaction/Interactable.ts` is explicitly a thin, per-frame adapter. It is rebuilt from live world objects and must not become a persisted capability/skill registry.
- The existing trap `Interactable` deliberately carries only stable identity plus prompt-relevant state (`id`, `trapKind`, `state`); durability is resolved from the live `PlacedTraps` owner at interaction time. Preserve that pattern for the vertical slice.
- `src/app/interactables.ts` owns candidate construction and prompt shaping. It already builds trap candidates through the normal interaction path.
- `src/app/gameLoop.ts` imports `pickInGaze` and `resolveInteraction` and is the current gameplay dispatch integration point. Reuse this target-selection result; do not add a second raycaster/proximity pass for skill mode.
- Keep Vue presentation-only. Current state docs explicitly note that contextual dialog actions are resolved by gameplay rather than switched on interactable kind in Vue.

## Trap vertical slice

- `src/world/animalTraps.ts` is pure domain logic and deliberately free of Three.js/DOM/`PlayerController`.
- `PlacedTrapRecord` owns live `state`, `durability`, `skillAtActivation`, weather accounting and bait. `TRAP_DEFS[kind].maxDurability` is the canonical max condition denominator.
- The existing trap interaction snapshot does not carry durability by design. `Traps → Inspect trap` should therefore resolve the current trap record by `id` from the existing `PlacedTraps` owner at action/query execution time rather than copying durability into `Interactable`.
- The inspect result should expose meaningful existing state such as armed/disarmed/broken, current durability ratio/uses and bait presence if that information is available through the current public owner API. Add the smallest read seam to `PlacedTraps` if necessary; do not expose mutable internals wholesale.
- Do not change `trapDetectionChance`, `skillAtActivation`, setup duration, weather wear, capture durability spending, arming/disarming semantics or XP awards as part of the foundation vertical slice.
- Inspection should not award XP unless implementation discovers a pre-existing one-shot knowledge mechanism that makes it non-farmable. The plan assumes no XP for the proof-of-concept.

## Skill evaluation boundary

- Do not make the targeted-world action resolver the only place skill competence can be evaluated. Future self-treatment, inventory sharpening and crafting do not naturally have an `Interactable`.
- Prefer a small pure skill-evaluation contract near the player/progression domain that can read a primary skill and optional supporting inputs without importing Three.js or Vue.
- Do not ship a generic weighted-average engine in this plan. The shared seam only needs to preserve the distinction between primary competence and optional support/context; concrete Medicine/Repair/Traps consumers decide how support affects thresholds, duration, quality or other outcomes.
- Avoid a generic `SkillActionManager` that owns registrations and state for every domain. A small application dispatch seam plus domain-owned handlers/operations is sufficient.

## Selected targeted skill lifecycle

- Keep selection runtime-only and separate from `PlayerSkills`. It belongs with player interaction/input/application state, not persisted progression state.
- Selection must be cancelable and must not mutate world state. Normal interaction behavior should remain unchanged when no targeted skill is selected.
- Avoid adding per-frame computation beyond reusing the current gaze target. Resolve contextual skill actions only for the selected skill/current target when needed for prompt/action handling.

## UI/input integration

- Reuse the current contextual interaction/view-model flow. Gameplay decides whether the selected skill has an action for the current `Interactable`; Vue renders the resulting label/action.
- Preserve current keyboard/touch semantics where practical. Do not add domain-specific Vue conditions such as `repair && trap` or a second input mode that bypasses the normal interaction target.
- Ensure cancellation/closing a modal or invalidating the target cannot leave a stale executable action referencing an old target snapshot.

## Tests worth adding

- `PlayerSkills`: Medicine/Repair initialization, label coverage, XP/value progression and restore with missing saved keys.
- Persistence: an older/partial skill save loads with deterministic novice Medicine/Repair state and round-trips through the current schema.
- Pure skill evaluation: primary skill read and optional support/context without a forced weighted formula.
- Targeted action query: no mutation during availability checks; incompatible target returns no action.
- Revalidation: target removed/changed between query and execution fails safely.
- Trap inspect: resolves the live placed-trap record by id and reports current real state; no mutation/XP side effects.
- Regression: ordinary trap interaction without selected skill retains current arm/disarm/collect behavior.

## Likely files to inspect first during implementation

- `src/player/PlayerSkills.ts`
- `src/persistence/saveData.ts` and current save schema/migrations
- `src/interaction/Interactable.ts`
- `src/interaction/findInteractionTarget.ts`
- `src/interaction/resolveInteraction.ts`
- `src/app/interactables.ts`
- `src/app/gameLoop.ts`
- `src/world/animalTraps.ts`
- `src/world/createPlacedTraps.ts`
- current Vue skills/contextual interaction store/components
- `docs/state/player-systems.md`

## Related plan warning

`items-player-019-player-camp-repair-and-sewing-kit.md` currently explicitly avoids a Repair skill and assigns camp repair competence to Survival. After `items-player-021` is implemented, that plan must be reconsidered against the new Repair contract rather than implemented unchanged. Do not silently preserve two competing meanings of repair competence.

Likewise, any existing Medicine/healing plan should reuse the new skill-evaluation/targeted-action seams without creating a parallel health or targeting system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
