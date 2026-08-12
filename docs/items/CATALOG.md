# Item catalog — Seedvale

**Purpose:** single place for agents/humans to see what each item does, what is
implemented, and what is planned. Code source of truth for weights/labels:
[`src/items/items.ts`](../../src/items/items.ts) (`ITEM_DEFS`). Flags/roadmap:
[`src/items/itemCatalog.ts`](../../src/items/itemCatalog.ts).

**Last updated:** 2026-08-12

## Quick rules

| Concern | Where |
|---------|--------|
| Inventory weight / label | `ITEM_DEFS` |
| Holdable (Weź) | `isToolKind` in `HeldTool.ts` — only knife, firestarter, shovel, axe |
| Held 3D attach | `heldToolVisual.ts` → `WristR` + `HELD_ATTACH` |
| Ground GLB scale | `itemModels.ts` → `preparePropFitMax` (not height-only) |
| Melee vs animals | `faunaCombat.ts` — axe 20, knife 12, shovel 8 |
| Village one-time tools | `createItemSpawners.ts` |

## Items

| Kind | Label | Hold | Melee | Spawn | Model | Notes |
|------|-------|------|-------|-------|-------|-------|
| shell | muszla | — | — | renewable village | procedural | |
| stone | kamień | — | — | renewable + dig | procedural | |
| branch | gałąź | — | — | renewable trees | procedural | axe harvest; **melee later** |
| mushroom | grzyb | — | — | world chunk | procedural | |
| flower | kwiat | — | — | world chunk | procedural | |
| cone | szyszka | — | — | world chunk | procedural | |
| knife | nóż | yes | 12 | starting | `items/knife.glb` | |
| firestarter | krzesiwo | yes | — | starting | procedural | |
| blanket | koc | — | — | starting | procedural | |
| shovel | łopata | yes | 8 | village 1× | `items/shovel.glb` | dig / level |
| axe | siekiera | yes | 20 | village 1× | `items/axe.glb` | chop |
| pitchfork | widły | **no** | — | village 1–3 | `items/pitchfork.glb` | plan 082; **melee later** |
| sickle | sierp | **no** | — | village 1–3 | `items/sickle.glb` | plan 082 |

## Roadmap (not done)

1. **pitchfork / sickle holdable + melee** — same pattern as knife (`HeldTool` +
   `faunaCombat` + `HELD_ATTACH`). Suggested damage band ~10–14.
2. **branch as improvised melee** — holdable stick, low damage (~4–8); good
   durability-wear guinea pig.
3. **Item durability / HP** — tools (and combat props) have condition that
   decreases with use (fight, chop, dig); at 0 → break or force repair. Not in
   save schema yet.
4. **NPC protest** when picking village pitchfork/sickle — [issue 025](../issues/2026-08-12--025--npc-react-to-stolen-village-tools.md).
5. **pickaxe** as `ItemKind` + mining — currently decorative only at stockpile.
6. **long_sword** — parked CC-BY combat prop.

## Related non-item props

| Id | Path | Status |
|----|------|--------|
| pickaxe | `/models/items/pickaxe.glb` | decorative |
| hay | `/models/settlement/hay.glb` | decorative |
| blood_splat | `/models/fx/blood_splat.glb` | parked — death VFX later |
| long_sword | `/models/items/long_sword.glb` | parked |
