# Plan: Quest Outcomes, Rewards & Consequences

**Created:** 2026-09-06
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** quests-progression-001
**Domain:** `quests-progression`
**Subdomains:** `quests` `rewards` `relationships`
**Tags:** `quests` `outcomes` `rewards` `consequences` `rpg`
**Roadmap:** `quests-and-reputation.md`

## Cel

Uporządkować quest lifecycle tak, aby jeden wspólny system obsługiwał authored RPG quests, contextual quests i późniejsze emergent/world-driven quests poprzez jawne outcomes, rewards i consequences.

Usunąć obecne implicit zachowania: każdy completion nie może automatycznie dawać relation ani globalnego quest EXP.

Nie budować generic quest scripting/condition engine.

## Docelowy model

```text
QuestDef
├── identity: title + description
├── availability
├── stages / objectives
└── outcomes[]
    ├── id
    ├── state: complete | failed
    ├── resultText?
    ├── reward?
    └── consequences?
```

Kluczowy kontrakt:

> Objective satisfied != quest resolved.

Prosty liniowy quest może po ostatnim objective dojść do `ready_to_report`, a dopiero interaction path wybiera konkretny outcome. Future dialogue choices mogą wybrać inny outcome bez przebudowy modelu.

## Typy

Rozszerzyć `QuestDef` o obowiązkowe:

```ts
title: string
description: string
outcomes: readonly QuestOutcome[]
```

Dodać:

```ts
type QuestOutcomeId = string

type QuestReward = {
  visibility: 'shown' | 'hidden'
  items?: Array<{ kind: ItemKind, count: number }>
}

type QuestConsequences = {
  relations?: Array<{ npcName: string, delta: number }>
  social?: {
    reputation?: Partial<Record<ReputationDimension, number>>
    renown?: number
  }
}

type QuestOutcome = {
  id: QuestOutcomeId
  state: 'complete' | 'failed'
  resultText?: string
  reward?: QuestReward
  consequences?: QuestConsequences
}
```

Nie tworzyć `effects: Record<string, unknown>`, command registry ani osobnego modelu „simple quest”.

Coins pozostają `ItemKind = 'coin'`; nie tworzyć walletu.

## Runtime resolution

Quest progress zapisuje:

```ts
resolvedOutcomeId?: QuestOutcomeId
```

Wprowadzić jeden terminal resolution path semantycznie odpowiadający:

```ts
resolveQuest(questId, outcomeId)
```

Konkretny caller wybiera outcome; `QuestManager` nie skanuje świata w poszukiwaniu „najlepszego” wyniku.

Resolution musi:

```text
quest + selected outcome
→ terminal state
→ resolvedOutcomeId
→ reward
→ consequences
→ history / persistence
```

To samo resolution nie może zastosować reward/consequences drugi raz.

`invalidated` pozostaje technicznym/world-continuity terminal state używanym przez istniejący restore/rebuild lifecycle i nie jest outcome.

## Rewards vs consequences

**Reward** = bezpośrednie wynagrodzenie gracza: items/coins.

**Consequence** = zmiana innych systemów: player↔NPC relation, settlement reputation/renown oraz przyszłe domain-specific state changes.

Nie nazywać relation/reputation/renown rewardem i nie mieszać ich w jednym bag.

Reward items muszą korzystać z istniejącego shared `grantItem` path, razem z jego inventory-capacity i world-drop overflow semantics.

Social consequence nadal przechodzi przez narrow `applySocialConsequence(...)` seam z quests-progression-001. `ReputationManager` zachowuje ownership reputation/renown; `QuestManager` nie importuje ani nie duplikuje jego logiki.

## Relation

Usunąć globalne/implicit:

```text
+1 giver relation
+1 talk_to_npc target relation
```

Relation zmienia się tylko przez explicit `QuestConsequences.relations`.

Obecne relation-based `QuestAvailability` pozostaje bez przebudowy. Nie dodawać reputation/renown gates, prerequisites ani quest-chain graph.

## EXP

Usunąć globalny quest EXP, ponieważ obecny licznik jest tylko naliczany/persisted/renderowany i nie ma gameplay consumera.

Usunąć:

- `QuestManager.exp`,
- `getExp()`,
- default/custom quest EXP,
- `QuestEffects`,
- quest EXP persistence,
- quest EXP z HUD/Quest Log,
- powiązane tests/fixtures.

Nie zastępować go nowym progression systemem. Nie ruszać niezależnego player skill XP.

## Existing quest migration

Przenieść wszystkie istniejące questy w `QUESTS` oraz `buildLandmarkQuests()` na outcomes bez zmiany objective/world-binding semantics, poza jawnie wskazanym rebalansem.

### `relay-anna-piotr`

Jeden successful outcome. Zachować obecne zachowanie jako explicit `Anna +1`, `Piotr +1`. Brak EXP.

### `shells-dla-kasi`

Jeden successful outcome. Explicit `Kasia +1`. Brak EXP.

### `woda-dla-marka`

Świadomy rebalans:

```text
reward: shown, 5 coins
relation: Marek +1
```

Usunąć `long_sword` i zaktualizować `reportLine`, który obecnie mówi o mieczu.

### `zwiadowca`

Zachować wieloetapową strukturę. Jeden successful outcome, explicit `Piotr +1`, brak item reward i EXP.

### `zagubiona-owca`

Pierwszy realny multi-outcome quest:

```text
found_and_reported → complete → 10 coins → Anna +1
sheep_died         → failed   → no reward / no consequence
```

**Review correction:** nie używać `returned_to_owner`. Aktualny quest jedynie znajduje konkretną owcę i raportuje Annie; nie przenosi zwierzęcia, ownership ani pozycji. Dodanie „return” zmieniałoby objective semantics i wymagałoby nieistniejącego domain mechanism.

Nie dodawać `kept_for_yourself` bez prawdziwego livestock ownership transfer.

### `drewno-na-naprawe`

Zachować 15 coins. Formalne zlecenie kończy się bez relation consequence — świadomy rebalans względem dzisiejszego implicit +1.

### `grozny-wilk`

Successful outcome zachowuje `damascus_long_sword`, explicit `Anna +2` oraz dokładnie social consequence z quests-progression-001:

```text
competence +10
courage +12
benevolence +4
renown +15
```

### `wilcza-jama`

Successful outcome zachowuje `obsidian_sword`, explicit `Anna +3` oraz:

```text
competence +15
courage +18
benevolence +6
renown +25
```

### Landmark quests

Zachować obecny deterministic landmark binding. `stare-ruiny` i `zapomniany-cmentarz` dostają explicit giver +1; `slad-przy-monolicie` zachowuje explicit `Anna +2`; EXP usunąć.

## Quest Log

Rozszerzyć runtime DTO tak, aby UI dostawało gotowe:

- `id`, `title`, `description`, giver,
- state,
- current stage/objective + progress,
- `resolvedOutcomeId` / result presentation po resolution,
- promised reward tylko gdy jest jednoznaczny i `visibility = shown`.

Nie wyświetlać globalnego EXP.

Jeżeli successful outcomes mają różne rewards, Quest Log nie zgaduje jednego reward preview. Hidden reward nie ma `???` placeholdera.

Nie budować possible-outcomes preview.

## Persistence

**Review correction:** zmiana `SaveQuests` jest zmianą persisted representation. Aktualny codebase ma `CURRENT_SAVE_VERSION = 6` i realny fail-closed migration pipeline, więc implementacja musi:

1. ustawić `CURRENT_SAVE_VERSION = 7`,
2. dodać `migrateSaveV6ToV7`,
3. zarejestrować `SAVE_MIGRATIONS[6]`,
4. usunąć `quests.exp` z nowego writer contract,
5. dodać `resolvedOutcomeId?: QuestOutcomeId` do persisted progress.

**Implementation adaptation:** at implementation time `CURRENT_SAVE_VERSION` was already `7` (items-player-002 food batches), so this plan landed as `7 → 8` with `migrateSaveV7ToV8` / `SAVE_MIGRATIONS[7]`. The v6→v7 food-batch step is left untouched.

Migracja v6→v7 zachowuje progress/relations i usuwa EXP; nie resetuje historii.

Dla legacy terminal questu bez `resolvedOutcomeId` runtime `QuestManager` ma deterministycznie użyć jedynego outcome o zgodnym terminal state (`complete` albo `failed`). Nie importować quest definitions do persistence ani nie utrzymywać quest-id mappingu w `saveData.ts`. Jeżeli dla legacy terminal state istnieje 0 lub >1 pasujących outcomes, nie zgadywać — taki definition contract ma zostać wykryty przez tests.

`active`, `offered`, `not_offered`, `ready_to_report` i `invalidated` pozostają bez outcome ID.

Wzmocnić walidację `SaveQuests`/quest progress zgodnie z obecnym stylem `saveData.ts`; dziś `isSaveData()` sprawdza samo `quests` tylko jako object.

## Multi-outcome foundation

Architektura ma obsłużyć później questy typu:

```text
Znajdź sprawcę
├── oddaj go straży
├── pozwól mu odejść
└── przyjmij łapówkę
```

Każdy outcome może mieć inny state/reward/relation/social consequence. Nie trzeba dodawać takiego questa ani dialogue-choice engine w tym planie.

## Non-goals

Plan nie obejmuje:

- nowych rozbudowanych RPG quests,
- dialogue choice engine,
- generic condition/expression engine,
- quest scripting language,
- osobnego JobManager/contracts system,
- reputation/renown availability gates,
- quest chain graph,
- world problem generator,
- witness/gossip system,
- land/house/mount/helper rewards,
- replacement for removed EXP,
- global morality,
- procedural reward generation,
- pełnego economy balancing rewards.

## Testy

Rozszerzyć istniejący `src/quests/QuestManager.test.ts` oraz persistence tests. Pokryć:

- single complete outcome,
- complete + failed outcomes,
- `resolvedOutcomeId` exact-once,
- brak double reward/double consequence,
- unknown outcome bez mutacji,
- single/multiple/coin/no reward,
- shared inventory overflow grant path,
- brak implicit relation,
- explicit relation exact-once,
- `grozny-wilk` / `wilcza-jama` exact social deltas,
- `found_and_reported` / `sheep_died`,
- `invalidated` niezależne od outcomes,
- legacy terminal restore bez outcome ID,
- v6→v7 migration bez utraty progress/relations,
- usunięcie EXP z runtime/UI/save fixtures,
- existing landmark i animal-target lifecycle bez regresji.

## Dokumentacja

Po implementacji zaktualizować canonical docs opisujące quest lifecycle, persistence i UI; sprawdzić przede wszystkim:

```text
docs/STATE.md
docs/state/player-systems.md
docs/state/npc.md
docs/state/persistence.md
docs/vision/quests.md
```

Sprostować stale claims w starym planie 093, jeśli nadal są przedstawiane jako aktualny kontrakt.

Implementation notes:

`docs/plans/implementation-notes/quests-progression-002-quest-outcomes-rewards-and-consequences-implementation-notes.md`

## Kolejność implementacji

1. Typy identity/outcomes/reward/consequences.
2. Runtime quest progress + unified resolution path.
3. Explicit relation + social consequence dispatch.
4. Existing quest migration, w tym realny sheep multi-outcome.
5. EXP removal.
6. Save schema v7 + migration + restore normalization.
7. Quest Log DTO/UI.
8. Tests.
9. Canonical docs.

## Verification

### Automated

Uruchomić odpowiednie quest/reputation/persistence/UI tests, następnie typecheck i build.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji odbywa się przez GitHub workflow.

### Manual — User

User sprawdza w przeglądarce:

1. Quest Log pokazuje title/description i nie pokazuje EXP.
2. Shown reward jest widoczny; hidden/ambiguous reward nie jest ujawniany.
3. `woda-dla-marka` daje 5 coins zamiast miecza.
4. Formalny quest bez relation consequence nie zwiększa relation.
5. Personal quests zachowują jawnie authored relation changes.
6. `zagubiona-owca` zapisuje `found_and_reported` po znalezieniu+raporcie oraz `sheep_died` po śmierci targetu.
7. Rewards/consequences stosują się tylko raz.
8. Wolf quests zachowują reputation/renown z quests-progression-001.
9. Save/load zachowuje `resolvedOutcomeId`; v6 save bez outcome metadata nadal zachowuje valid quest history.
10. Inventory overflow dla quest reward nadal korzysta ze wspólnego mechanizmu.
11. Landmark i animal-target quests nie mają regresji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**