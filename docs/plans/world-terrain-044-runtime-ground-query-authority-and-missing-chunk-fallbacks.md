# Plan: Runtime ground query authority and missing-chunk fallbacks

**Created:** 2026-09-19
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~world-terrain-031~~, ~~world-terrain-033~~
**Domain:** `world-terrain`
**Type:** `bug`
**Roadmap:** -

## Problem

`ChunkManager.readField()` silently falls back to raw analytical samplers when the owning chunk is absent or not yet `ready`.

For `heights` / `floorHeights`, that fallback is not equivalent to the authoritative runtime tile. A ready tile can additionally contain:

- road shaping;
- river channel/ford shaping;
- player/system terrain modifications;
- exact terrain preparation heights.

`sampleBridgeDeck()` also depends on the owning chunk record's retained `bridgeSpecs`; if the chunk is missing it returns `null`. Therefore `sampleSurfaceGround()` can silently downgrade from bridge-aware/runtime-modified ground to raw analytical terrain.

The same movement sampler feeds player, NPC and animal slope/ground logic. Near a ready ↔ missing/generating boundary, finite-difference slope probes can even sample one point from the runtime tile and another from raw fallback, producing an artificial slope/step.

The raw analytical fallback is useful for generation-time, streaming-independent queries. The defect is that one API silently serves both meanings.

## Goal

Make ground-query semantics explicit and preserve one authoritative path for each use case:

1. deterministic streaming-independent terrain/worldgen queries;
2. resident runtime terrain queries;
3. movement surface ground (terrain + declared bridge deck, with cave arbitration remaining caller-owned).

A runtime movement query must not silently pretend raw base terrain is equivalent to a missing canonical surface.

## Current flow

```text
sampleHeight/sampleFloor
  → readField()
  → ready tile: sample apron grid (roads/rivers/modifications included)
  → missing/generating: sampleHeightAt/sampleFloorAt(fallbackParams)

sampleSurfaceGround
  → sampleBridgeDeckAt()
     → missing record => null
  → readField('heights')
     → may use raw fallback
```

Consumers include:

- `PlayerController` through `chunkManager.sampleSurfaceGround`;
- `NpcAgent` and settlement/detached `AnimalAgent` through bridge-aware composed samplers;
- wild fauna through the corresponding bridge-aware movement sampler;
- shared `stepWithSlopeAndCollision()` finite-difference slope probes.

Placement/worldgen callers intentionally continue to use terrain rather than bridge decks.

## Implementation

### 1. Inventory and name query contracts

Document/encode the semantic distinction instead of retaining a permissive "number always" contract where absence changes meaning.

At minimum identify:

- analytical/base sampling that is valid without a loaded chunk;
- canonical generated tile sampling;
- runtime-mutated ground sampling;
- movement surface sampling (runtime ground + bridges);
- cave ground, which remains a separate arbitration layer.

Do not globally replace `sampleHeight` with `sampleSurfaceGround`; worldgen/placement must not treat bridge decks as terrain.

### 2. Remove silent downgrade from runtime movement

For player/NPC/fauna movement, choose an explicit policy when canonical surface data is unavailable.

The implementation must preserve simulation independence and performance. Acceptable design directions include a cheap explicit unavailable result plus lifecycle/streaming ownership that guarantees detailed movers have needed ground, or a deterministic bounded resolver that can reconstruct the same canonical surface facts without materializing presentation. Choose after focused implementation recon; do not make per-agent hot paths regenerate chunks/routes/rivers.

### 3. Keep bridge authority consistent

The same declared `RoadBridgeSpec` used by terrain projection/presentation must remain the movement deck authority. Missing chunk presentation must not be used as evidence that a bridge does not exist.

Do not duplicate bridge classification.

### 4. Handle chunk boundaries

Add explicit tests around coordinates immediately to both sides of a chunk boundary and slope-probe offsets straddling it.

Required invariants:

- ready/ready neighboring apron samples agree;
- a transition in residency state cannot fabricate a terrain cliff for detailed movement;
- bridge footprints crossing chunk boundaries resolve consistently;
- runtime terrain modifications overlapping a seam remain identical from both neighboring canonical grids.

### 5. Preserve generation-time analytical queries

Settlement siting, routing/coarse world queries and other intentionally off-screen deterministic consumers still need a streaming-independent query. Keep that capability explicit rather than forcing chunk residency.

### 6. Cross-domain water follow-up

`sampleLocalWater()` currently combines `readField()` fallback with loaded-record river gameplay segments. The water-domain audit should verify missing-chunk semantics separately. Do not broaden this plan into a hydrology redesign, but keep ground/water movement contracts compatible.

## Relevant files

- `src/terrain/chunkManager.ts`
- `src/terrain/chunkHeightmap.ts`
- `src/terrain/slopeConstraint.ts`
- `src/player/PlayerController.ts`
- `src/app/createApp.ts`
- `src/app/worldBundle.ts`
- `src/settlement/createSettlement.ts`
- `src/settlement/SettlementsManager.ts`
- `src/fauna/createFauna.ts`
- `src/fauna/AnimalAgent.ts`
- `src/ai/NpcAgent.ts`
- `src/settlement/roadNetwork.ts`
- `src/terrain/roadBridge.ts`

## Tests

Cover at least:

1. runtime tile versus analytical fallback with road shaping;
2. runtime tile versus analytical fallback with river/ford shaping;
3. player modification on a chunk that unloads/reloads;
4. bridge surface resolution on both sides of a chunk boundary;
5. shared slope probe across a residency boundary;
6. missing/generating canonical data follows the chosen explicit policy rather than silently returning raw ground;
7. placement/worldgen callers still do not treat bridge decks as terrain.

## Performance guardrails

- No chunk generation in a per-frame/per-agent hot path.
- No world-global scans for a ground sample.
- Reuse retained/cached road/bridge/river data or existing deterministic analytical mechanisms.
- Detailed simulation may justify ensuring local canonical ground; remote simulation must stay aggregated and independent of presentation streaming.
- Avoid introducing a second mutable terrain source of truth.

## Verification

Automated tests should prove query semantics and boundary invariants. Browser verification of player/NPC/fauna traversal is performed by the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
