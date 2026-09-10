# Plan: Stable NPC identity for quests

**Created:** 2026-09-10  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** none  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `relationships`  
**Tags:** `npc-identity` `multi-settlement` `quest-runtime`  
**Roadmap:** `quests-and-reputation.md`

## Cel

Przygotować obecny system questów do bezpiecznej pracy z proceduralnymi NPC i wieloma osadami.

Dzisiaj część questowych referencji do NPC nadal opiera się na nazwach, m.in. giver, cele rozmowy oraz quest-facing relation prerequisites/consequences. Jednocześnie NPC posiadają stabilne `npc.id`.

Display name nie może być authoritative identity, ponieważ w różnych osadach mogą istnieć NPC o tej samej nazwie.

Plan wprowadza minimalny quest-facing mechanizm stabilnej tożsamości NPC bez pełnego refaktoru wszystkich systemów NPC i relationships.

## Problem

Obecny model jest bezpieczny głównie dla ręcznie przygotowanych questów związanych z niewielkim zestawem znanych NPC. Przy proceduralnych osadach możliwa jest sytuacja:

```text
settlement:A
  npc:A:7
  name = Jan

settlement:B
  npc:B:3
  name = Jan
```

Quest „Porozmawiaj z Janem” nie może być rozstrzygany przez porównanie display name, ponieważ gracz może porozmawiać z niewłaściwym NPC.

Ten sam problem dotyczy:

- givera,
- targetów etapów,
- quest markers,
- relation prerequisites,
- relation consequences.

## Docelowy model

Quest powinien odnosić się do konkretnego NPC przez stabilną tożsamość:

```text
Quest
  → stable npcId
  → NPC resolver
  → runtime NPC / display name
```

Quest definitions i persisted quest progress mogą zawierać stabilną identity NPC, ale nigdy runtime `NpcAgent` reference. Rozwiązywanie identity → runtime NPC odbywa się tylko na granicach integracyjnych, które faktycznie potrzebują załadowanej encji, np. interaction, marker rendering lub dialogue.

Nie kopiować authoritative NPC state do systemu questów.

## Zakres

### 1. Wspólna questowa referencja do NPC

Wprowadzić minimalny współdzielony kontrakt reprezentujący konkretnego NPC.

Kontrakt musi zawierać authoritative stable NPC identity. Preferować istniejący typ NPC ID, jeśli można go użyć bez niepożądanego sprzężenia; nie tworzyć nowego globalnego identity type bez potrzeby.

Display name powinien być rozwiązywany z NPC, chyba że aktualny authored-text pipeline rzeczywiście wymaga snapshotu nazwy. Nie przesądzać w planie, że quest reference musi duplikować `name`.

### 2. Quest giver

Rozszerzyć `QuestDef`, tak aby giver był identyfikowany przez stabilną referencję zamiast traktowania samego `giverName` jako authoritative key.

Istniejące authored quests należy zmigrować bez zmiany ich gameplayu.

### 3. `talk_to_npc`

Zmienić quest objectives wskazujące konkretnego NPC tak, aby rozstrzygały interakcję przez stable NPC identity.

Dotyczy co najmniej:

- `talk_to_npc`,
- `talk_to_npc_choice`.

Rozmowa z NPC o tej samej nazwie, ale innym ID, nie może zaliczać etapu.

### 4. NPC interaction dispatch

Obecny quest interaction path powinien otrzymywać stabilną identity NPC zamiast samego display name.

Nie importować `NpcAgent` do `QuestManager`. Przekazywać wyłącznie wąski quest-facing identyfikator.

### 5. Quest markers

Marker questa nad NPC musi być związany z właściwym stable NPC ID.

Dotyczy co najmniej:

- giver offer marker,
- giver report/reminder marker,
- `talk_to_npc` target marker,
- `talk_to_npc_choice` target marker.

Nie wyszukiwać marker targetu wyłącznie po nazwie.

## Relation prerequisites i consequences

Quest-facing relation references również muszą jednoznacznie wskazywać właściwego NPC.

Dotyczy:

```text
QuestAvailability
  relation

QuestOutcome
  consequences.relations
```

### Guardrail

Nie wykonywać w tym planie pełnego refaktoru całego relationship/social systemu.

Najpierw ustalić najmniejszą zmianę pozwalającą questowi jednoznacznie wskazać relationship target.

Jeżeli authoritative relationship state nadal jest name-keyed i nie da się bezpiecznie użyć stable NPC identity bez poprawienia jego ownership/contract, potraktować to jako jawny blocker lub dependency. Nie tworzyć adaptera `npcId → name`, który ponownie sprowadza identity do nieunikalnej nazwy.

Nie tworzyć drugiego relation store należącego do questów.

## Cross-settlement references

Rozwiązanie musi obsługiwać:

```text
giver: settlement A
target: settlement B
```

Jest to wymagane przez przyszłe questy międzyosadowe.

Quest nie może zakładać, że target NPC należy do settlement givera ani że target musi znajdować się w aktualnie załadowanej osadzie.

Stable identity ma przetrwać settlement stream-out/in.

## Settlement streaming

NPC mogą zostać usunięci z runtime wraz ze stream-out osady i odtworzeni później.

Quest zachowuje stable NPC ID, a nie runtime object reference. Po ponownym stream-in istniejący resolver powinien móc odnaleźć NPC o tej samej stabilnej identity.

Nie persistować:

- `NpcAgent`,
- Three.js objects,
- marker objects,
- runtime references.

## Persistence

Existing quest progress persistence musi nadal działać.

Jeżeli quest definitions zawierają stabilne NPC refs, save/load aktywnego questa musi zachować właściwy target:

```text
save
→ world rebuild
→ settlement stream-in
→ NPC recreate
→ same stable npcId
→ quest still targets same NPC
```

Nie dodawać nowego persistence store, jeśli obecny `QuestDef` + `QuestProgressEntry` wystarcza.

## Authored quests migration

Istniejące questy w `src/quests/quests.ts` muszą zostać zmigrowane do nowego modelu bez zmiany ich zachowania.

Jeżeli authored content obecnie podaje wyłącznie nazwę, composition root powinien rozwiązać authored NPC context do konkretnej stable identity tam, gdzie istnieje jednoznaczny settlement/NPC context.

Nie zachowywać runtime fallbacku „match any NPC by name” dla proceduralnych questów. Backward compatibility może być ograniczona do etapu materializacji authored definitions.

## Existing mechanisms to reuse

Wykorzystać:

- stabilny `NpcAgent.id`,
- deterministyczne NPC identity per settlement,
- istniejący `QuestManager`,
- injected resolvers/lookups,
- istniejący quest lifecycle,
- istniejący NPC interaction pipeline,
- istniejący relation/reputation system,
- istniejący settlement streaming lifecycle,
- istniejącą quest persistence.

Nie tworzyć:

```text
QuestNpcManager
QuestNpcRegistry
QuestRelationshipStore
```

## Relevant files / systems

Przed implementacją zweryfikować co najmniej:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/QuestManager.test.ts
src/app/createApp.ts

src/settlement/createSettlement.ts
src/settlement/SettlementsManager.ts
src/settlement/npcState.ts

NPC interaction/dialogue dispatch
quest marker integration
relationship/social state
quest save/load integration
```

Uwzględnić istniejące implementation notes dotyczące entity identity lifecycle, entity identity transfer continuity oraz quest outcomes/relations. Aktualny kod ma pierwszeństwo nad wcześniejszymi notes.

## Decyzje architektoniczne

### A. Stable NPC ID jest authoritative

Porównania quest targetów wykonujemy przez stabilną identity, nie display name.

### B. Display name jest presentation data

Nie używać nazwy jako authoritative identity key.

### C. QuestManager pozostaje NPC-agnostic

Nie może posiadać `NpcAgent`, `SettlementsManager` ani `NpcStateRegistry`. Ma znać wyłącznie wąskie quest-facing refs/resolvers.

### D. Nie robić globalnego identity refactoru

Plan nie jest pretekstem do migracji każdego użycia `npcName` w całym projekcie. Zmienić tylko ścieżki wymagane przez questy.

### E. Nie wiązać identity z aktualnym runtime

Stable ID musi działać niezależnie od kamery, aktualnie załadowanej osady i aktualnej instancji `NpcAgent`.

### F. Nie ukrywać problemu relationships za adapterem do nazwy

Jeżeli quest-facing relation path nie może bezpiecznie używać stable identity, należy naprawić minimalny authoritative contract lub zgłosić blocker. Nie mapować stable ID z powrotem do display name jako rozwiązania docelowego.

## Testy

### Unit — quest identity

Pokryć w `QuestManager` i bezpośrednio związanych testach:

- dwóch NPC ma identyczny display name, ale różne stable IDs,
- quest targetuje tylko właściwego NPC,
- rozmowa z niewłaściwym NPC nie kończy `talk_to_npc`,
- `talk_to_npc_choice` rozpoznaje właściwego NPC,
- giver identity nie koliduje przy duplicate names,
- relation prerequisite/consequence trafia do właściwego targetu, jeśli relation contract jest objęty zmianą.

Przykład invariant:

```text
NPC A: settlement-a:npc:3, name Jan
NPC B: settlement-b:npc:7, name Jan
quest target = NPC B

interact A → stage remains active
interact B → stage completes
```

### Integration — lifecycle boundaries

Testy integracyjne powinny pokryć odpowiednie istniejące seams zamiast budować duży mock `SettlementsManager` wewnątrz `QuestManager.test.ts`:

- NPC interaction dispatch przekazuje stable identity,
- quest marker rozwiązuje właściwego NPC,
- save/load zachowuje target identity,
- settlement stream-out/in odtwarza właściwy target,
- cross-settlement target działa po ponownym załadowaniu osady.

### Regression — authored quests

Istniejące authored quests powinny nadal:

- oferować się jak wcześniej,
- przechodzić etapy,
- kończyć się,
- wypłacać rewards/consequences,
- zachowywać dotychczasowy dialogue flow.

## Non-goals

Plan nie obejmuje:

- generatora questów,
- world-driven quests,
- RPG quest matrices,
- generic quest DSL,
- generic condition system,
- procedural dialogue,
- nowych NPC lifecycle mechanics,
- międzyosadowej ekonomii,
- pełnego refaktoru relationships,
- zmiany NPC naming system,
- zmian settlement generation,
- zmian quest reward design.

## Kolejność implementacji

1. Zweryfikować authoritative NPC ID type, generation i resolver paths.
2. Zweryfikować relationship ownership i ustalić, czy quest-facing relation refs mogą przejść na stable identity bez cross-domain refaktoru.
3. Zdefiniować minimalny quest-facing NPC reference.
4. Przenieść giver identity z name-only na stable identity.
5. Zmienić `talk_to_npc` i `talk_to_npc_choice`.
6. Zmienić NPC interaction dispatch.
7. Zmienić quest markers.
8. Przenieść quest-facing relation prerequisites/consequences na stable identity, o ile krok 2 potwierdzi bezpieczny contract; w przeciwnym razie zatrzymać się na jawnym blockerze zamiast dodawać name adapter.
9. Zmigrować authored quests/materialization.
10. Zweryfikować save/load i settlement streaming na istniejących integration seams.
11. Rozszerzyć regression tests.

## Implementation notes

Podczas implementacji utworzyć:

```text
docs/plans/implementation-notes/quests-progression-015-stable-npc-identity-for-quests-implementation-notes.md
```

Notes powinny zapisać:

- dokładny authoritative typ NPC ID,
- gdzie i jak jest generowany,
- NPC resolution path,
- interaction dispatch path,
- marker resolution path,
- relationship ownership i contract,
- persistence implications,
- authored quest migration path,
- konkretne call-sites wymagające zmiany,
- ewentualny realny blocker wymagający osobnego dependency.

Nie powtarzać w notes treści planu.

## JSDoc / preflight

Dodać JSDoc dla ważnych nowych publicznych typów i resolverów. Tam gdzie pomaga discovery, użyć `@domain quests-progression`.

Dokumentacja kontraktu powinna jasno zaznaczać:

```text
stable NPC identity is authoritative
display name is not identity
runtime NPC references are not quest state
```

## Weryfikacja

AI:

- typecheck,
- relevant unit tests,
- quest regression tests,
- odpowiednie integration/persistence tests,
- build zgodnie ze standardem repo.

AI nie wykonuje browser verification. Manualną weryfikację gameplay wykonuje użytkownik.

## Definition of Done

Plan jest zakończony, gdy:

- quest giver posiada stable NPC identity,
- `talk_to_npc` używa stable NPC identity,
- `talk_to_npc_choice` używa stable NPC identity,
- quest markers wskazują właściwego NPC,
- quest-facing relation references nie kolidują przy duplicate names albo został zidentyfikowany i jawnie wydzielony realny authoritative blocker bez name-based workaround,
- quest może wskazać NPC z innej osady,
- settlement streaming nie zrywa target identity,
- save/load zachowuje właściwe targety,
- istniejące authored quests działają bez regresji,
- `QuestManager` nadal nie posiada NPC runtime state,
- quest definitions/progress nie przechowują runtime NPC references,
- nie powstał równoległy identity/relationship system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
