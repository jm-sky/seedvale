# Plan: AnimalAgent importance/cadence — ograniczenie częstotliwości drogiej pracy

**Created:** 2026-09-14
**Status:** `verification needed` 🔍 (implemented 2026-09-14 — browser benchmark comparison still pending; see implementation notes)
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `fauna`
**Type:** `optimization`
**Subdomains:** `lifecycle` `predation` `habitat`
**Tags:** `performance` `cadence` `presentation` `behaviour` `telemetry`
**Roadmap:** -
**Model:** Opus, Sonnet

## Cel

Obniżyć CPU wspólnego `AnimalAgent` (dziś ~20 ms/frame: wild fauna ~14.2 ms + livestock ~6.7 ms) przez **ograniczenie częstotliwości wykonywania istniejącej pracy**, bez przebudowy AI, movement, pathfinding ani spatial queries.

To nie jest nowy scheduler ani nowy system symulacji. To jedna wspólna polityka importance/cadence konsumowana wewnątrz jedynego `AnimalAgent.update()`, którego używają zarówno `createFauna.ts` (wild) jak i `settlement/livestock.ts` (livestock).

## Pomiar wyjściowy (2026-09-14, benchmark 018 + sesja usera)

```text
FAUNA (28 agentów):            livestock (13.3 zwierząt):
  agent updates 14.2 ms          animal updates 6.7 ms
  sensing       0.1 ms           sensing        0.1 ms
  targeting     0.0 ms           targeting      0.0 ms
  decision      0.1 ms           decision       0.0 ms
  behaviour     6.0 ms           behaviour      3.2 ms
  life/present. 7.4 ms           life/present.  3.2 ms
  other         0.4 ms           other          0.2 ms

high-priority fauna:   ~0.2/frame
expensive behaviour:  ~27.8/frame
```

### Wniosek reconu

Największy bezpieczny win daje **kombinacja**: throttling `behaviour` **i** rozdzielenie/throttling presentation. Uzasadnienie:

1. `behaviour` i `life/presentation` są niemal równe (6.0 vs 7.4 ms wild, 3.2 vs 3.2 livestock). Throttling tylko jednego z nich zostawia połowę kosztu.
2. `sensing` + `targeting` + `decision` to razem **0.2 ms** — throttling ich nic nie daje, a ich pełna częstotliwość jest tym, co pozwala bezpiecznie throttlować resztę (branch jest znany co klatkę).
3. Koszt `behaviour` to praktycznie wyłącznie **movement**: `steerToward()` → `stepWithSlopeAndCollision()` → `sampleSlope` (kilka `sampleHeight`) + do 3× `isWalkable()` (`sampleLocalWater` + `collidersNear`). Potwierdzenie: `nearest scans` to 523 sprawdzonych kandydatów/frame w sumie — mikrosekundy, nie milisekundy. Czyli throttling samych "search" nie pomoże; trzeba ograniczyć częstotliwość kroków ruchu.
4. `tickPresentationAndLife()` faktycznie **miesza gameplay i rendering** — timery/needs/maturity/production/drowning obok `AnimationMixer.update()`, `labelController.sync()` i observer-distance visual sync. Rozdzielenie jest warunkiem koniecznym dla pkt 1.

## Zakres V1

### Pliki / symbole

| Plik | Zmiana |
|---|---|
| `src/fauna/animalUpdateCadence.ts` **(nowy)** | Czysta, Three.js-free polityka importance/cadence + deterministyczny phase hash. Bez stanu, bez rejestru agentów. |
| `src/fauna/AnimalAgent.ts` | Rozbicie `tickPresentationAndLife()` na trzy sekcje; bramka cadence w `update()`; dwa akumulatory; `driveMounted()` woła wszystkie trzy sekcje bezwarunkowo. |
| `src/perf/agentCpuDiag.ts` | Minimalne liczniki wykonań (behaviour / presentation / full-rate / reduced-cadence) dla obu kanałów (fauna + livestock). |
| `src/fauna/animalUpdateCadence.test.ts` **(nowy)** | Testy czystej polityki. |
| `src/fauna/AnimalAgent.test.ts` | Testy integracyjne cadence. |

**Ownership stanu:** akumulatory (`behaviourAccumSec`, `presentationAccumSec`) są prywatnym stanem `AnimalAgent` — tak jak `wanderTimer`, `sourceSearchCooldown`, `humanDecisionTimer`. Nic nie trzyma rejestru agentów, nic nie jest persystowane, nic nie jest współdzielone między agentami. `animalUpdateCadence.ts` jest bezstanowy.

### Podział `AnimalAgent.update()` na sekcje

```text
simulation-critical  → pełna częstotliwość, zawsze
movement-critical    → wykonywane razem z behaviour (funkcja pozycji)
behaviour            → cadence wg importance
presentation-only    → cadence wg importance + odległości do obserwatora
```

**Pełna częstotliwość (bez zmian):**

- corpse/decay tick i `readyToRemove` ścieżka dla martwego agenta,
- `isStrayedAnimalReturned` / `tickNaturalStrayClassification`,
- `attractionClockSec` + `pruneAttractionIgnored`,
- spontaniczna wokalizacja (cooldown + howl),
- `isNight`,
- `senseEnvironment()` (sensing),
- `resolveNpcTarget()` / `resolveGuardTarget()` (targeting),
- `tickScareStimulus()`,
- `refreshThrottledHumanIntent()` / `refreshThrottledNpcIntent()` + `decideFaunaBehaviour()` (decision),
- `threateningHuman` / `onAggro` edge,
- `clampBounds()`,
- **`tickLife()`**: dekrementy timerów (attack/hurt/alert/provoked/sourceSearch/strayReturnRetry/howlPause/vocalizeAlert), `advanceAge()`, `tickProduction()`, `tickWoolProduction()`, `tickDrowning()`, `tickAnimalLife()`.

Decyzja jest liczona **co klatkę**, więc klasyfikacja importance zna aktualny branch — throttlowany agent nigdy nie reaguje z opóźnieniem na wejście w combat/threat/flee.

**Movement-critical (`tickMovementTail()`, uruchamiane dokładnie wtedy, gdy uruchomiono behaviour):**

- `snapY()` (w tym cave `resolveHorizontalIn` + `groundHeightAt`),
- `resolveWaterTraversal()`.

Obie są czystymi funkcjami pozycji, a pozycja zmienia się tylko w sekcji behaviour (plus zewnętrzne `hydrate()`/`collapse()`/konstruktor/stray-start, które już wołają `snapY()` samodzielnie). To nie jest throttling — to przeniesienie do właściwej sekcji. `tickDrowning()`/`swimExertionNow()` czytają `waterMode` z ostatniego rozwiązania, co jest poprawne przy niezmienionej pozycji.

**Presentation-only (`tickPresentation()`):**

- `updateAnim()` (wybór klipu locomotion),
- `labelController.sync()` (paski, nazwa, observation level, opacity, shadow-distance sync),
- `anim.update(dt)` (`AnimationMixer`).

Celowo **nie** trafia tu nic z: hunger/thirst, maturity, production, drowning, death/corpse lifecycle, gameplay timers.

### Polityka importance

`resolveAnimalUpdateImportance()` — jedna wspólna funkcja dla wild fauna i livestock. Różnic parametrycznych per-domena nie ma i nie wprowadzamy.

`immediate` (pełna częstotliwość wszystkiego), gdy **którykolwiek** z warunków:

| Sygnał | Źródło w kodzie |
|---|---|
| high-priority branch: `player-attack/-flee/-flee-prey`, `npc-attack`, `npc-attack-frenzied`, `npc-flee`, `fire-avoid`, `scare-flee`, `dog-guard`, `rabid` | `isFaunaHighPriorityBranch(branch)` |
| zaangażowany w polowanie / groźny dla człowieka / frenzied | `preyTarget !== null`, `threateningHuman`, `frenzied` |
| sprzężony z graczem: prowadzony na lince (w tym zaprzęg do wozu), player-owned (Follow/Stay) | `_leadAttached`, `isPlayerOwned()` |
| committed traversal: trip (woda / stray return / cave route), cave habitat | `trip !== null`, `cave !== undefined` |
| krytyczna traversal wody | `waterMode === 'swimming'` |
| jednorazowa animacja w toku (hurt/attack) | `hurtAnimTimer > 0`, `attackAnimTimer > 0` |
| bezpośrednia bliskość gracza | `sense.playerDistance <= 12` |

Dodatkowo **poza tabelą**: `mounted` zwraca wcześnie z `update()` i jest obsługiwany przez `driveMounted()`, który wykonuje wszystkie trzy sekcje bezwarunkowo, co klatkę. Martwy agent zwraca wcześnie jak dziś.

`active` — `sense.playerDistance <= 36` (`FAUNA_SHADOW_DISTANCE`).
`routine` — wszystko pozostałe.

Odległość do gracza jest **jednym** sygnałem, nigdy jedynym, i nigdy nie decyduje o tym, *czy* symulacja działa — tylko o tym, jak gęsto wykonywane są kroki ruchu i presentation. Widoczność kamery nie jest w ogóle konsultowana.

### Cadence i accumulated time

```text
accum += dt
if (accum >= interval) { dtEff = accum; accum = 0; run(dtEff) }
```

`interval = 0` dla `immediate` → zachowanie identyczne z dzisiejszym.

**Behaviour (`animalBehaviourIntervalSec`)**

| importance | interval |
|---|---|
| `immediate` | 0 s (pełna częstotliwość) |
| `active` | 1/30 s |
| `routine` | 1/12 s |

Guardrail ruchu: interval jest dodatkowo przycinany tak, by `walkSpeedNow() * interval <= MAX_THROTTLED_STEP_M (0.25 m)`. 0.25 m to wyraźnie mniej niż najciaśniejsza tolerancja geometryczna na tej ścieżce (`steerToward()` `dist < 0.4`, `wander()` `arrived(…, 1.2)`, `TRIP_ARRIVAL_RADIUS = 2`, `WATER/FOOD_INTERACTION_RANGE`, `CONTACT_RANGE = 0.8`). Ponieważ cadence jest wyrażona w sekundach, **maksymalny dodatkowy kwant ruchu jest ograniczony przez interval, nie przez frame rate** — przy niskim FPS (`dt >= interval`) bramka przepuszcza każdą klatkę i zachowanie wraca dokładnie do dzisiejszego.

Wszystkie zachowania sprintujące (chase, flee, Follow) są `immediate`, więc guardrail liczy się od `walkSpeed`, nie `sprintSpeed`.

**Presentation (`animalPresentationIntervalSec`)**

| warunek | interval |
|---|---|
| `immediate` | 0 s |
| `observerDistance <= 20` (`LABEL_FADE_NEAR` — etykieta w pełni czytelna) | 0 s |
| `observerDistance <= 36` (`FAUNA_SHADOW_DISTANCE` — rzuca cień, etykieta zanika) | 1/20 s |
| dalej | 1/10 s |

Accumulated `dt` trafia do `AnimationMixer.update()` — to czysty advance czasu odtwarzania klipu, nie fizyka. Efekt to klasyczny animation LOD, nie spowolnienie świata.

**Stagger:** akumulatory są inicjowane deterministycznym phase'em z FNV-1a `animalId` (`animalCadencePhase01`), żeby wszystkie agenty nie flushowały na tej samej klatce i throttling obniżał średnią *bez* wprowadzania nowego spike'u co N klatek. Deterministyczne — bez `Math.random()`.

### Guardrails gameplayowe

1. **`moving`/`sprinting` nie są zerowane w klatce bez behaviour.** Dziś zerowane na starcie `update()`; po zmianie zerowane dopiero bezpośrednio przed uruchomieniem sekcji behaviour. Bez tego throttlowany agent migałby do klipu `idle` i zgłaszał `sprinting: false` do `tickAnimalLife()`.
2. **Accumulated `dt` nie idzie do movement ponad guardrail** — patrz `MAX_THROTTLED_STEP_M`.
3. **Timery, needs, maturity, production, drowning i corpse lifecycle nigdy nie są throttlowane** — pełne `dt` co klatkę, bez akumulacji.
4. **Attack timing** — `attackCooldown` maleje co klatkę; `attack()` osiągalny tylko z branchy `immediate`.
5. **Drowning** — `tickDrowning()` pełną częstotliwością; `swimming` samo w sobie wymusza `immediate`.
6. **One-shot transitions** (hurt/attack/death) — `takeDamage()`/`collapse()` są zewnętrzne i natychmiastowe; trwający one-shot wymusza `immediate`.
7. **`resolveTimeSkip()` bez zmian** — time-skip nadal nie tyka `update()` wcale i aplikuje pominięty okres raz, tą samą ścieżką.
8. **Off-screen animals nadal istnieją i nadal się rozwijają.** Brak `freeze when offscreen`, brak bramki na widoczność kamery, brak rejestru "aktywnych" agentów.

### Telemetria

Do istniejącego `agentCpuDiag` (bez nowego systemu, bez per-agent telemetry):

- `full-rate agents/frame` — `importance === 'immediate'`
- `reduced-cadence agents/frame` — pozostałe
- `behaviour executions/frame` — sekcja behaviour faktycznie uruchomiona
- `presentation executions/frame` — sekcja presentation faktycznie uruchomiona
- `expensive behaviour agents/frame` — **zmiana semantyki**: liczone w momencie faktycznego wykonania, nie klasyfikacji. Przed zmianą klasyfikacja == wykonanie, więc before/after pozostaje bezpośrednio porównywalne.

Liczniki są routowane tym samym mechanizmem właściciela co `addSectionMs` (livestock channel vs fauna channel), więc obie domeny raportują je osobno.

## Non-goals (V1)

Shared spatial grid, refactor pathfindingu, przepisanie decision system, refactor spawnerów, zmiany persystencji, worker migration, globalny scheduler, szeroki rewrite `AnimalAgent`, `LivestockScheduler`/`WildFaunaAdaptiveManager`, osobne update pipelines, cache'owanie `sampleHeight`/`sampleLocalWater`, zmiana jakiejkolwiek reguły AI.

Celowo **nie** throttlujemy: mieszkańców jaskiń (cave habitat → `immediate`), zwierząt player-owned, prowadzonych i zaprzęgniętych, ani niczego w promieniu 12 m od gracza.

## Test strategy

`src/fauna/animalUpdateCadence.test.ts` (czysta polityka):

1. każdy sygnał `immediate` z osobna daje `immediate`,
2. dystans 12/36 wyznacza `active`/`routine`,
3. `immediate` → interval 0 dla behaviour i presentation,
4. guardrail `MAX_THROTTLED_STEP_M` przycina interval dla szybkiego gatunku,
5. `animalCadencePhase01` jest deterministyczne i w `[0,1)`.

`src/fauna/AnimalAgent.test.ts` (integracja, jsdom):

1. combat/threat pozostaje responsywne — zwierzę z aktywnym graczem-drapieżnikiem wykonuje behaviour w każdej małej klatce,
2. bezczynne zwierzę daleko od gracza ma reduced cadence (nie rusza się w każdej małej klatce, ale rusza się po przekroczeniu interwału),
3. gameplay timers zachowują upływ czasu przy małych klatkach (`attackCooldown`),
4. hunger/thirst rosną identycznie niezależnie od tego, czy sekcje były throttlowane,
5. drowning nie jest opóźniony — pływające zwierzę traci HP co klatkę,
6. corpse/death lifecycle zachowuje timing (`timeSinceDeath`, `corpsePhase`),
7. mounted / led / player-owned Follow nie są throttlowane,
8. livestock (`cow` z `ownerHouseId`) używa dokładnie tego samego mechanizmu co wild fauna,
9. widoczność kamery nie wpływa na authority simulation — needs biegną tak samo przy obserwatorze blisko i daleko,
10. istniejące testy fauny nadal przechodzą (wszystkie używają `dt >= 0.2`, więc każda bramka przepuszcza).

## Oczekiwania benchmarkowe

Porównać w browser benchmarku (przed/po):

```text
FAUNA:    agent updates ms/frame, behaviour ms/frame, life/presentation ms/frame
livestock: animal updates ms/frame, behaviour ms/frame, life/presentation ms/frame
adaptive:  expensive behaviour/frame, behaviour executions/frame,
           presentation executions/frame, full-rate vs reduced-cadence agents/frame
```

Oczekiwane: wyraźny spadek `behaviour` i `life/presentation` dla obu domen, `expensive behaviour/frame` znacznie poniżej dzisiejszych ~27.8, `high-priority agents/frame` bez zmian. Brak celu FPS — liczy się CPU `AnimalAgent` i zachowana responsywność high-priority.

## JSDoc

`resolveAnimalUpdateImportance`, `animalBehaviourIntervalSec`, `animalPresentationIntervalSec`, `AnimalAgent.tickLife`, `tickMovementTail`, `tickPresentation` dostają JSDoc z `@domain fauna` — to główne punkty, po których preflight ma odnaleźć tę politykę.
