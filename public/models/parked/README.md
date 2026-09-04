# Parked models

Files here (or referenced from CREDITS/MODELS as parked) are **in the repo** but
**not wired** into gameplay yet.

| File | Notes |
|------|--------|
| `FishingRod_Lvl2.fbx` | Needs license confirmation + FBX→GLB before use |

Related parks live under normal folders with CREDITS rows marked parked — see
[MODELS.md](../../../docs/assets/MODELS.md) M07, M12–M18 (incl. `fx/blood_splat.glb`
for death VFX, `fauna/chicken.glb`, `settlement/farm_poly.glb`, `nature/rock_b.glb`).

## 2026-09-04 asset drop — unwired

Quaternius/J-Toastie GLBs sorted into `public/models/` on 2026-09-04 (see git
history / `docs/items/CATALOG.md`, `docs/assets/MODELS.md` for the wired
half of this drop: backpack, saddlebags, pan, rope, chest, tomato, coin,
roasted_meat/beef, fish, plus in-place replacements of `fauna/cow.glb` and
`settlement/barrel.glb`). The files below have **no matching item/prop
concept yet**, or are redundant variants — kept in repo, not wired anywhere.

| File | What it is | Why parked |
|------|------------|------------|
| `items/pouch_small.glb` | small single bag | No small-pouch item kind exists. Closest fit is `tree_seed`/`seed_carrot`/`seed_potato`/`seed_cabbage` (MODELS.md M56 "seed pouch(es)", currently a flattened-dodecahedron procedural) — plausible reuse, not a 1:1 match, needs a call |
| `items/fish_alt_a.glb`, `items/fish_alt_b.glb` | alternate fish meshes | `items.fish` is already wired to `items/fish.glb` (Mackerel). These two are redundant unless/until fishing gets per-catch visual variety by species |
| `nature/tall_grass.glb` | tall grass clump | Not blocked by anything — pure decorative flora variety, not required by any open backlog row (MODELS.md M06-adjacent). Wire into `BUSH_SPECS`/flora placement when someone wants the variety |
| `settlement/cauldron.glb` | cooking cauldron | Cooking today is campfire + optional `pan`/grate (MODELS.md M58/M59); no "cauldron" cooking-capacity tier exists in `items/campfireCooking.ts` — needs a new concept, not a drop-in |
| `boat.glb` | rowboat | No boating/lake-vehicle concept anywhere in `docs/items/CATALOG.md` or `docs/assets/MODELS.md` |
| `cart.glb` | pushcart | MegaKit `wagon.glb` already covers the merchant cart (MODELS.md M03, wired); this would be a second/decorative variant with no functional gap to fill |
| `chicken_leg.glb` | poultry meat/food | No `chicken` meat item kind — the species-meat mapping in `docs/items/CATALOG.md` covers deer/wolf/boar/rabbit/cow, not chicken |
| `coin_piles.glb` | decorative coin pile | Not an item — could work as Kupiec stall / market decoration, but no such prop concept exists yet |
| `fish_bone.glb` | eaten-fish remnant | No "consumed food leaves a prop" mechanic exists anywhere (species-meat harvest byproducts — `hide`/`bones_pile`, MODELS.md M39 — come from corpse harvest, not from eating) |
| `lettuce.glb` | lettuce | No standalone `lettuce` item kind; garden crop beds (MODELS.md M25) already render lettuce decoratively inside the combined `settlement/crops.glb` mesh |
| `pumpkin.glb` | pumpkin | Same as lettuce — decorative in M25's `crops.glb`, no standalone `pumpkin` item kind |
| `scroll.glb` | scroll/document | No quest-document, letter, or readable-item concept in the codebase |

## Fauna companions (no system yet)

`fauna/dog_husky.glb` and `fauna/dog_shiba.glb` (2026-09-04 drop) — no
pet/companion-animal system exists; nearest neighbor is wild `fox`/`wolf`
fauna, not a tameable companion. Left in `fauna/` (matches the folder's
existing convention of holding parked species, e.g. `chicken.glb` per M07)
pending a future companion-animal concept.
