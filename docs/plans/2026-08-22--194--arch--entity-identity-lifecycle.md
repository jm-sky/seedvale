# Plan: Entity Identity & Lifecycle Architecture

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** ~~193~~

## Cel

Przeprowadzić focused audit architektury identity i lifecycle encji w Seedvale.

Głównym pytaniem jest:

> Czy każda istotna encja ma jasno określoną relację między persistent world state, simulation entity oraz runtime/render representation?

Nie zakładać, że wszystkie encje powinny korzystać z jednego lifecycle modelu.

Różne modele są dopuszczalne, jeżeli odpowiadają domenie:

```text
NPC        → persistent living entity
Fauna      → living → dead → corpse → remains → removed
Crop       → lazy time-derived lifecycle
Tree       → procedural state + persistent overrides
Item       → inventory/world lifecycle
Projectile → short-lived runtime entity
```

Celem audytu jest wykrycie niespójności ownership, identity, reconstruction, persistence i disposal — nie ujednolicanie modeli dla samego ujednolicania.

---

# 1. Entity Taxonomy

Zidentyfikować główne typy encji występujące w aktualnym codebase.

Objąć co najmniej:

- NPC,
- fauna,
- player,
- settlements / households,
- trees,
- crops,
- world resources,
- inventory items,
- dropped/world items,
- projectiles,
- corpses/remains,
- traps / temporary world objects,
- inne istotne persistent lub runtime entities odkryte podczas reconu.

Dla każdego określić:

```text
entity type
persistent?
simulated?
rendered?
streamed?
reconstructable?
lifecycle model
identity model
```

Nie analizować każdej klasy osobno, jeżeli kilka klas korzysta z tego samego mechanizmu.

---

# 2. World Existence vs Runtime Existence

Ustalić relację między warstwami:

```text
World truth
    ↓
Persistent / derived state
    ↓
Simulation entity
    ↓
Runtime representation
    ↓
Render representation
```

Dla każdego głównego entity type odpowiedzieć:

- które warstwy muszą istnieć jednocześnie,
- które mogą istnieć niezależnie,
- które mogą zostać zniszczone i odtworzone,
- która warstwa jest authoritative,
- jak następuje przejście między warstwami.

To jest główna oś audytu.

---

# 3. Identity Model

Dla każdego istotnego entity type ustalić:

- czy posiada stable identity,
- gdzie identity jest generowane,
- kto jest właścicielem identity,
- czy identity przetrwa streaming,
- czy identity przetrwa save/load,
- czy reconstruction tworzy ten sam byt,
- czy runtime object ma osobne identity,
- czy istnieją identity lokalne tylko dla runtime.

Szczególnie sprawdzić:

```text
persistent entity ID
        ↓
simulation identity
        ↓
runtime object
        ↓
render object
```

Nie zakładać, że wszystkie warstwy muszą mieć ten sam ID.

---

# 4. Persistent State → Runtime Entity

Dla każdego ważnego entity type określić przepływ:

```text
persistent/world state
        ↓
spawn / hydration
        ↓
simulation entity
        ↓
runtime representation
        ↓
render representation
```

Odpowiedzieć:

- gdzie powstaje runtime entity,
- z jakiego state,
- kto je rejestruje,
- kto je aktualizuje,
- kto odpowiada za jego usunięcie,
- co dzieje się z persistent state po usunięciu runtime object.

Szczególnie sprawdzić world streaming.

---

# 5. Runtime → Persistent State

Prześledzić odwrotny kierunek:

```text
runtime mutation
        ↓
simulation state
        ↓
persistent/world state
```

Zidentyfikować:

- które runtime mutations są zapisywane,
- które są tylko transient,
- gdzie następuje synchronizacja,
- czy istnieją dwa źródła prawdy,
- czy runtime object może zawierać state, który powinien należeć do world/simulation state.

Szczególną uwagę zwrócić na:

- NPC,
- fauna,
- trees,
- crops,
- items,
- corpses/remains.

---

# 6. Lifecycle State Machines

Nie próbować stworzyć wspólnej state machine.

Zamiast tego dla każdego głównego modelu udokumentować rzeczywisty lifecycle.

Przykładowo:

```text
created
  ↓
active
  ↓
inactive / dead / completed
  ↓
persistent consequence
  ↓
removed
```

Dla każdego systemu ustalić rzeczywiste stany i transition owners.

Objąć szczególnie:

- animal lifecycle,
- corpse/remains,
- NPC lifecycle,
- tree lifecycle,
- crop lifecycle,
- item lifecycle,
- projectile lifecycle,
- temporary world objects.

---

# 7. Lifecycle Transition Ownership

Dla każdej ważnej transition ustalić:

```text
current state
  ↓
trigger
  ↓
transition owner
  ↓
new state
  ↓
consequences
```

Przykłady:

- animal → dead,
- corpse → bones,
- corpse → removed,
- tree → chopped,
- crop → mature,
- item → picked up,
- projectile → expired,
- NPC → removed.

Szukamy sytuacji, w której:

- wiele systemów może wykonać tę samą transition,
- transition owner jest niejasny,
- runtime representation zmienia lifecycle state samodzielnie,
- presentation powoduje simulation transition.

---

# 8. Streaming Lifecycle

Rozróżnić:

```text
world existence
      ↓
simulation existence
      ↓
runtime existence
      ↓
render existence
```

Sprawdzić dla głównych encji:

- co dzieje się podczas chunk unload,
- co dzieje się podczas chunk load,
- które encje pozostają persistent poza runtime,
- które są rekonstruowane,
- które są całkowicie disposable,
- czy unload może przypadkowo oznaczyć entity jako dead/removed,
- czy reload może utworzyć duplikat entity.

Szczególnie sprawdzić fauna, NPC, resources, trees i crops.

---

# 9. Time Skip / Off-Screen Lifecycle

Powiązać lifecycle z planami `192` i `193`.

Dla każdej istotnej encji ustalić:

| Entity | Normal simulation | Off-screen | Time skip | Re-entry |
|---|---|---|---|---|
| NPC | ... | ... | ... | ... |
| Animal | ... | ... | ... | ... |
| Tree | ... | ... | ... | ... |
| Crop | ... | ... | ... | ... |
| Item | ... | ... | ... | ... |

Sprawdzić, czy lifecycle może postępować bez runtime representation.

Szczególnie zweryfikować zasadę:

> brak render object / brak obserwatora nie może zatrzymać simulation truth.

---

# 10. Lazy vs Active Lifecycle

Zidentyfikować, które lifecycle są:

- actively simulated,
- lazily derived,
- event-driven,
- timer-driven,
- reconstructed from world state.

Porównać mechanizmy używane przez:

- crops,
- trees,
- fauna,
- NPC,
- temporary objects.

Nie wymuszać jednego modelu.

Celem jest ustalenie, czy wybór modelu jest świadomy i czy zachowuje continuity świata.

---

# 11. Persistence / Reconstruction Consistency

Dla encji, które mogą zostać odtworzone, sprawdzić:

```text
create
→ mutate
→ unload
→ persist
→ reload
→ reconstruct
```

Ustalić, czy po reconstruction zachowane są wszystkie wymagane informacje:

- identity,
- lifecycle state,
- ownership,
- position,
- relevant timers,
- relationships,
- inventory,
- resource state,
- consequences.

Szczególnie szukać informacji, które istnieją tylko w runtime object i mogą zostać utracone.

---

# 12. Lifecycle Continuity Scenarios

Dla każdego persistent entity przeanalizować co najmniej dwa scenariusze.

### Reload continuity

```text
CREATE
  → SIMULATE
  → MUTATE
  → UNLOAD
  → RELOAD
  → RECONSTRUCT
  → CONTINUE SIMULATION
```

Sprawdzić:

- identity,
- state,
- lifecycle,
- relationships/consequences,
- timers/time-derived state,
- runtime reconstruction.

### Off-screen continuity

```text
CREATE
  → SIMULATE OFF-SCREEN
  → PLAYER RETURNS
  → RECONSTRUCT
```

Sprawdzić, czy świat zachowuje continuity mimo braku runtime/render representation.

Nie wykonywać pełnego gameplay testu dla każdego entity; chodzi o prześledzenie rzeczywistych code paths i wskazanie przypadków wymagających późniejszej browser verification.

---

# 13. Render / Simulation Separation

Sprawdzić, czy render representation jest poprawnie traktowana jako presentation layer.

Przykłady:

```text
corpse FX
animal mesh
NPC mesh
tree mesh
crop mesh
projectile mesh
```

Zweryfikować:

- czy render object może istnieć bez simulation entity,
- czy simulation entity może istnieć bez render object,
- kto tworzy render object,
- kto go usuwa,
- czy dispose render resources jest oddzielone od lifecycle simulation.

Fauna corpse lifecycle jest istotnym punktem porównania: lifecycle state powinien postępować niezależnie od distance-gated presentation/FX.

---

# 14. Disposal & Resource Lifecycle

Oddzielić:

```text
entity removed
runtime object removed
scene object detached
GPU resources disposed
```

Sprawdzić, czy te operacje są prawidłowo rozdzielone.

Objąć:

- Three.js objects,
- geometries,
- materials,
- textures,
- animation resources,
- temporary FX,
- labels,
- collision objects,
- event/callback registrations.

Szczególnie szukać:

- memory leaks,
- stale references,
- duplicate runtime objects,
- disposed resources nadal używanych przez active entities.

Nie wykonywać pełnego render-performance audit.

---

# 15. Duplicate Lifecycle Mechanisms

Zidentyfikować przypadki, w których ten sam koncept ma więcej niż jeden mechanizm lifecycle.

Przykłady:

```text
timer
+
world timestamp

runtime flag
+
persistent state

dispose()
+
remove()

death state
+
removed flag
```

Dla każdego przypadku określić:

- primary source of truth,
- duplicate mechanism,
- powód istnienia,
- ryzyko divergence,
- czy duplicate jest uzasadniony.

---

# 16. Cross-System Consequences

Sprawdzić, czy lifecycle transition prawidłowo aktualizuje istniejący authoritative state i czy wymagane konsekwencje nie zostają pominięte.

Przykłady:

```text
animal death
→ corpse
→ resources
→ ecosystem state
```

```text
tree chopped
→ resource
→ world resource state
→ regeneration
```

```text
NPC death/removal
→ household
→ relationships
→ settlement state
```

Nie projektować nowego globalnego event system ani nowego mechanizmu propagacji.

---

# 17. Entity Contract Map

Na podstawie audytu przygotować tabelę:

| Entity | Identity | Persistent state | Runtime state | Lifecycle owner | Streamed | Time-skip | Render |
|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... |

To powinien być główny artefakt audytu.

---

# 18. Evidence Standard

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

Nie klasyfikować różnicy między lifecycle models jako problemu wyłącznie dlatego, że modele nie są identyczne.

---

# 19. Problem Classification

### P0 — Correctness

Może prowadzić do:

- utraty entity,
- duplikacji entity,
- utraty persistent state,
- niespójnego lifecycle,
- błędnej symulacji.

### P1 — Architectural

Istotny problem identity/ownership/reconstruction/lifecycle boundary.

### P2 — Maintainability

Problem strukturalny bez obecnego wpływu na poprawność.

### P3 — Optional

Potencjalna poprawa lub cleanup.

---

# 20. Performance Boundary

Sprawdzić, czy lifecycle architecture nie powoduje niepotrzebnych kosztów:

- recreate/destroy churn,
- repeated hydration,
- repeated world scans,
- allocations podczas lifecycle transitions,
- duplicate registration,
- stale runtime entities.

Nie wykonywać pełnego performance audit.

---

# 21. Refactor Candidates

Na podstawie findings przygotować:

| Candidate | Problem | Evidence | Proposed boundary | Risk | Effort | Priority |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

Preferować:

- istniejące mechanizmy,
- minimalne zmiany,
- jawny ownership,
- zachowanie istniejących lifecycle models,
- brak nowych globalnych abstrakcji.

---

# 22. Follow-up Decisions

Każdy problem sklasyfikować jako:

```text
fix now
follow-up plan
acceptable
```

Jeżeli wymagany jest większy refactor, przygotować osobny plan.

Nie implementować dużego refaktoru w ramach audytu.

---

# Deliverables

Audyt musi dostarczyć:

1. **Entity Taxonomy**
2. **World Existence vs Runtime Existence Map**
3. **Identity Model Map**
4. **Persistent State → Runtime Map**
5. **Runtime → Persistent Map**
6. **Lifecycle State Maps**
7. **Lifecycle Transition Ownership Map**
8. **Streaming Lifecycle Map**
9. **Time Skip / Off-Screen Lifecycle Map**
10. **Lazy vs Active Lifecycle Map**
11. **Persistence / Reconstruction findings**
12. **Lifecycle Continuity Scenario findings**
13. **Render / Simulation boundary findings**
14. **Disposal / Resource Lifecycle findings**
15. **Duplicate Lifecycle Mechanisms**
16. **Cross-System Consequence findings**
17. **Entity Contract Map**
18. **Prioritized P0–P3 findings**
19. **Concrete Refactor Candidates**
20. **Follow-up plan recommendations**

Najważniejsze pytanie audytu:

> **Czy po dowolnej kombinacji create → simulate → unload → persist → reload → reconstruct → continue simulation świat nadal reprezentuje ten sam logiczny byt i jego konsekwencje?**

---

# Zakres poza planem

Nie robić:

- wspólnego `EntityLifecycle` dla wszystkich encji,
- wspólnej bazowej klasy `Entity`,
- ECS,
- globalnego lifecycle managera,
- globalnego event bus,
- rewrite NPC/fauna lifecycle,
- zmiany gameplay lifecycle,
- pełnego save/load rewrite,
- pełnego render-performance audit.

Jeżeli audit wykaże potrzebę któregoś z powyższych, opisać ją jako osobny follow-up.

---

# Verification

Audit oprzeć na aktualnym codebase.

Dokumentacja jest pomocnicza; kod pozostaje source of truth.

Po ewentualnych zmianach pomocniczych wykonać standardową weryfikację zgodnie z `CLAUDE.md`.

Nie oznaczać finding jako rozwiązany bez implementacji i odpowiedniej weryfikacji.

Jeżeli audit ujawni rozbieżność z `docs/ARCHITECTURE.md`, wskazać ją osobno i przygotować propozycję aktualizacji dokumentacji.

---

# Kryteria akceptacji

- [ ] Główne entity types mają określony lifecycle model.
- [ ] Identity model jest określony dla persistent entities.
- [ ] Relacja world truth → persistent/derived state → simulation entity → runtime/render representation jest udokumentowana.
- [ ] Lifecycle transition owners są określeni.
- [ ] Streaming lifecycle jest udokumentowany.
- [ ] Off-screen/time-skip lifecycle jest udokumentowany.
- [ ] Lazy vs active lifecycle jest świadomie sklasyfikowany.
- [ ] Reconstruction nie traci wymaganych persistent state.
- [ ] Reload continuity scenario został przeanalizowany.
- [ ] Off-screen continuity scenario został przeanalizowany.
- [ ] Render lifecycle jest oddzielony od simulation lifecycle.
- [ ] Disposal/resource lifecycle jest rozdzielony od entity removal.
- [ ] Duplicate lifecycle mechanisms są zidentyfikowane.
- [ ] Cross-system lifecycle consequences są sprawdzone bez projektowania nowego event system.
- [ ] Performance boundaries zostały sprawdzone.
- [ ] Każdy finding ma evidence i priority.
- [ ] Każdy problem ma decyzję: fix now / follow-up / acceptable.
- [ ] Powstała lista konkretnych refactor candidates.
- [ ] Nie wprowadzono sztucznego wspólnego lifecycle frameworku.

**Zrób git commit i push do main, rebase jeżeli trzeba**
