# Required models

Living backlog of 3D models Seedvale still needs, or has on disk but must wire into runtime.

This is **not** a full inventory. For credited in-repo assets see [CREDITS.md](./CREDITS.md). For parked MegaKit files see [`public/models/settlement/megakit/README.md`](../../public/models/settlement/megakit/README.md).

**Last updated:** 2026-08-12

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
| M01 | Richer house shells / wall segments (MegaKit) | Fantasy RTS cottages are roof-heavy; MegaKit walls/fences for denser settlement look | `in repo` | [research 006](../research/2026-08-11--006--medieval-model-library-complement.md), [plan 072](../plans/2026-08-11--072--settlement-visuals-nameplate-palisade.md), [issue 018](../issues/2026-08-12--018--house-scale-vs-npc.md) |
| M02 | Yard fence / gate runs | Better palisade/yard than single `wall.glb` stubs | `in repo` | MegaKit `fence_*`, `wall_arch` |
| M03 | Settlement clutter (wagon, chimney, vines…) | Optional village density props | `in repo` | MegaKit parked set |
| M04 | Economy / outpost buildings | Market, farm, windmill, towncenter, watchtower, barracks, temple, port | `in repo` | [CREDITS](./CREDITS.md), plans 032 / 071 |
| M05 | Background mountains | Distant silhouette meshes | `in repo` | [plan 024](../plans/2026-08-07--024--world-visual-overhaul.md) (`mountain_a/b/c`) |
| M06 | Extra flora variants | `bush_flowers_1`, `flower_clump_2` (and further variety as needed) | `in repo` | nature reserve in CREDITS |
| M07 | Farm animals (chicken / cow / sheep / horse) | Chicken GLB in `fauna/chicken.glb` (CC-BY); sheep+horse parked; cow still needed | `in repo` | [SOUNDS](./SOUNDS.md), [plan 082](../plans/2026-08-12--082--village-tool-props-and-temp-assets.md) |
| M08 | Village pitchfork | One-time garden pickup + future NPC theft reaction; **melee/hold later** | `wired` | [plan 082](../plans/2026-08-12--082--village-tool-props-and-temp-assets.md), [issue 025](../issues/2026-08-12--025--npc-react-to-stolen-village-tools.md), [items CATALOG](../items/CATALOG.md) |
| M09 | Village sickle | One-time garden pickup + future NPC theft reaction; **melee/hold later** | `wired` | plan 082, issue 025, [items CATALOG](../items/CATALOG.md) |
| M10 | Hay bale clutter | Decorative hay near gardens | `wired` | plan 082 |
| M11 | Pickaxe (mining gameplay) | Decorative at stockpile now; future dig/ore tool | `in repo` | plan 082 (`public/models/items/pickaxe.glb`) |
| M12 | Pine tree variant | `pine_trees.glb` parked under nature | `in repo` | plan 082 / 073 |
| M13 | Grass clump GLB | Optional complement to instanced grass | `in repo` | plan 082 |
| M14 | Long sword | Future combat / decor (CC-BY) | `in repo` | plan 082 |
| M15 | Fishing rod | `_temp` FBX parked; license ❓ + convert to GLB | `needed` | `public/models/parked/FishingRod_Lvl2.fbx` |
| M16 | Blood splat death VFX | Spawn at death of NPC / fauna / mob (corpse linger) | `in repo` | plan 082 (`public/models/fx/blood_splat.glb`) |
| M17 | Poly Farm building | Alternate farm shell vs Fantasy RTS `farm.glb` (CC-BY) | `in repo` | plan 082 (`settlement/farm_poly.glb`) |
| M18 | Rock variant B | Extra rock prop beside wired `rock_a` | `in repo` | plan 082 (`nature/rock_b.glb`) |
| M19 | Held shovel / axe / knife GLB | Drop + hand attach (`heldToolVisual`) | `wired` | `items/shovel.glb`, `axe.glb`, `knife.glb` |
| M20 | Wooden torch (held) | Holdable item; longer/brighter than lit branch | `wired` | [plan 085](../plans/2026-08-12--085--handheld-lights-and-village-torches.md) |
| M21 | Branch GLB | Ground + lit-hand mesh | `wired` | plan 085 |
| M22 | Fire tip FX | Handheld + village torch flame | `wired` | plan 085 (`fx/fire.glb`, CC-BY) |
| M23 | House lantern GLB | Replaces procedural lamp body | `wired` | plan 085 |
| M24 | Village torch post | Plaza + gate, auto-lit at dusk | `wired` | plan 085 |

## Wired (reference — do not treat as open work)

Keep this section short. Prefer CREDITS for the full credited set.

| Area | Examples |
|------|----------|
| Characters | Modular men/women NPCs, Adventurer player |
| Fauna | wolf, fox, deer, stag |
| Nature (active) | trees/bushes, rock/log, ore piles |
| Settlement (active) | huts, towerhouse, wall stubs, dock, crate/barrel, garden/storage/logs, hay |
| Items (active) | pitchfork, sickle (village pickups); wooden torch; branch GLB; pickaxe decorative |
| Settlement lights | house lantern GLB; plaza/gate torch posts |

## Related research

- [2026-08-07--002--3d-asset-sources.md](../research/2026-08-07--002--3d-asset-sources.md)
- [2026-08-11--006--medieval-model-library-complement.md](../research/2026-08-11--006--medieval-model-library-complement.md)
