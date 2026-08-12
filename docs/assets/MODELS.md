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
| M07 | Farm animals (chicken / cow) | SFX already exist; no matching fauna GLBs (current fauna = wolf/fox/deer/stag) | `needed` | [SOUNDS](./SOUNDS.md), animal SFX in `public/sounds/` |

## Wired (reference — do not treat as open work)

Keep this section short. Prefer CREDITS for the full credited set.

| Area | Examples |
|------|----------|
| Characters | Modular men/women NPCs, Adventurer player |
| Fauna | wolf, fox, deer, stag |
| Nature (active) | trees/bushes, rock/log, ore piles |
| Settlement (active) | huts, towerhouse, wall stubs, dock, crate/barrel, garden/storage/logs |

## Related research

- [2026-08-07--002--3d-asset-sources.md](../research/2026-08-07--002--3d-asset-sources.md)
- [2026-08-11--006--medieval-model-library-complement.md](../research/2026-08-11--006--medieval-model-library-complement.md)
