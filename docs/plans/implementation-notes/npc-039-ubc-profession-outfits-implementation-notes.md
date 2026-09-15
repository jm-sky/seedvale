# Implementation notes: UBC profession outfits for NPCs

**Plan:** `npc-039-ubc-profession-outfits.md`

## Scope shipped

Adult `farmer` → Peasant + `npc_peasant.webp` (`T_Peasant_3`). Adult `woodcutter` → same Peasant mesh + `npc_woodcutter.webp` (`T_Peasant_2`) so the two labour looks differ. Adult `trader` → Wizard + `npc_wizard.webp` (`T_Wizard_3`). Both sexes. Children and every other role stay on `NPC_MODEL_URLS`. No save-schema change; appearance is derived in `resolveNpcAppearance`.

## Assets

Extended `compose_ubc_player.py` / `prepare-ubc-player-alpha.sh`. Female Peasant uses `Hair_Long`; Female Wizard keeps `Hair_SimpleParted` under the hat. Male meshes reuse the player GLBs. Sidecars are cloned onto `MI_*` via `src/assets/ubcOutfitMaterials.ts` so player `?playerTint=brown` cannot recolor NPCs.

## Runtime

`NpcAgent.create` loads `ual1_player.glb` whenever `companionAnimationUrl` matches, same merge as `PlayerController`. `anim.resolve` appends UAL names after Modular ones. Hunter/Ranger is not wired.
