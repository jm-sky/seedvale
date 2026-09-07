# Optymalizacja: Chunk mesh — streaming geometrii

**Status:** implemented 2026-09-02 via `world-terrain-004-chunk-mesh-streaming-geometry-optimization.md`

Ten dokument zachowuje historyczne uzasadnienie optymalizacji. Nie jest listą pracy do wykonania. Aktualny kod jest źródłem prawdy; szczegóły implementacyjne są w planie i jego implementation notes.

## Historyczny problem

Benchmark `stream` przed implementacją wykazał:

- `51` hitchy związanych z `chunk mesh`,
- średnio **45.5 ms**,
- maksimum **92.6 ms**.

Problemem była CPU-heavy generacja danych renderowego mesha na main threadzie podczas streamingu.

## Stan aktualny

Trzy planowane elementy zostały zaimplementowane razem:

1. **Worker mesh-data computation** — `computeChunkMeshData()` w `src/terrain/chunkMeshData.ts` liczy data-only atrybuty mesha w istniejącym `ChunkWorkerPool` / `chunkHeightmap.worker.ts`. Nie powstał drugi system workerów.
2. **Transfer/allocation cleanup** — granica worker/main używa typed arrays; main thread pozostaje odpowiedzialny za krótką finalizację Three.js. Tile grids dla osobnego joba `mesh` są celowo structured-cloned, ponieważ main thread nadal jest ich właścicielem dla sampling/collision/content. Nie traktować tej kopii jako przypadkowego regresu do usunięcia bez sprawdzenia ownership.
3. **Bounded runtime mesh-data cache** — `src/terrain/chunkMeshCache.ts` przechowuje `ChunkMeshData`, nie obiekty Three.js. Cache jest byte-budgeted LRU (domyślnie 64 MB), per `ChunkManager`, czyszczony przy dispose.

Aktualny przepływ w uproszczeniu:

```text
ChunkManager
  → tile worker job
  → main-thread runtime terrain modifications
  → mesh cache lookup
      ├─ HIT  → ChunkMeshData
      └─ MISS → mesh job in existing worker pool → ChunkMeshData → cache
  → buildChunkGeometry()
  → THREE geometry / mesh attach on main thread
```

`buildChunkGeometry.ts` nie wykonuje już starego CPU-heavy per-vertex terrain/color/normal pipeline. Składa obiekty Three.js z wcześniej policzonego `ChunkMeshData`.

## Ważne ownership / invalidation

- Runtime terrain modifications nadal mają authoritative semantics na main threadzie przed mesh jobem.
- `meshRequestSeq` oraz identity chunka chronią przed podpięciem stale/superseded result.
- Cache key obejmuje stałą tożsamość managera, chunk coord i `modificationsEpoch`; epoch jest globalny i świadomie może over-invalidować, ale nie może zwrócić starej geometrii.
- Cache przechowuje tylko dane; każdy attach tworzy świeży Three.js geometry/mesh zgodnie z lifecycle `ChunkRecord`.

## Co mierzyć dalej

Nie planować ponownie worker migration ani geometry cache. Jeżeli streaming nadal hitchuje, najpierw wykonać świeży `?benchmark=stream&seed=42&res=193` i sklasyfikować pozostały koszt.

Szczególnie rozdzielać:

- main-thread mesh finalization,
- worker latency / scheduling,
- shader/program first-use stalls,
- vegetation/content finalization,
- inne streaming jobs.

Historyczne wartości 45.5 / 92.6 ms są baseline sprzed `world-terrain-004`, nie opisem aktualnego pipeline.

## Źródła

- `docs/plans/world-terrain-004-chunk-mesh-streaming-geometry-optimization.md`
- `docs/plans/implementation-notes/world-terrain-004-chunk-mesh-streaming-geometry-optimization-implementation-notes.md`
- `src/terrain/chunkMeshData.ts`
- `src/terrain/chunkMeshCache.ts`
- `src/terrain/chunkWorkerPool.ts`
- `src/terrain/chunkHeightmap.worker.ts`
- `src/terrain/chunkManager.ts`
- `src/terrain/buildChunkGeometry.ts`
