# Plan: Natural Mountains & Rivers

**Created:** 2026-08-21
**Status:** `in progress` 🔄 — Etap 1–6 implemented (see "Implementation summary"); Etap 7 rendering polish (meandering, width/flow-based shading) implemented — waterfalls, full lake/ocean shader parity, and worker offload remain open (see "Implementation summary — Etap 7")
**Priority:** high · **Effort:** M
**Depends on:** unknown

## Cel

Rozwinąć istniejący terrain generation w kierunku naturalnej geografii świata:

* duże, ciągłe masywy górskie,
* naturalne doliny, zbocza i przełęcze,
* deterministyczna sieć odpływu,
* strumienie i rzeki wynikające z ukształtowania terenu,
* ciągłość geografii niezależnie od granic chunków.

Nie tworzyć równoległego systemu geografii. Wykorzystać istniejącą deterministyczną funkcję `sampleFloorAt(worldX, worldZ, params)` oraz istniejący chunk/worker pipeline.

## 1. Naturalne góry

Rozwinąć istniejący system:

```text
continent
    ↓
mountain ridge
    ↓
hills
    ↓
local detail
    ↓
floorHeight
```

Nie tworzyć osobnego `MountainSystem`.

Cele:

* duże, ciągłe pasma zamiast pojedynczych pików,
* większe masywy górskie,
* naturalne doliny między masywami,
* zróżnicowane wysokości i nachylenia,
* naturalne przełęcze i obniżenia,
* ograniczenie ostrych pików i nienaturalnych dołów,
* zachowanie deterministyczności i ciągłości między chunkami.

Zmiany powinny rozszerzać istniejące pola `mountain`, `mountainRidge`, `continent` i `hills`, zamiast tworzyć niezależny generator.

## 2. Hydrologia

Rzeki powinny być wynikiem analizy istniejącego terenu, a nie niezależnie rozmieszczonymi obiektami.

Podstawowy model:

```text
sampleFloorAt(x, z)
        ↓
local terrain neighbourhood
        ↓
slope / drainage
        ↓
flow direction
        ↓
flow accumulation
        ↓
streams
        ↓
rivers
        ↓
lake / sea
```

Na początek przygotować prototyp oparty o **D8**:

* dla punktu określić najniższego z 8 sąsiadów,
* wyznaczyć kierunek spływu,
* obliczyć flow accumulation,
* klasyfikować cieki według wielkości przepływu.

D8 nie jest na tym etapie zamrażany jako docelowy algorytm. Po prototypie należy ocenić jakość przebiegu rzek i ewentualnie rozważyć dokładniejszy model.

Nie implementować pełnej symulacji fizyki płynów.

## 3. Prototyp hydrologii

Przed implementacją renderowanych rzek przygotować możliwość diagnostycznego sprawdzenia:

* wysokości,
* kierunku spływu,
* flow accumulation,
* potencjalnych źródeł,
* przebiegu strumieni i rzek.

Prototyp powinien pozwolić ocenić sieć hydrologiczną na kilku seedach bez konieczności tworzenia finalnej geometrii Three.js.

Dopiero po uzyskaniu sensownej sieci przejść do generowania geometrii.

## 4. Sieć rzeczna

Docelowy model:

```text
source
  ↓
stream
  ↓
stream
  ↓
river
  ↓
lake / sea
```

Uwzględnić:

* źródła na odpowiednio wysokich terenach,
* łączenie mniejszych cieków,
* zwiększanie szerokości wraz z przepływem,
* ujścia do jezior/morza,
* wodospady przy odpowiednio dużym spadku,
* naturalne zakręty i meandrowanie.

Meandry powinny być nakładane po wyznaczeniu poprawnego przebiegu hydrologicznego, a nie zastępować analizę spadku.

## 5. Chunking i ciągłość

Nie tworzyć globalnego heightfieldu całego świata.

Wykorzystać fakt, że:

```text
sampleFloorAt(worldX, worldZ)
```

działa dla dowolnego punktu świata bez załadowanego chunka.

Hydrologia musi być deterministyczna i niezależna od:

* kolejności generowania chunków,
* aktualnie załadowanych chunków,
* stanu `ChunkManager`,
* istnienia mesha terenu.

Szczególnie dopilnować:

* ciągłości rzek na granicach chunków,
* możliwości kontynuowania cieku w sąsiednim chunku,
* spójnego kierunku przepływu,
* deterministycznego wyznaczania źródeł i ujść.

Chunk powinien być lokalnym odbiorcą wyniku geografii:

```text
world geography
      ↓
hydrology
      ↓
chunk query
      ↓
river geometry
```

Nie rozszerzać `waterBodies` do globalnego systemu hydrologii. Obecne `detectWaterBodies()` pozostaje lokalnym mechanizmem detekcji zbiorników.

## 6. Koryto i rendering

Dopiero po poprawnym wyznaczeniu sieci hydrologicznej:

* generować lekką proceduralną geometrię rzek,
* dostosowywać szerokość do przepływu,
* zapewnić zgodność koryta z terenem,
* małe strumienie utrzymywać bardzo tanie,
* większe rzeki mogą otrzymywać bardziej szczegółową geometrię,
* wykorzystać istniejący water shader i UV/parametry do wizualizacji przepływu.

Początkowo **nie modyfikować `sampleFloorAt()` przez rzeki**. Rzeka powinna być wynikiem istniejącej geografii.

Ewentualna deformacja terenu pod koryto może zostać rozważona później jako osobne rozszerzenie.

## 7. Architektura

Preferowany przepływ:

```text
Terrain
   ↓
Elevation / slope
   ↓
Drainage
   ↓
Streams
   ↓
Rivers
   ↓
Water geometry
```

Wykorzystać istniejące:

* `chunkHeightmap.ts`,
* `sampleFloorAt()`,
* `mountainRidge`,
* `continentalness`,
* `chunkGrid.ts`,
* `ChunkManager`,
* `chunkWorkerPool.ts`,
* worker pipeline,
* istniejący water rendering.

Nie tworzyć drugiego systemu geografii ani persistentnej globalnej mapy wysokości.

## 8. Kolejność implementacji

### Etap 1 — Naturalne góry

Poprawić istniejący mountain terrain:

* struktura dużych masywów,
* ciągłość pasm,
* doliny,
* przełęcze,
* ograniczenie ostrych pików.

### Etap 2 — Drainage prototype

Na bazie `sampleFloorAt()`:

* lokalne sąsiedztwo,
* slope,
* flow direction,
* flow accumulation,
* diagnostyczne źródła i cieki.

### Etap 3 — Ocena algorytmu

Na kilku seedach ocenić:

* naturalność sieci,
* zachowanie w górach i dolinach,
* liczbę cieków,
* sposób łączenia,
* problemy D8.

Jeśli D8 daje wystarczający efekt — pozostać przy nim. W przeciwnym razie poprawić model hydrologiczny przed przejściem dalej.

### Etap 4 — River network

Dodać:

* źródła,
* strumienie,
* łączenie,
* większe rzeki,
* ujścia,
* relację z jeziorami i morzem.

### Etap 5 — Cross-chunk continuity

Zapewnić ciągłość i deterministyczność sieci niezależnie od streamingu.

### Etap 6 — River geometry

Dodać:

* koryta,
* szerokość zależną od przepływu,
* podstawowe meandry,
* wodospady.

### Etap 7 — Rendering polish

Dopracować:

* shader flow,
* UV,
* LOD,
* tani rendering małych strumieni,
* wydajność dużych rzek.

## 9. Wydajność

Uwzględnić od początku:

* brak generowania całego świata,
* lokalne/on-demand obliczenia hydrologii,
* wykorzystanie workerów dla kosztownych analiz, jeśli rzeczywisty koszt to uzasadnia,
* cache tylko tam, gdzie jest potrzebny,
* małą geometrię dla małych cieków,
* zgodność z obecnym chunk streamingiem.

Nie przenosić automatycznie całej hydrologii do workera. Sposób podziału pracy powinien wynikać z rzeczywistego kosztu obliczeń i komunikacji.

## 10. Weryfikacja

Sprawdzić:

* kilka różnych seedów,
* naturalność dużych pasm górskich,
* brak nadmiaru ostrych pików i dołów,
* doliny i przełęcze,
* deterministyczność,
* kierunek spływu,
* flow accumulation,
* ciągłość rzek między chunkami,
* łączenie strumieni,
* ujścia do jezior/morza,
* wodospady,
* zgodność koryta z terenem,
* koszt generowania,
* koszt renderowania,
* browser verification wizualnego efektu.

## Implementation summary (2026-08-21)

Implemented in this session, per the implementation notes' explicit gating ("Do not start E–I until B/C produce a believable drainage network"):

**Etap 1 — natural mountains** (`src/terrain/chunkHeightmap.ts`, `src/config/worldConfig.ts`): tuned the existing combination rather than adding a parallel generator. `RegionParams` defaults changed — `worleyCellSize: 260 → 400` (wider ridge spacing → larger continuous massifs), `ridgeSharpness: 2.0 → 1.4` (broader ridge crest, less knife-edge), `mountainThresholdWidth: 0.14 → 0.2` (softer hills→mountain gate, more natural foothills). `mountainThreshold`, `mountainGain`, `heightScale`, `hillsAmplitude`, `hillsScale` left unchanged to avoid shifting overall mountain coverage/amplitude (lower regression risk for settlement placement/road routing/vegetation/biome thresholds that key off those fields). A new local `MOUNTAIN_DETAIL_DAMPING` constant (not a `RegionParams` field — avoids `applyStoredTerrain`/test-fixture plumbing for an internal shaping knob, same precedent as `DETAIL_WARP_FREQ`/`DETAIL_WARP_AMP`) dampens local-detail amplitude in proportion to `mountainRidge`, addressing "ostre piki/doły" by suppressing fine noise riding on top of the ridge — not by flattening the ridge/mountain contribution itself (explicitly avoided per the notes).

**Etap 2–3 — drainage prototype + multi-seed evaluation** (`src/terrain/hydrology.ts`, `src/terrain/hydrology.test.ts`): a pure D8 module (no ChunkManager/Three.js/worker) consuming only `sampleFloorAt`/`sampleHeightAt`. Fixed 8-neighbour order, distance-aware steepest-descent with deterministic tie-break, iterative (no recursion) descending-elevation accumulation pass over typed arrays (`Float32Array`/`Int8Array`/`Int32Array`/`Uint8Array`, no per-cell objects). Boundary cells whose flow exits the analysis window are flagged `BOUNDARY_EXIT` (not silently treated as an outlet); one extra `sampleHeightAt` just outside the window distinguishes `OCEAN_OUTLET` from an incomplete/unresolved path. `findSourceCandidates()` derives sources from drainage leaves + elevation/slope thresholds with deterministic local-maxima thinning (never random). `classifyStreams()`/`traceDownstreamPath()` round out the diagnostic surface for a future river-network builder.

Evaluation (Etap 3) was done numerically rather than visually — a rendered river network doesn't exist yet to look at. `hydrology.test.ts` deterministically scans each seed for a mountain-heavy and a coast-heavy region (via `sampleMountainRidgeAt`/`sampleContinentalnessAt`, no hardcoded magic coordinates) and asserts: determinism, strict downhill descent per non-terminal cell, mass conservation (accumulation over terminal cells == cell count), and a bounded sink ratio. Measured across seeds `1/42/999` × mountain/coast regions (64×64 cells, 6 world units/cell): sink ratio ~2.6%–4.0%, source candidates 17–40 per region — low enough that naive-D8 closed depressions don't dominate the terrain, without a depression-resolution pass.

## Implementation summary — Etap 4–6 (2026-08-21, follow-up session)

The user tried the Etap 1–3 build in the browser and confirmed mountains but (expectedly) no rivers, then asked for "the next stages." This session resolves the architectural problem the implementation notes flagged (D8 accumulation is regional, chunks are small) and ships real, rendered, cross-chunk-continuous rivers.

**Key design decision — river tiles, not per-chunk analysis or source-tracing.** New `src/terrain/riverNetwork.ts` partitions the world into fixed, seed-independent 256m "river tiles" (`RIVER_TILE_SIZE`), each analyzed once over its own core + a 256m halo (`RIVER_TILE_HALO`, 8m cells, ~9,216-cell window — same order of magnitude as the Etap 2–3 test grids). The halo only improves accumulation accuracy near a tile's own edges; it never extends rendered geometry into a neighbour tile. Every world point's river data is owned by exactly one tile, computed identically regardless of which chunk triggers it — the actual fix for the "regional vs. per-chunk" mismatch.

Rivers are built from **classified cells, not traced polylines from sources** (an earlier design considered tracing from `findSourceCandidates()` across the whole halo, which reintroduces cross-tile ownership ambiguity — rejected during implementation). Every core cell with `accumulation` above threshold is classified (`stream`/`river`/`majorRiver`); connected chains are built by walking consecutive classified cells via their single D8 downstream neighbour from each local head (no classified predecessor within the core) until an unclassified cell, a sink, or the core boundary. One pass of Chaikin corner-cutting (`smoothChainPoints`, endpoints fixed) smooths the D8 staircase look — applied once on the canonical pre-clip chain (not per-chunk after clipping), so two chunks always clip identical, already-smoothed data and never reintroduce a seam. This is deliberately smoothing, not meandering (no lateral noise offset — Etap 7).

Classification thresholds (`DEFAULT_RIVER_THRESHOLDS: {stream: 15, river: 50, majorRiver: 200}`) and the minimum chain length (`MIN_CHAIN_POINTS = 8`) were calibrated empirically against real generation: naive low thresholds produced dozens of 1–2 cell noise blips per tile (terrain wrinkles briefly crossing an accumulation threshold, not real channels); the chosen values give ~2–4 real, reasonably long (~9–11 cell) chains per tile. Per-tile computation measured ~18ms average across seeds/tiles in a synthetic benchmark — acceptable for a one-time, per-tile (not per-chunk) synchronous main-thread cost.

**Caching/integration** (`src/terrain/riverTileCache.ts`, `src/terrain/chunkManager.ts`): a tile is computed once (synchronous, main thread — no worker in V1, see "Performance" below) the first time any loaded chunk needs it, reference-counted by currently-loaded chunks overlapping it (same idea as `vegetationRegionBatcher.ts`'s chunk-membership reference counting, applied to tiles instead of chunk-groups), evicted when refcount hits zero. `ChunkRecord` gained `river?: WorldRiver | null` and `riverTiles?: RiverTileCoord[]`; `attachChunkMesh` resolves overlapping tiles (`overlappingRiverTiles`, at most 4 near a tile boundary) right after water attach, using the same `fallbackParams: RawSampleParams` already built for other raw-sampler call sites (no new plumbing); `unload()` disposes `record.river` and releases every retained tile, mirroring the existing `record.water?.dispose()` convention exactly.

**Geometry + rendering** (`src/world/riverGeometry.ts`, `src/world/riverWaterMaterial.ts`, `src/world/createRiverWater.ts`): `clipChainToRect()` (Liang-Barsky segment clip) slices a tile's cached chain to one chunk's rectangle — since it only ever interpolates between the same cached original points, two adjacent chunks clipping the same chain agree exactly at the shared boundary (verified by a dedicated test). `buildRiverRibbonGeometry()` extrudes a simple quad-strip ribbon, width from `widthFromAccumulation()` (bounded, grows with flow), Y from the chain's already-sampled `elevation` (no duplicate terrain sampling) plus a small surface offset — mirrors `createWater.ts`'s "surface slightly above the sampled bed" approach. `createRiverWaterMaterial()` is a distinct, lightweight `ShaderMaterial` (no heightmap/`USE_CHUNK_MASK` — a ribbon isn't a chunk-covering plane) that reuses `tickWaterTime`/`setWaterDayNight` from `waterMaterial.ts` **unmodified**, by defining the same uniform names those functions already write to (`uTime`, the six day/night lake/ocean colors, `uSunDirection`) — only the lake palette is actually sampled in the fragment shader (a river reads as fresh water). `createChunkRiver()` mirrors `WorldWater`'s exact lifecycle shape (`{mesh, update, setDayNight, addTo, dispose}`).

### Performance

Synchronous main-thread tile computation was a deliberate choice over adding a new `'hydrology'` job kind to `chunkWorkerPool.ts` now — the Etap 1–3 notes explicitly said "profile before deciding whether worker execution is needed," and the existing tagged-`kind` pool (`'tile'`/`'grass'`) could take a `'hydrology'` kind later with modest changes if browser testing shows a real hitch. Not done in this session; see LOOSE-ENDS.

### Known limitations (V1, documented rather than silently accepted)

- River width/classification may show a small, cosmetic discontinuity exactly at a tile seam (accumulation computed from slightly different halo windows on each side). Flow direction/topology does not have this problem (local-neighbourhood-only, window-independent) — verified by a dedicated cross-chunk-boundary continuity test.
- No meanders (lateral noise offset) or waterfalls — Etap 7.
- No worker offload yet — synchronous main-thread tile computation.
- Water surface is a simple ribbon, not full shader-parity with lake/ocean (no shore foam mask driven by real depth data, no reflection binding in V1).

**Not implemented (Etap 7, deferred)**: meanders, waterfalls, full shader/rendering parity with lake/ocean (reflection binding, depth-based foam), LOD, worker offload, an interactive in-browser hydrology debug overlay. Tracked in [LOOSE-ENDS.md](./LOOSE-ENDS.md).

**Verified**: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (1449 tests, up from 1434) all green — no existing test needed updating (rivers don't feed back into `sampleFloorAt`, unlike the Etap 1 mountain tuning). No browser/visual verification in this session — the user verifies actual river appearance/continuity/behavior manually.

## Implementation summary — Etap 7 (2026-08-21, follow-up session)

Rendering polish only — the drainage network, tile ownership, and cross-chunk
continuity from Etap 4–6 are untouched. All changes are in `src/terrain/riverNetwork.ts`,
`src/world/riverGeometry.ts`, and `src/world/riverWaterMaterial.ts`, following the
required flow: `D8 drainage → classified network → smoothing → deterministic
meandering → width from flow → geometry → water rendering`.

**Deterministic meandering.** `meanderChainPoints()` runs once per tile, on the
canonical pre-clip chain, immediately after Chaikin smoothing (now 2 passes
instead of 1 — a single pass still left a visibly angular path at the 8m D8
cell spacing; "zbyt kanciasty przebieg"). Each interior point is offset
perpendicular to its local tangent by a two-octave `simplex-noise` sample
(`createNoise2D(createSeededRandom(sampleParams.seed ^ MEANDER_NOISE_SEED_XOR))`
— same seeding pattern as `roadNetwork.ts`'s existing `meanderRoute()`), scaled
by a bounded amplitude derived from `widthFromAccumulation()` (bigger rivers
meander more, small streams only subtly) and multiplied by a taper factor that
goes to exactly 0 within `RIVER_MEANDER_TAPER_DISTANCE` (32 world units) of the
tile's own core-rect edge. This taper is what keeps every meandered point
strictly inside the tile core rectangle — for any point, `offset <=
maxAmplitude * edgeDist / taperDistance`, and since `maxAmplitude (6) <
taperDistance (32)`, that is always `< edgeDist` to the *nearest* edge, so a
point can never cross any edge — which is also why
`riverNetwork.test.ts`'s existing "never places a chain point outside the tile
core rectangle" invariant needed no change. No `Math.random()`; purely a
function of world position and seed, so identical for whichever chunk queries
the tile.

**Width/flow curve.** `widthFromAccumulation()` is now built on an exported
`flowFactor()` (0..1, `Math.pow(t, 1.6)` — eased toward the low end so a
barely-classified cell stays visually subtle and only accumulation well past
the `river` threshold reads as a big channel). `MIN_RIVER_WIDTH` dropped
`1 → 0.4`, `MAX_RIVER_WIDTH` `14 → 11` — addresses "zbyt stała i duża
szerokość" and "zbyt duża wizualna dominacja małych cieków".

**Shading.** `buildRiverRibbonGeometry()` now writes a per-vertex `aFlow`
attribute (`flowFactor()` at that point) alongside `position`/`uv`.
`riverWaterMaterial.ts`'s fragment shader reads it (`vFlow`) to: fade the
ribbon's lateral alpha out well before its geometric edge for low-flow
vertices (`bankSoftness = mix(0.55, 0.14, vFlow)`) — a soft, wispy trickle
blending into the bank instead of a hard-edged "canal on top of the terrain";
scale base alpha, foam-band intensity, and the flow-streak highlight down for
small streams; and shift the base color mix slightly toward `uLakeShallow` at
low flow. `RIVER_SURFACE_OFFSET` (terrain-vs-mesh headroom) is deliberately
untouched — its existing rationale (rough/steep-terrain sampling discrepancy)
doesn't shrink for a small stream.

**Not changed:** hydrology (`hydrology.ts`), tile ownership/partitioning,
`sampleFloorAt()` (no terrain deformation, per plan), the D8-derived
`elevation`/`accumulation` values on `RiverPoint` (meander only moves `x`/`z`),
worker offload.

**Not implemented (deferred, still open per LOOSE-ENDS.md):** waterfalls, full
lake/ocean shader parity (reflection binding, depth-based foam), LOD, worker
offload, interactive hydrology debug overlay.

**Verified:** `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`,
`pnpm run test` (1463 tests) all green — no existing river/hydrology test
needed changing. No browser/visual verification in this session — the user
verifies actual river appearance across seeds/terrain types manually.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
