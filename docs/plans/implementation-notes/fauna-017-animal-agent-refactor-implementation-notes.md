# Implementation Notes: fauna-017 AnimalAgent refactor

Reviewed against current `main` on 2026-09-08. The plan and the architectural review are still broadly accurate; current code still has the same ownership problems they identify. Treat current code as authoritative if line numbers in the review have drifted.

## Current-code findings that matter

- `src/fauna/AnimalAgent.ts` is still the central per-animal integration point and should remain one. Do not introduce a fauna-side equivalent of NPC pressure arbitration and do not redesign `faunaDecision.ts`; its fixed-priority behaviour table is already the correct owner for top-level fauna arbitration.
- Species taxonomy/config, corpse lifecycle, food/water targeting and presentation are still materially embedded in `AnimalAgent.ts`. The planned extractions therefore remain justified rather than being documentation lag.
- `AnimalAgent` still imports `isSpeciesTrappable` / `TRAP_DEFS` / `TrapLureDescriptor` from `src/world/animalTraps.ts`, while animal-trap code depends on fauna types. Move `AnimalKind`/species data first and make `animalTraps.ts` depend on `animalDefs.ts`, not on `AnimalAgent.ts`; do not preserve the existing cycle through re-exports.
- Production construction sites are still `src/fauna/createFauna.ts`, `src/settlement/livestock.ts` and `src/settlement/rats.ts`; they still instantiate `AnimalAgent` positionally. Convert all of them in the same change as `AnimalAgentDeps`. Do not leave compatibility overloads for the positional constructor/update signatures — that would retain the bug-prone API the refactor is meant to remove.
- Copy the `NpcAgentDeps` convention: one exported object type describing construction dependencies, with values read as `deps.x`. Keep optionality identical to today's positional defaults. For `AnimalUpdateContext`, prefer one flat context matching the current update inputs rather than nested domain objects invented only for this refactor.

## Presentation ownership

- `src/shared/agentAnimationSet.ts` is already the intended shared owner. Its current `resolve()` only performs case-insensitive exact-name matching. Before wiring animals to it, add suffix matching for exported names such as `Armature|Walk`; exact match must win when both forms exist.
- Keep gameplay/simulation timers (`attackAnimTimer`, `hurtAnimTimer`, `deathAnimDurationSec`) on `AnimalAgent`. `AgentAnimationSet` owns mixer/actions and clip transitions, not the rule for how long simulation behaviour is gated.
- `src/ui/agentStatusLabel.ts:createAgentStatusLabelController()` already exposes everything fauna needs (`label`, `el`, `sync`, `settleAtZeroHp`, `dispose`). Replace the animal's individual DOM/bar fields with this controller rather than wrapping it in another fauna-specific abstraction.
- For `satiety` / `hydration`, feed `1 - hunger` / `1 - thirst` into the controller. Preserve the existing distance/shadow behaviour by passing `FAUNA_SHADOW_DISTANCE` through `sync()`.

## Shared tick tail / mounted path

- The mounted early-return currently bypasses part of the normal tail, so the shared helper must contain only work that is semantically common to autonomous and mounted animals: timer decrements, maturity, production, needs/presentation/animation bookkeeping that should advance in both modes.
- Keep movement bounds/clamping outside that helper. Mounted animals intentionally must not be constrained to the autonomous home radius.
- Do not read stale `this.isNight` from `driveMounted()`. Thread the same day/night input used by normal `update()` into the mounted call path and derive the hunger/thirst rate from that value once.
- When extracting the helper, compare the old `update()` tail and `driveMounted()` tail statement-by-statement. This step is where unintended behaviour drift is most likely because several operations are order-sensitive.

## `animalCorpse.ts`

- Follow `src/fauna/AnimalLife.ts`: explicit plain state plus free functions operating on a narrow host/context. Do not create a second object with its own identity/lifecycle and do not move authoritative death state away from `AnimalAgent.health.dead`.
- Preserve `AnimalAgent`'s external corpse/harvest API as thin delegates. Other animals, quests and settlement systems should not need to know the new module exists.
- Keep async remains/blood-splat invalidation semantics unchanged: invalidate generation/token state before awaiting asset creation, then reject stale completions. This is a lifetime guarantee, not presentation cleanup.
- `snapshot()` / `hydrate()` should continue to be owned by `AnimalAgent`; serialize/restore corpse state through the extracted state object rather than creating a second persistence boundary.
- D1 should be fixed at terminal ownership points: release/cancel any active source/carcass claim from both `collapse()` and `dispose()`. Make the operation idempotent because both paths may occur during one lifecycle.

## `animalForaging.ts`

- Keep movement/intent ownership (`pursueNeeds`, steering, `setIntent`) in `AnimalAgent`; extract target selection, validation and atomic consumption only.
- Use structural candidate interfaces for carcasses/other agents. Do not import the `AnimalAgent` runtime value into `animalForaging.ts`; otherwise the extraction recreates a dependency cycle.
- Preserve the existing "revalidate at completion, relief only after successful mutation" contract. Household water/item removal, carcass consumption and grass forage consumption are authoritative mutations; failed/raced operations must not reduce hunger/thirst.
- Preserve preference ordering (e.g. owned trough/food before natural/shared alternatives). Do not turn target choice into a generalized scoring framework in this refactor.

## `animalRoaming.ts`

- Extract the trip state machine and the repeated radial-probe primitive, but leave ordinary wander/follow steering on `AnimalAgent` because it depends directly on mother/herd/home state.
- The shared probe should accept injected randomness for tests, but production should retain today's randomness policy. Do not opportunistically make roaming deterministic; `docs/state/fauna.md` explicitly records unseeded ordinary movement as a current limitation/policy boundary.
- Preserve each caller's existing acceptance predicate and score exactly. The abstraction is only the repeated search loop, not a new common notion of "best location".

## Hot-path allocations

- The planned allocation cleanup is valid, but keep it local: replace temporary candidate arrays / `.map()` / `.filter()` in prey alert and dog paths with direct scans into the existing pure resolver contracts where practical.
- Do not cache live candidate arrays on the agent across ticks; nearby NPC/animal sets are caller-owned tick inputs and caching them would create stale world references.
- Use the existing `perf/agentCpuDiag` fauna-pass instrumentation for before/after comparison; do not add a parallel profiler solely for this plan.

## Time skip / persistence

- Maturity currently advances through normal ticking, whereas livestock production already uses an absolute-day readiness anchor. For D3, make age advancement a reusable duration operation and call it from both normal tick and `resolveTimeSkip()`; do not rewrite production into catch-up loops.
- Keep the existing persistence classes unchanged: livestock individual state persists, wild individuals do not, rats do not. This refactor should not widen `SaveData` or add new fauna persistence.
- Be careful with persisted livestock corpse/production state when moving fields into state objects: hydration must restore the exact existing values and must not re-run constructor-only random initialization over restored state.

## Tests / implementation order

- Land `animalDefs.ts` and deps-object conversion first. The latter is what makes focused `AnimalAgent` construction tests practical and removes the highest-risk positional API before later moves.
- Add direct regression coverage before moving behaviour-heavy code: mounted vs. free night metabolism/timers, carcass-claim release on death/dispose, raced source consumption, time-skip maturity, and animation suffix resolution.
- Existing pure tests (`foodWaterTargeting`, corpse-decay, roaming-trip tests) should be redirected to the new owners rather than duplicated while leaving old exports as permanent aliases. Temporary re-exports from `AnimalAgent.ts` are appropriate for external compatibility during the refactor, but the new modules should become the canonical test/import locations.
- After each extraction run TypeScript + tests; run the build for constructor/update rewiring and presentation changes. Browser verification remains manual by the user.

## Scope guards

- Do not touch fauna decision priorities, NPC pressure architecture, combat damage semantics, persistence policy, deterministic/random movement policy, or riding capability rules unless required for D1/D2/D3.
- Avoid splitting `AnimalAgent` merely to reduce line count. Movement, perception commitment, combat coordination, herd/mother state and the central update dispatch remain legitimate agent-owned integration responsibilities.
- `docs/state/fauna.md` and `docs/CODE_INDEX.md` should be updated after the code settles. `pnpm docs:sync` is handled by GitHub workflow; do not run it manually.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
