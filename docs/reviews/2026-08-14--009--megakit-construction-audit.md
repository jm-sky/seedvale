# Review 009: MegaKit Construction Audit

**Status:** `done`
**Date:** 2026-08-14
**Scope:** audit all 176 GLB in `public/models/settlement/megakit/` and design/implement a `ConstructionCatalog` layer over `AssetIndex` (plan [109](../plans/2026-08-14--109--megakit-construction-catalog.md)).
**Not in scope:** `HouseBuilder`, settlement wiring, colliders, entrance system.
**Related:** [review 008](./2026-08-14--008--asset-browser-modular-cottage.md), [plan 107](../plans/2026-08-14--107--asset-browser-agent-discovery.md) (landed during this session — `AssetIndexEntry.status/pack/kind`, `mergeParkedManifest`), [review 011](./2026-08-14--011--megakit-construction-browser-verification.md) (browser pass), [megakit README](../../public/models/settlement/megakit/README.md)

## Method — no browser this session

This session had no browser access. Instead of the Asset Browser UI, the audit is a Node
script (`scripts/audit-megakit.mjs`) that parses each GLB's binary JSON chunk directly and
computes native world-space AABB from the **required** `POSITION` accessor `min`/`max` —
per glTF spec these must be present and expressed in real units even though the kit's
buffers are meshopt-compressed (`EXT_meshopt_compression`) and quantized
(`KHR_mesh_quantization`), so no vertex-buffer decode was needed. All 176 files parsed with
zero errors and zero missing bounds. Spot-checked against review 008's manual measurements
(e.g. `wall_plaster_straight`: script `[2, 3.125, 0.407]` vs review 008's hand-measured
`2.00 × 3.12 × 0.41`) — matches to the reported precision.

**Consequence:** all geometry facts below (dimensions, symmetry, origin placement) are
measured, not guessed. Anything that requires *seeing* the model was left open in §5 and
confirmed later the same day in [review 011](./2026-08-14--011--megakit-construction-browser-verification.md)
(`_l`/`_r` wall semantics, door/window identity vs hinge offset, `wooden_2x1` composition,
`roof_roundtiles_4x4` naming vs footprint). Face-orientation (`front`/`back` as exterior)
is still an assumption — not load-bearing until snap logic exists.

## 1. Scope

176/176 GLB in `public/models/settlement/megakit/` audited. Output:
`src/assets/megakitAudit.generated.json` (dimensions, min/max, material names, symmetry
flags per file) + `src/assets/constructionCatalog.ts` (semantics layer) +
`src/assets/constructionCatalog.test.ts` (22 tests) + `src/assets/houseDefinitionExample.ts`
(example data, cross-validated against the catalog by tests).

## 2. Assets used

- `public/models/settlement/megakit/*.glb` (176 files) — audited directly, not through the
  Asset Browser.
- `src/assets/assetIndex.ts` — `kindFromBasename`, `mergeParkedManifest`, `AssetIndexEntry`
  (landed by plan 107 during this session; `ConstructionCatalog` reuses these rather than
  re-deriving kind-from-filename itself).
- `megakit/README.md`'s prefix/count table — cross-checked, not retyped; the audit script's
  per-kind counts match it exactly (roof 39, wall 20, overhang 20, floor 12, door 8,
  windowshutters 8, corner 8, window 6, doorframe 4).

## 3. Confirmed modules

| Family | Measured (m) | Module | Notes |
|---|---|---|---|
| `wall_*` (plaster/brick straight, door, window, woodgrid) | 2.00 × 3.12 × 0.41 | **2 m on X**, symmetric, origin at Y=0 | `_l`/`_r` variants are the *same* 2.00 m footprint — see §5 for what "l/r" likely means |
| `floor_*` full tiles | 2.00 × 0.02 × 2.00 | **2 m on X** (and Z) | half tiles (`_half1/2/3`) are a real **1 m** module but offset to one edge, not centered — still a valid module, just not "grid-reliable" by the centered-translation rule (§4) |
| `border_straight` | 2.00 × 0.13 × 0.70 | 2 m, matches wall/floor width | exterior trim, same grid |
| `overhang_plaster_long/short`, `overhang_*_unevenbrick` | 2.00 × ~3.0–3.1 × 1.3–2.2 | 2 m on X | roof-to-wall transition; wide side variants (`overhang_side_*`) are **not** 2 m (0.48 × 6.12 × ~1.4–2.3) — vertical corner brackets, different shape class entirely despite the shared prefix |
| `corner_*` | 0.09–0.71 m footprint, ~3 m tall | **no 2 m module** | confirms review 008: MegaKit has **no** L-shaped 2×2 corner wall mesh. All 8 corner files are posts/mitre trim, not walls |
| `roof_wooden_2x1*` (7 files) | X≈2, Y≈1.2–1.6, Z≈1.5–1.6 | 2 m sub-family | the *only* modular roof kit — see §5 |
| other 32 `roof_*` | 2.6×1.8×0.75 up to 9.95×6.78×15.7 | **not modular** | single pre-sized caps named by target footprint (`roundtiles_4x4` … `6x14` … `8x14`), not tiled from repeating units — see §5 for the unresolved naming-to-footprint mapping |

**Verdict on the 2 m module claim:** confirmed for wall / floor / border / most overhang /
the `wooden_2x1` roof sub-family. **Refuted** for corners (posts, not L-walls) and for the
32 non-`wooden_2x1` roof caps (pre-sized, not tiled).

## 4. Construction classes + anchor/connection model

`ConstructionPartKind` (`src/assets/constructionCatalog.ts`): `wall` (20) · `door` (8, leaf)
· `window` (6 insert + 8 shutters = 14) · `floor` (12) · `roof` (39) · `corner` (8) ·
`opening` (4, doorframe) · `decoration` (everything else — overhang, stairs/stair,
holecover, balcony, chimney, fence, border, crate, vine/prop_vine, wagon, prop_brick,
prop_exteriorborder ≈ 75 files). Mapping is mechanical (`kindFromBasename`'s existing
filename-prefix table from plan 107, not a new ontology) — one line per kind, not per file.

**Anchors** are the six AABB face midpoints (`left`/`right`/`front`/`back`/`top`/`bottom`)
in native (`prepare: 'none'`) space — always computable from measured bounds, so every one
of the 176 parts has all six. What's **not** always reliable is whether a face-midpoint
anchor is *useful* for simple module-width translation:

- `gridReliable: true` — wall / floor / corner parts that are X-symmetric **and** have
  their Y origin at the base (floor level); roof parts that are X-symmetric (roofs sit at
  wall-top height, not Y=0, so base-origin isn't required for them).
- `gridReliable: false` — door leaves (pivot at the hinge edge, e.g. `door_1_flat` spans
  X ∈ [-0.046, 1.072], not centered), window inserts/shutters (elevated mid-wall, e.g.
  `window_wide_flat1` Y ∈ [0.944, 2.524]), doorframes (same off-center pivot as the opening
  they fill), most roof pieces (`roof_wooden_2x1_middle` sits at Y ∈ [0.924, 1.062] — it's a
  ridge cap resting on other pieces, not a ground-relative part; `roof_wooden_2x1_corner`
  has an asymmetric X/Z pivot built for a specific L-turn), and all `decoration` parts.

This is a deliberate, narrower type than the existing `AssetAnchorDef`
(`src/assets/assetAnchors.ts`, [ANCHORS.md](../assets/ANCHORS.md)) — that system is for
runtime attachment points (grip/mount/interaction, e.g. held-tool grips, lamp mounts) and is
unchanged. `ConstructionAnchor` is a structural connection-side concept for a future
`HouseBuilder`; the two are not meant to merge.

## 5. Problems, uncertainties, unresolved

Flagged explicitly rather than guessed, per the task's instruction not to author anchors "on
sight":

1. **`wall_plaster_straight_l` / `_r` semantics.** Same 2.00 m footprint as the
   plain `_straight` wall (not a narrower corner mesh). **Browser pass (review 011):**
   not 45° mitres and not a texture-only swap — different mesh (`_l` 72 tris vs 86) plus
   extra `MI_Brick` (end-return for a post-less corner). Current left/right anchors apply.
   First houses should still prefer `straight` + `corner_*` posts.
2. **Roof composition is not one rule.** Only the 7-file `wooden_2x1` sub-family
   (straight/l/r/corner/middle/center/center_mirror) is modular; `corner` and `middle`
   pieces have non-centered/elevated pivots that a builder must hardcode per-part, not infer
   generically. **Browser pass (review 011):** `_middle` sits on the straight slope at
   identity (`Y ≈ 0.99`); `_corner` origin is the inner L; `roof_roundtiles_4x4` is a
   complete cap at 5.51 × 4.25 × 5.56 m — the vendor `4x4` name is **not** 4×4 wall-modules
   of 2 m (that would be 8×8 m).
3. **`overhang_*` (20 files) sits structurally between "wall/roof" and "decoration".** It's
   the roof-to-wall transition piece a real house needs, but it doesn't cleanly fit any of
   the 6 named kinds (wall/door/window/floor/roof/corner) requested for this catalog, so it
   is classified `decoration` for now. A `HouseBuilder` plan should probably promote it to
   its own class rather than treat it as pure clutter.
4. **Zero authored anchors, zero animations, zero surviving node names** across all 176
   files (`gltfpack` strips node names; confirmed independently by this audit, matches
   review 008 §2 Krok 6). Material names do survive (`MI_Plaster`, `MI_WoodTrim`,
   `MI_UnevenBrick`, …) and are carried into `ConstructionPart.materials`.
5. **Face semantics (which Z face is "exterior") are an assumption, not a measurement.**
   The catalog labels `min.z` as `front` and `max.z` as `back` by convention (X = width/
   module axis, Z = thickness axis, Y = up — the only axis assignment the measured
   dimensions support), but nothing in the GLB confirms which physical face was authored as
   the outward-facing one. Not load-bearing for this plan (no builder consumes it yet); flag
   for whoever writes snap logic.

## 6. MegaKit limitations for a future `HouseBuilder`

- No L-shaped corner wall mesh — corners are posts (`corner_*`) or `_l`/`_r` end-return
  wall variants (same 2 m anchors; confirmed visually in review 011, not 45° mitres).
- No small modular roof kit beyond the 7-file `wooden_2x1` family; anything bigger needs a
  single pre-sized cap matched to the footprint, not a tiled assembly.
- `door_*` leaf styles (`1/2/4/8`, flat/round) are design variants, not size tiers — all ~1.1
  m wide regardless of style number.
- No authored snap/entrance anchors anywhere in the kit (confirmed, not assumed).

## 7. Recommendation

Start a `HouseBuilder` from the **fully grid-reliable, fully modular** subset only: plaster
walls (straight + door + window variants), `floor_wooddark` tiles, `corner_exterior_wood`
posts, the `wooden_2x1` roof sub-family, `door_1_flat` + `doorframe_flat_wooddark`,
`window_wide_flat1`. Browser pass (review 011) confirmed that subset: doorframe/window at
identity on the matching wall; `door_1_flat` needs a recorded `x ≈ -0.51 m` hinge offset;
`_l`/`_r` walls and large roof caps stay out of automatic snap. Do not attempt automatic
snapping for `gridReliable: false` parts without those per-part offsets.

## 8. Example `HouseDefinition`

`src/assets/houseDefinitionExample.ts` → `TEST_HOUSE_01`: a 4 m × 2 m one-room plaster hut
(2×1 floor tiles, front wall = door segment + blind segment, back wall = two blind segments,
one blind segment per side wall, four corner posts, one door opening with frame + leaf, a
two-segment `wooden_2x1` roof run). Every `assetId` it references is validated against the
real catalog by `constructionCatalog.test.ts` (kind must match: wall placements resolve to
`wall` parts, the door opening resolves to a `wall`+`opening`+`door` triple, etc.) — this is
the concrete demonstration that the catalog carries what a builder needs, not just a
documentation example that can drift from the code.

## Definition of done

- [x] All 176 MegaKit GLB in the audit (`megakitAudit.generated.json`).
- [x] Construction elements needed for houses identified (wall/door/window/floor/roof/corner/opening; decoration for the rest).
- [x] Key element dimensions confirmed by measurement (not retyped from review 008 — independently re-derived and cross-checked).
- [x] Wall/floor/roof modularity determined (2 m confirmed for wall/floor/border/most-overhang/`wooden_2x1` roof; refuted for corners and 32 non-modular roof caps).
- [x] Connection points/rules identified (`ConstructionAnchor` face-midpoints + `CONSTRUCTION_RULES`, geometry-derived).
- [x] Significant limitations identified (§5, §6).
- [x] `AssetIndex` remains the source of truth (`buildConstructionCatalog` calls `mergeParkedManifest`, no parallel registry).
- [x] `ConstructionCatalog` exists (`src/assets/constructionCatalog.ts`).
- [x] No second asset registry created.
- [x] Tests for key categories (`constructionCatalog.test.ts`, 22 tests: discovery, dimensions, module/grid-reliability, rules, example-house referential integrity).
- [x] Construction audit report (this document).
- [x] Example `HouseDefinition` shown (`houseDefinitionExample.ts`, cross-validated by tests).
- [x] `HouseBuilder` **not** implemented.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run test` passes (651/651, including the 22 new tests).
- [x] Browser verification — [review 011](./2026-08-14--011--megakit-construction-browser-verification.md)
      (Asset Browser overlays; `_l`/`_r`, door/window pivots, wooden_2x1 + one large cap).
