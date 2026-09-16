# Plan: Animal movement hot-path performance

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** ~~fauna-028~~
**Domain:** `fauna`
**Subdomains:** `behavior`
**Tags:** `performance` `movement` `water` `collision`
**Roadmap:** -
**Model:** Sonnet, Composer

## Problem

Benchmark `docs/performance/results/2026-09-16--020--benchmark-stream.md` pokazuje, że głównym bottleneckiem CPU jest fauna:

- `FAUNA`: ~42.9 ms/frame średnio,
- `behaviour`: ~37.1 ms/frame,
- najgorsza zaobserwowana klatka: `FAUNA ≈ 1068 ms`,
- nearest/prey/threat scans są relatywnie tanie i nie tłumaczą kosztu.

Istniejący recon z `fauna-028` wskazuje, że `behaviour` jest zdominowany przez movement:

```text
AnimalAgent
→ steerToward()
→ stepWithSlopeAndCollision()
  → sampleSlope()
  → do 3 × isWalkable()
       → sampleLocalWater()
       → collidersNear()
→ tickMovementTail()
```

Najbardziej podejrzany jest obecny `ChunkManager.sampleLocalWater()`:

```text
sampleLocalWater()
→ riverChannelSegmentsNear(rec.riverChains, ...)
→ allocation RiverChannelSegment[]
→ sampleLocalWaterPure(...)
→ riverWaterSampleAt(...)
→ drugi scan segmentów
```

`riverChannelSegmentsNear()` jest wykonywane przy zapytaniu gameplayowym, mimo że `rec.riverChains` są już stanem przypisanym do załadowanego chunka.

Dodatkowo `ColliderRegistry.query()` tworzy nową tablicę i kopiuje zawartość bucketów dla każdego query.

Trzeci potencjalny problem to adaptive cadence z `fauna-028`: gdy frame `dt` przekracza `active`/`routine` interval, behaviour zaczyna wykonywać się dla prawie wszystkich zwierząt co klatkę. Przy mocnym obciążeniu może to tworzyć dodatnie sprzężenie:

```text
drogi movement
→ długi frame
→ cadence gates wszystkie otwarte
→ więcej movement work
→ jeszcze dłuższy frame
```

Zmiana cadence jest jednak **warunkowa** i może nastąpić tylko po pomiarze po podstawowej optymalizacji water hot-path.

## Cel

Obniżyć koszt movement hot-pathu `AnimalAgent` i usunąć wielokrotne wykonywanie pracy zależnej od chunka dla każdego zwierzęcia i movement probe, zachowując:

- identyczną fizyczną odpowiedź water traversal,
- identyczne river geometry / channel ownership,
- wspólny movement path dla fauna, NPC i player tam, gdzie już istnieje,
- world independence od gracza i kamery,
- deterministic simulation,
- jedną politykę fauna cadence,
- brak nowego równoległego cache lub fauna-owned water model.

## Scope

### Phase A — movement hot-path diagnostics

Przed zmianą algorytmu rozszerzyć istniejący performance instrumentation tak, aby benchmark rozdzielał koszt co najmniej na:

```text
fauna behaviour
  movement
    slope
    walkability
      waterSample
      colliderQuery
  movementTail
```

Dla water hot-path zebrać:

- `sampleLocalWater` calls/frame,
- czas całkowity i worst call,
- liczbę uruchomień `riverChannelSegmentsNear`,
- liczbę przeskanowanych chain points / segmentów,
- liczbę wygenerowanych `RiverChannelSegment`,
- osobno koszt segment preparation i `riverWaterSampleAt`.

Dla collider queries zebrać:

- calls/frame,
- returned colliders/frame,
- worst query.

Dodać możliwość wskazania najdroższego `AnimalAgent.update()` / behaviour execution wraz z `animalId`, `kind` i resolved update importance.

Telemetryka ma używać istniejącego `agentCpuDiag` / benchmark report, bez równoległego systemu diagnostycznego. Gdy diagnostyka jest wyłączona, jej koszt i alokacje mają być pomijalne.

### Phase B — cache per-chunk river gameplay segments

Usunąć `riverChannelSegmentsNear()` z per-query gameplay hot-path.

Obecny chunk jest naturalnym właścicielem danych potrzebnych przez `sampleLocalWater()`.

Rozszerzyć istniejący loaded-chunk record o derived state odpowiadający koncepcyjnie:

```text
ChunkRecord
  riverChains              // canonical source
  riverGameplaySegments    // derived cached representation
```

Nazwa pola może zostać dopasowana do aktualnego `ChunkRecord`, ale ownership musi pozostać na poziomie chunka.

`riverGameplaySegments`:

- pochodzi wyłącznie z istniejących kanonicznych `riverChains`,
- używa istniejącej logiki `riverChannelSegmentsNear`,
- jest budowane przy tej samej zmianie/finalizacji stanu, która ustawia lub zmienia `riverChains`,
- jest invalidowane/przebudowywane dokładnie razem z tym stanem,
- jest usuwane razem z chunkiem,
- nie jest drugim źródłem prawdy,
- nie zmienia hydrologii ani renderowania.

`ChunkManager.sampleLocalWater(worldX, worldZ)` powinien potem wykonywać tylko pracę query-time:

```text
worldToChunk
→ chunks.get
→ read cached gameplay segments
→ sampleLocalWaterPure
```

Nie może na tej ścieżce ponownie wykonywać hydrology/channel preparation.

### Phase C — benchmark po podstawowym fixie

Po Phase B uruchomić testy automatyczne. Benchmark w przeglądarce wykonuje **wyłącznie User**.

User uruchamia istniejący deterministic benchmark:

```text
?benchmark=stream
```

i porównuje wynik z:

`docs/performance/results/2026-09-16--020--benchmark-stream.md`.

Minimalny zestaw danych do porównania:

```text
FAUNA ms/frame
behaviour ms/frame
behaviour executions/frame
long-frame worst FAUNA
sampleLocalWater calls/frame
riverChannelSegmentsNear calls/frame
waterSample ms/frame
collider query ms/frame
```

Oczekiwany strukturalny wynik:

```text
riverChannelSegmentsNear calls from gameplay sample path = 0
```

Brak sztywnego FPS targetu: wynik browser benchmark zależy od środowiska i GPU.

## Conditional follow-ups

Poniższe etapy nie należą do podstawowej implementacji, dopóki benchmark po Phase B nie pokaże, że nadal są istotnym kosztem.

### Phase D — ograniczenie kosztu `riverWaterSampleAt()`

Jeżeli cached segments usuną preparation cost, ale `riverWaterSampleAt()` nadal jest znaczącym hot-pathem, zastosować najmniejszy istniejący spatial mechanism pozwalający ograniczyć kandydatów.

Preferencje:

1. reuse istniejącego chunk/local spatial ownership,
2. prosty per-chunk bucket/index,
3. brak globalnego river index,
4. brak cache per-animal.

Nie wprowadzać spatial indexu tylko dlatego, że teoretycznie wygląda lepiej — wymaga pomiaru po Phase B.

### Phase E — ograniczenie alokacji `ColliderRegistry.query()`

Jeżeli benchmark po Phase B nadal pokaże collider query jako istotny koszt, ograniczyć alokacje obecnego:

```ts
const result: Collider[] = []
result.push(...bucket)
```

Preferowane rozwiązanie:

- visitor/iterator callback nad istniejącymi bucketami albo
- reusable scratch storage z jednoznacznym właścicielem i bez ryzyka zagnieżdżonych query.

Bez:

- globalnego mutable scratch współdzielonego przez zagnieżdżone query,
- zmiany collider ownership,
- osobnego spatial indexu dla fauny.

`PlayerController`, `NpcAgent` i `AnimalAgent` nadal konsumują wspólny collider registry.

### Phase F — slow-frame behaviour cadence

Dopiero jeśli benchmark po podstawowym fixie potwierdzi, że wolne klatki nadal powodują zbiorowe otwieranie behaviour gates, przygotować najmniejszą zmianę cadence.

Najpierw zmierzyć:

- `behaviour executions/frame`,
- `full-rate agents/frame`,
- `reduced-cadence agents/frame`,
- ich korelację z frame time.

Wymagania ewentualnej zmiany:

- timers/life nadal używają pełnego real `dt`,
- high-priority / combat / player-coupled / swimming pozostają immediate,
- movement nie może zwolnić świata w czasie symulowanym,
- movement quantum nadal respektuje `MAX_THROTTLED_STEP_M`,
- brak zależności od camera visibility,
- deterministic phase distribution pozostaje zachowane.

Nie narzucać z góry konkretnego catch-up algorytmu. Projekt rozwiązania ma wynikać z pomiaru i zachować powyższe invarianty.

## Relevant files

### Fauna

- `src/fauna/AnimalAgent.ts`
  - `update()`
  - `steerToward()`
  - `isWalkable()`
  - `tickMovementTail()`
- `src/fauna/animalUpdateCadence.ts`
- `src/perf/agentCpuDiag.ts`

### Terrain / water

- `src/terrain/chunkManager.ts`
  - loaded chunk record
  - chunk finalization / unload lifecycle
  - `sampleLocalWater()`
- `src/terrain/riverNetwork.ts`
  - `riverChannelSegmentsNear()`
  - `riverWaterSampleAt()`
- `src/terrain/waterSample.ts`
  - `sampleLocalWater()`

### Collision

- `src/world/collision.ts`
  - `ColliderRegistry`
  - `query()`

### Shared movement

- `src/terrain/slopeConstraint.ts`
  - `stepWithSlopeAndCollision()`

### Performance report

- existing benchmark / performance report files emitting:
  - `[Seedvale Agent CPU]`
  - `[Seedvale Long Frame Attribution]`

## Architectural decisions

### River data ownership

`ChunkManager` remains owner of loaded gameplay river data.

Do not add river caches to `AnimalAgent`, `createFauna` or settlement livestock.

Derived gameplay segments are allowed as cached derived state because:

```text
riverChains = authoritative canonical source
riverGameplaySegments = derived loaded-chunk representation
```

Cache lifecycle musi być związany z lifecycle `riverChains`; nie może istnieć ścieżka aktualizująca canonical river state bez invalidacji/przebudowy derived segments.

### Water semantics

`terrain/waterSample.ts` pozostaje single physical answer dla:

```text
dry / lake / ocean / river depth
```

Fauna nadal konsumuje tę odpowiedź przez istniejący traversal classifier.

Performance work nie może kopiować water classification do fauny.

### Shared movement

Nie forkować `stepWithSlopeAndCollision()` ani nie dodawać fauna-only fast path.

Jeżeli generic hot-path improvement dotyczy też NPC/player, implementować go u istniejącego shared ownera.

### Diagnostics

Diagnostics muszą być tanie gdy wyłączone i nie mogą generować alokacji, które istotnie zniekształcają mierzony hot-path.

## Non-goals

- zmiana fauna decisions lub behaviour priorities,
- redukcja liczby zwierząt,
- usunięcie swimming/water traversal,
- uproszczenie river simulation,
- zmiana river geometry,
- zmiana settlement collider semantics,
- broad pathfinding rewrite,
- przeniesienie `AnimalAgent` do Web Worker,
- ECS rewrite,
- render optimization,
- NPC optimization niezwiązana ze wspólnym hot-pathem.

## Verification

### Automated — implementation agent

Uruchomić relevant unit tests dla:

- `waterSample`,
- river network/channel segments,
- `AnimalAgent`,
- animal cadence,
- slope/collision movement,
- collider registry.

Dodać regression tests potwierdzające:

1. cached river gameplay data daje ten sam `LocalWaterSample` co poprzednie on-demand calculation dla representative dry/lake/river/ford positions,
2. chunk unload/reload nie może zachować stale river gameplay data,
3. movement collision/water traversal result pozostaje niezmieniony,
4. jeśli conditional cadence zostanie zaimplementowane: high-priority branches pozostają immediate,
5. jeśli conditional cadence zostanie zaimplementowane: accumulated movement pozostaje deterministic i bounded.

Uruchomić normalne typecheck/tests/build wymagane przez repozytorium.

### Browser/manual — tylko User

**LLM/agent nie wykonuje browser verification ani browser benchmarku.**

User sprawdza:

- `?benchmark=stream` i porównanie z benchmarkiem 020,
- animals nadal avoid/enter water zgodnie z species capabilities,
- swimming/wading/drowning pozostają poprawne,
- animals przekraczają river banks/fords poprawnie,
- brak nowych stuck movement przy houses/rocks/caves,
- wildlife i livestock nadal poruszają się ciągle podczas normalnej gry,
- brak fauna spikes porównywalnych z baseline `FAUNA ≈ 1068 ms` albo, jeśli nadal występują, nowa diagnostyka wskazuje konkretnego właściciela.

## Implementation order

1. Phase A — bounded hot-path attribution.
2. Phase B — cache per-chunk gameplay river segments.
3. Automated tests/typecheck/build.
4. Przygotować wynik do ręcznego benchmarku; **nie uruchamiać przeglądarki**.
5. User wykonuje Phase C browser benchmark.
6. Dopiero na podstawie wyniku zdecydować osobno o Phase D/E/F.
7. Zaktualizować implementation notes i relevant state docs, jeśli runtime architecture się zmieniła.

## Success criteria

Podstawowy plan jest kompletny, gdy:

- `sampleLocalWater()` nie rekonstruuje river channel segments per movement query,
- `riverChannelSegmentsNear calls from gameplay sample path = 0`,
- water semantics pozostają niezmienione,
- chunk lifecycle posiada cały derived river gameplay state,
- nie powstaje fauna-specific parallel water/collision mechanism,
- automated verification przechodzi,
- zmiany D/E/F nie są wykonywane bez danych z benchmarku po Phase B.

Browser performance outcome nie jest warunkiem, który LLM sam weryfikuje — ręczny benchmark i gameplay verification należą wyłącznie do Usera.

## Implementation instruction

Przed implementacją przeczytaj:

- `CLAUDE.md`
- `docs/STATE.md`
- `docs/state/fauna.md`
- `docs/state/water.md`
- `docs/plans/README.md`
- ten plan
- `docs/plans/implementation-notes/fauna-033-animal-movement-hot-path-performance-implementation-notes.md`

Dodaj/aktualizuj JSDoc dla ważnych architectural/public functions, gdy ownership lub lifecycle nie są oczywiste; użyj `@domain` gdzie pomaga preflight discovery.

Nie uruchamiaj `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**