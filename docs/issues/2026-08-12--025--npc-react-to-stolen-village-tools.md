# 025 — NPC react when player takes village farm tools

**Status:** `todo`  
**Related:** [plan 082](../plans/2026-08-12--082--village-tool-props-and-temp-assets.md), [`MODELS.md`](../assets/MODELS.md) M08/M09

## Problem / desired behaviour

Home-village **pitchfork** / **sickle** spawn as one-time pickups near gardens
(plan 082). Taking them today is silent — they behave like any world item.

When the player **picks up** a village-owned farm tool (spawner id from the
settlement item pool), nearby NPCs should protest, e.g. bark/dialog
*„Hej! Co robisz!?”*, optionally with a small relation penalty.

## Out of scope for now

- Implementing the reaction (this issue only tracks the future work).
- Held-hand visuals for pitchfork/sickle (separate from plan 081 held tools).

## Notes

- Spawner kinds: `pitchfork`, `sickle` in `createItemSpawners.ts`.
- Hook candidate: collect path in `gameLoop` / `interactables` when collecting
  from `itemSpawners` with those kinds (not player-dropped copies).
