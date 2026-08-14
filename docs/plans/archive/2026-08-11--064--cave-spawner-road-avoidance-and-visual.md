# Plan: Cave spawner — road avoidance + visual

**Status:** `verification needed`  
**Created:** 2026-08-11  
**Scope:** Fauna prey spawners ([`src/fauna/createFauna.ts`](../../src/fauna/createFauna.ts)), road corridors, procedural cave prop

## Problem

1. Hardcoded `cave` / `thicket` spawners used `findWalkableNear` with only dry-land / `homeRadius` checks — no road-corridor rejection. The CSS2D „jaskinia” label could land in the middle of an inter-settlement road (placement ring 45–65 m from home).
2. Cave had no 3D mesh — only the floating label (plan 010 flavor label).

## Solution

1. **Road avoidance** — `ChunkManager.roadCorridorsNear` exposes `segmentsNear` + village paths; `createFauna` rejects spawner candidates within `halfWidth + 1` of any corridor (`distanceToSegment`, same idea as forest-belt `blocksPathOrClearing`).
2. **Visual** — `createCaveMouth` in [`props.ts`](../../src/settlement/props.ts): U-shaped rocks + dark recessed mouth. Attached for `type === 'cave'` only; CSS2D label kept (raised above the prop).

## Files

| File | Change |
|------|--------|
| [`src/terrain/chunkManager.ts`](../../src/terrain/chunkManager.ts) | `roadCorridorsNear(worldX, worldZ, querySize)` |
| [`src/app/worldBundle.ts`](../../src/app/worldBundle.ts) | Pass corridors (~querySize 150) into `createFauna` |
| [`src/fauna/createFauna.ts`](../../src/fauna/createFauna.ts) | Off-road filter for spawners; cave mesh + dispose |
| [`src/settlement/props.ts`](../../src/settlement/props.ts) | `createCaveMouth` |

## Out of scope

- Real underground geometry / biome-based cave generation
- Grove meshes (spawner type reserved, not spawned yet)
- Dig-on-road rejection
- Interaction / quest prompt changes

## Done when

- [x] Spawners reject road/path corridors
- [x] Cave has procedural mouth mesh + label
- [x] Thicket has three-tree cluster mesh + label (`createThicket`)
- [x] Technical: `tsc` / lint / build / test
- [ ] Browser: jaskinia off road, visible rocks; zagajnik shows 3 trees; „Zbadaj: …” still works
