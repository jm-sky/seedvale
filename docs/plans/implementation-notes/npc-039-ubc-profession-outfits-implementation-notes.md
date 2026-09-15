# Implementation notes: UBC profession outfits for NPCs

**Plan:** `npc-039-ubc-profession-outfits.md`

## Scope shipped

Adult `farmer` → Peasant + `npc_peasant.webp` (`T_Peasant_3`). Adult `woodcutter` → same Peasant mesh + `npc_woodcutter.webp` (`T_Peasant_2`) so the two labour looks differ. Adult `trader` → Wizard + `npc_wizard.webp` (`T_Wizard_3`). Adult `hunter` → Ranger + `npc_ranger.webp` (`T_Ranger_2`). Adult `guard` → Knight without helmet + `npc_knight.webp` (`T_Knight_3`, 2026-09-15). Both sexes. Children and every other role stay on `NPC_MODEL_URLS`. No save-schema change; appearance is derived in `resolveNpcAppearance`.

## Assets

Extended `compose_ubc_player.py` / `prepare-ubc-player-alpha.sh`. Female stems use `Hair_Long`; the only extra female variant is `Hair_Buns`. `Hair_BuzzedFemale` is not used. Guard Knight strips `Head_Armet` and adds sliced head + hair — player `male_knight.glb` stays helmeted. Male Peasant/Wizard/Ranger meshes reuse the player GLBs. Sidecars are cloned onto `MI_*` via `src/assets/ubcOutfitMaterials.ts` so player `?playerTint=brown` cannot recolor NPCs.

## Runtime

`NpcAgent.create` loads `ual1_player.glb` whenever `companionAnimationUrl` matches, same merge as `PlayerController`. `anim.resolve` appends UAL names after Modular ones.
