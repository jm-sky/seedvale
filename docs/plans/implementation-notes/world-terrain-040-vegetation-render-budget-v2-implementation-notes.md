# Implementation notes — world-terrain-040 Vegetation render budget v2

## Status

Stage 1 implemented on `main` (2026-09-18). Recon below reflects the state before implementation; see "Stage 1 — as implemented" for what actually shipped.

## Stage 1 — as implemented

- `src/terrain/distanceLod.ts`: exported the far-distance clamp as `DENSITY_LOD_FLOOR = 0.08` (was an inline literal in `densityLodFraction`) so the per-kind policy can detect "already at floor" without duplicating the constant.
- `src/terrain/vegetationRegionBatcher.ts` (owns `VegetationKind`, per plan 1D):
  - Added `VegetationLodClass` (`silhouette` | `medium` | `detail` | `groundDetail`) and the `KIND_LOD_CLASS` mapping exactly as specified in the plan.
  - Added `CLASS_MID_MULTIPLIER`: `silhouette`/`medium` = `1` (unchanged), `detail` = `0.58`, `groundDetail` = `0.4` — chosen so High/`loadRadius=3`/dist=2 lands at `detail ≈ 0.286` and `groundDetail ≈ 0.197`, inside the plan's target bands.
  - Added `export function vegetationLodFraction(kind, dist, radius, lodScale)`. Band logic: `t = dist / max(1, radius)`; if `t <= 0.35` (near) or `base <= DENSITY_LOD_FLOOR` (far, already floored) return `base` unchanged; otherwise return `Math.max(DENSITY_LOD_FLOOR, base * classMultiplier)`. `base` itself is `densityLodFraction(dist, radius, lodScale)` — no independent curve.
  - Deliberately does **not** classify near field by `base === 1`: under `lodScale < 1` (Low/Medium presets) the near-field base is already `< 1` (e.g. `0.5` on Low), so near/far banding uses `t`/the floor constant directly rather than reverse-engineering it from the scaled value — this is the ambiguity the plan warned about.
  - `syncLod`'s contract changed from `(chunkCoord, fraction: number)` to `(chunkCoord, dist: number, radius: number, lodScale: number)`. It now resolves `vegetationLodFraction(kind, dist, radius, lodScale)` per kind inside the existing per-kind loop and stores it in the existing per-(region,kind) `chunkFractions` map — no new storage shape, `maxFraction()`/nearest-member-wins untouched.
- `src/terrain/chunkManager.ts`: `syncInstancedLodForRecord` now calls `vegetationRegionBatcher.syncLod(record.coord, dist, config.loadRadius, lodScale)` directly instead of pre-computing one shared `frac` via a local `vegetationLodForDistance()` helper (removed — it became dead code once per-kind resolution moved into the batcher). Grass keeps its own independent curve (`grassLodForDistance`), untouched.
- Reflection visibility (`syncReflectionVisibility`, `anyReflectionVisible`, `REFLECTION_DISTANT_LAYER` layer assignment) was not touched. While adding tests, found and recorded (not fixed, out of scope) a pre-existing bug in `anyReflectionVisible()` in `docs/plans/LOOSE-ENDS.md` — it always falls through to `return true` regardless of per-chunk visibility flags.
- Tests: `src/terrain/vegetationRegionBatcher.test.ts` — updated the two production call sites using the old `syncLod(coord, fraction)` signature, and added a `vegetationLodFraction` describe block plus batcher-level tests (per-kind mid-distance divergence, rebuild-preserves-effective-LOD, reflection/LOD independence). Covers every item in the Stage 1 test list below.
- Verification run: `pnpm run type-check`, `pnpm run lint` (auto-fixed import ordering only), `pnpm test` (full suite, 7453 tests), `pnpm run build` — all clean. No browser verification performed (user does this manually).

## Recon (pre-implementation state)

Recon completed against current `main` before implementation. Stage 1 is a safe production optimization before diagnostics.

## Current architecture / confirmed facts

- `src/terrain/vegetationRegionBatcher.ts` is the single renderer-side aggregation mechanism for living trees, bushes, cacti, reeds, ferns, lilies, seaweed and selected environment props (`largeRock`, `rockCluster`, `fallenLog`).
- Regions are fixed **3×3 chunks** (`REGION_CHUNKS = 3`). Chunk remains the world ownership / streaming unit; region is rendering-only.
- Each `(region, kind)` owns one `InstancedPropGroup` rebuilt when member chunk contributions change.
- `syncLod(chunkCoord, fraction)` currently stores one scalar fraction per contributing chunk, and the region applies `maxFraction()` — nearest contributing chunk wins.
- `src/terrain/chunkManager.ts::syncInstancedLodForRecord()` computes a common fraction from chunk Chebyshev distance.
- `densityLodFraction(dist, config.loadRadius, lodScale)` is the shared source curve for all vegetation/environment kinds.
- On High with `loadRadius=3`, the source fractions are approximately:
  - dist 0 → 1.00,
  - dist 1 → 1.00,
  - dist 2 → 0.49,
  - dist 3 → 0.08.
- `InstancedPropGroup.setLodFraction()` narrows `InstancedMesh.count`; it does not rebuild buffers.
- Reflection visibility already has a separate conservative per-region path and must stay independent.
- Existing 3×3 region batching solved the old per-chunk submission problem. Do not add another batching layer.

## Stage 1 — implement before new diagnostics

The current code already exposes a low-risk inefficiency: small/detail vegetation uses the same mid-distance density as silhouette-forming objects.

Implement a conservative per-kind policy using the existing LOD seam.

### Policy classes

Use a small explicit classification rather than per-kind magic curves:

- **silhouette**
  - `tree-living`
  - `cactus`
  - `largeRock`
- **medium**
  - `fallenLog`
  - `rockCluster`
- **detail**
  - `bush`
  - `reed`
  - `lily`
- **groundDetail**
  - `fern`
  - `seaweed`

In Stage 1:
- silhouette stays exactly on the current curve,
- medium stays exactly on the current curve,
- only detail / groundDetail are reduced.

### Distance-aware contract

Do not derive the whole policy from `baseFraction` alone if that makes near/mid/far ambiguous.

Preferred helper shape:

```ts
export function vegetationLodFraction(
  kind: VegetationKind,
  dist: number,
  radius: number,
  lodScale: number,
): number
```

Equivalent API is fine if it explicitly preserves the distance band.

Requirements:

- near field remains unchanged,
- far floor remains unchanged,
- only partial/mid LOD is reduced for detail classes,
- deterministic,
- no allocation,
- no duplicate independent distance curves at multiple call-sites.

For High / radius 3, target approximately:

| class | d0 | d1 | d2 | d3 |
|---|---:|---:|---:|---:|
| silhouette | 1.00 | 1.00 | 0.49 | 0.08 |
| medium | 1.00 | 1.00 | 0.49 | 0.08 |
| detail | 1.00 | 1.00 | ~0.27–0.29 | 0.08 |
| groundDetail | 1.00 | 1.00 | ~0.20 | 0.08 |

A class multiplier is acceptable internally, roughly:
- detail: 0.55–0.60 of current partial fraction,
- groundDetail: 0.40 of current partial fraction,

but do not apply that blindly to near=1 or below the current far floor.

### Integration seam

Prefer to keep per-kind knowledge in `vegetationRegionBatcher`, because it already owns `VegetationKind` and region-kind records.

Preferred flow:

```text
chunkManager
  computes existing distance/base LOD inputs
        ↓
vegetationRegionBatcher
  resolves effective fraction per kind
        ↓
chunkFractions for each region+kind
        ↓
existing maxFraction()
        ↓
InstancedPropGroup.setLodFraction()
```

If `syncLod(chunkCoord, fraction)` cannot support a truly distance-aware policy without reverse-engineering the band, extend the call minimally to include the already-known chunk distance (or equivalent band input). Do not move scene/world ownership into the helper.

### Preserve current region conservatism

Do not alter:
- `REGION_CHUNKS`,
- `maxFraction()`,
- region visibility,
- reflection visibility,
- rebuild-on-change.

One nearby chunk may still keep the whole region-kind dense. That is acceptable in Stage 1; region conservatism is a possible Stage 2 target only after measurement.

### Prefix-ordering guard

`InstancedPropGroup.setLodFraction()` renders the first N instances in each bucket. Existing placement ordering is deterministic/seeded and is relied on to make this a reasonable spatial subsample.

Do not:
- sort placements by distance,
- sort by vegetation kind importance,
- reorder source placements,
- introduce per-frame reordering.

Changing ordering is not part of this optimization and could make thinning spatially biased.

### Quality presets

Do not add config or GUI fields.

Preserve:
- Low `lodScale=0.5`,
- Medium `lodScale=0.75`,
- High `lodScale=1`.

The per-kind policy layers on top of the existing global quality setting.

## Explicitly out of Stage 1

Do not change:

- `tree-living`,
- `cactus`,
- `largeRock`,
- `fallenLog`,
- `rockCluster`,
- shadow policy,
- reflection policy,
- region size,
- region visibility,
- rebuild frequency,
- worldgen/placement density,
- grass/filler,
- settlement vegetation.

Do not add new diagnostics in the same implementation pass.

## Stage 1 implementation order

1. Inspect the exact `syncInstancedLodForRecord()` / `syncLod()` call contract on current main.
2. Add the pure policy classification/resolver.
3. Integrate the resolver into the existing region-kind LOD path with the smallest contract change needed.
4. Preserve existing region `maxFraction()` behavior.
5. Add focused tests.
6. Run repository-standard automated checks.
7. Stop production work. User benchmarks in browser.
8. Only after the user benchmark decide whether Stage 2 diagnostics are needed.

## Stage 1 tests

Cover at least:

- all `VegetationKind` values map to the intended class,
- near/full fraction stays 1,
- silhouette and medium match the old policy,
- detail is lower only in the partial/mid range,
- groundDetail is more aggressive than detail,
- no result exceeds the baseline fraction,
- current far floor is preserved,
- monotonicity with increasing distance,
- Low/Medium/High `lodScale` still affect the base policy,
- one region can apply different effective fractions to e.g. `tree-living` and `fern`,
- nearest-member `maxFraction()` still works per region+kind,
- rebuild reapplies the current effective kind policy,
- reflection visibility remains independent.

## Stage 2 — diagnostics only after user benchmark

If vegetation remains a material render cost after Stage 1, add a bounded vegetation-specific diagnostic snapshot.

Measure per kind:

- active InstancedMesh / draw submissions,
- active instance count,
- full capacity where cheap,
- active triangles,
- number of region-kind groups,
- applied LOD fraction,
- castShadow participation.

Also measure rebuild count/duration in `stream` only if needed.

Do not add a per-frame normal-game traversal.

Use Stage 2 to decide whether the next lever is:

1. silhouette/medium LOD,
2. conservative region `max()`,
3. rebuild cost,
4. a different measured source.

## Shadows interaction

`world-terrain-038` owns the completed shadow-content optimization. Do not add another shadow policy in Stage 1.

If later diagnostics show a new dominant shadow problem, record it explicitly rather than quietly duplicating shadow rules here.

## Technical verification

AI agent:

```text
pnpm test -- <focused vegetation tests>
pnpm typecheck / project-equivalent type check
pnpm lint
pnpm build
```

Use repository-standard commands from `package.json` / `CLAUDE.md`. Do not run browser verification. Do not run `pnpm docs:sync`.

User after Stage 1:

1. Run `?benchmark=settlement-heavy`.
2. Run `?benchmark=stream`.
3. Compare vegetation active instances/triangles, total draws, `RENDER`, FPS and frame p95.
4. Walk/turn through forest and region boundaries.
5. Inspect bushes, reeds, ferns, lilies and seaweed for visible thinning/pulsing.
6. Confirm near vegetation still looks identical.

## Success / stop gate

Keep Stage 1 if it yields a repeatable render/instance/triangle win without a visible near-range regression or obvious region-shaped popping.

If the gain is weak, do not keep increasing multipliers aggressively. Move to Stage 2 diagnostics and identify the actual remaining bottleneck.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
