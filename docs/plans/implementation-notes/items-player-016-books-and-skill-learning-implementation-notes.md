# Implementation Notes: Books and Skill Learning

**Reviewed:** 2026-09-04  
**Plan:** `items-player-016-books-and-skill-learning.md`

## Review conclusion

Plan jest zgodny z aktualną architekturą w najważniejszym punkcie: książki powinny być zwykłymi `ItemKind`, a skutek czytania ma mutować wyłącznie istniejące XP w `PlayerSkills`.

Dwie istotne korekty względem założeń planu:

1. `PlayerSkills` ma już **6** skilli (`sneak`, `survival`, `traps`, `defense`, `archery`, `riding`). `docs/CODE_INDEX.md` nadal błędnie opisuje go jako system pięciu skilli — poprawić przy implementacji.
2. Nie istnieje ogólny system nazwany `treasure`/`reward pipeline`. Konkretne skarby są obecnie realizowane przez `world/hiddenFinds.ts` + `app/actions/groundActions.ts` oraz osobny home hidden treasure. Książki należy wpiąć w istniejący `HiddenFindLoot { kind: 'item', item: ItemKind }`, nie tworzyć nowego systemu skarbów.

## PlayerSkills — dodać jedną centralną operację

Plik: `src/player/PlayerSkills.ts`.

Aktualny kontrakt:

- `SkillId` zawiera wszystkie 6 skilli,
- XP jest authoritative,
- `xpToSkillValue()` wylicza wartość,
- `xpForSkillValue()` już jest gotową odwrotnością potrzebną książkom,
- `awardSkillXp()` jest obecnie jedyną ścieżką zwykłego wzrostu XP,
- `restorePersistedSkills()` odtwarza tylko XP.

Dodać publiczną operację w tym module, np. `raiseSkillToValue(skills, id, targetValue)`, która:

- clampuje/odrzuca niepoprawny target,
- nie robi nic, gdy obecny `value >= targetValue`,
- używa `xpForSkillValue(targetValue)`,
- ustawia XP tylko w górę i ponownie wylicza `value` przez `xpToSkillValue()`.

Warto, aby zwracała wynik wystarczający dla UI/interakcji, np. `{ changed, previousValue, value }`, żeby caller nie duplikował obliczeń feedbacku.

Nie implementować książek przez `awardSkillXp()`: książka ma osiągać target value, a nie dodawać stałą porcję XP.

## Book metadata — najlepsze miejsce: `ItemCatalogEntry`

Aktualny podział:

- `src/items/items.ts` / `ITEM_DEFS` — label, categories, description, weight, size, color,
- `src/items/itemCatalog.ts` / `ITEM_CATALOG` — gameplay-facing metadata/capabilities,
- `src/items/tradeCatalog.ts` — ceny i merchant stock,
- `src/items/itemModels.ts` — współdzielone GLB dla world pickup/drop.

Book mechanics (`skill`, `requiredSkillValue`, `targetSkillValue`, opcjonalnie `tier`) powinny wejść jako opcjonalne deklaratywne pole `book` w `ItemCatalogEntry`, analogicznie do `consumable`, `food`, `container`, `ranged` itd. To daje jedno źródło prawdy dla gameplay + inventory + merchant bez zaśmiecania `ItemDef` mechaniką progresji.

Nie dodawać osobnej mapy `BOOK_DEFS`, jeżeli te same dane mają być później odczytywane z `ITEM_CATALOG`.

## ItemKind i kategoria `knowledge`

Plik: `src/items/items.ts`.

Dodać 18 stabilnych `ItemKind` i `knowledge` do `ItemCategory`. `CATEGORY_SORT_ORDER` również musi uwzględnić `knowledge`; mapy `map_near` / `map_far` zmienić z `utility` na `knowledge`.

Kategoria jest wielowartościowa (`categories: readonly ItemCategory[]`), ale dla map/książek wystarczy `['knowledge']` — nie ma potrzeby zostawiać równoległego `utility`, chyba że istniejące UI/testy faktycznie tego wymagają.

UI ma statyczne mapowania kategorii, więc zmiana typu wymusi aktualizację m.in.:

- `src/ui-vue/screens/InventoryScreenItemDetails.vue` (`CATEGORY_ICON`),
- `src/ui-vue/composables/useItemCategoryLabels.ts`,
- prawdopodobnie list/group presentation w `InventoryScreenItemList.vue` / `inventoryView.ts`.

To jest korzystne: TypeScript pokaże miejsca wymagające obsługi nowej kategorii.

## Czytanie — wykorzystać istniejący inventory action seam

Aktualna ścieżka akcji inventory:

`InventoryScreenItemDetails.vue`
→ `ui.inventory.on*`
→ `createInventoryScreen.ts` / `InventoryScreenHandlers`
→ handler w `createApp.ts`
→ domena/action.

Obecnie istnieją `onConsume`, `onDrop`, `onEquip`, `onSharpen`, `onPlaceTrap` itd. Najmniejsza zgodna zmiana to dodać `onRead(kind)` do tego samego pipeline.

Samą logikę książki lepiej umieścić poza Vue, np. jako małą funkcję/moduł w `src/items/` lub `src/app/actions/`, która:

1. pobiera `ITEM_CATALOG[kind].book`,
2. waliduje requirement i target,
3. wywołuje `raiseSkillToValue`,
4. zwraca wynik domenowy (`learned` / `too_low` / `known`).

Vue ma tylko prezentować stan i wywołać handler. Nie wkładać mutacji `player.skills` do komponentu.

Inventory jest modalem zatrzymującym symulację; `refreshInventoryScreen()` jest już standardową ścieżką wymuszającą rerender po mutacji podczas otwartego inventory. Po udanym czytaniu wywołać refresh, bez zamykania ekranu.

## UI stanu książki

`InventoryScreenItemDetails.vue` już czyta `ITEM_CATALOG`, więc może bez dodatkowego store książkowego wyświetlać statyczne book metadata. Dynamiczny `current skill` nie jest jednak obecnie częścią `ui.inventory`.

Nie kopiować całego `PlayerSkills` do globalnego Vue state. Wystarczy rozszerzyć inventory view/refresh o mały snapshot wartości skilli potrzebny ekranowi, albo przekazać getter/view model z app layer. Stan `learnable / too_low / known` powinien być wyliczany z aktualnego skill + `book` metadata, nigdy persistowany.

Nazwy skilli do UI trzymać we wspólnym formatterze/mapie używanej również przez istniejący Skills screen, zamiast tworzyć drugi zestaw labeli w book component.

## Merchant

Plik: `src/items/tradeCatalog.ts`.

Aktualny handel ma dokładnie mechanizm potrzebny planowi:

- `MERCHANT_PRICES`,
- `MERCHANT_STOCK`,
- `merchantPrice()` / `tradeValue()` / `sellPrice()`,
- `settleTransaction()` wywoływany przez `inventoryWiring.ts`.

Dodać 18 książek do `MERCHANT_PRICES` i deterministycznego `MERCHANT_STOCK`. Nie tworzyć stock generatora.

Ważne: `MerchantScreen.vue` ma własną prezentację szczegółów. Powinien odczytywać `ITEM_CATALOG[kind].book`, tak samo jak inventory, zamiast otrzymywać osobną kopię requirement/target z trade layer.

Mapy mają specjalny efekt zakupowy w `inventoryWiring.ts`: po `settleTransaction()` `applyLocationMap()` natychmiast mutuje `LocationKnowledge`. Zmiana ich kategorii na `knowledge` nie może ruszać tej ścieżki.

## Treasure / Hidden Finds — wykorzystać istniejący `ItemKind` reward

Plan nie powinien tworzyć nowego `BookTreasureSystem`.

Aktualny mechanizm w `src/world/hiddenFinds.ts` już ma:

`HiddenFindLoot = { kind: 'item', item: ItemKind, rare: boolean }`

oraz deterministyczne `LootProfile.items` dla cemetery / stoneCircle / monolith. `groundActions.ts` przekazuje taki item przez istniejące `ctx.grantItem()`.

To jest właściwy seam do dodania **konkretnych** książek do skarbów. Zachować seedowaną deterministykę i istniejące limity Hidden Finds.

Nie dodawać książek do ogólnych world spawnerów ani zwykłych kontenerów. Jeżeli wymaganie "konkretna książka jako treasure" ma być tylko demonstracją V1, wystarczy rozszerzyć wybrany istniejący `LootProfile.items` o jawne `ItemKind` książki. Nie przebudowywać systemu lootów tylko po to, by rozprowadzić wszystkie 18 tytułów.

Osobny `settlement/hiddenTreasure` daje obecnie chest z monetami + losowanym mieczem. Nie jest najlepszym miejscem dla książek, chyba że plan świadomie chce zmienić ten konkretny easter egg.

## World pickup/drop i modele

Drop/pickup jest już generyczny dla zwykłego count-based `ItemKind`; książki nie potrzebują `ItemInstance`.

`src/items/itemModels.ts` utrzymuje `ITEM_GLB_SPECS: Partial<Record<ItemKind, ...>>`, preładuje model raz i klonuje przygotowany template przez `cloneItemGlb()`. To jest właściwe miejsce dla współdzielonych modeli książek — wiele `ItemKind` może wskazywać ten sam URL, tak jak trzy typy strzał używają jednego `arrow.glb`.

Na obecnym `main` w `public/models/items/` nie ma jeszcze plików z nazwą `book*`. Nie zakładać ścieżek z planu. Najpierw ustalić faktyczne assety i dopiero dodać je do `ITEM_GLB_SPECS`; brak modelu już ma procedural fallback.

Nie dodawać `BookRenderer` ani własnego cache.

## Persistence

Tu nie potrzeba nowego schema field ani migracji wyłącznie z powodu książek:

- zwykłe count-based itemy już round-tripują przez `Inventory.toJSON()`,
- `saveState.ts` zapisuje wszystkie 6 skill XP jawnie,
- `restorePersistedSkills()` odtwarza XP i wylicza `value`.

Czytanie książki zmienia istniejące XP, więc trwały rezultat pojawi się automatycznie w obecnym save flow.

Należy tylko upewnić się, że rozszerzenie `ItemKind` przechodzi przez walidację/parsing `SaveData` bez ręcznej allowlisty starego unionu.

## Debug API

Aktualny surface to `window.seedvale.debug` instalowany przez `src/debug/npcDebugApi.ts` (`installNpcDebugApi`). Mimo nazwy pliku jest to obecnie ogólny debug API także dla villages, locations, treasure i navigation.

Nie tworzyć drugiego globalnego `window.seedvaleSkills`.

Rozszerzyć `SeedvaleDebugApi` o małe `skills` API, a `installNpcDebugApi()` o minimalną zależność do player skills/publicznych operacji. Preferować przekazanie wąskiego `{ skills, ...operations }` / callbacks zamiast całego `PlayerController`.

`setSkillValue` powinno korzystać z publicznej operacji domenowej. Ponieważ `raiseSkillToValue()` z definicji nie obniża, debugowe `setSkillValue()` potrzebuje osobnej publicznej/dev-safe operacji ustawiającej XP z `xpForSkillValue()` albo jasno nazwanej funkcji testowej — nie wolno implementować "set" przez bezpośrednie `skills[id].xp = ...` w debug module.

## Testy o najwyższej wartości

Najważniejsze jednostkowe testy powinny siedzieć przy `PlayerSkills.ts` i logice book interaction:

- 0.23 → basic → 0.40,
- 0.39 → intermediate = blocked,
- 0.40 / 0.51 → intermediate → 0.60,
- 0.59 → advanced = blocked,
- 0.60 / 0.73 → advanced → 0.80,
- 0.84 → advanced = no-op,
- ponowne czytanie nie zmienia XP,
- `raiseSkillToValue()` nigdy nie obniża XP,
- practice po książce nadal może przekroczyć 0.80.

Dodać także mały invariant test katalogu wszystkich 18 książek: `book` metadata istnieje, `required < target`, wartości mieszczą się w `[SKILL_MIN_VALUE, 1)`, każdy `ItemKind` ma `ITEM_DEFS` + `ITEM_CATALOG` + merchant price.

Regresja map powinna objąć przede wszystkim to, że `map_near` / `map_far` po zmianie kategorii nadal są kupowalne i nadal uruchamiają `applyLocationMap()` w `inventoryWiring.ts`.

## Sugerowana kolejność implementacji

1. `PlayerSkills.raiseSkillToValue` + testy.
2. `ItemCategory='knowledge'`, 18 `ItemKind`, `ITEM_DEFS`, `ItemCatalogEntry.book` + catalog invariant test.
3. inventory `onRead` + book result + UI details/state.
4. merchant prices/stock + merchant book details.
5. modele przez `ITEM_GLB_SPECS` po potwierdzeniu faktycznych asset paths.
6. konkretna książka w istniejącym `HiddenFindLoot` profile.
7. `window.seedvale.debug.skills`.
8. map regression + save/load/manual browser verification.

Nie rozszerzać scope o nowy system knowledge, book state, loot framework ani specjalny renderer.