# Implementation Notes: NPC Helper Resource Delivery

**Plan:** `docs/plans/2026-08-19--167--npc-helper-resource-delivery.md`
**Reviewed:** 2026-08-25
**Status:** `planned`

## Review summary

Plan 167 nadal ma właściwy kierunek architektoniczny, ale po implementacji `ai-002` i `ai-003` musi być osadzony w aktualnym przepływie decyzji NPC.

Najważniejsza aktualna architektura to:

```text
pressures
 ↓
ai-002 personality / role scoring
 ↓
NeedId
 ↓
ai-003 candidate strategies
 ↓
strategy selection
 ↓
existing PlannedAction / ActionLifecycle
```

Helper delivery powinien wejść w ten przepływ jako **kandydat strategii / sposób realizacji aktywnego celu lub assignmentu**, a nie jako osobny `Need`, `HelperAI`, `HelperAction` albo tryb NPC.

Drugą twardą zależnością pozostaje plan 164: target helpera ma być istniejącym generycznym `Container` ze stabilnym `containerId`, capacity, item transfer i persistence.

`ai-002` jest obecnie technicznie zweryfikowany testami/tsc/lint/build, ale nadal wymaga browser verification. `ai-003` ustanawia jawny candidate-strategy layer i również wymaga browser verification. Implementacja 167 ma używać **aktualnego kodu jako source of truth**, a nie zakładać, że dokumentacja tych planów jest kompletna.

---

## 1. Aktualny decision flow — krytyczna aktualizacja

Nie implementować helpera według starego modelu:

```text
pressure → decision → action
```

Aktualny model jest:

```text
NpcAgent.choose()
    ↓
pressure generation
    ↓
scoreNeedCandidates()
    ↓
NeedId
    ↓
getCandidateStrategies()
    ↓
availability / constraints
    ↓
selectStrategy()
    ↓
existing PlannedAction
```

Plan 167 musi zostać podłączony do tego przepływu.

Nie dodawać:

```ts
if (npc.helper) runHelperAI()
```

ani osobnego branchu omijającego `ai-002`/`ai-003`.

---

## 2. Helper delivery jako candidate strategy

Najważniejsza zmiana względem pierwotnych notes: helper delivery nie powinno być modelowane jako nowy Need tylko dlatego, że NPC ma pomagać graczowi.

Docelowo kandydaci mogą wyglądać koncepcyjnie:

```text
food
 ├─ household food
 ├─ nearbyFood
 ├─ garden
 └─ playerStorageDelivery
```

`playerStorageDelivery` jest generowane tylko przy aktywnym assignment i poprawnym targetcie.

Candidate generation powinien odpowiadać m.in. na:

```text
assignment active?
target exists?
resource available?
container can accept resource?
NPC can perform required action?
```

Niedostępna strategia nie powinna trafiać do selection.

Nie tworzyć osobnego `HelperStrategySelector` ani `HelperAvailabilitySystem`.

---

## 3. Integracja z ai-002

`ai-002` już zapewnia deterministyczne modifiers dla istniejących candidate pressures i rolę/personalność jako preferencję, bez tworzenia niemożliwych działań.

Helper delivery jest potencjalnym pierwszym miejscem, gdzie `agreeableness` może mieć rzeczywiste znaczenie, ale nie należy dodawać specjalnego progu ani osobnego helper scoringu.

Jeżeli helper strategy ma być modyfikowana personality, należy rozszerzyć istniejący modifier/scoring seam:

```text
base candidate
+ existing role modifiers
+ existing personality modifiers
+ contextual constraints
= final candidate score
```

Nie używać personality do pokonania hard constraints.

Nie powielać w 167 logiki `scoreNeedCandidates()`.

---

## 4. Dependency on plan 164

Plan 164 jest hard prerequisite.

Przed implementacją 167 trzeba sprawdzić rzeczywisty kod 164:

- `Container` domain type/API,
- stable `containerId`,
- registry/ownership,
- capacity,
- `ItemSize`,
- item acceptance/transfer,
- stacking,
- persistence,
- world position lookup,
- streaming/rebuild behaviour.

Nie tworzyć tymczasowego `PlayerStorage` API i późniejszej migracji do `Container`.

Helper ma zależeć od finalnego kontraktu 164, a nie od planu jako dokumentacji.

---

## 5. Existing NPC transport seam

Aktualny NPC transport korzysta z istniejących mechanizmów:

- `PlannedAction`,
- `ActionLifecycle`,
- `goTo → execute`,
- `next`,
- action interruption/failure,
- `NpcAgent` temporary `Inventory`.

Plan 156 ustanowił wspólny chain dla m.in.:

```text
wood: chop → deposit
water: well → deposit
ore: mine → deposit
```

Nie tworzyć helper-specific transport.

Docelowo:

```text
selected strategy
 ↓
goTo source
 ↓
gather
 ↓
NPC Inventory
 ↓
goTo Container
 ↓
deposit
 ↓
complete
```

Helper-specific jest target i powód wyboru strategii, nie mechanizm ruchu.

---

## 6. Food ma inną ścieżkę niż ore/wood/water

To nadal najważniejsza rozbieżność runtime.

Obecnie food gathering NPC trafia bezpośrednio do `Household.stock`, podczas gdy transportowane zasoby mogą korzystać z tymczasowego `NpcAgent.Inventory`.

Dlatego nie zakładać, że istniejący food action można po prostu skierować do Container.

Potrzebne jest minimalne rozszerzenie istniejącego domain/action seam:

```text
food source / legitimate surplus
        ↓
NPC Inventory
        ↓
Container
```

Zwykły NPC bez helper assignment nadal powinien korzystać z normalnego household food pipeline.

Nie przenosić całego food gathering na NPC inventory tylko dla wygody implementacji 167.

---

## 7. Food ownership i surplus

`Household` pozostaje właścicielem własnego food stock i jego polityki reserve/capacity.

Nie robić:

```text
available food > 0 → donate all
```

Helper powinien otrzymać tylko ilość, która jest rzeczywiście dostępna do external delivery według istniejącego modelu.

Jeżeli aktualny API nie ma pojęcia surplus, rozszerzyć istniejący domain boundary minimalnie.

Nie wprowadzać drugiego modelu ownership ani magicznych progów w `NpcAgent`.

Invariant transferu:

```text
source + carried + target = previous total
```

Przy każdym failure zasób musi pozostać w dokładnie jednym authoritative location.

---

## 8. Assignment model

Najpierw znaleźć istniejący mechanizm goals/assignments/interactions.

Dopiero jeśli nie da się go użyć, wprowadzić minimalny data-only record, np.:

```text
resource delivery assignment
  targetContainerId
  resourceKind
  enabled
```

`playerId` tylko jeśli wymaga tego aktualny model świata.

Assignment nie jest relationship:

```text
relationship → willingness / social context
assignment  → target + permitted delivery
```

Nie tworzyć:

```text
HelperRelationship
NpcCommandManager
NpcOrderSystem
NpcTaskBoard
```

---

## 9. Stable target reference

Trwała referencja powinna być:

```text
targetContainerId
```

Nigdy:

```text
x/y/z
Object3D
mesh reference
```

Runtime powinien rozwiązać `containerId` do aktualnego domain object/state.

Ruch NPC może nadal dostać snapshot `THREE.Vector3`, zgodnie z aktualnym `PlannedAction` contract.

Rozdzielenie:

```text
domain target = stable ID
movement target = current Vector3 snapshot
```

jest szczególnie ważne przy save/load, rebuild i streaming.

---

## 10. Capacity and atomic transfer

Transfer powinien delegować capacity/`ItemSize`/stacking do implementacji 164.

Preferowany przebieg:

```text
requested quantity
 ↓
container accepts N
 ↓
atomic transfer N
 ↓
remaining quantity stays with NPC
```

Jeżeli `N = 0`, action powinien zakończyć/failować przez istniejący lifecycle.

Nie robić:

```text
while (!containerFull) retry()
```

w helper code.

Przy częściowym transferze nie wolno usuwać całej ilości z NPC inventory.

---

## 11. Interruptions

Critical-need interruption z `NpcAgent` pozostaje authoritative.

Przypadek szczególnie istotny:

```text
gather food
 ↓
NPC carries food
 ↓
critical need
 ↓
existing interrupt
```

Po przerwaniu carried food musi pozostać rozliczone w istniejącym inventory/state.

Nie dodawać helper-specific interrupt/recovery path.

To powinno mieć dedykowany test regresyjny.

---

## 12. Multiple helpers

Nie tworzyć coordinatora.

Przypadek testowy:

```text
Container capacity = 1
helper A carries 1
helper B carries 1
A deposits
B attempts deposit
```

Oczekiwane:

- brak duplikacji,
- brak ujemnej capacity,
- B zachowuje lub bezpiecznie porzuca carried item zgodnie z istniejącym failure semantics,
- następny decision cycle może podjąć kolejną decyzję.

Wykorzystać istniejące reservations/logistics, jeżeli runtime je posiada.

---

## 13. Persistence and rebuild

Assignment i Container persistence pozostają osobnymi stanami:

```text
NPC
 └─ assignment → targetContainerId

Container
 └─ contents
```

Po load/rebuild:

```text
assignment
 ↓
containerId
 ↓
container lookup
 ↓
current target
```

Brak targetu ma prowadzić do bezpiecznego failure/inactivation przez istniejący decision/action flow, a nie do stuck NPC.

Nie tworzyć helper-specific save system.

---

## 14. Water

Food jest vertical slice.

Water można dodać tylko wtedy, gdy aktualny resource/item model pozwala wykorzystać ten sam pipeline:

```text
assignment.resource
 ↓
resource selection
 ↓
gather/collect
 ↓
NPC Inventory
 ↓
Container deposit
```

Jeżeli water nie jest reprezentowane jako kompatybilny item/resource, nie wymuszać nowej abstrakcji tylko dla 167.

---

## 15. Diagnostics

Wykorzystać istniejące diagnostics/trace z `ai-002` i `ai-003`.

Po implementacji powinno być możliwe zobaczenie:

```text
pressure
 ↓
NeedId
 ↓
strategy candidates
   household = unavailable
   nearbyFood = available
   playerStorageDelivery = available
 ↓
selected strategy
 ↓
PlannedAction
```

Nie tworzyć osobnego Helper diagnostics system.

---

## 16. Suggested implementation sequence

1. Zweryfikować rzeczywisty kod planu 164.
2. Przejrzeć aktualny `NpcAgent` decision flow po `ai-002` i `ai-003`.
3. Zidentyfikować istniejący assignment/goal/interactions mechanism.
4. Zidentyfikować candidate strategy seam z `ai-003`.
5. Dodać `playerStorageDelivery` jako minimalną dostępną strategię.
6. Podłączyć target `Container` bez specjalnego helper transport.
7. Rozszerzyć food source → NPC Inventory tylko dla helper delivery.
8. Podłączyć istniejący `goTo → execute → deposit` chain.
9. Dodać capacity/failure/partial-transfer handling.
10. Dodać persistence/rebuild handling.
11. Dodać focused unit/domain tests.
12. Wykonać browser verification.
13. Dopiero po działającym food vertical slice rozważyć water.

Nie refaktoryzować całego `PlannedAction` ani `Strategy` systemu podczas implementacji 167.

---

## 17. Tests

### Strategy / decision

- active assignment generates delivery candidate;
- inactive assignment does not;
- missing target is unavailable;
- unavailable resource is unavailable;
- impossible container transfer is unavailable or fails cleanly;
- personality/role modifiers never bypass hard constraints;
- existing critical needs remain authoritative;
- no permanent helper loop.

### Food transfer

- helper food source uses existing source rules;
- helper uses existing NPC `Inventory`;
- successful deposit increases Container contents;
- failed deposit conserves food;
- partial transfer moves only accepted quantity;
- ordinary NPC household food flow remains unchanged.

### Interruption

- gather;
- carry;
- critical interruption;
- carried food remains accounted for;
- later decision can recover/abandon safely.

### Persistence

- assignment survives save/load;
- `targetContainerId` resolves after rebuild;
- missing target does not leave NPC stuck.

### Multiple helpers

- two helpers can target one Container;
- capacity is never exceeded;
- no duplication/loss.

---

## 18. Browser verification

Test observable state, not only NPC movement:

1. create/place player Container using plan 164;
2. assign an existing NPC as helper;
3. select food delivery;
4. observe normal decision/strategy selection;
5. observe gathering;
6. observe delivery to target;
7. verify Container contents;
8. verify NPC resumes normal activity;
9. fill Container and verify no retry loop;
10. interrupt delivery with a critical need and verify conservation;
11. save/load and verify assignment/target;
12. move far enough away to exercise existing off-screen/streaming behaviour where applicable.

Browser verification must not be claimed until actually performed.

---

## 19. Files / code areas to inspect

Verify paths against current `main` before editing:

- `src/ai/NpcAgent.ts` — decision flow, action FSM, temporary inventory, interruptions;
- `src/ai/decisionModifiers.ts` — `ai-002` scoring seam;
- files introduced/changed by `ai-003` — candidate strategy generation/selection;
- `src/items/Inventory.ts` — existing NPC carrier;
- `src/simulation/types.ts` — `PlannedAction`;
- `src/simulation/actionLifecycle.ts` — lifecycle/failure/completion;
- `src/simulation/actionControl.ts` — interruption;
- `src/simulation/interactionQueue.ts` — only if target interaction needs it;
- `src/settlement/household.ts` — food ownership/reserve/capacity;
- existing resource gathering/deposit code;
- actual plan 164 Container implementation and persistence;
- existing relationship lookup;
- existing NPC assignment/interaction UI;
- SaveData/version/migration code if assignment becomes persistent.

Do not assume new `src/helper/`, `src/logistics/` or `src/companion/` directories are appropriate.

---

## 20. Explicit anti-patterns

Avoid:

- `HelperAI` / `CompanionAI`;
- helper-specific movement;
- helper-specific transport;
- helper-specific inventory;
- helper-specific storage;
- `HelperRelationship`;
- `HelperManager` / `LogisticsManager`;
- duplicated player-only food gathering;
- direct mutation of Three.js storage meshes;
- position-based persistent references;
- helper `while` delivery loops;
- bypassing `PlannedAction` / `ActionLifecycle`;
- bypassing critical-need interruption;
- duplicated `ItemSize`/capacity calculations;
- forcing ordinary NPCs through helper delivery;
- making the NPC leave its household or become Companion;
- GOAP/planner/FSM replacement;
- LLM-driven decisions.

---

## 21. Review conclusion

Plan 167 powinien być małym połączeniem trzech już istniejących mechanizmów:

```text
ai-002
personality / role scoring
        ↓
ai-003
candidate strategies
        ↓
existing NPC action + transport
        ↓
plan 164
Container
```

Najważniejsza różnica względem wcześniejszych notes: **helper delivery nie jest osobnym decision branch**. Jest kolejną dostępną strategią, która musi przejść przez normalne candidate generation, availability i strategy selection.

Food nadal wymaga osobnego mostu, ponieważ zwykłe NPC food gathering trafia do `Household.stock`, a nie do `NpcAgent.Inventory`. Ten most należy wykonać minimalnie i wyłącznie dla delivery path.

Nie należy przy tym tworzyć nowego AI, transportu, inventory, storage ani coordinatora.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
