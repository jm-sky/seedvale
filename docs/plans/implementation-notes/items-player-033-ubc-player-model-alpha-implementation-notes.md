# Implementation notes: UBC player model alpha

**Plan:** `items-player-033-ubc-player-model-alpha.md`

## Asset recon

Fantasy outfit GLTFs (`Male_Peasant`, `Male_Ranger`) have clothes only — no face. UBC Standard has no separate head mesh: `Superhero_Male_FullBody` is eyebrows + eyes + one full-body mesh. The compose script keeps eyebrows/eyes and slices body triangles whose vertices have ≥0.5 weight on `Head`/`neck_01` (1555 verts / 2844 tris).

All four sources share the same 65-bone UBC joint order (`root`, `pelvis`, … `hand_r`). JOINTS_0 indices are remapped by bone name anyway.

Godot glTF image URIs sometimes use `T_Foo_png.png` for files named `T_Foo.png` — `resolve_image_file()` handles that.

UAL1 in-place (`UAL1_Standard.glb`, not `_RM`) clip tracks target bone names directly. Mixer plays them on the outfit scene without retarget. Do not flatten/join in `gltf-transform optimize` — that collapses the armature.

Re-run:

```text
bash scripts/assets/prepare-ubc-player-alpha.sh
```

## Runtime

`?player=peasant|ranger|adventurer` is a whitelist in `playerVisualPreset.ts`. Unknown values warn and keep Adventurer. Extra clips load from `ual1_player.glb` only for UBC presets.

`RIGHT_HAND_BONE_NAMES` gained `hand_r`. `HELD_ATTACH` stays Adventurer `WristR` space; UBC applies one shared `hand_r` map (`UBC_HAND_FROM_WRIST_R`) in `mountAttachOnSocket`. In-game Euler trim is that constant only (sign / extra axis) — do not duplicate per-item offsets.

Runtime outfit swap on equipment lives in plan items-player-034.

## Out of scope (see LOOSE-ENDS)

Female outfits, UAL2, jump/crouch/swim clips, NPC retarget.
