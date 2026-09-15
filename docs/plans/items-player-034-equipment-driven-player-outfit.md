# Plan: equipment-driven UBC outfit

**Created:** 2026-09-15
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-033~~
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `presentation` `assets`
**Tags:** `player` `characters` `equipment`
**Roadmap:** -

## Cel

Wygląd gracza wynika ze slotu `body`, bez przebudowy świata i bez modularnego składania części.

- Brak zbroi tułowia → Peasant
- `leather_armor` albo `chainmail` → Ranger (chainmail bez własnego mesha)
- `?player=adventurer|peasant|ranger` nadpisuje mapping (strona, nie save)
- Dwa albedo na outfit: Peasant krem/brąz, Ranger zieleń/brąz — wybór koloru **nie** z ekwipunku

## Decyzje

1. **Default zmienia się względem 033.** Bez `?player=` gracz jest UBC, nie Adventurer. Adventurer zostaje debug override (`?player=adventurer`). Inaczej mapping ekwipunku nigdy nie zadziała w normalnej grze.
2. **Nie ruszać gameplay armor.** `ArmorConfig` zostaje tylko dla modifierów (`resolveEquipmentModifiers` jest jedynym czytnikiem). Mapping wizualny żyje w `playerVisualPreset.ts`, nie w `itemCatalog` / `equipment.ts`.
3. **Swap całego outfitu, nie części.** Peasant i Ranger to inna geometria. Kolor to tylko podmiana `map` na `MI_Peasant` / `MI_Ranger`.
4. **Bez zmiany save schema.** Outfit jest pochodną `equippedBodyArmor()`; tint nie jest persystowany.

## Runtime

- Resolver: URL override wygrywa; inaczej `null` body → peasant, dowolny body armor → ranger. Nieznany `?player=` → warn + peasant.
- `PlayerController.applyAppearance`: live swap skinned root + recreate mixer z tych samych klipów UAL + remount held tool na `hand_r`. Adventurer override nie preloaduje UBC i nie swapuje z ekwipunku.
- Wiring: `equipArmor` / `unequipArmor`, drop/sell przez `onInventoryChanged`, hydrate przy boot (equipment istnieje przed `PlayerController.create`).
- Tint: `?playerTint=brown` ładuje `male_peasant_brown.webp` / `male_ranger_brown.webp`. Materiały instancji są klonowane, żeby nie mutować cache GLB.

## Weryfikacja

- Nowy świat bez `?player=`: Peasant, idle/chód/sprint/cios, trzymane narzędzie
- Załóż `leather_armor` / `chainmail` → Ranger; zdejmij → Peasant; bez reloadu świata
- Save z założoną skórą → Ranger od razu po Continue
- `?player=adventurer` ignoruje zbroję; `?player=ranger` zostaje Ranger bez zbroi
- `?playerTint=brown`: brązowy Peasant / Ranger
