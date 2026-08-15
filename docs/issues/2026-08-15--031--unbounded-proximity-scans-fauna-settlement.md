# 031 — Unbounded O(N²) proximity scans in fauna `nearest()` and settlement `nearbyNpcCount`

**Status:** `todo`
**Date:** 2026-08-15
**Source:** [review 013](../reviews/2026-08-15--013--architecture-and-performance-audit.md)

Nie implementować od razu — oba miejsca są dziś tanie (≤34 NPC, ≤28 fauna). Wpis śledzi ryzyko skalowania, nie pilny fix.

## P1 — no gating at all

- `createSettlement.ts`'s `update()` runs a full O(N²) pairwise-distance loop over every NPC in the settlement, every frame, unconditionally, only to compute `nearbyNpcCount` for reaction-chance dampening (`src/settlement/createSettlement.ts:466-475`). Its only consumer (the reaction-chance branch in `NpcAgent.update()`) is already proximity-gated — this loop isn't. Cheap fix available now: recompute `nearbyNpcCount` only when an NPC is inside that same gate distance; no spatial structure needed.

## P2 — gated but still O(N²) in shape

- `AnimalAgent.nearest()` linearly scans the entire fauna population every frame, every agent, for predator/prey detection (`src/fauna/AnimalAgent.ts:1220-1276,1567-1586`, fed the whole `agents` array from `createFauna.ts:592-607`). `pickHerdLeader()` (herd/juvenile work, plan 118) scans the same array. At 500 fauna this is ~250k distance calcs/frame; at 2000 it's ~4M/frame.

## Fix shape (when a population target justifies it)

Both sites are structurally identical — one shared coarse spatial-grid helper (chunk-sized cells already exist as a unit) usable by both `Fauna` and `SettlementsManager`, not two bespoke fixes. Needs its own before/after benchmark before landing, same as the plan-112/113 gates require.

## Ignore for now

- `QuestManager.getPlayerStanding()`'s O(relations) recompute — bounded by NPCs actually met, already throttled by its only caller.
