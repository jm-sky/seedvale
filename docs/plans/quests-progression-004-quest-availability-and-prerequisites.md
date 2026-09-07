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

Rozszerzyć obecny relation-only gate tak, aby authored quests mogły być oferowane na podstawie:

- player↔NPC relation,
- konkretnego resolved outcome wcześniejszego questa,
- lokalnej settlement reputation,
- lokalnego settlement renown.

Nie budować generic condition engine, DSL ani quest graph.

## Stan wejściowy i zależności

`quests-progression-001` jest już zaimplementowany i rozstrzyga settlement context dla questów:

```text
createApp.ts
→ finalne runtime QuestDef[]
→ QuestDef.settlementId
→ QuestManager
```

Aktualny composition root dopina `settlementId` do quest definitions przed konstrukcją `QuestManager`. Statyczne definitions pozostają settlement-agnostic.

**Nie wykonywać ponownego `giverName → settlement` discovery.** Nie skanować NPC/settlementów i nie tworzyć registry po nazwie. Reputation/renown availability ma użyć istniejącego resolved `QuestDef.settlementId`.

`quests-progression-002` pozostaje bezpośrednią zależnością tego planu i dostarcza canonical:

- `QuestOutcomeId`,
- `QuestOutcome`,
- `QuestDef.outcomes`,
- runtime/persisted `resolvedOutcomeId?: QuestOutcomeId`,
- unified resolution semantics.

Nie dodawać w 004 równoległego outcome state.

## Typy

W `src/quests/quests.ts`, po 002, wprowadzić:

```ts
export type QuestPrerequisite =
  | { type: 'relation', npcName: string, minimum: RelationLevel }
  | { type: 'quest_outcome', questId: string, outcomeIds: readonly QuestOutcomeId[] }
  | { type: 'reputation', dimension: ReputationDimension, minimum: number }
  | { type: 'renown', minimum: number }

export type QuestAvailability = {
  prerequisites: readonly QuestPrerequisite[]
}
```

`QuestDef.availability?` pozostaje opcjonalne. Wszystkie prerequisites mają semantykę AND.

`quest_outcome.outcomeIds` jest prostym allowed-set OR: warunek jest spełniony, jeśli `resolvedOutcomeId` należy do tablicy.

Nie zmieniać `RelationLevel`, `RELATION_LEVEL_THRESHOLDS` ani `relationToLevel()`.

## Canonical availability evaluation

Rozszerzyć obecne `QuestManager.meetsAvailability(def)` — nie tworzyć osobnego evaluator service.

To pozostaje jednym canonical predicate używanym przez istniejących consumers:

- `handleGiverInteract()` — nie oferuje locked `not_offered` questa,
- `list()` — ukrywa locked `not_offered` questa w Quest Log,
- `labelMarker()` — nie pokazuje `!` dla locked `not_offered` questa.

UI/game loop nie interpretują prerequisites samodzielnie.

Publiczne `isQuestAvailable(id)` ma delegować do tego samego predicate. Obecny kod nie sprawdza w nim lifecycle mimo mylącego komentarza; traktować go jako query „prerequisites są teraz spełnione” i poprawić JSDoc zamiast duplikować state semantics.

## Source state

### Relation

Relation pozostaje własnością `QuestManager.relations`. Prerequisite używa istniejącego `getRelationLevel(npcName)`.

### Quest outcome

Po 002 czytać wyłącznie canonical runtime progress w `QuestManager`:

```text
resolvedOutcomeId ∈ prerequisite.outcomeIds
```

Nie wystarcza samo `state === complete`.

Failed outcome może odblokować późniejszy quest, jeżeli jego konkretny outcome ID jest jawnie authored. `invalidated` nie ma outcome i nie spełnia `quest_outcome` prerequisite.

### Reputation / renown

`ReputationManager` pozostaje jedynym ownerem settlement reputation/renown.

`QuestManager` nie importuje klasy `ReputationManager` ani `SettlementsManager`. Dodać narrow injected read-only lookup keyed przez **resolved settlement id**, np.:

```ts
export type QuestSocialAvailabilityLookup = {
  getReputationDimension(settlementId: string, dimension: ReputationDimension): number
  getRenown(settlementId: string): number
}
```

`createApp.ts` domyka ten lookup na istniejącym `reputationManager`.

Evaluator używa wyłącznie:

```ts
def.settlementId
```

Dla reputation/renown prerequisite brak `settlementId` ma failować zamknięcie (`false`) i zostać wykryty przez definition validation. Nie fallbackować do home settlement, giver lookup ani globalnego standing.

## Lifecycle semantics

Availability decyduje tylko, czy `not_offered` quest może wejść do oferty:

```text
not_offered → sprawdzamy prerequisites
offered / active / ready_to_report → nie cofamy przez prerequisites
complete / failed / invalidated → terminal history pozostaje bez zmian
```

Po zaoferowaniu/przyjęciu questa późniejszy spadek relation/reputation/renown nie usuwa ani nie blokuje aktywnego questa.

Nie persistować `available: boolean`; availability jest pochodną persisted source state.

## Migracja istniejącego relation gate

Przepisać istniejące:

```ts
availability: {
  relation: { npcName: 'Anna', minimum: 'trusted' }
}
```

na:

```ts
availability: {
  prerequisites: [
    { type: 'relation', npcName: 'Anna', minimum: 'trusted' },
  ]
}
```

Bez zmiany thresholdów/gameplay. Dotyczy co najmniej `grozny-wilk` i `wilcza-jama`.

## Pierwszy realny outcome prerequisite

Po implementacji 002 `wilcza-jama` ma wymagać successful resolved outcome `grozny-wilk` obok istniejącego trusted relation gate.

Użyć **faktycznego outcome ID z finalnej definicji 002**. Nie wpisywać z góry zgadywanego `completed`.

Nie dodawać sztucznego reputation/renown gate tylko dla demonstracji. Jeśli istniejący content nie daje naturalnego progu bez grind requirement, pokryć te prerequisite types testami i użyć ich później w authored content.

## Definition validation

`quests-progression-002` nie definiuje osobnego quest-definition validatora jako część swojego kontraktu. `004` jest właścicielem tego seam: dodać mały quest-domain validator uruchamiany raz na finalnych runtime defs przekazanych do `QuestManager`, czyli **po** composition-root settlement binding. Jeśli implementacja `002` mimo wszystko wprowadziła równoważny validator, rozszerzyć dokładnie ten istniejący seam zamiast tworzyć drugi.

Sprawdzać co najmniej:

- referenced `quest_outcome.questId` istnieje,
- `outcomeIds` nie jest puste,
- każde wskazane outcome ID istnieje w referenced quest,
- brak direct self-dependency,
- reputation minimum mieści się w `-100..100`,
- renown minimum mieści się w `0..100`,
- social prerequisite ma resolved `QuestDef.settlementId`.

Nie clampować błędnych authored thresholds. Nie budować cycle detectora ani graph engine.

## Persistence

Nie dodawać nowego persisted availability state.

Po load availability jest ponownie obliczana z:

```text
QuestManager relations
+ ReputationManager settlement state
+ QuestProgress.resolvedOutcomeId
```

Lifecycle state (`offered`, `active`, `ready_to_report`, terminal) ma pierwszeństwo po wejściu questa do lifecycle.

## Testy

Rozszerzyć przede wszystkim `src/quests/QuestManager.test.ts`. Testy samego validatora trzymać przy istniejących quest-definition tests, jeżeli po `002` już istnieją; w przeciwnym razie dodać mały `src/quests/quests.test.ts` zamiast drugiego runtime harnessu.

Pokryć:

- relation prerequisite below/at threshold,
- existing trusted gates po migracji,
- outcome unresolved / matching / non-matching / multiple allowed IDs,
- failed outcome tylko przy matching ID; `invalidated` nie odblokowuje,
- AND semantics dla wielu prerequisites,
- reputation dimension + threshold,
- renown below/equal threshold,
- dwa `settlementId` z różnym standing dają różny wynik,
- social prerequisite bez resolved settlement context failuje,
- `list()`, `handleGiverInteract()` i `labelMarker()` są spójne dla locked `not_offered`,
- po `offered`/`active` późniejszy spadek social state nie cofa questa,
- validation: unknown quest/outcome, empty outcomeIds, self-dependency, invalid ranges,
- save/load odtwarza availability bez dodatkowego persisted pola.

## Czego nie tworzyć

Nie tworzyć:

- `giverName → settlementId` lookupu/registry ani settlement scan,
- dependency `QuestManager → ReputationManager` / `SettlementsManager`,
- reuse NPC `PlayerSocialLookup` jako quest availability API,
- generic condition engine / DSL / nested AND-OR-NOT,
- quest graph, `nextQuestId`, chapters, cycle engine,
- duplicated `available` state/persistence,
- global reputation/średniego standing fallback,
- item/world/weather/time/skill prerequisites,
- UI dla locked quests.

## Dokumentacja i verification

Zaktualizować canonical docs opisujące quest lifecycle/availability i zachować rozróżnienie:

```text
Availability = czy quest może zostać zaoferowany
Objective    = co gracz robi
Outcome      = jak quest został rozwiązany
Consequences = co zmienia resolution
```

Automated: quest/definition/reputation integration/persistence tests, typecheck, build.

Manual verification wykonuje User w przeglądarce. AI nie uruchamia browser verification.

Nie uruchamiać `pnpm docs:sync` ręcznie — robi to GitHub workflow.

Implementation notes:

`docs/plans/implementation-notes/quests-progression-004-quest-availability-and-prerequisites-implementation-notes.md`

> **Zrób git commit i push do main, rebase jeżeli trzeba**