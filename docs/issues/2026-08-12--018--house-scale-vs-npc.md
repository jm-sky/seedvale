# 018 — House scale vs NPC size

**Status:** `verification needed`

## Problem

Generated houses are often too small relative to the NPCs living in the settlement. Doors, walls and the overall building footprint do not consistently feel proportionate to the character scale. Global height bumps helped some variants and broke others (lamps in mid-air; towerhouse used as a cottage).

## Expected behaviour

- Review the base house dimensions against the current NPC height and proportions.
- Ensure doors and entrances are believable for NPCs.
- Adjust the common house templates/generation parameters rather than adding per-building hacks.
- Verify the result across the different house types currently used by settlements.

## Goal

Make settlement buildings feel physically believable relative to the inhabitants.

## Fix (2026-08-12) — systematic

See plan [074](../plans/archive/2026-08-12--074--house-catalog-scale-lamps-debug.md).

- Per-model `HOUSE_CATALOG` (`src/settlement/houseCatalog.ts`) with individual `height` / lamp fractions.
- `towerhouse` removed from family-home rotation.
- Wall lamps use real `findWallMount` again (no centered `displacementFactor = 0`).
- Identify models in-game: `?debug=1` + `[E] Obejrzyj` → id/URL in dialog + console.

**Manual:** open with `?debug=1`, examine each house, tune that row in the catalog if doors still look wrong.
