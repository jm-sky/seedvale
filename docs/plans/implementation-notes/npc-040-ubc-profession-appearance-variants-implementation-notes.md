# Implementation notes: UBC profession appearance variants for NPCs

**Plan:** `npc-040-ubc-profession-appearance-variants.md`

## Scope shipped

Adult farmer/woodcutter/trader/hunter keep the profession outfit + role sidecar. Hair style, optional male beard, hair albedo (`hair_1` / `hair_2`) and a four-swatch clothing hue are rolled from `npcId` (not role, not `physicalSeed`). Men roll `simple` / `long` / `buzzed` (no Buns). Peasant/wizard women roll `Hair_Long` / `Hair_Buns`; ranger women only `Hair_Long`. Female Wizard long hair is `npc/female_wizard_long.glb` (the stem used to be SimpleParted). Children and other roles stay Modular. No save-schema change.

Default meshes reused: `male_peasant` / `male_wizard` / `male_ranger` simple; `female_peasant` long. Remaining combos live in `public/models/characters/ubc/npc/`. Hunter uses `npc_ranger.webp` (`T_Ranger_2`).

## Assets

`compose_ubc_player.py` emits NPC variants under `npc/`. `prepare-ubc-player-alpha.sh` gltfpacks them the same way as player outfits (`-cc -kn`, no flatten) and converts `T_Hair_*_BaseColor` to `hair_1.webp` / `hair_2.webp`. Female hair is `Hair_Long` / `Hair_Buns` only.

## Runtime

`resolveNpcAppearance` takes `npcId`. `ubcOutfitMaterials.ts` clones `MI_Hair_*` separately from clothes so outfit tint cannot overwrite hair, then `NpcAgent.create` applies role tint → clothing hue → hair tint. `deps.modelUrl` still skips the automatic look.
