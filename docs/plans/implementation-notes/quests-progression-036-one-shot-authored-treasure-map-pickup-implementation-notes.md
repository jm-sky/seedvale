# Implementation Notes: One-shot authored treasure-map pickup

**Plan:** `quests-progression-036-one-shot-authored-treasure-map-pickup.md`  
**Reviewed against:** `main`, 2026-09-15

## Implemented

- `SaveData.consumedWorldPickupIds` (optional sparse string array, save v44 bump-only migration).
- App-owned `Set` in `createApp.ts`: load, New Game `.clear()`, serialize in `saveState.ts`.
- `buildAuthoredOneTimePickups()` gates map + abandoned-key extras; `worldBundle` threads the Set through `WorldSystemsSeed`.
- Extra spawn points carry runtime `authoredOneShot`; `tryCollectWorldItem` adds the id **after** a successful inventory commit. Full inventory still `canAdd`-fails before `collect`.

## Recon conclusion

Stable identity już istnieje: `darkForestTreasureMapPickupId()` zwraca deterministyczny id, a `worldBundle.ts` przekazuje go do `extraOneTimePickups`. `createItemSpawners()` mapuje taki pickup na zwykły `ItemSpawnPoint` z `respawnTime = Infinity`, ale `collected` jest runtime-only i startuje od `false` po rebuildzie. Fix ma persystować fakt konsumpcji stable authored pickup id, nie runtime spawn point.

## Existing mechanisms to reuse

- `darkForestTreasureMapPickupId()` — canonical stable identity.
- `OneTimeWorldItemPickup` / `extraOneTimePickups` — composition seam.
- `createItemSpawners().collect(id)` — commit point, gdzie znany jest konkretny pickup id i zwracany item.
- app-owned persisted sparse sets / world flags patterns w `createApp.ts` i `saveData.ts` — użyć istniejącego wzorca serializacji/resetu zamiast managera.

## Implementation decision

Najpierw sprawdzić, czy obecny persisted flag dokładnie znaczy „ten pickup został pobrany”. `treasureMapDarkForestRead` nie wystarcza: read != acquired. Quest state też nie jest właściwym ownerem źródła world itemu, jeśli mapa może istnieć przed/po zmianie questa.

Jeżeli nie ma już canonical consumed-id setu, dodać mały app/persistence-owned `Set<string>` dla consumed authored world pickups. Nie tworzyć osobnego `persistence-005` planu — ten plan jest wystarczająco mały i konkretny.

## Commit ordering

1. `worldBundle` materializuje authored pickup tylko, gdy stable id nie jest consumed.
2. Collect path wykonuje normalny inventory acquisition.
3. Dopiero po udanym acquisition commit oznaczyć pickup id jako consumed.
4. Następnie standardowy `onInventoryChanged()`/save snapshot widzi oba skutki.

Jeżeli inventory jest pełne i pickup nie został przejęty, nie oznaczać consumed. Jeżeli istniejący collect contract usuwa mesh przed odmową inventory, naprawić transakcję na application seam zamiast markować source jako consumed za wcześnie.

## Persistence seam

- `src/persistence/saveData.ts` — sparse string array/set-shaped field, default/migration pusty.
- `src/app/createApp.ts` — mutable Set lifetime, load, New Game clear, save serialize.
- `src/app/worldBundle.ts` — read-only materialization gate.
- `src/items/createItemSpawners.ts` / `ItemSpawner.ts` — stable id zachować; nie persystować `timeSinceCollected`.

Nazewnictwo powinno być item-kind agnostic, bo mechanizm dotyczy authored stable pickup IDs, nie tylko map.

## Tests

- pickup obecny w fresh world;
- successful collect -> consumed id zapisany;
- rebuild bez save/load nie materializuje ponownie;
- save/load nie materializuje ponownie;
- usunięcie mapy z inventory nie cofa consumed state;
- failed acquisition nie konsumuje source;
- New Game czyści consumed set i pickup wraca;
- dwa authored ids są niezależne.

Browser verification wykonuje User.
