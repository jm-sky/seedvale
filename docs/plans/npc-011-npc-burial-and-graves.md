# Plan: NPC Burial & Graves

**Created:** 2026-09-01
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** 010
**Domain:** `npc`
**Roadmap:** `npc-professions-households-and-age`  

## Cel

Dodać społeczną reakcję na śmierć NPC oraz możliwość pochówku zmarłego, wykorzystując istniejące mechanizmy households, NPC problems/goals/pressures, decision making, relationships/memory, navigation, interaction destination approach, world objects i istniejące persistence.

Pochówek nie jest player-only questem ani scripted sequence.

Docelowy flow:

```text
NPC death
  ↓
corpse exists
  ↓
relevant NPC becomes aware
  ↓
burial problem / goal, jeśli spełnione są warunki
  ↓
NPC decision
  ↓
burial strategy
  ↓
navigate to corpse
  ↓
bury
  ↓
grave / marker
  ↓
corpse lifecycle zakończony
```

System ma działać niezależnie od gracza i kamery.

## Zakres

### 1. Death awareness

Umożliwić odpowiednim NPC uzyskanie informacji o śmierci.

Preferowana kolejność:
1. household members,
2. osoby posiadające istniejącą relację lub rolę uzasadniającą reakcję,
3. inne NPC tylko jeśli istniejący model informacji/relationships uzasadnia taką reakcję.

Przed implementacją ustalić na podstawie aktualnego codebase, jak NPC obecnie dowiadują się o zmianach świata i wykorzystać ten mechanizm.

Nie tworzyć globalnego „everyone knows about every death” systemu ani nowego event propagation framework tylko dla burial.

### 2. Burial eligibility

Nie każda śmierć musi prowadzić do pochówku.

Corpse może kwalifikować się do burial, jeśli spełnione są odpowiednie warunki, np.:
- corpse nadal istnieje,
- nie został wcześniej buried/removed,
- istnieje relevant NPC mogący podjąć działanie,
- NPC ma powód/pressure wynikający z istniejących relationships/household context,
- burial jest wykonalny w aktualnych warunkach.

Kryteria powinny być deterministyczne i oparte na stanie świata.

Nie tworzyć sztywnej reguły „każdy zmarły musi zostać pochowany”.

### 3. Burial problem

Jeżeli corpse kwalifikuje się do pochówku, odpowiedni NPC może uzyskać problem wymagający rozwiązania:

```text
corpse exists
AND
corpse eligible for burial
AND
burial not completed
→ burial problem
```

Problem nie może być generowany wielokrotnie.

Wykorzystać istniejący problem/goal system zamiast tworzyć `BurialManager`.

### 4. Burial goal

Odpowiedni NPC może otrzymać goal `bury deceased NPC`.

Goal powinien zawierać wyłącznie niezbędny kontekst: deceased NPC/corpse reference, powód działania i wymagania wykonania.

Nie przechowywać redundantnego corpse state. Goal powinien wskazywać na rzeczywisty corpse/world object utworzony przez `npc-010`.

### 5. Decision / responsibility

Nie zakładać, że zawsze najbliższy NPC pochowa zmarłego.

Wybór wykonawcy powinien wykorzystywać istniejący decision system i dostępne dane: household relationship, role, current workload, distance, ability, existing pressures i inne istniejące ograniczenia.

Preferowany przepływ:

```text
state + pressures + traits + relationships + existing goals
→ decision
→ burial strategy
→ actions
```

Nie tworzyć specjalnego hard-coded burial AI. Jeżeli istniejący decision system nie ma odpowiedniego seam'u, dodać tylko minimalne rozszerzenie.

### 6. Burial strategy

Burial powinien być action chain, a nie teleportacją:

```text
select corpse
  ↓
approach destination
  ↓
interact with corpse
  ↓
perform burial
  ↓
create/use grave
```

Wykorzystać istniejący navigation i interaction destination approach. Nie implementować nowego pathfinding ani destination system.

### 7. Interaction and failure recovery

NPC musi rzeczywiście dotrzeć do corpse i wejść z nim w interakcję.

Wykorzystać istniejące mechanizmy navigation, destination approach, interaction targeting oraz cancellation/recovery.

Jeżeli corpse zostanie usunięty, buried przez innego NPC, przetworzony w sposób uniemożliwiający burial lub stanie się niedostępny, goal/action musi zakończyć się bezpiecznie. NPC nie może pozostać w nieskończonym stanie.

Wykorzystać istniejące retry/replanning semantics zamiast tworzyć burial-specific recovery system.

### 8. Coordination

Jeżeli więcej niż jeden NPC może zareagować na ten sam corpse, wykorzystać istniejące mechanizmy goal/action ownership lub coordination.

Wymaganie: jeden corpse → najwyżej jedno aktywne burial execution → jeden grave.

Nie tworzyć globalnego lock managera. Jeżeli istniejące mechanizmy nie wystarczają, dodać minimalny, lokalny claim/reservation seam.

### 9. Burial action

Burial ma powodować rzeczywistą zmianę świata: corpse → buried → grave/marker.

Burial musi być idempotentny. Nie może dojść do podwójnego pochówku, dwóch graves dla jednego corpse ani ponownego wygenerowania grave po reloadzie.

Nie implementować pełnej animacji kopania/grzebania, jeśli wymagane assety nie istnieją. Użyć istniejącej interakcji/action i bezpiecznego fallbacku.

### 10. Grave / marker

Po burial powstaje world object reprezentujący miejsce pochówku.

Minimalny stan powinien obejmować stabilne ID, pozycję oraz referencję do deceased NPC/death record, jeśli istnieje odpowiedni mechanizm.

Grave jest world object, nie częścią aktywnego NPC.

Nie tworzyć osobnego grave database ani globalnego death registry.

### 11. Corpse handoff

`npc-010` pozostaje właścicielem corpse lifecycle.

Burial powinien przejąć corpse przez stabilny kontrakt ustalony w implementation notes/recon, zamiast kopiować jego stan do `011`.

Natural decay z `010` nie może przedwcześnie usunąć corpse podczas aktywnego burial execution.

Jeżeli corpse zostanie prawidłowo usunięty inną ścieżką, burial goal musi zostać anulowany/recomputed.

Nie ustalać przedwcześnie konkretnego API typu `canBeBuried()` / `bury()`; dopasować kontrakt do faktycznej implementacji `010`.

### 12. Household consequences

Po zakończeniu burial household może zachować informację o pochówku poprzez istniejące mechanizmy pamięci/relationships/household state.

Nie implementować pełnego mourning/funeral systemu.

Poza zakresem pozostają grief, mourning, inheritance i household restructuring, chyba że istniejący mechanizm wymaga minimalnej aktualizacji dla spójności.

### 13. Off-screen simulation

Pochówek nie może wymagać obecności gracza.

NPC może wykonać notice death → choose burial → navigate → bury poza aktywnym obszarem gracza, zgodnie z istniejącym hybrid/adaptive simulation.

Nie tworzyć osobnego burial simulation. Jeśli pełne off-screen navigation/action execution nie jest obecnie dostępne, wykorzystać istniejący poziom abstrakcji symulacji i zachować spójne konsekwencje.

### 14. Persistence boundary

Grave jest trwałą zmianą świata i powinien korzystać z istniejącego persistence mechanism dla world objects.

Nie rozszerzać pełnej persistence runtime NPC.

Jeżeli obecna persistence nie obsługuje odpowiedniego world object, dodać minimalny zakres konieczny do zachowania grave, bez tworzenia nowego persistence framework.

Po save/reload nie może dojść do utraty istniejącego grave w zakresie obsługiwanym przez persistence, duplikacji grave, ponownego wykonania burial ani ponownego wygenerowania buried corpse.

## Ownership

```text
HealthState → alive/dead state
npc-010 Death/Corpse → corpse lifecycle
Household / relationships / memory → awareness and social context
NPC decision system → decides whether/who/how
npc-007 interaction approach → reaching corpse
Burial action → world transition
World object system → grave representation
Persistence → existing persistence mechanism
```

Nie tworzyć `BurialManager`, `FuneralManager`, osobnego burial AI, osobnej grave database ani osobnego NPC death state.

## Dependencies

Plan zależy funkcjonalnie od **010 — NPC Death & Corpse Lifecycle**.

Istniejący **007 — Interaction Destination Approach** jest wykorzystywany, ale nie jest osobną zależnością planową.

## Debug

Dodać minimalne diagnostyki: corpse kwalifikujący się do burial, NPC aware of death, active burial problem/goal, selected burial NPC, coordination/claim state jeśli występuje, navigation/approach state, burial completion oraz grave ID/location.

Powinny być wykrywalne przypadki:

```text
corpse exists but no burial goal
goal exists but no executor
executor exists but cannot reach corpse
burial completed but no grave
```

Nie tworzyć osobnego debug frameworka.

## Verification

### Awareness
1. NPC umiera.
2. Relevant household member może dowiedzieć się o śmierci.
3. Awareness/problem nie jest duplikowany.
4. Gracz nie musi być obecny.

### Eligibility
1. Nie każdy corpse automatycznie tworzy burial goal.
2. Eligibility wynika z rzeczywistego stanu świata.
3. Corpse już buried/removed nie tworzy nowego goal.

### Decision
1. Istniejący decision system może wybrać wykonawcę.
2. Relationship/workload/distance/ability są uwzględniane tam, gdzie istnieją.
3. Nie powstaje hard-coded burial AI.

### Navigation
1. NPC otrzymuje destination corpse.
2. Wykorzystuje istniejący approach/navigation flow.
3. NPC nie teleportuje się do corpse.
4. Failure/cancellation kończy się bezpiecznie.
5. Replanning działa zgodnie z istniejącymi zasadami.

### Coordination
1. Dwóch NPC nie wykonuje jednocześnie burial tego samego corpse.
2. Powstaje najwyżej jeden grave.
3. Przejęcie/utrata corpse przez innego NPC kończy lub przelicza goal poprawnie.

### Burial
1. Burial zmienia rzeczywisty stan świata.
2. Corpse zostaje poprawnie przekazany do lifecycle `010`.
3. Powstaje dokładnie jeden grave.
4. NPC wraca do normalnego decision/action lifecycle.
5. Burial nie może wykonać się ponownie.

### Off-screen
1. Burial może zostać wykonany poza aktywnym obszarem gracza.
2. Symulacja nie wymaga kamery.
3. Streaming/rendering nie zmienia stanu burial.

### Persistence
1. Grave jest zachowany przez istniejący persistence mechanism w zakresie jego możliwości.
2. Nie powstaje duplicate grave.
3. Burial nie wykonuje się ponownie po reloadzie.

### Regression
Uruchomić istniejące testy i build.

Nie zmieniać bez potrzeby NPC combat, HealthState, inventory, corpse lifecycle poza wymaganym burial handoff, navigation/pathfinding ani ogólnego decision system.

## Poza zakresem

- combat feedback — `npc-009`,
- NPC death/corpse creation — `npc-010`,
- loot/harvesting — `npc-010`,
- funeral system,
- mourning/grief,
- inheritance,
- household restructuring,
- nowe pathfinding,
- nowe navigation system,
- pełna persistence NPC,
- globalny memory/death registry,
- player-only burial quest,
- teleportowanie NPC do corpse.

## Powiązane plany

- **007 — Interaction Destination Approach**
- **009 — NPC Combat Feedback**
- **010 — NPC Death & Corpse Lifecycle**

**Zrób git commit i push do main, rebase jeżeli trzeba**
