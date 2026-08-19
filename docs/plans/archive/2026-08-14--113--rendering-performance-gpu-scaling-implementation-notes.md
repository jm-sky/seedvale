# Plan 113 — implementation notes

**Date:** 2026-08-15  
**Plan:** [2026-08-14--113--rendering-performance-gpu-scaling.md](./2026-08-14--113--rendering-performance-gpu-scaling.md)  
**Review:** [012](../../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md)

Plan §17: do not run every stage automatically. This session implemented **P0 + P1** and the cheap **P2** extensions of existing LOD/shadow knobs. P3/P4 and cross-chunk vegetation merging stay out until a post-change benchmark says they are still needed.

Chunk-mesh hitch stays in [plan 112](./2026-08-14--112--chunk-streaming-hitch-optimization.md) — not duplicated here.

## What landed

### P0 — N8AO / post-process budget

- High preset: AO **on**, quality **Performance**, still half-res (was blunt `aoEnabled: false` after review 012, which made High look worse than Medium).
- Auto-budget: **retired 2026-08-18**. Hard on/off from last-frame Render ms (suppress ≥15 / restore ≤10) oscillated — AO-off frames measure cheaper than AO-on by more than the gap, so grass went light/dark (review 017). `applyFrameBudget` is now a no-op; AO follows the preset/GUI. `aoBudget.ts` remains for existing unit tests only.
- Isolation probes now also toggle bloom / SMAA / god rays / film grade (`no-bloom`, `no-smaa`, `no-god-rays`, `no-film-grade`).

### P1 — Shadow once per frame

- `gameLoop` sets `shadowMap.autoUpdate = false` and `needsUpdate = true` **after** the water mirror, **before** beauty. Mirror already forced `autoUpdate = false` during its `renderer.render()`.
- Asset browser keeps the default `autoUpdate = true` (it does not go through `gameLoop`).

### P1 — Settlement instancing

Static, non-interactive repeats now go through existing `buildInstancedProps()`:

- palisade wings
- forest-belt bushes
- stockpile barrels
- hay stacks

Left individual (gameplay lifecycle): harvestable settlement trees, doors, lights/torches, campfire, well, wagon, NPC.

House static parts were already batched (plan 111).

### P1 — Water mirror budget

- Cap 60 Hz → **30 Hz** (every other frame at 60 FPS). RT stays **128²** (already reduced from 256²).
- NPC/fauna on `AGENT_RENDER_LAYER` (2). Mirror camera stays layer 0. Main camera + sun shadow camera enable layer 2.

### P2 — Grass / vegetation LOD + NPC shadows

- Shared `densityLodFraction`: near full, far floor **~8%** (was ~25%). Filler blades still near-ring only.
- Distant NPC/fauna (`> 36` units) drop `castShadow`. Simulation / FSM unchanged.

## Not done (on purpose)

| Stage | Why |
|---|---|
| P2 vegetation bucket merge (`species × primitive` → shared geo/mat) | 451 buckets are **per-chunk** × species × primitive. Merging inside one chunk by UUID does not help unique GLBs. Cross-chunk sharing is a new manager — wait for a post-P1 benchmark. |
| P2 NPC submesh merge | Skinned clips; distance shadows first. |
| P2 terrain resolution LOD | Needs a visual benchmark; not changed. |
| P3 HLOD / advanced culling | After real remaining bottlenecks. |
| P4 TAA / WebGPU | Explicitly later. |
| Plan 112 chunk hitch | Separate plan, already in `verification needed`. |

## Verification

| | |
|---|---|
| **Implemented** | P0, P1, cheap P2 as above |
| **Technically verified** | `tsc` / lint / unit tests / `vite build` (this session) |
| **Browser / benchmark** | **pending** — compare with review 012 on seed 42, High, `?benchmark=settlement` / `water` / `current` / `night` / `stream`. Watch draw calls, `mirrorDrawCallsAvg`, Render ms, isolation `no-ao` / `no-shadows` / `no-reflections`. |

### Manual browser steps

1. `npm run dev` (port 5577). Open `?perf=1&seed=42` and force Quality **High**.
2. Walk a village plaza: palisade / barrels / hay / bushes should look identical; doors and house lights still individual.
3. Look at water: reflections update a bit less often; NPCs/animals should **not** appear in the reflection; terrain/trees/houses should.
4. Distant NPCs: still visible, but their shadows can drop off around ~36 units.
5. Heavy night village: AO stays at the quality preset (auto-budget no longer hard-toggles). Grass should not pulse light/dark on a still camera.
6. If a dedicated benchmark tab is available: `?benchmark=settlement` then `water`, compare JSON to review 012.
