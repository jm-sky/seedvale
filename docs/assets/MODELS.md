# Required models

Living backlog of 3D models Seedvale still needs, or has on disk but must wire into runtime.

This is **not** a full inventory. For credited in-repo assets see [CREDITS.md](./CREDITS.md). For parked MegaKit files see [`public/models/settlement/megakit/README.md`](../../public/models/settlement/megakit/README.md).

**Last updated:** 2026-08-20

## How to use

During feature planning or implementation:

1. Ask whether the work needs a new GLB (or a parked one wired in).
2. If yes — add a row here (or update an existing one).
3. When the file is in `public/models/` and used at runtime, set status to `wired` (or remove the row if you prefer a short backlog).

If the feature needs no new model, do nothing to this file.

## Status values

| Status | Meaning |
|--------|---------|
| `needed` | Not acquired / not in repo yet |
| `in repo` | File exists under `public/models/`, not wired (or only partially) |
| `wired` | Loaded and used in gameplay/runtime |

## Backlog

| ID | Model | Need / context | Status | Related |
|----|-------|----------------|--------|---------|
| M01 | Richer house shells / wall segments (MegaKit) | Fantasy RTS cottages are roof-heavy. Modular subset (plaster walls, `floor_wooddark`, corner posts, `wooden_2x1` roofs, door/window) is wired through `HouseBuilder` into settlement homes (plan 111). Remaining MegaKit files stay parked | `wired` (HouseBuilder subset) / `in repo` (rest) | [research 006](../research/2026-08-11--006--medieval-model-library-complement.md), [review 008](../reviews/2026-08-14--008--asset-browser-modular-cottage.md), [review 009](../reviews/2026-08-14--009--megakit-construction-audit.md), [plan 109](../plans/2026-08-14--109--megakit-construction-catalog.md), [plan 111](../plans/2026-08-14--111--house-construction.md), [issue 018](../issues/2026-08-12--018--house-scale-vs-npc.md) |
| M02 | Yard fence / gate runs | Better palisade/yard than single `wall.glb` stubs | `in repo` | MegaKit `fence_*`, `wall_arch` |
| M03 | Settlement clutter (wagon, chimney, vines…) | Optional village density props. Home Kupiec wagon uses MegaKit `wagon.glb` | `wired` (merchant wagon) | MegaKit parked set, [plan 090](../plans/archive/2026-08-12--090--sword-merchant-tent-caves-pickaxe.md) |
| M04 | Economy / outpost buildings | Market, windmill, towncenter, watchtower, barracks, temple, port. `farm.glb` wired as village wheat field | `wired` (farm) / `in repo` (rest) | [CREDITS](./CREDITS.md), [plan 099](../plans/archive/2026-08-13--099--wheat-field-glb.md), plan 071 |
| M05 | Background mountains | Distant silhouette meshes | `in repo` | [plan 024](../plans/2026-08-07--024--world-visual-overhaul.md) (`mountain_a/b/c`) |
| M06 | Extra flora variants | `bush_flowers_1`, `flower_clump_2` — flower-only subset of `BUSH_SPECS`, drawn by `flowerMeadowPatches` | `wired` | nature reserve in CREDITS |
| M07 | Farm animals (chicken / cow / sheep / horse / donkey) | Village livestock GLB; home Kupiec decorative horse | `wired` | [SOUNDS](./SOUNDS.md), [plan 096](../plans/archive/2026-08-13--096--fauna-glb-held-tools-lights-vfx.md) |
| M08 | Village pitchfork | Garden pickup + holdable melee | `wired` | [plan 082](../plans/archive/2026-08-12--082--village-tool-props-and-temp-assets.md), [plan 096](../plans/archive/2026-08-13--096--fauna-glb-held-tools-lights-vfx.md), [issue 025](../issues/2026-08-12--025--npc-react-to-stolen-village-tools.md) |
| M09 | Village sickle | Garden pickup + holdable melee | `wired` | plan 082, plan 096, issue 025 |
| M10 | Hay bale clutter | Decorative hay near gardens | `wired` | plan 082 |
| M11 | Pickaxe (mining gameplay) | Held tool; one-time stockpile pickup; mines ore deposits | `wired` | [plan 090](../plans/archive/2026-08-12--090--sword-merchant-tent-caves-pickaxe.md) |
| M12 | Pine tree variant | `pine_trees.glb` (multi-tree clump) — stays **parked** under nature, Asset Browser candidate only. Single-tree pines are wired separately as M41 | `in repo` | plan 082 / 073 |
| M13 | Grass clump GLB | Optional complement to instanced grass | `in repo` | plan 082 |
| M14 | Long sword | Held melee; Strażnik quest/dialog + Kupiec | `wired` | [plan 090](../plans/archive/2026-08-12--090--sword-merchant-tent-caves-pickaxe.md) |
| M15 | Fishing rod | `_temp` FBX parked; license ❓ + convert to GLB | `needed` | `public/models/parked/FishingRod_Lvl2.fbx` |
| M16 | Blood splat death VFX | Spawn at animal death (corpse linger); NPC later | `wired` | [plan 096](../plans/archive/2026-08-13--096--fauna-glb-held-tools-lights-vfx.md) |
| M17 | Poly Farm building | Alternate farm shell vs Fantasy RTS `farm.glb` (CC-BY) | `in repo` | plan 082 (`settlement/farm_poly.glb`) |
| M18 | Rock variant B | Extra rock prop beside wired `rock_a` | `in repo` | plan 082 (`nature/rock_b.glb`) |
| M19 | Held shovel / axe / knife GLB | Drop + hand attach (`heldToolVisual`) | `wired` | `items/shovel.glb`, `axe.glb`, `knife.glb` |
| M20 | Wooden torch (held) | Holdable item; longer/brighter than lit branch | `wired` | [plan 085](../plans/archive/2026-08-12--085--handheld-lights-and-village-torches.md) |
| M21 | Branch GLB | Ground + lit-hand mesh | `wired` | plan 085 |
| M22 | Fire tip FX | Handheld + village torch flame | `wired` | plan 085 (`fx/fire.glb`, CC-BY) |
| M23 | House lantern GLB | Replaces procedural lamp body | `wired` | plan 085 |
| M25 | Garden crop beds | Vegetable plots (tomato/pumpkin/lettuce) for all village gardens | `wired` | [plan 099](../plans/archive/2026-08-13--099--wheat-field-glb.md) (`settlement/crops.glb`) |
| M26 | Mushroom | Forest-floor pickup mesh (`ITEM_GLB_SPECS.mushroom`); procedural fallback kept | `wired` | [plan 101](../plans/archive/2026-08-13--101--cactus-reed-well-woodpile.md) (`nature/mushroom_a.glb`), plan 140 |
| M27 | Fern | Forest undergrowth — new `VegetationKind: 'fern'`, `FERN_SPECS`; procedural fallback `createFern` | `wired` | plan 101 (`nature/fern_a.glb`), plan 140 |
| M28 | Rock path (round wide) | Sparse plaza cobble clutter near the well (MD+ villages), not a road mesh; procedural fallback `createCobblePlate` | `wired` | plan 101 (`nature/rock_path_round_wide.glb`), plan 140 |
| M29 | Campfire unlit body | Stones + stacked wood, no baked flame — `VillageFire` / `PlacedFires` / world remains; `simple` hides stone materials | `wired` | plan 101 parked, plan 135 (`settlement/campfire_unlit.glb`) |
| M30 | Campfire burning (Quaternius) | Baked flame in mesh — not usable with fuel toggle | `in repo` | plan 101 (`campfire_burning_q.glb`) |
| M31 | Campfire burning (Poly) | Higher-quality baked flame; CC-BY | `in repo` | plan 101 (`campfire_burning_poly.glb`) |
| M53 | Storage chest | Player-placed container (`items.chest`); procedural box+lid fallback (`world/containerProp.ts`) wired now | `wired` (procedural) | [plan 164](../plans/2026-08-19--164--player-storage-and-container-system.md) |
| M54 | Player-built well — pit / in-progress body | `pit`/`well` construction stages (`world/playerWellProp.ts`); procedural dirt hole + roofless stone ring, no GLB planned. `roof` (completed) stage reuses wired `well.glb`/`createWell` (M32) directly | `wired` (procedural) | [plan 127](../plans/2026-08-16--127--player-built-well.md) |
| M32 | Village well GLB | Replaces procedural `createWell` (fallback kept) | `wired` | plan 101 (`settlement/well.glb`) |
| M33 | Wood pile stockpile | Stacked beams; replaces wired `logs.glb` | `wired` | plan 101 (`settlement/wood_pile.glb`, CC-BY) |
| M34 | Fantasy RTS logs | Former stockpile mesh | `in repo` | `settlement/logs.glb` |
| M35 | Cemetery / gravestones | Village-fringe landmark (`cemetery`); Poly plot + extra stones | `wired` | plan 049 (`nature/cemetery.glb`, `nature/grave_a.glb`) |
| M36 | Food items (tomato/raw_meat/roasted_meat/bread + plan 134 species meats/hide/cheese/dried_meat) + waterskin | Pickup/inventory meshes; procedural fallback in place and functional | `needed` | plan 106, plan 134 (`items/items.ts`'s `createItemMesh`) |
| M37 | Animal trough | Household `AnimalTrough` prop; procedural-only fallback in place and functional (`props.ts`'s `createTrough`), no GLB yet | `needed` | plan 122 |
| M38 | Spear / short sword | Held melee weapons (Kupiec stock). Quaternius Medieval Weapons `Spear` + `Sword` (plain steel) | `wired` | plan 134 (`items/spear.glb`, `items/short_sword.glb`) |
| M39 | Harvested animal remains (bones / hide) | After knife harvest: `bones_pile` + 1–2 `large_bone` + `animal_hide` + 2–4 procedural meat scraps (`fauna/harvestedRemains.ts`). Procedural cylinder+hide fallback if GLB fails. Per-species carcass GLB still out of scope | `wired` | plan 137, plan 138 (`fx/bones_pile.glb`, `fx/large_bone.glb`, `fx/animal_hide.glb`) |
| M40 | Animal traps (`simple` / `good`) | Placed trap prop, two visually distinct tiers, jaws readable as armed / disarmed / broken. Procedural fallback in place and functional (`world/trapProp.ts`); `TrapDef.modelUrl` is the single wiring point | `needed` | plan 141 (`world/animalTraps.ts`) |
| M41 | Pine tree variants (`pine_1`/`pine_3`/`pine_5`) | Textured single-tree conifers for `TREE_SPECS` — no glTF pine ships in Ultimate Stylized Nature, so `PineTree_1/3/5.fbx` + `PineTree_Bark`/`PineTree_Leaves` textures converted `FBX2glTF` → `gltf-transform` (attach textures) → `gltfpack -cc -tw -tl 512` | `wired` | plan 140 (`nature/pine_1.glb`, `pine_3.glb`, `pine_5.glb`) |
| M42 | Tree stump (harvest remnant) | Small vertex-color stump swapped in on the final chop stage (`treeVisuals.ts`'s `createTreeStageMesh`); procedural `createTreeStump` fallback mandatory — revert to it if the GLB reads oddly next to textured living trees in browser | `wired` | plan 140 (`nature/tree_stump.glb`, source: Quaternius Ultimate Nature Pack `TreeStump.fbx`) |
| M43 | Willow (textured) | Same style constraint as pine — the only source found (Quaternius Ultimate Nature Pack) is vertex-color, rejected. A textured willow (Nature MegaKit / Poly Pizza) is still wanted but not required to unblock the rest of this plan | `needed` | plan 140 |
| M44 | Damascus knife | Held melee + corpse harvest; Kupiec stock. Quaternius `Dagger_2` with baked teal/silver damascus steel (not gray) | `wired` | plan 160 (`items/damascus_knife.glb`) |
| M45 | Damascus short sword | Held melee; Kupiec stock. Quaternius `Sword_2` (falchion) with baked teal/navy damascus | `wired` | plan 160 (`items/damascus_short_sword.glb`) |
| M46 | Damascus long sword | Held melee; quest `grozny-wilk` reward. Quaternius `Sword_Big` with baked teal/navy damascus | `wired` | plan 160 (`items/damascus_long_sword.glb`) |
| M47 | Obsidian sword | Held melee; volcanic-glass purple/black (Claymore remint, not gray/red); quest `wilcza-jama` reward | `wired` | plan 160 (`items/obsidian_sword.glb`) |
| M48 | Battle axe | Held melee + tree chop; Kupiec stock. Quaternius Axe Double | `wired` | plan 160 (`items/battle_axe.glb`) |
| M49 | Masterwork sword | Held melee; Kupiec stock. Quaternius `Sword_Golden` | `wired` | plan 160 (`items/masterwork_sword.glb`) |
| M50 | Bows (`short_bow`/`hunting_bow`/`long_bow`) | Held ranged weapons; Kupiec stock. Procedural torus-limb + string fallback in place and functional (`items/items.ts`'s `createItemMesh`), no GLB yet | `needed` | plan 162 |
| M51 | Arrows (`arrow`/`broadhead_arrow`/`war_arrow`) | Stackable ammo pickup/inventory mesh; procedural shaft+head fallback in place and functional, no GLB yet | `needed` | plan 162 |
| M52 | Whetstone | Stackable maintenance item; procedural box fallback in place and functional, no GLB yet | `needed` | plan 161 |

## Wired (reference — do not treat as open work)

Keep this section short. Prefer CREDITS for the full credited set.

| Area | Examples |
|------|----------|
| Characters | Modular men/women NPCs, Adventurer player |
| Fauna | wolf, fox, deer, stag; livestock chicken/sheep/cow/horse/donkey |
| Nature (active) | trees/bushes/pines, fern undergrowth, cactus/reed, rock/log, ore piles, cemetery / gravestones |
| Settlement (active) | MegaKit assembled homes (`HouseBuilder`), huts/towerhouse (catalog fallback + Asset Browser), wall stubs, dock, crate/barrel, garden/crops/storage, wood pile, hay, wheat field (`farm.glb`), well GLB, plaza cobble clutter (MD+) |
| Items (active) | pitchfork, sickle (hold + melee); wooden torch; branch GLB; pickaxe; long sword; spear; short sword; plan 160 HQ set (damascus knife/short/long, obsidian, battle axe, masterwork) |
| Settlement lights | house lantern GLB; plaza/gate torch posts |
| FX | fire tip (handheld, village torch, campfire flame); blood splat (animal death); harvested remains (pile / large bone / hide) |

## Related research

- [2026-08-07--002--3d-asset-sources.md](../research/2026-08-07--002--3d-asset-sources.md)
- [2026-08-11--006--medieval-model-library-complement.md](../research/2026-08-11--006--medieval-model-library-complement.md)
