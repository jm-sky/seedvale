# Plan: Quest Availability & Prerequisites

**Created:** 2026-09-06  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** S  
**Depends on:** quests-progression-002  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `relationships`  
**Tags:** `quests` `availability` `prerequisites` `rpg`  
**Roadmap:** `quests-and-reputation.md`

## Cel

Rozszerzyć obecny prosty relation gate tak, aby authored RPG quests mogły być udostępniane na podstawie wcześniejszych działań gracza i jego pozycji społecznej.

Docelowy przepływ:

```text
stan świata gracza
+ wcześniejsze quest outcomes
+ relation
+ reputation / renown
        ↓
QuestAvailability
        ↓
NPC może zaoferować quest
```

Plan ma zapewnić tylko warunki potrzebne dla najbliższych authored RPG quests.

Nie budować uniwersalnego condition engine, DSL ani quest graph.

---

## 1. Obecny problem

Aktualnie `QuestAvailability` obsługuje tylko:

```ts
type QuestAvailability = {
  relation?: {
    npcName: string
    minimum: RelationLevel
  }
}
```

To pozwala np. ukryć quest do poziomu `trusted`, ale nie pozwala powiedzieć:

```text
Anna oferuje kolejny quest
dopiero gdy:

- zakończyłeś poprzedni quest określonym outcome,
- albo masz odpowiednią reputation,
- albo jesteś dostatecznie znany w osadzie.
```

`quests-progression-002` dodaje `resolvedOutcomeId`, który powinien zostać wykorzystany jako fundament prerequisites.

---

## 2. Jedna struktura prerequisite

Zastąpić specjalny relation-only model jawnym discriminated union.

Docelowo:

```ts
type QuestPrerequisite =
  | {
      type: 'relation'
      npcName: string
      minimum: RelationLevel
    }
  | {
      type: 'quest_outcome'
      questId: string
      outcomeIds: readonly QuestOutcomeId[]
    }
  | {
      type: 'reputation'
      dimension: ReputationDimension
      minimum: number
    }
  | {
      type: 'renown'
      minimum: number
    }
```

oraz:

```ts
type QuestAvailability = {
  prerequisites: readonly QuestPrerequisite[]
}
```

Wszystkie prerequisites w tablicy mają semantykę:

```text
AND
```

Quest jest dostępny tylko wtedy, gdy wszystkie są spełnione.

---

## 3. Nie dodawać generic boolean expressions

Nie implementować:

```ts
allOf
anyOf
not
and
or
condition groups
nested expressions
```

Nie tworzyć:

```ts
{
  operator: 'AND',
  children: [...]
}
```

ani expression DSL.

Najbliższe authored RPG quests tego nie potrzebują.

### Proste OR dla outcomes

Jeżeli kilka outcomes poprzedniego questa prowadzi do tego samego następnego questa:

```ts
{
  type: 'quest_outcome',
  questId: 'previous-quest',
  outcomeIds: [
    'helped_guard',
    'helped_guard_without_reward',
  ],
}
```

Warunek jest spełniony, jeśli `resolvedOutcomeId` należy do `outcomeIds`.

Dzięki temu nie potrzebujemy `anyOf`.

---

## 4. Quest outcome prerequisite

To najważniejszy nowy prerequisite.

Przykład:

```ts
availability: {
  prerequisites: [
    {
      type: 'quest_outcome',
      questId: 'zagubiony-kupiec',
      outcomeIds: ['rescued'],
    },
  ],
}
```

Quest pozostaje niedostępny dopóki:

```text
zagubiony-kupiec
→ resolvedOutcomeId === 'rescued'
```

### Outcome, nie tylko `complete`

Nie używać wyłącznie:

```ts
previousQuestComplete: true
```

Outcome jest ważniejszy od samego terminal state.

Przykład:

```text
Quest A
├── oddałeś przedmiot właścicielowi
├── zatrzymałeś go
└── sprzedałeś komuś innemu
```

Każdy wariant może otworzyć inne późniejsze możliwości.

`resolvedOutcomeId` z planu `002` jest canonical source.

---

## 5. Relation prerequisite

Zachować obecną funkcjonalność, ale przenieść ją do wspólnego modelu:

```ts
{
  type: 'relation',
  npcName: 'Anna',
  minimum: 'friendly',
}
```

Nie zmieniać istniejących:

```ts
RelationLevel
RELATION_LEVEL_THRESHOLDS
relationToLevel()
```

jeśli po implementacji `002` nadal są canonical.

Relation oznacza:

> Jak konkretny NPC postrzega gracza.

Nie zastępować jej reputation.

---

## 6. Reputation prerequisite

Wykorzystać `ReputationManager` z `quests-progression-001`.

Przykład:

```ts
{
  type: 'reputation',
  dimension: 'competence',
  minimum: 20,
}
```

Semantyka:

> Reputation w osadzie, do której należy giver questa.

Nie zapisywać `settlementId` ręcznie w każdym authored `QuestDef`.

Quest author nie powinien musieć wiedzieć:

```ts
settlementId: 'settlement-0'
```

Giver jest już częścią definicji questa:

```ts
giverName
```

Composition/integration layer powinien rozwiązać osadę givera za pomocą istniejących settlement/NPC mechanisms.

### Dlaczego giver settlement

Dzięki temu quest:

```text
Anna → competence >= 20
```

oznacza naturalnie:

> Anna powierza zadanie komuś, kto ma odpowiednią opinię w jej społeczności.

Nie globalną reputation.

---

## 7. Renown prerequisite

Analogicznie:

```ts
{
  type: 'renown',
  minimum: 15,
}
```

oznacza lokalny renown w osadzie givera.

Przykład gameplay:

```text
gracza wykonał kilka publicznych działań
→ ludzie zaczynają go znać
→ NPC proponuje bardziej znaczące zadanie
```

Nie mieszać:

```text
renown = fame / rozpoznawalność
reputation = ocena charakteru / działań
relation = relacja z konkretną osobą
```

---

## 8. Brak bezpośredniej zależności QuestManager → ReputationManager

`QuestManager` nie powinien importować:

```ts
ReputationManager
SettlementsManager
```

Wykorzystać narrow injected lookup.

Docelowy kontrakt może być np.:

```ts
type QuestSocialAvailabilityLookup = {
  getReputationForNpc(
    npcName: string,
  ): Readonly<Reputation> | null

  getRenownForNpc(
    npcName: string,
  ): number
}
```

Composition root:

```text
giverName
→ settlement containing NPC
→ settlementId
→ ReputationManager
```

Dokładna implementacja lookup powinna wykorzystać istniejące mechanizmy lokalizacji/ownership NPC.

Nie tworzyć duplicate `npcName → settlementId` registry tylko dla questów.

---

## 9. Relation pozostaje własnością obecnego relation systemu

Nie przenosić relation do ReputationManager w tym planie.

QuestManager / istniejący relationship owner pozostaje canonical source relation zgodnie z aktualną architekturą po `002`.

Prerequisite evaluator korzysta z istniejącego API.

---

## 10. Jedno miejsce ewaluacji availability

Wprowadzić jedną funkcję odpowiedzialną za ocenę:

```ts
isQuestAvailable(def: QuestDef): boolean
```

lub równoważną nazwę zgodną z aktualnym `QuestManager`.

Nie rozrzucać warunków po:

```text
NPC interaction
Quest Log
quest markers
offer dialogue
UI
```

Wszystkie consumers powinny korzystać z tego samego wyniku availability.

Jeżeli funkcja jest ważnym architectural/public seam, dodać JSDoc i `@domain quests-progression`.

---

## 11. Availability działa tylko przed wejściem questa w lifecycle

Prerequisites decydują:

> Czy quest może zostać zaoferowany?

Nie decydują:

> Czy już rozpoczęty quest nadal może istnieć?

Kluczowa zasada:

```text
not_offered
→ sprawdzamy prerequisites

offered / active / ready_to_report
→ nie cofamy questa przez prerequisites
```

Przykład:

```text
NPC wymaga friendly
→ oferuje quest
→ gracz przyjmuje
→ relation później spada
```

Quest pozostaje aktywny.

Nie:

```text
relation spadła
→ active quest znika
```

To byłoby niestabilne i trudne do zrozumienia.

---

## 12. Terminal outcomes również się nie cofają

Quest:

```text
complete
failed
invalidated
```

pozostaje terminalny niezależnie od późniejszych zmian prerequisites.

Availability nie przelicza historii.

---

## 13. Ukrywanie niedostępnych questów

Domyślne zachowanie:

```text
prerequisites niespełnione
→ quest nie pojawia się w Quest Log
→ giver go nie oferuje
→ nie ma quest markera
```

Nie dodawać teraz:

```text
Locked quest
???
Requires reputation 20
```

Gracz nie musi widzieć całej przyszłej struktury questów.

Authored RPG quests powinny pojawiać się naturalnie, kiedy stają się dostępne.

---

## 14. Availability nie jest quest chain systemem

Nie dodawać:

```ts
nextQuestId
previousQuestId
questChainId
chapter
sequence
```

Powiązanie:

```text
Quest A outcome
→ availability Quest B
```

wystarcza dla prostych quest chains.

Przykład:

```ts
Quest B.availability = {
  prerequisites: [
    {
      type: 'quest_outcome',
      questId: 'quest-a',
      outcomeIds: ['helped'],
    },
  ],
}
```

To pozwoli następnemu planowi tworzyć authored quest chains bez osobnego graph engine.

---

## 15. Obsługa różnych gałęzi RPG

Model musi pozwolić:

```text
Quest A
├── Outcome: helped_anna
│       ↓
│   Quest B dostępny
│
└── Outcome: betrayed_anna
        ↓
    Quest C dostępny
```

Bez specjalnego branching subsystem.

Quest B:

```ts
{
  type: 'quest_outcome',
  questId: 'quest-a',
  outcomeIds: ['helped_anna'],
}
```

Quest C:

```ts
{
  type: 'quest_outcome',
  questId: 'quest-a',
  outcomeIds: ['betrayed_anna'],
}
```

To jest podstawowy mechanizm potrzebny pod authored RPG content.

---

## 16. Nie dodawać item prerequisites

Na tym etapie nie dodawać:

```ts
{
  type: 'has_item'
}
```

Inventory jest właściwe dla objective / interaction requirements, niekoniecznie dla dostępności całego questa.

Jeśli konkretny authored quest w następnym planie faktycznie będzie tego potrzebował, można wtedy rozszerzyć union.

Nie projektować warunków spekulacyjnie.

---

## 17. Nie dodawać generic world-state prerequisites

Nie dodawać teraz:

```ts
worldFlag
settlementResource
buildingExists
animalPopulation
timeOfDay
weather
season
playerOwnsLand
```

Te warunki będą potrzebne później dla bardziej world-driven quests.

Najbliższy authored RPG plan powinien najpierw wykorzystać:

```text
quest outcome
relation
reputation
renown
```

Jeżeli podczas projektowania konkretnych questów okaże się, że jeden rzeczywisty world condition jest konieczny, rozszerzyć system wtedy poprzez jawny typed prerequisite.

---

## 18. Existing quests migration

Obecne:

```text
grozny-wilk
wilcza-jama
```

mają relation availability.

Zmigrować je z:

```ts
availability: {
  relation: {
    npcName: 'Anna',
    minimum: 'trusted',
  },
}
```

do:

```ts
availability: {
  prerequisites: [
    {
      type: 'relation',
      npcName: 'Anna',
      minimum: 'trusted',
    },
  ],
}
```

Nie zmieniać ich gameplay ani thresholdów w ramach tej migracji.

---

## 19. Jeden realny outcome prerequisite

Aby mechanizm nie pozostał wyłącznie testową infrastrukturą, wykorzystać go w istniejącym contencie tam, gdzie naturalnie tworzy ciąg.

Preferowana decyzja:

```text
wilcza-jama
```

powinna wymagać pozytywnego rozwiązania:

```text
grozny-wilk
```

oprócz istniejącego relation gate.

Przykład:

```ts
availability: {
  prerequisites: [
    {
      type: 'relation',
      npcName: 'Anna',
      minimum: 'trusted',
    },
    {
      type: 'quest_outcome',
      questId: 'grozny-wilk',
      outcomeIds: ['completed'],
    },
  ],
}
```

Użyć faktycznego outcome ID przyjętego w implementacji `002`.

Narracyjnie:

```text
najpierw pojawia się konkretny groźny wilk
→ gracz rozwiązuje problem
→ okazuje się, że źródłem zagrożenia jest wilcza jama
```

To tworzy pierwszy lekki quest chain bez nowego chain systemu.

---

## 20. Jeden realny reputation/renown gate

Nie zmieniać wielu istniejących questów tylko po to, żeby wykorzystać wszystkie nowe prerequisite types.

Dodać co najwyżej jeden sensowny realny consumer, jeżeli po implementacji `001–003` istniejący content daje naturalne miejsce.

Preferować `wilcza-jama` lub inny znaczący quest tylko wtedy, gdy threshold nie tworzy grind requirement.

Nie wymagać sztucznie:

```text
renown 50
```

tylko po to, żeby udowodnić działanie mechanizmu.

Jeżeli brak naturalnego obecnego questa, reputation/renown prerequisites mogą zostać pokryte testami i użyte dopiero w następnym authored RPG planie.

---

## 21. Thresholds

Nie tworzyć osobnych tierów availability dla reputation/renown.

Quest author ustawia jawny numeric threshold:

```ts
{
  type: 'reputation',
  dimension: 'competence',
  minimum: 15,
}
```

lub:

```ts
{
  type: 'renown',
  minimum: 10,
}
```

Wartości muszą mieścić się w skalach z `quests-progression-001`:

```text
reputation: -100..100
renown:       0..100
```

Nie clampować błędnych quest definitions w runtime po cichu.

Niepoprawne definicje powinny zostać wykryte przez validation/tests.

---

## 22. Definition validation

Dodać lightweight validation dla authored quest prerequisites.

Sprawdzać przynajmniej:

- `quest_outcome.questId` wskazuje istniejący quest,
- wskazane `outcomeIds` istnieją w jego `outcomes`,
- `outcomeIds` nie jest puste,
- quest nie zależy bezpośrednio od własnego outcome,
- reputation minimum mieści się w `-100..100`,
- renown minimum mieści się w `0..100`,
- relation NPC jest prawidłowym istniejącym NPC zgodnie z obecnymi validation mechanisms.

Nie budować pełnego cycle detector dla całego quest graph, chyba że okazuje się to trywialne dzięki istniejącej walidacji.

Bezpośredni self-dependency musi być zabroniony.

---

## 23. Persistence

Nie dodawać nowego persistence state dla prerequisites.

Availability jest wartością pochodną z istniejącego state:

```text
relations
reputation
renown
quest resolvedOutcomeId
```

Po load:

```text
restore source states
→ availability jest ponownie obliczana
```

Nie zapisywać:

```ts
quest.available = true
```

jako duplicated state.

Wyjątkiem pozostaje normalny lifecycle:

```text
offered
active
...
```

który po rozpoczęciu questa ma pierwszeństwo przed aktualnymi prerequisites.

---

## 24. Tests

Dodać testy co najmniej dla:

### Relation

- prerequisite niespełniony → quest niewidoczny,
- threshold osiągnięty → quest dostępny,
- istniejące trusted gates nadal działają.

### Quest outcome

- brak rozwiązania poprzedniego questa → locked,
- właściwy outcome → available,
- inny outcome → locked,
- kilka `outcomeIds` działa jako allowed set,
- `failed` bez właściwego resolved outcome nie odblokowuje questa.

### Multiple prerequisites

```text
relation ✓
outcome ✓
→ available

relation ✓
outcome ✗
→ unavailable
```

Potwierdzić AND semantics.

### Reputation

- właściwy dimension i threshold → available,
- inny dimension nie spełnia gate,
- używana jest reputation osady givera, nie globalny/średni standing.

### Renown

- poniżej minimum → unavailable,
- threshold → available.

### Lifecycle stability

- quest przyjęty przy spełnionych prerequisites,
- później relation/reputation/renown spada,
- quest pozostaje aktywny.

### Validation

- unknown quest ID,
- unknown outcome ID,
- empty outcomeIds,
- self-dependency,
- invalid numeric range.

---

## 25. Docs

Po implementacji zaktualizować odpowiednie canonical docs, przede wszystkim:

- `docs/state/player-systems.md`
- `docs/state/npc.md`
- `docs/vision/quests.md`

W dokumentacji jasno opisać:

```text
Availability = czy quest może zostać zaoferowany

Objective = co gracz robi

Outcome = jak quest został rozwiązany

Consequences = co zmienia resolution
```

Nie przedstawiać availability jako pełnego world-condition engine.

Dodać implementation notes zgodnie z `docs/plans/PLANNING.md`.

Nie uruchamiać `pnpm docs:sync` ręcznie.

---

## Non-goals

Plan nie obejmuje:

- authored RPG quest pack,
- nowych dużych historii,
- dialogue choice engine,
- generic condition DSL,
- nested AND/OR/NOT,
- quest graph engine,
- quest chapters,
- repeatable quests,
- procedural quests,
- world-problem generation,
- time/weather/season gates,
- inventory gates,
- land/property gates,
- skill/attribute gates,
- quest expiration,
- world resolution bez gracza,
- UI listy zablokowanych questów,
- hints typu „potrzebujesz 20 reputation”.

---

## Kolejność implementacji

1. Zweryfikować finalny model `QuestOutcome` i `resolvedOutcomeId` po `quests-progression-002`.
2. Wprowadzić `QuestPrerequisite` i nowy `QuestAvailability`.
3. Scentralizować evaluation availability.
4. Podłączyć relation prerequisite.
5. Podłączyć quest outcome prerequisite.
6. Podłączyć reputation i renown przez narrow injected lookup.
7. Zmigrować istniejące relation gates.
8. Powiązać `wilcza-jama` z outcome `grozny-wilk`.
9. Dodać validation.
10. Dodać tests.
11. Zaktualizować canonical docs.
12. Dodać implementation notes.

Dla istotnego publicznego evaluator/API dodać JSDoc oraz, gdzie przydatne dla preflight discovery:

```ts
@domain quests-progression
```

---

## Verification

### Automated

Uruchomić odpowiednie:

- quest definition tests,
- QuestManager tests,
- reputation integration tests,
- persistence tests,
- typecheck,
- build.

### Manual — User

User sprawdza w przeglądarce:

1. Quest z niespełnionymi prerequisites nie jest widoczny ani oferowany.
2. Po spełnieniu relation gate quest pojawia się.
3. Po odpowiednim outcome poprzedniego questa pojawia się kolejny.
4. Inny outcome nie odblokowuje niewłaściwej gałęzi.
5. `wilcza-jama` nie jest dostępna przed rozwiązaniem `grozny-wilk`.
6. Po rozpoczęciu questa późniejszy spadek relation/reputation nie usuwa go.
7. Quest markers respektują availability.
8. Existing quests bez prerequisites nadal zachowują się tak jak wcześniej.
9. Save/load poprawnie odtwarza availability z persisted source state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**