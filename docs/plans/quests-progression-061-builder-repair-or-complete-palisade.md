# Plan: Builder — Complete an Unfinished Palisade Segment

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `progression`
**Tags:** `builder` `palisade` `construction` `world-consequence`
**Roadmap:** `quests-professions-and-world-consequences.md`
**Model:** Sonnet, Composer

## Cel

Dodać krótki contextual Builder quest oparty wyłącznie na istniejącym realnym lifecycle budowy palisady:

```text
real authored unfinished PalisadeSegmentRecord przy palisadzie osady
→ lokalny Builder/coordinator prosi o pomoc
→ player i/lub NPC wykonują zwykłą pracę konstrukcyjną
→ ten sam segment osiąga PALISADE_REQUIRED_WORK
→ normalny palisade domain pokazuje pełny segment i collider
→ stan pozostaje po save/load
```

V1 to **complete**, nie repair.

Filename zostaje bez rename'u, żeby nie łamać istniejących roadmap/index/backlink references, ale zakres planu jest jednoznaczny: `repair` nie należy do V1.

## Recon — decyzja V1

Aktualny kod pokazuje dwa różne mechanizmy.

### Palisade construction

`src/world/palisade.ts` / `src/world/createPalisades.ts` mają gotowy właściwy lifecycle:

- `PalisadeSegmentRecord.id`;
- `completedWork`;
- `PALISADE_REQUIRED_WORK`;
- `palisadeRemainingWork()`;
- `isPalisadeConstructionComplete()`;
- `Palisades.contributeWork(id, amount)`;
- player `workOnPalisade()`;
- NPC Work Contract `{ kind: 'palisade', targetId }`;
- persistence przez `SaveData.palisades`.

### Settlement structure repair

`settlements-007` ma osobny repair domain:

- `SettlementStructureStateRegistry`;
- stable identity przez `VillageBuildingPlan.id`;
- condition `0..100`;
- `RepairProgress`;
- `SettlementsManager.getStructureSnapshot()` / `listRepairProblems()`.

Dzisiejsza settlement palisade nie należy do tego registry.

### Settlement palisade generation

`src/settlement/settlementPalisade.ts` produkuje gotowe `SettlementPalisadePlacement[]` dla presentation/collision.

Te placementy:

- są deterministyczne;
- nie mają mutable construction progress;
- nie mają condition/repair state;
- nie mają persistent per-segment identity.

Rozszerzenie tego systemu o condition + repair tylko dla questa byłoby nowym mechanizmem.

**Decyzja:** V1 wykorzystuje istniejący `PalisadeSegmentRecord` i jego construction lifecycle. Repair pozostaje poza zakresem.

## Quest context

V1 materializuje **jeden deterministycznie wybrany contextual quest w świecie**, tak jak finalny plan quests-progression-060.

Nie tworzyć generic Builder quest generatora ani kopii w każdej osadzie.

Eligibility:

```text
settlement ma realną palisadę
+ istnieje stabilny odpowiedni adult giver
+ istnieje poprawne miejsce dla jednego unfinished segmentu przy tej palisadzie
+ authored target istnieje i nie jest ukończony
→ quest może być oferowany
```

Brak któregoś warunku → quest nie materializuje się / nie jest offerable.

## Real target

Quest targetuje zwykły world-owned:

`PalisadeSegmentRecord`

Nie targetuje:

- `Object3D`;
- instanced settlement-wall mesh;
- placement-array index;
- quest-local structure object;
- wpisu w structure-repair registry.

### Stable identity

Normalny `Palisades.place()` używa czasu w ID i nie nadaje się do authored quest bindingu.

Dodać w `Palisades` mały idempotentny seam jawnego authored ID, zgodny z wzorcem wybranym w quests-progression-060.

Docelowa identity:

`palisade:authored:builder-unfinished:<settlementId>`

Quest ID:

`world:builder-complete-palisade:<settlementId>`

ID nie zależy od:

- display name;
- runtime NPC;
- mesh/Object3D;
- coordinates jako jedynego klucza;
- array index;
- load order;
- `Date.now()`.

### Authored provenance

Rozszerzyć `PalisadeSegmentRecord` o minimalne opcjonalne provenance settlement infrastructure, np.:

```ts
authored?: {
  settlementId: string
  authoredKey: 'builder-unfinished'
}
```

To provenance:

- jest persistowane razem z rekordem;
- nie tworzy drugiego ownera stanu;
- pozwala normalnemu interaction/removal path rozpoznać, że ten segment jest authored local infrastructure;
- zapobiega implementacji policy przez parsowanie prefiksu string ID.

Authored target nie powinien udostępniać zwykłego `[R] Usuń segment palisady`, bo nie jest prywatną konstrukcją gracza.

## Target placement

Nie zastępować istniejącego instanced settlement segmentu.

Zamiast tego znaleźć jedno realne miejsce dla **kontynuacji istniejącego odcinka** przy końcu wygenerowanej palisady.

Focused resolver, np. `src/quests/builderCompletePalisade.ts`, powinien:

1. przejść settlement contexts w stabilnej kolejności;
2. wymagać non-empty `resolveEntrancePalisadePlacements()`;
3. wyznaczyć mały bounded zestaw continuation candidates przy końcach istniejącego odcinka;
4. odrzucić gate/road/coast/obvious overlap;
5. użyć normalnych palisade ground/clearance constraints tam, gdzie obecny seam je udostępnia;
6. wybrać pierwszy deterministyczny poprawny candidate;
7. utworzyć/reuse authored `PalisadeSegmentRecord` z powyższym stable ID.

Nie wykonywać losowych retries.

Target sam jest stable przez własne ID; nie bindujemy questa do indeksu `SettlementPalisadePlacement`.

## Initial state

Nowy authored segment ma być prawdziwie unfinished:

```text
completedWork < PALISADE_REQUIRED_WORK
```

Preferowany V1:

`completedWork = 0`

Dzięki istniejącemu `createPalisades.ts`:

- segment jest fizycznie widoczny jako niższy/in-progress;
- rezerwuje footprint;
- nie ma funkcjonalnego collidera;
- po completion automatycznie staje się full-height i dostaje zwykły collider.

Nie dodawać osobnego `questPalisadeProgress`.

## Materials

Current palisade lifecycle zużywa:

`PALISADE_MATERIAL_REQUIREMENTS = 2 × beam`

przy **placement**, przed rozpoczęciem work progress.

Po utworzeniu unfinished `PalisadeSegmentRecord` domain nie ma kolejnego material-delivery gate.

Dlatego ten quest ma jedno real-state objective i **nie** dodaje fake item-fetch stage.

Narracja:

> „Ten odcinek palisady został zaczęty, ale wciąż brakuje nam rąk do pracy.”

Nie:

> „Przynieś belki”

chyba że sam palisade domain zostanie kiedyś rozszerzony o realny construction-material delivery po placement.

## Quest giver

W `src/ai/characters.ts::Role` nie ma `builder`.

Nie dodawać nowej profesji.

Użyć tej samej polityki co quests-progression-060:

- `settlementOpportunityNpcsFromDef()`;
- stable `settlementNpcId()`;
- deterministyczna preferencja:
  1. `woodcutter`;
  2. `blacksmith`;
  3. `miner`;
  4. inny adult tylko gdy dialogue nazywa go koordynatorem prac, a nie udaje simulation Role `Builder`.

Jeżeli 060 zaimplementuje wcześniej shared `selectBuilderQuestGiver`, reuse tego helpera.

Brak odpowiedniego adult → context nieeligible.

## Player + NPC cooperation

### Player

Normalny `src/app/actions/placementActions.ts::workOnPalisade(id)` już pracuje na authoritative target i używa:

`Palisades.contributeWork(id, amount)`

Quest nie przechwytuje tej akcji.

### NPC / Work Contract

Current Work Contracts już wspierają:

```ts
{ kind: 'palisade', targetId: segment.id }
```

NPC wykonuje realną pracę na tym samym rekordzie.

Quest nie rezerwuje targetu wyłącznie dla gracza.

Poprawny scenariusz:

```text
player accepted quest
→ player wykonuje część pracy
→ NPC z Work Contract wykonuje kolejną część
→ NPC kończy target
→ domain target jest complete
→ quest objective również kończy się poprawnie
```

Nie dodawać actor-attribution ledger.

## Objective

Dodać state-bound objective związany z dokładnym target ID, np.:

```ts
{ type: 'complete_palisade_segment', palisadeId: string }
```

Quest objective obserwuje wyłącznie:

```text
PalisadeSegmentRecord
→ isPalisadeConstructionComplete(record)
```

Nie przechowuje:

- `progress`;
- `materialsDelivered`;
- `workHours`;
- `repairHp`;
- actor contribution.

`QuestManager` dostaje z composition root wąski logical lookup:

```text
palisadeId → missing | unfinished | complete
```

Lookup ma zawsze re-resolve'ować bieżące `bundle.palisades`; nie wolno zachować mesh/ref do starego WorldBundle.

Completion ma użyć istniejącej centralnej ścieżki state-bound objective polling/stage completion.

## Availability i robustness

### Target completed before acceptance

Jeżeli authored target jest już complete przed accept:

- quest nie jest offerable;
- istniejąca oferta znika/staje się niedostępna;
- brak retroactive reward;
- brak immediate-completion alternatywy.

Źródłem prawdy jest live target state.

### Target completed after acceptance przez NPC

Jeżeli NPC wykonuje ostatnią pracę:

- target staje się complete;
- objective kończy się normalnie;
- quest przechodzi zwykłą ścieżkę completion/report;
- nie używać `resolved_without_player`.

Completion dotyczy stanu świata, nie autorstwa finalnego work bout.

### Target missing / invalidated

Przed acceptance:

- missing → unavailable.

Po acceptance:

- missing → użyć istniejącego technical `invalidated`;
- brak reward;
- nie tworzyć replacement targetu pod innym ID.

### Settlement unloaded

Quest binding nie zależy od loaded `Settlement`.

Authored palisade jest world-owned przez `WorldBundle.palisades`; objective działa po logical ID.

Brak runtime settlement mesh nie oznacza invalidation.

### Save/load / WorldBundle rebuild

Normalny persistence path pozostaje ownerem:

```text
PalisadeSegmentRecord
→ palisades.nodes()
→ SaveData.palisades
→ createPalisades(initial)
```

Po restore:

- to samo palisade ID;
- ten sam `completedWork`;
- to samo authored provenance;
- quest rebinduje po ID;
- brak duplikatu.

Restored active/offered quest z naprawdę brakującym rekordem nie powinien po cichu odtwarzać targetu „dla wygody”; ma wejść w existing invalidation semantics.

### Giver death/unavailability

Nie dodawać nowego giver-lifecycle systemu.

Jeżeli current `QuestManager` / dialogue path już ma semantykę dla niedostępnego givera, reuse jej. 061 nie ma tworzyć specjalnego rescue/failure flow tylko dla Buildera.

## Relation to settlement threats

Nie wiązać V1 z nowym threat systemem.

Aktualny kod nie potwierdza systemic wolf/raid damage settlement palisades:

- `npc-046` dotyczy emergency locomotion/flee;
- settlement structure condition nie obejmuje entrance palisade placements;
- buildable palisade nie ma condition/damage lifecycle.

Narracja może mówić jedynie o niedokończonej pracy.

Nie twierdzić, że segment został uszkodzony przez wilki/raid, i nie obiecywać mierzalnego defense bonusu.

## Persistent consequence

Po completion:

```text
same authored PalisadeSegmentRecord
→ completedWork == PALISADE_REQUIRED_WORK
→ isPalisadeConstructionComplete == true
→ normal full-height palisade visual
→ normal collider
→ save/load preserves complete state
```

Quest completion nie jest ownerem physical state.

Nie ustawiamy flagi typu:

`builderQuestPalisadeFixed = true`

## Rewards

Mały lokalny reward:

- `15 × coin`;
- giver relation `+2`;
- settlement reputation: `competence +2`, `benevolence +1`;
- bez renown;
- bez nowego Known Deed;
- bez Builder-specific currency/reputation.

Użyć istniejących `QuestOutcome` / consequences.

## Dialogue

Dialogue ma opisywać prawdziwy stan:

> „Ten odcinek palisady został zaczęty, ale wciąż brakuje nam rąk do pracy.”

Po completion:

> „Dobra robota. Ten odcinek jest już skończony.”

Nie mówić o:

- naprawie damage;
- zwiększonym defense score;
- odparciu przyszłego rajdu;
- material delivery, którego realny lifecycle nie wymaga.

## Markers i actionability

Nie dodawać drugiego interaction systemu.

- giver markers pozostają `QuestManager.labelMarker()` i korzystają z semantyki quests-progression-055;
- physical target jest zwykłym `palisade` interactable;
- while unfinished normalny prompt już oferuje `[E] Buduj segment palisady (...)`;
- objective binduje dokładne `palisadeId`.

Nie istnieje dziś generic marker registry dla dowolnych world props. Nie tworzyć go tylko dla 061.

Jeżeli podczas implementacji potrzebny jest target glyph, dodać co najwyżej read-only exact-id query typu `QuestManager.palisadeMarker(palisadeId)` i podłączyć do istniejącej presentation seam.

## Expected implementation surface

### Primary

- `src/world/palisade.ts`
  - authored provenance;
  - bez zmiany completion math.
- `src/world/createPalisades.ts`
  - explicit-id, idempotent authored target seam.
- `src/persistence/saveData.ts`
  - provenance serialization/validation/migration.
- `src/app/saveState.ts`
  - existing palisade snapshot projection.
- `src/app/actions/placementActions.ts`
  - normal work reuse;
  - suppress ordinary remove for authored settlement infrastructure.
- `src/app/actions/workContractActions.ts`
  - reuse unfinished-palisade hire-help path.
- `src/world/workContract.ts`
  - reference only unless current implementation requires a narrow type adjustment.
- `src/ai/NpcAgent.ts`
  - reference/reuse existing buildable contract execution.
- focused new contextual quest module under `src/quests/`.
- `src/quests/quests.ts`
  - exact-id state-bound objective.
- `src/quests/QuestManager.ts`
  - live palisade lookup/polling/availability/completion.
- `src/quests/opportunities/settlementNpcMaterialization.ts`
  - stable giver candidates.
- `src/app/createApp.ts`
  - context materialization + current-bundle lookup injection.

### Read/reference

- `src/settlement/settlementPalisade.ts`
  - only to derive a truthful physical placement context.
- `src/settlement/SettlementsManager.ts`
  - do not route this quest through structure repair.
- final `quests-progression-060` plan/notes
  - same contextual Builder/giver/real-target pattern.
- `quests-progression-055`
  - marker/actionability semantics.

## Tests

### Availability

- valid settlement palisade + giver + valid authored target → quest available;
- completed target → unavailable;
- no settlement palisade → safe no quest;
- no suitable giver → safe no quest;
- no valid bounded target site → safe no quest.

### Binding

- same settlement → same quest ID and palisade ID;
- objective bound to target A cannot complete from palisade B;
- save/load preserves binding;
- WorldBundle rebuild preserves binding;
- settlement unload/reload does not affect binding.

### Progress

- player `workOnPalisade` mutates the real target;
- NPC Work Contract mutates the same real target;
- mixed player + NPC work accumulates only on `PalisadeSegmentRecord.completedWork`;
- quest has no duplicate construction progress.

### Completion

- domain target reaching `isPalisadeConstructionComplete() === true` completes objective;
- NPC finishing target resolves correctly;
- complete-before-accept blocks offer/reward;
- missing active target invalidates;
- target remains complete after quest resolution and save/load.

### Persistence

- authored provenance round-trips;
- `completedWork` round-trips;
- idempotent authored ensure never resets existing progress;
- ordinary old/player-created palisades without authored provenance remain valid.

### Regression

- normal palisade placement still consumes ordinary placement materials;
- normal palisade construction outside quest still works;
- ordinary removable player palisades still remove/recover materials;
- Work Contracts still work for ordinary palisades;
- one-active-contract-per-target invariant remains;
- settlement entrance palisade presentation/collision remains unchanged;
- structure repair candidate selection / `listRepairProblems()` remains unchanged.

## Browser verification

User wykonuje manualnie. AI nie wykonuje browser verification.

Scenariusz:

1. znaleźć settlement z wybranym Builder/coordinatorem i realnym unfinished palisade targetem;
2. zobaczyć fizycznie niedokończony segment;
3. przyjąć quest;
4. wykonać normalne `[E]` construction work;
5. opcjonalnie zatrudnić NPC przez zwykły Work Contract;
6. potwierdzić, że player i NPC zmieniają ten sam segment;
7. ukończyć target i zobaczyć normalną zmianę full-height/collider;
8. potwierdzić quest completion/report;
9. save/load;
10. potwierdzić, że ten sam segment pozostaje ukończony;
11. sprawdzić zwykłe palisady poza questem: placement, construction, Work Contract, removal.

## Non-goals

Nie implementować:

- damaged-palisade V1;
- nowego palisade repair/condition systemu;
- rozszerzania `SettlementStructureStateRegistry` o palisady;
- settlement-defense score;
- raid systemu;
- generic Builder quest generatora;
- outpostu;
- fortification progression;
- palisade upgrade tiers;
- systemic damage od każdego ataku;
- nowego Work Contract frameworka;
- quest-local material/work/progress counters;
- nowego generic world-marker registry.

## Verification techniczna

Podczas implementacji użyć najmniejszego właściwego zestawu:

- targeted Vitest dla contextual resolvera;
- `QuestManager.test.ts`;
- `createPalisades` / persistence tests;
- Work Contract/palisade regression tests;
- type-check/lint/build zgodnie z aktualnym `CLAUDE.md`.

Dla ważnych nowych publicznych/architektonicznych helperów dodać JSDoc z odpowiednim `@domain`.

Nie uruchamiać `pnpm docs:sync`.

Szczegółowy recon i implementacyjne pułapki:
`docs/plans/implementation-notes/quests-progression-061-builder-repair-or-complete-palisade-implementation-notes.md`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
