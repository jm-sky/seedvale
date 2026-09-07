# Implementation Notes: quests-progression-004 — Quest Availability & Prerequisites

## Stan wejściowy i zależności

- `quests-progression-001` jest już zaimplementowany w codebase: `ReputationManager` istnieje, a runtime `QuestDef` ma `settlementId?: string`. `src/app/createApp.ts` rozwiązuje ten kontekst **raz** przed konstrukcją `QuestManager`: bierze `bundle.settlementsManager.getHomeDef().id` i mapuje `[...QUESTS, ...landmarkQuests]` do definicji z `settlementId`. Statyczne definicje w `src/quests/quests.ts` celowo pozostają settlement-agnostic.
- Nie wykonywać w 004 żadnego `giverName → settlement` discovery. Nie skanować `SettlementsManager`, NPC ani `getLoaded()`, nie tworzyć registry po nazwie. Canonical resolved settlement context to `QuestDef.settlementId` już dostarczony przez composition root.
- Aktualny `main` jest jeszcze **przed implementacją quests-progression-002**: `QuestDef` nadal ma `reward`/`effects`, `QuestManager` nadal przechowuje `exp`, a `QuestProgressEntry` nie ma `resolvedOutcomeId`. 004 ma być implementowany po 002 i korzystać z finalnych typów/outcome lifecycle wprowadzonych przez 002; nie dodawać równoległego tymczasowego outcome state.
- Kontrakt 002 do wykorzystania: domenowy `QuestOutcomeId`, `QuestOutcome`, runtime/persisted quest progress z `resolvedOutcomeId?: QuestOutcomeId`, unified terminal resolution oraz `QuestDef.outcomes`. `invalidated` pozostaje terminalem technicznym bez outcome.

## Typy do rozszerzenia

W `src/quests/quests.ts`, na modelu po 002:

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

- `QuestDef.availability?: QuestAvailability` pozostaje opcjonalne; brak availability = spełnione.
- Wszystkie elementy `prerequisites` mają semantykę AND.
- `quest_outcome.outcomeIds` jest jedynym lokalnym OR: wystarczy membership check przeciw `resolvedOutcomeId`.
- Zachować `RelationLevel`, `RELATION_LEVEL_THRESHOLDS` i `relationToLevel()` bez nowego relation modelu.
- `ReputationDimension` nadal pochodzi z `src/reputation/ReputationManager.ts`; nie kopiować uniona.

## Canonical availability evaluation

Canonical evaluator pozostaje w `src/quests/QuestManager.ts`, rozszerzając obecne prywatne `meetsAvailability(def)` zamiast tworzyć osobny condition engine/service.

Obecny runtime już ma trzy bezpośrednie consumers tego samego predicate:

- `handleGiverInteract()` — dla `not_offered` blokuje przejście do oferty i zwraca `null`,
- `list()` — ukrywa `not_offered` quest z niespełnionym gate,
- `labelMarker()` — nie pokazuje `!` dla niedostępnego `not_offered` questa.

`gameLoop.ts` konsumuje marker przez `questManager.labelMarker(npc.name)`; Quest Log konsumuje `questManager.list()`. UI nie powinno samodzielnie interpretować prerequisites.

Publiczne `isQuestAvailable(id)` obecnie tylko deleguje do `meetsAvailability(def)` i nie sprawdza lifecycle mimo mylącego JSDoc. W 004 zachować je jako query „prerequisites są obecnie spełnione” (przydatne też w testach) i poprawić komentarz; **nie** duplikować w nim osobnej logiki ani nie mieszać z `state !== not_offered`.

## Dostęp do source state

### Relation

`QuestManager.relations` pozostaje authoritative player↔NPC store. Relation prerequisite czyta wyłącznie istniejące `getRelationLevel(npcName)` / `relationToLevel()`.

### Quest outcomes

Po 002 odczytywać outcome wyłącznie z authoritative runtime progress `QuestManager.states` / wspólnego domenowego progress type. Dla prerequisite:

```text
referenced quest exists
+ referenced progress.resolvedOutcomeId exists
+ outcomeIds.includes(resolvedOutcomeId)
→ true
```

Nie wystarcza `state === complete`; failed outcome może być prawidłowym prerequisite, jeżeli jego ID jest jawnie authored w `outcomeIds`. `invalidated` nie ma outcome i nie spełnia `quest_outcome` gate.

Nie odczytywać outcome z save DTO ani historii poza `QuestManager`; persistence jest tylko restore/export contract.

### Reputation / renown

`ReputationManager` jest app-level ownerem równoległym do `QuestManager`. Nie importować klasy managera do `QuestManager` i nie używać `PlayerSocialLookup` z NPC — ten kontrakt służy NPC reactions/assistance i ma inny ownership.

Dodać mały injected read-only kontrakt, keyed przez **już resolved `settlementId`**, np.:

```ts
export type QuestSocialAvailabilityLookup = {
  getReputationDimension(settlementId: string, dimension: ReputationDimension): number
  getRenown(settlementId: string): number
}
```

W `createApp.ts` domknąć go bezpośrednio na istniejącym `reputationManager.getReputationDimension(...)` i `reputationManager.getRenown(...)`; dodać dependency na końcu konstruktora `QuestManager` albo do deps-object, jeśli 002 wcześniej taki wprowadzi.

Evaluator bierze settlement wyłącznie z `def.settlementId`. Jeżeli social prerequisite trafi do runtime def bez `settlementId`, fail closed (`false`) i definition validation ma to wykryć. Nie fallbackować do home settlement ani globalnego/średniego standing.

## Lifecycle semantics

Availability jest dynamiczną pochodną source state, ale ma wpływ tylko przed wejściem questa w lifecycle:

```text
not_offered → prerequisites są konsultowane
offered / active / ready_to_report → istniejący state wygrywa
complete / failed / invalidated → terminal history wygrywa
```

Nie cofamy oferty/aktywnego questa po spadku relation/reputation/renown ani po zmianie innych prerequisites. Nie zapisujemy `available: boolean` do save.

To pasuje do obecnego `QuestManager`: `list()` i `labelMarker()` sprawdzają gate tylko jako wyjątek dla `not_offered`, a pozostałe stany są prezentowane z własnego lifecycle.

## Migracja istniejącego relation gate

Wszystkie istniejące `availability: { relation: ... }` w `src/quests/quests.ts` przepisać mechanicznie na `availability.prerequisites` bez zmiany thresholdów. Dotyczy co najmniej `grozny-wilk` i `wilcza-jama`.

Po 002 dodać do `wilcza-jama` drugi prerequisite wskazujący **faktyczny successful outcome ID z finalnej definicji `grozny-wilk`**. Nie wpisywać zgadywanego `completed`; podczas implementacji 004 użyć ID obecnego wtedy w `QuestDef.outcomes` po 002.

Nie dodawać sztucznego reputation/renown gate do istniejącego contentu, jeśli po 001–003 nie ma naturalnego progu bez grind requirement. Te dwa typy mogą mieć realne coverage testowe i zostać użyte przez późniejszy authored content.

## Definition validation

`quests-progression-002` nie definiuje osobnego quest-definition validatora jako część swojego kontraktu. `004` jest właścicielem tego seam. Dodać mały domenowy validator uruchamiany raz na finalnych runtime defs przekazanych do `QuestManager`, czyli już po composition-root settlement binding. Jeśli faktyczna implementacja 002 mimo kontraktu doda równoważny validator, rozszerzyć go zamiast tworzyć drugi.

Sprawdzać:

- `quest_outcome.questId` istnieje,
- `outcomeIds` nie jest puste,
- każde outcome ID istnieje w `referencedDef.outcomes`,
- brak direct self-dependency,
- reputation `minimum` ∈ `[-100, 100]`,
- renown `minimum` ∈ `[0, 100]`,
- social prerequisite ma resolved `def.settlementId`,
- relation prerequisite nie wprowadza nowego NPC registry; użyć istniejących authored NPC names i obecnego relation store, bez osobnego identity subsystemu.

Nie dodawać cycle detectora, graph representation ani runtime clamping błędnych authored thresholds.

## Testy

Rozszerzyć przede wszystkim `src/quests/QuestManager.test.ts`. Testy samego validatora trzymać przy istniejących quest-definition tests, jeśli 002 już takie utworzy; w przeciwnym razie dodać mały `src/quests/quests.test.ts`, nie drugi runtime harness.

Pokryć:

- migrację relation gate i obecne trusted thresholds,
- `quest_outcome`: unresolved / matching / non-matching / allowed-set z kilkoma IDs,
- failed outcome odblokowuje tylko gdy jego konkretny ID jest authored; `invalidated` nie odblokowuje,
- AND semantics dla wielu prerequisites,
- reputation dimension + threshold i niezależność dimensions,
- renown below/equal threshold,
- social gates czytają `def.settlementId`: dwa settlement IDs z różnym standing muszą dać różny wynik; brak settlementId = unavailable/validation error,
- lifecycle stability po `offered`/`active` przy późniejszym spadku relation/reputation/renown,
- `list()`, `handleGiverInteract()` i `labelMarker()` pozostają spójne dla locked `not_offered`,
- validation: unknown quest/outcome, empty outcomeIds, self-dependency, out-of-range social threshold,
- save/load: brak nowego persisted availability state; po restore wynik wynika z relations + reputation/renown + `resolvedOutcomeId`.

Jeżeli konstruktor nadal jest pozycyjny po 002, nowy lookup dodać na końcu z neutralnym defaultem, żeby nie przesuwać istniejących test call sites.

## Czego nie tworzyć

- żadnego `giverName → settlementId` lookupu/registry ani skanowania settlementów,
- `QuestManager → ReputationManager` / `SettlementsManager` dependency,
- reuse `PlayerSocialLookup` jako quest availability API,
- generic condition engine, DSL, nested AND/OR/NOT,
- quest graph/chain manager, `nextQuestId`, chapters ani cycle engine,
- duplicated `available` persistence/state,
- global reputation/średniego standing jako fallback,
- item/world/weather/time/skill prerequisites w tym planie,
- UI dla locked quests ani własnej logiki prerequisites w Vue/game loop.

Nie uruchamiać `pnpm docs:sync` ręcznie — robi to GitHub workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**