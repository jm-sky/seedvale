# Plan: Data & State Consistency Architecture Audit

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** ~~193~~ ~~194~~

## Cel

Przeprowadzić focused audit spójności danych i state w Seedvale.

Główne pytania:

> **Kto jest właścicielem danego state?**

> **Co jest authoritative source of truth?**

> **Czy state jest persistent, derived, simulation-runtime, presentation-runtime, configuration czy cache?**

> **Czy state pozostaje spójny po mutation, rebuild, unload/reload i New Game?**

Celem nie jest stworzenie centralnego `GameState` ani ujednolicenie wszystkich mechanizmów state.

Audyt ma wykryć rzeczywiste problemy z:

- ownership,
- source of truth,
- duplicated state,
- stale references,
- derived state,
- cache invalidation,
- rebuild boundaries,
- persistence boundaries,
- cross-system mutation.

---

# 1. State Taxonomy

Każdy istotny state zaklasyfikować do jednej lub więcej kategorii:

```text
A — authoritative domain state
B — persistent state
C — derived state
D — simulation runtime state
E — presentation/runtime state
F — configuration
G — cache
```

Dla każdego przypadku określić, czy występuje więcej niż jedna kategoria i dlaczego.

Nie wymuszać rozdzielenia, jeżeli jedna wartość prawidłowo pełni kilka ról.

---

# 2. State Ownership Map

Zidentyfikować właściciela głównych kategorii state.

Objąć co najmniej:

- player,
- NPC,
- fauna,
- settlements,
- households,
- economy,
- inventory,
- trees,
- crops,
- resources,
- world/chunks,
- quests,
- relationships,
- time,
- world flags,
- traps/containers/temporary world objects.

Dla każdego określić:

```text
state
owner
authoritative source
readers
mutators
persistent?
derived?
runtime-only?
```

Główny cel:

> Jeden koncept powinien mieć jednoznacznego authoritative ownera.

---

# 3. Source of Truth Audit

Dla każdego istotnego state sprawdzić:

```text
authoritative state
      ↓
derived state
      ↓
runtime representation
```

Ustalić:

- gdzie znajduje się source of truth,
- czy istnieje więcej niż jeden authoritative copy,
- czy runtime object przechowuje dane, które powinny należeć do domain state,
- czy persistent representation staje się przypadkowym drugim source of truth,
- czy system A odczytuje inny state niż system B dla tego samego konceptu.

Szczególnie sprawdzić:

- player state,
- NPC state,
- inventory,
- settlement economy,
- fauna,
- trees/crops,
- world resources.

---

# 4. WorldBundle Ownership

Przeanalizować `WorldBundle` jako boundary ownership.

Sprawdzić:

```text
WorldBundle
    ↓
world systems
```

oraz state znajdujący się poza nim:

```text
createApp
individual systems
session/application state
persistent state
```

Ustalić:

- które dane powinny należeć do `WorldBundle`,
- które prawidłowo pozostają poza nim,
- czy systemy posiadają własny state,
- czy `WorldBundle` jest tylko containerem/orchestrator boundary,
- czy jakiś state został przypadkowo przeniesiony do wspólnego kontenera tylko dla wygody.

Nie przenosić automatycznie state do `WorldBundle`.

---

# 5. WorldContext Audit

Przeanalizować `WorldContext` jako przykład read-only/data-only boundary.

Sprawdzić:

- czy dane są rzeczywiście read-only,
- czy accessor pattern jest konsekwentny,
- czy systemy otrzymują właściwe dane,
- czy nie istnieją równoległe adaptery dla tych samych informacji,
- czy mutable system references nie przeciekają przez context,
- czy context pozostaje poprawny podczas system rebuild.

Porównać z innymi podobnymi mechanizmami.

Jeżeli `WorldContext` jest dobrym istniejącym wzorcem, preferować jego wykorzystanie zamiast tworzenia nowego mechanizmu.

---

# 6. Mutable Reference Boundaries

Zidentyfikować przekazywanie:

```text
value
readonly value
mutable object
getter
setter
callback
```

Sprawdzić, czy wybór jest świadomy.

Szczególnie przeanalizować:

- arrays,
- Maps/Sets,
- domain objects,
- inventories,
- entity collections,
- world state,
- runtime state.

Szukamy sytuacji:

```text
owner
  ↓
mutable reference
  ↓
another system
  ↓
unexpected mutation
```

oraz:

```text
owner replaced
  ↓
old reference retained
  ↓
stale state mutation
```

---

# 7. Live Accessor / Closure Audit

Zidentyfikować przypadki, w których system korzysta z:

```text
getState()
getItems()
getTrees()
getCrops()
...
```

zamiast przechowywać snapshot.

Sprawdzić, czy jest to wymagane przez lifecycle/rebuild boundary.

Szczególnie sprawdzić:

- `createApp`,
- `WorldBundle`,
- persistence,
- New Game,
- system reconstruction,
- callbacks/closures.

Szukamy przede wszystkim:

```text
new state
    ↓
old closure
    ↓
stale reference
```

Nie eliminować accessorów tylko dlatego, że istnieją.

---

# 8. Persistent vs Derived State

Dla głównych systemów ustalić:

```text
persistent source
        ↓
derived values
        ↓
runtime state
```

Szczególnie sprawdzić istniejące wzorce takie jak:

```text
XP       → persistent
skill value → derived
active/runtime flags → runtime
```

oraz inventory:

```text
counts / instances / food batches → authoritative
maxWeight → derived
maxSize → configuration
```

Zidentyfikować miejsca, gdzie:

- derived state jest niepotrzebnie przechowywany,
- derived state może stać się stale,
- persistent state jest duplikowany przez runtime,
- runtime state jest przypadkowo traktowany jako persistent.

Nie usuwać derived state, jeżeli cache ma uzasadnienie wydajnościowe — w takim przypadku sprawdzić invalidation.

---

# 9. Cache & Invalidation Audit

Zidentyfikować cache w:

- NPC,
- settlements,
- economy,
- pathfinding,
- terrain,
- resources,
- chunks,
- item capabilities,
- fauna,
- UI/runtime systems.

Dla każdego cache ustalić:

```text
source
cached value
owner
creation
invalidation
rebuild
lifetime
```

Szczególnie szukać:

- cache bez jasnego invalidation,
- cache przetrzymującego stare entity,
- cache przetrzymującego state po rebuild,
- cache serializowanego przypadkowo,
- duplicate cache dla tego samego source.

---

# 10. Cross-System Mutation

Zidentyfikować systemy, które mutują state należący do innych systemów.

Dla każdego przypadku:

```text
state owner
    ↓
mutation caller
    ↓
mutation mechanism
```

Ustalić, czy mutation:

- przechodzi przez public API właściciela,
- bezpośrednio modyfikuje dane,
- jest bezpieczna,
- może ominąć invarianty,
- może pozostawić derived/cache state nieaktualny.

Nie traktować każdego cross-system mutation jako problemu.

Bezpośrednia mutacja może być prawidłowa, jeżeli ownership jest świadomie współdzielony i kontrakt jest jasny.

---

# 11. WorldBundle Rebuild / New Game

Prześledzić lifecycle:

```text
initial creation
    ↓
system replacement / rebuild
    ↓
New Game
    ↓
new world state
```

Sprawdzić, które state:

- zostają,
- są zastępowane,
- są resetowane,
- są pobierane przez accessor,
- mogą zostać przechwycone przez stare closure,
- mogą pozostać w singletonach/cache.

Szczególnie szukać:

```text
old state
   ↓
stale reference
   ↓
new world
```

oraz:

```text
new state
   ↓
old runtime object
```

---

# 12. Streaming / Unload / Reload State

Powiązać audit z `193` i `194`.

Dla persistent/off-screen state sprawdzić:

```text
active
  ↓
unload
  ↓
persistent/derived representation
  ↓
reload
  ↓
runtime reconstruction
```

Ustalić:

- co jest source of truth podczas unload,
- co jest niszczone,
- co zostaje,
- co jest rekonstruowane,
- czy state może zostać zduplikowany,
- czy state może zostać utracony.

Nie powtarzać pełnego audytu lifecycle z `194`; skupić się wyłącznie na **state ownership i data continuity**.

---

# 13. SaveState / Persistence Boundary

Przeanalizować `saveState.ts` i powiązane persistence APIs.

Kluczowe pytanie:

> Czy `SaveState` jest assemblerem state, czy przypadkowym ownerem state?

Oczekiwany model:

```text
system A ─┐
system B ─┤
system C ─┼──→ saveState assembler
system D ─┘          ↓
                  SaveData
                      ↓
                   storage
```

Sprawdzić:

- kto dostarcza dane,
- czy dane są snapshotem czy live reference,
- czy SaveData zawiera tylko persistence state,
- czy derived/runtime state jest przypadkowo zapisywany,
- czy save layer zna zbyt dużo szczegółów implementacyjnych systemów.

Nie przepisywać persistence architecture bez konkretnego findingu.

---

# 14. Serialization Boundary

Sprawdzić granicę:

```text
domain state
      ↓
SaveData
      ↓
serialization
      ↓
storage
      ↓
deserialization
      ↓
domain reconstruction
```

Dla każdego istotnego persisted state ustalić:

- source,
- serialized form,
- reconstruction,
- migration requirements,
- defaults,
- derived fields.

Szczególnie sprawdzić, czy runtime-only state nie trafia do persistence przypadkowo.

---

# 15. State Consistency Scenarios

Dla głównych state przeanalizować trzy scenariusze.

### Mutation consistency

```text
authoritative mutation
        ↓
derived state
        ↓
runtime representation
```

Sprawdzić, czy wszystkie zależności zostają zaktualizowane.

### Rebuild consistency

```text
state
 ↓
WorldBundle/system rebuild
 ↓
same authoritative state?
 ↓
same derived result?
```

### Persistence consistency

```text
state
 ↓
save
 ↓
load
 ↓
reconstruct
 ↓
same logical state?
```

Nie wykonywać pełnego gameplay testu dla każdego przypadku.

Jeżeli analiza code path nie wystarcza, oznaczyć przypadek jako wymagający browser/manual verification.

---

# 16. Entity State Boundary

Połączyć wyniki z audytem `194`.

Dla persistent entities sprawdzić:

```text
entity identity
      ↓
domain state
      ↓
simulation state
      ↓
runtime state
      ↓
render state
```

Ustalić, czy state należący do entity nie jest przypadkowo przechowywany w:

- render object,
- scene graph,
- controller,
- UI,
- cache.

Nie powtarzać pełnego entity lifecycle audit.

---

# 17. State Contract Matrix

Przygotować główny artefakt audytu:

| State | Owner | Source of truth | Persistent | Derived | Simulation runtime | Presentation runtime | Cache | New Game | Rebuild |
|---|---|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

Objąć najważniejsze state, nie każdą lokalną zmienną.

---

# 18. Findings Classification

Każdy finding musi zawierać:

- **Finding**
- **Evidence**
- **Source of truth**
- **Owner**
- **Impact**
- **Priority**
- **Recommendation**

### P0 — Correctness

Może powodować:

- utratę state,
- duplikację authoritative state,
- stale state prowadzący do błędnej symulacji,
- błędną rekonstrukcję.

### P1 — Architectural

Istotny problem ownership/source-of-truth/rebuild boundary.

### P2 — Maintainability

Niejasny kontrakt lub zbędna duplikacja bez obecnego correctness impact.

### P3 — Optional

Cleanup / potencjalne uproszczenie.

---

# 19. Refactor Candidates

Dla każdego rzeczywistego problemu:

| Candidate | Problem | Current owner | Proposed owner/boundary | Evidence | Risk | Effort | Priority |
|---|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... | ... |

Preferować:

- istniejące mechanizmy,
- istniejące ownership,
- minimalne zmiany,
- read-only boundaries,
- accessor patterns tam, gdzie są potrzebne,
- derived state zamiast duplicate mutable state,
- jawne cache invalidation.

---

# 20. Follow-up Decisions

Każdy finding sklasyfikować jako:

```text
fix now
follow-up plan
acceptable
documentation only
```

Jeżeli problem wymaga większego refaktoru, przygotować osobny plan.

Nie implementować dużego refaktoru w ramach audytu.

---

# 21. Performance Boundary

Sprawdzić tylko problemy bezpośrednio związane z architecture state:

- unnecessary copies,
- repeated derivation,
- excessive cache rebuild,
- repeated serialization,
- unnecessary allocations,
- duplicate state synchronization.

Nie wykonywać osobnego performance audit.

Nie optymalizować state tylko dlatego, że jest mutable.

---

# Deliverables

Audyt musi dostarczyć:

1. **State Taxonomy**
2. **State Ownership Map**
3. **Source-of-Truth Map**
4. **WorldBundle Ownership findings**
5. **WorldContext consistency findings**
6. **Mutable Reference findings**
7. **Live Accessor / Closure findings**
8. **Persistent vs Derived State Map**
9. **Cache & Invalidation Map**
10. **Cross-System Mutation findings**
11. **New Game / Rebuild findings**
12. **Streaming / Reload state findings**
13. **SaveState / Persistence Boundary findings**
14. **Serialization Boundary findings**
15. **Entity State Boundary findings**
16. **Mutation / Rebuild / Persistence consistency scenarios**
17. **State Contract Matrix**
18. **Prioritized findings**
19. **Concrete refactor candidates**
20. **Follow-up decisions**

---

# Zakres poza planem

Nie robić:

- centralnego `GameState`,
- Redux/store,
- ECS,
- globalnego state managera,
- przepisywania `WorldBundle`,
- przepisywania `WorldContext`,
- pełnego save/load rewrite,
- pełnego entity lifecycle audit,
- pełnego performance audit,
- mechanicznego rozbijania `NpcAgent`,
- tworzenia nowych abstrakcji bez konkretnego problemu.

Jeżeli audit wykaże potrzebę któregoś z powyższych, opisać ją jako osobny follow-up.

---

# Evidence Standard

Każdy istotny finding musi być oparty na aktualnym codebase.

Evidence powinno wskazywać:

- konkretne pliki,
- symbole,
- execution/data flow,
- rzeczywisty owner,
- rzeczywiste miejsce mutation.

Nie klasyfikować istniejących różnic architektonicznych jako problemu bez wykazania:

```text
duplicate source of truth
stale state
broken ownership
incorrect persistence
broken rebuild
incorrect derived state
```

Dokumentacja jest pomocnicza; aktualny kod pozostaje source of truth.

---

# Verification

Audyt powinien być wykonany przede wszystkim poprzez analizę code paths.

Dla findings dotyczących:

- rebuild,
- streaming,
- persistence,
- runtime reconstruction,

wskazać przypadki, które wymagają późniejszej browser/manual verification.

Nie oznaczać problemu jako rozwiązany bez implementacji i odpowiedniej weryfikacji.

Jeżeli audit ujawni rozbieżność między dokumentacją a implementacją, wskazać ją osobno.

---

# Kryteria akceptacji

- [ ] Główne kategorie state mają określonego ownera.
- [ ] Authoritative source of truth jest określony dla najważniejszych state.
- [ ] State został sklasyfikowany jako persistent / derived / simulation runtime / presentation runtime / configuration / cache.
- [ ] Duplicate authoritative state został zidentyfikowany.
- [ ] Mutable reference boundaries zostały sprawdzone.
- [ ] Live accessor / stale closure risks zostały sprawdzone.
- [ ] WorldBundle ownership został przeanalizowany.
- [ ] WorldContext boundary został przeanalizowany.
- [ ] Derived state i cache mają określone źródło oraz invalidation.
- [ ] Cross-system mutation zostało przeanalizowane.
- [ ] New Game / rebuild boundary został przeanalizowany.
- [ ] Streaming / unload / reload state continuity została przeanalizowana.
- [ ] SaveState pozostaje właściwym persistence assemblerem albo finding wskazuje konkretny problem.
- [ ] Serialization boundaries zostały sprawdzone.
- [ ] Entity state boundary jest spójny z audytem `194`.
- [ ] Mutation / rebuild / persistence scenarios zostały przeanalizowane.
- [ ] Powstała State Contract Matrix.
- [ ] Każdy istotny finding ma evidence i priority.
- [ ] Każdy problem ma decyzję: fix now / follow-up / acceptable / documentation only.
- [ ] Nie utworzono centralnego state managera ani sztucznej abstrakcji.

**Zrób git commit i push do main, rebase jeżeli trzeba**
