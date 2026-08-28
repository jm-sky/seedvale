# Plan: New Game — reset czasu świata

**Created:** 2026-08-28  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** none  
**Domain:** `world`

## Cel

Zapewnić, że **New Game** rozpoczyna świat z pełnym, deterministycznym stanem początkowym czasu.

Obecnie **New Game** resetuje `elapsedDays`, ale zachowuje bieżące `timeOfDay` ze starego świata.

## Aktualny stan

`src/world/dayNight.ts` ustawia domyślnie `timeOfDay: 0.32` oraz `elapsedDays: 0`.

`src/app/createApp.ts` wykonuje dla **New Game** `beginNewSave()`, losuje seed i wywołuje `rebuildWorld(true)`. Ten resetuje `dayNight.elapsedDays`, ale nie resetuje `dayNight.timeOfDay`.

W rezultacie nowa gra może dziedziczyć godzinę dnia z poprzedniego świata.

## Zakres

### 1. Wspólna wartość początkowa czasu

W `src/world/dayNight.ts` wyeksponować stałą dla początkowej godziny, zamiast powielać wartość `0.32`.

Przykładowo:

```ts
export const DEFAULT_TIME_OF_DAY = 0.32
```

`createDayNightState()` powinno korzystać z tej samej stałej.

### 2. Reset New Game

W ścieżce `rebuildWorld(true)` zresetować oba elementy stanu:

```ts
dayNight.elapsedDays = 0
dayNight.timeOfDay = DEFAULT_TIME_OF_DAY
```

Nie zmieniać zachowania zwykłego rebuild/reload świata.

### 3. Zachować istniejące mechanizmy

Nie tworzyć osobnego systemu resetowania czasu. Reset powinien pozostać częścią istniejącego lifecycle `rebuildWorld(true)` i korzystać z istniejącego `DayNightState`.

## Kryteria akceptacji

- **New Game** ustawia `elapsedDays === 0`.
- **New Game** ustawia `timeOfDay === DEFAULT_TIME_OF_DAY`.
- Nowa gra nie dziedziczy godziny poprzedniego świata.
- Nowy seed nadal jest generowany.
- Zwykłe odtworzenie istniejącego save'a zachowuje zapisany `timeOfDay`.
- `?time=` / `?hour=` nadal działa zgodnie z istniejącą logiką.
- Nie zmienia się zachowanie zwykłego `rebuildWorld()` bez resetu.
- Istniejące testy przechodzą.

## Verification

### Automated

Uruchomić standardową weryfikację projektu zgodnie z `CLAUDE.md`: testy, lint/typecheck (jeśli są częścią aktualnego workflow) oraz build.

Dodać lub zaktualizować test jednostkowy dla resetu **New Game**, jeśli istnieje odpowiedni testowany mechanizm `rebuildWorld`.

### Browser / manual

1. Uruchomić świat.
2. Ustawić czas np. na `18:30`.
3. Wykonać **New Game**.
4. Potwierdzić, że czas wrócił do około **07:41** (`0.32`).
5. Potwierdzić, że świat zaczyna się od `elapsedDays = 0`.
6. Wczytać istniejący save i potwierdzić, że jego zapisany czas jest zachowany.
7. Sprawdzić `?hour=` / `?time=` jako kontrolę, że debugowe wymuszanie czasu nadal działa.

## Poza zakresem

- zmiana domyślnej godziny rozpoczęcia świata,
- zmiana długości dnia,
- zmiana mechanizmu `time skip`,
- zmiana zapisu/odczytu `DayNightState`,
- refaktoryzacja całego systemu czasu.

**Zrób git commit i push do main, rebase jeżeli trzeba**
