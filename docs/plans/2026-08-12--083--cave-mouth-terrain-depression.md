# Cave Mouth: Real Terrain Depression

**Status:** `planned` 📋
**Priority:** ⚪ `low`
**Effort:** `S`

## Goal

Replace the cave prey-spawner's flat dark disc ("czarny daszek") with rock
piles around an actual depression carved into the terrain, sited/oriented at
an angle where possible so it reads as a mouth cut into a slope rather than a
symmetric pit on flat ground.

See [issue 026](../issues/2026-08-12--026--cave-mouth-flat-prop-not-a-hole.md).

This stays a **surface facade**, same as today: no underground volume, no
navigable tunnel. Only how the entrance itself is rendered changes.

## Existing systems to reuse

- `ChunkManager.modifyTerrain(x, z, radius, depth)`
  (`src/terrain/chunkManager.ts`) — already carves a real, apron-safe,
  multi-chunk circular depression into the terrain heightmap and replays it
  automatically (`modifications` array, line ~526) as chunks around it
  (re)build. Built for the shovel dig feature; do not build a second terrain-
  modification mechanism for this.
- `applyModificationToTile`'s radial smoothstep falloff — reuse as-is, no new
  math.
- The steepest-descent sampling pattern already used by
  `villagePlanner.ts`'s `downhillAngle` (8 directions around a candidate
  point, pick the lowest) — reuse the *shape* of this helper for slope
  detection at cave-candidate sites; it's small enough to duplicate locally in
  `createFauna.ts` rather than extracting a shared terrain-math module for one
  caller.
- `createFauna.ts`'s existing "attempt N candidates, reject via filter,
  fall back" placement pattern (`findWalkableNear`, `spawnerSiteOk`) — extend
  it with a slope check for the `cave` spec, don't add a parallel placement
  path.
- `createCaveMouth`'s existing rock-ring geometry
  (`src/settlement/props.ts`) — keep the rocks, replace only the
  `mouthMat` cylinder.

## Core behavior

```text
today:   rocks in a ring  +  flat dark cylinder standing on untouched ground
after:   rocks in a ring  +  real depression carved into the ground,
         oriented into a slope when one is nearby
```

1. When `createFauna()` picks a `cave` spawner site, sample the local slope
   (steepest-descent direction + height drop across the candidate footprint,
   same 8-direction pattern as `downhillAngle`).
2. Prefer candidates with a meaningful slope; if none of the attempts find
   one, fall back to the flattest available candidate (today's behavior) —
   the depression still gets carved either way, just without the "angled into
   a hillside" framing.
3. Carve the depression via `chunkManager.modifyTerrain(pos.x, pos.z, caveRadius, caveDepth)`
   once, at cave-appropriate scale (new constants — the shovel-dig constants
   are far too small to read as a walk-in opening).
4. Orient `createCaveMouth`'s rock ring / recess using the measured downhill
   angle (when a slope was found) instead of the current
   "direction from settlement center" angle.
5. Rework `createCaveMouth`: drop (or drastically shrink/darken into a small
   back-wall accent only) the flat `mouthMat` cylinder now that a real pit
   exists; keep the rock ring so the opening still reads as rock-framed, not
   a bare hole.

## Integration boundaries

### `src/terrain/chunkManager.ts`

No changes — `modifyTerrain` already does what's needed. Do not add a
directional/elliptical modification mode for this; a symmetric pit sited on a
real slope already produces the "angled" read without new falloff math.

### `src/fauna/createFauna.ts`

- Gains a `modifyTerrain: (x: number, z: number, radius: number, depth: number) => boolean`
  parameter (from `worldBundle.ts`'s `buildFauna`, which already holds the
  `chunkManager` — pass just this one function, matching how `sampleHeight`/
  `sampleForestFactor` are already passed individually rather than the whole
  manager).
- Cave-specific candidate search gains a local slope-sampling helper and a
  scored/fallback selection (best-sloped candidate among the attempts,
  matching the "prefer X, fall back to any valid site" shape already used
  elsewhere in this file).
- After picking the final cave position, call `modifyTerrain(...)` once with
  new cave-scale constants before building the `createCaveMouth` prop.
- Needs a rock/mountain-ridge and water guard on the depression call similar
  to `dig.ts`'s `getDigProfileAt` (don't carve a pit into bare mountain rock
  or below water level) — thread `sampleMountainRidge` in the same optional
  way `coast` is already threaded today, or confirm the existing
  `spawnerSiteOk`/coastal checks already rule those sites out; verify during
  implementation rather than assuming.

### `src/settlement/props.ts`

- `createCaveMouth` accepts (or keeps deriving) the facing angle, now sourced
  from measured slope when available.
- Remove/shrink the flat `mouthMat` cylinder; rocks + real terrain do the
  "this is an opening" read. Keep a small dark accent only if the bare pit
  floor looks wrong without one — decide by eye during manual verification,
  don't over-specify the exact mesh here.

### `src/app/worldBundle.ts`

- `buildFauna` passes `chunkManager.modifyTerrain` into `createFauna(...)`.

### Not touched

- `src/terrain/dig.ts` / shovel dig constants and UX — unrelated feature,
  different scale; do not reuse `DIG_RADIUS`/`DIG_DEPTH_SOIL` here, define
  cave-specific constants instead.
- Thicket spawner visual (`createThicket`) — already a real 3D cluster (trees),
  not part of this complaint.
- Any underground/interior geometry, navigation, or "enter the cave" gameplay
  — out of scope, same as plan 064.

## Avoid overreach

Do **not** add in this plan:

- a real cave interior / underground space / tunnel mesh;
- a new directional or elliptical terrain-modification mode in
  `chunkManager.ts` — slope siting is what produces the angled look, not new
  falloff math;
- a generalized "terrain feature siting" framework — this is one spawner
  type's placement logic, extend it in place;
- changes to the shovel dig feature or its constants;
- changes to thicket/other spawner visuals.

## Tests

- Slope-sampling helper: pure function, unit-testable — given a synthetic
  height function, returns the expected steepest-descent angle and a
  sufficient/insufficient slope verdict for known inputs (mirrors how
  `villagePlanner.test.ts` likely already exercises `downhillAngle`-shaped
  logic, if a comparable test exists — check before duplicating a pattern).
- Keep existing `settlementGenerator.test.ts` / fauna tests green — this plan
  doesn't change spawner counts, kinds, or the road/coastal rejection already
  covered by plan 064.

## Performance

- One `modifyTerrain` call per cave spawner at settlement build time — same
  cost class as a single player shovel dig, not a per-frame cost.
- Slope sampling is 8 `sampleHeight` calls per placement attempt, bounded by
  the existing attempt cap (`maxAttempts`) — negligible, one-time at
  settlement build.

## Acceptance criteria

- Cave spawner shows a real terrain depression, not a flat floating disc.
- Where a nearby slope exists, the opening is visibly oriented into it rather
  than always facing "away from the village."
- Rock ring still reads as framing the opening.
- No underground interior/navigation implied or added.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` pass.
- Manual browser verification (dev server) across a couple of seeds/cave
  sites — this is a visual Three.js change and must not be marked verified on
  technical checks alone.

## Related plans

- [064 — cave spawner road avoidance and visual](./2026-08-11--064--cave-spawner-road-avoidance-and-visual.md) — introduced the current prop this plan reworks; explicitly scoped out real terrain geometry at the time.
- [052 — shovel digging and finding stones](./2026-08-10--052--shovel-digging-and-finding-stones.md) / [061 — dig UX](./2026-08-11--061--dig-ux-held-tool-and-level.md) — owns the `modifyTerrain` mechanism this plan reuses.
- [issue 026](../issues/2026-08-12--026--cave-mouth-flat-prop-not-a-hole.md) — the complaint / request this plan addresses.
