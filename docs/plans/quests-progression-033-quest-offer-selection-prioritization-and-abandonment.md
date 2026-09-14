# Plan: Quest offer selection, prioritization and abandonment

**Created:** 2026-09-14
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~quests-progression-020~~, ~~quests-progression-028~~
**Domain:** `quests-progression`  
**Type:** `feature`  
**Roadmap:** `quests-and-reputation.md`  

## Goal

Ograniczyć spam równoległych ofert questów bez ograniczania liczby aktywnych questów. NPC może mieć wiele potencjalnych questów, ale powinien eksponować tylko niewielką liczbę najbardziej właściwych w danym momencie.

System ma:

- rozdzielić `available` od `currently exposed`,
- domyślnie pokazywać 1 zwykłą nową ofertę per NPC,
- wybierać oferty deterministycznie przez ranking,
- używać relationship głównie jako prerequisite/ranking signal, nie jako sztywnego głównego capu,
- pozwalać maksymalnie 1 pilnej ofercie przebić normalny limit,
- rozdzielić `decline` oferty od `abandon` aktywnego questa,
- pozwalać na rezygnację z większości aktywnych questów,
- zachować authored exceptions dla liniowych historii,
- nie tworzyć persistent quest queue, `QuestScheduler` ani drugiego ownera quest state.

## Problem

Po obsłudze wielu quest contexts `QuestManager.onInteract()` analizuje wszystkie pasujące `QuestDef`. Dostępny `not_offered` quest może zostać zmieniony na `offered` już podczas zbierania dialogu, więc w praktyce:

```text
available → offered → visible
```

są zbyt mocno sprzężone.

Docelowo:

```text
QuestDef / world opportunity
        ↓
availability
        ↓
eligible candidate
        ↓
priority selection
        ↓
exposed offer
```

`QuestManager` nadal pozostaje właścicielem lifecycle i progressu.

## Architecture

### Derived ranking, no persistent queue

Nie dodawać `npc.questQueue[]`. Kolejność wyliczać z aktualnego stanu: quest lifecycle, availability, source state, relation, settlement standing i małych authored/source metadata. Ranking ma być deterministyczny ze stabilnym tie-breakiem po `QuestDef.id`.

### Exposure limit

Limit dotyczy tylko nowych ofert, nie:

- liczby world problems,
- liczby materialized `QuestDef`,
- liczby active quests.

Bazowo:

```text
1 normal offer per NPC
+ max 1 urgent offer bypass
```

Aktywne questy nie zajmują slotu nowych ofert; ich reminder/action/report nadal muszą być dostępne.

### Relationship

Relationship ma przede wszystkim:

- działać przez istniejące availability prerequisites,
- wpływać na ranking,
- odblokowywać bardziej osobiste questy.

Nie uzależniać pierwszej implementacji capu bezpośrednio od relation level.

### Story chains

Do zależności nadal używać istniejących `quest_outcome` prerequisites oraz stage transitions. Nie tworzyć `QuestChainManager`.

Liniowe/fabularne historie mogą nadpisywać generic decline/abandon semantics.

### World ownership

Ukrycie, decline lub abandon questa nie rozwiązuje authoritative world problem. Quest layer reprezentuje tylko możliwość udziału gracza.

## Offer metadata

Wprowadzić małą opcjonalną politykę, np.:

```ts
type QuestOfferPolicy = {
  priority?: number
  urgency?: 'normal' | 'urgent'
  exposure?: 'normal' | 'story'
}
```

Nie modelować w `QuestManager` szczegółów świata takich jak liczba wilków, stock wody czy livestock state. Source system może dostarczyć mały sygnał urgency/priority.

## Ranking

Dodać pure helper typu `rankQuestOfferCandidates(...)` dla `not_offered` questów spełniających availability i niebędących suppressed po decline.

Proponowana kolejność:

1. urgent world problem,
2. continuation istniejącej historii,
3. source importance dla givera/householdu/settlementu, jeśli istnieje,
4. relationship,
5. authored/source priority,
6. stabilny tie-break po `QuestDef.id`.

Nie używać losowości.

## Offer lifecycle

`offered` ma oznaczać faktycznie wystawioną ofertę. `onInteract()` powinno najpierw read-only zebrać istniejące contexts i eligible candidates, potem wybrać top N, a dopiero później mutować wybrane `not_offered → offered`.

Już `offered` quest powinien pozostać wystawiony do accept, decline, invalidation albo zniknięcia source; nie rotować go tylko dlatego, że ranking chwilowo się zmienił.

# Decline

`decline` dotyczy nieprzyjętej oferty i nie jest terminalnym outcome.

Preferowany flow:

```text
offered
→ decline
→ not_offered + temporary suppression
```

Wymagania:

- odrzucona oferta nie wraca natychmiast przy następnej rozmowie,
- kolejny eligible candidate może zostać pokazany,
- po cooldown/suppression zwykły quest może znów wejść do rankingu,
- world problem pozostaje bez zmian,
- nie tworzyć osobnego cooldown managera,
- suppression ma być minimalnym quest progress metadata i przetrwać save/load, jeśli wymaga tego semantyka czasu,
- story quest może wyłączyć generic decline albo mieć własny authored outcome.

Nie dodawać globalnej kary za samo decline.

# Abandonment

Dodać jawny terminalny state:

```text
active → abandoned
```

Nie używać `failed` ani `invalidated` jako substytutu świadomej rezygnacji.

Dla aktywnego questa giver może pokazać akcję:

> **Przykro mi, jednak nie dam rady ci pomóc.**

Dodać małą politykę, np.:

```ts
type QuestAbandonment = {
  allowed: boolean
  consequences?: QuestConsequences
}
```

Default ordinary quest: `allowed = true`, bez globalnej kary.

Konkretny quest może zdefiniować małą stratę relation/reputation przez istniejący `QuestConsequences`. Efekty muszą wykonać się dokładnie raz.

Dla story questów:

- `allowed = false`, albo
- authored withdrawal outcome prowadzący przez istniejące outcomes/prerequisites do alternatywnej gałęzi lub zamknięcia historii.

Porzucona instancja questa pozostaje terminalna i nie jest natychmiast ponownie oferowana. Późniejsze nowe wystąpienie world-driven problemu może stworzyć nową opportunity zgodnie z source policy, ale generic retry framework jest poza zakresem.

## Unlocking next offers

Po `complete`, `failed`, `abandoned`, `decline` albo source disappearance następna rozmowa ponownie wykonuje ranking aktualnych candidates. Nie zapisywać `nextQuestId` ani FIFO queue.

Zmiana świata może sprawić, że kolejna oferta będzie inna niż wcześniej oczekiwana.

## Relevant files

### `src/quests/quests.ts`

- dodać `abandoned` do `QuestState`,
- optional offer policy,
- optional abandonment policy,
- minimalne decline suppression metadata,
- validation nowych pól.

### `src/quests/QuestManager.ts`

- oddzielić candidate discovery od offer mutation,
- dodać deterministic ranking/selection,
- bazowy cap 1 normal + max 1 urgent,
- zachować wszystkie active/report/talk contexts,
- dodać decline action i suppression,
- dodać abandon action/state,
- reuse existing consequences,
- cleanup quest-local runtime bindings przy abandon,
- zaktualizować list/markers/export/restore.

### `src/quests/opportunities/*`

Tylko jeśli potrzebny jest mały source-owned urgency/priority seam. Nie budować schedulera.

### Persistence

Sprawdzić parsing/validation quest progress. `abandoned` i potrzebne suppression metadata muszą przeżyć save/load zgodnie z istniejącymi zasadami migracji projektu.

### UI

Reuse istniejący `QuestDialogAction`; UI ma dostać label/callback bez quest-specific logiki w Vue.

## Implementation stages

1. **Offer selection seam** — read-only candidate discovery, deterministic ranking, mutation tylko wybranych ofert, cap 1 normal.
2. **Urgency** — małe metadata/source seam i max 1 urgent bypass.
3. **Decline** — action, `not_offered + suppression`, odblokowanie kolejnego candidate.
4. **Abandonment** — `abandoned`, policy, consequences, cleanup runtime state.
5. **Story exceptions** — zablokować generic decline/abandon tam, gdzie authored flow ma własne prawa.
6. **Persistence/presentation** — save/load, markers i quest list spójne z nowymi stanami.

## Verification

- NPC z 4 eligible questami pokazuje tylko 1 normalną nową ofertę.
- niewybrane candidates pozostają `not_offered`.
- już offered quest nie rotuje arbitralnie.
- active/report/talk actions nie są ukrywane przez offer cap.
- urgent world quest może pojawić się ponad normalny cap, ale maksymalnie jeden.
- decline nie oznacza `failed` ani `abandoned` i nie wraca natychmiast.
- po decline może pojawić się kolejny candidate.
- abandon przechodzi do `abandoned` i wykonuje consequences dokładnie raz.
- abandon nie zmienia authoritative world problem.
- abandoned quest nie jest ponownie oferowany jako ta sama progress entry.
- story quest z zablokowanym generic decline/abandon nie pokazuje tych akcji.
- save/load zachowuje offered, abandoned i wymagane suppression metadata bez replay consequences.
- parallel world-fact fan-out z `quests-progression-028` pozostaje bez zmian.
- nonlinear stages z `quests-progression-032` pozostają niezależne od offer selection.

## Manual verification

User wykonuje browser verification:

1. NPC z wieloma questami nie oferuje wszystkiego naraz.
2. Po ukończeniu/decline/abandon pojawia się kolejna sensowna oferta.
3. Declined quest nie wraca od razu.
4. Opcjonalna kara relation/reputation działa tylko tam, gdzie została zdefiniowana.
5. Story quest respektuje authored wyjątki.
6. Nagły problem świata może przebić normalną ofertę, ale nie tworzy lawiny urgentów.
7. Problem świata trwa dalej po decline/abandon.

## Non-goals

- globalny Quest Scheduler,
- persistent NPC quest queue,
- globalny limit aktywnych questów,
- nowy relationship/reputation system,
- nowy quest-chain engine,
- generic world `Problem` system,
- generic repeat/retry framework,
- Quest Log redesign,
- deadlines,
- LLM ranking,
- zmiana ownership world problems.

## Guardrails

- `QuestManager` pozostaje właścicielem quest lifecycle, nie world state.
- Ranking jest derived i deterministyczny.
- Nie zapisywać kolejności kolejki.
- Bazowo 1 normalna nowa oferta per NPC.
- Maksymalnie 1 urgent ponad normalny cap.
- Relationship wpływa głównie na availability/ranking.
- `decline` i `abandon` mają odrębną semantykę.
- Decline nie może natychmiast ponownie pokazać tej samej oferty.
- World problem nie znika przez decline/abandon.
- Reuse `QuestConsequences`, prerequisites, outcomes i stage transitions.
- Nie mutować wszystkich `not_offered` podczas samego zbierania contexts.
- Dodać JSDoc do nowych publicznych/architektonicznych helperów i typów z `@domain quests-progression`, gdzie pomaga discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**