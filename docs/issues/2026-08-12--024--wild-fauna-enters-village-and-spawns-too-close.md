# 024 — Wild fauna enters the village; spawn points too close together

**Status:** `todo`

## Problem

Wild animals (wolf/fox/deer/stag and the plan-044 species) walk into the
village/settlement footprint, and their spawn points can land close to the
settlement — inside or right at the edge of the built area. Individual spawn
points (predator ring spawns, prey cave/thicket spawners) also aren't kept
apart from each other, so e.g. a wolf can end up wandering right next to a
deer thicket.

## Root cause (confirmed in code)

Fauna's village-avoidance and spawn placement use **fixed world-unit
constants** that were sized for the original (pre-047) village footprint and
were never rescaled when village footprints grew:

- `AnimalAgent.ts`'s `VILLAGE_AVOID_RADIUS = 20` gates wild wander-target
  selection and predator prey-chase give-up (`isNearVillage`). It's a single
  flat radius for every settlement, "no hard wall — just excluded from
  candidate wander targets" (see the constant's own doc comment).
- `createFauna.ts`'s `SPAWN_RING` places wild fauna 22–45 units from the
  settlement center, deliberately "a bit past `VILLAGE_AVOID_RADIUS` (20)".
- The `villages` list threaded through `gameLoop.ts` → `SettlementsManager` →
  `Fauna.update` → `AnimalAgent.update` carries **only `{x, z}`** — no radius
  per settlement (`gameLoop.ts:537`: `.map((s) => ({ x: s.center.x, z: s.center.z }))`).

Meanwhile `VILLAGE_SIZE_CONFIG.footprintRadius` (`src/settlement/families.ts`)
— the actual settlement boundary radius used by generation
(`villagePlanner.ts`'s `boundary.radius === sizeCfg.footprintRadius`) — is:

| Size | footprintRadius |
|---|---|
| OUTPOST | 22 |
| SM | 40 |
| MD | 48 |
| LG | 56 |
| XL | 72 |

Only `OUTPOST` is roughly consistent with the fauna constants. Every normal
village (`SM`–`XL`, introduced by plan 047, 2026-08-09) has a real footprint
radius well beyond the fixed 20-unit avoidance radius and the 22–45-unit spawn
ring — for `LG`/`XL` villages the entire wild-fauna spawn ring sits *inside*
the settlement. Plans 076/077 (village generator polish, garden scaling by
house count — most recent commits) pushed houses/gardens further out within
that already-larger footprint without touching fauna at all, compounding the
gap between "where the village physically is" and "where fauna thinks it is".

Separately: initial ring spawns (`SPAWNS` in `createFauna.ts`) and prey
spawners (`SPAWNER_SPECS`: cave/thicket) each pick a position independently
via `findWalkableNear`, with no minimum separation from each other or from
other spawn points — a predator's initial spawn and a prey spawner can land
close together by chance.

## Expected behaviour

- Wild animals should not wander onto settled ground, for every village size —
  not just `OUTPOST`.
- Wild fauna spawn points (initial ring + cave/thicket spawners) should keep a
  minimum clearance from the settlement footprint, scaled to its actual size.
- Different spawn points (predator ring spawn vs. prey spawner, or two
  spawners of different kinds) should keep some minimum distance from each
  other so predator and prey lairs don't end up adjacent.

## Related

- Plan [080](../plans/2026-08-12--080--wild-fauna-village-avoidance-and-spawn-spacing.md) — fix.
- Plan [047](../plans/2026-08-09--047--village-generation-overhaul.md) — introduced the larger `SM`–`XL` footprint radii.
- Plan [076](../plans/2026-08-12--076--village-generator-polish.md) / [077](../plans/2026-08-12--077--village-gardens-scale.md) — most recent village-size-scaling work, prompted this issue.
- Plan [044](../plans/2026-08-08--044--world-life-details.md) — original village-avoidance/spawn-ring fauna behaviour, predates plan 047's bigger footprints.
