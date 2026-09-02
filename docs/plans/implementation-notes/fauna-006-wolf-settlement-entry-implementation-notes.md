# Implementation Notes: Wolf Settlement Entry

**Plan:** `docs/plans/fauna-006-wolf-settlement-entry.md`

## Current code

### `src/fauna/AnimalAgent.ts`

- `VILLAGE_AVOID_MARGIN = 6` is not a physical wall. `isNearVillage(pos)` checks `isWithinVillageRadius(pos, v, VILLAGE_AVOID_MARGIN)` against loaded villages.
- `pickPointNear()` rejects village targets for wild fauna unless `this.frenzied` is true. This affects home-anchored wander and herd/mother follow targets.
- `findForageTarget()` and `findWaterTarget()` reject village candidates for wild fauna.
- `updatePredator()` resolves a prey target and immediately gives up that hunt when `this.isNearVillage(prey.mesh.position)` is true. It then falls back to needs/wander.
- `senseNpcThreat()` currently skips an NPC when `!this.frenzied && this.isNearVillage(npc)`. This was introduced in npc-008 step 6 specifically to mirror the prey-hunt village rule.
- `resolveNpcTarget()` keeps the committed NPC target as long as that NPC remains in the caller-bounded `nearbyNpcs` list. It deliberately does not re-check notice range or village exclusion after commitment. npc-008 records this as a loose end.
- `moveTowardStrategicVillage()` is the existing explicit frenzy path. It steers to the village center with normal `steerToward()`; building colliders still participate through `isWalkable()`.
- `chaseNpc()` and normal prey chase both use movement primitives rather than a village-specific movement system. Therefore allowing target selection/continued chase is sufficient to make entry possible; do not add a separate village navigation mode.

## Reuse / constraints

- Reuse `isNearVillage()` for roaming/source-search avoidance if that remains the intended design. Do not delete the helper merely to enable target-driven entry.
- Keep the distinction between **target-driven entry** and **random roaming**. The intended v1 behaviour is that a wolf may enter because it is pursuing a real target, while ordinary wander can still avoid settlement grounds.
- Preserve building/terrain/water collision behaviour and the shared navigation rescue path.
- Avoid broadening the exception to fox/deer/etc. unless the implementation reveals a shared predator rule that must be generalized deliberately.

## Decision-layer integration

npc-008 already generalized animal↔NPC threat and gave non-frenzied predator NPC responses their own throttled cache. Do not rework `faunaDecision.ts` unless the new village-entry rule changes candidate validity; if it does, update the pure validity predicate and its tests rather than adding another branch in `AnimalAgent.update()`.

## Verification focus

The important regression is not just "wolf can select NPC inside village". Verify the full chain: target selection → target commitment → decision → `chaseNpc()` → `steerToward()/stepNavRescue()` → actual movement around building colliders. Also verify that keeping wander/source avoidance does not make the new target-driven exception ineffective.

**Zrób git commit i push do main, rebase jeżeli trzeba**
