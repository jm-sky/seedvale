# Plan: Chunk mesh streaming geometry optimization

**Created:** 2026-09-02
**Status:** `verification needed` 🔍 — implemented (Etap A/B/C), technical checks pass; benchmark + browser verification pending (user)
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `world-terrain`

## Cel

Usunąć koszt budowania geometrii chunku z main thread, zachowując obecny wynik wizualny i istniejący lifecycle chunków.

Benchmark stream wykazał 51 hitchy związanych z `chunk mesh`, średnio 45.5 ms i maksymalnie 92.6 ms. Głównym celem jest usunięcie tego synchronicznego kosztu z głównego wątku, a nie zmniejszenie całkowitej liczby operacji CPU.

Zakres obejmuje:

1. przeniesienie data-oriented części `buildChunkGeometry()` do istniejącego workera,
2. uporządkowanie alokacji, kopii i transferu danych przy tej granicy,
3. cache gotowych danych geometrii chunku.

Nie przenosimy Three.js do workera.

## Stan obecny

Istniejący pipeline już wykorzystuje `chunkHeightmap.worker.ts`, `ChunkWorkerPool` i protokół `ChunkWorkerRequest/Response`. Worker generuje dane terrain oraz placementy, a wyniki dużych gridów są przekazywane przez Transferable ArrayBuffers.

Pozostający koszt wygląda zasadniczo tak:

```text
ChunkManager
  → requestChunkTile()
  → existing worker
  → ChunkTileResult
  → finalizeQueue
  → buildAndAttachMesh()
  → buildChunkGeometry()   ← main thread
  → THREE.BufferGeometry
  → THREE.Mesh
```

`ChunkManager` posiada już priorytetyzację i ograniczenie finalizacji na frame, dlatego nie należy tworzyć równoległego systemu kolejki.

## 1. Chunk mesh → istniejący worker

### Zakres

Wydzielić z `buildChunkGeometry()` worker-safe, data-only część obliczeń potrzebnych do utworzenia geometrii.

Worker powinien zwracać dane buforowe potrzebne do zbudowania `THREE.BufferGeometry`. Dokładny zestaw atrybutów należy ustalić na podstawie aktualnej implementacji, bez zakładania z góry konkretnego formatu.

Main thread pozostaje odpowiedzialny za:

- `THREE.BufferGeometry`,
- `THREE.BufferAttribute`,
- `THREE.Mesh`,
- pozostałe obiekty Three.js.

Preferowany docelowy przepływ:

```text
ChunkManager
  → existing chunk worker
  → ChunkMeshData
  → transferable buffers
  → BufferGeometry
  → Mesh
```

Nie importować Three.js do workera tylko po to, aby przenieść istniejący kod mechanicznie.

### Zachowanie

Migracja ma początkowo zachować semantykę `buildChunkGeometry()` możliwie 1:1.

Szczególnie nie zmieniać przypadkowo kolejności ani źródła danych dla:

- runtime terrain modifications,
- dig/scorch/prepare,
- road/clearing data,
- river/ocean/terrain tinting,
- biome/slope/mountain colouring,
- innych danych wpływających na finalną geometrię.

Jeżeli obecny lifecycle nakłada modyfikacje przed budową geometrii, nowy pipeline musi zachować tę semantykę.

### Integracja

Wykorzystać istniejące:

- `chunkHeightmap.worker.ts`,
- `chunkHeightmapProtocol.ts`,
- `chunkWorkerPool.ts`,
- `chunkManager.ts`,
- istniejącą kolejkę finalizacji.

Nie tworzyć drugiego workera ani równoległego systemu chunk mesh jobs.

## 2. Optymalizacja alokacji i kopii

Optymalizację wykonać przy okazji migracji, ale bez osobnego redesignu.

Sprawdzić pełną granicę worker → main thread:

```text
worker arrays
  → postMessage / transfer
  → received buffers
  → TypedArray views
  → BufferAttributes
```

Unikać zbędnych:

- structured-clone kopii,
- tymczasowych TypedArray,
- ponownego przepisywania dużych buforów,
- pośrednich tablic używanych wyłącznie do transportu danych,
- tworzenia `PlaneGeometry`, jeżeli jej rola może zostać zastąpiona bezpiecznym utworzeniem finalnych bufferów.

Nie usuwać kopii, jeśli jest wymagana przez ownership/lifecycle danych.

Istniejący mechanizm Transferable ArrayBuffers należy zachować i rozszerzyć na mesh data tam, gdzie ownership na to pozwala.

## 3. Cache gotowej geometrii

Cache ma przechowywać `ChunkMeshData`, nie `THREE.BufferGeometry` ani `THREE.Mesh`.

Docelowo:

```text
chunk request
  → mesh cache lookup
      ├─ HIT  → BufferGeometry → Mesh
      └─ MISS → worker → ChunkMeshData → cache → BufferGeometry → Mesh
```

### Klucz cache

Klucz musi obejmować wszystkie dane wejściowe mające wpływ na wynik geometrii, w szczególności:

- seed,
- współrzędne chunku,
- resolution,
- rozmiar chunku,
- istotne parametry terrain,
- relevant runtime terrain modifications.

Nie wolno zwrócić starej geometrii po zmianie danych wpływających na mesh.

### Lifecycle i pamięć

Pierwsza wersja cache powinna być runtime-only.

Nie rozszerzać tego zadania o IndexedDB ani persistence.

Cache musi mieć ograniczenie rozmiaru / eviction, aby nie przechowywać bez ograniczeń geometrii całego świata. Preferować istniejący mechanizm cache, jeżeli repo już posiada odpowiednią abstrakcję; w przeciwnym razie zastosować prosty bounded cache.

## Kolejność implementacji

### Etap A — worker migration

- wydzielić worker-safe mesh computation,
- rozszerzyć istniejący protocol,
- rozszerzyć worker pool,
- podłączyć wynik do istniejącego `ChunkManager`,
- zachować obecny output geometrii.

### Etap B — allocation/transfer cleanup

- przejrzeć nowe bufory,
- zastosować Transferable ArrayBuffers,
- usunąć wykryte zbędne kopie/alokacje,
- nie zmieniać semantyki generowania terenu.

### Etap C — mesh data cache

- wprowadzić `ChunkMeshData` cache,
- zdefiniować poprawny cache key,
- dodać bounded eviction,
- obsłużyć invalidację przez dane wpływające na mesh.

## Prawdopodobne pliki

Najważniejsze miejsca do modyfikacji:

- `src/terrain/buildChunkGeometry.ts`
- `src/terrain/chunkHeightmap.worker.ts`
- `src/terrain/chunkHeightmapProtocol.ts`
- `src/terrain/chunkWorkerPool.ts`
- `src/terrain/chunkManager.ts`

Może być potrzebny nowy worker-safe moduł data-only, jeżeli obecny kod jest zbyt mocno związany z Three.js. Nie tworzyć takiej abstrakcji bez faktycznej potrzeby.

## Oczekiwany efekt

Najważniejszy efekt to przeniesienie kosztu:

```text
chunk mesh: avg 45.5 ms / max 92.6 ms
```

poza main thread.

Nie zakładać, że całkowity CPU work zniknie — worker nadal wykona obliczenia. Sukcesem jest usunięcie dużych synchronicznych hitchy z main thread i poprawa płynności streamingu.

## Weryfikacja

Użyć tego samego scenariusza benchmarkowego:

```text
?benchmark=stream&seed=42&res=193
```

> **Uwaga:** Benchmark i browser verification robi użytkownik, aby nie tracić tokenów.

Porównać przede wszystkim:

- `chunk mesh` hitch count,
- `chunk mesh` avg/max,
- frame max,
- frame p1,
- STREAMING hitch count,
- RENDER avg/p95,
- ogólny FPS.

Po dodaniu cache dodatkowo sprawdzić:

- cache hit/miss,
- poprawność invalidacji,
- eviction,
- zużycie pamięci w rozsądnym zakresie.

Browser/manual verification pozostaje po stronie użytkownika.

**Zrób git commit i push do main, rebase jeżeli trzeba**
