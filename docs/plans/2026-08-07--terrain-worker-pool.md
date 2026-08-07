# Plan: Worker pool dla generacji terenu

**Status:** `planned`
**Created:** 2026-08-07
**Priority:** wysoki — user chce zaadresować jak najszybciej (nie czekać na lag jako trigger)

## Potrzeba

Dziś `generateHeightmap.ts` liczy heightmapę (FBM/simplex) synchronicznie na main thread, blokując UI przy regeneracji (zmiana seeda, GUI, resolution — zwłaszcza wyższe presety typu "Insane" 769×769). Cel: przenieść tę pracę do Web Workera, żeby regeneracja nie zacinała renderu/inputu.

## Referencja

`docs/refs/ProceduralTerrain_Part10/src/terrain-builder-threaded.js:37-73` + `terrain-builder-threaded-worker.js` (SimonDev, MIT) — wzorzec: worker pool, wiadomości z parametrami generacji, transfer wyniku jako `Float32Array` (transferable, zero-copy).

Pełny audyt: [research/2026-08-07-simodev-refs-review.md](../research/2026-08-07-simodev-refs-review.md).

## Kierunek (szkic)

| Element | Szkic |
|---------|-------|
| Worker | 1 plik `src/terrain/heightmap.worker.ts`, `postMessage({ seed, resolution, ...worldConfig })` → zwraca `Float32Array` (transferable) |
| Pool | Zacząć od 1 workera (jedna heightmapa na raz — dziś nie ma wielu równoległych regionów). Rozszerzyć do puli dopiero z chunk streamingiem ([world-streaming-persistence](./2026-08-07--world-streaming-persistence.md)) |
| API | `generateHeightmapAsync(params): Promise<Float32Array>` jako drop-in obok istniejącego synchronicznego `generateHeightmap` — call site w `createApp.ts` / GUI regen handler przechodzi na async |
| UI podczas generacji | Loading state / disabled GUI controls, żeby uniknąć race (dwie regeneracje naraz) |
| `waterBodies.ts` | Sprawdzić czy detekcja zbiorników wody też powinna iść do workera (zależy od heightmapy) czy zostać na main po odebraniu wyniku |
| Vite | Worker przez `new Worker(new URL('./heightmap.worker.ts', import.meta.url), { type: 'module' })` — natywne wsparcie Vite, bez dodatkowego bundlera configu |

## Świadomie poza teraz

- Pełna pula N workerów (przedwczesne — nie ma jeszcze wielu równoległych chunków)
- Worker dla mesh building (geometria) — na razie tylko heightmap; ocenić osobno czy `createTerrainMesh.ts` też się kwalifikuje
- SharedArrayBuffer / cross-origin isolation (niepotrzebne przy jednym worker + transferable)

## Powiązane

- [research/2026-08-07-simodev-refs-review.md](../research/2026-08-07-simodev-refs-review.md) — finding #1, oryginalnie `adopt later`, podniesiony do wysokiego priorytetu
- [plans/2026-08-07--world-streaming-persistence.md](./2026-08-07--world-streaming-persistence.md) — worker pool tu jest fundamentem pod przyszły chunk streaming
- `src/terrain/generateHeightmap.ts`, `src/terrain/waterBodies.ts`, `src/config/worldConfig.ts`
