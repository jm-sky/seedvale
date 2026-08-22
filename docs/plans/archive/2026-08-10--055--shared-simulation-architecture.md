# Shared Simulation Architecture

**Status:** `done` ✅

**Progress:** 100% (Phase 1–6; Threat deferred by design to 045; human damage → 056)

## Priority

🔴 `high`

## Effort

XL — większa zmiana / kilka sesji

---

## Cel

Wprowadzić wspólny model wykonywania autonomicznych zachowań świata, tak aby NPC, fauna i w przyszłości inne symulowane encje korzystały z tych samych podstawowych mechanizmów:

```text
State / needs
    ↓
Perception / context
    ↓
Decision
    ↓
Action
    ↓
World effect
    ↓
State change
```

Nie chodzi o stworzenie jednego dużego systemu AI. Celem jest wspólna architektura i kontrakty pomiędzy istniejącymi systemami, przy zachowaniu deterministycznej logiki domenowej i możliwości używania różnych strategii decyzyjnych dla NPC, zwierząt i innych encji.

## Dlaczego teraz

Seedvale ma już kilka działających mechanizmów, ale rozwijają się one równolegle:

- `NpcAgent` posiada potrzeby, FSM i generyczne `goTo` → `execute` / `PlannedAction`.
- Fauna posiada potrzeby hunger/thirst/energy oraz osobne zachowania wander/chase/flee.
- Predator/prey posiada własną logikę zagrożenia, pościgu i obrażeń.
- Player awareness fauny jest osobnym kontekstem reakcji.
- `Health/Stamina` jest już wspólną domeną (`src/shared/`); Threat pozostaje odłożony.
- `WorldBundle` / game loop porządkują zależności; wspólne kontrakty akcji/decyzji żyją w `src/simulation/` (Phase 1–2).

Kolejne funkcje, takie jak głodny predator atakujący człowieka, praca NPC, żerowanie zwierząt, polowanie, odpoczynek czy późniejsza ekonomia będą łatwiejsze do rozwijania, jeśli nie będą tworzyć kolejnych równoległych mechanizmów.

## Zasady architektoniczne

### 1. Nie tworzyć monolitycznego AI

Nie powstaje `UniversalAIManager`, który zna wszystkie encje i wszystkie zachowania.

Zamiast tego wspólne są małe kontrakty i mechanizmy domenowe.

### 2. Potrzeby nie są zachowaniami

`Hunger`, `thirst`, `energy` itp. opisują stan i presję na zachowanie.

Nie powinny bezpośrednio sterować ruchem ani animacją.

### 3. Percepcja dostarcza kontekst

Encja może wiedzieć np.:

- widzę człowieka,
- widzę ofiarę,
- jestem blisko źródła wody,
- jestem w domu,
- jest noc,
- zasób jest dostępny.

Percepcja nie powinna sama wybierać akcji.

### 4. Decision wybiera intencję

Decyzja łączy potrzeby, percepcję, osobowość/cechy, harmonogram i inne czynniki.

Przykład:

```text
hunger high
+ human nearby
+ fear high
→ flee

hunger critical
+ human nearby
+ prey opportunity / low fear
→ attack
```

### 5. Action wykonuje konkretną czynność

Akcja powinna być możliwie generyczna i wielokrotnego użytku:

- `goTo`
- `wait`
- `sleep`
- `eat`
- `drink`
- `work`
- `chop`
- `attack`
- `flee`
- `forage`

Akcja zmienia stan świata dopiero przez istniejące mechanizmy domenowe.

### 6. Rendering nie jest właścicielem symulacji

Model świata i jego stan powinny móc działać bez kamery i bez potrzeby istnienia konkretnych obiektów Three.js.

Rendering ma odzwierciedlać stan symulacji, a nie definiować zachowanie encji.

### 7. Wspólne abstrakcje tylko tam, gdzie istnieje wspólna semantyka

Nie należy na siłę ujednolicać NPC i zwierząt.

Przykładowo wspólne `HealthState` ma sens, ale `NpcSchedule` nie powinien być abstrakcją dla wilka tylko dlatego, że oba mają czasowy cykl zachowania.

---

## Docelowy model

### Simulation entity

Każda autonomiczna encja powinna mieć rozdzielone co najmniej:

```text
Identity
State
Needs
Perception/context
Decision state
Current action
```

Nie oznacza to koniecznie jednego interfejsu zawierającego wszystkie pola. Należy preferować composable/domain-specific types.

### Decision

Decyzja powinna zwracać intencję lub planowaną akcję, a nie bezpośrednio manipulować Three.js.

Przykładowo:

```text
DecisionContext
    ↓
DecisionPolicy
    ↓
PlannedAction
```

Istniejący model `PlannedAction` z NPC należy wykorzystać, jeśli jego semantyka jest wystarczająca, zamiast tworzyć drugi system zadań.

### Action lifecycle

Akcja powinna mieć jasno określony cykl:

```text
idle
 ↓
start
 ↓
update
 ↓
complete / fail / cancel
```

Nie każda akcja musi implementować pełny ciężki obiekt/state machine. Proste akcje mogą pozostać lekkimi strukturami/funkcjami.

### World effects

Efekty powinny być wykonywane przez domenowe systemy świata:

```text
attack → Health
consume food → inventory/resource/need
harvest tree → resource/tree lifecycle
sleep → energy
move → navigation/world position
```

Nie tworzyć osobnych kopii tych mechanizmów dla NPC i fauny.

---

## Perception i scoring

Pierwsza wersja nie powinna tworzyć generalnego GOAP/utility-AI frameworka.

Należy jedynie przygotować miejsce na ocenę kilku możliwych zachowań.

Przykład:

```text
flee      score 0.82
forage    score 0.61
attack    score 0.37
wander    score 0.10
```

To pozwoli później połączyć:

- potrzeby,
- strach,
- agresję,
- osobowość,
- zmęczenie,
- harmonogram,
- relacje,
- sytuację środowiskową.

Wartości i sposób liczenia scoringu powinny pozostać domenowe, a nie być częścią globalnego AI managera.

---

## Integracja z istniejącymi systemami

### NPC

Przenieść istniejący model:

```text
goTo → execute → next
```

w kierunku wspólnego kontraktu akcji, bez zmiany obecnego zachowania.

Schedule/workplace, potrzeby, osobowość i relacje powinny dostarczać kontekstu do decyzji, a nie tworzyć osobne systemy sterowania.

### Fauna

Nie przepisywać obecnego chase/flee.

Rozdzielić stopniowo:

```text
needs
  +
player/prey awareness
  +
threat
  ↓
decision
  ↓
existing movement/combat action
```

Pozwoli to dodać głodnego drapieżnika bez specjalnego wyjątku typu `if hungryWolfAttackHuman`.

### Health / Stamina / Threat

Plan `045` powinien stać się jednym z pierwszych konsumentów wspólnej architektury.

`Threat` powinno być kontekstem decyzji, a nie bezpośrednim sterownikiem FSM.

### Resources / world

Akcje powinny korzystać z istniejących mechanizmów zasobów, zamiast posiadać własne zapisy stanu.

Przykład:

```text
ForageAction
    ↓
resource system
    ↓
consume / collect
    ↓
need + inventory/world state
```

---

## Game loop i scheduling

Wspólna architektura nie oznacza aktualizowania wszystkich encji co klatkę.

Należy rozdzielić:

- rendering/update wizualny,
- wysokoczęstotliwościową symulację ruchu,
- niskoczęstotliwościową ocenę potrzeb i decyzji.

Przykładowo:

```text
60 FPS       rendering / movement interpolation
5–10 Hz      active behavior/action updates
1 Hz         needs / decision reevaluation
```

Dokładne częstotliwości należy dobrać na podstawie istniejącego kodu i pomiarów.

Workerów nie wprowadzać na tym etapie tylko dlatego, że architektura jest współdzielona. Najpierw zachować prosty model na main thread, a kosztowne, niezależne obliczenia przenosić zgodnie z istniejącą dokumentacją performance/workers.

---

## Kolejność implementacji

### Phase 1 — contracts ✅

- zmapować obecne `NpcAgent`, fauna needs, chase/flee i action flow,
- zdefiniować minimalne typy `DecisionContext` i `PlannedAction` / action lifecycle w `src/simulation/`,
- ustalić ownership state,
- nie zmieniać zachowania gry.

### Phase 2 — NPC adapter ✅

- podłączyć istniejące `NpcAgent` do wspólnego kontraktu,
- zachować istniejący schedule, needs i `goTo → execute`,
- usunąć tylko rzeczywistą duplikację.

### Phase 3 — fauna adapter ✅

- podłączyć potrzeby i player/prey awareness fauny,
- wykorzystać istniejące chase/flee jako akcje/zachowania,
- nie przepisywać całego systemu.

### Phase 4 — shared domain systems ✅ (Threat deferred)

- Health/Stamina already shared; **Threat** remains deferred (plan 045 — no consumer framework).
- ujednolicić ownership efektów (callbacks NPC / `HealthState` damage fauny),
- dopracować cancel/fail/complete akcji (`src/simulation/actionControl.ts`),
- event bus nie wprowadzony — nie był potrzebny.

### Phase 5 — decision scoring ✅

- dodać minimalny scoring konkurujących zachowań (`src/simulation/scoreActions.ts`),
- zastosować go najpierw do jednego konkretnego przypadku: predator hunger vs fear (`src/fauna/predatorHumanDecision.ts` + wiring w `AnimalAgent`),
- chase human bez obrażeń gracza (granica damage → plan 056 Phase 6).

### Phase 6 — performance ✅

- decyzja human flee/attack staggered @ 5 Hz (`HUMAN_DECISION_INTERVAL_SEC`); ruch nadal per-frame,
- NPC `choose` już event-driven (tylko po zakończeniu akcji) — bez dodatkowego LOD,
- workerów nie wprowadzano.

---

## Implementation notes (2026-08-11)

### Done — Phase 1–6

| Area | Location |
|------|----------|
| Shared contracts | `src/simulation/types.ts` — `Vec3`, `PlannedAction`, `DecisionContext`, `SimulationEntityRef`, `ActionLifecycle` |
| Lifecycle helpers | `src/simulation/actionLifecycle.ts`, `actionControl.ts` (`replace` / `adopt` / finish) |
| Scoring | `src/simulation/scoreActions.ts` — `pickHighestScore` |
| Barrel | `src/simulation/index.ts` |
| Unit tests | `src/simulation/*.test.ts`, `src/fauna/predatorHumanDecision.test.ts` |
| NPC adapter | `src/ai/NpcAgent.ts` — shared `PlannedAction` + `DecisionContext` + lifecycle |
| Fauna adapter | `src/fauna/AnimalAgent.ts` — `senseEnvironment` → intent/`setIntent` → existing flee/chase/wander |
| Predator hunger vs fear | `src/fauna/predatorHumanDecision.ts` — pure flee/attack scores; hungry predator may `chaseHuman` |

### Ownership

| Concern | Owner |
|---------|-------|
| Needs | `src/ai/Needs.ts` / `src/fauna/AnimalLife.ts` |
| Health / Stamina | `src/shared/HealthState.ts`, `StaminaState.ts` |
| Threat | Deferred — no shared Threat module (plan 045) |
| Perception | Domain modules (`playerAwareness`, fire distance, landmarks) |
| Decision policy | Local to each agent; shared only via `DecisionContext` + `pickHighestScore` |
| Action plan | Shared `PlannedAction` + lifecycle |
| World effects | Existing domain APIs (`onComplete`, `damageHealth` / `harvestWorldTree`) |
| Rendering | Three.js mesh/anim — outside the contract |

### Deliberately deferred / remaining

- Shared **Threat** type/manager (045) — not required for hunger-vs-fear scoring
- Player/NPC **damage** when predator chooses attack (056 Phase 6)
- Scoring for NPC activities / broader fauna intents beyond human flee|attack
- Workers for simulation
- No `UniversalAIManager`, GOAP, or ECS

### Verification

- **Implemented:** Phase 1–6 (Threat excluded by design)
- **Technically verified:** `npx tsc --noEmit`, `npm run lint`, `npm run test` — 2026-08-11
- **Browser / manual:** verified by user 2026-08-11 — hungry-wolf chase vs flee works

### Manual browser check (verified)

1. Spawn near a wolf with low hunger → flee when noticed.
2. (Debug) raise wolf hunger near 1.0, stand at notice edge without panic/fire → may chase instead of flee.
3. Approach a campfire with a hungry wolf nearby → fire fear favors flee.
4. Prey/livestock player-flee and predator–prey chase unchanged.

---

## Poza zakresem

Ten plan nie obejmuje:

- pełnego GOAP,
- behavior tree framework,
- LLM jako kontrolera zachowania,
- ECS migration,
- całkowitego przepisania `NpcAgent`,
- całkowitego przepisania fauny,
- przeniesienia całej symulacji do Web Workera,
- nowego systemu questów/dialogów.

Te mechanizmy mogą później korzystać z architektury, ale nie są wymagane do jej wdrożenia.

---

## Kryteria akceptacji

- NPC i fauna mogą korzystać ze wspólnego kontraktu akcji bez wspólnego monolitycznego AI.
- Potrzeby i percepcja nie wykonują bezpośrednio ruchu/renderingu.
- Decyzja może wybrać pomiędzy co najmniej dwiema konkurującymi akcjami.
- Akcja ma jednoznaczny lifecycle i ownership efektów.
- `Health/Stamina/Threat` może być używane przez różne typy encji.
- Dodanie nowej decyzji, np. `hungry predator → attack human`, nie wymaga tworzenia osobnego systemu AI.
- Existing NPC schedule/workplace i fauna chase/flee zachowują dotychczasowe zachowanie.
- Symulacja nie zależy od istnienia kamery ani konkretnych obiektów Three.js.
- Testy jednostkowe obejmują decyzje i przejścia akcji bez uruchamiania renderera.

## Powiązane plany

- `2026-08-07--020--npc-2-daily-routine-and-place.md`
- `2026-08-07--021--npc-3-animal-life.md`
- `2026-08-07--010--predator-prey-system.md`
- `2026-08-08--045--health-stamina-threat.md`
- `2026-08-10--056--hungry-predator-human-aggression.md`
- `2026-08-10--053--createapp-refactor.md`
- `2026-08-10--054--world-bundle-reference-safety-and-small-refactors.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/performance-and-workers.md`
