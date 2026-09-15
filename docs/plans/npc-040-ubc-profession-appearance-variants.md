# Plan: UBC profession appearance variants for NPCs

**Created:** 2026-09-15
**Status:** `verification needed` 🔍 — implemented 2026-09-15 (`tsc`/lint/tests). Browser/manual verification not performed — belongs to the User.
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** ~~npc-039~~
**Domain:** `npc`
**Subdomains:** `presentation` `assets`
**Tags:** `characters` `assets` `professions`
**Roadmap:** -
**Implemented at:** 2026-09-15 19:30

V1 of items-player-037 Etap 1: visual diversity **within** adult farmer / woodcutter / trader / hunter UBC outfits. Bake hair/beard GLB variants; clothing hue and hair color stay runtime. Not the 037 `CharacterAppearanceDefinition` / per-slot player renderer.

Powiązane: `npc-039` (profession → Peasant/Wizard/Ranger), draft `items-player-037` (Etap 2 = player modular). Luźny koniec: remaining roles/children still Modular.

## Problem

After npc-039 every adult farmer shares one Peasant mesh + sapphire sidecar, every woodcutter the same mesh + earth-brown sidecar, every trader one Wizard mesh. Head/hair/beard are baked at compose time. Peasant/Wizard albedo atlases are exhausted (player default + brown + NPC sidecars).

## V1

Adult UBC NPCs (same role table as npc-039):

- Hair style from `{simple, long, buzzed, buns}` (female buzzed → `Hair_BuzzedFemale`).
- Beard (`Hair_Beard`) on ~35% of adult males, never on females.
- Hair albedo sidecar `hair_1.webp` / `hair_2.webp`.
- Clothing `material.color` multiply on the **role** sidecar (farmer stays sapphire-family, woodcutter earth-brown, trader crimson, hunter dark-violet `T_Ranger_2`) using four swatches: identity / warm / cool / darker.

Player GLBs unchanged. Default combos reuse them:

- `male_peasant.glb` = simple, no beard
- `female_peasant.glb` = long, no beard
- `male_wizard.glb` = simple, no beard
- `female_wizard.glb` = simple, no beard
- `male_ranger.glb` = simple, no beard
- `female_ranger.glb` = simple, no beard (NPC-only stem)

Other combos live under `public/models/characters/ubc/npc/`. `companionAnimationUrl` still matches `/models/characters/ubc/`.

Appearance is derived from `npcId` (not role, not `physicalSeed`) + gender + adult UBC outfit. No save-schema change.

Trader keeps every hair style; Wizard-hat clipping is a browser check, not a resolver filter. Ranger hood vs Long/Buns is the same kind of check.

## Out of scope

Runtime hair attach, per-slot player equipment, new clothing atlases, skin/eyes/accessories, Modular roles, children, persisted appearance.
