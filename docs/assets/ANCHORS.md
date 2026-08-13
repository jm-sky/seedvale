# Seedvale anchor convention

Anchors are named transform frames on assets. They live in the asset domain (`src/assets/`) and are consumed by gameplay code and the [asset alignment browser](/asset-browser.html).

## Naming

- Stable names match `/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/` (e.g. `grip`, `hand.right`, `lamp_mount`).
- GLB nodes use the `SV_` prefix (case-insensitive), e.g. `SV_grip`, `SV_lamp_mount`. Blender duplicate suffixes (`.001`) are stripped.
- Metadata in `src/assets/assetAnchorData.ts` overrides a GLB anchor of the same name (`override-shadowed` issue).

## Types

| Type | Orientation required | +Z means | +Y means |
|---|---|---|---|
| `grip` | yes | working end (blade, flame) | back of hand when held |
| `attachment` | yes | out of palm | toward fingertips |
| `mount` | yes | outward surface normal | world up |
| `interaction` | no | facing direction (optional) | world up |
| `origin` | no | asset forward when known | world up |

## Spaces

- **`assetLocal`** — meters in the asset root frame after `prepareProp` / `preparePropFitMax`. Same space as `HOUSE_CATALOG.lampMount`.
- **`node`** — offset in meters along a named bone/node; resolver divides by node world scale (Quaternius ~100× armature).

Resolution produces `localMatrix` (relative to asset root) and `worldMatrix` (after pose and instance TRS).

## Validation issues

`invalid-name`, `duplicate-name`, `missing-node`, `ambiguous-node`, `missing-orientation`, `non-uniform-node-scale`, `prepare-mismatch`, `override-shadowed`, `selection-invalid`.

## Per-asset status (MVP)

| Asset id | Anchors authored | Notes |
|---|---|---|
| `character:player`, `npc:*` | `hand.right` (metadata) | rotation correction TBD in browser |
| `house:hut_d` | `lamp_mount` (metadata) | ported from catalog `lampMount`; anchor-first in `resolveHouseLampMount` |
| `house:hut_a` / `hut_b` / `hut_c` | `lamp_mount` (metadata) | floor-center lantern (`HOUSE_FLOOR_LAMP_Y`); anchor-first |
| `settlement:well` | `interaction` (metadata) | south rim of well GLB / procedural fallback; consumed by `buildWellInteractionQueueConfig` |
| Held tools (`held:*`) | none enabled | add `grip` to `HELD_TOOL_GRIP_ANCHORS` after browser verify; `mountByAnchorPair` opt-in |
| Other houses, fauna props | none yet | Phase 6 continues per-asset |

## Blender workflow

1. Add an Empty aligned to the desired frame (+Z forward, +Y up).
2. Name it `SV_<anchor-name>` (e.g. `SV_grip`).
3. Parent to the mesh/bone as needed; re-export GLB.
4. Verify in the alignment browser — GLB anchors survive `prepareProp` rescaling automatically.
