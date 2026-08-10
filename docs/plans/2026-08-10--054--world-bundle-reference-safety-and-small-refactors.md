# Plan 054 — World Bundle Reference Safety & Small Refactors

## Cel

Domknąć refaktor z planu 053 poprzez usunięcie miejsc, w których długowieczne callbacki, akcje lub systemy mogą zachować referencję do obiektu należącego do starego `WorldBundle`.

Plan nie zmienia architektury gry. Jest to mały follow-up: poprawki bezpieczeństwa referencji + kilka niskiego ryzyka refaktorów wynikających bezpośrednio z 053.

## Zasada

`WorldBundle` pozostaje stałym kontenerem.

Po `rebuildWorld()` pola bundle mogą być podmieniane:

```ts
bundle.chunkManager = ...
bundle.placedFires = ...
bundle.ocean = ...
```

Kod długowieczny nie powinien przechowywać starej referencji, jeżeli dane/system mogą zostać odbudowane.

Preferowane:

```ts
() => bundle.placedFires
```

zamiast:

```ts
const placedFires = bundle.placedFires

() => placedFires
```

---

## Phase 1 — Audit referencji po rebuildWorld

### Cel

Przejrzeć wszystkie callbacki utworzone podczas `createApp()` i sprawdzić, czy przechowują referencje do obiektów wymienianych podczas `rebuildWorld()`.

W szczególności sprawdzić:

- `placedFires`
- `chunkManager`
- `ocean`
- `settlement`
- NPC/fauna zależne od world rebuild
- systemy/interactables tworzone raz, ale używane przez wiele rebuildów
- callbacki save/load
- callbacki UI i Quick Actions

Nie zakładać, że każda referencja jest błędem — część obiektów jest celowo stała.

### Kryterium

Po `rebuildWorld()`:

- nowe akcje używają nowych systemów,
- stare referencje nie są używane przypadkowo,
- nie powstają duplikaty systemów,
- nie zmieniamy lifecycle `dispose()`.

---

## Phase 2 — Fix `PlacedFires`

### Problem

`getUserActions()` może otrzymywać konkretną instancję `PlacedFires`, podczas gdy `rebuildWorldBundle()` podmienia:

```ts
bundle.placedFires
```

na nową instancję.

### Zmiana

Przekazywać stabilny `WorldBundle` albo getter zamiast snapshotu `bundle.placedFires`.

Preferowane rozwiązanie:

```ts
getUserActions({
  inventory,
  world: bundle,
  ...
})
```

i wewnątrz callbacków odczytywać:

```ts
world.placedFires
```

dopiero podczas wykonania akcji.

### Ważne

Nie tworzyć globalnego singletonu `PlacedFires`.

Nie przenosić `placedFires` poza `WorldBundle`.

Nie zmieniać zachowania ognisk.

---

## Phase 3 — Audit callbacków game loop

Sprawdzić `gameLoop.ts` pod kątem podobnego wzorca:

```ts
const system = bundle.someSystem
```

następnie używanego przez callback wykonywany długo po utworzeniu aplikacji.

Jeżeli system jest wymieniany podczas rebuild:

```ts
bundle.someSystem = newSystem
```

callback powinien czytać:

```ts
bundle.someSystem
```

w momencie wykonania.

Jeżeli system jest immutable/stabilny przez cały lifetime aplikacji, pozostawić istniejącą referencję.

### Kryterium

Nie wykonywać mechanicznej zamiany wszystkich referencji.

Zmieniać tylko te, które rzeczywiście mogą zostać zastąpione podczas lifecycle aplikacji.

---

## Phase 4 — Interactables audit

Przejrzeć wyekstrahowany system `interactables`.

Sprawdzić:

- czy registry nie przechowuje starych obiektów po rebuildzie,
- czy unregister jest wykonywany przy dispose/rebuild,
- czy callbacki interactables nie capture'ują starych systemów świata,
- czy nie ma podwójnej rejestracji po rebuildzie.

Jeżeli obecny lifecycle jest poprawny — nie refaktorować.

Celem jest potwierdzenie poprawności, nie zmiana API dla samej zmiany.

---

## Phase 5 — Małe cleanupy po 053

Podczas przeglądu wykonać tylko oczywiste, lokalne poprawki:

- usunięcie martwych helperów,
- usunięcie nieużywanych importów,
- uproszczenie oczywistych wrapperów,
- ujednolicenie nazewnictwa `bundle` / `world`,
- redukcja prostych duplikacji powstałych podczas ekstrakcji,
- poprawienie typów, jeżeli obecnie wymagają niepotrzebnych castów.

### Czego nie robić

Nie:

- przebudowywać `WorldBundle`,
- tworzyć nowego dependency injection frameworka,
- wprowadzać event busa,
- tworzyć ECS,
- rozbijać kolejnych dużych modułów bez konkretnego problemu,
- zmieniać publicznych API systemów bez potrzeby.

---

## Phase 6 — Weryfikacja

Uruchomić:

```bash
npm run typecheck
npm run build
```

oraz istniejące testy/linty, jeżeli są skonfigurowane.

Następnie sprawdzić ręcznie:

1. uruchomienie nowej gry,
2. wejście do świata,
3. interakcje z NPC,
4. inventory,
5. ogniska,
6. Quick Actions,
7. rebuild świata / zmianę konfiguracji świata,
8. ponowne użycie ogniska po rebuildzie,
9. zapis,
10. load/continue,
11. brak podwójnych interactables,
12. brak błędów w konsoli.

## Definition of Done

- [ ] przeprowadzony audit referencji po `rebuildWorld()`
- [ ] `PlacedFires` nie jest używany przez stare callbacki po rebuildzie
- [ ] game loop nie posiada niebezpiecznych snapshotów wymienianych systemów
- [ ] interactables mają poprawny lifecycle
- [ ] wykonane tylko małe, uzasadnione cleanupy
- [ ] typecheck przechodzi
- [ ] build przechodzi
- [ ] brak regresji interakcji/ognisk/inventory
- [ ] brak niepotrzebnego rozszerzenia zakresu planu 053

## Szacowany effort

**S–M (~30–90 min)**

Plan powinien pozostać mały. Jeżeli podczas audytu pojawi się większy problem architektoniczny, należy go udokumentować jako osobny plan zamiast rozszerzać ten zakres.
