# Plan: Distant Cave Mouth Occlusion

**Created:** 2026-09-13  
**Status:** `implemented` ✅  
**Priority:** high · **Effort:** S  
**Depends on:** ~~world-terrain-019~~  
**Domain:** `world-terrain`  
**Type:** `fix`  
**Subdomains:** `terrain` `rendering` `landmarks`  
**Tags:** `caves` `streaming` `terrain-cutout` `lod` `occlusion`  
**Roadmap:** -  
**Model:** Sonnet, Composer  

## 1. Problem

Cave mouths are visible from farther away than the streamed cave presentation.

Observed gameplay symptom:

- from a distance the cave reads as a literal hole cut out of the terrain;
- bright sky/background can be seen below/through the terrain opening;
- after approaching the cave, the cave heightfield presentation appears and the visual hole is replaced by the expected rock/floor/interior.

This is a presentation-lifecycle mismatch, not a cave spatial-authority problem.

## 2. Recon findings

Current production flow after `world-terrain-019`:

```text
CaveTopology
  -> CaveHeightfieldRepresentation
     -> persistent TerrainCutout in ChunkManager
     -> streamed full cave presentation
```

Relevant current code:

- `src/world/createCaves.ts`
  - builds every retained cave heightfield at world construction;
  - derives and registers every cave `TerrainCutout` once through `chunkManager.registerTerrainCutouts('caves', ...)`;
  - owns cave presentation streaming and the full presentation lifecycle;
  - builds at most one full cave presentation per `update()`.
- `src/world/caves/caveTerrainCutout.ts`
  - derives the exact terrain aperture from the same heightfield / `mouthOpeningAt` contour used by cave presentation.
- `src/terrain/terrainCutout.ts`
  - cutouts are retained terrain topology and are applied on every relevant terrain chunk mesh build/rebuild;
  - terrain collision/height sampling is intentionally not changed by the cutout.
- `src/world/caves/cavePresentationLifecycle.ts`
  - full cave presentation activates at `55 m` and deactivates at `80 m`;
  - before activation, and after deactivation, no cave floor/ceiling/mouth-mask presentation exists.
- `src/world/caves/caveHeightfieldPresentation.ts`
  - the full streamed group contains the expensive/interior presentation plus the mouth underside mask and mouth rocks;
  - the underside mask and mouth framing therefore disappear together with the full cave presentation.

Root cause:

```text
terrain chunk visible
  + persistent real terrain cutout
  + full cave presentation not active yet
  = view through the terrain aperture into clear/background sky
```

The current 55/80 m thresholds were explicitly retained as the full-presentation streaming contract in `world-terrain-019`. Increasing them globally would stream complete cave interiors, rocks, props, dungeon pool presentation and lights farther than necessary.

## 3. Architectural decision

Keep the real terrain cutout persistent.

Do **not** solve this by enabling/disabling `TerrainCutout` as the player moves. The cutout is intentionally owned by terrain chunk topology and survives initial load, unload/reload and every chunk re-mesh. Toggling it by camera/player distance would couple terrain topology to presentation relevance, require chunk re-meshing around thresholds and risk visible terrain popping/thrashing.

Instead add a **cheap distant cave-mouth occlusion presentation** owned by the existing cave presentation lifecycle.

The distant representation is presentation-only and must use the existing heightfield / entrance / `mouthOpeningAt` data. It must not become a second cave spatial representation or affect collision, ground queries, camera containment, fauna or persistence.

Preferred visual contract:

- while the full cave presentation is not active, the terrain aperture has a dark/rock-backed mouth proxy so no bright sky/background is visible through it;
- when the full cave presentation becomes active, the proxy is hidden/removed only after the full group has been attached successfully;
- when the full presentation is dropped, the proxy is restored before/while the full group is removed so no one-frame naked hole appears;
- from near range the existing full heightfield floor/ceiling, underside mask, mouth rocks and interior remain unchanged.

The proxy should be minimal geometry. It does not need to represent the cave interior. A small dark backing surface / shallow shell placed inside the mouth is sufficient if it covers every external sightline through the aperture without protruding into the visible terrain surface.

## 4. Implementation scope

### 4.1 Add a mouth-proxy builder next to current cave presentation code

Extend `src/world/caves/caveHeightfieldPresentation.ts` or a narrowly-owned sibling module with a small helper such as:

```ts
createCaveMouthProxy(...): THREE.Object3D | null
```

Requirements:

- derive placement from `CaveHeightfieldRepresentation`, the entrance orientation and the existing mouth contour;
- reuse the existing dark cave/mouth material where practical;
- use only a very small vertex/triangle budget;
- be independent of adventure props, interior rocks, pools and lanterns;
- no collision and no gameplay authority;
- add JSDoc / `@domain world-terrain` if the helper is architectural/public enough for preflight discovery.

Do not duplicate cave topology or invent a new mouth shape independent of `mouthOpeningAt`.

### 4.2 Own proxy lifecycle in `createCaves()`

`src/world/createCaves.ts` remains the owner.

Add explicit mouth-proxy runtime state keyed by `caveId` and integrate it with the existing full-presentation streaming transitions.

Ordering invariant:

```text
far / inactive full presentation
  -> proxy visible

full build succeeds
  -> attach full presentation
  -> hide/remove proxy

full presentation deactivates
  -> ensure proxy visible
  -> dispose full presentation
```

A failed full-presentation build must leave or restore the proxy rather than exposing the raw cutout.

Avoid a second independent streaming manager. Reuse the current cave grid/update and `createCaveStreamingController()` ownership. The proxy may be retained cheaply or lazily managed, but its lifecycle must stay subordinate to the existing cave owner rather than creating parallel relevance state.

### 4.3 Preserve full cave streaming thresholds

Do not raise `CAVE_ACTIVATE_DISTANCE = 55` / `CAVE_DEACTIVATE_DISTANCE = 80` as the primary fix.

Those thresholds control the full cave presentation and should remain unchanged unless measurements show a separate reason to retune them.

### 4.4 Disposal and shared GPU ownership

Follow current cave presentation ownership:

- proxy geometry/Object3D is disposed by `createCaves()`;
- shared material remains owned/disposed once by `createCaves()`;
- `dispose()` must clean every proxy and leave no scene children/resources behind;
- avoid disposing materials marked `userData.sharedGpu` through a per-proxy teardown.

## 5. Tests

Extend focused cave tests rather than relying only on browser observation.

At minimum cover:

1. terrain cutout remains registered independently of full cave presentation state;
2. before the 55 m full-presentation activation threshold, a mouth proxy exists for a relevant/visible cave;
3. after a full presentation is accepted, the proxy is no longer visible/attached;
4. after crossing the 80 m deactivation threshold, the proxy is restored while the full group is disposed;
5. a failed/stale full-presentation build cannot leave a naked terrain aperture;
6. `dispose()` removes both full presentations and proxy presentation state;
7. existing spatial queries (`queryGround`, `occupancyAt`, `resolveHorizontal`, `queryInterior`) remain independent of proxy state.

If the proxy geometry helper is pure enough, add a direct geometry regression ensuring it produces non-empty coverage for production cave mouths and stays behind/below the terrain aperture rather than covering the terrain surface itself.

## 6. Performance constraints

The fix exists specifically to avoid streaming full cave interiors at terrain-view distance.

Guardrails:

- no per-frame geometry rebuild;
- no terrain chunk re-mesh caused only by crossing cave presentation thresholds;
- no new world-wide scan per frame — use the existing cave grid/update path;
- keep the proxy draw/geometry cost minimal;
- do not load cave interior props/assets just to render the distant mouth;
- preserve the existing one-full-presentation-build-per-update hitch control.

Add/extend cave streaming debug counters if useful so full presentations and mouth proxies can be distinguished during manual verification.

## 7. Non-goals

This plan does not:

- redesign Cave V2 or its heightfield representation;
- alter cave generation, topology, archetypes or dungeon layout;
- replace the real terrain hole with a fake entrance;
- change cave spatial/collision semantics;
- change fog, sky or global render-distance behaviour;
- solve unrelated cave-interior interaction scoping;
- add new cave assets.

## 8. Verification

Technical verification:

```text
npx tsc --noEmit
pnpm run test -- <focused cave tests>
```

Run broader lint/build only if touched code or repository conventions require it.

Manual browser verification belongs to the User. Verify visually from several distances and angles:

- distant cave never exposes bright sky/background through the terrain hole;
- transition into the full presentation has no visible open-hole frame/pop;
- leaving the cave restores the distant representation cleanly;
- near entrance appearance and traversal are unchanged;
- cave interior/dungeon still renders normally after entry;
- repeated approach/retreat across 55/80 m does not leak objects or visibly thrash terrain.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
