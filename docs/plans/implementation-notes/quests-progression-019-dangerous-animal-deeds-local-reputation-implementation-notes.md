# Implementation Notes: quests-progression-019 — Dangerous Animal Deeds & Local Reputation

**Reviewed:** 2026-09-11
**Baseline:** `main` at `2fc8d5635160b0ade65f5ba2c6982014f9aa853d`

## Review findings

- `fauna-022-animal-variants-and-exceptional-dangerous-animals.md` is still `planned`; there is currently no production `dangerSignificance` contract. Treat it as a hard implementation dependency. After fauna-022 lands, re-check the final fauna-owned API instead of implementing the draft shape from 019 verbatim.
- Existing reputation ownership already matches the plan: `src/reputation/ReputationManager.ts` is the sole store, and `applySocialConsequence()` is the shared fan-out seam. Do not add another reputation manager or write dimensions directly.
- Existing `src/reputation/socialExposure.ts` is specifically a deterministic risk roll for grave disturbance. Do not generalize it into gossip/witness simulation for this plan; animal deeds need their own small pure resolver.

## Player-kill seam and quest ordering

- Player melee and ranged already converge on `AnimalAgent.takeDamage(..., 'player')` in `src/app/gameLoop.ts`, and both use the same post-kill helper `animalDeathToastLine(animal)`.
- Do **not** base attribution on the generic death hook. `AnimalAgent.collapse()` synchronously calls `onDeath?.(animalId)` for every cause, and `createApp.ts` routes that to `QuestManager.onInteractObjective({ type: 'animal_died', ... })` plus other lifecycle consumers.
- Important ordering trap: for a player lethal hit, `takeDamage()` reaches `collapse()` and the generic quest death dispatch before control returns to `gameLoop.ts`. Therefore querying quest ownership only inside the current post-kill `animalDeathToastLine()` can be too late: the matching quest may already have advanced.
- Resolve this with a narrow quest-ownership seam that can answer whether the specific `animalId` is currently owned by an active `kill_target_animal` objective **before** the generic death transition consumes it, or carry equivalent ownership information through the lethal player-damage path. Do not infer ownership from the dialog text returned after death.
- The ownership decision must inspect the matched quest's authored outcome/consequence contract, not hard-coded quest IDs. Suppress generic deed only when the matching quest owns a social consequence for that kill/report path; a kill-target quest with no social consequence should still allow the generic deed.
- Keep `ObjectiveRef { type: 'animal_died' }` and the all-cause death dispatch unchanged for existing quest completion, horse reward target death, rat infestation polling, NPC kills and predator/environment deaths.

## Recommended integration boundary

Prefer a small app/combat-level function called only when player damage actually transitions an animal alive → dead:

```text
capture animal context while the AnimalAgent still exists
→ determine quest social ownership for this animal id
→ build PlayerAnimalKillContext using fauna-owned significance
→ resolve nearby settlement consequences
→ apply each through applySocialConsequence(reputation, consequence)
→ refresh Character Screen reputation once after the batch
```

Do not put settlement lookup, quests or `ReputationManager` inside `AnimalAgent`. If fauna-022 exposes significance as an `AnimalAgent` property/accessor, read it at kill time; if it exposes a fauna helper, consume that exact public seam.

The kill context must copy `animal.def.kind`, `animal.animalId`, `mesh.position.x/z` and resolved significance at death time. Do not retain the `AnimalAgent` reference for later resolution.

## Settlement lookup: reuse the deterministic grid

- `SettlementsManager.getLoaded()` is not suitable; 3 km greatly exceeds the streaming radius.
- The required non-streaming authority already exists: `SettlementsManager.peekDef(cell)` resolves deterministic `SettlementDef`s without loading meshes. `src/settlement/settlementGenerator.ts` provides `worldToCell()`, `cellsWithinRadius()` and `SETTLEMENT_GRID_STEP = 280`.
- Implement one bounded lookup around the kill position using those primitives. Radius in cells should be derived from `MAX_ANIMAL_DEED_INFLUENCE_DISTANCE / SETTLEMENT_GRID_STEP` with enough margin for the deterministic site offset/local site search, then exact-filter by `Math.hypot(def.x - killX, def.z - killZ) <= 3000`.
- Prefer a reusable pure helper in the settlement/reputation boundary over exposing or scanning `SettlementsManager`'s internal `entries`. No new global settlement index is needed.

## Exposure / knowledge rule for V1

The current codebase has no positive-deed witness/gossip system. Distance alone is not evidence that a settlement knows about a kill.

For V1 keep the knowledge rule explicit and conservative:

- generic deed: eligible only for settlements for which the kill is genuinely local to the settlement; use distance from the kill site as the knowledge basis, not player position/camera/loaded state;
- quest/problem-owned kill: the quest remains authoritative. If it has its own social consequence, suppress generic deed rather than using it as an exposure override;
- leave a narrow optional input for a future settlement-problem association, but do not create a new problem registry in 019.

Do not reuse `resolveSocialExposure()`'s random risk. Positive animal-deed reputation should be deterministic for a fixed kill context and settlement set.

## Resolver shape

Add a pure quests-progression/reputation-domain resolver, separate from app wiring. Suggested inputs:

```ts
resolveAnimalDeedConsequences(
  kill: PlayerAnimalKillContext,
  settlements: readonly { id: string; x: number; z: number }[],
  options?: { socialOutcomeClaimed?: boolean }
): SocialConsequence[]
```

Keep species baselines explicit and exhaustive for rewarded species. Missing/harmless/livestock kinds must resolve to zero; `deer` should remain an explicit zero test case. Apply species baseline first, then fauna-owned `dangerSignificance`, then distance factors, then one deterministic rounding rule.

Use separate pure `reputationFactor(distance)` and `renownFactor(distance)` helpers with constants for all breakpoints. Test boundary continuity directly; avoid inline piecewise math in runtime wiring.

## Social consequence application / UI

`createApp.ts` already wires quest consequences as:

```ts
applySocialConsequence(reputation, consequence)
refreshCharacterReputation()
```

Reuse the same two operations for deeds. For a multi-settlement result, apply all consequences first and refresh the Character Screen once, not once per settlement.

Do not add a new HUD, Hunter Reputation, persisted counters or deed history in V1.

## Files likely involved

- `src/app/gameLoop.ts` — player lethal-hit convergence and context capture.
- `src/app/createApp.ts` — composition-root application of resolved consequences / quest ownership dependency wiring.
- `src/quests/QuestManager.ts` — narrow read/transition seam for kill-target social ownership; preserve existing `onInteractObjective()` behavior.
- `src/quests/quests.ts` — only if a helper/type is needed to inspect authored social consequences; do not change quest schema unless required.
- `src/reputation/ReputationManager.ts` — reuse types and `applySocialConsequence()`; no new state.
- new small resolver under `src/reputation/` (or `src/quests/` only if ownership clearly belongs there) for baselines + attenuation + consequence construction.
- `src/settlement/settlementGenerator.ts` / `SettlementsManager.peekDef()` — reuse for non-streaming candidate discovery; avoid manager internals.
- fauna-022 final files/API — consume only after that plan is implemented.

## Tests that matter most

- lethal player hit produces exactly one generic deed path; NPC/predator/drowning deaths produce none;
- quest-owned social outcome suppresses the generic deed even though generic `animal_died` dispatch occurs synchronously during `collapse()`;
- kill-target quest without social consequences does not suppress generic deed;
- unloaded settlements inside 3 km are evaluated through `peekDef()`, and result is identical regardless of streaming state;
- exact attenuation boundaries and deterministic rounding;
- `dangerSignificance = 1` reproduces species baseline; fauna-022 alpha significance scales wolf result without introducing `alpha_wolf` into quests-progression;
- harmless/livestock/deer remain zero even with significance > 1;
- multiple settlement consequences respect existing ReputationManager clamps and Character Screen refresh remains correct.

## Main implementation risk

The plan's conceptual flow is sound, but the current runtime death ordering means quest ownership cannot safely be discovered only after `AnimalAgent.takeDamage()` returns. Solve that ordering explicitly; otherwise the implementation will intermittently double-award quest-target kills or fail to suppress them.
