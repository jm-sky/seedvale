# Plan: Simulation Architecture Consistency

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** ~~192~~

## Cel

Przeprowadzić focused audit architektury symulacji Seedvale na podstawie aktualnego codebase i istniejącej dokumentacji architektury.

Celem nie jest jeszcze refactor.

Audit ma ustalić:

- rzeczywistą kolejność wykonywania symulacji,
- kontrakty głównych systemów,
- ownership mutable state,
- granice mutacji świata,
- zależności między systemami,
- zachowanie podczas time skip,
- miejsca, w których `gameLoop.ts` pełni zbyt wiele odpowiedzialności,
- czy istniejące `src/simulation/` stanowi właściwą wspólną warstwę,
- konkretne problemy wymagające późniejszej implementacji.

**Rezultatem ma być mapa aktualnej architektury + priorytetyzowana lista problemów + konkretne propozycje kolejnych zmian.**

Nie implementować dużego refaktoru w ramach tego planu.

---

# 1. Sources of truth

Przed audytem sprawdzić:

- `docs/ARCHITECTURE.md`
- `docs/STATE.md`
- `CLAUDE.md`
- `src/app/gameLoop.ts`
- `src/app/createApp.ts`
- `src/app/worldBundle.ts`
- `src/simulation/`
- główne systemy `src/ai/`
- główne systemy `src/fauna/`
- `src/player/`
- `src/settlement/`
- `src/world/`

Jeżeli dokumentacja różni się od kodu, za prawdę uznać aktualny kod.

Nie przepisywać do wyniku audytu informacji, które są już poprawnie opisane w `docs/ARCHITECTURE.md`, chyba że audit ujawni rozbieżność.

---

# 2. Simulation System Contract Map

Dla każdego głównego systemu określić:

| System | Inputs | Outputs | State owned | State mutated | Time input | Phase |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

Objąć co najmniej:

- World / WorldBundle,
- Day/Night,
- settlements/NPC,
- fauna,
- player,
- interactions,
- combat,
- resources/items,
- crops/trees/timed processes,
- weather,
- time skip.

Nie próbować opisać każdej małej funkcji. Celem jest identyfikacja głównych system boundaries.

---

# 3. Actual Simulation Tick

Prześledzić rzeczywisty runtime flow od `gameLoop.ts`.

Utworzyć rzeczywistą mapę:

```text
input
  ↓
time
  ↓
world updates
  ↓
NPC / settlement simulation
  ↓
fauna simulation
  ↓
player simulation
  ↓
interactions / consequences
  ↓
derived state
  ↓
presentation
```

Powyższy diagram jest tylko hipotezą roboczą. Ustalić faktyczną kolejność z kodu.

Dla każdego etapu zaznaczyć:

- co jest wykonywane,
- jakie dane są czytane,
- jakie dane są mutowane,
- od których wcześniejszych etapów zależy,
- czy kolejność jest wymagana czy przypadkowa.

---

# 4. State Ownership

Zidentyfikować właścicieli najważniejszych mutable state.

Objąć co najmniej:

- NPC,
- fauna,
- player,
- settlements,
- resources,
- inventories/storage,
- world/chunks,
- crops,
- trees,
- weather,
- combat state,
- interactions,
- timed processes,
- lifecycle/death state.

Dla każdego określić:

```text
owner
readers
mutators
lifecycle
source of truth
```

Szczególnie szukać:

- wielu właścicieli tego samego state,
- duplikowanych źródeł prawdy,
- bezpośredniej mutacji cudzego state,
- state przechowywanego w więcej niż jednym systemie,
- state wyliczanego z innego state, ale utrzymywanego osobno bez jasnej potrzeby.

---

# 5. Mutation Boundaries

Dla najważniejszych zmian świata prześledzić rzeczywistą ścieżkę mutacji.

Objąć przykładowo:

- damage / death,
- movement,
- item transfer,
- resource consumption,
- resource production,
- inventory changes,
- crop/tree lifecycle,
- animal lifecycle,
- settlement changes,
- relationship changes.

Dla każdego określić:

```text
request
  ↓
decision/action
  ↓
mutation
  ↓
consequence
```

Ustalić, czy mutation odbywa się:

- bezpośrednio,
- przez owner system,
- przez callback/capability,
- przez queue,
- przez event,
- podczas kolejnego ticka.

Nie wprowadzać event bus tylko dlatego, że istnieją bezpośrednie wywołania.

---

# 6. `gameLoop.ts` Responsibility Map

Przeanalizować aktualne odpowiedzialności `gameLoop.ts`.

Klasyfikować je jako:

- simulation orchestration,
- world simulation,
- NPC orchestration,
- fauna orchestration,
- player updates,
- interaction resolution,
- combat,
- time handling,
- presentation,
- audio,
- UI synchronization,
- lifecycle/persistence.

Dla każdego większego bloku ustalić:

| Responsibility | Current location | Cohesion | Dependency | Candidate |
|---|---|---|---|---|
| ... | ... | ... | ... | keep / extract / follow-up |

Nie traktować rozmiaru pliku jako samodzielnego problemu.

Kandydat do ekstrakcji musi mieć własną spójną odpowiedzialność i wyraźną granicę zależności.

---

# 7. `createApp.ts` and `WorldBundle`

Zweryfikować granice.

### `createApp.ts`

Czy pozostaje composition rootem, czy zawiera runtime gameplay logic, która powinna należeć do innych systemów.

### `WorldBundle`

Zweryfikować:

- ownership,
- lifecycle,
- rebuild behaviour,
- replaceable dependencies,
- callback/capability wiring.

Uwzględnić istniejącą zasadę stabilnej referencji `WorldBundle` podczas rebuildu.

Nie zmieniać poprawnego lifecycle tylko po to, aby uzyskać „czystszą” strukturę.

---

# 8. `src/simulation/` Contract Audit

Przeanalizować istniejące primitives, w szczególności:

- `SimulationEntityRef`,
- `DecisionContext`,
- `PlannedAction`,
- `ActionLifecycle`,
- `InteractionQueue`,
- action/scoring contracts.

Ustalić:

1. które mechanizmy są rzeczywiście wspólne,
2. które są domenowo specyficzne,
3. gdzie istnieją równoległe mechanizmy poza `src/simulation/`,
4. które systemy omijają wspólne contracts,
5. czy `DecisionContext.extras` jest nadal kontrolowanym extension pointem, czy zaczyna pełnić rolę nieformalnego API.

Nie tworzyć wspólnego `Agent` dla NPC/fauna bez konkretnego problemu.

Nie dodawać nowych abstrakcji tylko dla symetrii.

---

# 9. Dependency and Coupling Map

Utworzyć mapę zależności głównych systemów:

```text
system → dependency → reason
```

Szczególnie zidentyfikować:

- circular dependencies,
- wysokie fan-in/fan-out,
- callbacks tworzące ukryte zależności,
- mutable shared state,
- zależności wynikające wyłącznie z orchestration.

Rozróżnić:

- prawidłowe dependency injection,
- świadome capability boundaries,
- niekontrolowany coupling.

---

# 10. Callback / Capability Audit

Przeanalizować callbacki przekazywane między głównymi systemami.

Dla istotnych przypadków określić:

- jaką capability udostępniają,
- kto jest właścicielem danych,
- czy callback jest właściwą granicą,
- czy jest workaroundem dla brakującego API,
- czy tworzy zależność odwrotną do architektonicznego kierunku.

Nie zastępować callbacków automatycznie eventami.

---

# 11. Time Skip Architecture

Powiązać wyniki z planem `192`.

Utworzyć mapę:

```text
normal tick
    ↓
time skip
    ↓
world time
    ↓
catch-up / headless simulation
    ↓
derived state / rebuild
```

Dla głównych systemów określić:

| System | Normal tick | Time skip | Catch-up | Recompute | Notes |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

Objąć:

- NPC,
- fauna,
- player needs,
- settlements,
- crops,
- trees,
- timed processes,
- weather.

Nie zmieniać modelu time skip w ramach tego audytu.

---

# 12. Ordering and Determinism

Sprawdzić, czy kolejność systemów wpływa na wynik symulacji.

Szukamy przede wszystkim:

- read-after-write dependencies,
- write-after-write conflicts,
- mutation podczas iteracji,
- kolejności processing queues,
- randomness zależnej od kolejności,
- systemów korzystających z częściowo zaktualizowanego state.

Każdy przypadek sklasyfikować:

- required ordering,
- intentional ordering,
- accidental ordering,
- unknown.

Nie projektować pełnego deterministic simulation framework.

---

# 13. Duplicate Sources of Truth

Skupić audit na rzeczywistym problemie architektonicznym:

> ten sam koncept jest reprezentowany jako niezależny mutable state w więcej niż jednym miejscu.

Dla każdego znalezionego przypadku określić:

- primary source,
- duplicate state,
- kto go aktualizuje,
- jak może się rozjechać,
- czy duplicate jest uzasadnionym cache,
- rekomendację.

Nie wykonywać ogólnego audytu wszystkich cache'ów.

---

# 14. Performance Boundary

W kontekście istniejącej ścieżki runtime sprawdzić, czy potencjalne granice systemów nie powodują niepotrzebnego kosztu.

Zwrócić uwagę na:

- dodatkowe iteracje entity,
- dodatkowe traversale world state,
- allocation / GC,
- powtarzane spatial queries,
- niepotrzebne kopiowanie danych,
- synchronizację main thread / worker.

Nie wykonywać pełnego performance audit.

Celem jest jedynie wykrycie architektonicznych propozycji, które mogłyby pogorszyć istniejącą ścieżkę symulacji.

---

# 15. Evidence Standard

Każdy istotny finding musi zawierać:

- **Finding** — co znaleziono,
- **Evidence** — konkretne pliki/symbole i rzeczywisty execution flow,
- **Impact** — dlaczego ma to znaczenie,
- **Priority** — P0–P3.

Rekomendacje przedstawiać osobno:

- **Recommendation**
- **Expected benefit**
- **Risk**
- **Effort**

Nie klasyfikować struktury jako problemu wyłącznie dlatego, że różni się od preferowanej architektury.

---

# 16. Problem Classification

Każde znalezione odchylenie sklasyfikować:

### P0 — Correctness

Może powodować błędną symulację, utratę state albo niespójny world state.

### P1 — Architectural

Istotny problem ownership/coupling/ordering, który utrudnia rozwój lub zwiększa ryzyko błędów.

### P2 — Maintainability

Problem strukturalny, ale bez obecnego wpływu na poprawność.

### P3 — Optional

Kosmetyka, preferencja lub potencjalna przyszła poprawa.

Nie proponować zmian P2/P3 jako obowiązkowej części następnego refaktoru.

---

# 17. Refactor Candidates

Na podstawie całego audytu utworzyć listę konkretnych zmian:

| Candidate | Problem | Current boundary | Proposed change | Risk | Priority |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

Preferować:

- istniejące moduły,
- istniejące contracts,
- małe cohesive extraction,
- jawny ownership,
- minimalną liczbę nowych abstractions.

Unikać:

- nowego globalnego `SimulationManager`,
- nowej warstwy tylko dla warstwy,
- event bus jako rozwiązania wszystkich zależności,
- pełnego rewrite `gameLoop.ts`.

---

# 18. Follow-up Architecture

Audit ma zakończyć się decyzją dla każdego problemu:

```text
fix now
follow-up plan
acceptable
```

Jeżeli potrzebny jest większy refactor, przygotować konkretną propozycję następnego planu, zamiast implementować go tutaj.

Przykładowo:

```text
arch--game-loop-simulation-orchestration
arch--simulation-state-ownership
arch--simulation-mutation-boundaries
```

Nazwy są przykładowe — tworzyć tylko plany wynikające z rzeczywistych ustaleń audytu.

---

# Deliverables

Audyt musi dostarczyć:

1. **Simulation System Contract Map**
2. **Actual Simulation Tick Map**
3. **State Ownership Map**
4. **Mutation Boundary Map**
5. **`gameLoop.ts` Responsibility Map**
6. **`createApp.ts` / `WorldBundle` boundary findings**
7. **`src/simulation/` Contract findings**
8. **Dependency / Coupling Map**
9. **Time Skip Execution Map**
10. **Ordering / Determinism findings**
11. **Duplicate Sources of Truth**
12. **Performance boundary findings**
13. **Prioritized Problems: P0–P3**
14. **Concrete Refactor Candidates**
15. **Follow-up plan recommendations**

Najważniejszym rezultatem jest odpowiedź na trzy pytania:

> **Kto posiada state?**

> **Kto może go zmienić?**

> **W którym miejscu simulation tick ta zmiana następuje?**

---

# Zakres poza planem

Nie implementować w ramach tego audytu:

- pełnego rewrite `gameLoop.ts`,
- nowego globalnego `SimulationManager`,
- pełnego ECS,
- event bus jako generalnej warstwy komunikacji,
- wspólnego `Agent` dla NPC/fauna,
- zmiany modelu time skip,
- zmian gameplay balance,
- dużego refaktoru renderingu,
- niepowiązanych optymalizacji.

Jeżeli taki problem zostanie wykryty, opisać go jako osobny follow-up.

---

# Verification

Audit ma być oparty na aktualnym codebase, nie na założeniach z dokumentacji.

Po ewentualnych zmianach pomocniczych wykonać standardową weryfikację projektu zgodnie z `CLAUDE.md`.

Jeżeli audit ujawni problem wymagający implementacji, nie oznaczać go jako rozwiązany — utworzyć odpowiedni follow-up plan.

Jeżeli audit ujawni rozbieżność między `docs/ARCHITECTURE.md` a kodem, wskazać ją i przygotować propozycję aktualizacji dokumentacji.

---

# Kryteria akceptacji

- [ ] Rzeczywisty simulation tick jest udokumentowany.
- [ ] Główne systemy mają określony contract: input/output/state/time/phase.
- [ ] Najważniejszy mutable state ma jednoznacznego ownera.
- [ ] Najważniejsze mutation boundaries są znane.
- [ ] `gameLoop.ts` ma rozpisane cohesive responsibilities.
- [ ] `createApp.ts` ma potwierdzoną granicę composition root.
- [ ] `WorldBundle` ma potwierdzony ownership/lifecycle boundary.
- [ ] `src/simulation/` ma określoną rzeczywistą rolę.
- [ ] Główne zależności i coupling points są udokumentowane.
- [ ] Time skip ma rzeczywisty execution map.
- [ ] Ordering/determinism risks są sklasyfikowane.
- [ ] Duplicate sources of truth są zidentyfikowane.
- [ ] Performance boundaries zostały sprawdzone.
- [ ] Problemy mają priorytety P0–P3.
- [ ] Każdy problem ma decyzję: fix now / follow-up / acceptable.
- [ ] Powstała lista konkretnych refactor candidates.
- [ ] Nie wykonano dużego refaktoru bez osobnej decyzji.
- [ ] Ewentualne kolejne plany wynikają bezpośrednio z ustaleń audytu.

**Zrób git commit i push do main, rebase jeżeli trzeba**
