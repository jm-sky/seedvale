# Implementation notes: equipment-driven UBC outfit

**Plan:** `items-player-034-equipment-driven-player-outfit.md`

## Resolver

`resolvePlayerAppearance` in `src/player/playerVisualPreset.ts` is the single owner. `?player=` override wins; otherwise empty body slot → Peasant, any worn body armor → Ranger. Adventurer is only reachable through the URL. Unknown `?player=` warns and falls through to equipment/Peasant.

Gameplay `ArmorConfig` / `resolveEquipmentModifiers` are untouched. Mapping does not live in `itemCatalog`.

## Live swap

`PlayerController.applyAppearance` replaces the skinned `modelRoot` inside the existing wrapper `mesh`. Mixer is rebound to the same UAL clips; held-tool pivot reparents to the new `hand_r`. GPU stays in `loadGltf` cache — clones are not `disposeObject3D`'d.

Adventurer (`animationUrl == null`) and capsule are session-locked. Boot preloads the other UBC mesh so the first armor equip does not hitch.

gltfpack drops mesh names. Outfit materials are identified by `MI_Peasant` / `MI_Ranger`. Those materials are cloned on the instance before tint so the GLB cache is not mutated.

## Tint

`?playerTint=brown` loads `male_peasant_brown.webp` / `male_ranger_brown.webp` (`T_Peasant_2_BaseColor` / `T_Ranger_3_BaseColor`). Default albedos stay baked in the GLBs. Not persisted.

Re-pack (user-run, not part of this implementation pass):

```text
bash scripts/assets/prepare-ubc-player-alpha.sh
```

The compose script now copies the alt PNGs; the prepare script resizes them to 512 webp via a temporary `sharp` install.
