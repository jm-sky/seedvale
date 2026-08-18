# Review 022: Plan 149 — real-GPU program family dump (`cacheKey` / `name`)

**Status:** `done`
**Date:** `2026-08-18`
**Runs:** **3** cold `?benchmark=stream` (fresh page load each time)
**Scope:** measurement only. No `compileAsync()`, no prewarm, no shader/material/ChunkManager/render-pipeline/`checkShaderErrors` change. Instrumentation was already on `main` (`dumpProgramFirstUse()` / `summarize().programFamilies` from `6001579`).

Follows [review 021](./2026-08-18--021--plan-149-phase-0-real-gpu.md) (Phase 0 hitch + program-count census) with the missing **cacheKey/name** dump required before Phase 1. Plan: [149](../plans/2026-08-18--157--shader-program-first-use-hitch.md).

## Environment

- Cursor IDE browser (Chromium/Electron 40, `Chrome/144.0.7559.236`). GPU: `ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Confirmed via `WEBGL_debug_renderer_info` on the Three.js canvas before/during every run — **not SwiftShader**. Same renderer string on all three runs.
- `KHR_parallel_shader_compile`: **available** (`true`) on all three runs.
- `Emulation.setDeviceMetricsOverride` → canvas **1068×906**, `deviceScaleFactor=1`. Reports: `pixelRatio=1`, `quality: High`, `seed=42`, `res=193`.
- Fresh origin `http://localhost:5586/` (unused port so IndexedDB from `:5577` / `:5584` could not leak). Unattended `?benchmark=stream` auto-continues/creates the seed-42 world (no start-menu click).
- Head commit: `6cc9291` (includes `6001579` cacheKey dump instrumentation). No renderer behaviour change.

Dump API used at session end (runs 2–3 immediately when `__seedvalePerfLastReport` appeared; run 1 a few minutes later — extra post-session families, see below):

```js
window.__seedvaleProgramCensus.dumpProgramFirstUse()
window.__seedvaleProgramCensus.summarize()
```

## Results

Do **not** rank mean FPS. Hitch signal is still census stage `durationMs` on `programDelta > 0`.

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| FPS avg / min / p1 | 18.3 / 1 / 6 | 36.7 / 1 / 9 | 42.7 / 2 / 11 |
| Frame avg / p95 / **max** (ms) | 54.5 / 104.8 / **826.1** | 27.3 / 50.8 / **1320.4** | 23.4 / 51.7 / **470** |
| Census frames at dump | 1749 | 1078 | 1175 |
| **programCount final** | **225** | **204** | **211** |
| **unique `cacheKey`** | **229** | **210** | **217** |
| unique `name` (incl. `''`) | 25 | 26 | 26 |
| first-use events | 229 | 210 | 217 |
| Frame 0 first-use count | 54 | 52 | 52 |
| `cacheKey` reused? | **no** (229=229) | **no** (210=210) | **no** (217=217) |
| Slowest stage | mirror 656 ms (Δ19, f426) | mirror 1243 ms (Δ19, f745) | postprocess 828 ms (Δ27, f11) |

Run 1 was dumped after the 30 s session had already ended (game kept rendering; census ring still had the full first-use list). Runs 2–3 were dumped the moment the benchmark report appeared — closer to “end of `stream`”. Program counts 204–225 sit inside review 021’s **225–241** band; run 1’s 225 matches review 021 run 2 exactly.

Frame 0 is bit-stable: **52–54** programs (review 021: **53**).

## What `cacheKey` actually is

Three.js `WebGLProgram.cacheKey` is `getProgramCacheKey()` in `WebGLPrograms.js`: `shaderID` (or custom vertex/fragment shader ids) + defines + parameter list + two boolean masks + `outputColorSpace` + `customProgramCacheKey()`.

For `MeshStandardMaterial` the key starts `physical,STANDARD,,highp,srgb-linear,…`. Token **index 36** is `numPointLights` (confirmed against that layout: index 35 = `numDirLights` = `1`, 37 = `numSpotLights` = `0`). Do **not** treat `name` as the family id — `Green` alone had 23–26 distinct keys.

`customProgramCacheKey` groups:

| custom key | Run 1 | Run 3 | Whose materials |
|---|---:|---:|---|
| default `onBeforeCompile() { }` | 183 | 172 | most GLTF + depth + post |
| foliage-wind (`uFoliageTime` / `prevCompile`) | 40 | 38 | `Green`, `MapleTree_Leaves` / `BirchTree_Leaves`, `Flowers`, `LimeGreen` |
| `chunk-terrain-surface-detail-v5` | 6 | 7 | shared terrain `MeshStandardMaterial` |

Terrain is **one material UUID** (review 021) but **6–7 programs** — the extra copies are the same light-count / mask axis, not per-chunk terrain shaders.

## Unique keys vs unique names

1. **Unique `cacheKey`:** 210–229 per run. Equal to first-use event count. **Zero reused keys.**
2. **Unique `name`:** 25–26 (including empty). ~90–94 programs have `name === ''` (postprocess, depth, terrain, unnamed GLTF).
3. **Largest named families** (run 1 / 2 / 3): `Green` 26 / 23 / 25, `MI_WindowGlass` 20 / 16 / 16, `Wood` 11 / 9 / 10, `MI_WoodTrim` 10 / 8 / 8. By `materialType`: MeshStandardMaterial **135–150**, MeshDepthMaterial **48–53**, ShaderMaterial **24–25**, plus 1 RawShader (OutputShader), and on runs 2–3 also 1 PointsMaterial + 1 MeshBasicMaterial.

Within a named family the cacheKeys differ in **three token positions only**:

- **i=36 / `numPointLights`** — values observed: `{2,3,8,9,10,11,14,15,16}` across runs (a given run sees ~6–7 of these). **Same set appears in every named GLTF family** (`Green`, `Wood`, `MI_WindowGlass`, `MapleTree_Leaves`, …). This is a **global renderer light-count axis**, not a per-asset shader.
- **i=51 first boolean mask** — instancing bit (and alphaTest / tangent-space normal, depending on the family). InstancedMesh vs regular Mesh of the same GLTF material.
- **i=52 second boolean mask** — fog / shadowMap / doubleSided / related flags.

So the same *material name* is first-used many times because Three compiles a new program each time **visible point-light count** (and instancing) changes.

## First-use vs streaming

**Frame 0** (mirror then postprocess), stable ~52–54 programs:

- Sky (`SkyShader`, custom shader id `0`)
- shared terrain (`physical` + `chunk-terrain-surface-detail-v5`)
- first GLTF names: `Wood`, `Green`, `Pink`, `Stone`, `*Tree_Bark`, `*Tree_Leaves`, `Flowers`, `Dirt`, `MI_WoodTrim`, `lambert5SG`, `Pond_Pack_MAT`, `MI_WindowGlass`, `Main`, `None`
- ~8 MeshDepthMaterial (shadow)
- postprocess ShaderMaterials (custom ids `2…31`, unnamed; SMAA defines and `KERNEL_RADIUS` show up in the empty-name keys) + `OutputShader` + `GodRaysShader` (run 1)

**During streaming** (the remaining ~160 programs):

- almost entirely **more `physical` + `depth` copies of names already seen at frame 0**
- foliage-wind families keep growing (`Green` later frames: 12, 164, 418, 426, 527, 530, 557, 604, …)
- a few genuinely new names as the sprint hits another biome/settlement: `BirchTree_*` / `MapleTree_*` (whichever wasn’t in the start ring), `Skin` / `LimeGreen` (fauna/NPC), `Hay`, `Fire`, `Wood_Light`, `mat22`
- `points` (weather particles) and `basic` appear around frame 11–24, not in the initial 52
- ShaderMaterial growth after frame 0 is tiny (run 1: 3 later ShaderMaterials)

**Same families are first-used repeatedly** — yes, by `name`. No, by `cacheKey`. `Green` is 23–26 distinct programs, not 23 draws of one program.

## Are these mostly variants of the same materials?

**Yes.** ~600–670 unique material UUIDs collapse to ~210 programs, which themselves collapse to ~25 names × ~6–7 `numPointLights` values × instancing/depth.

This is **systematic variant proliferation**, not unbounded per-chunk GLTF clones. `loadGltf.ts` URL sharing is consistent with high UUID counts and much lower program counts — instances don’t each get a new program; **light-count changes do**.

Potentially unnecessary:

- Recompiling *every* `physical`/`depth` family when `NUM_POINT_LIGHTS` ticks from 2 → 3 → 8 → … → 16 as settlement lamps / fires / torches enter range. Depth programs also carry this token even though a depth pass does not shade those lights.
- Instanced vs non-instanced copies of the same foliage/GLTF material (`Green`, bark, trim).
- Terrain’s 6–7 programs for one shared material — same axes.

Not unnecessary (real shader families, mostly frame 0): sky, terrain onBeforeCompile v5, foliage-wind onBeforeCompile, SMAA/N8AO/bloom/godrays/output, weather `points`, water/grass as unnamed ShaderMaterials inside the numeric custom-shader-id set.

## Family → system

| Program family | cacheKey / name | Count (typical) | First-use stage | Notes |
|---|---|---:|---|---|
| GLTF / settlement / items (`physical`) | `Wood`, `MI_WoodTrim`, `MI_WindowGlass`, `Stone`, `Pink`, `lambert5SG`, `Pond_Pack_MAT`, `Hay`, `Fire`, `Main`, `None`, … | ~90–110 | frame 0 mirror; **re-first-used while streaming** | Dominant named set. Multiplied by `numPointLights` + instancing. |
| Foliage wind (`physical`) | `Green`, `*Tree_Leaves`, `Flowers`, `LimeGreen` | ~38–40 | frame 0 mirror; **re-first-used while streaming** | Same light-count axis + `customProgramCacheKey` foliage wind. |
| Shadow depth | `depth`, names usually `''` | ~48–53 | postprocess (shadow map lives in the beauty/`RENDER` stage wrap) | Also splits on the same `numPointLights` token. |
| Terrain | `physical` + `chunk-terrain-surface-detail-v5`, name `''` | 6–7 | frame 0 | One UUID, several light-count/mask programs. |
| Postprocess | custom shader ids `2…31`, `OutputShader`, `GodRaysShader` | ~20–25 | frame 0 postprocess | Stable; not the streaming hitch. SMAA/N8AO defines in keys. |
| Sky | `SkyShader` / id `0` | 1 | frame 0 mirror | |
| Weather particles | `points` | 1–2 | ~frame 11–12 | |
| MeshBasic | `basic` | 1–2 | ~frame 22 | |
| Water / grass ShaderMaterial | unnamed numeric custom ids (not `physical`) | few, inside the ~24 ShaderMaterials | mostly frame 0 | Scene still has 29–42 water *material UUIDs*; they share programs. |

## Answers to the ten questions

1. **Unique `cacheKey`:** 210 / 229 / 217 (runs 2 / 1 / 3).
2. **Unique `name`:** 25–26 including empty.
3. **Largest families:** MeshStandardMaterial ~140–150 (~65%); MeshDepthMaterial ~50 (~23%); by name `Green` ~25, `MI_WindowGlass` ~16–20, empty ~90 (mixed depth/post/terrain).
4. **First:** sky, terrain, first GLTF/foliage names, a handful of depth, full postprocess stack — all in frame 0 mirror+post (~52–54).
5. **Only during streaming:** additional `numPointLights` / instancing copies of those same names, plus a few new GLTF names (other tree species, NPC `Skin`, settlement extras), `points`, `basic`.
6. **Same families first-used many times?** By name: yes. By cacheKey: never. The repeats *are* new keys.
7. **Mostly variants of the same materials?** Yes.
8. **Unnecessary variant proliferation?** Yes, on the `numPointLights` axis (and secondarily instancing). Not a thousands-of-GLTF-clones problem.
9. **Who creates them?** GLTF/settlement/items + foliage + their shadow depth programs. Terrain is small. Postprocess/sky/water/grass are mostly the initial 52, not the streaming tail.
10. **A / B / C / other?** Review 021’s **A** assumed a stable family list you can prewarm once. This dump shows that list **keeps growing whenever point-light count changes**. Loading-time `compileAsync` of the frame-0 set **cannot** absorb later `NUM_POINT_LIGHTS=8,10,11,14,16` keys. Isolated repro of the hitch itself is already done (021). The data now point to **B — collapse the light-count (and then instancing) variant axis** before any prewarm.

## Wniosek

Not a small static set of ~50 programs, and not chaotic per-chunk spam.

**~25 named material families × ~6–7 `numPointLights` values × instancing/depth ≈ 210 unique programs.** Streaming hitches are bursts of already-known names compiled for a new light count (and sometimes a new instancing bit), paid by whichever of mirror/postprocess first-uses them.

Loading-time prewarm of the initial 52 (plan Phase 1 A as previously scoped) will miss the streaming tail unless the Cartesian product of light counts is also warmed — and Three will **still** compile a new key if the live count is not in that product. Pinning / padding visible point lights so `numPointLights` is constant makes the family set small and stable; *then* A becomes feasible.

## Recommendation

**Do not start Phase 1 A (`compileAsync` loading-window prewarm) from this dump.**

**Next step (one, not implemented here):** a Phase 1 **B** experiment that **pins or pads the visible `PointLight` count** to a single value for the whole session (dummy lights, or a fixed `NUM_POINT_LIGHTS` equivalent that does not change as settlements stream in). Re-run cold `?benchmark=stream` and check:

- unique `cacheKey` count collapses toward ~frame-0 size + truly new names,
- `Green` / `MI_WindowGlass` / `Wood` drop from ~10–25 keys toward 1–2 (color ± instancing, plus one depth),
- first-use stage hitches during the sprint disappear or move only to genuinely new names.

Do **not** revive per-chunk / per-tick / full-scene `compileAsync()`. Do not merge GLTF materials globally. After the light-count axis is gone, leftover instancing duplicates are a separate, smaller B; A is only in scope once `dumpProgramFirstUse()` shows a plateau with few new keys after frame 0.

## Diagnostic notes (no code change this session)

- `dumpProgramFirstUse()` worked; cacheKey/name/materialType/stage/frame were populated.
- The census event ring (`MAX_EVENTS = 20000`) will drop early first-use events if the tab is left running for many minutes after the 30 s session (frame snapshots + 2 stages/frame fill the ring). Dump at report time. Not a Phase 0 blocker.
- `summarize().programFamilies` groups by `materialType`, which is too coarse (`MeshStandardMaterial` × 150). Use `dumpProgramFirstUse()` + `cacheKey` / `name` for family work.
- `name` is empty for ~40% of programs; never classify those from the name field.

## Visual

Run 1 screenshot after stream: terrain, grass, mixed tree foliage, settlement props (`Osada Brzozowa` sign, well, cart), shadows, bloom/fog. No black materials in the captured frame.
