# Implementation notes: UBC Fantasy Source outfits

**Plan:** `items-player-036-ubc-fantasy-source-outfits.md`

## Assets

Compose reads `_temp/Models/people/Modular Character Outfits - Fantasy[Source]` (UBC still `[Standard]`). Male outfits: Peasant, Ranger, Knight, Knight_Cloth, Noble, Wizard. Helmeted Knight variants skip `Hair_SimpleParted`. Rebuild:

```text
bash scripts/assets/prepare-ubc-player-alpha.sh
```

UAL1 extract list is owned by `items-player-035`; this plan does not change clips.

## Resolver

Empty body → Peasant; `leather_armor` → Ranger; any other body kind (including `chainmail`) → Knight. `?player=` whitelist adds `knight`, `knight_cloth`, `noble`, `wizard`. No new catalog items.

Preload warms Peasant/Ranger/Knight only.

## Tint

Same `?playerTint=brown` path. Outfit materials: `MI_Peasant` / `MI_Ranger` / `MI_Knight` / `MI_Noble` / `MI_Wizard`. Knight_Cloth shares `MI_Knight` and `T_Knight_2`.
