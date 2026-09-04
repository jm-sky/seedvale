# Plan: Household help and age-based work participation

**Created:** 2026-09-04
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-002~~
**Domain:** `settlements-npcs`
**Subdomains:** `household` `schedules`
**Tags:** `age` `family` `work` `profession`
**Roadmap:** `npc-professions-households-and-age.md`

## Goal

Sprawić, aby istniejący wiek NPC realnie wpływał na udział w pracy oraz dodać mały, spójny vertical slice rodzinnej pomocy przy gospodarstwie domowym.

Primary deliverable tego planu to:

```text
age
↓
work eligibility / work intensity
↓
existing schedule + decision flow
↓
existing profession actions
```

Drugim, celowo małym zakresem jest:

```text
household context
↓
useful family work opportunity
↓
existing decision flow
↓
one existing safe/light action
```

Plan nie tworzy pełnego systemu rodzinnych zadań ani dodatkowych profesji.

Docelowy ownership:

```text
Role
→ what is this NPC's profession?

Age
→ what kind of work can this NPC reasonably perform?

Household context
→ is there useful family work available?

Decision system
→ what does the NPC do now?
```

## Current state

### Age already exists

`FamilyMember.age` jest pełnoprawną, deterministycznie generowaną wartością.

Obecna generacja obejmuje:

- children: `0–17`,
- adults: `18–70`,
- ograniczoną różnicę wieku małżonków,
- sensowną różnicę wieku między rodzicami i dzieckiem.

Nie należy tworzyć drugiego authoritative age state.

### Profession already exists as `Role`

`Role` pozostaje jedynym źródłem prawdy dla podstawowej profesji NPC.

Istniejące profession work loops zostały podłączone przez `settlements-npcs-002`.

Nie tworzyć:

```ts
Profession
HouseholdProfession
SecondaryProfession
ChildProfession
```

### Schedule and decision flow already exist

`SCHEDULE_TEMPLATES` definiuje role-based daily routine.

`effectiveScheduleFor()` nakłada istniejące trait overlays.

`NpcAgent` korzysta z istniejącego:

```text
needs / pressures
↓
decision
↓
strategy / schedule opportunity
↓
PlannedAction
↓
world changes
```

Age nie powinien tworzyć alternatywnej ścieżki AI.

### Household already owns shared family resources

`Household` jest authoritative owner rodzinnych:

- food/items,
- wood,
- water,
- household history.

Household nie powinien dostać własnego schedulera ani task queue.

## Design principles

### 1. Age remains authoritative

Nie zapisywać osobno:

```ts
isChild
isElder
workCapacity
lifeStage
```

Jeżeli potrzebna jest semantyczna klasyfikacja, ma być derived from `age`.

Minimalny model:

```ts
type NpcLifeStage =
  | 'young_child'
  | 'older_child'
  | 'adult'
  | 'elder'
```

Dokładne progi powinny być małe, jawne i przetestowane.

Nie implementować obecnie osobnego `very_old` stage, ponieważ standardowa generacja kończy się na wieku 70.

Kod powinien jednak pozostać łatwy do rozszerzenia przy przyszłym lifecycle/aging.

### 2. Work participation instead of child/elder AI

Age powinien wpływać na możliwość i charakter wykonywania pracy.

Docelowe zachowanie:

```text
young child
→ no profession work
→ normal needs / home / leisure / social / wander

older child
→ no full profession loop
→ occasional safe/light household help only
→ no heavy or dangerous work

adult
→ existing profession behaviour unchanged
→ optional household help when appropriate

elder
→ can still contribute
→ reduced preference or eligibility for heavy work
→ more light work / home / leisure when appropriate
```

Starsze dzieci nie uruchamiają przypisanego `Role` jako normalnego profession loop w ramach tego planu. Ich udział w pracy ogranicza się do jawnie dozwolonych household-help opportunities. Zachowanie dorosłych profession workers pozostaje bez zmian.

Nie implementować dokładnego time-accountingu typu:

```text
child works 35% of day
elder works 80% of day
```

Procenty z roadmapy są design targetem obserwowalnego zachowania, nie stanem symulacji.

### 3. Reuse existing work-intensity semantics

Przed stworzeniem nowej klasyfikacji pracy należy sprawdzić istniejące mechanizmy związane z vigor i heavy work.

Jeżeli obecne `isHeavyWorkKind()` lub pokrewny mechanizm semantycznie wystarcza, należy go wykorzystać.

Nie tworzyć równoległego katalogu:

```ts
AgeWorkIntensity
ChildSafeActionKind
ElderWorkClass
```

tylko dla tego planu.

Jeżeli istniejąca klasyfikacja nie wystarcza, rozszerzyć najmniejszy wspólny mechanizm.

Semantycznie potrzebujemy co najmniej rozróżnienia lekkiej/normalnej pracy od heavy/dangerous, ale nie musi to oznaczać nowego publicznego typu.

Dla elder ograniczenie heavy work może być soft preference albo eligibility rule — należy wybrać rozwiązanie pasujące do istniejącego decision architecture. Nie wolno przez hard block przypadkiem wyłączyć całej profesji starszego Woodcuttera, Minera lub innego NPC, którego podstawowa praca obejmuje ciężkie czynności.

### 4. Preserve existing schedule pipeline

Nie tworzyć:

```text
CHILD_SCHEDULES
ELDER_SCHEDULES
HOUSEHOLD_SCHEDULES
```

Preferowany model:

```text
SCHEDULE_TEMPLATES[role]
↓
trait overlays
↓
existing decision point
↓
age-based work eligibility / priority
```

Age nie musi być literalnym overlayem w `effectiveScheduleFor()`.

Jeżeli prostsze jest sprawdzanie work eligibility przy wyborze action, należy wybrać tę opcję.

Kluczowe wymaganie:

> Jedno źródło schedule i jeden istniejący decision flow.

### 5. Profession identity must not leak through household help

Pomaganie rodzinie nie zmienia `Role`.

Przykład:

```text
parent
Role = farmer
→ normal farmer profession work

spouse
Role = trader
→ normal trader profession work
→ may occasionally help household farm

older child
→ may perform one safe household action
→ does not become farmer
```

Helper wykonujący farmer-related action nie może automatycznie przejąć:

- farmer dialogue identity,
- farmer workplace identity,
- farmer equipment seeding,
- farmer-specific profession metadata,
- farmer role-based schedule,
- profession staffing count.

`Role` nigdy nie jest tymczasowo zmieniany ani emulowany w celu wykonania household help. Helper korzysta z istniejącej akcji bez przejęcia profession identity, profession schedule, equipment seeding ani staffing semantics.

W szczególności nie używać:

```ts
npc.role = householdOwner.role
```

ani równoważnego runtime role reassignment do realizacji pomocy.

### 6. Household help is an opportunity, not an assignment

Household nie przydziela tasków.

Household help pojawia się jako kandydat w istniejącym decision flow tylko wtedy, gdy NPC znajduje się w odpowiednim kontekście czasowym.

Preferowana zasada:

> Household help może być rozważane podczas normalnego work opportunity lub idle opportunity, a nie jako permanentna pressure konkurująca z własną profesją przez całą dobę.

Koncepcyjnie:

```text
NPC state
+ needs
+ schedule
+ age
+ own role
+ household context
↓
decision
↓
own profession work
OR
household help
OR
needs / rest / social / other behaviour
```

Nie wykorzystywać do tego `HelperAssignment`.

`HelperAssignment` pozostaje osobnym mechanizmem pomocy graczowi.

### 7. First household-help slice must stay small

Pierwsza implementacja ma zawierać tylko jeden realny vertical slice.

Preferowany kandydat:

```text
Farmer household
↓
one existing safe/light action
↓
spouse or older child can perform it
↓
same world / Household effect as normal action
```

Podczas implementacji należy wybrać istniejący action, który:

- nie wymaga nowych systemów,
- jest bezpieczny,
- ma realny world/household effect,
- da się wykonać bez podszywania NPC pod `Role = farmer`,
- przechodzi przez ten sam authoritative mutation path co normalne wykonanie tej czynności.

Household-help action ma być side-effect equivalent do normalnego istniejącego action path. Nie tworzyć specjalnej wersji harvest/deposit/production tylko dla dziecka lub małżonka.

Nie implementować od razu kilku rodzajów pracy.

Nie implementować pełnej macierzy:

```text
profession × spouse × child × elder × action
```

### 8. Unsafe work restrictions

Older children nie mogą wykonywać normalnej ciężkiej lub niebezpiecznej pracy zawodowej.

W pierwszej wersji wykluczyć co najmniej:

- hunting,
- combat work,
- heavy mining,
- tree felling,
- inne działania zaklasyfikowane jako heavy/dangerous przez istniejący mechanizm.

Young children nie wykonują żadnego profession work.

Elders mogą nadal pracować, ale heavy work powinno być ograniczone lub mieć wyraźnie niższy priorytet bez wyłączania całego profession loop, jeśli nie istnieje sensowna lżejsza alternatywa.

### 9. Needs and emergencies still win

Age/work participation nie może zmienić istniejącej hierarchii potrzeb i zagrożeń.

Przykładowo:

```text
hunger
thirst
sleep / exhaustion
weather emergency
animal threat
combat / flee
```

muszą nadal przebijać household help.

NPC pomagający rodzinie powinien normalnie przerwać lub porzucić pomoc, jeżeli pojawia się ważniejsza potrzeba albo zagrożenie.

Szczególnie ważne:

> Child household help must never block flee / threat-response behaviour.

### 10. Traits remain relevant

Age nie powinien kasować personality/traits.

Dla dorosłych istniejące `fast_worker`, `night_owl`, `sociable` i inne decision modifiers powinny nadal działać.

Age ogranicza eligibility lub zmienia weight, ale nie zastępuje pozostałych wejść decision systemu.

### 11. Normal adult behaviour must remain unchanged

Najważniejszy regression constraint:

```text
normal adult profession NPC
without household-help opportunity
```

powinien zachowywać się tak samo jak przed planem.

Dotyczy to między innymi:

- Farmer,
- Woodcutter,
- Fisher,
- Miner,
- Hunter,
- Trader,
- Guard,
- Blacksmith.

Plan nie może przypadkiem zmienić istniejących profession loops dla zwykłych dorosłych.

## Household help eligibility

Household help może zostać wybrane tylko wtedy, gdy:

1. NPC jest w life stage pozwalającym na dany rodzaj pracy,
2. bieżący schedule/idle context pozwala rozważyć pracę,
3. nie istnieje ważniejsza need / emergency / threat,
4. household ma realną użyteczną pracę,
5. istnieje kompatybilny existing action,
6. action jest odpowiednio lekki/bezpieczny dla wieku NPC,
7. target jest nadal aktualny przy rozpoczęciu action.

Nie wykonywać globalnych settlement scans ani nowych lookupów po wszystkich mieszkańcach osady przy każdym NPC decision.

Lookup powinien być ograniczony do:

```text
this NPC
↓
own family / household context
↓
nearby / already-known household work context
```

Należy wykorzystać istniejące referencje family/household przekazywane do NPC zamiast wyszukiwać rodzinę ponownie w settlement-wide kolekcjach.

## Occasional participation

Household help ma być okazjonalny, ale nie należy osiągać tego przez:

```ts
if (Math.random() < ...)
```

przy każdym `choose`.

Preferowane są:

- deterministic cooldown,
- bounded opportunity cadence,
- deterministic state-derived weighting,
- istniejący seeded decision mechanism, jeśli taki już pasuje.

Nie dodawać losowania co tick.

## Scope

### In scope

- derived age/life-stage classification,
- age-based profession work eligibility,
- age influence on heavy-work eligibility / priority,
- young-child exclusion from work,
- older-child safe/light household participation instead of a normal profession loop,
- elder heavy-work limitation,
- one Farmer-household help vertical slice,
- reuse istniejących `PlannedAction`,
- reuse istniejących authoritative world/household effects,
- deterministic participation,
- focused tests,
- minimal diagnostics needed to inspect behaviour.

### Out of scope

- dynamic aging,
- birthdays,
- adulthood transition,
- death from old age,
- profession inheritance,
- profession selection,
- apprenticeship,
- profession skills / XP,
- settlement profession staffing,
- profession demand generation,
- household-owned task queues,
- durable work assignments,
- secondary professions,
- runtime role reassignment for household help,
- new profession types,
- new production chains,
- new recipes,
- complete spouse work for every profession,
- complete child helper matrix,
- genealogy changes,
- family generation changes,
- extending generated adult age above 70.

Explicit non-goal:

> Household help does not create a durable work assignment, job membership, apprenticeship, secondary profession, runtime role reassignment, or household-owned task queue.

## Suggested implementation shape

Preferowany podział:

```text
pure age/work rules
↓
small integration with existing NPC decision path
↓
existing profession work
+
one household-help vertical slice
```

Jeżeli age rules są współdzielone lub ich wydzielenie realnie poprawia ownership/preflight, mogą znaleźć się w małym osobnym module. Jeżeli integracja wymaga tylko 1–2 prostych hooków/funkcji, nie tworzyć przedwcześnie frameworka `WorkParticipationSystem` ani podobnej abstrakcji tylko po to, żeby zmniejszyć `NpcAgent.ts`.

Przykładowe odpowiedzialności:

```ts
lifeStageForAge(age)
canPerformWork(age, workKind)
workParticipationModifier(...)
```

Nazwy nie są częścią kontraktu.

Ważne publiczne/architektoniczne funkcje powinny otrzymać JSDoc z ownership i przeznaczeniem; użyć `@domain` tam, gdzie poprawia to preflight/navigation.

## Implementation phases

### Phase 1 — Age participation rules

Dodać minimalne pure rules:

```text
age
↓
life stage
↓
work eligibility
```

Zakres:

- `young_child`,
- `older_child`,
- `adult`,
- `elder`,
- integracja z istniejącym heavy-work semantics,
- focused unit tests.

Nie dotykać jeszcze household help.

### Phase 2 — Profession work integration

Podłączyć age rules do istniejącego profession work decision path.

Rezultat:

```text
young child
→ normal profession loop unavailable

older child
→ normal profession loop unavailable
→ work participation only through explicitly allowed household-help opportunities

adult
→ unchanged existing profession behaviour

elder
→ heavy work reduced or restricted through the smallest rule compatible with the existing profession loop
```

Nie tworzyć dla starszych dzieci alternatywnego profession loop.

Needs/emergency behaviour pozostaje nadrzędny.

### Phase 3 — One household-help vertical slice

Dodać jeden konkretny Farmer-household case.

Przepływ:

```text
household has useful light farm work
+
spouse / older child is available
+
age permits action
+
no stronger need
↓
existing decision flow
↓
existing safe/light action
↓
authoritative normal world / Household mutation path
```

Nie zmieniać ani nie emulować `Role` helpera.

Nie tworzyć helper-specific mutation path.

### Phase 4 — Minimal reusable extraction

Po działającym vertical slice sprawdzić, czy istnieje rzeczywista powtarzalna logika.

Jeżeli tak, wydzielić tylko:

- eligibility,
- opportunity resolution,
- wspólną integrację decision flow.

Nie generalizować obsługi innych profesji bez realnej potrzeby tego planu.

Jeżeli vertical slice nie wymaga nowej wspólnej abstrakcji, pominąć tę fazę.

### Phase 5 — Tests and diagnostics

Dodać focused regression tests i tylko takie diagnostics, które są potrzebne do zrozumienia age/work decision podczas browser verification.

## Tests

Automated tests powinny pokryć co najmniej:

### Age rules

- young child cannot run a profession work loop,
- older child cannot run a normal profession work loop,
- older child can perform the explicitly allowed light household-help action,
- older child cannot perform heavy/dangerous work,
- normal adult retains full profession eligibility,
- elder retains meaningful profession participation,
- elder heavy work is reduced/restricted according to the chosen rule without disabling the entire profession accidentally,
- life-stage boundaries are deterministic.

### Decision integration

- physiological need beats household help,
- threat/flee beats household help,
- existing adult profession work remains reachable,
- age restriction does not create choose/retry oscillation,
- same state produces deterministic participation result.

### Household help

- spouse may help without changing own `Role`,
- older child may execute the chosen safe Farmer action,
- helper does not inherit farmer profession identity,
- helper uses the same authoritative mutation path as the normal action,
- resources are consumed/produced exactly as in the normal action,
- household/world state changes exactly once,
- action cancellation does not duplicate output,
- target revalidation prevents stale work,
- helper participation respects cooldown/cadence if introduced.

## Performance

Nie dodawać:

- new manager,
- per-frame household scans,
- settlement-wide helper search,
- per-NPC scans over all settlement family members at decision time,
- second NPC update loop,
- duplicate household state,
- duplicate age state.

Age classification powinna być O(1).

Household help lookup powinien być bounded do własnego family/household context i wykonywany tylko przy istniejącym decision opportunity.

## Verification

### Automated

Uruchomić odpowiedni zestaw:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

oraz focused tests dla zmienionych modułów.

### Browser/manual

Manual verification przez gracza:

1. znaleźć rodzinę z małym dzieckiem i potwierdzić brak profession work,
2. znaleźć starsze dziecko i potwierdzić możliwość okazjonalnej lekkiej pomocy,
3. potwierdzić, że starsze dziecko nie uruchamia normalnego profession loop i nie podejmuje ciężkiej/niebezpiecznej pracy,
4. potwierdzić, że helper nie zmienia swojej profesji ani profession identity,
5. obserwować zwykłego dorosłego profession NPC i potwierdzić brak regresji,
6. znaleźć starszego NPC i potwierdzić ograniczoną ciężką pracę przy zachowanej aktywności zawodowej,
7. doprowadzić helpera do hunger/thirst i potwierdzić, że potrzeba wygrywa,
8. wywołać nearby threat i potwierdzić natychmiastowy normalny threat response,
9. potwierdzić realną zmianę world/Household po pomocy i brak różnicy w resource accounting względem normalnej akcji,
10. obserwować dłuższy okres i potwierdzić brak oscillation/spamu household help,
11. potwierdzić pełną autonomię bez obecności/interakcji gracza.

## Success criteria

Plan jest ukończony, gdy obserwowalne zachowanie odpowiada:

```text
same settlement / households

young child
→ no profession work

older child
→ occasional safe/light family help only
→ no normal profession loop
→ no heavy/dangerous work

adult professional
→ existing profession loop unchanged
→ may help household when appropriate

elder
→ remains economically/socially active
→ reduced heavy-work participation without accidental profession shutdown
```

oraz:

```text
household help
≠ profession change
≠ assignment system
≠ secondary job
≠ separate AI
≠ special resource mutation path
```

Wszystkie działania przechodzą przez istniejący decision/action architecture i powodują realne konsekwencje świata.

## Follow-ups

### Profession staffing and settlement composition

Osobny plan powinien później obsłużyć:

```text
settlement size
+ population
+ environment/resources
+ economic needs
↓
profession requirements
↓
households + NPC roles
```

Nie implementować tego tutaj.

### NPC lifecycle and profession selection

Osobny plan powinien obsłużyć:

```text
child
↓
older child helping household
↓
adulthood
↓
profession selection
```

Przyszły wybór profesji może korzystać z:

- professions rodziców,
- doświadczenia z household help,
- settlement demand,
- traits/personality,
- resources/workplaces.

Nie implementować:

```ts
child.role = parent.role
```

jako rozwiązania.

### Aging

Dynamiczne starzenie, birthdays, wejście w kolejne etapy życia i śmierć ze starości pozostają osobnym zakresem.

Ten plan jedynie sprawia, że już istniejące `age` staje się aktywnym wejściem do symulacji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
