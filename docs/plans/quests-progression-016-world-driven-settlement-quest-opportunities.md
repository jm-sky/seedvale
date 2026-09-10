# Plan: World-driven settlement quest opportunities

**Created:** 2026-09-10  
**Status:** `verification needed` 🔍  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** ~~quests-progression-015~~  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `settlements` `fauna` `world`  
**Tags:** `world-driven` `settlement-opportunities` `emergent-quests`  
**Roadmap:** `quests-and-reputation.md`  
**Implemented at:** 2026-09-10 15:25

## Cel

Dodać wspólny mechanizm, który eksponuje rzeczywiste problemy świata jako quest opportunities w proceduralnych osadach.

Quest ma wynikać z authoritative world state, a nie tworzyć problem wyłącznie dlatego, że gracz potrzebuje zadania.

Docelowy przepływ:

```text
real world state
→ problem detected
→ lightweight quest opportunity
→ selected/offered opportunity
→ normal QuestDef
→ existing QuestManager
→ player/world actions
→ authoritative world state changes
```

System ma wykorzystać istniejący quest runtime. Nie tworzyć drugiego quest engine.

## Główna zasada

```text
quest observes the problem
quest does not own the problem
```

Jeżeli gospodarstwu brakuje jedzenia, źródłem prawdy jest household/economy state.

Jeżeli wilki zagrażają osadzie, źródłem prawdy jest fauna/world state.

Jeżeli struktura jest uszkodzona, źródłem prawdy jest structure condition.

Quest tylko:

- wykrywa sytuację,
- udostępnia ją jako opportunity,
- materializuje normalny `QuestDef` dopiero gdy opportunity ma zostać wystawione,
- śledzi rezultat przez istniejący quest runtime,
- przyznaje odpowiedni quest outcome.

## Scope V1

Plan obejmuje:

1. wspólny world-driven opportunity contract,
2. stable opportunity identity,
3. selection / availability lifecycle,
4. materialization `opportunity → QuestDef`,
5. integration z istniejącym `QuestManager`,
6. external-resolution semantics,
7. persistence/reconstruction active generated questów,
8. co najmniej jeden pełny vertical slice oparty o rzeczywisty authoritative world state.

Docelowe scenario families dla tego mechanizmu to:

- Głód w gospodarstwie,
- Wilki pod osadą,
- Zaginione zwierzę,
- Naprawa ważnej struktury.

Nie jest wymagane wdrożenie wszystkich czterech w tym planie, jeżeli recon pokaże, że któreś wymaga brakującej mechaniki domenowej. Takie braki należy wydzielić jako osobny plan/dependency zamiast implementować quest-only workaround.

## Architecture

### Opportunity layer

Wprowadzić małą warstwę pomiędzy symulacją a `QuestManager`:

```text
Settlement / world systems
        │
        ├─ household problem lookup
        ├─ fauna threat lookup
        ├─ livestock problem lookup
        └─ structure condition lookup
                 │
                 v
        SettlementQuestOpportunity[]
                 │
                 v
           selection/filter
                 │
                 v
        selected opportunity
                 │
                 v
              QuestDef
                 │
                 v
            QuestManager
```

Warstwa nie przejmuje ownership żadnego domain state.

### Opportunity contract

Wprowadzić minimalny data-only contract reprezentujący wykrytą sytuację.

Preferowany kierunek:

```ts
type SettlementQuestOpportunity = {
  id: string
  settlementId: string
  kind: WorldQuestOpportunityKind
  sourceRefs: ...
  priority: number
}
```

Dokładny shape ustalić na podstawie aktualnych typów repo.

Opportunity powinno być lekkim rekordem. Nie każda wykryta sytuacja musi od razu materializować pełny `QuestDef`.

### Guardrail

Opportunity nie powinno zawierać:

- `NpcAgent`,
- `Settlement`,
- `AnimalAgent`,
- Three.js objects,
- runtime manager references,
- snapshotów authoritative resources,
- callbacków typu `buildQuest()`.

Materializacja powinna być osobną funkcją:

```text
opportunity
+ current materialization context
→ QuestDef
```

## Lifecycle

World-driven quest wymaga dwóch różnych lifecycle.

### 1. Opportunity lifecycle

Zanim gracz zaakceptuje quest:

```text
problem exists
→ opportunity exists
→ selected opportunity can be offered
```

Jeżeli problem zniknie:

```text
problem resolved by simulation
→ opportunity disappears
```

Nie pozostawiać nieaktualnej oferty.

### 2. Active quest lifecycle

Po zaakceptowaniu questa świat nadal działa niezależnie.

Możliwa sytuacja:

```text
player accepts quest
→ NPC/world resolves source problem
→ quest must react
```

V1 powinno mapować taki przypadek na istniejące lifecycle states, bez dodawania nowego generic quest-state framework.

#### Source problem solved by player

```text
complete / ready_to_report
```

Normalna nagroda i consequences.

#### Source problem solved independently

Jeżeli wkład gracza nie spełnił objective:

```text
invalidated
```

lub istniejący równoważny terminal path.

Nie przyznawać automatycznie pełnej nagrody.

#### Source problem still exists but target disappeared / became invalid

Użyć istniejącej semantyki:

```text
failed
or
invalidated
```

zależnie od konkretnego scenariusza.

Nie dodawać nowego stanu, jeśli obecny lifecycle wystarcza.

## Opportunity generation

### Nie generować przy wejściu gracza

Opportunity nie może zależeć od:

- wejścia kamery do settlement,
- otwarcia dialogu,
- podejścia gracza do NPC,
- render range.

Świat istnieje bez gracza.

### Refresh frequency

Nie skanować problemów every frame.

Preferować istniejący settlement/simulation lifecycle.

Opportunity refresh powinien następować:

- po relevant domain-state change,
- albo na niskiej częstotliwości simulation update,
- albo przy settlement-level checkpoint,
- albo po zakończeniu/wygaśnięciu opportunity.

Wybrać najbliższy istniejący mechanizm po reconie.

Nie tworzyć nowego globalnego per-frame managera.

## Selection

Nie materializować wszystkich wykrytych problemów jako jednocześnie dostępnych questów.

Wprowadzić mały konfigurowalny limit opportunities per settlement. Konkretna wartość nie jest gameplay contract i powinna być łatwa do zmiany po playtestach.

Poważniejsze realne problemy powinny mieć pierwszeństwo. Priority powinno być wyprowadzane z realnego problem state.

Nie dodawać osobnej abstrakcyjnej „quest urgency simulation”, jeżeli domain state już dostarcza wystarczające sygnały.

## Stable opportunity identity

Ten sam problem nie może tworzyć nowego questa przy każdym refreshu.

Opportunity potrzebuje stabilnego ID.

Preferowany kierunek:

```text
settlementId
+ opportunity kind
+ stable source identity
+ optional problem occurrence identity
```

Przykłady:

```text
household:<householdId>:food-shortage
structure:<structureId>:repair
animal:<animalId>:missing
```

Dla problemów, które mogą wielokrotnie zanikać i wracać, zweryfikować czy potrzebny jest occurrence/epoch component.

Nie używać losowego runtime UUID jako jedynej identity.

## Persistence

### Quest progress

Pozostaje własnością istniejącego `QuestManager`.

Nie tworzyć:

```text
WorldQuestProgressStore
SettlementQuestProgressRegistry
```

### Opportunity state

Preferować deterministic reconstruction z authoritative world state dla nieaktywnych opportunities.

Persistować wyłącznie dane, których nie da się bezpiecznie odtworzyć, np.:

- cooldown ponownego wystawienia tego samego problemu,
- problem occurrence/epoch,
- minimalna historia zapobiegająca immediate repeats.

### Active generated quests

Po acceptance nie zakładać, że pełny `QuestDef` zawsze można bezpiecznie zrekonstruować tylko z aktualnego world state, ponieważ problem może się zmienić lub zniknąć.

Active generated quest musi mieć stabilny zestaw materialization inputs albo deterministycznie rekonstruowalne persisted source refs wystarczające do odtworzenia tej samej definicji po save/load.

Save/load nie może:

- zmienić givera,
- zmienić targetów,
- zmienić objective parameters,
- przelosować wariantu questa,
- zmienić treści wynikającej z wybranego wariantu.

Nie tworzyć drugiego runtime progress store.

## Scenario candidates

Poniższe scenarios są docelowymi konsumentami wspólnego opportunity mechanism. Ich implementacja w 016 zależy od tego, czy aktualny kod posiada odpowiednie authoritative seams.

### Wilki pod osadą

Preferowany pierwszy vertical slice, jeśli recon potwierdzi istniejący tani i stabilny settlement-level lub source-level predator predicate.

Możliwe źródła:

- konkretne wilki aktywne w pobliżu settlement,
- wolf den wpływający na settlement,
- istniejąca fauna pressure/habitat state.

Nie wymyślać nowego `settlementWolfThreat` ani nowej threat simulation tylko dla questa.

Jeżeli obecna fauna nie dostarcza odpowiedniego predicate bez nowej domenowej mechaniki, nie rozszerzać 016 o nowy threat system. Wybrać inny najbliższy gotowy problem source jako pierwszy vertical slice, a brakującą mechanikę wydzielić do osobnego planu w domenie `fauna`.

Quest nie spawnuje przeciwników. Musi obserwować realne fauna entities/state.

### Naprawa ważnej struktury

Wykorzystać istniejący structure condition/repair foundation tylko dla typów struktur, które rzeczywiście posiadają:

- stable identity,
- condition state,
- player-accessible repair path.

Nie zakładać, że wszystkie settlement buildings wspierają generic repair.

Jeżeli wymagany typ struktury potrzebuje nowej pełnej maintenance/repair mechaniki domenowej, wydzielić ją jako osobny plan/dependency zamiast dodawać quest-only repair path.

### Głód w gospodarstwie

Wykorzystać realny household food state.

Przed implementacją zweryfikować:

- authoritative household stock owner,
- istniejący shortage predicate,
- player → household/storage transfer path,
- item/resource representation,
- settlement economy integration.

Docelowo:

```text
player provides real food
→ food enters authoritative household/economy state
→ shortage state changes
→ quest observes resolution
```

Jeżeli nie istnieje bezpieczny shared transfer mechanism, brak należy wydzielić jako osobny plan/dependency w odpowiedniej domenie. Nie dodawać quest-only transfer path.

### Zaginione zwierzę

Wykorzystać realne livestock i istniejący `find_animal` objective, ale tylko jeśli domena posiada authoritative predicate stwierdzający, że konkretne zwierzę jest faktycznie missing/lost.

Preferowany minimalny kierunek:

```text
domestic animal
+
outside expected home/roaming area
+
not intentionally assigned elsewhere
→ missing/lost opportunity
```

Jeżeli taki predicate nie istnieje:

- nie wybierać losowego livestock i nazywać go zagubionym,
- nie tworzyć quest-only lost flag,
- wydzielić brakującą mechanikę do osobnego planu w domenie `fauna`.

## Shared source adapters

Każdy domain powinien być wystawiony przez mały wąski lookup/snapshot contract.

Wzorem jest istniejąca integracja rat infestation:

```text
authoritative settlement state
→ narrow quest-facing lookup
→ quest integration
```

Preferować małe kontrakty dopasowane do realnego kodu, zamiast przekazywać całe managery do quest layer.

## Giver selection

Każde materializowane opportunity potrzebuje realnego NPC, który przedstawia problem.

Po `quests-progression-015` giver musi używać stable NPC identity.

Selection powinien preferować NPC logicznie powiązanego z problemem, jeśli istniejący domain state dostarcza taką relację.

Przykładowo:

- household problem → member of affected household,
- livestock problem → owner/member of owning household,
- structure problem → resident/role związany ze strukturą,
- predator problem → istniejący odpowiedni resident/hunter.

Nie dodawać sztucznego „quest giver profession” tylko dla questów.

Jeżeli system nie posiada relacji ownership/role pozwalającej jednoznacznie wybrać idealnego NPC, użyć najprostszego istniejącego deterministic settlement-level fallback.

## Text generation

V1 nie wymaga proceduralnego NLP ani LLM.

Każda family może posiadać authored text templates interpolujące realne dane, np. NPC display name, settlement name, structure label, animal kind/name lub resource amount.

Nie budować generic dialogue templating engine.

## Rewards and consequences

Reuse existing quest reward/consequence paths.

Preferować:

- normal inventory items,
- coins,
- relation,
- reputation,
- renown.

Nie tworzyć osobnego reward model dla generated quests.

## No new domain mechanics guardrail

`quests-progression-016` może:

- dodać opportunity contract,
- dodać narrow lookup/adaptor nad istniejącym authoritative state,
- rozszerzyć istniejący quest materialization/lifecycle seam,
- użyć istniejącego transfer/repair/fauna mechanismu.

Nie powinien tworzyć nowej pełnej mechaniki domenowej tylko po to, aby konkretny quest mógł istnieć.

Jeżeli scenario wymaga np.:

- nowego predator threat simulation,
- authoritative lost-livestock lifecycle,
- nowego household transfer systemu,
- generic settlement building repair systemu,

to brakująca mechanika dostaje osobny plan w odpowiedniej domenie, a 016 dostaje dependency. Nie tworzyć quest-only workaroundów.

## Relevant existing systems

Przed implementacją zweryfikować aktualny kod co najmniej w obszarach:

```text
src/quests/QuestManager.ts
src/quests/quests.ts
src/app/createApp.ts

quest persistence / SaveData

household state
household food/wood/water stock
SettlementEconomy / EconomyRegistry

fauna agents
wolf den / predator behaviour
quest animal resolvers

livestock ownership / home state / roaming
find_animal objective

world structure condition
world repair primitives

settlement lifecycle / streaming
NPC stable identity from quests-progression-015
```

Uwzględnić rat infestation integration jako istniejący przykład narrow authoritative lookup.

Aktualny kod ma pierwszeństwo nad plans/notes.

## Proposed modules

Po reconie dopasować nazwy do aktualnej organizacji repo.

Preferowany mały podział:

```text
src/quests/opportunities/
  settlementQuestOpportunities.ts
  worldQuestOpportunityTypes.ts
  worldQuestMaterialization.ts
```

Scenario-specific source lookups mogą należeć do odpowiednich domain integrations, jeżeli jest to zgodne z aktualną strukturą.

Nie tworzyć dużego:

```text
ProceduralQuestEngine
DynamicQuestManager
WorldProblemManager
QuestConditionDSL
```

## Implementation order

### Phase 1 — foundation

1. Zweryfikować status `quests-progression-015`.
2. Zrobić focused recon existing quest definition/persistence lifecycle.
3. Zdefiniować data-only opportunity contract.
4. Zdefiniować stable opportunity identity.
5. Dodać selection / availability lifecycle bez materializowania wszystkich candidates do pełnych `QuestDef`.
6. Dodać materialization path `selected opportunity → QuestDef`.
7. Wpiąć generated definitions do istniejącego `QuestManager` bez zmiany ownership runtime progress.
8. Dodać stale-opportunity removal przed acceptance.
9. Dodać active-source external-resolution semantics.
10. Rozstrzygnąć i przetestować active generated quest reconstruction po save/load.

### Phase 2 — vertical slice

11. Zrobić focused recon czterech candidate source domains i wybrać najbliższy istniejący authoritative seam.
12. Preferować predator threat, jeśli istniejący fauna state dostarcza tani i stabilny predicate bez nowej mechaniki domenowej.
13. Jeżeli nie, wybrać strukturę, household shortage lub livestock tylko wtedy, gdy posiada gotowy authoritative source i player/world resolution path.
14. Zaimplementować jeden pełny vertical slice obejmujący:
    - appear,
    - selection/offer,
    - acceptance,
    - player resolution,
    - external resolution,
    - disappearance before acceptance,
    - save/load,
    - settlement streaming tam, gdzie relevant.

### Phase 3 — additional integrations where seams already exist

15. Podłączyć kolejne scenario families tylko tam, gdzie recon potwierdzi istniejące wymagane domain seams.
16. Dla brakujących mechanik utworzyć osobne plans/dependencies zamiast rozszerzać 016.
17. Dodać settlement-level availability limit i priority.
18. Dodać minimalny cooldown/occurrence history tylko tam, gdzie potrzebny.
19. Rozszerzyć regression tests.

## Tests

### Opportunity foundation

Pokryć:

- ten sam source problem generuje to samo opportunity ID,
- refresh nie tworzy duplicate,
- source disappearing usuwa niezaakceptowane opportunity,
- candidate nie musi posiadać pełnego `QuestDef`,
- selected opportunity materializuje się do normalnego `QuestDef`,
- `QuestManager` nadal jest jedynym właścicielem quest progress.

### World independence

Pokryć:

```text
problem appears
→ quest offered
→ problem solved without player
→ offer disappears
```

oraz:

```text
problem appears
→ quest accepted
→ problem solved without player
→ existing terminal/invalidation semantics
→ no normal player reward
```

### Active quest persistence

Pokryć:

```text
accept generated quest
→ save
→ world/source state changes or rebuilds
→ load
→ same giver
→ same targets
→ same objective parameters
→ same selected variant
```

Nie dopuszczać reroll/materialization drift po load.

### Vertical slice

Dla wybranego pierwszego scenario pokryć cały lifecycle od real source state do real source resolution.

### Additional scenarios

Dodawać scenario-specific tests tylko dla tych integrations, które faktycznie zostaną zaimplementowane w tym planie.

### Persistence / streaming

Pokryć:

- active generated quest przeżywa save/load,
- source refs pozostają stabilne,
- settlement stream-out nie usuwa quest progress,
- stream-in ponownie rozwiązuje source/giver refs tam, gdzie jest to wymagane,
- persisted data nie zawiera runtime object refs.

## Performance

Opportunity detection powinno być tanie i settlement-scoped.

Preferować:

- istniejące registries,
- cached/current authoritative summaries,
- dirty/event-driven refresh tam, gdzie już istnieje,
- low-frequency evaluation.

Unikać:

- pełnego skanowania wszystkich NPC every frame,
- pełnego skanowania wszystkich animals every frame,
- distance queries przez cały world co tick,
- tworzenia dużej liczby krótkotrwałych obiektów,
- synchronizacji worker/main thread tylko dla questów.

Jeżeli candidate source wymaga kosztownego spatial scan lub nowego globalnego indeksu, potraktować to jako sygnał do reconu istniejącego domain ownership zamiast mechanicznego dokładania kosztu do quest layer.

## Non-goals

Plan nie obejmuje:

- RPG quest matrices,
- `Podejrzany transport`,
- `Sekret starego miejsca`,
- `Umowa między osadami`,
- procedural quest chains,
- generic quest scripting,
- generic condition DSL,
- LLM-generated quests,
- quest-only NPC/world problems,
- pełnego inter-settlement economy,
- witness/gossip system,
- globalnego world event bus stworzonego wyłącznie dla questów,
- nowych pełnych fauna/household/repair/livestock mechanics wymaganych wyłącznie przez konkretny scenario.

RPG matrices będą osobnym planem `quests-progression-017`.

## Implementation notes

Podczas implementacji utworzyć:

```text
docs/plans/implementation-notes/quests-progression-016-world-driven-settlement-quest-opportunities-implementation-notes.md
```

Notes powinny udokumentować:

- exact QuestManager generated-definition integration,
- candidate vs materialized QuestDef lifecycle,
- stable opportunity identity,
- active generated quest reconstruction/persistence contract,
- settlement opportunity refresh trigger,
- authoritative source owner dla wybranego vertical slice,
- narrow lookup contract,
- external-resolution semantics,
- giver-selection path,
- exact source refs,
- recon status pozostałych trzech scenario families,
- wydzielone dependencies dla brakujących domain mechanics,
- performance implications.

Nie powtarzać treści planu.

## JSDoc / preflight

Dodać JSDoc dla kluczowych publicznych opportunity types/materializers/lookups.

Tam gdzie pomaga discovery, użyć `@domain quests-progression`.

Dokumentacja powinna jasno mówić:

```text
world state owns the problem
quest opportunity only exposes it
candidate is not automatically a QuestDef
QuestManager owns quest progress
active generated quests must reconstruct deterministically
```

## Weryfikacja

AI:

- typecheck,
- focused unit tests,
- opportunity lifecycle tests,
- active generated quest persistence tests,
- deterministic identity/materialization tests,
- relevant settlement streaming tests,
- build zgodnie ze standardem repo.

AI nie wykonuje browser verification.

Manualną weryfikację gameplay wykonuje użytkownik.

## Definition of Done

Plan jest zakończony, gdy:

- istnieje wspólny world-driven settlement opportunity lifecycle,
- opportunity wynika z realnego authoritative state,
- candidate jest lekkim rekordem i nie wymaga natychmiastowego pełnego `QuestDef`,
- selected opportunity materializuje normalny `QuestDef` obsługiwany przez istniejący `QuestManager`,
- `QuestManager` pozostaje jedynym właścicielem runtime quest progress,
- world problem nie jest kopiowany do quest state,
- niezaakceptowana oferta znika, gdy problem znika,
- zaakceptowany quest reaguje na niezależne rozwiązanie problemu,
- stable opportunity/source identity działa przez refresh,
- aktywny generated quest odtwarza tę samą definicję po save/load bez rerollu targetów lub wariantu,
- działa co najmniej jeden pełny vertical slice oparty o real authoritative world state,
- kolejne scenario families są wdrożone tylko tam, gdzie istnieją wymagane domain seams,
- brakujące mechaniki są jawnie wydzielone jako dependencies zamiast quest-only workaroundów,
- rozwiązanie nie tworzy drugiego quest engine ani generic quest DSL.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
