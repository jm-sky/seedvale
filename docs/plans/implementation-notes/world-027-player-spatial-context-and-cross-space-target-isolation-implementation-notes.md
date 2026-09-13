# Player Spatial Context and Cross-Space Target Isolation — Implementation Notes

**Plan:** `world-027-player-spatial-context-and-cross-space-target-isolation.md`  
**Recon:** 2026-09-13, current `main` (`663330ad` baseline before this notes commit)

## Recon result

The plan addresses a real shared gap: Cave V2 is already XYZ-aware, but Player interaction and combat acquisition still collapse the world to XZ.

Do not solve this as a tree-specific interaction fix. The useful seam is a small world-owned spatial identity reused by interaction, combat, cave-authored content and later `npc-027` / `world-018`.

Current Cave V2 already has all authoritative data needed. The missing part is a stateless query that returns the owning `caveId`, plus consumers that preserve/use that identity.

## Shared spatial contract

Add the plain-data contract under world ownership, e.g. `src/world/spatialContext.ts`:

```ts
export type WorldSpatialContext =
  | { kind: 'surface' }
  | { kind: 'cave'; caveId: string }
```

Provide:

- one canonical immutable surface value;
- semantic equality (`surface == surface`; caves equal only when `caveId` matches);
- JSDoc / `@domain world` on the public contract/helpers.

Do not compare context objects by reference and do not persist Player context. Current XYZ + world semantics remain authoritative.

### Exact Cave V2 membership semantics

`src/world/createCaves.ts` currently has:

- retained `CaveRuntime` objects with `runtime.topology.caveId`;
- `v2ByCaveId` for cave-scoped O(1) APIs;
- global stateless `occupancyAt(x,y,z)`, but it returns only `CaveVerticalInterval`;
- hysteretic `queryGround()` / `queryInterior()` which are not generic membership APIs.

Implement the new public equivalent of:

```ts
spatialContextAt(x: number, y: number, z: number): WorldSpatialContext
```

from the same retained heightfields used by `occupancyAt()`.

Use this rule:

```text
no strict occupancy             -> surface
occupancy with openSky === true -> surface
closed cave occupancy           -> cave:<runtime.topology.caveId>
```

The `openSky -> surface` decision is not new policy: `src/player/worldWaterEligibility.ts` already treats an open-sky mouth/approach as surface-world space while closed cave occupancy/ceiling excludes surface water.

Do not use `queryInterior()` here: it is intentionally hysteretic, channel-specific and returns no cave id.

### Do not duplicate the occupancy scan

Today `occupancyAt()` loops `runtimes` and returns the first `heightfieldOccupancyAt(...)` hit. Extract one internal helper that resolves both the runtime and interval, then implement both `occupancyAt()` and `spatialContextAt()` through it. That keeps first-hit/overlap semantics identical.

Important performance detail: the current global `occupancyAt()` is a linear scan over every cave runtime. One Player context lookup per frame is acceptable; repeating that scan for every nearby NPC/animal is not the intended end state.

If dynamic-entity context resolution would multiply the global scan, add a private coarse query index over **cave bounds** that stores references to the same `CaveRuntime`s. It is only an accelerator, not a second spatial authority. Do not repurpose the existing presentation `grid` blindly: that grid indexes cave entrances for streaming and does not currently guarantee coverage of every cell overlapped by a cave's bounds.

## Frame ownership and integration point

`src/app/gameLoop.ts` is the right place to resolve Player context once for the current interaction/combat frame:

```text
Player XYZ
-> bundle.caves.spatialContextAt(...)
-> one playerSpatialContext value
-> interaction builder/filter
-> living combat collector
-> ranged collector
-> projectile fire context
```

Resolve it before the interaction/combat candidate work and reuse the same value. Do not let each consumer independently query caves.

The current interaction/combat block runs before the later `player.update()` movement step. Keep that ordering; this fix does not justify a frame-loop reorder. All candidate systems should simply use the same current transform/context for that frame.

## Interactable shape without union boilerplate

`src/interaction/Interactable.ts` is a large discriminated union. Do not manually repeat `spatialContext` on every union member.

Prefer an internal payload union plus one intersection/common wrapper, e.g. conceptually:

```ts
type InteractablePayload = /* existing union */
export type Interactable = InteractablePayload & {
  spatialContext: WorldSpatialContext
}
```

Preserve the existing `kind` narrowing and per-frame/non-persisted contract.

`src/interaction/findInteractionTarget.ts` should remain unchanged. Its XZ distance/facing ranking is valid **after** spatial eligibility has been established. Do not add Cave V2, Y-distance or raycasting there.

## `buildInteractables()` context sources

`src/app/interactables.ts` already centralizes candidate materialization. Give every emitted candidate a context, then apply one same-context filter before gaze/cycle/melee consumers. A small helper around `list.push()` is preferable to dozens of ad-hoc comparisons.

Use source ownership rather than generic cave queries where the answer is already known:

- trees, surface water edge, settlement wells/buildings/storage/land plots/rat nests, procedural surface landmarks, ordinary player-built surface structures and other surface-only registries -> canonical `surface`;
- world-generated cave containers -> explicit stored cave context from their deterministic spec;
- live animals -> current physical XYZ, not habitat identity;
- NPCs -> current physical XYZ if using the shared resolver, so later `npc-027` needs no interaction redesign. Until `npc-027`, they should still resolve as surface.

For animals specifically, do **not** expose/use `AnimalAgent`'s permanent cave habitat binding as current context. `AnimalCaveContext` is private and a cave resident can physically walk its entrance route onto the surface while retaining that habitat binding. Current physical XYZ is the authority.

Prefer this flow:

```text
buildInteractables (candidates carry context)
-> filter same context once
-> rankInGaze / Tab cycle / melee candidate extraction / prompt / action
```

Filtering immediately after candidate construction in `gameLoop.ts` is clean because every downstream interaction consumer already shares that list. There is no need to thread cave validation into every action handler.

The current target/cycle/gaze state does not persist an `Interactable` across frames: candidates are rebuilt and soft-lock rejoins against the current list. Therefore a second cave check inside every `[E]` mutation is unnecessary unless implementation uncovers a genuinely asynchronous target lifetime.

## World-generated cave containers

This is a confirmed information-loss boundary, not a query problem.

Current flow:

```text
CaveContentAnchor (has caveId + x/y/z)
-> caveTreasureContainerSpecs() (keeps x/y/z, drops caveId)
-> WorldGeneratedContainerSpec (optional y)
-> WorldGeneratedContainerEntry (drops y and cave identity)
-> Interactable { x,z }
```

Relevant files:

- `src/world/caves/caveContentAnchors.ts` — `CaveContentAnchor.caveId` already exists;
- `src/app/worldBundle.ts` — `caveTreasureContainerSpecs()` has the anchor and must thread its cave identity;
- `src/world/worldGeneratedContainers.ts` — runtime entry must preserve spatial context.

Add spatial context to the deterministic spec/runtime entry. For cave treasure, set it directly from `anchor.caveId`; do not rediscover it from geometry.

Do not add it to `SaveWorldGeneratedContainer`. Save records intentionally persist mutable container contents/identity while deterministic specs reconstruct authored placement on rebuild/load. Persisting the context would create redundant authority.

Keep `spec.y` as the exact rendering/placement Y for underground content. Spatial context and render Y solve different problems.

Prefer a type contract that makes an explicit underground placement unable to silently become surface-scoped. If keeping context optional for legacy surface specs, normalize omission to the canonical surface value at one constructor boundary and require explicit cave context for the `y`-based cave specs.

## Player combat

### Living target acquisition

`src/player/playerCombat.ts` has separate XZ-only collectors:

- `collectLivingCombatTargets()` for Tab/soft-lock (animals + NPCs);
- `collectRangedAnimalCandidates()` for bow/projectile collision range.

Both need the already-resolved Player context plus a narrow world-position context resolver. Reject an other-context entity before allocating/ranking it.

The temporary `Interactable`s created inside `collectLivingCombatTargets()` must carry the same context field as normal interactables.

Do not add another combat registry or separate cave-target collector.

### Melee

`gameLoop.ts` builds melee animal candidates from the current `interactables` list. Once that list is centrally same-context filtered, keep this path as-is. Avoid a redundant melee-specific cave query.

Player damage to NPCs is still not wired into the melee/projectile damage pipeline; `collectLivingCombatTargets()` includes NPCs for targeting/soft-lock. This plan should only prevent cross-space acquisition, not expand Player-vs-NPC combat.

### Projectiles

Keep `src/combat/projectile.ts` pure 2D geometry. `advanceProjectile()` and `sweptProjectileHit()` do not need world/cave knowledge.

The narrowest implementation is an app/player-owned active-projectile wrapper, e.g. conceptually:

```ts
type ActivePlayerProjectile = Projectile & {
  spatialContext: WorldSpatialContext
}
```

Capture `playerSpatialContext` when the shot is spawned. Before passing ranged candidates to `sweptProjectileHit()`, filter them with semantic context equality against the projectile's captured context.

Do not use the Player's *current* context for an existing projectile: walking through a cave mouth after firing must not move an in-flight arrow into another spatial domain.

Known out-of-scope cave bug: projectile miss/expiry still calls XZ-only `DroppedItems.drop(...)`, whose placement is surface-grounded. Do not expand this plan into dropped-item cave persistence/placement; record/retain it as the existing follow-up.

## Debug teleport: preserve the narrow debug boundary

`src/debug/npcDebugApi.ts` intentionally receives a narrow async teleport callback from `createApp.ts`; it does not own `PlayerController` or chunk streaming. Preserve that separation.

Current callback:

```text
waitForChunks(x,z)
-> player.setPosition(x,z)
```

`PlayerController.setPosition(x,z)` changes X/Z and then `snapToGround()` using the Player's existing Y. Because `groundAt()` is Y-aware, an underground source Y can select cave floor at a destination whose XZ overlaps a cave.

Make debug location teleports explicitly surface-biased at the composition boundary:

```text
waitForChunks
-> resolve authoritative surface Y from chunkManager.sampleHeight(x,z)
-> set Player X/Z with that Y as the ground-query seed
-> normal snap/camera sync
```

Prefer a small optional/explicit Y-seed API on `PlayerController` rather than mutating `mesh.position.y` inside `npcDebugApi.ts`. Preserve existing `setPosition(x,z)` behaviour for unrelated callers (`perf/benchmark.ts`, restore/rebuild paths); do not redefine all generic teleports as surface teleports.

Cave entrance debug helpers can continue to use the same surface teleport callback: the entrance/open-sky mouth is intentionally the surface transition side. A future direct deep-cave teleport should be a separate explicit XYZ/context operation.

## Useful implementation order

1. Add `WorldSpatialContext`, equality, canonical surface value and Cave V2 `spatialContextAt()`; extend `createCaves.test.ts` first.
2. Preserve cave context through `CaveContentAnchor -> WorldGeneratedContainerSpec -> WorldGeneratedContainerEntry`; update `worldGeneratedContainers.test.ts` / cave-spec tests.
3. Add context to `Interactable`; adapt `buildInteractables()` and put one same-context filter before all downstream interaction consumers.
4. Thread the same Player context/resolver into `collectLivingCombatTargets()` and `collectRangedAnimalCandidates()`; extend `playerCombat.test.ts`.
5. Capture projectile fire context in `gameLoop.ts` and filter candidates before existing swept geometry; keep `projectile.test.ts` focused on geometry.
6. Add the explicit surface-Y teleport seed at `createApp.ts` / `PlayerController`, and update `npcDebugApi.test.ts` or a focused PlayerController test.
7. Update current-state/architecture docs only where the new shared seam changes documented ownership.

## High-ROI tests

### Cave spatial identity

Use the existing real-heightfield fixture in `src/world/createCaves.test.ts` rather than inventing a fake cave model:

- closed interior floor resolves `cave:<expected caveId>`;
- same XZ sampled at the outdoor surface Y resolves `surface`;
- open-sky mouth occupancy resolves `surface`;
- interleaved queries for different positions have no hysteresis/state coupling;
- result is independent of presentation streaming state.

Keep the existing assertion that spatial queries read the retained heightfield authority.

### Interaction / container boundary

Representative tests are enough because filtering is central:

- cave Player + XZ-near surface tree (or another surface class) -> candidate removed;
- surface Player + cave chest -> candidate removed;
- cave Player + same cave chest -> retained;
- normal surface candidate remains unchanged;
- world/cycle list sees the same filtered list as gaze/melee.

Do not duplicate one test for every `Interactable.kind`.

### Combat

In `src/player/playerCombat.test.ts` cover:

- surface/cave animals with overlapping XZ -> only same-context target collected;
- NPC soft-lock candidate is also context-filtered;
- ranged collector applies the same rule;
- different cave ids do not match.

For projectile behaviour, test the caller/helper that filters candidate context before `sweptProjectileHit()`. Do not put cave semantics into `src/combat/projectile.test.ts` merely to force coverage there.

### Teleport

Cover the semantic callback/API boundary rather than browser automation:

- Player starting with underground Y + surface destination gets surface Y seed before snap;
- old `setPosition(x,z)` semantics remain available for existing callers;
- cave-entrance debug teleport still succeeds through the existing lookup/chunk-preload flow.

## Pitfalls / scope guardrails

- Do not use 3D Euclidean range as the spatial-domain fix. It may hide the current tree case but does not encode cave identity or future stacked spaces.
- Do not use `queryInterior()` for interaction/combat membership.
- Do not let context equality depend on object identity.
- Do not unload/pause surface chunks while the Player is underground.
- Do not add raycasting/LOS to interaction in this plan.
- Do not expose `CaveRuntime`, heightfield objects or Three.js state to interaction/player modules.
- Do not make cave habitat ownership equal current animal context.
- Do not persist Player/projectile interaction context as save state.
- Do not absorb collision vertical extents, fauna/NPC perception, positional-audio audits or cave-aware dropped items into this implementation.

After this plan, `npc-027` and `world-018` should import/reuse `WorldSpatialContext`; they should not introduce their own `surface | cave:<id>` discriminators.