# Plan: Developer Debug API

**Created:** 2026-08-24
**Status:** `verification needed` 🔍 — implemented 2026-08-24. Technical verification green (`tsc`/lint/build/test, 1704 tests); no browser/gameplay verification yet. See "Implementation summary" and the [implementation notes](./implementation-notes/ui-input-001-developer-debug-api-implementation-notes.md) for the scope adaptations made against the real codebase.
**Priority:** high · **Effort:** M
**Depends on:** none

**domain:** `ui-input`
**tags:** [world-terrain, settlements-npcs]

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

## Implementation summary (2026-08-24)

Implemented end-to-end following the implementation notes' review findings against the real codebase (authoritative account of scope adaptation — this is a compact index, not a restatement).

- **Files**: new `src/debug/locationSearch.ts` (pure, generic `searchNearest` + `worldRingSteps`/`cellRingSteps` — the one shared deterministic ring-search policy for all five `locations.*` queries), `src/debug/locationQueries.ts` (the five `mountainNearest`/`deepForestNearest`/`riverNearest`/`villageNearest`/`oceanNearest` implementations), `src/debug/villageInspector.ts` (`findVillageDef`, id→def resolution). Extended `src/debug/npcDebugApi.ts` (`SeedvaleDebugApi` grows `village`/`villages`/`locations`/`teleportTo`/`help`; `installNpcDebugApi` grows `worldContext`/`config`/`getPlayerPosition`/`teleport` params) and `src/app/createApp.ts`'s single call site.
- **Reuse over new code**: mountain uses the already-exported `MOUNTAIN_RIDGE_THRESHOLD` from `settlementTerrain.ts` (now exported, was module-private); deep forest uses `WorldContext.sampleForestBiome` directly (already the canonical classifier, no re-derivation); ocean uses continentalness vs `region.oceanThreshold`, never `WorldOcean` (a render-only follow-player plane); river calls the pure `computeRiverTile` directly (never `riverTileCache.retain`/`release`, which is ref-counted and chunk-lifecycle-bound) and reuses the existing `rawSampleParamsFromWorld` helper from `world/map/mapProjection.ts` instead of writing a second `WorldConfig → RawSampleParams` mapper; village uses `SettlementsManager.peekDef` (cached, never loads meshes). `chunksNear` moved from a `SettlementsManager.ts`-private function to an exported `terrain/chunkGrid.ts` helper so `createApp.ts`'s teleport wiring reuses the identical "ensure destination terrain is generated" primitive `SettlementsManager.ensureLoaded` already uses, via `ChunkManager.waitForChunks`.
- **Villages**: `villages()` is loaded-only (`getLoaded()`) — never force-loads settlements from a synchronous console call; `village(id)` resolves any id via a new `cellFromId` (exact inverse of `cellKey`, added to `settlementGenerator.ts`) whether or not the settlement is currently streamed in. `npcs()` on any village handle delegates to the existing `queryNpcs(bundle, timeOfDay, {settlementId})` — no second NPC projection — which naturally returns `[]` for an unloaded settlement.
- **Teleport**: `createApp.ts` passes a narrow `getPlayerPosition: () => {x,z}` and an async `teleport: (x,z) => Promise<void>` callback (built from `player.setPosition` + `bundle.chunkManager.waitForChunks`) — the debug module never imports `PlayerController`. `PlayerController.setPosition`'s existing `snapToGround` already handles ground/water clamping, so no extra offset logic was needed for river/ocean/mountain destinations, confirming the plan's implementation-notes assumption.
- **Verification**: `npx tsc --noEmit`, `pnpm lint:fix`, `pnpm run build`, `pnpm run test` (1704 tests, incl. new `src/debug/locationSearch.test.ts`, `src/debug/locationQueries.test.ts`, `src/debug/villageInspector.test.ts`, `src/debug/npcDebugApi.test.ts`) are all green. No `jsdom`/`happy-dom` was added — `npcDebugApi.test.ts`'s gating tests stub a minimal `window` object directly via `vi.stubGlobal`, since `isDebugMode()` only reads `window.location.search`. No browser/gameplay verification yet — see plan's "Testy i weryfikacja" section for the manual `?debug=1` DevTools checklist still open (each `locations.*`/`teleportTo.*` call, determinism across repeated calls, behavior after a world rebuild, and behavior after a settlement streams out/back in).

> **Zrób git commit i push do main, rebase jeżeli trzeba**
