# Plan: Road bridge projection and traversal

**Created:** 2026-09-14
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** world-terrain-023
**Domain:** `world-terrain`
**Subdomains:** `roads` `terrain` `rendering`
**Tags:** `bridges` `roads` `rivers` `streaming` `traversal` `determinism`
**Roadmap:** -
**Model:** Opus, Sonnet

## 1. Goal

Turn the canonical `kind = 'bridge'` road↔river crossing produced by `world-terrain-023` into one deterministic, streamed and traversable world bridge.

Target flow:

```text
canonical RoadRiverCrossing(kind = bridge)
→ deterministic RoadBridgeSpec
→ bounded spatial query near streamed chunks
→ bridge visual + optional obstacle colliders
→ shared bridge-deck ground query
→ player / NPC / fauna traverse the same surface
```

This plan does **not** decide whether a crossing is a ford or bridge. `world-terrain-023` owns that decision, its cost in route search, crossing identity and final route topology. This plan only projects an already-declared bridge crossing into terrain/runtime representation.

## 2. Dependency contract from world-terrain-023

Implementation starts only after `world-terrain-023` provides a deterministic route result with canonical crossing records.

For each bridge crossing, the road-owned result must expose enough pure data to derive the bridge without rediscovering the river, at minimum:

- stable crossing id,
- world `x/z`,
- road direction/yaw at the crossing,
- canonical water width,
- canonical channel width,
- canonical water height,
- natural bed height,
- any bridge-feasibility decision already used by A*.

If bridge projection needs another deterministic fact, extend the canonical crossing contract. Do **not** run a second road↔river intersection pass or create a renderer-side bridge classifier.

The route/crossing remains the semantic authority even when no relevant terrain chunk is loaded.

## 3. Current state verified in code

### Road ownership

`src/settlement/roadNetwork.ts` owns regional route generation and the shared route cache. `segmentsNear()` is already the bounded main-thread projection seam that turns road-worldgen state into worker-safe numeric corridor data.

`world-terrain-023` will enrich this same route result with canonical `RoadRiverCrossing` records. Bridge existence must remain derived from that result rather than settlement streaming or chunk-local discovery.

### Chunk lifecycle

`src/terrain/chunkManager.ts` owns streamed terrain chunks and already has the relevant lifecycle shape:

- chunk load/finalization,
- chunk content attachment/removal,
- nearby road-corridor projection,
- world collider registration,
- deterministic environment content cleanup on unload.

This is the natural runtime projection boundary for bridges. Do not make `SettlementsManager` own a bridge: a road crossing must exist independently of whether either endpoint settlement is currently loaded.

### Existing colliders are not a ground surface

`src/world/collision.ts` provides circle/OBB obstacle colliders. `resolvePosition()` pushes an entity out in XZ; an OBB does **not** provide a walkable Y surface.

Therefore a bridge deck must not be implemented as a large obstacle collider and must not rely on collision geometry to replace ground height.

Railings, posts or abutments may use ordinary colliders if the final visual needs them, but the deck itself requires a ground-surface contract.

### Player ground ownership

`src/player/PlayerController.ts::groundAt()` currently resolves:

```text
cave ground if present
otherwise sampleHeight(x, z)
```

`updateVerticalMotion()` and water ownership consume that result. On a river, terrain remains below the water surface, so without an explicit deck-ground result the player would swim/fall through a visually rendered bridge.

The same issue applies conceptually to NPC/fauna movement: this plan must extend a shared world-ground mechanism rather than add player-only bridge handling.

### Terrain shaping under the future bridge

`src/terrain/chunkHeightmap.ts` currently applies:

```text
regional smoothing
→ road/path/clearing shaping
→ canonical river carving
```

A bridge crossing cannot leave the road corridor shaping a terrain causeway through the river. The bridge span needs a compact worker-safe mask/projection so road height shaping is suppressed there while approach-road shaping remains intact and river carving remains canonical.

## 4. Pure bridge specification

Add a small pure projection from canonical bridge crossing to a runtime-neutral bridge specification, for example conceptually:

```ts
type RoadBridgeSpec = {
  id: string
  x: number
  z: number
  yaw: number
  span: number
  width: number
  deckY: number
  deckThickness: number
}
```

Exact names may follow repository style. Keep this object plain numeric/string data; no `THREE.Object3D`, collider registry handles or chunk runtime state.

Derive:

- `id` directly from the canonical crossing identity,
- center/yaw from the final road crossing geometry,
- span from canonical channel/water width plus bounded bank/abutment clearance,
- width from the road corridor width plus a small bounded margin,
- deck elevation from the final road approaches plus required river clearance.

Do not infer deck placement from a newly sampled renderer mesh or current camera/player state.

Bridge spec derivation must be deterministic and unit-testable without Three.js.

## 5. Bounded bridge spatial query

Expose canonical bridge specs through the road-worldgen layer with a bounded query analogous to `segmentsNear()`, e.g. `bridgesNear()` or a focused `roadStructuresNear()`.

Requirements:

- resolve/reuse the same route cache as roads/signposts,
- return only bridge specs whose footprint can affect the requested region,
- stable ordering or explicit id-based dedup where ordering can vary,
- no chunk-streamed river lookup,
- no independent route or crossing search.

A bridge spanning a chunk boundary must still have exactly one runtime identity.

Prefer one deterministic owner rule for runtime instantiation, such as the chunk containing the bridge center, or an equivalent stable-id ownership scheme. Do not let both overlapping chunks instantiate separate copies of the same bridge.

## 6. Bridge visual projection

V1 may use a deliberately simple procedural bridge. Visual richness is secondary to correct topology.

Minimum visible structure:

- deck spanning the full canonical channel plus bounded bank clearance,
- supports/abutments where appropriate,
- road-aligned yaw and width,
- deck elevation that joins both road approaches without a large step,
- river remains visually continuous below the deck.

Prefer a focused bridge presentation module rather than adding bridge-specific mesh construction throughout `chunkManager.ts`.

Do not add a generic all-purpose mutable world-structure framework just for this feature.

## 7. Shared bridge-deck ground query

Introduce or extend one shared read-only world-ground seam that can answer that a point lies on a generated bridge deck.

Conceptually:

```text
movement/world ground query
→ cave/special-space authority where applicable
→ bridge deck if point is inside a streamed/available canonical bridge footprint
→ terrain height otherwise
```

Exact composition must respect the existing cave-space ownership contract; do not flatten it into a naive global `max(terrain, bridge)` if that breaks underground/same-XZ spaces.

The bridge deck query should be derived from `RoadBridgeSpec` and return no result outside the finite deck footprint.

Integrate the shared result into the movement ground paths used by:

- player,
- NPCs,
- fauna where they can traverse roads/bridges.

Do not create three independent bridge checks. Prefer extending an existing injected height/ground dependency or introducing one narrow shared query consumed by the existing movement owners.

Slope/step evaluation near the bridge must use the same effective ground concept as vertical snapping, otherwise an entity can see the bridge deck for Y but still classify the approach as an impossible terrain cliff.

While standing on the deck, river water below must not take over vertical/swimming behaviour.

## 8. Terrain projection under bridge spans

Add compact worker-safe bridge-span influence data to the chunk terrain input, derived from canonical bridge specs.

Within the actual bridge span:

- suppress/clip the road corridor **height** shaping that would otherwise create a berm/causeway,
- keep the canonical river carve unchanged,
- keep approach road shaping outside the span,
- optionally suppress road tint over open water if needed for presentation.

Do not raise the river bed to make the bridge traversable. Do not alter canonical `waterH` or natural river hydrology.

The mask must be seam-safe across chunk boundaries: shared world coordinates must compute the same influence regardless of which chunk evaluates them.

## 9. Runtime ownership and streaming

Bridge runtime presence is deterministic world presentation, not persisted mutable state.

Use chunk/world streaming only to decide when to instantiate presentation. Bridge existence itself comes from the road result.

Required lifecycle:

- instantiate once when its owning streamed region becomes relevant,
- keep stable id across unload/reload,
- dispose visual/collider resources on unload,
- recreate identically later,
- never depend on endpoint settlement load state,
- never depend on player/camera visibility for semantic existence.

If railings/abutments have obstacle colliders, register/clear them through the existing owner-key collider registry with the same bridge lifecycle.

## 10. NPC/fauna and off-screen continuity

A bridge is part of the same road/world topology for every actor.

Loaded agents should traverse it through the shared ground query, not an agent-specific teleport or bridge mode.

Off-screen/aggregate travel that already follows regional route semantics does not require a rendered bridge to exist. The canonical route crossing from `world-terrain-023` is sufficient for continuity outside detailed simulation.

Do not make bridge traversability depend on whether the visual mesh is currently instantiated if an actor/system legitimately resolves the same deterministic bridge spec without presentation.

## 11. Determinism and persistence

V1 bridges remain procedural worldgen output.

- no `SaveData` bridge list,
- no mutable bridge condition state,
- no uncontrolled RNG,
- no chunk-order-dependent ids,
- no settlement-streaming-dependent existence,
- rebuilding the same seed/routes produces the same bridge specs.

If a persistent worldgen-cache namespace stores affected road output by implementation time, follow its existing fingerprint/version mechanism rather than introducing bridge-specific persistence.

## 12. Tests

Add focused automated coverage before browser verification.

### Bridge spec / query

- known canonical crossing derives stable id/position/yaw/span/width/deck elevation,
- repeated derivation is deeply equal,
- bounded spatial query includes only intersecting bridges,
- a chunk-boundary bridge appears once under the chosen ownership/dedup rule.

### Terrain

- bridge span suppresses road height shaping across the river,
- approach road shaping remains active before/after the span,
- canonical river bed/water profile remains unchanged below the bridge,
- bridge mask is identical on both sides of a chunk seam.

### Ground / traversal

- inside deck footprint the shared ground query returns deck Y,
- immediately outside it falls back to ordinary ground,
- entity standing on deck is not treated as swimming in river water below,
- player/NPC/fauna use the same bridge-ground source rather than separate classifiers,
- slope/approach evaluation agrees with vertical ground ownership.

### Streaming

- unload removes runtime visual/colliders,
- reload recreates the same bridge id/spec,
- no duplicate bridge appears when neighboring chunks are simultaneously loaded.

## 13. Performance constraints

- No per-frame road↔river intersection work.
- Bridge spatial queries must be bounded to nearby cached routes/specs.
- Ground lookup must be allocation-light and spatially bounded; it may run in movement hot paths.
- Do not scan all regional roads/bridges every actor tick.
- Keep worker payloads compact numeric data.
- Do not move unrelated road routing to a worker as part of this plan.

## 14. Files / systems expected to change

Primary integration points verified today:

- `src/settlement/roadNetwork.ts` — bounded bridge-spec projection/query over canonical `world-terrain-023` crossings.
- focused bridge-spec/presentation module if useful — pure spec derivation separated from Three.js runtime construction.
- `src/terrain/chunkHeightmap.ts` — worker-safe bridge-span mask that suppresses road berm shaping without changing river carving.
- `src/terrain/chunkManager.ts` — bridge spatial data, streamed visual lifecycle and shared ground-query wiring.
- `src/player/PlayerController.ts` and existing NPC/fauna movement ground seams — consume one shared bridge-aware ground contract, not bridge-specific behaviour per actor.
- `src/world/collision.ts` only if railings/abutments need existing obstacle primitives; do not turn the obstacle registry into a floor system.

Before editing NPC/fauna movement, inspect their current injected height/ground dependencies and extend the closest shared seam. Avoid unrelated movement refactors.

Add JSDoc for important new architectural/public bridge or ground-query functions/classes where it improves preflight discovery; use `@domain world-terrain` where appropriate.

## 15. Non-goals

- choosing ford vs bridge — owned by `world-terrain-023`,
- a second river intersection/classification pass,
- player-built bridges,
- bridge construction economy,
- bridge damage/repair/decay,
- bridge quests,
- movable/draw bridges,
- seasonal flooding/dynamic closure,
- multiple decorative bridge tiers,
- a generic physics engine,
- a generic mutable world-structure registry,
- invisible terrain causeways used as bridge floors.

## 16. Acceptance criteria

- Every rendered bridge corresponds to exactly one canonical `RoadRiverCrossing(kind = 'bridge')` from `world-terrain-023`.
- No renderer/chunk/movement code independently decides that a bridge should exist.
- Bridge spec and runtime identity are deterministic across route lookup order and chunk streaming order.
- Road terrain does not form a berm/causeway through the bridged river.
- Canonical river geometry and water remain continuous beneath the deck.
- The bridge deck is a real shared movement ground surface rather than an obstacle collider or raised river bed.
- Player, NPCs and fauna that use the crossing can traverse the same deck contract.
- A bridge spanning multiple chunks is instantiated once and survives unload/reload deterministically.
- No save migration is required for V1.

## 17. Verification

Technical verification after implementation:

```text
npx tsc --noEmit
pnpm run test -- roadNetwork
pnpm run test -- chunkHeightmap
pnpm run test -- bridge
pnpm run lint:fix
```

Use the repository's actual targeted test syntax if it differs. Do not broaden verification without a reason.

Manual/browser verification is performed by the user. Verify at minimum:

- a road whose canonical crossing is `bridge` visibly gets one bridge,
- approaches meet the deck without a cliff or terrain causeway,
- river remains visible/continuous underneath,
- player can walk across without falling/swimming,
- an NPC and fauna actor can use the same crossing when their normal movement takes them there,
- leaving/re-entering the area does not duplicate or change the bridge.

> **Zrób git commit i push do main, rebase jeżeli trzeba**