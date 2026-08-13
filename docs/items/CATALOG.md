# Item catalog — Seedvale

**Purpose:** single place for agents/humans to see what each item does, what is
implemented, and what is planned. Code source of truth for weights/labels:
[`src/items/items.ts`](../../src/items/items.ts) (`ITEM_DEFS`). Flags/roadmap:
[`src/items/itemCatalog.ts`](../../src/items/itemCatalog.ts).

**Last updated:** 2026-08-13

## Quick rules

| Concern | Where |
|---------|--------|
| Inventory weight / label | `ITEM_DEFS` |
| Holdable (Weź) | `isToolKind` in `HeldTool.ts` — knife, firestarter, shovel, axe, wooden_torch, pickaxe, long_sword, pitchfork, sickle |
| Held 3D attach | `heldToolVisual.ts` → `WristR` + `HELD_ATTACH` (Phase 6: migrate per-tool numbers to `grip` anchors via alignment browser) |
| Ground GLB scale | `itemModels.ts` → `preparePropFitMax` (not height-only) |
| Melee vs animals | `faunaCombat.ts` — sword 28, axe 20, pitchfork 14, knife/sickle 12, shovel 8 |
| Village one-time tools | `createItemSpawners.ts` |
| Portable light | `PlayerTorch` — lit branch (90s) or held wooden_torch (240s); exclusive right hand |

## Items

| Kind | Label | Hold | Melee | Spawn | Model | Notes |
|------|-------|------|-------|-------|-------|-------|
| shell | muszla | — | — | renewable village | procedural | |
| stone | kamień | — | — | renewable + dig | procedural | |
| branch | gałąź | lit only | — | renewable trees | `items/branch.glb` | Zapal gałąź → hand mesh + fire; **melee later** |
| mushroom | grzyb | — | — | world chunk | procedural | |
| flower | kwiat | — | — | world chunk | procedural | |
| cone | szyszka | — | — | world chunk | procedural | |
| knife | nóż | yes | 12 | starting | `items/knife.glb` | |
| firestarter | krzesiwo | yes | — | starting | procedural | |
| blanket | koc | — | — | starting | procedural | |
| shovel | łopata | yes | 8 | village 1× | `items/shovel.glb` | soil/sand dig / level (not rock) |
| axe | siekiera | yes | 20 | village 1× | `items/axe.glb` | chop |
| pitchfork | widły | yes | 14 | village 1–3 | `items/pitchfork.glb` | plan 082 pickup; hold+melee (plan 096); grip TBD |
| sickle | sierp | yes | 12 | village 1–3 | `items/sickle.glb` | plan 082 pickup; hold+melee (plan 096); grip TBD |
| wooden_torch | pochodnia | yes | — | starting (+ village 1×) | `items/wooden_torch.glb` | plan 085; longer/brighter than lit branch |
| pickaxe | kilof | yes | — | village 1× + Kupiec | `items/pickaxe.glb` | ore deposits + mountain-rock dig/level (plan 090) |
| tent | namiot | — | — | none (Kupiec) | procedural | place / rest / pack (plan 090) |
| long_sword | miecz | yes | 28 | none (Strażnik/Kupiec) | `items/long_sword.glb` | hold+melee; Strażnik quest/dialog + Kupiec |
| coal | węgiel | — | — | pickaxe yield | procedural | plan 090 |
| iron | żelazo | — | — | pickaxe yield | procedural | plan 090 |
| gold | złoto | — | — | pickaxe yield | procedural | plan 090 |

## Roadmap (not done)

1. **branch as improvised melee** — holdable stick, low damage (~4–8); good
   durability-wear guinea pig.
2. **Item durability / HP** — tools (and combat props) have condition that
   decreases with use (fight, chop, dig); at 0 → break or force repair. Not in
   save schema yet.
3. **NPC protest** when picking village pitchfork/sickle — [issue 025](../issues/2026-08-12--025--npc-react-to-stolen-village-tools.md).
4. **Left-hand dual wield** — currently right hand exclusive (tool vs lit light).

## Related non-item props

| Id | Path | Status |
|----|------|--------|
| hay | `/models/settlement/hay.glb` | decorative |
| lantern | `/models/settlement/lantern.glb` | house night lamp body (plan 085) |
| torch | `/models/settlement/torch.glb` | village plaza/gate posts (plan 085) |
| fire | `/models/fx/fire.glb` | handheld / village torch tip (CC-BY) |
| blood_splat | `/models/fx/blood_splat.glb` | animal death VFX (plan 096) |
