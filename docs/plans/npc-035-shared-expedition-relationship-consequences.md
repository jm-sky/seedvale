# Plan: Shared expedition relationship consequences

**Created:** 2026-09-11  
**Status:** `draft` 📝  
**Type:** feature  
**Priority:** high · **Effort:** L  
**Depends on:** npc-029, npc-032, npc-033, npc-034  
**Domain:** `npc`  
**Subdomains:** `relationships` `memory` `decision-making`  
**Tags:** `companions` `relationships` `shared-history` `social-consequences` `expedition`  
**Roadmap:** `companions.md`

> **Draft note:** ten plan opisuje roadmapowy slice „Relationship consequences”. Dependency plans `npc-029`, `npc-032`, `npc-033` i `npc-034` są obecnie draft/planned i ich finalne public seams należy ponownie zweryfikować przed implementacją. Nie tworzyć `CompanionBondSystem`, companion-specific affinity ani równoległego systemu reputation.

## Goal

Sprawić, aby rzeczywiste wspólne doświadczenia gracza i zwykłego NPC podczas wypraw, pracy i innych interakcji tworzyły trwałe osobiste konsekwencje społeczne.

Historia ma wpływać m.in. na:

- przyszłą gotowość NPC do dobrowolnej wyprawy,
- ocenę płatnych wypraw i dalszej współpracy,
- ochronę/pomoc graczowi,
- dialogue/social reactions,
- przyszłe decyzje życiowe NPC, gdy odpowiednie lifecycle systems będą istniały.

Przykładowe źródła:

- successful expedition,
- fair payment,
- unfair payment,
- non-payment,
- fighting together,
- rescue/help,
- zapewnienie food/water/shelter,
- porzucenie rannego NPC,
- niepotrzebne narażanie NPC,
- successful shared work,
- zachowanie wobec householdu NPC,
- zachowanie wobec settlementu NPC.

Docelowy przepływ:

```text
real world / expedition event
        ↓
source domain resolves what actually happened
        ↓
personal social consequence
        ↓
general Player↔NPC relationship capability
        ↓
persistent relationship/history state
        ↓
future NPC decision inputs
        ↓
join / refuse / protect / cooperate / leave / later life decision
```

Nie tworzyć:

- `CompanionBondSystem`,
- `CompanionRelationship`,
- `CompanionAffinity`,
- osobnego relationship store dla towarzyszy,
- expedition-only loyalty meter,
- quest-only wrappera dla tych zdarzeń,
- automatycznej settlement reputation z każdego prywatnego zdarzenia,
- generic omniscient event scanner.

## Ownership recon

### Current social state is split into three independent stores

Aktualny codebase posiada trzy różne systemy:

```text
NPC ↔ NPC
    src/settlement/npcRelationships.ts
    symmetric scalar pair store
    world / SettlementsManager owned
    persisted

Player ↔ NPC
    QuestManager.relations
    scalar keyed by stable NpcId
    persisted inside quests state

Player ↔ settlement
    ReputationManager
    trust / competence / benevolence / courage / integrity
    + renown
    keyed by settlementId
    persisted independently
```

Nie należy ich scalać.

### NPC↔NPC remains separate

`src/settlement/npcRelationships.ts` reprezentuje symetryczną relację między dwoma NPC.

Nie używać tego store do Player↔NPC tylko dlatego, że jego API `get/adjust` jest bardziej generalne.

Player jest semantycznie innym aktorem, a obecny quest/reputation/social stack rozróżnia te relacje świadomie.

### Settlement reputation remains separate

`src/reputation/ReputationManager.ts` jest jedynym właścicielem publicznej lokalnej opinii społeczności:

```text
trust
competence
benevolence
courage
integrity
renown
```

Ten plan nie przenosi tych danych do osobistej relacji.

Prywatne zdarzenie:

```text
player rescues NPC alone in forest
```

może zmienić Player↔NPC relationship bez jakiegokolwiek settlement reputation effect.

Settlement consequence może wystąpić tylko wtedy, gdy source integration posiada uzasadnioną podstawę wiedzy społecznej zgodną z istniejącym `SocialConsequence` contract.

### Current Player↔NPC owner is too quest-specific

Obecny:

```text
QuestManager
→ private relations: Map<NpcId, number>
→ getRelation()
→ getRelationLevel()
→ QuestConsequences.relations
```

powstał dla questów, ale jest już konsumowany poza samym quest progression przez `PlayerSocialLookup` i NPC social decisions.

Shared expedition events nie są quest events.

Dlatego Player↔NPC relationship nie powinno dłużej wymagać przechodzenia przez `QuestManager`.

## Domain decision

Plan pozostaje w domenie `npc`.

Powody:

1. głównymi producentami nowych zdarzeń są NPC expedition/work/combat/survival lifecycle,
2. głównymi konsumentami są NPC decisions,
3. roadmap Companions definiuje shared experience jako część normalnej relacji NPC z graczem,
4. quests są tylko jednym istniejącym źródłem zmian relation,
5. settlement reputation ma już osobnego właściciela niezależnego od questów.

`quests-progression` nadal konsumuje Player↔NPC relationship do prerequisites i może generować consequences z quest outcomes.

Zmiana domeny na `quests-progression` byłaby uzasadniona tylko gdyby code ownership pozostał faktycznie quest-centric. Recon pokazuje odwrotny kierunek: relationship staje się generalnym inputem NPC decisions.

## Architectural decisions

### 1. Extract general Player↔NPC relationship capability

Wydzielić obecny scalar Player↔NPC z `QuestManager` do małego general-purpose ownera.

Preferowany kierunek:

```text
PlayerNpcRelationships
```

lub inna neutralna nazwa zgodna z aktualnym naming style.

Capability ma być:

- keyed przez stable `NpcId`,
- persistent,
- sparse,
- world/playthrough scoped,
- niezależne od live `NpcAgent`,
- niezależne od quest lifecycle,
- możliwe do odczytu przez istniejący `PlayerSocialLookup`,
- możliwe do modyfikacji przez jawne social consequence call-sites.

Nie używać `NpcRelationships`, ponieważ obecny typ ma świadomie symetryczną semantykę NPC↔NPC.

### 2. Preserve existing scalar compatibility

Nie zakładać automatycznie, że roadmap wymaga od razu wielowymiarowego attachment/trust modelu.

Obecny scalar posiada rzeczywistych konsumentów:

```text
stranger
acquainted
friendly
trusted
```

oraz quest prerequisites i social decisions.

Pierwszy krok powinien zachować tę kompatybilność.

Nowy owner musi nadal wspierać odpowiednik:

```ts
get(npcId)
adjust(npcId, delta)
getLevel(npcId)
```

z obecnymi progami relation.

Migracja ownership nie może zmienić istniejących quest outcomes ani ich wartości.

### 3. Add richer history only where scalar is insufficient

Roadmap wymaga rozróżnienia sytuacji takich jak:

```text
NPC trusts player because of repeated reliable expeditions

vs

NPC generally likes player but remembers being abandoned while injured
```

Sam scalar może być zbyt ubogi do późniejszego decision making.

Nie rozwiązuj tego przez companion-specific bond dimensions.

Jeżeli recon podczas implementacji nadal potwierdzi potrzebę richer state, rozszerzyć **general Player↔NPC relationship capability** o mały bounded history/profile.

Preferowana semantyka:

```ts
type PlayerNpcRelationship = {
  value: number
  history?: readonly PlayerNpcRelationshipMemory[]
}
```

lub równoważny model.

Nie wymagać pełnego generic episodic-memory frameworka.

### 4. Shared experience memory is semantic, bounded and persistent

Historia nie powinna być raw event logiem wszystkich klatek/akcji.

Zapisywać wyłącznie znaczące społecznie resolved facts potrzebne późniejszym decyzjom.

Przykładowe kategorie:

```text
expedition_success
contract_paid_fairly
contract_unpaid
fought_together
rescued_by_player
received_critical_support
abandoned_while_injured
recklessly_endangered
shared_work_success
household_help
household_harm
```

Dokładna lista musi odpowiadać realnym call-sites istniejącym po dependency plans.

Nie dodawać kategorii bez rzeczywistego authoritative event source.

### 5. Store facts, not inferred personality conclusions

Nie persistować:

```text
trustworthyPlayer = true
loyalty = 72
goodCompanion = true
```

jeżeli można przechować realny fakt:

```text
contract_paid_fairly
rescued_by_player
expedition_success
```

NPC decision evaluator może interpretować ten fakt w kontekście personality, relation i aktualnej sytuacji.

Dzięki temu ten sam event może wpływać inaczej na różnych NPC.

### 6. Keep the history bounded

Nie tworzyć nieskończonego event journal per NPC.

Preferować jedną z małych strategii:

```text
bounded recent significant memories
```

albo:

```text
aggregated counters + last occurrence
```

zależnie od tego, czego realnie potrzebują konsumenci.

Przykład:

```ts
type RelationshipMemorySummary = {
  kind: RelationshipMemoryKind
  count: number
  lastAtDays: number
  strength?: number
}
```

Kilka powtarzających się successful expeditions nie wymaga kilkudziesięciu identycznych rekordów.

Nie tworzyć generic memory database.

### 7. Separate event occurrence from social consequence

Source domain jest odpowiedzialna za stwierdzenie:

```text
co rzeczywiście się wydarzyło?
```

Relationship layer odpowiada za:

```text
jak zapisać osobistą konsekwencję?
```

Przykład:

```text
Work Contract assignment
→ payment lifecycle resolves `paid`
→ emits/applies personal consequence
→ Player↔NPC relationship owner updates
```

Nie pozwalać relationship systemowi skanować Work Contracts i zgadywać non-payment.

Analogicznie:

```text
combat/rescue lifecycle
→ authoritative rescue event
→ personal consequence
```

a nie:

```text
relationship manager scans HP/distance every tick
```

### 8. Introduce one narrow personal social consequence seam

Istniejący settlement `SocialConsequence` jest dobrym precedentem, ale nie należy go rozszerzać w optional-field bag obejmujący wszystkie typy relacji.

Preferować osobny jawny general-purpose Player↔NPC consequence, np.:

```ts
type PlayerNpcRelationshipConsequence = {
  npcId: NpcId
  relationDelta?: number
  memory?: {
    kind: PlayerNpcRelationshipMemoryKind
    magnitude?: RelationshipMemoryMagnitude
    occurredAtDays: number
    source?: StableRelationshipSourceRef
  }
}
```

Exact shape należy dopasować do finalnych call-sites.

Nie umieszczać settlement reputation bezpośrednio w tym typie.

Call-site posiadający również podstawę wiedzy publicznej może jawnie zastosować dwa efekty:

```text
personal consequence
+
settlement SocialConsequence
```

### 9. Quest outcomes reuse the same Player↔NPC owner

Po ekstrakcji `QuestManager` nie może utrzymywać drugiej kopii relations.

Zmienić:

```text
QuestManager owns relations
```

na:

```text
PlayerNpcRelationships owns relations

QuestManager
→ reads relation for prerequisites
→ applies explicit relation consequences through injected/general seam
```

`QuestManager.exportRelations()` i quest-owned persistence powinny zostać usunięte lub zmigrowane zgodnie z finalną strukturą save.

Quest authored relation consequences pozostają semantycznie bez zmian.

### 10. PlayerSocialLookup reads the general relationship owner

Obecna dependency-injection ścieżka do `NpcAgent` jest poprawna:

```text
composition root
→ PlayerSocialLookup
→ NpcAgent
```

Zachować ją.

`NpcAgent` nie powinien importować bezpośrednio:

- relationship managera,
- `QuestManager`,
- `ReputationManager`.

Lookup nadal agreguje read-only social context:

```text
personal Player↔NPC relationship
+
settlement reputation
+
renown
```

bez mieszania ownership.

### 11. Expedition success requires a real completion boundary

Nie zapisuj `expedition_success` tylko dlatego, że NPC przez pewien czas podążał za graczem.

Źródło musi pochodzić z finalnego lifecycle `npc-029` / `npc-030` / `npc-031`.

Przykładowo:

```text
bounded expedition commitment
→ explicit successful completion
→ expedition_success consequence
```

Nie traktować:

- save/load,
- stream-out,
- temporary separation,
- follow pause,
- need interruption,

jako success/failure.

### 12. Paid expedition payment consequences come from Work Contract lifecycle

`npc-030` posiada już prawdziwe stany płatności:

```text
payment_due
paid
unpaid
uncollectable
```

Relationship consequence musi konsumować te finalne transitions.

Przykładowa semantyka:

```text
successful service + fair/full payment
→ positive personal reliability memory
→ bounded positive relation delta

payment due → unpaid after real deadline
→ strong negative reliability memory
→ negative relation delta
```

Nie karać gracza w momencie utworzenia należności.

Nie dodawać escort-only payment consequence, jeśli ten sam generic Work Contract lifecycle może emitować ją dla zwykłych pracowników.

Preferować generalizację:

```text
Work Contract payment outcome
→ Player↔NPC social consequence
```

która działa zarówno dla escort, jak i construction workers.

### 13. Combat consequences require authoritative shared-combat facts

`npc-033` powinien być źródłem informacji o realnym cooperative combat context.

Nie wystarczy:

```text
player and NPC were both near a wolf
```

Potrzebne są rzeczywiste semantics, np.:

```text
both participated in same hostile encounter
player directly helped/protected NPC
NPC directly helped/protected player
```

Jeżeli finalny combat architecture nie dostarcza wiarygodnego eventu rescue/help, ograniczyć pierwszy implementation slice do tych faktów, które można ustalić bez heurystyk.

Nie tworzyć combat-history inference przez retrospektywne skanowanie HP.

### 14. Rescue/help must be meaningful, not every heal/item transfer

Nie każdy transfer food/water/bandage jest społecznie znaczącą pomocą.

Preferować consequences tylko gdy realny kontekst wskazuje znaczenie, np.:

```text
NPC had meaningful hunger/thirst/injury need
+
player supplied resource that resolved or materially improved it
```

Nie przyznawać relationship punktów za przekładanie jedzenia między inventory bez potrzeby.

Do wykrycia eventu używać finalnych shared item/survival APIs, nie duplikować need thresholds.

### 15. Food/water/shelter consequences consume normal survival systems

`npc-032` pozostaje właścicielem expedition survival.

Ten plan może rejestrować semantic memory:

```text
player_provided_critical_food
player_provided_water
player_provided_shelter
```

tylko jeśli source system potrafi stwierdzić realne użycie/pomoc.

Nie dodawać companion provisions ledger.

### 16. Abandoning an injured NPC must come from accompany lifecycle

Nie definiować abandonment jako:

```text
distance > X
```

`npc-029` / `npc-032` mają rozróżniać:

- normal trailing,
- temporary separation,
- recovery,
- genuine commitment abandonment/termination.

Negatywny relationship event powstaje dopiero wtedy, gdy:

```text
NPC is meaningfully injured/incapacitated
+
player-controlled/source termination genuinely leaves NPC
+
shared lifecycle classifies it as abandonment
```

Nie karać za pathfinding failure, save/load lub stream-out.

### 17. Reckless endangerment must be concrete and conservative

„Niepotrzebne narażanie NPC” jest ważnym design goal, ale łatwo stworzyć omniscient heuristic.

V1 powinien obsługiwać wyłącznie przypadki, które finalne expedition/combat lifecycle umie jasno sklasyfikować.

Przykładowy późniejszy event może wymagać:

```text
known overwhelming threat
+
player continues/initiates expedition context
+
NPC continuation evaluator strongly objects/refuses
+
player explicitly persists with harmful choice
```

Jeśli takich danych nie ma, nie zgadywać.

Lepiej pozostawić ten event częściowo poza V1 niż implementować:

```text
NPC lost HP → player was reckless
```

### 18. Shared work success comes from real work completion

`npc-034` posiada semantic shared-work intent oraz actor-neutral target completion.

Relationship consequence powinien pochodzić z:

```text
NPC materially participated
+
shared work objective completed / meaningful contribution accepted
```

Nie z samego `contributeWork()` call.

Jeżeli work intent został anulowany przed meaningful contribution, brak success memory.

### 19. Household treatment uses existing real household relations

Każdy NPC posiada rodzinne/household facts z settlement generation.

Nie tworzyć osobnej `CompanionFamilyOpinion`.

Personal NPC relationship może reagować na realne zdarzenie wobec członka jego householdu, ale wymagane są dwa elementy:

1. world event faktycznie dotyczył stable NPC/household member,
2. target NPC ma podstawę, by o tym wiedzieć.

W pierwszym slice można ograniczyć się do jawnych/bezpośrednich zdarzeń, np. quest/report/payment/assistance, które już posiadają explicit social knowledge.

Nie dodawać ogólnego gossip propagation w tym planie.

### 20. Settlement treatment remains reputation-owned

Zachowanie wobec settlementu może wpływać na companion NPC pośrednio przez:

```text
settlement reputation/renown
```

które już trafiają do `PlayerSocialLookup`.

Nie kopiować settlement reputation events do każdej osobistej relacji.

Jeżeli konkretne settlement event bezpośrednio dotknęło tego NPC lub jego household, może powstać dodatkowa personal consequence.

### 21. No automatic double-counting

Jedno zdarzenie może mieć kilka poprawnych skutków, ale muszą być semantycznie odrębne.

Przykład:

```text
player rescues NPC during public village attack
```

może dać:

```text
personal:
  rescued_by_player

settlement:
  courage / competence / benevolence / renown
```

To jest poprawne.

Nie jest poprawne:

```text
personal relation +3
→ automatically convert to settlement trust
→ NPC later reads both
```

Bez jawnego social consequence.

### 22. History affects decisions through read-only summaries

Future consumers nie powinny skanować raw event history za każdym `choose()`.

Relationship capability powinno udostępnić bounded read model, np.:

```ts
get(npcId)
getLevel(npcId)
getMemorySummary(npcId, kind)
hasMemory(npcId, kind)
```

lub jeden immutable snapshot.

`npc-031` voluntary willingness powinien móc uwzględniać np.:

```text
prior expedition successes
reliable payment
rescue/help
abandonment
reckless endangerment
```

bez importowania persistence internals.

### 23. Integrate into voluntary joining

Po tym planie `npc-031` nie powinien już traktować „previous shared experiences” jako niedostępnego przyszłego konceptu.

Willingness evaluator może używać relationship history jako jednego z inputs:

```text
positive:
  successful previous expedition
  rescue/help
  reliable treatment

negative:
  non-payment
  abandonment while injured
  repeated harmful expedition outcomes
```

Historia ma modyfikować decyzję, nie gwarantować wyniku.

Personality, obligations, danger i current state nadal mogą przeważyć.

### 24. Integrate into combat cooperation

`npc-033` może używać personal relation/history do protection willingness.

Nie tworzyć:

```text
combatLoyalty
```

Relationship/history to tylko jeden kontekst obok:

- active commitment,
- health,
- injury,
- equipment,
- personality,
- threat severity.

### 25. Later life decisions are consumers, not part of this plan

Roadmap przewiduje:

```text
shared history
→ possible long-term relocation / household change
```

Ten plan ma dostarczyć trwały input potrzebny do takiej decyzji.

Nie implementować:

- relocation,
- marriage,
- household restructuring,
- player-home adoption,
- permanent companion status.

Future lifecycle plan ma czytać istniejący Player↔NPC relationship capability, nie tworzyć własnego attachment store.

## Relationship model

### Scalar remains the general affinity baseline

Zachować istniejący relation scalar jako szeroki wynik dotychczasowej osobistej relacji.

Przykładowe events nadal mogą wpływać na niego małymi/średnimi deltami.

Nie trzeba na tym etapie nadawać każdej memory osobnego trwałego numeric dimension.

### History carries directional meaning

Scalar odpowiada na pytanie:

```text
jak ogólnie wygląda relacja?
```

History odpowiada:

```text
dlaczego?
jakie istotne rzeczy wydarzyły się między tym NPC a graczem?
```

Przykład:

```text
relation = friendly

history:
- 2 successful expeditions
- rescued_by_player ×1
- contract_unpaid ×1
```

może prowadzić do innej decyzji niż:

```text
relation = friendly

history:
- household_help ×3
```

mimo identycznego scalaru.

### Avoid premature emotional dimensions

Nie dodawać jeszcze stałych:

```text
trust
attachment
respect
fear
loyalty
```

na Player↔NPC relation tylko dlatego, że roadmap wspomina richer dimensions.

Najpierw wykorzystać:

```text
scalar
+
semantic significant-history summary
+
existing settlement reputation dimensions
+
personality
```

Jeśli przyszłe decyzje nadal wymagają orthogonal personal dimensions, rozszerzyć wtedy ten sam general relationship owner.

## Event/memory semantics

Pierwszy implementation slice powinien zawierać tylko event kinds posiadające wiarygodne source APIs po dependency implementation.

Docelowy katalog może obejmować:

| Event | Typical personal relation | Persistent semantic |
|---|---:|---|
| successful expedition | small positive | reliability/shared success |
| fair payment | positive | agreement reliability |
| non-payment | strong negative | broken agreement |
| fought together | small/meaningful positive | shared danger |
| rescued/helped | meaningful positive | direct assistance |
| critical food/water/shelter support | small/meaningful positive | care/reliability |
| abandoned while injured | strong negative | abandonment |
| reckless endangerment | negative | unsafe expedition partner |
| successful shared work | small positive | cooperation |
| household help | positive | help to close relation |
| household harm | negative | harm to close relation |

Exact deltas nie powinny być przypadkowymi wartościami per call-site.

Preferować małą magnitude vocabulary analogiczną do istniejącego reputation planu, np.:

```text
minor
meaningful
major
```

oraz centralne deterministic mapping do relation delta.

Nie kopiować settlement reputation magnitude bezpośrednio 1:1; skale mają inną semantykę.

## Duplicate/idempotency semantics

### Terminal events apply once

Events takie jak:

```text
expedition_success
payment_paid
payment_unpaid
shared_work_completed
```

muszą być zastosowane exactly once per semantic source.

Nie polegać wyłącznie na:

```text
relation manager remembers event id forever
```

jeżeli source lifecycle już posiada terminal state.

Preferować source-owned idempotency:

```text
contract transitions once
→ consequence once
```

oraz stable source ref w memory wyłącznie tam, gdzie pomaga diagnostyce/deduplikacji.

### Repeated experiences may aggregate

Kolejne niezależne wyprawy mogą każda wpływać na historię.

Bounded history może agregować:

```text
expedition_success:
  count = 4
  lastAtDays = ...
```

Nie traktować powtarzalnych valid events jako duplicates tylko dlatego, że mają ten sam kind.

## Persistence

### Extract existing relation persistence without losing saves

Dzisiaj:

```text
SaveData.quests.relations
```

jest persisted Player↔NPC scalar store.

Jeżeli owner zostanie wydzielony, persisted representation musi zostać przeniesione do jawnego general-purpose segmentu albo innego właściwego authoritative state.

Preferowany kierunek:

```text
playerNpcRelationships
```

jako top-level save section lub równoważny neutralny segment.

Nie umieszczać relationship history w `npcStates`, ponieważ jest to relacja player↔NPC, a nie intrinsic authoritative state NPC.

Nie umieszczać jej w `reputation`.

### Save migration is required if representation moves

Przeniesienie:

```text
quests.relations
→ playerNpcRelationships
```

jest zmianą persisted representation.

Wymaga normalnego `CURRENT_SAVE_VERSION` bump i migration zgodnej z aktualnym migration pipeline.

Migration musi zachować wszystkie istniejące scalar relations 1:1.

Legacy save nie posiada history, więc:

```text
history = empty
```

Nie inferować memories z completed quests ani relation score.

### New Game/reset

General relationship owner musi zostać resetowany razem z nowym światem/playthrough.

`QuestManager.reset()` po ekstrakcji nie może odpowiadać za relation reset.

### WorldBundle rebuild

Relationship owner nie może należeć do lifecycle pojedynczego settlement runtime ani `NpcAgent`.

`WorldBundle` reconstruction nie może kasować osobistej historii.

## Expected integration points

Zweryfikować podczas implementacji:

- `src/quests/QuestManager.ts`
  - usunięcie ownership `relations`,
  - injected relationship read/write seam,
  - quest prerequisites,
  - explicit quest relation consequences.

- `src/quests/quests.ts`
  - zachowanie `RelationLevel`,
  - ewentualne przeniesienie neutralnych relation types/helpers z quest-owned location.

- new neutral Player↔NPC relationship module
  - authoritative scalar,
  - bounded history,
  - persistence serialization,
  - public read/write API.

- `src/app/createApp.ts`
  - composition ownership,
  - `PlayerSocialLookup`,
  - QuestManager injection,
  - relationship consequence integration.

- `src/app/saveState.ts`
  - serialization ownership.

- `src/persistence/saveData.ts`
  - new representation,
  - validation,
  - migration from `quests.relations`.

- `src/ai/NpcAgent.ts` / existing social lookup consumers
  - read-only usage only; no direct manager import.

- `src/world/workContract.ts` / `createWorkContracts.ts`
  - payment terminal events, using final implementation from `npc-030`.

- final accompany lifecycle from `npc-029`
  - expedition completion/abandonment semantic events.

- final survival continuation lifecycle from `npc-032`
  - meaningful injured abandonment/support contexts.

- final combat cooperation seam from `npc-033`
  - shared combat/help/rescue events where authoritative.

- final shared-work seam from `npc-034`
  - successful shared work completion.

- `src/reputation/ReputationManager.ts`
  - unchanged authority;
  - reuse existing `SocialConsequence` only for independently justified settlement-level effects.

Important public relationship lifecycle/read APIs should receive concise JSDoc with `@domain npc` where useful for preflight discovery.

## Scope

Includes:

- extracting Player↔NPC scalar ownership from `QuestManager`,
- preserving current relation levels and existing quest behaviour,
- general Player↔NPC relationship capability,
- persistent bounded significant shared-history representation,
- narrow personal social consequence seam,
- expedition completion consequences,
- Work Contract payment outcome consequences,
- real shared-combat/help consequences where final combat APIs support them,
- meaningful survival support consequences,
- injured-abandonment consequence,
- shared-work completion consequence,
- explicit household-related personal consequences where social knowledge is available,
- keeping settlement reputation/renown separate,
- integration with voluntary joining and future NPC decision inputs,
- persistence migration,
- diagnostics/tests.

## Non-goals

- `CompanionBondSystem`,
- companion-only relationship fields,
- merging NPC↔NPC relationships with Player↔NPC relationships,
- merging Player↔NPC relationship with settlement reputation,
- generic gossip/witness propagation,
- omniscient settlement knowledge,
- full generic episodic memory framework,
- unlimited raw event log,
- full emotional simulation,
- permanent companion state,
- long-term relocation/household migration,
- marriage/family formation,
- generic life-decision framework,
- quest system redesign,
- rewriting all social dialogue,
- companion loyalty meter,
- retroactively inferring memories from old saves,
- LLM-driven relationships.

## Related plans

### `npc-029` — NPC accompany/follow commitment

Hard dependency for real expedition lifecycle boundaries.

This plan consumes successful completion, explicit abandonment/end and stable source identity where available.

### `npc-030` — Paid expedition escort Work Contracts

Related producer.

Payment/fairness/non-payment must come from the real Work Contract payment lifecycle.

Do not implement separate escort payment history.

`npc-030` does not need to be a hard dependency for general relationship extraction, but the paid-expedition consequence slice cannot be completed until its final lifecycle exists.

### `npc-031` — Voluntary expedition joining

Primary consumer.

Its current plan deliberately defers previous shared experiences because no general relationship-history store exists yet.

After this plan, voluntary willingness should consume the new general relationship read model.

### `npc-032` — Expedition needs and survival

Producer/context owner for meaningful survival support and genuine continuation/abandonment semantics.

Do not duplicate hunger/thirst/injury thresholds.

### `npc-033` — Companion combat cooperation

Producer/context owner for real shared combat/protection/rescue events.

Do not infer them from proximity.

### `npc-034` — Expedition shared work and activities

Producer for real shared-work completion.

Do not award relationship effects merely because an NPC was assigned a work intent.

### `quests-progression-001` — Reputation & Renown Foundation

Preserve its central distinction:

```text
personal relation
!= settlement reputation
!= renown
```

`ReputationManager` remains unchanged owner.

### `quests-progression-002` — Quest Outcomes, Rewards & Consequences

Preserve explicit quest relation consequences.

Quest outcomes remain one source of Player↔NPC consequences but no longer own the relation store itself.

### NPC↔NPC relationships

`src/settlement/npcRelationships.ts` remains the symmetric ordinary NPC pair relationship owner.

Do not reuse it as Player↔NPC storage unless a later deliberate general actor-relationship architecture replaces both with equivalent semantics.

## Implementation order

1. Re-run preflight after `npc-029`–`npc-034` relevant dependencies have landed and verify final lifecycle/event seams.
2. Extract current Player↔NPC scalar ownership from `QuestManager` into a neutral persistent relationship capability without behavioural changes.
3. Move `RelationLevel` helpers/types only as far as needed to remove quest ownership while preserving quest APIs.
4. Migrate save representation from quest-owned relations to the new authoritative relationship segment.
5. Rewire:
   - QuestManager prerequisites/consequences,
   - `PlayerSocialLookup`,
   - existing NPC social consumers.
6. Add the narrow `PlayerNpcRelationshipConsequence` write seam.
7. Add bounded semantic shared-history state with aggregation/idempotency rules.
8. Connect only authoritative event producers available from final dependency APIs:
   - expedition success/end,
   - Work Contract payment result,
   - shared work completion,
   - survival support/abandonment,
   - cooperative combat/help where reliable.
9. Update `npc-031` willingness evaluation to consume shared-history summaries.
10. Extend diagnostics/debug inspection.
11. Add persistence, migration and regression tests.
12. Update state documentation with final ownership.

## Verification

### Automated — ownership migration

Verify:

- existing Player↔NPC scalar values survive migration unchanged,
- quest prerequisites read identical relation levels before/after extraction,
- authored quest relation consequences update the new owner exactly once,
- `QuestManager` no longer holds an authoritative relation copy,
- New Game clears relationship state,
- save/load preserves scalar + new history,
- WorldBundle rebuild preserves relationship state.

### Automated — store separation

Verify:

```text
Player↔NPC consequence
```

does not mutate:

```text
NPC↔NPC relationship
settlement reputation
renown
```

unless caller separately applies an explicit settlement `SocialConsequence`.

Also verify settlement reputation changes do not rewrite personal relationship history.

### Automated — expedition consequences

After final accompany lifecycle exists:

- successful bounded expedition records exactly one success consequence,
- temporary separation does not,
- hunger/rest/combat interruption does not,
- save/load/reconstruction does not duplicate it,
- genuine failed/abandoned expedition uses its explicit terminal semantics.

### Automated — payment

After final paid escort lifecycle exists:

- `payment_due` alone produces no final payment memory,
- real `paid` transition applies fair-payment consequence once,
- real terminal non-payment applies non-payment consequence once,
- save/load around payment does not duplicate consequences,
- generic Work Contract workers can reuse the same payment consequence path where applicable.

### Automated — survival/help

Where final APIs support it:

- ordinary item transfer without need creates no help memory,
- meaningful resource use resolving a real need may create the configured support memory,
- genuine injured abandonment creates one strong negative memory,
- pathfinding separation/recovery does not count as abandonment.

### Automated — combat

Where authoritative event APIs exist:

- merely standing near the same hostile actor produces no shared-combat memory,
- meaningful participation may produce one bounded shared-combat event,
- direct rescue/protection only records when the combat lifecycle can prove it,
- one combat encounter cannot spam relationship changes each frame/attack.

### Automated — shared work

- assigning work alone does not change relationship,
- meaningful successful participation/completion does,
- cancellation/no contribution does not,
- repeated separate projects may aggregate as repeated history.

### Automated — decision consumption

For `npc-031`, verify otherwise-equivalent NPCs can evaluate differently based on history:

```text
successful previous expeditions
> no shared history
> prior abandonment/non-payment
```

while strong household obligations, danger or critical needs can still outweigh positive history.

### Automated — regressions

Verify unchanged behaviour for:

- NPC↔NPC campfire conversation relations,
- quest availability,
- quest authored consequences,
- settlement reputation/renown,
- NPC spontaneous reaction logic,
- NPCs with no expedition history,
- saves with legacy quest-owned relations.

### Manual browser verification — User

AI does not perform browser verification.

User should verify at least:

1. NPC with successful previous expedition is visibly more willing to join again than an otherwise similar stranger.
2. NPC unpaid after a real contract responds less favourably later.
3. Rescue/help has a persistent effect across save/load.
4. Temporary separation during travel does not look like abandonment.
5. An injured NPC genuinely left behind reacts negatively later.
6. Successful shared work affects the relationship only after meaningful participation.
7. Private personal events do not unexpectedly change settlement reputation.
8. Public settlement consequences remain visible through existing reputation/renown UI independently of personal relation.

## Completion criteria

Plan jest complete, gdy:

```text
real shared event
→ authoritative source resolves outcome
→ personal consequence
→ one general Player↔NPC relationship owner
→ scalar + bounded meaningful history persist
→ ordinary NPC decisions can consume that history
```

oraz:

```text
Player↔NPC relationship
!= NPC↔NPC relationship
!= Player↔settlement reputation/renown
```

pozostaje prawdziwe w kodzie, persistence i gameplay.

W szczególności kolejne wyprawy muszą móc korzystać z realnej wcześniejszej historii bez wprowadzania `CompanionBondSystem`, companion loyalty ani quest-owned relationship state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
