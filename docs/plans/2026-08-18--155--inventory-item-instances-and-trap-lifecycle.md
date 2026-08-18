# Plan: Inventory item instances i lifecycle pułapek

**Created:** 2026-08-18  
**Status:** `done` ✅  
**Priority:** medium · **Effort:** L  
**Depends on:** 141

domain: items-player
tags: [persistence, ui-input]

## Cel

Rozszerzyć istniejący count-based inventory o minimalny, generyczny mechanizm `ItemInstance`, którego pierwszym zastosowaniem będą pułapki.

Problem do rozwiązania:

```text
trap durability = 50%
    ↓ collect
inventory
    ↓ place
trap durability = 100%   ← bug
```

Obecnie collect redukuje konkretną pułapkę do `ItemKind → count`, przez co jej indywidualny stan ginie. Ten sam problem dotyczy przyszłej wartości ekonomicznej używanego przedmiotu: trzy `trap_simple` mogą mieć różne ceny sprzedaży zależne od condition.

System musi zachować konkretny egzemplarz przez:

```text
purchase
→ inventory
→ place
→ active
→ durability changes
→ collect
→ inventory
→ save/load
→ place again
→ sell
```

Nie migrować wszystkich itemów do instances. Stackable items pozostają count-based. Instances są drugim sposobem przechowywania itemów, używanym tylko tam, gdzie indywidualny stan ma znaczenie.

## Stan obecny

Na podstawie aktualnego codebase:

- `Inventory` jest obecnie `ItemKind → count`;
- nie istnieje generyczny `ItemInstance`;
- `PlacedTrapRecord` już jest indywidualną instancją pułapki w świecie i posiada stabilne `id`, `kind`, `state`, `durability` oraz dane world-only;
- `place()` tworzy nową world trap z pełną durability;
- `collect()` zwraca konkretny `PlacedTrapRecord`, ale obecny inventory caller redukuje go do `kind`;
- trap states to obecnie `placed`, `active`, `broken` — nie wprowadzać `used` jako osobnego typu;
- durability jest zmieniana przez istniejący trap lifecycle, m.in. capture i weather;
- `SaveData` persystuje `placedTraps`, ale inventory nie persystuje indywidualnych item instances;
- trade obecnie operuje na `ItemKind` i centralnym `sellPrice(kind)`.

Źródłem prawdy podczas implementacji są aktualne pliki, testy i build configuration, nie historyczny opis planu 141 ani `LOOSE-ENDS.md`.

## Model danych

### Stackable items

Pozostawić istniejący model:

```text
ItemKind → count
```

Np.:

```text
wood → 20
shell → 50
```

### Item instances

Dodać minimalny generyczny model:

```text
ItemInstance {
    id
    kind
    ...optional instance state
}
```

Nie projektować pełnego systemu equipment/condition dla wszystkich itemów.

Dla pułapki minimalny stan to:

```text
TrapItemInstance {
    id
    kind
    durability
}
```

`state`, pozycja, yaw i pozostałe dane potrzebne wyłącznie podczas obecności w świecie pozostają po stronie world trap.

### ItemKind

`trap_simple` i `trap_good` pozostają istniejącymi `ItemKind`.

Nie tworzyć:

- `used_trap`;
- `active_trap`;
- `broken_trap`;
- osobnych kindów dla poziomów durability.

Stan konkretnego egzemplarza nie jest typem itemu.

## Inventory API

Rozszerzyć `Inventory` bez łamania istniejącego API count-based.

Istniejące operacje dla stackable itemów pozostają używane:

```text
add(kind, count)
remove(kind, count)
has(kind, count)
count(kind)
```

Dodać operacje dla instances zgodne ze stylem istniejącego kodu, logicznie:

```text
addInstance(instance)
removeInstance(id)
getInstance(id)
getInstances(kind)
countInstances(kind)
```

Nie udostępniać callerom bezpośredniej mutacji wewnętrznych struktur inventory.

## Instance identity

Każda instance otrzymuje stabilne ID.

ID musi przetrwać przejście:

```text
inventory
→ world
→ inventory
```

Dla pułapki nie tworzyć nowego ID przy każdym `place`.

## Purchase

Zakup nowej pułapki tworzy instance:

```text
id = new
kind = trap_simple
durability = maxDurability
```

Nie używać dla pułapek zwykłego `inventory.add(kind, 1)`.

Cena zakupu nadal wynika z istniejącego merchant catalog.

## Trap lifecycle

Docelowy lifecycle:

```text
Inventory instance
      ↓ place
PLACED
      ↓ activate
ACTIVE
      ↓ capture / weather / wear
PLACED
      ↓ collect
Inventory instance
```

oraz:

```text
durability = 0
      ↓
BROKEN
```

`used` nie jest osobnym stanem itemu.

`placed` oznacza konkretną pułapkę znajdującą się w świecie i obecnie nieaktywną.

`active` oznacza stan tej samej instancji, a nie osobny `ItemKind`.

`broken` jest stanem terminalnym w obecnym lifecycle. Nie dodawać repair systemu.

## Place

Zmienić przepływ z:

```text
ItemKind
→ new PlacedTrapRecord
→ max durability
```

na:

```text
Inventory ItemInstance
→ World Trap instance
```

World record musi zachować instance ID i aktualną durability.

Nowa pułapka:

```text
100%
→ place
→ 100%
```

Używana pułapka:

```text
50%
→ place
→ 50%
```

Place nie może resetować durability.

## Collect

Collect musi przekazać konkretną instancję z powrotem do inventory.

Nie wolno kończyć lifecycle przez:

```text
inventory.add(trap.kind, 1)
```

Powinno nastąpić logicznie:

```text
World Trap
→ ItemInstance
→ Inventory
```

Dane world-only, takie jak pozycja, nie trafiają do inventory.

## Broken

Broken trap:

- zachowuje `id`;
- zachowuje `kind`;
- ma `durability = 0`;
- może zostać zebrana;
- może znajdować się w inventory;
- może zostać sprzedana;
- nie może zostać ponownie aktywowana jako sprawna pułapka.

Nie dodawać naprawy.

Broken ma bardzo niską, ale niezerową wartość sprzedaży.

## Inventory grouping / UI

Źródłem prawdy są konkretne instances:

```text
trap A = 100%
trap B = 100%
trap C = 50%
```

Główna lista inventory grupuje je po `ItemKind`:

```text
Pułapka prosta ×3 [mixed usage]
```

Jeżeli wszystkie instances mają ten sam condition:

```text
Pułapka prosta ×3 [100%]
```

`mixed usage` jest wyłącznie stanem prezentacji.

Nie tworzyć specjalnego `ItemKind` ani persistence dla grupy.

## ItemDetailsScreen

Po wejściu w grupę:

```text
Pułapka prosta
To taka pułapka na zwierzęta.

Waga: ...
Ilość: ×3

Lista:
  2× Pułapka 100%
  1× Pułapka 50%
```

Grupowanie na szczegółach może agregować identyczne condition, ale operacje sprzedaży muszą ostatecznie identyfikować konkretne instance IDs.

Nie duplikować stanu itemu w UI.

## Persistence

Rozszerzyć `SaveData` o inventory instances bez łamania starych save'ów.

Obecne count-based inventory pozostaje kompatybilne.

Nowa sekcja może logicznie wyglądać jak:

```text
inventoryInstances: [
    {
        id: "trap:123",
        kind: "trap_simple",
        durability: 0.5
    }
]
```

Dokładny format i wersja SaveData muszą zostać dopasowane do aktualnego persistence systemu podczas implementacji.

Stary save bez `inventoryInstances` powinien być traktowany jako pusta lista instances.

Nie próbować rekonstruować indywidualnych instances ze starego count-based inventory, bo utraconego stanu nie da się odzyskać.

### Save/load acceptance case

```text
trap = 50%
→ collect
→ save
→ reload
→ inventory = 50%
→ place
→ world trap = 50%
```

ID pozostaje stabilne.

## Trade architecture

Obecny handel operuje na `ItemKind` i centralnym `sellPrice(kind)`. Należy rozszerzyć go tak, aby cena mogła zależeć od konkretnej instance, ale bez wprowadzania pełnego systemu dynamicznej ekonomii w tym planie.

Docelowa koncepcja:

```text
base ItemKind price
        ↓
instance condition modifier
        ↓
vendor ↔ player relation
        ↓
season / demand / future modifiers
        ↓
final sell price
```

Cena nie powinna być przechowywana w `ItemInstance` jako trwały stan.

Powinna być obliczana na podstawie aktualnego itemu i kontekstu sprzedaży.

## Condition pricing

Pierwsza wersja ma używać sensownego, łagodnego algorytmu:

```text
condition = durability / maxDurability

usageDiscount = 10% + 15% × (1 - condition)

conditionPrice = basePrice × (1 - usageDiscount)
```

Czyli orientacyjnie:

```text
100% → -10%
75%  → -13.75%
50%  → -17.5%
25%  → -21.25%
```

Zakres 10–25% jest centralnym parametrem do późniejszego balansu, nie wartością rozrzuconą po UI.

Broken nie korzysta z powyższego wzoru. Otrzymuje osobny bardzo niski współczynnik, np. 5% ceny bazowej, również jako centralny parametr.

Dokładne parametry powinny być łatwe do dostrojenia bez zmiany modelu inventory.

## Future pricing factors

Nie implementować teraz pełnego dynamic pricing, ale API ceny powinno nie blokować przyszłych czynników:

- vendor ↔ player relationship;
- sezon;
- popyt / podaż;
- stan vendora;
- inne czynniki ekonomiczne zależne od konkretnego itemu.

Każdy modifier powinien być dokładany w centralnym resolverze ceny, zamiast modyfikować cenę bezpośrednio w UI lub `Inventory`.

Sezon powinien wpływać tylko na itemy, dla których ma to sens — nie dodawać globalnego sezonowego mnożnika wszystkim przedmiotom.

## Manual selling

Tryb manual pozwala wybrać konkretne instances w `ItemDetailsScreen`.

Przykład:

```text
2× 100%
1× 50%

[Sprzedaj wybraną]
```

Operacja musi używać `instance.id`, nie samego `ItemKind`.

Sprzedaż jednej pułapki 50% nie może przypadkowo sprzedać jednej z pułapek 100%.

## Auto selling

Drugi tryb sprzedaży działa automatycznie.

Strategia:

> Sprzedawaj najpierw egzemplarze o najgorszym condition.

Przykład:

```text
100%
100%
50%
```

`Sell 1` wybiera `50%`.

```text
100%
80%
50%
20%
```

`Sell 2` wybiera `20% + 50%`.

Selekcja powinna być funkcją domenową, a nie logiką komponentu UI.

## Multi-sell

Mechanizm sprzedaży wielu instances powinien:

1. wybrać konkretne instance IDs;
2. obliczyć ich ceny przed mutacją;
3. zweryfikować możliwość transakcji;
4. usunąć wybrane instances;
5. dodać należną walutę;
6. zwrócić wynik transakcji i sumę.

Zachować obecne podejście atomicznego trade: walidacja przed mutacją.

## Weight

Waga nadal wynika z `ITEM_DEFS[kind].weight`.

Nie duplikować wagi w `ItemInstance`, jeśli aktualny model nie wymaga tego dla poprawności.

## Existing stackable items

Nie migrować automatycznie istniejących stackable items. Muszą nadal działać przez obecne count-based API.

Nowy mechanizm instances ma być możliwie małym rozszerzeniem obecnego `Inventory`.

## Konkretne miejsca do sprawdzenia/zmiany

Przed implementacją potwierdzić aktualne symbole i ownership w:

- `src/items/Inventory.ts` — storage i API inventory;
- item definitions / `ItemKind` / `ITEM_DEFS`;
- `src/items/trade.ts` — buy/sell transactions;
- `src/items/tradeCatalog.ts` — merchant/base prices;
- `InventoryScreen` — główna lista i grupowanie;
- `InventoryScreenItemDetails.vue` — szczegóły itemu;
- trap world lifecycle / `PlacedTrapRecord` / place / collect;
- trap durability resolver;
- persistence / `SaveData` / save-load migration;
- istniejące testy inventory/trade/traps.

Nie tworzyć nowych managerów bez potwierdzonej potrzeby.

## Performance

Inventory instances są małym stanem danych i nie powinny generować pracy per-frame.

Nie wykonywać globalnych skanów instances podczas game loop.

Grouping inventory powinien odbywać się przy budowaniu/odświeżaniu inventory view, nie co klatkę.

Trade price calculation i auto-sell wykonują się tylko podczas interakcji handlowej.

## Kryteria akceptacji

- [x] Nowo kupiona pułapka jest konkretną instance z własnym ID i pełną durability.
- [x] Trzy kupione pułapki są trzema różnymi instances.
- [x] Inventory może grupować trzy instances jako `Pułapka prosta ×3`.
- [x] Mixed condition jest pokazywany jako `[mixed usage]`.
- [x] `ItemDetailsScreen` pokazuje rozbicie np. `2×100%`, `1×50%`.
- [x] Place nie resetuje durability.
- [x] Collect zachowuje durability i instance ID.
- [x] Lifecycle używa `placed / active / broken`, bez `used` jako ItemKind.
- [x] Broken może zostać zebrana i przechowywana jako instance.
- [x] Broken można sprzedać za bardzo niską cenę.
- [x] Cena używanego itemu uwzględnia condition i centralny zakres 10–25% discount.
- [x] Cena nie jest zapisana jako trwały stan instance.
- [x] Architektura ceny pozwala później dodać relationship, season, demand i inne modifiers.
- [x] Manual sell może wybrać konkretną instance.
- [x] Auto-sell sprzedaje najpierw najgorsze instances.
- [x] Multi-sell liczy cenę każdej instance przed mutacją i działa atomowo.
- [x] Save/load zachowuje inventory instances, durability i ID.
- [x] Stare count-based itemy nadal działają bez migracji do instances.
- [x] Nie powstaje specjalny system inventory tylko dla pułapek.
- [x] Nie powstają nowe ItemKind dla `used`, `active` ani `broken`.
- [x] `npx tsc --noEmit`, `npm run build` oraz istniejące testy przechodzą.
- [ ] Browser/manual verification sprawdza pełny lifecycle pułapki oraz manual/auto sell.

## Nie w zakresie

- migracja wszystkich itemów do instances;
- durability/condition dla wszystkich narzędzi;
- equipment/weapon instance system;
- repair system;
- pełny dynamic pricing;
- implementacja vendor relationship pricing;
- implementacja seasonal demand pricing;
- demand/supply simulation;
- multiplayer synchronization;
- nowe `ItemKind` tylko dla stanów pułapki.

## Weryfikacja

Techniczna:

```text
npx tsc --noEmit
npm run lint
npm run build
npm test
```

Manual/browser:

```text
1. Kup 3 pułapki.
2. Postaw jedną, zużyj ją do częściowej durability i zbierz.
3. Sprawdź inventory: ×3 [mixed usage].
4. Otwórz ItemDetailsScreen: np. 2×100%, 1×50%.
5. Save → reload → sprawdź, że 50% nadal istnieje.
6. Postaw ponownie 50% → nie może wrócić do 100%.
7. Sprzedaj ręcznie konkretną instancję.
8. Sprawdź auto-sell — przy 100/100/50% ma wybrać 50%.
9. Sprawdź broken → inventory → bardzo tania sprzedaż.
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**