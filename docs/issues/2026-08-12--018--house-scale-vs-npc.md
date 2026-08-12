# 018 — House scale vs NPC size

**Status:** `verification needed`

## Problem

Generated houses are often too small relative to the NPCs living in the settlement. Doors, walls and the overall building footprint do not consistently feel proportionate to the character scale.

## Expected behaviour

- Review the base house dimensions against the current NPC height and proportions.
- Ensure doors and entrances are believable for NPCs.
- Adjust the common house templates/generation parameters rather than adding per-building hacks.
- Verify the result across the different house types currently used by settlements.

## Goal

Make settlement buildings feel physically believable relative to the inhabitants.

## Fix (2026-08-12)

Quaternius Fantasy RTS cottages are roof-heavy; previous target heights (~2.8–3.6 m) left door bands ≈1 m vs NPC ≈1.75 m.

- Shared cottage height `HOUSE_COTTAGE_HEIGHT = 5.0`, tower `HOUSE_TOWER_HEIGHT = 6.4` in `src/settlement/props.ts` (`HUT_URLS`).
- Procedural `createHut()` wall band raised (~2 m before scale) so fallback matches.
- Default clearing `houseRadius` 4.5 → 5.5 in `worldConfig.ts` for larger footprints.

**Manual check:** walk a few settlements; doors/walls should feel NPC-scale across `hut_d` / `towerhouse` / `hut_a–c`.
