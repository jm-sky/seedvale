# Plan: Player Action Contracts & Quick Actions Availability

**Created:** 2026-09-03
**Status:** `planned` 📋
**Type:** refactor
**Priority:** medium · **Effort:** M
**Depends on:** -
**Domain:** `ui-input`
**Tags:** `quick-actions` `player-actions` `validation` `requirements`

## Cel

Uporządkować kontrakt akcji gracza pomiędzy:
- `src/ui-vue/playerQuickActions.ts`
- `src/app/userActions.ts`
- `src/app/actions/survivalActions.ts`

Quick Actions ma pokazywać cały katalog akcji. Dostępne akcje są pierwsze, niedostępne ostatnie; niedostępne są widoczne jako disabled z opacity 50%.

**Availability jest snapshotem UX, nie autoryzacją wykonania.** `execute()` zawsze ponownie waliduje stan.

## Stan obecny

`playerQuickActions.ts` używa `availableKey`, `QuickActionsFireAvailability`, tekstowego `cost` i opcjonalnych handlerów. `visibleFireActions()` filtruje niedostępne akcje.

`userActions.ts` miesza `LightActionResult`, `boolean` i osobne `canX()`, przez co część warunków jest duplikowana.

`survivalActions.ts` używa głównie `void` + toastów zamiast wspólnego kontraktu wyniku.

Opcjonalny handler może dodatkowo powodować, że akcja pojawia się w UI mimo braku implementacji.

## Docelowy model

### 1. Strukturalne requirements

Wprowadzić wspólny `ActionRequirement`, pozwalający opisać konkretnie:
- item i wymaganą/aktualną ilość,
- capability,
- target/world requirement,
- inne istniejące warunki.

Jedna akcja może zwrócić wiele braków jednocześnie, np. 2× gałąź + 2× kamień + brak `fire_starting`.

Nie używać samego ogólnego `missing-capability`.

### 2. Availability i result

Wprowadzić mały wspólny kontrakt w rodzaju:

```ts
type ActionAvailability =
  | { available: true }
  | { available: false; missing: readonly ActionRequirement[] }
```

oraz ujednolicić wyniki wykonania zamiast mieszać `boolean`, `LightActionResult` i `void`.

Wynik niepowodzenia powinien móc przekazać strukturalne informacje o niespełnionych wymaganiach.

Nie budować rozbudowanego globalnego systemu błędów.

### 3. Jedno źródło prawdy

Nie utrzymywać równolegle:
- `availableKey`,
- `QuickActionsFireAvailability`,
- ręcznych `canX()`,
- tekstowego `cost`.

Definicja akcji ma opisywać wymagania, a check ma oceniać je względem aktualnego stanu.

Koszty dla UI powinny wynikać ze strukturalnych requirements, nie z drugiego ręcznie formatowanego stringa.

Wykorzystać istniejące:
- `Inventory.has()`,
- `Inventory.hasCapability()`,
- `hasItemCapability()`,
- istniejące cost constants,
- `PlacedFires.nearestBuildable()`,
- `evaluateGroundPlacement()`.

Nie tworzyć równoległego systemu inventory/requirements.

### 4. Quick Actions

`visibleFireActions()` nie filtruje katalogu.

Zwraca wszystkie akcje, a następnie stabilnie sortuje:
1. dostępne,
2. niedostępne.

W obrębie grup zachowuje kolejność katalogu.

Niedostępna akcja:
- pozostaje widoczna,
- jest `disabled`,
- ma opacity 50%,
- nie wykonuje się z UI,
- udostępnia konkretne missing requirements do prezentacji.

Komponent Vue nie implementuje własnej walidacji.

### 5. Handlery

Jeżeli akcja należy do katalogu Quick Actions, jej handler jest wymagany.

`brak handlera` oznacza błąd konfiguracji, a nie normalną niedostępność gameplayową. Nie maskować tego przez `?.() ?? false`.

### 6. Fire actions — `userActions.ts`

Ujednolicić:
- `buildSimpleFire()`,
- `buildFirePit()`,
- `buildGrate()`,
- `lightBranch()`,
- `lightWoodenTorch()`.

Usunąć duplikację pomiędzy availability i execute.

Availability i execute muszą korzystać z tych samych mechanizmów:
- placement przez `evaluateGroundPlacement()`,
- grate target przez `nearestBuildable()`,
- capability `fire_starting` jako konkretne requirement.

`execute()` wykonuje finalny check przed mutacją świata/inventory.

### 7. Survival actions — `survivalActions.ts`

Po ustabilizowaniu kontraktu fire actions zastosować go do istniejących akcji survival, bez niezwiązanych refaktorów.

Zachować `BusyAction` i model:
```
initial validation
→ busy.start()
→ final validation
→ mutation
→ result
```

Oddzielić kontrakt logiczny wyniku od prezentacji toastem.

### 8. Nie tworzyć globalnego katalogu

Nie wprowadzać `ALL_PLAYER_ACTIONS` ani God Objecta. Lokalne katalogi, np. `FIRE_QUICK_ACTIONS`, mogą pozostać, ale mają wspólny kontrakt.

## Zakres

### Główne
- `src/ui-vue/playerQuickActions.ts`
- `src/app/userActions.ts`
- `src/app/actions/survivalActions.ts`

### Integracje do sprawdzenia
- komponent Vue renderujący Quick Actions,
- konfiguracja `FireActionHandlers`,
- źródło `QuickActionsFireAvailability`,
- call-site'y akcji survival.

Jeżeli `QuickActionsFireAvailability` jest tylko równoległym stanem tych akcji, usunąć go.

## Poza zakresem

- globalny katalog wszystkich akcji,
- nowy system inventory,
- zmiana kosztów lub gameplayu ognia,
- zmiana `BusyAction`,
- niezwiązane refaktory,
- nowe akcje.

## Weryfikacja

### Automated
- wszystkie akcje katalogu są widoczne,
- dostępne są przed niedostępnymi,
- kolejność katalogu jest zachowana,
- niedostępne mają disabled,
- wiele brakujących requirements jest raportowanych,
- item requirement zawiera required/actual,
- capability jest konkretna,
- execute ponownie waliduje,
- niedostępna akcja nie mutuje świata,
- zmiana inventory/world state pomiędzy check i execute jest bezpieczna,
- istniejące guardy survival/busy zachowują semantykę.

### Browser/manual
Sprawdzić Quick Actions przy:
- pełnym inventory,
- częściowo spełnionych wymaganiach,
- braku capability,
- braku targetu,
- zmianie stanu po otwarciu menu.

Niedostępne akcje muszą pozostać widoczne, disabled i mieć opacity 50%.

## Dokumentacja

Dodać:
`docs/plans/implementation-notes/ui-input-007-player-action-contracts-and-quick-actions-availability-implementation-notes.md`

Implementation notes: konkretne symbole, ownership, integration points i pułapki z reconu; bez kopiowania planu.

Zaktualizować indeks planów zgodnie z `docs/plans/PLANNING.md` i dodać JSDoc dla istotnych publicznych/architektonicznych funkcji, gdy jest potrzebny do preflight discovery.

**Zrób git commit i push do main, rebase jeżeli trzeba**
