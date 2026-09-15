# Plan: Wildlife habitat pressure assessment

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** S
**Model:** Composer, Sonnet
**Depends on:** ~~fauna-010~~, ~~fauna-028~~
**Domain:** `fauna`
**Subdomains:** `habitat` `population` `predation`
**Tags:** `pressure` `habitat` `performance` `quests`
**Roadmap:** `quests-hunters-brotherhood.md`

## Goal

Dodać mały, read-only mechanizm oceny kondycji konkretnego habitat/spawnera dzikiej fauny na podstawie **rzeczywistego stanu świata**, tak aby questy, NPC Hunterzy i przyszłe systemy settlement mogły pytać np.:

- czy lokalna populacja jest osłabiona,
- czy ostatnia śmiertelność jest wysoka,
- czy w pobliżu występuje silna presja drapieżników,
- czy dostępność naturalnego pożywienia jest niska,
- jaki problem jest obecnie dominujący.

Mechanizm ma być tani, lazy/on-demand i nie może tworzyć drugiej symulacji ekosystemu ani wykonywać pracy w tle bez konsumenta.

Pierwszym konsumentem będzie Hunters Brotherhood Akt II/III, ale kontrakt ma pozostać domenowy i quest-agnostic.

## Why

Roadmap Hunters Brotherhood zakłada, że próba łowiecka wynika z realnej sytuacji fauny zamiast authored losowania typu „tym razem są wilki”. Aktualny kod ma już większość potrzebnych źródeł prawdy:

- `PreySpawner` posiada stabilne `id`, `kind`, `state`, `maxPreyCount`, `deathsThisCycle` i lifecycle depletion/recovery;
- live `AnimalAgent` daje aktualną obecność zwierząt i drapieżników;
- `GrassForageService` posiada authoritative dostępność/depletion naturalnego forage;
- habitat/spawner pozostaje właścicielem population lifecycle;
- quest runtime potrafi później tylko obserwować wynik przez injected/read-only seam.

Brakuje jednej wspólnej, semantycznej odpowiedzi „jaka presja działa na ten habitat?”. Bez niej każdy quest/NPC musiałby osobno interpretować population/deaths/predators/food, co prowadziłoby do duplikacji reguł i ryzyka powstania quest-only world state.

## Performance baseline and constraints

Ostatni benchmark `docs/performance/results/2026-09-14--017--benchmark-stream-agent.md` pokazał, że fauna jest jednym z głównych CPU bottlenecków, ale koszt siedzi przede wszystkim w `AnimalAgent` movement/presentation. W tym samym benchmarku koszt `spawners/forage/cleanup/...` był mały względem agent updates.

`fauna-028` dodatkowo potwierdził, że zwykłe bounded candidate scans są tanie, podczas gdy kosztowne są powtarzane terrain/water/collider queries wykonywane przez movement i presentation.

Dlatego ten plan ma twarde ograniczenia:

1. **Zero per-frame pressure tick.** Nie dodawać `update()`/schedulera, który liczy pressure dla wszystkich habitatów.
2. **Zero `for each habitat × for each animal` na każdej klatce.** Snapshot powstaje wyłącznie na żądanie konsumenta.
3. **Maksymalnie jedno liniowe przejście po aktualnych live wild agents dla jednego uncached requestu.** Nie wykonywać osobnych pełnych scanów dla population i predators.
4. **Food assessment jest cacheowany.** `GrassForageService.queryNear()` może pośrednio wykonywać terrain suitability sampling; nie wolno odpalać go wielokrotnie na klatkę ani przy każdym odczycie UI/quest logic.
5. Snapshot nie wykonuje pathfindingu, `sampleLocalWater`, collider queries, line-of-sight ani movement simulation.
6. Nie dodawać spatial indexu tylko dla tego feature. Jeżeli w przyszłości fauna dostanie wspólny spatial index z innego powodu, resolver może zacząć z niego korzystać bez zmiany publicznego kontraktu.
7. Mechanizm nie wymaga Web Workera. Koszt jest mały, synchroniczny i silnie związany z live state; komunikacja z workerem byłaby większym narzutem niż sama ocena.

## Scope

### 1. Domain snapshot

Dodać fauna-owned kontrakt, np. w `src/fauna/habitatPressure.ts`:

```ts
export type HabitatPressureKind =
  | 'population-loss'
  | 'mortality'
  | 'predators'
  | 'food-shortage'

export type HabitatPressureSnapshot = {
  habitatId: string
  kind: AnimalKind
  population: {
    live: number
    capacity: number
    ratio: number
    pressure: number
  }
  mortality: {
    deathsThisCycle: number
    threshold: number
    pressure: number
  }
  predators: {
    nearby: number
    pressure: number
  }
  food: {
    available: number
    pressure: number
  }
  condition: 'healthy' | 'strained' | 'critical'
  dominantPressure: HabitatPressureKind | null
}
```

Nazwy i dokładny shape mogą zostać skorygowane podczas implementacji, jeżeli aktualne typy sugerują lepsze dopasowanie, ale kontrakt ma pozostać:

- immutable/read-only dla konsumenta,
- oparty o stabilny `habitatId`/spawner id,
- bez runtime object references,
- bez quest metadata.

Nie dodawać snapshotu do `SaveData`.

### 2. Population pressure

Population signal ma wykorzystywać istniejący `PreySpawner` zamiast nowego licznika populacji.

Źródła:

- `PreySpawner.maxPreyCount` / `effectiveMaxPreyCount(...)`, jeśli odpowiedni helper jest wymagany przez obecny scenario state,
- rzeczywista liczba żywych zwierząt przypisanych do danego `spawnPointId`,
- `PreySpawner.state` jako dodatkowy silny sygnał dla `depleted` / `recovering`.

Nie wprowadzać osobnego persisted `HabitatPopulationState`.

Persistent occupant reserved capacity musi pozostać zgodna z istniejącym capacity contractem; nie liczyć tombstone/reserved slot jako żywego osobnika, ale nie zawyżać logicznej dostępnej capacity względem mechaniki spawnera.

### 3. Mortality pressure

Wykorzystać istniejące:

- `PreySpawner.deathsThisCycle`,
- `depletionThreshold(maxPreyCount)`.

Pressure ma być pure derivation z obecnego lifecycle, bez nowej historii zgonów.

V1 **nie rozróżnia przyczyny śmierci**. Nie dodawać w tym planie `playerHuntingDeaths`, `npcHuntingDeaths`, `predatorKills`, disease history ani generic death ledger tylko po to, aby roadmap mogła powiedzieć „ludzie polowali za dużo”.

W Hunters Brotherhood V1 wysoka mortality może oznaczać „lokalna populacja została mocno przetrzebiona”; dokładne attribution może być osobnym, późniejszym systemem, jeśli pojawi się więcej konsumentów.

### 4. Predator pressure

Dla uncached assessment wykonać jedno przejście po aktualnych live wild agents i podczas tego samego przejścia zebrać:

- population members target habitat,
- nearby live predators.

Predator pressure ma być liczony wyłącznie z realnych drapieżników w bounded promieniu wokół spawnera/habitat center.

V1 nie potrzebuje species-specific weighting. Zwykły count + pure normalization wystarczy, o ile implementacja nie odkryje istniejącego reusable significance/capability helpera, który jednoznacznie pasuje do tej semantyki.

Nie traktować `dangerSignificance` jako automatycznie równoważnego ecosystem predation pressure — to obecnie inna semantyka używana m.in. przez wyjątkowo niebezpieczne osobniki/reputation.

### 5. Food pressure

Naturalne pożywienie dla deer/stag ma korzystać z istniejącego `GrassForageService`, nie z questowego licznika ani statycznego `foodAvailable` na spawnerze.

`GrassForageService.queryNear()` generuje kandydatów i sprawdza terrain suitability, więc assessment musi być bounded i cacheowany.

V1:

- wykonać jeden bounded forage query wokół habitat center podczas odświeżenia food assessment,
- liczyć dostępne kandydaty i znormalizować wynik do pressure,
- nie wykonywać per-animal walkability checks; pressure ocenia zasób habitat-level, nie indywidualną osiągalność każdego patcha,
- nie wywoływać forage query przy każdym odczycie snapshotu, jeśli cache pozostaje świeży.

Dokładny radius powinien wynikać z istniejących habitat/forage constants lub zostać jawnie zdefiniowany jako mały habitat-level zakres; nie używać globalnego world scan.

### 6. Lazy resolver and cache

Rozszerzyć fauna-owned public API o read-only lookup, np.:

```ts
getHabitatPressure(spawnerId: string, nowDays: number): HabitatPressureSnapshot | null
```

Resolver:

```text
consumer requests habitat
→ lookup stable spawner
→ fresh cached snapshot?
    yes → return
    no  → one bounded recomputation
            - one live-agent pass
            - at most one forage query
          → cache
          → return
```

Cache jest runtime-only i należy do `createFauna()`/fauna closure albo małego helpera z takim samym lifecycle. Nie tworzyć osobnego managera.

TTL powinien być wyrażony w world time, nie frame count. V1 może użyć ok. **1 in-game hour** jako krótkiego freshness window, jeśli recon podczas implementacji nie wskaże istniejącej wspólnej cadence constant odpowiedniejszej dla takiego read-modelu.

Nie wymagać event-driven invalidation jako warunku MVP. Krótki TTL daje prostszy i bezpieczniejszy kontrakt bez podpinania wielu mutation call-sites. Jeżeli istniejący death/spawn/depletion seam pozwala tanio invalidować konkretny `spawnerId` bez rozszerzania scope, można to zrobić jako uzupełnienie, ale nie tworzyć nowego event busa.

### 7. Pressure scoring

Scoring ma być pure i testowalny bez Three.js.

Zasady:

- każdy pressure znormalizowany do `0..1`,
- progi `healthy` / `strained` / `critical` zdefiniowane w jednym module,
- `dominantPressure` to najwyższy istotny pressure powyżej minimalnego progu; przy zdrowym habitat może być `null`,
- deterministic tie-breaking — nie używać RNG,
- nie ukrywać całego wyniku za jednym `condition`; konsumenci mają dostęp do składowych.

Nie stroić agresywnie „realistycznej ekologii” w V1. Celem jest spójny reusable signal nad istniejącą symulacją, nie nowy model naukowy.

## Ownership / architecture guardrails

- `PreySpawner` nadal posiada lifecycle population/depletion/recovery.
- `AnimalAgent` nadal posiada live individual state.
- `GrassForageService` nadal posiada forage availability/depletion.
- `HabitatPressureSnapshot` jest **derived read model**, nie nowym authoritative state.
- `Fauna` jest właścicielem lookup/cache, bo łączy własny spawner state + live wild agents z injected forage service.
- Questy/NPC/settlements mogą odczytać snapshot, ale nie zapisują ani nie mutują pressure bezpośrednio.
- Nie tworzyć `HabitatPressureManager`, `EcosystemManager`, event busa ani drugiego population registry.
- Nie rozszerzać `AnimalAgent.update()` o pressure bookkeeping.
- Nie tworzyć quest-specific fields na spawnerze.

## Explicit non-goals

- Human-hunting attribution / historia kto zabił zwierzę.
- NPC hunting pressure history.
- Pełny predator/prey population model.
- Migration pressure / analiza trajectory zwierząt.
- Habitat suitability model zależny od pór roku/pogody.
- Persistent historical pressure timeline.
- Background recomputation wszystkich habitatów.
- Worker offload.
- Spatial index tylko dla snapshotu.
- Quest objectives/dialogue/story implementation Hunters Brotherhood.
- Automatyczne decyzje NPC na podstawie pressure — to przyszły consumer.

## Expected integration points

Zweryfikować podczas implementation notes i implementacji przede wszystkim:

- `src/fauna/AnimalSpawner.ts`
  - `PreySpawner`,
  - `depletionThreshold()`,
  - `effectiveMaxPreyCount(...)` integration path where applicable;
- `src/fauna/createFauna.ts`
  - `spawners`, `agents`, existing `spawnerById`,
  - `Fauna` public API,
  - existing `GrassForageService` injection,
  - existing persistent reserved-capacity handling;
- `src/fauna/AnimalAgent.ts`
  - public live/dead/kind/spawnPoint/position access actually available today;
- `src/world/createGrassForagePatches.ts`
  - `GrassForageService.queryNear()` cost/contract;
- `src/fauna/persistentOccupants.ts`
  - reserved habitat capacity semantics;
- `src/perf/agentCpuDiag.ts` / existing benchmark tooling only if a lightweight counter is genuinely needed for verification; do not grow telemetry speculatively.

Important architectural/public functions/types introduced by this plan should receive concise JSDoc with `@domain fauna` where useful for preflight discovery.

## Verification

Automated verification should cover at least:

1. Pure scoring:
   - full healthy population + low mortality + no predators + sufficient forage → `healthy`, no dominant pressure;
   - depleted/low population → strong population/mortality signal;
   - several nearby predators → predator pressure dominates when other signals are healthy;
   - low forage → food shortage dominates;
   - deterministic tie-breaking.
2. Agent scan:
   - only live relevant population members count,
   - animals from another `spawnPointId` do not inflate population,
   - only live predators inside bounded radius count,
   - dead/removed predators do not count.
3. Cache:
   - repeated reads inside TTL do not repeat forage query,
   - after TTL one recomputation occurs,
   - unknown spawner returns `null` without scanning/querying.
4. Ownership/persistence:
   - snapshot/cache is not serialized,
   - rebuilding/reloading derives a fresh answer from restored spawner/forage/live fauna state.
5. Performance contract:
   - no new per-frame pressure loop,
   - no nested habitat×agent scan in `Fauna.update()`,
   - one uncached single-habitat request performs at most one full live-agent pass and one bounded forage query,
   - ordinary cached reads perform no terrain/water/collider sampling.
6. Run relevant unit tests, typecheck/build/lint according to repository workflow. Browser verification is performed by User, not AI.

## Follow-up enabled by this plan

This plan intentionally stops at the reusable fauna read model. It enables, without coupling to them:

- Hunters Brotherhood hunting-ground investigation,
- competing Brotherhood hunting strategies,
- future Hunter NPC decisions about where/what to hunt,
- settlement warnings/events based on ecosystem condition,
- later addition of new pressure kinds (e.g. attributed human hunting or migration) without changing current authoritative ownership.

> **Zrób git commit i push do main, rebase jeżeli trzeba**