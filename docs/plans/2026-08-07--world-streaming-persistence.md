# Plan: streaming świata + zapis (później)

**Status:** `done` — streaming (chunk grid, load/unload radius, worker generacja, duże regiony) i persystencja (IndexedDB save/continue) zaimplementowane i przetestowane w przeglądarce
**Created:** 2026-08-07  
**Updated:** 2026-08-07 — streaming zaimplementowany w `2ee894d` (chunk streaming + worker offload) i rozszerzony w `7c2969f` (duże regiony: oceany/wybrzeża/pasma górskie z macro noise, roślinność per-chunk); **persystencja dograna** — single-slot IndexedDB save (`src/persistence/`), ekran Continue/New Game przy boot (`src/ui/createStartScreen.ts`, wpięty w `src/main.ts`), przycisk Save + New Game w pause menu (`src/ui/createPauseMenu.ts`), autosave na `beforeunload` (best-effort) — patrz `src/app/createApp.ts`
**Priority:** —

## Co jest zrobione (streaming)

- `src/terrain/chunkManager.ts` — load/unload radius wokół gracza (Chebyshev distance, hysteresis), pinned home chunk pod osadę
- `src/terrain/chunkHeightmap.worker.ts` + `chunkWorkerPool.ts` — generacja w workerze, brak reachable edge, RAM ograniczony promieniem załadowanych chunków
- `src/terrain/chunkVegetation.ts` — roślinność per-chunk, też w workerze
- Macro noise (continentalness/mountainness + Worley ridge) → realne oceany/wybrzeża/pasma górskie zamiast jednorodnego szumu (`7c2969f`)
- Woda/ocean, lighting, settlement, fauna zaadaptowane do chunkowanego terenu

**Nie zrobione:** pełny cube-sphere / sferyczny świat (poniższa sekcja "Kierunek świata" — cube-sphere quadtree — pozostaje otwartym pytaniem, nierozstrzygniętym; obecny streaming to flat chunk grid z ringiem wokół gracza, nie sfera). Do zdecydowania czy w ogóle potrzebne, czy dzisiejszy flat/ring streaming "czuje się" wystarczająco bezkrawędziowy.

## Kierunek świata (decyzja użytkownika, 2026-08-07)

Rewizja wcześniejszego założenia "jedna skończona dolina wystarczy": produkt ma docelowo generować **duży świat**, najlepiej **sferyczny** — żeby uniknąć problemu nieskończoności (hard edge albo literal infinite plane). Kolejne obszary generowane progresywnie w miarę zbliżania się gracza do krawędzi już załadowanego regionu.

To bezpośrednio zawraca do findingu, który wcześniej odrzucono jako "skip":
[`CubeQuadTree` LOD (cube-sphere quadtree, node stitching)](../research/2026-08-07-simodev-refs-review.md) — `docs/refs/ProceduralTerrain_Part10/src/quadtree.js` (442 linie), użyty w `terrain.js:230`.

**Otwarte pytanie (wymaga osobnej sesji research/plan, nie rozstrzygnięte tu):** pełny cube-sphere planet renderer (6 ścian, LOD po odległości kamery) vs. prostszy model — np. duży bounded flat/curved teren z ring-based chunk loadingiem, który "czuje się" bezkrawędziowy bez pełnej geometrii sfery. Cube-sphere to ~450 linii nietrywialnego kodu (node stitching, seam handling) — warto rozważyć koszt/benefit względem prostszego przybliżenia zanim zacznie się implementację.

Fundament pod to: [worker pool dla generacji terenu](./2026-08-07--terrain-worker-pool.md) (osobny plan, wyższy priorytet, robimy najpierw) — chunk generation i tak musi iść do workera.

## Potrzeba

1. **Progresywna generacja** — chunki terenu (i potem encji) w miarę ruchu gracza, zamiast jednej `PlaneGeometry` na całą mapę. Docelowo w kierunku dużego/sferycznego świata (patrz wyżej), nie tylko perf-optymalizacja istniejącej jednej mapy.
2. **Zapis do bazy** — seed, stan świata / gracza / osady, żeby wracać do tej samej doliny i nie tracić postępu.

## Streaming (kierunek — `done`, szkic niżej zastąpiony realną implementacją)

Wzorce: SimonDev / `3d-portfolio` `TerrainChunkManager` (referencja, nie kopiować legacy Three).

| Element | Szkic | Stan |
|---------|--------|------|
| Chunk grid | stały rozmiar (np. 32–64 u), klucz `cx,cz` | `done` — `chunkGrid.ts` |
| Load radius | N chunków wokół gracza; unload poza ringiem | `done` — `chunkManager.ts`, hysteresis load/unload |
| Generacja | worker (FBM + biom) → `Float32Array` → mesh na main | `done` — `chunkHeightmap.worker.ts` + `chunkWorkerPool.ts`, rozszerzone o macro noise/roślinność |
| Seams | overlap 1 vertex / shared border heights | `done` — `buildChunkGeometry.ts` |
| Woda / sky | woda per-chunk lub jedna tafla w AABB załadowanych; sky bez zmian | `done` — woda zaadaptowana do chunków (`2ee894d`) |
| Osada / NPC | pinned do chunka „home”; fauna spawn w załadowanych | `done` |

## Persistencja — `done`

Zaimplementowane jako jeden IndexedDB slot (`src/persistence/saveDb.ts`, DB `seedvale`, store `saves`, klucz `'current'`) — multi-slot / backend DB zostaje jako możliwe „później”, nie teraz.

Rzeczywisty kształt save'u (`src/persistence/saveData.ts`) — bez `y` (zawsze przeliczane z terenu przez `PlayerController.setPosition`/`snapToGround`, więc nie ma sensu go zapisywać):

```ts
{
  version: 1,
  config: { seed, terrain, sky, player }, // = StoredConfig z config/persistConfig.ts
  player: { x, z, yaw, pitch },
  savedAt: number,
}
```

Flow:
- **Boot** (`src/main.ts`) — jeśli `readSave()` zwróci zapis, pokazuje `createStartScreen` (Continue / New Game) zanim wystartuje `createApp`. Brak zapisu = jak dawniej, prosto do świata.
- **Continue** — `createApp(container, save)` nadpisuje `config.seed/terrain/sky/player` zapisem, potem po stworzeniu gracza ustawia `mouseLook.state.yaw/pitch` i woła `player.setPosition(x, z)` (kolejność ważna — `setPosition` czyta `look` przez `syncCamera()`).
- **New Game** (ekran startowy) — `clearSave()` + normalny boot bez `initialSave` (nowy losowy seed pochodzi z domyślnego `parseSeedFromUrl` fallbacku/URL/localStorage jak dotąd).
- **Save** (pause menu, przycisk) — `writeSave(buildSaveData())`, krótki „Saved” feedback w UI.
- **New Game** (pause menu, w trakcie gry) — `window.confirm` → `clearSave()` + `config.seed = randomSeed()` (`src/world/parseSeed.ts`) + `rebuildWorld()` (istniejący path, ten sam co zmiana seeda w GUI).
- **Autosave** — `beforeunload` → `writeSave(buildSaveData())`, best-effort (IndexedDB nie gwarantuje ukończenia transakcji przy zamykaniu karty we wszystkich przeglądarkach — zaakceptowany kompromis, nie hard guarantee).

Świadomie poza zakresem: stan NPC/needs/settlement (deterministyczne z seeda, brak mutowalnego stanu wart zapisu — sprawdzone), migracje między wersjami save'u (jest tylko `version: 1`).

## Świadomie poza teraz

- Pełny infinite open world w v0.2  
- Netcode / shared world  
- Authoritative server sim  

## Trigger

Wziąć gdy: (a) jedna mapa 128–256 za mała / za ciężka, albo (b) potrzeba „Continue” / save po demie osady.

## Powiązane

- [2026-08-07-3d-portfolio-library-audit.md](../research/2026-08-07-3d-portfolio-library-audit.md) — chunk manager jako wzorzec  
- [ROADMAP.md](../ROADMAP.md)  
- [2026-08-07--game-ui-screens.md](./2026-08-07--game-ui-screens.md) — UI save/load  
