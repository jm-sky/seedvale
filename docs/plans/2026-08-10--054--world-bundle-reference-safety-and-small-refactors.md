# Plan 054 — World Bundle Reference Safety & Small Refactors

**Status:** `done` ✅

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

- [x] przeprowadzony audit referencji po `rebuildWorld()`
- [x] `PlacedFires` nie jest używany przez stare callbacki po rebuildzie
- [x] game loop nie posiada niebezpiecznych snapshotów wymienianych systemów
- [x] interactables mają poprawny lifecycle
- [x] wykonane tylko małe, uzasadnione cleanupy
- [x] typecheck przechodzi
- [x] build przechodzi
- [ ] brak regresji interakcji/ognisk/inventory *(technicznie zweryfikowane; wymaga ręcznego testu w przeglądarce — patrz Implementation notes)*
- [x] brak niepotrzebnego rozszerzenia zakresu planu 053

## Implementation notes (2026-08-10)

**Audit (Phase 1/3/4) — wynik: jeden rzeczywisty bug, reszta poprawna.**

- `src/app/createApp.ts:339` przekazywał `bundle.placedFires` (snapshot instancji) do
  `getUserActions()`, której zwracane closures (`buildSimpleFire`, `buildFirePit`) są
  długowieczne — trzymane przez `createQuickActions`/`createPauseMenu` przez cały czas
  życia aplikacji, czyli przeżywają `rebuildWorldBundle()`. Po rebuildzie (zmiana
  configu terenu, "New Game") wołałyby `.place()` na starej, zdisposowanej instancji
  `PlacedFires` zamiast nowej `bundle.placedFires`. **To jest dokładnie Phase 2.**
- `gameLoop.ts` (Phase 3): `createGameLoop()` bierze cały `bundle` (kontener, nie pole)
  do `deps.bundle` i w `tick()` zawsze czyta `bundle.chunkManager`/`bundle.placedFires`/
  itd. na żywo — brak snapshotów. Bez zmian.
- `interactables.ts` (Phase 4): `buildInteractables()`/`collectItem()` są czystymi
  funkcjami bez żadnego trzymanego stanu/registry — wywoływane raz na klatkę z bieżącym
  `bundle`, wynik nigdzie nie jest cache'owany między rebuildami. Bez zmian.
- `createApp.ts` — pozostałe odczyty `bundle.X` to albo funkcje wołane na żądanie
  (`buildSaveData`, `dropItemStack`, `rebuildWorld` samo w sobie), albo gettery
  (`ambientSamplers`), albo jednorazowa inicjalizacja przed pierwszym `rebuildWorld()`
  (np. `player.setGround(...)` przy starcie — poprawnie re-wołane ponownie po każdym
  rebuildzie na linii 244 z aktualnym `bundle.chunkManager`). Żadnych dodatkowych
  snapshotów nie znaleziono.

**Fix (Phase 2):**

- `src/app/userActions.ts`: `getUserActions()` przyjmuje teraz `bundle: WorldBundle`
  zamiast `placedFires: PlacedFires`; `buildSimpleFire`/`buildFirePit` czytają
  `bundle.placedFires.place(...)` w momencie wykonania, nie z zamkniętego capture.
- `src/app/createApp.ts:339`: call site zaktualizowany na `getUserActions(inventory,
  bundle, playerTorch, player, hud, touchControls)`.

**Phase 5 cleanupy:** nic dodatkowego do zrobienia — `npm run lint` (no-unused-vars
włączony) już był czysty przed zmianą, nazewnictwo `bundle` jest już spójne w całym
`src/app/`, brak zbędnych castów w plikach z planu 053. Drobna kosmetyka przy okazji:
usunięty brakujący spacing w destrukturyzacji na `createApp.ts:339`
(`lightTorch}` → `lightTorch }`).

**Zweryfikowane technicznie:** `npx tsc --noEmit`, `npm run lint`, `npm run build`
(vue-tsc + vite), `npm run test` (98/98) — wszystkie czyste.

**Nie zweryfikowane ręcznie w przeglądarce** (per CLAUDE.md — wymaga usera na już
działającym dev serverze). Konkretny scenariusz do sprawdzenia, który przed fixem
faktycznie by się psuł:
1. Start gry, otwórz Quick Actions, zbuduj proste ognisko (`buildSimpleFire`) — działa.
2. Otwórz GUI debug → zmień parametr terenu (trigger `rebuildWorld()`) albo
   Pause Menu → "New Game".
3. Po rebuildzie spróbuj ponownie zbudować ognisko/palenisko przez Quick Actions
   *oraz* przez Pause Menu. Sprawdź, że nowe ognisko faktycznie pojawia się w świecie
   (nie ginie po odłożeniu surowców) i że jest widoczne/interaktywne (`[E]`).
   Przed fixem surowce znikały z ekwipunku, ale `.place()` trafiał do
   zdisposowanej, niewidocznej instancji.

## Szacowany effort

**S–M (~30–90 min)**

Plan powinien pozostać mały. Jeżeli podczas audytu pojawi się większy problem architektoniczny, należy go udokumentować jako osobny plan zamiast rozszerzać ten zakres.
