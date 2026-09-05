# Plan: Merchant item ownership and semantic item labels

**Created:** 2026-09-05
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `ui-input`
**Subdomains:** `menus` `feedback`
**Tags:** `merchant` `inventory` `items`

## Cel

Poprawić czytelność Merchant Screen bez wprowadzania nowego stanu ani równoległych mechanizmów inventory.

Gracz powinien:

1. od razu widzieć, ile sztuk oferowanego przedmiotu już posiada,
2. łatwo rozpoznawać książki jako książki, a nie tylko jako tytuły.

Zmiany powinny wykorzystywać istniejące źródła danych i semantykę itemów.

## Zakres

### 1. Liczba posiadanych przedmiotów

Pokazać przy pozycjach Merchant Screen aktualną liczbę sztuk posiadanych przez gracza.

Nie dodawać merchant-specific `ownedCount` state ani cache.

Źródłem pozostaje istniejący inventory view używany przez Merchant Screen, tak aby:

- poprawnie obsługiwać zarówno stackowane, jak i instance-backed itemy,
- wartość aktualizowała się po zakupie i sprzedaży przez istniejący mechanizm odświeżania Merchant Screen,
- UI nie duplikował stanu należącego do `Inventory`.

Prezentacja powinna być kompaktowa.

Preferowany kierunek:

- ikona inventory/bagażu + liczba,
- przy większej dostępnej szerokości możliwy krótki tekst, np. `Masz 2`,
- przy mniejszej szerokości forma skrócona, np. ikona + `2` lub `×2`.

Responsywność powinna zależeć od dostępnej szerokości komponentu Merchant Item Row, a nie wyłącznie od szerokości viewportu. Rozważyć container queries, jeśli dobrze pasują do obecnej struktury CSS.

### 2. Semantyczne nazwy książek

Książki powinny być prezentowane użytkownikowi jako:

`Książka: <tytuł>`

np.

`Książka: Pierwsze kroki w siodle`

Nie zmieniać bazowego `ITEM_DEFS.label` na prefiksowaną nazwę.

Rozpoznawanie książki powinno wykorzystywać istniejącą semantykę `ITEM_CATALOG[kind].book`, a nie nazwę `ItemKind`, kategorię ani merchant-specific listę wyjątków.

Wprowadzić lub wykorzystać wspólny mechanizm tworzenia display name itemu, jeśli nie istnieje już odpowiedni mechanizm.

Użyć go w miejscach, w których użytkownik powinien widzieć semantyczną nazwę książki, przede wszystkim:

- Merchant BUY/OFFER,
- podsumowanie transakcji,
- Merchant Item Details,
- Inventory list/details, jeżeli te miejsca korzystają obecnie bezpośrednio z surowego `ITEM_DEFS.label`.

Search/filter Merchant Screen powinien pozostać spójny z nazwą widoczną dla użytkownika.

## Reuse / istniejące mechanizmy

Wykorzystać istniejące:

- `Inventory` jako właściciela stanu inventory,
- `inventoryCountsForUi()` do liczby posiadanych itemów,
- `ui.merchant.counts` jako istniejący reactive snapshot dla Merchant UI,
- obecny refresh Merchant Screen po udanej transakcji,
- `ITEM_CATALOG[kind].book` jako źródło semantyki książki.

Nie tworzyć alternatywnego mechanizmu synchronizacji inventory.

## Non-goals

Plan nie obejmuje:

- zmian zasad kupowania i sprzedawania,
- zmian `settleTransaction()`,
- runtime merchant stock quantities,
- zmian ekonomii ani cen,
- zmian persistence/save schema,
- przebudowy Merchant Store,
- zmiany bazowych tytułów książek,
- szerokiego redesignu Merchant Screen.

## UX constraints

Informacja o posiadanej liczbie nie powinna znacząco zwiększać szerokości Merchant Item Row ani konkurować wizualnie z:

- nazwą przedmiotu,
- ceną,
- kontrolkami ilości transakcji.

Forma skrócona musi pozostać zrozumiała. Jeżeli używana jest sama ikona z liczbą, zapewnić odpowiedni tooltip/accessibility label wyjaśniający znaczenie wartości.

## Verification

### Automated

- istniejące testy inventory/trade pozostają zielone,
- dodać lub zaktualizować testy UI/helperów tam, gdzie istnieją odpowiednie test seams,
- uruchomić `pnpm typecheck`,
- uruchomić odpowiednie testy projektu.

### Manual — użytkownik

Sprawdzić w przeglądarce:

1. BUY pokazuje aktualną liczbę posiadanych sztuk,
2. OFFER pokazuje spójną wartość,
3. liczba zmienia się natychmiast po zakupie,
4. liczba zmienia się natychmiast po sprzedaży,
5. instance-backed itemy mają poprawną liczbę,
6. Merchant Screen pozostaje czytelny przy szerokim i wąskim wierszu,
7. książki mają format `Książka: <tytuł>`,
8. nazwy książek są spójne między Merchant i Inventory,
9. wyszukiwanie/filtrowanie pozostaje zgodne z prezentowaną nazwą.

AI nie wykonuje browser verification.

## Implementation guidance

Przed implementacją zweryfikować aktualne symbole i zależności wskazane w implementation notes.

Dla ważnych nowych współdzielonych funkcji prezentacyjnych dodać JSDoc, jeżeli poprawi to ich odnajdywanie przez AI preflight; użyć `@domain` tam, gdzie jest to zasadne.

Unikać unrelated refactors.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
