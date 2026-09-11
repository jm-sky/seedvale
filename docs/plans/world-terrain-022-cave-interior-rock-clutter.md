# Plan: Deterministic Cave Interior Rock Clutter

**Created:** 2026-09-11
**Status:** `verification needed` 🔍 — implemented and technically verified (typecheck, lint, targeted + full `vitest`, production build); browser/visual density verification is still open.
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-terrain-019~~
**Domain:** `world-terrain`
**Subdomains:** `terrain` `rendering`
**Tags:** `caves` `presentation` `instancing`
**Roadmap:** -

## Goal

Production cave interiors (Cave V3 heightfield caves) still read as empty even
after the surface-material polish. Add deterministic, presentation-only
rock/boulder clutter throughout cave interiors — for both `natural` and
`adventure` archetypes — without adding a new spatial authority, without
touching gameplay/collision, and reusing the existing heightfield query
surface, cave RNG registry and prop-instancing pipeline. The only prior
interior decoration was `createMouthRocks()`, which is entrance-framing only.

## Architecture

New module `src/world/caves/caveInteriorRocks.ts`, split into a pure
placement half and a thin rendering half:

- `resolveCaveInteriorRocks({ archetype, topology, heightfield, contentAnchors })`
  — pure, no Three.js import. Iterates `topology.nodes` (per-`kind` density:
  `chamber` > `widening` > `passage` > `constriction`, area-weighted budget,
  entrance skipped) and `topology.segments` (sparse wall-hugging small/medium
  rocks along passage stretches, stride-sampled). Every candidate is checked
  via `sampleHeightfieldAt(...)` (outsideGrid/openSky/gap/coreT), a ring-sample
  footprint clearance check, a through-route lateral-distance guard for
  medium/large, spacing against already-accepted rocks (with a deliberate
  "cluster companion" exception), and a breathing-room distance check against
  `contentAnchors` positions (read-only — never anchor roles as a placement
  source). One RNG stream: `createCaveRandom(caveId, CAVE_RNG_SALT.interiorRocks)`
  (new salt `0x10` in `caveRng.ts`). Returns a frozen
  `readonly CaveInteriorRockPlacement[]`.
- `getCaveInteriorRockTemplates()` / `createCaveInteriorRocksGroup()` —
  rendering layer. 5 lazily-memoized, module-level shared templates (one
  `createRockCluster` silhouette for `small`, two `createLargeRock`
  silhouettes each cloned into a no-shadow "medium" wrapper and a
  shadow-casting "large" wrapper sharing the same geometry/material by
  reference — `InstancedMesh.castShadow` is one flag per bucket, so
  differently-shadowed size classes need separate template entries even
  though the GPU geometry/material are shared). Instanced via the existing
  `buildInstancedProps()` (`src/render/instancedProps.ts`) — never one
  `Mesh`/`Geometry`/`Material` per rock. Template geometries/materials are
  marked `userData.sharedGpu = true` so the existing `disposeObject3D()` path
  never frees them out from under another still-active cave.

Shared geometry extraction: `chamberContentCandidates`/`passageWallContentCandidates`/
`footprintHolds` and their supporting geometry helpers (`incomingHeading`,
`pointAlongSegment`, `lateralDistance`, `yawFacing`, `signFromRandom`) moved
out of `caveContentAnchors.ts` into a new `src/world/caves/caveHeightfieldPlacement.ts`
— pure XZ candidate-generation/footprint geometry with no anchor-role or rock
size-class semantics, shared by both `caveContentAnchors.ts` (thin
backward-compatible wrappers, same exported signatures) and
`caveInteriorRocks.ts`.

### Integration

- `caveHeightfieldPresentation.ts`: `createCaveHeightfieldPresentation()`
  gains `interiorRockPlacements: readonly CaveInteriorRockPlacement[]` input
  and an `interiorRockCount` output field; builds/attaches the instanced
  group as a named `'cave-interior-rocks'` child when non-empty.
- `createCaves.ts`: `interiorRocksEnabled = isSystemEnabled('caveInteriorRocks')`
  computed once at world build (alongside the existing `mouthRocksEnabled`).
  `CaveRuntime` gains `interiorRocks: readonly CaveInteriorRockPlacement[]`,
  resolved once eagerly per cave (like `contentAnchors`) — skipped entirely
  (`[]`) when the debug flag disables the system, since this content never
  renders in that case. `attachPresentation()` threads `v2.interiorRocks`
  into the presentation call and reports `interiorRocks` in the boot-mark
  `console.table`.
- `debugMode.ts`: new `DebugSystemName` entry `'caveInteriorRocks'` —
  `?debugDisableSystems=caveInteriorRocks` for A/B density verification.

## Determinism

Same seed/cave/site ⇒ identical `resolveCaveInteriorRocks()` output,
independent of streaming order, activation/deactivation, player position or
frame timing — the function only closes over `(archetype, topology,
heightfield, contentAnchors)`, all pure functions of world seed + site, and
draws from one dedicated RNG stream. Presentation rebuild/dispose never
touches placement data (`CaveRuntime.interiorRocks` is computed once at world
build, like `contentAnchors`).

## Non-goals / guardrails

- No SDF, no second cave spatial representation, no `chunkManager.sampleHeight()`
  / topology-node-Y / `Caves.queryGround()` for interior rock Y — only
  `sampleHeightfieldAt(...).floorY`.
- No new streaming manager, no persisted state, no collision/gameplay
  authority, no world items/resources.
- `CaveContentAnchor`/`caveContentAnchors.ts` stays semantic-content-only;
  interior rocks read anchor positions for spacing only and are never added
  as a new `CaveContentAnchorRole`.
- Never one `createLargeRock()`/`createRockCluster()` call per placement —
  always the shared templates + `buildInstancedProps`.

## Tests

`src/world/caves/caveInteriorRocks.test.ts` (13 tests): determinism across
independent rebuilds, non-empty output for both archetypes, every placement
inside the void and away from open-sky/grid-edge, floor Y from the
heightfield (not topology node Y), large-vs-small clearance ordering,
central-route protection in a straight fixture, content-anchor breathing
room, bounded candidate fan, frozen output, a fixed 5-entry template set,
bounded `InstancedMesh` bucket count vs. rock count, `undefined` for an empty
placement list, and `sharedGpu` marking on every template mesh.
`caveHeightfieldPresentation.test.ts` and `caveContentAnchors.test.ts` were
updated/re-verified for the new required input and the extracted shared
helpers respectively — all pre-existing assertions still pass unchanged.

## Verification

```text
npx vitest run src/world/caves/
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
```

All pass. One unrelated pre-existing failure (`src/combat/defenseResolver.test.ts`,
`shears` defense config) reproduces identically on `main` before this change.

Browser verification (left for the user): rock density reads as "no longer
empty, not rubble-covered" in a natural and an adventure cave; no traversal
blocking; no freeze on cave entry/streaming; boulders sit only in
sufficiently wide/tall chambers; `?debugDisableSystems=caveInteriorRocks`
A/B toggle.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
