# 026 — Cave mouth prop reads as a flat black disc, not a hole

**Status:** `todo`

## Problem

The cave prey-spawner's 3D prop (`createCaveMouth` in `src/settlement/props.ts`,
added by plan 064) is a U-shaped ring of rock meshes around a flat dark
open-ended cylinder (`mouthMat`, solid `0x1a1814`) standing on the ground.
There is no actual terrain depression — the "opening" is a lit, flat-shaded
disc/cap sitting on top of the untouched terrain, which reads as a black
canopy rather than a hole into the ground. Plan 064 explicitly scoped out
"real underground geometry" at the time.

## Expected behaviour (user request, verbatim intent)

Keep the rock-pile read, but replace the flat dark cap with an actual
depression/hole in the terrain between the rocks — ideally sited/oriented at
an angle (carved into a slope), not a flat symmetric pit on level ground.

## Notes for the fix

- `ChunkManager.modifyTerrain(x, z, radius, depth)` already carves a real,
  multi-chunk-safe circular depression into the terrain mesh (`terrain/dig.ts`
  / `terrain/chunkManager.ts`, built for the shovel dig feature) and is
  re-applied automatically to chunks as they (re)build for the lifetime of the
  current `ChunkManager` — the same "not save-persisted, reapplied on load"
  behavior already accepted for player digs works here too, since the cave's
  site is deterministic (seeded) and re-chosen identically every time
  `createFauna()` runs for that settlement.
- The existing dig constants (`DIG_RADIUS = 1.4`, `DIG_DEPTH_SOIL = 0.28`) are
  shovel-sized, not cave-sized — a cave mouth needs its own larger radius/depth
  tuned to read as a walk-in opening.
- `createFauna.ts`'s cave placement doesn't currently receive a way to carve
  terrain (only read-only samplers) — this needs a small new seam, not a new
  system.
- The "diagonal/angled" look is best achieved by siting the cave against a
  natural slope and orienting the opening along the measured downhill
  direction, reusing the same 8-direction steepest-descent sampling pattern
  `villagePlanner.ts`'s `downhillAngle` already uses — not by inventing a new
  directional/elliptical terrain-modification shape.

## Related

- Plan [083](../plans/2026-08-12--083--cave-mouth-terrain-depression.md) — fix.
- Plan [064 — cave spawner road avoidance and visual](../plans/2026-08-11--064--cave-spawner-road-avoidance-and-visual.md) — introduced the current flat-disc prop; explicitly scoped out real terrain geometry.
