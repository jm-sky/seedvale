# Plan: Builder — Finish the Local Well

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** settlements-npcs-043
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `progression`
**Tags:** `builder` `well` `construction` `settlement`
**Roadmap:** `quests-professions-and-world-consequences.md`
**Model:** Sonnet, Composer

## Cel

Dodać krótki contextual/authored quest pokazujący realną zależność systemów:

```text
unfinished local well
→ cultivation currently uses a farther usable source
→ player helps finish the real well body
→ the same PlayerWellRecord becomes a normal usable WaterSource
→ Farmer watering from settlements-npcs-043 may choose it by ordinary nearest-source routing
→ daily settlement work changes without a quest flag
```

Quest nie tworzy fake studni, quest-only watering bonusu ani osobnego progressu budowy.

## Recon — stan bieżący

### Well construction

Aktualny owner budowy studni to `PlayerWellRecord` / `PlayerWells`:

- stages: `pit → well → roof`;
- `workProgress` należy wyłącznie do rekordu studni;
- pit ma depth-dependent work;
- wejście do `well` kosztuje 6 × `stone` + 3 × `branch`;
- wejście do `roof` kosztuje 4 × `branch`;
- player i NPC Work Contract używają wspólnego `advanceWellConstruction()` oraz tego samego rekordu;
- materiały są atomowo konsumowane przez istniejący construction-material seam, nie są przechowywane w quest counterze;
- save/rebuild zapisuje cały `PlayerWellRecord` przez `SaveData.playerWells`.

Istotne: `isWellWaterAvailable(record)` staje się prawdziwe po ukończeniu body (`well` stage). Pełne `isWellCompleted(record)` wymaga także dachu. Dla tego questa source of truth completion ma być **water availability**, ponieważ to właśnie ten stan uruchamia systemowy efekt dla Farmerów.

### Work Contracts

Istniejący `ContractTarget { kind: 'construction', targetId: well.id }` potrafi wskazać konkretną unfinished well. Hired NPC wykonuje realne stage transitions + work contribution na tym samym `PlayerWellRecord`.

Nie dodajemy automatycznej Builder AI. NPC może kontynuować target tylko przez obecny Work Contract flow.

### Quest system

Aktualny `interact_well` nie posiada identity i pasuje do dowolnej studni. Nie nadaje się do tego questa.

`QuestManager` ma już:

- stable quest/NPC identities;
- world-bound objectives;
- centralny multi-objective completion path;
- state-bound polling dla world objectives;
- normalne outcomes/rewards/consequences;
- persistence `QuestProgressEntry`;
- techniczne `invalidated`.

Plan doda jeden wąski objective związany ze stable well id zamiast kopiować construction state do questa.

### Builder identity

W aktualnym `src/ai/characters.ts::Role` **nie istnieje `builder`**.

„Builder” w tym queście jest więc authored funkcją fabularną — lokalnym NPC koordynującym budowę — a nie nową simulation profession. Nie dodawać `builder` Role, workplace ani profession AI w tym planie.

### Settlement cultivation dependency

`settlements-npcs-043` jest `planned`, nie implemented. Plan opiera się wyłącznie na jego zapisanym kontrakcie:

- stable cultivation-site identity;
- authoritative settlement-owned hydration;
- Farmer watering przez normalny profession work;
- source selection liczony od cultivation-site position;
- settlement wells + usable player-built wells jako kandydaci;
- player-built well usable według `isWellWaterAvailable()`;
- zwykłe nearest suitable source routing;
- brak questowego preference/bonusu.

Implementacja 060 ma użyć faktycznego API, które 043 dostarczy; nie zakładać dziś nieistniejącej nazwy helpera.

## Quest context

V1 ma tworzyć **jeden deterministycznie wybrany contextual quest w świecie**, nie generic Builder quest generator i nie kopię dla każdej osady.

Nowy focused builder, np.:

`src/quests/builderFinishLocalWell.ts`

ma:

1. przejrzeć dostępne settlement definitions/context w stabilnej kolejności;
2. znaleźć osadę z realnym `garden` / `field` site z kontraktu 043;
3. znaleźć stabilnego odpowiedniego adult givera;
4. znaleźć deterministicznie poprawny placement unfinished well blisko cultivation site;
5. potwierdzić, że przed ukończeniem istniejące usable water source jest rzeczywiście dalej;
6. zapewnić jeden stable authored well target;
7. zbudować normalny `QuestDef`.

Jeżeli warunki nie są spełnione, quest nie materializuje się.

## Quest identity

Quest ID:

`world:builder-finish-local-well:<settlementId>`

Well ID:

`well:authored:builder-local:<settlementId>:<cultivationSiteId>`

Identity nie może zależeć od:

- display name;
- runtime `NpcAgent`;
- mesh/Object3D;
- koordynatów jako jedynego klucza;
- kolejności loadu;
- `Date.now()`.

## Giver selection

Użyć stable NPC identity z istniejących settlement definitions i `settlementOpportunityNpcsFromDef()` / `settlementNpcId()`.

Deterministyczna preferencja existing construction-adjacent adult roles:

1. `woodcutter`;
2. `blacksmith`;
3. `miner`;
4. inny adult tylko wtedy, gdy dialogue opisuje go jako osobę koordynującą prace, a nie twierdzi, że jego simulation Role to Builder.

Brak odpowiedniego adult givera → context nie jest eligible.

Quest nie zmienia role, workplace, schedule ani profession work givera.

## Authored unfinished well

Settlement generation nie tworzy dziś unfinished `PlayerWellRecord`, a `PlayerWells.place()` generuje niestabilne ID z czasu. Dlatego quest context ma **zapewnić authored target przez world-owned PlayerWells seam**, nie tworzyć rekordu bezpośrednio w quest code.

Dodać w `PlayerWells` wąski idempotentny seam typu `ensureAuthoredWell(...)`:

- przyjmuje jawne stable ID;
- tworzy rekord tylko jeśli ID jeszcze nie istnieje;
- przy reuse nie resetuje position/stage/work/groundwater;
- groundwater resolve następuje dokładnie raz;
- wynik pozostaje zwykłym `PlayerWellRecord`;
- save/load i WorldBundle rebuild używają istniejącego `playerWells` persistence path.

Dodać minimalne persisted authored provenance (`settlementId` + `authoredKey`) do rekordu, aby:

- nie rozpoznawać authored targetu przez parsowanie string ID;
- normalne player-created wells pozostały bez zmian;
- UI nie pozwalało anulować/usunąć lokalnej infrastruktury jak zwykłej prywatnej unfinished well.

Nie rename'ować `PlayerWells` ani nie tworzyć drugiego well registry.

## Initial construction state

Authored target startuje jako prawdziwy `pit`, którego pit-work jest już wykonane:

```text
stage = pit
workProgress = wellStageWorkHours('pit', waterDepth)
```

Następny realny action nadal przechodzi przez `advanceWellConstruction()`:

```text
enter well stage
→ require 6 stone + 3 branch
→ consume through normal construction-material seam
→ active work on the same record
→ well body complete
→ isWellWaterAvailable == true
```

Nie ustawiać od razu `stage: 'well'`, bo ominęłoby to normalny material gate.

Roof pozostaje zwykłym późniejszym etapem construction. Quest nie wymaga roof, ponieważ WaterSource i Farmer consequence zaczynają działać wcześniej zgodnie z obecnym well domain.

## Placement przy cultivation site

Po implementacji 043 użyć jego stable cultivation-site position/identity.

Candidate well placement musi:

- być blisko konkretnego `garden` / `field`;
- używać normalnego `evaluateGroundPlacement`;
- respektować `WELL_FOOTPRINT_RADIUS`, `WELL_SEPARATION` i istniejące blockers;
- pochodzić z małego bounded deterministic zestawu offsets wokół cultivation site;
- nie wykonywać losowych/unbounded retries;
- nie zależeć od runtime mesh identity.

Przed materializacją potwierdzić przez normalny water-source selection contract z 043, że:

```text
distance(cultivation, current nearest usable source)
>
distance(cultivation, authored local well)
+ mały sensowny margin
```

Wtedy dialogue „ta studnia skróci drogę po wodę” opisuje realny stan.

Jeżeli realnej poprawy dystansu nie ma → nie materializować tego contextu.

## Objective binding

Dodać state-bound objective, np.:

```ts
{ type: 'make_well_water_available', wellId: string }
```

Nie używać `interact_well`.

`QuestManager` dostaje z composition root wąski logical lookup aktualnego `bundle.playerWells`, np. o semantyce:

```text
wellId → missing | unfinished | water_available
```

Lookup musi re-resolve'ować przez bieżący bundle; nie wolno zachowywać mesh/ref do starego WorldBundle.

Completion source of truth:

```text
bound PlayerWellRecord
→ isWellWaterAvailable(record)
→ objective satisfied
```

Nie:

```text
quest work counter
quest materials counter
quest flag "well completed"
```

## Materials i work contribution

Quest ma **jedno real-state objective**, nie dwa sztuczne quest stages.

Wymaga jednak obu elementów gameplayowo:

1. realnych materiałów, bo wejście do `well` stage jest blokowane przez `wellStageRequirements`;
2. realnej pracy, bo `PlayerWells.addWork()` musi doprowadzić body do wymaganego progressu.

Player może:

- mieć materiały w inventory;
- położyć materiały w normalnym construction-material radius;
- pracować sam;
- opcjonalnie utworzyć zwykły Work Contract dla tej samej well i zlecić część pracy NPC.

Nie tworzyć storage/countera wyłącznie dla questa.

## Lifecycle / edge cases

### NPC kończy pierwszy

Jeżeli hired NPC przez normalny Work Contract ukończy body:

- `isWellWaterAvailable` staje się true;
- objective kończy się normalnie;
- quest nie blokuje się na „player contribution”.

Obecny system nie ma autonomous Builder construction poza Work Contracts. Nie dodawać actor-attribution ledger tylko dla tego questa.

### World state rozwiązuje problem

Objective definiuje pożądany stan świata, więc aktywny quest kończy się sukcesem, gdy ten stan zostanie osiągnięty niezależnie od finalnego aktora.

Nie używać `resolved_without_player` dla prawidłowo ukończonego bound well.

### Player kończy przed akceptacją

Authored target istnieje przed ofertą, więc jest to możliwe.

Jeżeli `isWellWaterAvailable` jest już true przed accept:

- quest nie jest offerable;
- istniejąca oferta ma zniknąć / stać się niedostępna;
- nie przyznawać retroactive reward;
- nie tworzyć alternate immediate-completion questa.

### Missing target

- przed accept: quest nie jest dostępny;
- podczas active: technical `invalidated`, bez reward;
- nie tworzyć replacement targetu pod nowym ID.

### Settlement unload / target poza loaded chunks

Quest działa po logical `wellId` i persisted world record.

- brak Object3D nie invaliduje objective;
- marker/prompt wraca wraz z normalnym interactable;
- completion lookup nie przechowuje runtime mesh reference.

### Save/load / re-resolution

Na boot:

- reconstructed context daje ten sam quest ID;
- ten sam settlement/site daje ten sam well ID;
- `ensureAuthoredWell` reuse'uje restored record;
- nie resetuje progressu;
- nie tworzy drugiej studni.

Jeżeli persisted active quest wskazuje logical authored target, którego record rzeczywiście nie ma, nie regenerować go „dla wygody”; użyć missing-target invalidation policy.

## Marker i actionability

Jeżeli istniejąca presentation potrzebuje world-target markeru, dodać read-only `QuestManager.wellMarker(wellId)` analogicznie do innych bound targets.

Marker:

- tylko dla konkretnego bound ID;
- tylko gdy active objective jest unfinished;
- nie ma własnego lifecycle;
- znika po water availability / invalidation;
- po unload nie wymaga żadnego object ref.

Normalny `playerWell` interactable nadal wykonuje zwykłe well construction action.

## Completion consequence

Quest nie zapisuje:

`farmerUsesLocalWell = true`

Po body completion:

```text
same PlayerWellRecord
→ isWellWaterAvailable
→ ordinary WaterSource candidate
→ settlements-npcs-043 source resolver sees it
→ if nearest/suitable, Farmer chooses it
```

Test integracyjny ma potwierdzić dokładnie ten przepływ bez podawania quest state do Farmer hydration logic.

## Dialogue

Offer/reminder ma opisywać tylko realne fakty, np.:

> Studnia przy polu stoi niedokończona. Do tej pory po wodę trzeba chodzić dalej. Jeśli dokończymy cembrowinę, będzie można brać wodę tutaj.

Nie mówić o mierzonej „wydajności”, „czasie oszczędzonym” ani innych wartościach, których system nie oblicza.

Po accept reminder może wskazywać realne materiały wymagane przez current stage, ale źródłem tych liczb pozostaje well domain/UI, nie hardcoded quest counter.

## Reward i social consequence

Użyć istniejących mechanizmów:

- shown reward: **15 × `coin`**;
- relation z giverem: **+2**;
- lokalne settlement reputation:
  - `competence +2`;
  - `benevolence +1`;
- bez renown dla małego lokalnego zadania;
- bez nowego Settlement Known Deed.

Nie dodawać nowego reward type.

## Persistence

Quest progress pozostaje zwykłym `QuestProgressEntry`; nie potrzebuje osobnego persisted `wellId`, ponieważ quest definition i well ID są deterministycznie rekonstruowane z tego samego settlement/cultivation contextu.

Persisted world state:

- authored provenance + construction state w `PlayerWellRecord`;
- normalny `SaveData.playerWells`;
- normalny quest progress/outcome.

Dodanie authored provenance zmienia save representation, więc implementation ma zaktualizować validation/migration względem **wtedy aktualnego** save version. Nie hardcode'ować obecnego numeru w planie, bo dependency 043 może zmienić go wcześniej.

## Pliki / główne integration points

Przewidywany scope:

- `src/quests/builderFinishLocalWell.ts` — contextual selection + definition;
- `src/quests/builderFinishLocalWell.test.ts`;
- `src/quests/quests.ts` — bound well objective;
- `src/quests/QuestManager.ts` + tests — logical well lookup, availability/completion/invalidation;
- `src/world/playerWell.ts` — minimal authored provenance type;
- `src/world/createPlayerWells.ts` + tests — idempotent explicit-ID authored well seam;
- `src/app/createApp.ts` — context materialization + live lookup injection;
- `src/app/actions/placementActions.ts` / inspection path only as needed to prevent normal cancellation of authored target;
- `src/persistence/saveData.ts` + persistence tests — provenance round-trip/migration;
- actual cultivation/water-source seam shipped by `settlements-npcs-043` — integration only, bez duplikowania hydration logic.

Nie rozszerzać zakresu o generic construction quest framework.

## Testy

### Availability

- quest appears only for a valid settlement + cultivation + giver + placement context;
- target must provide a real shorter water route;
- completed/water-available target blocks availability;
- missing giver/target handled safely;
- completing target before accept gives no reward.

### Binding

- quest definition contains stable well ID;
- another well cannot satisfy objective;
- repeated context resolution reuses the same target;
- save/load preserves exact target;
- WorldBundle/settlement unload-reload does not lose binding.

### Construction

- authored target enters normal `well` stage through real material gate;
- 6 stone + 3 branch are consumed by ordinary construction semantics;
- player work mutates only real `PlayerWellRecord.workProgress`;
- hired NPC Work Contract can advance the same record;
- quest stores no duplicate material/work progress.

### Completion

- `isWellWaterAvailable` on bound record satisfies objective;
- hired NPC completion satisfies it too;
- missing active target invalidates safely;
- WaterSource behavior is ordinary well behavior;
- optional later roof construction remains outside quest lifecycle.

### Regression

- ordinary player well placement/construction unchanged;
- normal unfinished-well cancellation remains available for non-authored wells;
- Work Contracts unchanged outside this target;
- Farmer hydration/source selection has no dependency on quest id/state;
- settlement wells and other player-built wells keep existing source selection behavior.

## Browser verification

User wykonuje manualnie. AI nie uruchamia browser verification.

1. Znaleźć settlement z contextual quest giverem.
2. Zobaczyć niedokończoną fizyczną studnię przy realnym cultivation area.
3. Przed ukończeniem potwierdzić, że ta studnia nie jest usable.
4. Przyjąć quest.
5. Dostarczyć normalne materiały w istniejący construction-material flow i rozpocząć pracę.
6. Zobaczyć realny progress tej samej studni; opcjonalnie zlecić część pracy przez Work Contract.
7. Ukończyć body studni.
8. Potwierdzić quest completion/report na podstawie `isWellWaterAvailable`.
9. Potwierdzić normalne użycie jako `WaterSource`.
10. Gdy cultivation wymaga podlewania, zaobserwować Farmer watering wybierający lokalne źródło, jeśli jest najbliższe.
11. Save/load i ponownie sprawdzić quest, well identity, progress/source state i brak duplikatu.
12. Opcjonalnie dokończyć dach i potwierdzić, że jest to już zwykły well construction flow.

## Non-goals

Nie implementować tutaj:

- hydration system ani Farmer watering AI z 043;
- nowego well construction systemu;
- `builder` Role/workplace/profession AI;
- generic Builder quest generatora;
- nowego Work Contract framework;
- outpost;
- palisade quest;
- nowych items;
- general settlement development AI;
- quest-only watering bonusu;
- nowego WaterSource subsystemu;
- nowego Known Deed.

## Guardrails

- repository/current code pozostaje source of truth;
- unfinished dependency 043 traktować przez zapisany kontrakt, nie guessed API;
- authored well jest realnym world recordem i ma jednego ownera;
- quest obserwuje world state, nie kopiuje go;
- żadnych runtime mesh refs w persisted binding;
- żadnego `Date.now()` identity dla authored targetu;
- żadnego actor-specific contribution ledger tylko dla tego questa;
- dla ważnych nowych publicznych/architektonicznych helperów dodać JSDoc z `@domain`;
- nie wykonywać browser verification przez AI;
- nie uruchamiać `pnpm docs:sync`.

Szczegółowy recon, symbole i edge cases: `docs/plans/implementation-notes/quests-progression-060-builder-finish-local-well-implementation-notes.md`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
