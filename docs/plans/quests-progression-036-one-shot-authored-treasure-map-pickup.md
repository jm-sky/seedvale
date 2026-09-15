# Plan: One-shot authored treasure-map pickup

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** bug
**Priority:** high · **Effort:** S
**Depends on:** ~~quests-progression-008~~, ~~quests-progression-009~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `rewards`
**Tags:** `treasure-map` `pickup` `persistence` `duplicate`
**Roadmap:** -

## Cel

Zapewnić, że authored treasure map pickup jest naprawdę jednorazowy w obrębie świata/save i nie materializuje się ponownie po rebuildzie systemu, reloadzie lub powrocie w miejsce źródłowe.

## Recon

- `darkForestTreasureMapPickupId()` dostarcza stable pickup id.
- `worldBundle.ts` materializuje mapę przez `extraOneTimePickups` jako `treasure_map_dark_forest`.
- `createItemSpawners()` implementuje one-time pickup przez `respawnTime = Infinity`, ale nowo tworzony spawn point startuje z `collected: false`.
- Ten kontrakt zapobiega respawnowi tylko w lifetime konkretnego `ItemSpawners`; sam nie jest persistence boundary.
- Nie wolno opierać materializacji wyłącznie o `inventory.has(map)`, bo wyrzucenie/zużycie/sprzedaż nie powinno odtworzyć authored source.

## Zakres

1. Dodać trwały consumed-state dla stable authored world pickup id albo reuse istniejącego authoritative world/quest state, jeśli dokładnie reprezentuje fakt pobrania źródła.
2. Preferować generyczny, mały `consumedWorldPickupIds` contract, jeśli repo ma lub będzie miało więcej authored one-shot pickups; nie persystować całego `ItemSpawner` runtime.
3. Przy collect mapy atomowo oznaczyć stable pickup id jako consumed wraz z normalnym inventory commit.
4. `worldBundle`/materialization ma pomijać pickup, jeśli id jest consumed.
5. New Game czyści stan; save/load i rebuild zachowują go.
6. Nie zmieniać samego location reveal/read semantics mapy.

## Relevant files

- `src/world/locations/darkForestTreasureSite.ts`
- `src/app/worldBundle.ts`
- `src/items/createItemSpawners.ts`
- `src/items/ItemSpawner.ts`
- `src/persistence/saveData.ts`
- `src/app/createApp.ts`
- existing world flags / one-shot persistence helpers discovered during implementation

## Verification

- collect map -> rebuild world -> pickup nie wraca,
- collect map -> save/load -> pickup nie wraca,
- usunięcie mapy z inventory nie odtwarza source,
- New Game tworzy pickup ponownie dla nowego świata,
- stable id pozostaje deterministic.

Manual browser verification wykonuje User.

Przy nowych publicznych persistence helperach dodać JSDoc z `@domain quests-progression` lub właściwym istniejącym ownership tagiem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
