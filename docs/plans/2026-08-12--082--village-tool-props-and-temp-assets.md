# Plan: Village tool props and `_temp` assets

**Created:** 2026-08-12  
**Status:** `verification needed`  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~061~~

## Cel

Wpiąć assety z `_temp` do świata: widły/sierp jako dekoracja + pickup w wiosce;
siano/kilof jako clutter; pozostałe modele zaparkować w `public/models` + MODELS.

## Zaimplementowane

### Faza A — pickup

- `ItemKind` `pitchfork` / `sickle` (+ procedural fallback mesh).
- GLB: `public/models/items/pitchfork.glb`, `sickle.glb` (preload w `itemModels.ts`).
- Spawner: **1–3** one-time pickupy przy ogrodach (`createItemSpawners.ts`).
- Nie są holdable (`isToolKind` tylko knife/firestarter/shovel/axe) — Weź w UI nie pokazuje się.
- Issue [025](../issues/2026-08-12--025--npc-react-to-stolen-village-tools.md): przyszła reakcja NPC *„Hej! Co robisz!?”*.

### Faza B — clutter

- `public/models/settlement/hay.glb` — 1–2 stogi przy garden pads.
- `public/models/items/pickaxe.glb` — dekor przy stockpile (nie `ItemKind`).

### Park (in repo, not wired)

- fauna: `sheep.glb`, `horse.glb`, `chicken.glb` (CC-BY — jeremy)
- nature: `pine_trees.glb`, `grass_clump.glb`, `rock_b.glb`
- settlement: `farm_poly.glb` (CC-BY — Poly by Google; **nie** nadpisuje Fantasy RTS `farm.glb`)
- items: `long_sword.glb`
- fx: `blood_splat.glb` — **docelowo** splatter przy śmierci NPC / fauna / mob (corpses); niepodpięte
- parked: `FishingRod_Lvl2.fbx` (licencja ❓)

## Weryfikacja techniczna

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`

## Manual (browser)

1. Nowa gra → home village: 1–3 widły/sierpy przy ogrodzie, siano, kilof przy składzie.
2. Podnieś widły/sierp → inventory; brak przycisku Weź; Wyrzuć → drop GLB.
3. Brak regresji shovel/axe spawn.
