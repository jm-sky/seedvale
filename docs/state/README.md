# docs/state/ — Domain state documents

Current-state documents for domains that are real, substantial and current, but don't fit any of the existing top-level docs (`SETTLEMENTS.md`, `GRAPHICS.md`, `WATER.md`, `items/CATALOG.md`). Created out of [docs/STATE.md](../STATE.md) when that file got too large to read whole before every plan — see the plans-automation cleanup, 2026-08-21.

Same rules as every other current-state doc: when a file here and the code disagree, **the code wins**; update the file. These are not plans and not implementation-history logs — that detail belongs in `docs/plans/`.

<!-- AUTO-GENERATED:START columns: File, Covers -->
| File | Covers |
|---|---|
| `combat.md` | Melee/ranged state machines, critical hits/defense, NPC combat phase, animal attack & NPC defense, role loadouts, combat interruption — shared across player/NPC/fauna |
| `player-systems.md` | Player survival needs, skills, busy channels, camp rest, player-built wells, animal traps (mechanic), seed planting, fishing/preservation, carry capacity |
| `settlements.md` | - |
| `terrain-and-world-generation.md` | Chunk streaming, worker pool, vegetation/rock instancing + region batching, tree species/lifecycle, mountains, weather/seasons, surface wetness/snow, slope movement |
| `water.md` | — |
<!-- AUTO-GENERATED:END -->

Don't add a new file here just because a system exists. A new doc belongs here only when the content is current (not a change history), doesn't fit an existing document, is big enough to earn its own file, and will plausibly be read again by a future plan. Otherwise the content belongs in an existing document, or stays in a plan's own implementation notes.
