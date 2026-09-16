# Plan: Pending New Save Identity in Pause Menu

**Created:** 2026-09-16  
**Status:** `verification needed` 🔍  
**Type:** bug  
**Priority:** high · **Effort:** XS  
**Depends on:** persistence-004  
**Domain:** `persistence`  
**Subdomains:** `storage`  
**Tags:** `save-slots` `new-game` `pause-menu` `lifecycle`  
**Model:** Grok, Composer

## Problem

Rozpoczęcie nowej gry może pokazywać w menu pauzy nazwę poprzedniego zapisu.

Przykład:

```text
istniejący save: "Przygoda"

Start Screen
→ New Game
→ nazwa: "Quest Adventure"

świat uruchamia się poprawnie

Pause Menu
→ "Zapisz: Przygoda"
```

Nowa gra ma już własną tożsamość zapisu w:

```ts
pendingNewSaveName = "Quest Adventure"
```

ale nie ma jeszcze fizycznego slotu ani `activeSaveId`, dopóki pierwszy `writeSave()` nie utworzy zapisu.

Aktualne `refreshActiveSaveName()` interpretuje brak aktywnego ID tak samo jak zwykły przypadek wyboru domyślnego istniejącego zapisu:

```text
activeSaveId = null
→ pickActiveSaveId(null, existingSlots)
→ wybór poprzedniego/najnowszego slotu
→ pauseMenu.activeSaveName = jego nazwa
```

To łamie semantykę `beginNewSave()`:

```text
activeSaveId = null
pendingNewSaveName != null
```

oznacza **nową grę oczekującą na utworzenie pierwszego slotu**, a nie „wybierz istniejący zapis jako aktywny”.

## Goal

Menu pauzy musi przez cały lifecycle nowej gry prezentować faktyczną tożsamość zapisu.

Dla:

```text
beginNewSave("Quest Adventure")
```

UI powinno pokazywać:

```text
Zapisz: Quest Adventure
```

zarówno:

- przed utworzeniem pierwszego fizycznego slotu;
- po pierwszym manualnym/autosave;
- po kolejnych zapisach.

Nie zmieniać mechanizmu slotów ani nie dodawać drugiego źródła stanu dla nazwy zapisu.

## Current ownership

### `src/persistence/saveDb.ts`

Jest właścicielem lifecycle slotu:

- `pendingNewSaveName`;
- `getPendingNewSaveName()`;
- `setPendingNewSaveName()`;
- `beginNewSave(name)`;
- `getActiveSaveId()`;
- `setActiveSaveId()`;
- `writeSave()`;
- `createSave()`.

`beginNewSave(name)` już poprawnie robi:

```text
activeSaveId = null
pendingNewSaveName = name
```

Pierwszy `writeSave()` używa `pendingNewSaveName` do utworzenia nowego slotu, po czym `createSave()`:

```text
setActiveSaveId(id)
setPendingNewSaveName(null)
```

Nie zmieniać tego ownershipu.

### `src/app/saveState.ts`

`refreshActiveSaveName()` synchronizuje persistence identity z:

```ts
vueUi.setPauseActiveSaveName(...)
```

Obecnie bierze wyłącznie zapisane sloty oraz `activeSaveId`.

To jest główne miejsce poprawki.

### `src/app/createApp.ts`

Po skonfigurowaniu pause menu wykonuje:

```ts
void refreshActiveSaveName()
```

Ten call-site jest poprawny i powinien pozostać.

In-session `New Game` po utworzeniu nowego świata i pierwszym zapisie również wywołuje `refreshActiveSaveName()`.

### `src/ui-vue/screens/PauseMenuEntriesMain.vue`

Wyświetla:

```text
ui.pauseMenu.activeSaveName
```

UI nie powinno samodzielnie odpytywać persistence ani interpretować `pendingNewSaveName`.

## Implementation

### 1. Rozszerz `refreshActiveSaveName()` o pending save identity

W `src/app/saveState.ts` użyj istniejącego:

```ts
getPendingNewSaveName()
```

Przed fallbackiem przez `pickActiveSaveId()`.

Semantyka:

```text
listSavesResult()
    ↓
read failure?
    → zachowaj dotychczasową nazwę

pendingNewSaveName?
    → pokaż pending name
    → nie wybieraj istniejącego slotu

brak pending name
    ↓
resolve active slot from activeSaveId + slots
    ↓
show active slot name / empty
```

Pending identity musi mieć pierwszeństwo nad istniejącymi slotami, ponieważ jest jawnym stanem rozpoczętego `New Game`.

Nie kopiować pending name do osobnego Vue state poza istniejącym `activeSaveName`.

### 2. Zachowaj istniejący storage lifecycle

Nie zmieniać:

```ts
beginNewSave()
writeSave()
createSave()
```

o ile implementacja nie ujawni dodatkowego błędu.

W szczególności:

- nie twórz pustego slotu podczas `beginNewSave()`;
- nie ustawiaj sztucznego `activeSaveId`;
- nie zapisuj pending name do `localStorage`;
- nie traktuj seeda jako identity save;
- nie twórz osobnego „current game name” managera.

Istniejący pending state jest wystarczającym mechanizmem.

### 3. Zachowaj zachowanie po pierwszym zapisie

Po udanym pierwszym `writeSave()`:

```text
pendingNewSaveName
→ createSave(name)
→ activeSaveId = new id
→ pendingNewSaveName = null
```

UI powinno nadal pokazywać tę samą nazwę.

Nie wykonuj dodatkowego odczytu IndexedDB po każdym manualnym zapisie tylko po to, żeby naprawić ten bug, jeżeli poprawne rozwiązanie pending identity zapewnia spójność bez niego.

Jeżeli implementacja odkryje przypadek, w którym finalna nazwa utworzonego slotu może różnić się od pending name, synchronizację należy wykonać tylko na granicy utworzenia nowego slotu, a nie dla każdego save.

## Regression coverage

Dodać focused test obejmujący dokładnie zgłoszony przypadek.

Stan początkowy:

```text
existing slots:
- "Przygoda"

activeSaveId = previous slot
```

Następnie:

```text
beginNewSave("Quest Adventure")
```

Oczekiwania przed pierwszym zapisem:

```text
activeSaveId === null
pendingNewSaveName === "Quest Adventure"
resolved pause-menu save name === "Quest Adventure"
```

Nie może zostać wybrane:

```text
"Przygoda"
```

### Po pierwszym zapisie

Po `writeSave()`:

```text
activeSaveId !== null
pendingNewSaveName === null
stored slot name === "Quest Adventure"
pause-menu identity pozostaje "Quest Adventure"
```

### Existing-save regression

Sprawdzić również normalny istniejący save:

```text
pendingNewSaveName === null
activeSaveId === id("Przygoda")
```

musi nadal prezentować:

```text
"Przygoda"
```

### Storage failure

Zachować kontrakt z `persistence-004`:

```text
listSavesResult() → db-error
```

nie może wyczyścić już znanej nazwy w UI.

## Relevant files

Główne:

```text
src/app/saveState.ts
src/persistence/saveDb.ts
```

Call-sites / verification:

```text
src/app/createApp.ts
src/ui-vue/screens/PauseMenuEntriesMain.vue
```

Tests — wykorzystać istniejące testy persistence, jeżeli pozwalają pokryć kontrakt bez tworzenia ciężkiego mocka całego `SaveState`:

```text
src/persistence/saveDb.test.ts
```

Jeżeli bezpośredni test `refreshActiveSaveName()` wymaga mockowania dużego `SaveStateDeps`, wydzielić wyłącznie mały pure resolver identity, jeśli rzeczywiście upraszcza testowanie. Nie tworzyć nowego managera ani abstrakcji lifecycle tylko dla testu.

## Architectural guardrails

- `saveDb.ts` pozostaje właścicielem save-slot identity.
- Vue pozostaje warstwą prezentacji.
- `pendingNewSaveName` jest częścią lifecycle nowego slotu, nie tymczasowym tekstem UI.
- Pending new save ma pierwszeństwo nad fallbackiem do istniejących slotów.
- Nie zmieniać world/seed lifecycle.
- Nie rozszerzać zakresu na ogólny redesign save systemu.
- Nie duplikować mechanizmów z `persistence-004`.
- Nie dodawać nowych zależności.
- Dla ważnego nowego publicznego helpera dodać JSDoc z `@domain persistence`, jeśli taki helper faktycznie będzie potrzebny.

## Non-goals

Poza zakresem:

- zmiana formatu `SaveData`;
- migracje save schema;
- zmiana IndexedDB store;
- rename save;
- Save As UX;
- przebudowa ekranu Start Screen;
- zmiana seeda lub world generation;
- poprawki innych New Game state leaks;
- automatyczne browser verification.

## Verification

Automatycznie:

```text
pnpm test / odpowiedni focused vitest
pnpm typecheck / istniejący repo typecheck
pnpm lint dla zmienionego zakresu
```

Wykonawca powinien użyć standardowych komend repo zamiast wprowadzać nowe skrypty.

Manualnie przez użytkownika:

```text
1. Mieć istniejący save "Przygoda".
2. Z ekranu startowego uruchomić New Game "Quest Adventure".
3. Otworzyć Pause Menu przed ręcznym Save.
4. Sprawdzić: "Zapisz: Quest Adventure".
5. Wykonać Save.
6. Ponownie otworzyć menu.
7. Nadal: "Zapisz: Quest Adventure".
8. W Load sprawdzić, że powstał slot "Quest Adventure".
9. Odświeżyć stronę / Continue.
10. Sprawdzić, że aktywny save nadal ma poprawną nazwę.
```

AI agent nie wykonuje browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
