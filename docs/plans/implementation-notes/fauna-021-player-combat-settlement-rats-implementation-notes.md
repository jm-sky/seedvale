# Implementation notes: fauna-021 player combat for settlement rats

**Plan:** `fauna-021-player-combat-settlement-rats.md`
**Reviewed against:** `main` 2026-09-11

## Recon

Rats are already `AnimalAgent('rat')` on `settlement.rats` (`createSettlement.ts` getter → `rats.getAgents()`). They are not in `fauna.getAgents()` and not in `settlement.livestock`. `MAX_HP.rat = 6`. Dog combat uses `nearbyRats`. `countAliveRats` is `settlement.rats.reduce(!isDead())`.

`LivingCombatTarget` already exists. `addAnimal` is structural (`animalId`, `mesh.position`, `isDead`). No new combat interface.

Three collectors miss `settlement.rats`:

- `playerCombat.ts` `collectLivingCombatTargets` / `collectRangedAnimalCandidates`
- `interactables.ts` `buildCombatTarget`
- `gameLoop.ts` melee candidates from `kind === 'animal'` interactables (fixed by adding rats to interactables while a weapon is held)

`fauna-016` notes §8 claimed player melee already worked. That was wrong relative to targeting sources — see the follow-up annotation in those notes.

## Implementation

Export `forEachLivingCombatAnimal(settlements, fauna, visit)` from `playerCombat.ts`: livestock, then `settlement.rats`, then `fauna.getAgents()`. Use it in both collectors and `buildCombatTarget`.

In `buildInteractables`, after the livestock loop, if `isMeleeTool(heldTool) || isRangedTool(heldTool)`, `pushLiveAnimalCandidate` for each `settlement.rats` agent. Reuses `animalPromptLabel`'s weapon branch. Do not add rats to the unarmed livestock loop.

Do not touch NPC collection, quest polling, or `AnimalAgent.takeDamage`.

Tests: mock `{ animalId, mesh.position, isDead, takeDamage }` plus `createHealthState(MAX_HP.rat)` / `damageHealth` — do not construct a full `AnimalAgent` (GLTF). `countAliveRats` formula is the same reduce as `SettlementsManager`.
