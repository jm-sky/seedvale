# Plan: Developer Debug API

**Created:** 2026-08-24
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** none

domain: ui-input
tags: [world-terrain, settlements-npcs]

## Cel

Rozbudować istniejące `window.seedvale.debug` o małe API developerskie do szybkiej inspekcji świata i testów gameplayu z DevTools Console.

API ma być warstwą nad istniejącymi systemami. Nie tworzy równoległego registry ani stanu symulacji.

## Zakres

### 1. Publiczny namespace

Rozszerzyć istniejące:

```ts
window.seedvale.debug
```

Nie tworzyć `window.debug` ani drugiego globalnego namespace.

API pozostaje dostępne wyłącznie w debug mode (`?debug=1`).

### 2. NPC

Zachować istniejące:

```ts
debug.npc(id)
debug.npcs(filter?)
```

Lookup ma korzystać z aktualnego `WorldBundle` / `SettlementsManager`, bez globalnego `Map<id, NpcAgent>` i bez przechowywania stale referencji do runtime NPC.

Nie zmieniać istniejącego NPC inspectora poza wymaganym współdzieleniem mechanizmu lookup.

### 3. Villages

Dodać:

```ts
debug.village(id)
debug.villages()
```

Village debug handle/projection powinien udostępniać tylko potrzebne dane:

```ts
{
  id,
  name,
  size,
  position,
  npcs(),
  teleportHere()
}
```

Nie zwracać bezpośrednio pełnego runtime `Settlement` i nie tworzyć drugiego registry osad.

Semantyka `villages()` musi zostać oparta o aktualny `SettlementsManager`; należy jasno rozróżnić dane dostępne dla istniejących settlementów od settlementów aktualnie załadowanych.

### 4. Location queries

Dodać:

```ts
debug.locations.mountainNearest()
debug.locations.deepForestNearest()
debug.locations.riverNearest()
debug.locations.villageNearest()
debug.locations.oceanNearest()
```

Nie tworzyć nowego systemu lokalizacji ani skanować całego proceduralnego świata.

Każde query ma wykorzystywać istniejące źródło danych:

| Query | Źródło |
|---|---|
| mountain | istniejący terrain/mountain sampling |
| deep forest | istniejący forest biome/density |
| river | istniejący river network |
| village | `SettlementsManager` |
| ocean | istniejący ocean/water system |

Wyszukiwanie `Nearest` ma być deterministyczne i mieć ograniczony koszt CPU.

Wynik powinien być lekką projekcją, np.:

```ts
{
  kind,
  position,
  distance,
  id?
}
```

Dla village dodatkowo `name` i `size`.

Jeżeli konkretna lokalizacja nie może być odnaleziona, API zwraca `null` zamiast rzucać wyjątek.

### 5. Teleport

Dodać convenience API:

```ts
debug.teleportTo.mountainNearest()
debug.teleportTo.deepForestNearest()
debug.teleportTo.riverNearest()
debug.teleportTo.villageNearest()
debug.teleportTo.oceanNearest()
```

Teleport ma korzystać z odpowiedniego `debug.locations.*` zamiast implementować własne wyszukiwanie.

Dodatkowo umożliwić teleportowanie do wyniku location query:

```ts
const village = debug.locations.villageNearest()
debug.teleportTo(village)
```

Należy wykorzystać istniejący player teleport/movement primitive oraz istniejący mechanizm zapewniający poprawne załadowanie/pozycjonowanie świata. Nie manipulować bezpośrednio sceną ani chunkami z poziomu debug API.

### 6. Help / discoverability

Dodać:

```ts
debug.help()
```

z krótką listą dostępnych metod i ich przeznaczeniem, aby API było samodokumentujące w DevTools.

Nie tworzyć osobnego `window.help`.

## Architektura

API powinno być cienką warstwą kompozycyjną nad istniejącymi ownerami stanu.

Preferowany przepływ:

```text
window.seedvale.debug
        ↓
existing world/system owners
        ↓
lightweight debug projection
```

Nie przechowywać globalnie:

- `NpcAgent`;
- `Settlement`;
- `Chunk`;
- `Object3D`;
- innych runtime references podatnych na streaming/rebuild.

Każde query powinno korzystać z aktualnego stanu świata.

Nie wprowadzać nowego `DebugManager`, globalnego entity registry ani równoległego modelu świata.

## Integracja z istniejącym kodem

Przed implementacją zweryfikować aktualne API i ownership w szczególności:

- `debugMode`;
- istniejące `npcDebugApi` / NPC inspector;
- `WorldBundle`;
- `SettlementsManager`;
- `ChunkManager` / `WorldContext`;
- mountain/terrain sampling;
- forest biome detection;
- river network;
- ocean/water system;
- player teleport/movement.

Jeżeli aktualne nazwy lub ownership różnią się od planu, dostosować implementację do kodu zamiast tworzyć adaptery bez potrzeby.

## Testy i weryfikacja

Dodać testy dla:

- obecności API tylko w debug mode;
- kształtu publicznego API;
- live lookup NPC i villages;
- deterministycznych location queries;
- `null` dla braku wyniku;
- wykorzystania location query przez teleport;
- odporności na world rebuild / settlement streaming / NPC lifecycle;
- braku równoległego registry.

Uruchomić `tsc`, lint, build i testy.

Następnie wykonać browser/manual verification z `?debug=1` w DevTools, obejmując:

```ts
debug.help()
debug.npcs()
debug.villages()
debug.locations.mountainNearest()
debug.locations.deepForestNearest()
debug.locations.riverNearest()
debug.locations.villageNearest()
debug.locations.oceanNearest()
debug.teleportTo.villageNearest()
```

Zweryfikować również działanie po streamingu/rebuildzie świata.

## Poza zakresem

- World Observatory GUI;
- redesign NPC simulation inspector/trace;
- pełny cheat/god-mode system;
- globalny entity registry;
- automatyczny test runner;
- debug API dla wszystkich systemów świata;
- inventory/combat/needs API gracza.

## Kryterium sukcesu

Developer może z DevTools szybko znaleźć NPC, osadę lub charakterystyczne miejsce świata i teleportować tam gracza, korzystając wyłącznie z aktualnego stanu Seedvale i bez znajomości wewnętrznych mechanizmów streamingu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
