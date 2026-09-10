# Implementation Notes: quests-progression-016 — World-driven settlement quest opportunities

**Prepared:** 2026-09-10  
**Plan:** `quests-progression-016-world-driven-settlement-quest-opportunities.md`

## 1. Najważniejszy stan obecnej architektury

`QuestManager` jest obecnie konstruowany z zamkniętą tablicą:

```ts
private readonly defs: readonly QuestDef[]
```

Konstruktor:

1. waliduje wszystkie definitions przez `validateQuestDefinitions(defs)`,
2. zapisuje `defs`,
3. tworzy `states` dla każdego `def.id`,
4. odtwarza persisted `QuestProgressEntry` tylko dla ID znajdujących się w `defs`.

To jest najważniejszy seam dla 016.

Nie można po prostu generować nowego `QuestDef` po uruchomieniu świata i oczekiwać, że istniejący `QuestManager` zacznie go obsługiwać.

### Decyzja

Generated world-driven definitions powinny zostać zmaterializowane **przed konstrukcją `QuestManager`** i wejść do tej samej finalnej tablicy definitions co authored quests.

Nie dodawać drugiego runtime registry ani osobnego managera questów.

Docelowy boot flow:

```text
authored QUESTS
+
deterministic world-driven materialization
+
existing other generated definitions
        ↓
final QuestDef[]
        ↓
settlement binding / validation
        ↓
new QuestManager(finalDefs, ...)
```

Jeżeli implementacja wymaga dodawania opportunities już po konstrukcji `QuestManager`, nie mutować `private readonly defs` ad hoc. Najpierw zweryfikować, czy rzeczywiście potrzebny jest runtime registration contract; jest to zmiana ownership/lifecycle większa niż obecny plan zakłada.

## 2. Istniejący wzorzec dynamicznej materializacji już istnieje

`src/quests/quests.ts` ma `buildLandmarkQuests`.

Landmark quest nie przechowuje hardcoded coordinate. World layer wykonuje bounded deterministic lookup i przed konstrukcją `QuestManager` tworzy normalny `QuestDef` związany z realnym `landmarkId`.

To jest najbliższy istniejący wzorzec dla:

```text
world state
→ resolve stable source
→ QuestDef
→ QuestManager
```

Nie kopiować mechaniki landmarków 1:1 — world-driven problems mają lifecycle i mogą zniknąć — ale reuse'ować zasadę materializacji normalnych `QuestDef` przed wejściem do runtime.

## 3. Composition root

`src/app/createApp.ts` jest obecnym miejscem składania finalnych quest definitions.

Obecny flow łączy authored `QUESTS` z world-derived definitions, dopina runtime `settlementId`, a następnie przekazuje wynik do `new QuestManager(...)`.

016 powinien rozszerzyć ten composition step, nie przenosić world-system imports do `QuestManager`.

Preferowany seam:

```text
createApp
  ├─ world/settlement bundle
  ├─ build existing world-derived quests
  ├─ collect/materialize selected world opportunities
  ├─ compose final QuestDef[]
  └─ new QuestManager(...)
```

`QuestManager` powinien nadal otrzymywać wyłącznie definitions oraz narrow callbacks/lookups.

## 4. QuestManager już ma właściwy wzorzec world-state integration

Nie projektować nowego generic condition systemu.

`QuestManager.ts` ma już kilka injected world seams:

```text
AnimalTargetResolver
DangerousTraitApplier
SettlementRatInfestationLookup
SpawnPointDestructionLookup
QuestWorldProgressLookup
QuestAnimalOwnershipTransfer
HorseRewardAvailability
QuestSocialAvailabilityLookup
```

Najważniejszy wzorzec dla 016 to:

```ts
SettlementRatInfestationLookup = {
  getSnapshot(settlementId)
}
```

`QuestManager` nie importuje settlement/fauna managerów. Odczytuje aktualny authoritative state przez wąski lookup.

Nowy world-driven objective, jeżeli okaże się potrzebny, powinien stosować ten sam model:

```text
domain-owned authoritative state
        ↓
narrow read-only quest lookup
        ↓
QuestManager objective evaluation
```

Nie przekazywać `SettlementsManager`, `HouseholdRegistry`, `Fauna` ani struktur Three.js do `QuestManager`.

## 5. Istniejący catch-up world objectives

Przy restore `QuestManager` wykonuje:

```text
catchUpActiveWorldObjectives(...)
```

dla aktywnych questów.

To jest istotne dla external resolution.

World-driven objective powinien móc po:

```text
save
→ world rebuild
→ QuestManager restore
```

odczytać aktualny authoritative source state i stwierdzić, że problem został już rozwiązany.

Przed dodaniem osobnego restore mechanism sprawdzić i rozszerzyć istniejący `catchUpActiveWorldObjectives`.

Nie tworzyć osobnego:

```text
restoreWorldDrivenQuestProgress()
```

jeżeli obecny catch-up może obsłużyć nowy objective.

## 6. `invalidated` i `failed` już mają różną semantykę

`QuestState` rozróżnia:

```text
failed
invalidated
```

Obecna semantyka:

- `failed` — world entity/problem nadal ma znaczenie fabularne, ale objective stał się niemożliwy do wykonania, np. zwierzę z `find_animal` umarło;
- `invalidated` — binding nie może być już uznany za wiarygodny, np. po restore/rebuild dla niestabilnego wild-fauna targetu.

Nie używać automatycznie `invalidated` dla każdego przypadku „świat sam rozwiązał problem”.

### Implementacyjna decyzja

Dla pierwszego vertical slice określić semantykę source resolution na poziomie scenariusza.

Jeżeli source problem po prostu przestał istnieć bez wkładu gracza, preferować istniejący terminal path, który najlepiej odpowiada znaczeniu scenariusza.

Jeżeli żaden obecny state nie opisuje tego poprawnie, zatrzymać implementację i udokumentować discrepancy zamiast zmieniać znaczenie `invalidated` globalnie.

Nie dodawać nowego `resolved_externally` w 016 bez konkretnej konieczności.

## 7. Persistence — obecny kontrakt

`SaveQuests` przechowuje obecnie:

```text
progress: QuestProgressEntry[]
relations: Record<string, number>
```

`QuestProgressEntry` zawiera:

```text
id
state
stageIndex
resolvedOutcomeId?
```

Nie przechowuje `QuestDef`.

To oznacza, że przy restore definition o tym samym `id` musi już znajdować się w `QuestManager.defs`.

### Konsekwencja dla 016

Aktywny generated quest musi zostać deterministycznie zmaterializowany przy następnym boot **z identycznym quest ID i identycznymi materialization choices**.

Nie wystarczy:

```text
current problem list
→ random selection
```

ponieważ problem mógł się zmienić po acceptance.

Jeżeli source refs + world state nie wystarczają do identycznej rekonstrukcji, trzeba persistować minimalne materialization inputs.

Nie persistować całego `QuestDef` jako pierwszy wybór.

## 8. Stable generated quest identity

QuestManager restore jest oparty na:

```text
QuestProgressEntry.id
→ matching QuestDef.id
```

Dlatego generated quest ID jest częścią persistence contract.

ID musi być deterministyczne.

Dla source posiadającego trwałą identity preferować:

```text
world:<scenario>:<settlementId>:<sourceId>
```

Dokładny format dobrać do istniejących conventions.

Jeżeli ten sam source może generować kolejne niezależne occurrences, potrzebny będzie stabilny occurrence discriminator.

Nie używać:

```text
Date.now()
Math.random()
runtime UUID
```

do identity wymaganej po save/load.

## 9. Lightweight opportunity nie powinno wejść do QuestManager

Rozdzielić:

```text
SettlementQuestOpportunity
```

od:

```text
QuestDef
```

Opportunity jest candidate record potrzebnym przed selection/materialization.

QuestManager nie powinien znać:

```text
priority
source severity
candidate status
selection weight
```

To są dane opportunity layer.

Po wyborze candidate materializer produkuje zwykły `QuestDef`.

## 10. Nie wprowadzać generic `sourceRefs` bag bez potrzeby

Plan pokazuje `sourceRefs` konceptualnie, ale implementacja nie powinna automatycznie tworzyć:

```ts
sourceRefs: Record<string, string>
```

albo podobnego untyped bag.

Jeżeli pierwszy vertical slice ma np. stable `spawnerId`, typ opportunity powinien to reprezentować jawnie.

Preferować discriminated union, jeśli pojawi się więcej niż jeden rzeczywiście wdrażany source kind.

Nie projektować unionu dla czterech scenariuszy, jeśli 016 wdraża tylko jeden.

## 11. Predator vertical slice — obecny wolf-den seam

Obecny kod ma:

```text
WOLF_DEN_ID
Fauna.isWolfDenCleared()
QuestObjective.clear_wolf_den
ObjectiveRef.wolf_den_cleared
```

`gameLoop.ts` już raportuje:

```text
fauna.isWolfDenCleared()
→ questManager.onInteractObjective({
     type: 'wolf_den_cleared',
     denId: WOLF_DEN_ID
   })
```

To oznacza, że istnieje realny world-owned completion signal dla konkretnej wilczej jamy.

Jednocześnie obecny wolf-den design jest pojedynczy/globalny: wcześniejsze implementation notes świadomie używają jednego `WOLF_DEN_ID`, a nie rejestru jam per settlement.

### Konsekwencja

Nie traktować obecnego `WOLF_DEN_ID` jako gotowego mechanizmu „wilki pod dowolną proceduralną osadą”.

Może posłużyć do sprawdzenia opportunity architecture tylko wtedy, gdy rzeczywiście można powiązać tę jamę z konkretną osadą bez tworzenia fałszywego settlement threat state.

Jeżeli wymagane jest:

```text
many settlements
→ many local predator threats
```

to jest brak domenowy po stronie fauna/world, nie problem quest layer.

Nie rozbudowywać w 016 wolf-den systemu do wielu jam tylko po to, żeby spełnić scenario.

## 12. NPC threat perception nie jest settlement problem state

`src/ai/npcAnimalThreat.ts` obsługuje immediate NPC threat perception/defend/flee.

Nie używać chwilowego wyniku pojedynczego NPC jako authoritative settlement quest problem.

To inny poziom ownership:

```text
NPC perception
≠
persistent settlement problem
```

Jeżeli nie istnieje settlement/source-level predator predicate, wybrać inny vertical slice lub wydzielić odpowiednią mechanikę fauna.

## 13. Rat infestation jest najmocniejszym gotowym reference implementation

Storage rat infestation ma dokładnie pożądany ownership:

```text
settlement owns infestation state
→ quest receives read-only snapshot
→ quest checks live resolution
```

`SettlementRatInfestationLookup.getSnapshot(settlementId)` jest lepszym wzorem architektonicznym dla world-driven opportunities niż animal target binding.

Przy implementowaniu pierwszego source adaptera prześledzić:

```text
src/settlement/ratInfestation.ts
src/quests/settlementRatInfestation.ts
src/quests/QuestManager.ts
src/app/createApp.ts
```

i zachować ten sam kierunek zależności.

## 14. Household state — istniejący ownership

`src/settlement/household.ts` definiuje `HouseholdId`.

`HouseholdRegistry` żyje na `SettlementsManager` i zachowuje household state przez settlement stream-out/in.

Household jest realnym ownerem rodzinnego:

```text
food
wood
water-related household state
```

NPC już otrzymuje household context, a local resource exchange korzysta z same-settlement household surplus/shortage.

To daje dobry authoritative source dla późniejszego:

```text
household food shortage
→ opportunity
```

ale nie przesądza jeszcze player-delivery path.

## 15. Household food nie jest tym samym co SettlementEconomy food

Nie scalać tych dwóch poziomów.

`SettlementEconomy` ma settlement-level storage, a household posiada własny rodzinny stock.

Istniejący local exchange potrafi claimować household surplus przez shared economy seam.

Quest „Głód w gospodarstwie” powinien zakończyć się zmianą **konkretnego household state**, jeżeli problem został wykryty właśnie tam.

Wpłata jedzenia do ogólnego settlement storage nie jest automatycznie rozwiązaniem household shortage, chyba że istniejąca logistyka faktycznie przetransferuje je dalej.

Przed wdrożeniem tego scenariusza prześledzić istniejący player → storage/household transfer. Jeżeli bezpośredniej wspólnej ścieżki brak, wydzielić dependency zamiast usuwać item w QuestManager.

## 16. Structure repair — shared math istnieje, generic settlement repair nie

`src/world/repair.ts` ma actor-neutral:

```text
RepairProgress
createRepairProgress
advanceRepairProgress
isRepairComplete
```

i korzysta z condition primitives z `src/world/condition.ts`.

Shared repair type celowo **nie zna**:

```text
materials
skill
actor
structure kind
ownership
NPC assignment
maintenance priority
```

Nie należy więc interpretować `world-021` jako gotowego generic repair systemu dla wszystkich settlement buildings.

Pierwszy repair opportunity może zostać wdrożony tylko dla structure kind, który w aktualnym kodzie ma jednocześnie:

```text
stable structure identity
condition ownership
actual player repair integration
```

Jeżeli takich settlement structures nie ma, repair scenario pozostaje dependency.

## 17. Lost livestock — obecny `find_animal` nie jest problem detector

`QuestObjective.find_animal`:

1. wskazuje `AnimalKind`,
2. przy aktywacji `QuestManager` wiąże objective z konkretnym `animalId`,
3. interaction z tym zwierzęciem raportuje `animal_found`,
4. śmierć bound animal powoduje failure.

Resolver szuka także settlement livestock.

To jest gotowy **objective mechanism**, ale nie mechanizm wykrywania zagubionego zwierzęcia.

Nie używać:

```text
find any sheep
→ declare it lost
```

jako world-driven source.

Potrzebny jest niezależny authoritative predicate po stronie livestock/domestication. Jeśli go brak, scenario jest blocked.

## 18. Wild fauna identity — ważny persistence pitfall

`QuestManager` nie persistuje `animalTargets`.

Przy restore aktywnego animal-bound questa:

- livestock może zostać ponownie związane, ponieważ jego spawn/identity jest deterministyczne,
- wild-fauna target jest invalidowany, ponieważ identity/dead-alive state nie jest wystarczająco stabilne przez restore.

Dlatego pierwszy generated opportunity nie powinien opierać persisted active quest identity na przypadkowym wild `AnimalAgent.animalId`, chyba że istniejący persistence contract zostanie wcześniej rozszerzony w odpowiedniej domenie.

Wolf-den/spawner identity jest bezpieczniejszym source niż pojedynczy wild wolf.

## 19. Giver selection zależy od quests-progression-015

016 deklaruje dependency na 015.

Przed implementacją sprawdzić faktyczny landed contract 015, nie plan.

016 potrzebuje od niego co najmniej:

```text
stable giver identity
stable talk target identity
cross-settlement-safe NPC resolution
no runtime NpcAgent in QuestDef/persisted quest state
```

Jeżeli 015 nadal ma status `planned` albo jego contract nie został wdrożony, nie implementować name-based fallback w 016.

To jest realny blocker.

## 20. Giver nie powinien być wybierany po display name

Opportunity materializer powinien otrzymać stable NPC identity zgodną z 015.

Dla household source preferować member konkretnego household.

Dla source bez naturalnego ownera deterministic fallback może wybrać NPC z settlement, ale wybór musi być stabilny przez save/load.

Nie wybierać givera przez:

```text
first currently loaded NpcAgent
random loaded NPC
NPC nearest player
```

bo wszystkie trzy zależą od runtime/camera.

## 21. Selection nie może zależeć od player proximity

`createApp` materialization oznacza, że initial opportunity selection może być wykonane bez player-driven triggera.

Jeżeli później pojawi się refresh podczas sesji, powinien korzystać z simulation/settlement lifecycle, nie z render loop.

`gameLoop.ts` może nadal raportować completion events do `QuestManager`, ale nie powinien skanować całego świata w celu generowania opportunities.

## 22. Dirty marker mechanism pozostawić bez zmian

`QuestManager` ma `dirty` flag używany do pomijania marker recomputation na klatkach bez zmian quest state.

Nie dodawać per-frame marker refresh dlatego, że definitions są generated.

Generated quest po materializacji jest normalnym questem i powinien korzystać z tego samego dirty lifecycle.

## 23. Selection/priority — implementować dopiero na realnym candidate pool

Nie budować generic scoring frameworku dla jednego source.

Jeżeli pierwszy vertical slice daje maksymalnie jedno opportunity na settlement, wystarczy deterministic eligibility + stable ordering.

`priority`/limit selection warto dodać dopiero wtedy, gdy co najmniej dwa realne source kinds konkurują o slot.

Nie tworzyć abstrakcji wyłącznie dlatego, że plan przewiduje przyszłe cztery scenarios.

## 24. Recommended first vertical slice decision

Po aktualnym reconie nie ma wystarczającego dowodu, że istnieje generic per-settlement predator-pressure state.

Obecny wolf-den ma stabilny completion signal, ale jest pojedynczym globalnym source.

Dlatego implementujący agent powinien rozpocząć od krótkiego preflight:

```text
A. Czy istniejący wolf-den/source można prawdziwie przypisać do settlement?
   YES → użyć jako minimalnego predator vertical slice.
   NO  → nie tworzyć nowego fauna threat systemu.
```

Jeżeli `NO`, następny kandydat powinien być wybrany wyłącznie spośród source'ów posiadających już:

```text
stable source identity
authoritative unresolved/resolved state
player action changing that state
```

Rat infestation jest istniejącym proof-of-pattern, ale nie należy automatycznie dodawać kolejnego rat questa, jeśli nie jest częścią gameplay scope 016.

## 25. Minimalny implementation order

1. Sprawdzić landed `quests-progression-015`.
2. Prześledzić final quest-definition composition w `createApp.ts`.
3. Zdefiniować lekki opportunity record wyłącznie dla pierwszego potwierdzonego source kind.
4. Zdefiniować deterministic opportunity/quest ID.
5. Zmaterializować selected opportunity do normalnego `QuestDef` przed `new QuestManager`.
6. Włączyć definition do istniejącej validation.
7. Dodać narrow live-state lookup tylko jeśli objective wymaga ciągłego authoritative read.
8. Rozszerzyć istniejący world-objective catch-up zamiast tworzyć osobny restore path.
9. Zapewnić deterministic reconstruction active generated definition przy save/load.
10. Dopiero po działającym vertical slice rozważyć wspólny union/selection/priority dla kolejnych source kinds.

## 26. Test seams

### Quest materialization

Testować osobno od `QuestManager`:

```text
same world/source inputs
→ same opportunity ID
→ same QuestDef ID
→ same giver/source/objective parameters
```

### QuestManager

Reuse istniejące tests dla:

- definition validation,
- lifecycle,
- world lookup catch-up,
- failure/invalidation,
- rewards/consequences.

Nie testować całej settlement simulation przez wielki mock w `QuestManager.test.ts`.

### Integration

Pokryć na istniejących app/domain seams:

```text
world problem exists
→ definition materialized
→ QuestManager restores/starts quest
→ authoritative problem changes
→ quest observes correct result
```

### Save/load

Najważniejszy regression:

```text
accept generated quest
→ save
→ rebuild same world
→ rebuild definitions
→ same QuestDef.id and materialized targets
→ QuestProgressEntry restores
```

Jeżeli definition nie istnieje przy restore, obecny `QuestManager` pominie persisted progress dla tego ID. Test musi wykrywać ten przypadek.

## 27. Pliki, które warto otworzyć przed edycją

Minimalny zestaw:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/QuestManager.test.ts
src/app/createApp.ts
src/app/saveState.ts
src/persistence/saveData.ts

src/quests/settlementRatInfestation.ts
src/settlement/ratInfestation.ts

src/fauna/AnimalSpawner.ts
src/fauna/Fauna.ts
src/ai/npcAnimalThreat.ts
src/settlement/livestock.ts

src/settlement/household.ts
src/economy/localExchange.ts

src/world/condition.ts
src/world/repair.ts
```

Nie robić repository-wide recon, jeżeli pierwszy vertical slice nie dotyka household/livestock/repair.

## 28. Guardrails dla implementacji

Nie:

```text
- dodawać drugiego QuestManagera,
- dodawać quest-owned copy world problem state,
- generować definitions na podstawie player proximity,
- używać Math.random() do persistent identity/selection,
- persistować runtime world objects,
- wybierać random currently-loaded giver,
- robić quest-only food transfer,
- robić quest-only lost-livestock flag,
- tworzyć generic settlement predator pressure tylko dla questa,
- rozszerzać world repair na wszystkie buildings w tym planie,
- tworzyć generic condition DSL,
- tworzyć generic procedural quest engine.
```

## 29. JSDoc / code-map

Nowe ważne publiczne typy/funkcje opportunity/materialization powinny dostać krótki JSDoc zgodny z istniejącym code-map discovery.

Preferować:

```text
@domain quests-progression
@system ...
@role ...
@integration ...
```

Najważniejsze ownership statements:

```text
world/domain owns source problem
opportunity layer owns eligibility/materialization
QuestManager owns quest progress
```

Nie oznaczać opportunity layer jako ownera household/fauna/structure state.

## 30. Recon discrepancies / blockers do sprawdzenia przed coding

### Blocker A — quests-progression-015

016 nie powinien implementować własnego stable NPC identity fallback.

### Blocker B — runtime definition registration

Aktualny `QuestManager` ma readonly definition set ustalany w constructorze.

Jeżeli wymaganie 016 zostanie zinterpretowane jako dynamiczne pojawianie się nowych questów w trakcie wielogodzinnej sesji bez rebuild `QuestManager`, obecna architektura nie ma jeszcze takiego publicznego seam.

Najpierw ustalić najmniejszy lifecycle extension. Nie obchodzić tego mutacją prywatnych struktur.

### Blocker C — predator settlement predicate

`isWolfDenCleared()` jest completion state pojedynczej jamy, nie dowodem istnienia generic per-settlement predator problem.

### Blocker D — lost livestock

`find_animal` jest objective, nie authoritative missing-state detector.

### Blocker E — settlement structure repair

Shared repair math istnieje, ale generic settlement building repair coverage nie jest potwierdzone.

### Blocker F — player → household food

Household food state istnieje, ale przed scenariuszem trzeba potwierdzić realny transfer path.

## 31. Najważniejsza decyzja dla implementującego agenta

Nie próbować „zrealizować listy czterech questów”.

Celem 016 jest udowodnienie jednego poprawnego przepływu:

```text
authoritative simulation state
        ↓
deterministic lightweight opportunity
        ↓
stable materialized QuestDef
        ↓
existing QuestManager
        ↓
real world resolution
        ↓
existing quest lifecycle
        ↓
save/load reconstructs the same quest
```

Dopiero gdy ten przepływ działa bez quest-owned state i bez nowej mechaniki domenowej, kolejne world-driven source kinds mogą korzystać z tego samego seam.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
