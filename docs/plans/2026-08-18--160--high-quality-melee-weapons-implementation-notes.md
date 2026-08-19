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

Modele (2026-08-19): `modelUrl` + `ITEM_GLB_SPECS` + `HELD_GLB` dla wszystkich sześciu. Źródło: Quaternius Medieval Weapons Pack (OBJ→GLB `obj2gltf`, meshopt) + Poly Pizza `Axe Double`. Native pack blades are gray vertex-color steel — **not used as-is for damascus/obsidian**.

Characteristic remint (baked into the GLB palette, not a runtime tint):

- damascus (`Dagger_2` / `Sword_2` falchion / `Sword_Big`): LightSteel pale silver, Steel teal, DarkSteel navy; wood/gold kept. Must not read as a gray sword.
- obsidian (`Claymore`): original red → volcanic purple/black glass. Must not read as gray or leftover red.
- masterwork (`Sword_Golden`): gold blade.
- battle_axe: Axe Double, ordinary steel/wood is OK.

Procedural fallback still uses `ITEM_DEFS.color` (teal / violet / gold) if a GLB fails. Grip orientation (especially falchion and claymore) is **not browser-verified**.

Poza zakresem: durability, ostrzenie, condition (plan 161). `ItemInstance` nie jest używane.

Browser: held/combat/chop battle axe, harvest damascus knife, and that damascus reads teal-banded (not gray) and obsidian reads volcanic glass (not gray/red) — `npm run dev` port 5577.
