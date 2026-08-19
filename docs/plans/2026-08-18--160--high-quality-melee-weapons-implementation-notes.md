# Implementation notes: High-quality melee weapons

**Plan:** [160 — High-quality melee weapons](./2026-08-18--160--high-quality-melee-weapons.md)
**Created:** 2026-08-19
**Status:** `verification needed` 🔍

## Stan implementacji

Sześć `ItemKind` w `ITEM_DEFS` / `ITEM_CATALOG` / `HeldTool` / `HELD_ATTACH`. Combat i defense czytają katalog — bez osobnego resolvera.

Role narzędzi (nie nowy system):

- `isChopTool` → `axe | battle_axe` (`interactables.ts`, `createApp.ts` `startTreeChop`)
- `isHarvestKnife` → `knife | damascus_knife` (harvest prompt, auto-equip, bonus gałęzi przy oglądaniu drzewa)

Pozyskanie:

- Kupiec: `damascus_knife` 90, `damascus_short_sword` 140, `masterwork_sword` 160, `battle_axe` 110
- Quest `grozny-wilk` → `damascus_long_sword` (zamiast 50 monet)
- Quest `wilcza-jama` → `obsidian_sword` (zamiast 40 monet)
- Quest-only mają `RESOURCE_TRADE_VALUE` 240 / 320, bo wpis w `MERCHANT_PRICES` zrobiłby je kupowalnymi

Modele: wszystkie `modelUrl: null`. Proceduralny fallback z rodziny (nóż / krótki miecz / długi miecz / siekiera). Ścieżki pod przyszłe GLB w MODELS.md M44–M49. Nie podpinano `axe.glb` jako battle axe.

Poza zakresem: durability, ostrzenie, condition (plan 161). `ItemInstance` nie jest używane.

Browser: held/combat/chop battle axe i harvest damascus knife do ręcznego sprawdzenia na `npm run dev` (port 5577).
