# Review 011: MegaKit Construction Catalog — browser verification

**Status:** `done`
**Date:** 2026-08-14
**Scope:** visual check of the four Construction Catalog assumptions that review [009](./2026-08-14--009--megakit-construction-audit.md) could not confirm from GLB AABB. Prompt: [2026-08-14--006](../prompts/2026-08-14--006--verify-mega-kit-and-assets-browsers-for-houses.md). Plan: [109](../plans/2026-08-14--109--megakit-construction-catalog.md).
**Not in scope:** `HouseBuilder`, architecture changes, re-audit of all 176 GLB, NPC/world/performance tests.
**Tool:** `/asset-browser.html` on Vite `:5577`, Cursor browser. Pairs loaded via `referenceUrl` + `url` (prepare `none`), overlay at identity, quad views + report native AABB.

## Verdict

The catalog is a reliable enough foundation for a `HouseBuilder` and ~10 test houses — **only on the modular subset already recommended in review 009**: plaster walls, `floor_wooddark`, `corner_exterior_wood` posts, the `wooden_2x1` roof family, `door_1_flat` + `doorframe_flat_wooddark`, `window_wide_flat1`.

`TEST_HOUSE_01` cannot be displayed (no builder / playground). Its wall/floor/corner/door references are sufficient; the roof field is too thin for two slopes or gable ends.

No code changes in this session. Offsets below are recorded for the next builder plan, not implemented.

```text
Walls _l/_r: PASS
Doors: PASS
Windows: PASS
Roofs: PASS
TEST_HOUSE_01: NOT AVAILABLE
```

## Method

Targeted overlays only — not a walk of the 176-file kit.

| Pair | What was checked |
|---|---|
| `wall_plaster_straight` + `wall_plaster_straight_l` | `_l`/`_r` semantics vs current anchors |
| `wall_plaster_straight_l` alone | front/perspective look |
| `wall_plaster_door_flat` + `door_1_flat` | leaf pivot vs opening |
| `wall_plaster_door_flat` + `doorframe_flat_wooddark` | frame at identity |
| `wall_plaster_window_wide_flat` + `window_wide_flat1` | insert at identity |
| `roof_wooden_2x1` + `roof_wooden_2x1_middle` | modular roof compose |
| `roof_wooden_2x1_corner` | L-turn origin |
| `roof_roundtiles_4x4` | large cap vs `4x4` name |

Browser native sizes matched the Node audit (`megakitAudit.generated.json`) on every loaded pair.

## Findings

### 1. Wall `_l` / `_r` — PASS

Not 45° mitres, not L-meshes, not a texture-only swap.

- Same 2.00 × 3.12 × 0.41 m module as `wall_plaster_straight`; origin at base; X-centered. Current left/right anchors apply.
- `_l` is a different mesh: 72 tris vs 86, extra material `MI_Brick`. AABB delta is 2 mm (quantization), not a mitre footprint.
- Front view looks like a normal plaster+timber wall. Brick is an end-return for a post-less corner.

First ~10 houses should keep using `wall_plaster_straight` + `corner_*` posts (`TEST_HOUSE_01` already does). `_l`/`_r` are optional visual variants on the same grid.

### 2. Door / window pivots — PASS (catalog flags correct)

**Doorframe** `doorframe_flat_wooddark` sits in the pre-cut opening at identity. Native `[1.574, 2.312, 0.388]`, X-centered (`center_x ≈ 0.001`). No asset-specific offset.

**Door leaf** `door_1_flat` pivot is the hinge, not the opening centre. At identity: `x ∈ [-0.046, 1.072]`, center `x = 0.513`. It hangs in the right half of the opening. `gridReliable: false` is correct.

Recorded offset (do **not** implement here):

- **`x ≈ -0.51 m`** — hinge-origin → centred opening (door center 0.513 → frame center 0.001)
- optional `y ≈ -0.035 m` (leaf min Y is 0.035; report `ground_contact: floating`)
- optional `z ≈ -0.05 m` (leaf vs frame thickness) — not required to look seated

**Window** `window_wide_flat1` fills the matching wall opening at identity. Authored height `Y ∈ [0.944, 2.524]`, X-centered. Frame protrudes in Z (sill depth), which is correct kit geometry. No extra XYZ offset when parented to the wall at the same origin. `gridReliable: false` stays — it is not a floor-level 2 m tile.

### 3. Roof — PASS (with per-part origin rules)

`wooden_2x1` (straight) + `_middle` compose at identity: `_middle` is a 2×2 m ridge plate at `Y ≈ 0.99` (`min_y = 0.924`), sitting on the straight slope (`max_y = 1.087`). `_middle` spans both sides of the ridge; a full gable still needs the opposite slope (`center_mirror` or a second `2x1`).

`_corner` is a triangular L-turn. Origin is the inner corner (`min ≈ [-0.10, -0.17, -1.44]`, `max ≈ [1.44, 1.01, 0.11]`). Face-midpoint anchors are not a useful snap. `gridReliable: false` is correct.

`roof_roundtiles_4x4` is a complete gabled cap, native `[5.513, 4.249, 5.561]`. The name is **not** 4×4 wall-modules of 2 m (that would be 8×8 m). Vendor naming, not the MegaKit grid. Do not tile large caps; pick one cap per footprint.

Roof `gridReliable` in the catalog means X-centering only. Straight `wooden_2x1` still sits with origin near the ridge/eave line (`Y ∈ [-0.16, 1.09]`, `Z` mostly `+`), so a builder places it at wall-top height, not at `y = 0`.

### 4. `TEST_HOUSE_01` — NOT AVAILABLE

No assembled preview exists. Do not build a playground for this check.

From the data + the overlays above:

- Wall / floor / corner / door-triple `assetId`s resolve and are the right kinds (already tested).
- Door leaf will need the `-0.51 m` X offset when the builder places it.
- `roof: { assetId, segmentCount }` cannot express two slopes or gable end caps. That is a `HouseDefinition` shape limit, not a catalog hole.

## Constraints for a future `HouseBuilder`

- Snap automatically only `gridReliable: true` parts (walls/floor/corner posts).
- Parent doorframe and window insert at identity on the matching opening wall.
- Hardcode `door_1_flat` `x ≈ -0.51` (and only that, unless a later visual pass tightens Y/Z).
- Use `wooden_2x1` family with per-part origins; do not infer corner/middle placement from AABB face midpoints.
- Ignore `_l`/`_r` walls and the 32 non-modular roof caps for the first 10 houses.
- Widen `HouseDefinition.roof` before generating varied roofs.

## Definition of done

- [x] `_l`/`_r` wall semantics checked visually (not all 20 walls).
- [x] One door opening + leaf + frame overlay.
- [x] One window opening + insert overlay.
- [x] Representative wooden_2x1 straight / middle / corner + one large cap.
- [x] `TEST_HOUSE_01` availability assessed (not available; data judged from parts).
- [x] No `HouseBuilder` implemented.
- [x] No catalog/architecture code changes.
