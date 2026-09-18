# Implementation notes: npc-057 NPC destination threat assessment

## Recon summary

Plan direction matches the current architecture, but two implementation details are not present yet and must be added deliberately:

- `SettlementHerbalGatherHooks` exposes only `queryNearest()`; V1 cannot select a safer 2nd–5th herb without extending the resource-query seam.
- `NpcWorkContext` does not currently carry health, personality, `personalInventory` or fauna destination-threat access. Combat capability is resolved in `NpcAgent`, not in `npcProfessionWork.ts`.

Keep the change decision-time only. Do not reuse the per-frame `nearbyAnimalThreats` list: it intentionally contains immediate/committed threats and would miss the latent destination danger required here.

## Fauna ownership and danger projection

Use `src/fauna/animalDefs.ts` as the species authority. `AnimalDef` is already the declarative per-species capability/tuning table; do not create a wolf/bear/fox table under `ai/` and do not reuse `src/reputation/animalDeeds.ts` baselines (those are social rewards, not combat/destination danger).

Recommended shape:

- add a small fauna-owned human-danger config to `AnimalDef` (exact naming is flexible);
- add a pure fauna resolver, preferably a separate small module rather than more policy inside `AnimalAgent.ts`;
- resolver input should be species config + current aggression state + `dangerSignificance`;
- hook code may read the existing public `AnimalAgent.isFrenzied()`, `isRabid()`, `isThreateningHuman()`, `isDead()`, `def`, position and `dangerSignificance`.

Important pitfall: a purely multiplicative `baseDanger * aggressiveMultiplier` cannot satisfy “normal fox ≈ 0, frenzied fox meaningful” if the normal baseline is exactly zero. Use either a non-zero negligible baseline or config/resolver semantics with an explicit aggressive floor/value. Keep that rule fauna-owned and tested.

`dangerSignificance` must remain only the individual multiplier (alpha / quest-marked dangerous individual). Harmless prey/livestock should resolve to zero rather than relying on NPC-side filtering.

## Destination-threat hook

Follow `src/fauna/huntingHooks.ts::createHuntingHooks()` closely:

- late-bound `() => Fauna | null`, because fauna is constructed after settlements/NPCs in `worldBundle.ts`;
- one bounded scan of `fauna.getAgents()`;
- filter dead/zero-danger/out-of-radius animals;
- return primitive snapshots only, e.g. `animalId/x/z/humanDanger`;
- no `AnimalAgent` or `CombatTargetHandle` crossing into `ai/`.

Thread the hook through the same existing chain used by hunting: `WorldBundle` / settlement manager / settlement creation / `NpcAgent`. Do not let profession code import `Fauna`.

The scan radius should cover all candidate destinations plus the scorer's threat influence radius in one query. With Herbalist's 60 m candidate radius, query once around the NPC with a radius large enough to cover the farthest candidate's threat neighborhood; then score candidates against that single snapshot. Do not call the fauna hook inside the candidate loop.

## Herbal candidate query: preserve off-screen behaviour

Current `src/world/herbalGathering.ts` delegates `queryNearest()` to `ChunkManager.findNearestWorldItem()`. That path is not just a loaded-item lookup: `src/terrain/chunkWorldItems.ts::nearestWorldChunkItem()` merges loaded items with deterministic procedural off-screen chunk items and respects collected/renewable state.

Therefore do not replace Herbalist selection with `ChunkManager.getNearbyItems()` alone; that would silently regress off-screen gathering.

Extend the existing world-item query path to support a bounded ordered result set, then expose it through `SettlementHerbalGatherHooks`, for example:

- generic terrain helper returning nearest N candidates with stable ordering by distance then id;
- corresponding `ChunkManager` method preserving the current procedural/off-screen resolution;
- `queryCandidates(x, z, range, limit)` in `SettlementHerbalGatherHooks`.

Keep `queryNearest()` if other callers/tests still need it, or implement it via the new bounded helper without changing semantics. Candidate cap should be a named Herbalist constant (3–5 per plan).

## NPC tolerance inputs

Resolve real combat capability from the same ownership used by combat:

- melee: `resolveNpcMeleeWeapon(this.personalInventory, this.role)`;
- ranged weapon: `resolveNpcRangedWeapon(this.personalInventory, this.role)`;
- ranged capability is true only when compatible ammo resolves through the same inventories as combat. `NpcAgent.resolveRangedAmmo()` already accounts for personal belongings + transient `carried` supply; do not reduce this to “has bow”.
- health ratio: `this.health.currentHp / this.health.maxHp`;
- personality: `this.personality.neuroticism`.

Prefer deriving these once in `NpcAgent.professionContext()` and passing primitive values into `NpcWorkContext`. Do not pass `HealthState`, `BigFivePersonality` or the whole `personalInventory` merely so the pure profession planner can rediscover them.

This mirrors the existing immediate-threat call site, which already derives melee/ranged capability, HP ratio and neuroticism before calling `arbitrateAnimalThreat()`.

## Pure scorer and Herbalist integration

Put the reusable scorer in `src/ai/npcDestinationThreat.ts`. It should receive primitive NPC state plus one immutable threat snapshot and return the authoritative breakdown used by tests/diagnostics.

For deterministic multi-threat aggregation, sort relevant contributions with an explicit stable tie-break (e.g. contribution descending, then `animalId`) before applying diminishing additional-threat weight. Avoid iteration-order dependence on `fauna.getAgents()`.

`planHerbalistWork()` should:

1. preserve existing carried-item deposit and dressing-production priority;
2. obtain at most the named candidate cap;
3. obtain exactly one destination-threat snapshot;
4. assess candidates in deterministic nearest order;
5. select the nearest acceptable candidate;
6. reuse the existing gather action, `harvest(target)` revalidation and household deposit chain unchanged;
7. return `null` when none is acceptable, preserving the existing generic profession fallback.

No risk recheck belongs in `onComplete`, travel ticks, pathfinding, watchdog or immediate-threat interruption.

## Tests worth adding/updating

Keep pure tests near their owners:

- fauna danger resolver: species ordering, normal/aggressive fox, `dangerSignificance`, harmless species;
- terrain/world-item bounded candidate resolver: loaded + procedural off-screen candidates, stable distance/id ordering, limit;
- `npcDestinationThreat.test.ts`: attenuation, bounded group aggregation, HP/combat/role/neuroticism/activity effects, deterministic ties;
- Herbalist integration: safer farther candidate, all unsafe, candidate cap, exactly one threat-hook call, no per-candidate fauna query;
- regression: existing `settlements-npcs-007.test.ts`, `npcAnimalThreat.test.ts`, hunting hook tests.

Do not add persistence or save-version changes: all new destination assessment state is derived/read-only and decision-local.
