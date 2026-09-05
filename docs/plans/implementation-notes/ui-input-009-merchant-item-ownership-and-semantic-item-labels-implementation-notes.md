# Implementation Notes: Merchant item ownership and semantic item labels

**Reviewed:** 2026-09-05  
**Plan:** `ui-input-009-merchant-item-ownership-and-semantic-item-labels.md`

## Recon conclusion

Oba wymagania są zmianami prezentacyjnymi. Aktualna architektura już dostarcza Merchant Screen poprawną liczbę posiadanych itemów i odświeża ją po transakcji; nie potrzeba nowego stanu ani zmian w trade. Semantyka książki również już istnieje w `ITEM_CATALOG[kind].book`; brakuje tylko wspólnego display-name formattera.

Najważniejsza zasada implementacji: nie dodawać merchant-specific cache/count ani merchant-specific wykrywania książek.

## Merchant ownership — istniejący przepływ danych

Relevant files/symbols:

- `src/items/Inventory.ts` — authoritative ownership.
- `src/items/inventoryView.ts` / `inventoryCountsForUi()` — UI projection liczb.
- `src/app/inventoryWiring.ts` / `merchantInventoryView()`, `afterTrade()`, `syncMerchantIfOpen()` — app-layer synchronizacja Merchant UI.
- `src/ui-vue/store.ts` / `ui.merchant.counts`, `openMerchant()`, `refreshMerchant()` — reactive snapshot dla Vue.
- `src/ui-vue/screens/MerchantScreen.vue` / `ownedCount()` — istniejący odczyt count.
- `src/ui-vue/components/MerchantItemRow.vue` — właściwe miejsce prezentacji count.

Przepływ jest już kompletny:

`Inventory` → `inventoryCountsForUi()` → `merchantInventoryView()` → `ui.merchant.counts` → `MerchantScreen.ownedCount(kind)`.

Po udanym `settleTransaction()` `inventoryWiring.ts` wywołuje `afterTrade()`, które ponownie buduje `merchantInventoryView()` i przekazuje świeże `counts/groups` przez `vueUi.refreshMerchant()`. Nie dodawać watchera, event busa ani lokalnego cache do synchronizacji liczby.

`inventoryCountsForUi()` jest ważne zamiast prostego `Inventory.count(kind)`: dla `INSTANCE_BACKED_KINDS` zastępuje stack count wynikiem `inventory.countInstances(kind)`. Dzięki temu weapons/traps/liquid containers mają poprawny owned count.

## MerchantItemRow — najmniejszy seam UI

`MerchantScreen.vue` już używa `ownedCount(row.kind)` jako `maxCount` dla OFFER. BUY przekazuje `maxCount=null`. `maxCount` ma semantykę limitu steppera i nie powinno zostać przeciążone jako display value.

Dodać do `MerchantItemRow.vue` osobny presentation prop, np. `ownedCount: number`. Przekazywać go dla BUY i OFFER z istniejącego `MerchantScreen.ownedCount(row.kind)`.

Nie przenosić odczytu `ui.merchant` do `MerchantItemRow`; komponent pozostaje prostym reusable rowem z danymi przekazanymi przez rodzica.

### Responsive presentation

Wiersz jest już ciasny: label, committed quantity, cena, details i opcjonalne `Usuń`. Owned count powinien być `shrink-0` i wizualnie drugorzędny.

Preferować istniejący `lucide-vue-next` zamiast emoji — `MerchantItemRow.vue` już importuje `ShoppingCartIcon` z Lucide, a inne ekrany używają ikon z tego samego pakietu.

Dla responsywności oprzeć wariant na szerokości samego rowa, nie viewportu. Najprostszy kierunek to CSS container na root `MerchantItemRow` + container-query variants, np. pełniejsze `Masz 2` przy wystarczającej szerokości i ikona + `2`/`×2` przy węższej. Nie tworzyć JS `ResizeObserver` ani rozszerzać `useCompactMerchantLayout()` tylko dla tej etykiety.

Jeżeli Tailwind v4/container-query syntax w aktualnej konfiguracji okaże się nieobecny lub nieczytelny, lokalny `<style scoped>` z natywnym `container-type` / `@container` jest wystarczający; nie dodawać dependency.

Sama ikona/liczba powinna mieć `title` i/lub `aria-label` wyjaśniające „Posiadasz: N”, ponieważ wizualny skrót nie powinien być jedynym nośnikiem znaczenia.

## Book display semantics

Relevant files/symbols:

- `src/items/items.ts` / `ITEM_DEFS[kind].label` — obecnie czysty tytuł/nazwa itemu.
- `src/items/itemCatalog.ts` / `ITEM_CATALOG[kind].book` — authoritative semantyka książki.
- `src/ui-vue/screens/MerchantScreen.vue` — BUY/OFFER rows, search i transaction labels korzystają dziś bezpośrednio z `ITEM_DEFS[kind].label`.
- `src/ui-vue/components/MerchantItemDetailsModal.vue` — title korzysta z `item.label`; już ma `book = catalogEntry.book`.
- `src/ui-vue/screens/InventoryScreenItemList.vue` — lista i sortowanie korzystają z `item.def.label`; już ma `book` metadata.
- `src/ui-vue/screens/InventoryScreenItemDetails.vue` — title korzysta z `item.label`; już ma `book` metadata.
- `src/app/inventoryWiring.ts` / `readBookItem()` — toast po przeczytaniu świadomie cytuje sam tytuł książki; nie musi przechodzić na semantyczny UI display name.

Nie zmieniać `ITEM_DEFS.label`. Book implementation (`items-player-016`) celowo rozdziela human title w `ITEM_DEFS` od mechanics/type metadata w `ITEM_CATALOG.book`.

Nie wykrywać książek przez `kind.startsWith('book_')` ani kategorię `knowledge`: `map_near`/`map_far` również należą do `knowledge`, ale nie są książkami.

## Shared display-name helper

Na `main` nie ma wspólnego helpera dla semantycznej nazwy itemu. Najmniejszy spójny mechanizm to mały moduł presentation/domain-view w `src/items/`, np. `itemDisplay.ts`, eksportujący funkcję w rodzaju:

`itemDisplayName(kind: ItemKind): string`

Semantyka:

- jeśli `ITEM_CATALOG[kind].book != null` → `Książka: ${ITEM_DEFS[kind].label}`,
- w przeciwnym razie → `ITEM_DEFS[kind].label`.

Trzymać helper poza Vue, aby Merchant i Inventory korzystały z jednej reguły. Nie wkładać prefixu do trade catalog ani store.

Dla nowej współdzielonej funkcji dodać krótki JSDoc, jeśli poprawia preflight discovery; `@domain items-player` jest sensownym tagiem, mimo że plan właścicielsko pozostaje `ui-input`.

## Consumers i spójność search/sort

### MerchantScreen.vue

Przy budowaniu `buyRows` / `offerRows` wyliczyć display label raz na kind i używać go zarówno do `matchesSearch(...)`, jak i `row.label`. Dzięki temu użytkownik widzący `Książka: ...` może wyszukać także po słowie `książka`.

`purchaseLines` / `offerLines` powinny używać tego samego helpera, żeby Transaction Panel nie wracał do samego tytułu.

Nie zmieniać `useMerchantTradeState()` — przyjmuje już string label do search/sort i nie potrzebuje wiedzy o books.

### MerchantItemDetailsModal.vue

Title powinien użyć shared display name zamiast raw `item.label`. Pozostałe book metadata (`Umiejętność`, tier, requirement, target) już są poprawnie wyliczane z `ITEM_CATALOG` i nie wymagają zmian.

### InventoryScreenItemList.vue

Lista powinna używać display name dla widocznej nazwy. Jeżeli nazwa jest używana do sortowania po `name`, sortować po tej samej display name, żeby UI i sort były semantycznie spójne.

Nie zmieniać `item.def` ani `ITEM_DEFS`; display name może być dodatkowym derived field w lokalnym view modelu.

### InventoryScreenItemDetails.vue

Title powinien użyć shared display name. Description/fallback tekst może nadal używać raw `item.label`, jeśli zdanie brzmi naturalniej z samym tytułem; nie zastępować mechanicznie wszystkich raw-label usages.

Podobnie `readBookItem()` toast w `inventoryWiring.ts` ma formę cytatu `„<tytuł>”` i powinien zachować czysty tytuł.

## Scope boundaries / pitfalls

- Nie zmieniać `settleTransaction()` ani `tradeCatalog.ts`.
- Nie zmieniać store shape poza ewentualnymi typami wymaganymi przez komponent; `ui.merchant.counts` już wystarcza.
- Nie dodawać `ownedCount` do `MerchantInventoryView` jako osobnej struktury — `counts` jest już tym źródłem.
- Nie dodawać persistence/save fields.
- Nie zmieniać `ITEM_DEFS` book labels na prefiksowane.
- Nie robić repo-wide replacement wszystkich `ITEM_DEFS[*].label`; część kontekstów (toasty, zdania, debug) celowo potrzebuje czystej nazwy/tytułu.
- Nie traktować `knowledge` jako synonimu book.
- Nie rozbudowywać `useCompactMerchantLayout()` o row-level responsywność.

## Dokumentacja

`docs/STATE.md` nadal opisuje home-trader bardzo skrótowo i może nie odzwierciedlać dokładnego obecnego C1/M1 layoutu z `ui-input-003`. Nie dostosowywać implementacji do tego opisu — aktualne `MerchantScreen.vue` i implementation notes `ui-input-003` są dokładniejszym źródłem dla struktury UI.

## Testy o najwyższej wartości

Jeżeli istniejące test seams pozwalają bez rozbudowy harnessu:

- unit test shared `itemDisplayName`: zwykły item pozostaje bez zmian; book dostaje `Książka: `; `map_near`/`map_far` nie dostają prefixu,
- test/pure assertion, że Merchant search operuje na display label, jeżeli `useMerchantTradeState`/row-building da się testować bez mountowania całego ekranu,
- zachować istniejące trade/inventory tests jako regresję synchronizacji; nie pisać nowego test frameworka tylko dla tej zmiany.

Manual browser verification wykonuje użytkownik, zgodnie z planem.

## Sugerowana kolejność implementacji

1. Dodać shared `itemDisplayName()` + mały test.
2. Przełączyć Merchant row/search/transaction labels na helper.
3. Dodać `ownedCount` presentation prop do `MerchantItemRow` i przekazać go z BUY/OFFER.
4. Dodać compact responsive owned-count presentation przez container query/native CSS bez JS layout state.
5. Przełączyć Merchant Details oraz Inventory list/details na helper w user-facing nazwach; zachować raw title tam, gdzie jest celowo cytowany lub użyty w zdaniu.
6. Typecheck + odpowiednie testy; browser verification pozostawić użytkownikowi.
