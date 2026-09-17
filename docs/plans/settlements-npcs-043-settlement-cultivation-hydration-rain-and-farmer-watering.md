# Plan: Settlement Cultivation Hydration, Rain & Farmer Watering

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** ~~settlements-npcs-001~~, ~~settlements-npcs-002~~, ~~settlements-npcs-030~~
**Domain:** `settlements-npcs`
**Type:** `feature`
**Subdomains:** `economy` `schedules`
**Tags:** `farmer` `cultivation` `hydration` `watering` `weather` `persistence`
**Roadmap:** `quests-professions-and-world-consequences.md`
**Model:** Opus, Sonnet

## Cel

Rozszerzyć istniejący hydration/drought model z `PlayerGardenRecord` na authoritative settlement cultivation site (`field` albo primary `garden`) bez tworzenia drugiego systemu farmingu.

Po implementacji settlementowe uprawy mają:

- persistent hydration + drought state;
- ten sam deterministic rain/drying model co player garden;
- realny wpływ drought na cultivated harvest;
- loaded Farmer watering przez istniejący profession/action lifecycle;
- wybór realnej usable studni względem położenia pola;
- continuity przez save/load, time skip i settlement stream-out/in;
- bounded aggregate consequence dla unloaded non-home settlementów.

Najważniejszy przyszły use case ma działać systemowo:

```text
pole jest suche
→ Farmer potrzebuje wody
→ najbliższa usable studnia jest daleko
→ Builder kończy bliższą studnię
→ ta studnia staje się poprawnym water targetem
→ następne watering używa bliższego źródła
→ realna trasa pracy Farmera jest krótsza
```

Nie implementować w tym planie questa Buildera.

## 1. Stan obecny zweryfikowany w kodzie

### 1.1 Player hydration jest już zaimplementowane

`src/world/playerGarden.ts` jest obecnym ownerem player-built garden state i zawiera:

- `PlayerGardenRecord.hydration`;
- `lastHydrationUpdateAtDays`;
- `droughtStressDays`;
- lazy `resolveGardenHydration()`;
- `applyGardenWatering()`;
- deterministic rain z `world/weather.ts`;
- bounded replay przez `HYDRATION_SIM_WINDOW_DAYS`;
- shared drought/yield constants;
- watering gain i 1 L player watering cost.

Nie kopiować tych reguł do settlement code.

Aktualny plan 001 nie zmienia `CropLifecycle` dla drought. Low hydration wpływa na accumulated drought/yield; natural crop lifecycle pozostaje wspólny i hydration-agnostic.

### 1.2 Settlement cultivation nie ma hydration ownera

`src/world/cultivationAnchor.ts::CultivationAnchor` jest tylko read-contractem:

```ts
position + radius
```

`src/settlement/props.ts` wystawia runtime `SettlementLandmarks.cultivationAnchors`.

Po `settlements-npcs-030`:

- dla `foodSourceType === 'field'` field anchor jest pierwszy i Farmer wybiera pole;
- w pozostałych settlementach Farmer używa primary garden;
- pozostałe visual gardens nie są osobnymi authoritative farming loops.

`CultivationAnchor` nie posiada persistent state i ma taki pozostać.

### 1.3 Detailed Farmer flow istnieje

`src/ai/npcProfessionWork.ts::planFarmWork()` już działa przez istniejący:

```text
schedule: work
→ planProfessionWork()
→ NpcPlannedAction
→ goTo / execute / onComplete / next
```

Aktualny Farmer:

```text
harvest ready crop
→ else plant from real Household seed
→ else fallback
```

Nie podlewa settlement cultivation.

### 1.4 Off-screen agriculture już istnieje

`src/settlement/settlementAgriculture.ts` implementuje `settlements-npcs-030`:

- household agricultural capacity z adult Farmer coverage;
- bounded non-home catch-up;
- realne `seed_*` z `Household.items`;
- `CROP_DEFS` timing/yield;
- seed recovery;
- `Household.depositFood()` / `SettlementEconomy`;
- bez historycznych `CropPlacement`s i bez off-screen `NpcAgent`.

Ten mechanizm rozszerzyć. Nie tworzyć drugiego off-screen schedulera.

### 1.5 Istniejący water lookup jest częściowo wystarczający

`src/world/WaterSource.ts` opisuje semantykę źródła, ale nie posiada identity/position/query.

Aktualny NPC water path ma już:

- `SettlementLandmarks.wells` z stable well id, pozycją i queue id;
- `PlayerWells.nearestCompleted()` / `NearbyPlayerWellLookup` dla player-built wells;
- `NpcAgent.resolveWaterWellTarget()` wybierający bliższą usable studnię.

`nearestCompleted()` ma historyczną nazwę: faktycznie używa `isWellWaterAvailable()`, więc roof completion nie jest wymagane. Nie zastępować tego warunkiem `isWellCompleted()`.

## 2. Ownership settlement cultivation state

### Decyzja

Hydration musi należeć do persistent **settlement cultivation site**, nie do NPC, household, crop, prop ani `CultivationAnchor`.

Dodać minimalny data-only record, np.:

```ts
type SettlementCultivationRecord = {
  id: string
  settlementId: string
  landmarkId: string
  hydration: number
  lastHydrationUpdateAtDays: number
  droughtStressDays: number
}
```

Nie persistować:

- `x/z`;
- radius;
- `Object3D` / mesh;
- crop placement ids;
- weather history;
- computed productivity;
- Farmer action state.

Pozycja/footprint są deterministic projection aktualnego `SettlementDef.villagePlan` / runtime landmarks.

### Owner lifecycle

Recordy mają być long-lived state owned pod `SettlementsManager`, analogicznie do innych settlement registries/state stores, i przeżyć:

```text
runtime settlement dispose
→ stream-out
→ time passage
→ stream-in
→ WorldBundle save/restore
```

Można użyć małego registry/mapy wyłącznie do ownership/lookup/serialization. Nie może ono:

- tickować hydration;
- wybierać pracy Farmera;
- szukać studni;
- prowadzić osobnego scheduler/FSM.

Nie tworzyć `SettlementWateringManager`.

### Dlaczego nie `HouseholdAgricultureState`

`HouseholdAgricultureState` jest per-family i obecnie posiada starter-seed marker + `lastResolvedAtDays` produkcji aggregate.

Jedno fizyczne field/garden może obsługiwać wielu Farmerów/households. Hydration w household duplikowałoby stan jednego cultivation site.

### Dlaczego nie `CultivationAnchor`

Anchor jest runtime read projection. Mutable/persistent hydration na nim sprzęgałoby simulation z presentation i niszczyło jego obecny kontrakt.

## 3. Stable cultivation-site identity

Nie identyfikować site przez `x/z`.

`src/settlement/villagePlan.ts::VillageLandmarkPlan.id` jest już stable deterministic identity dla `field` / `garden`.

Dodać jeden canonical helper, np.:

```ts
settlementCultivationSiteId(settlementId, landmarkId)
```

V1 ma jeden authoritative site na settlement, zgodny z aktualnym Farmer targeting:

```text
foodSourceType === 'field'
→ planned field landmark

otherwise
→ primary planned garden landmark
```

Runtime cultivation anchor powinien przenosić read-only binding do site identity. Dopuszczalne jest rozszerzenie `CultivationAnchor` o `siteId` wyłącznie jako identity/read contract; hydration nadal żyje poza anchorem.

Jeżeli compatibility fixtures/fallback anchor nie mają realnego landmark id, nie generować dla nich persistent id z pozycji. Taki fallback może nadal służyć testowemu targetingowi, ale nie może tworzyć settlement cultivation state.

## 4. Shared hydration/rain/drought domain

Nie importować settlement state do `PlayerGardenRecord` ani odwrotnie.

Wydzielić z `src/world/playerGarden.ts` najmniejszą wspólną warstwę, np. `src/world/cultivationHydration.ts`:

```ts
type CultivationHydrationState = {
  hydration: number
  lastHydrationUpdateAtDays: number
  droughtStressDays: number
}

resolveCultivationHydration(...)
applyCultivationWatering(...)
resolveCultivationHydrationAfterHarvest(...)
droughtYieldMultiplier(...)
```

Reuse bez zmiany semantyki:

- `HYDRATION_DRY_RATE_PER_DAY`;
- `HYDRATION_RAIN_GAIN_PER_DAY`;
- `HYDRATION_DROUGHT_THRESHOLD`;
- `HYDRATION_SIM_WINDOW_DAYS`;
- `WATERING_HYDRATION_GAIN`;
- bounded weather-cycle replay;
- drought cap/steps.

`PlayerGardenRecord` dalej embedduje te same trzy pola i korzysta z nowych shared primitives.

`src/world/weather.ts` pozostaje jedynym weather/rain ownerem. Nie tworzyć settlement-specific weather ani rain event history.

Settlement cultivation w tym planie **nie dostaje player garden `care`**. To osobny mechanic bez aktualnego settlement ownera.

## 5. Lazy hydration contract

Hydration nie tickuje per frame.

Każdy read/mutation:

```text
persisted hydration state
→ resolve stale interval against seed + worldDays + weather
→ current hydration/drought
→ optional watering/harvest mutation
→ persist checkpoint
```

Wymagania:

- deterministic;
- bounded cost niezależny od wieku świata;
- clamp zgodny z player hydration;
- time skip rozliczany przy następnym resolve;
- unload nie resetuje ani nie checkpointuje hydration „na siłę”;
- rain nie skanuje settlementów.

## 6. Cultivated crop yield integration

Nie zmieniać globalnie `src/world/cropLifecycle.ts`.

Drought ma wejść na cultivated harvest boundary:

```text
CropLifecycle base yield
→ resolve cultivation owner at crop position
→ player garden OR settlement cultivation site
→ shared hydration/drought modifier
→ actual yield
```

Aktualnie `src/world/foodSources.ts::harvest()` stosuje modifier tylko dla `PlayerGardenRecord`. Rozszerzyć domenowy harvest seam tak, aby settlement cultivated crop korzystał z settlement site state.

`src/app/actions/gatheringActions.ts` również musi użyć tego samego resolvera. Player harvesting settlement crop i Farmer harvesting ten sam crop nie mogą mieć innych reguł.

Natural/wild crop bez cultivation ownera zachowuje bieżący yield.

Po successful cultivated harvest:

- resolve hydration do `nowDays`;
- apply actual drought/yield result;
- reset accumulated drought stress przez shared post-harvest primitive;
- hydration pozostaje na bieżącej wartości.

Nie resetować drought na watering.

## 7. Real water-source targeting

### V1 source set

Farmer watering korzysta z realnych well sources już wspieranych przez NPC infrastructure:

- settlement wells;
- usable player-built wells.

Nie dodawać w tym planie NPC shoreline discovery dla lake/river. Obecny kod nie ma równoważnego stable bounded point lookup dla natural shoreline sources, a nie jest to potrzebne do Builder-well consequence.

### Generalizacja istniejącego lookup

Reuse/generalize `NpcAgent.resolveWaterWellTarget()` zamiast pisać watering-specific search.

Nowy/shared lookup ma przyjmować arbitrary origin:

```text
origin = cultivation site position
```

nie household home i nie current NPC position.

Wynik powinien posiadać minimum:

- stable source id;
- world position;
- queue id jeśli source używa kolejki;
- source/usability semantics potrzebne do revalidation.

Wybór:

```text
currently usable candidates
→ nearest distance from cultivation site
→ stable-id tie-break
```

Dla player-built well używać `isWellWaterAvailable()`, zgodnie z aktualnym NPC drinking/fetching semantics.

To jest fundament pod:

```text
far field + distant well
→ new closer usable well
→ next query chooses closer target
```

bez quest-specific hooka.

## 8. NPC water carrying

### Decyzja V1

Nie wymagać fizycznego `wooden_bucket` / `copper_bucket` item instance.

Player liquid containers są poprawnym physical inventory modelem, ale current profession work nie ma generic persistent NPC liquid-container logistics. Wprowadzenie wiadra wymagałoby osobnego zakresu: provisioning, ownership, liquid instances, interruption recovery i persistence.

Watering używa wąskiego **transient action-local payload**:

```text
Farmer reaches real usable well
→ successful source step grants one transient watering charge / 1 L semantic payload
→ Farmer reaches exact cultivation site
→ site revalidation
→ apply shared watering
→ payload consumed with action chain
```

Nie persistować tego payloadu i nie dodawać `NpcHeldWater` state/managera.

Przerwanie action chain przed final watering nie zmienia hydration.

W przyszłości generic NPC liquid-item logistics może zastąpić payload bez zmiany cultivation ownership/source routing.

## 9. Farmer work integration

Rozszerzyć istniejący `planFarmWork()`.

Priorytet V1:

```text
resolve authoritative site + current hydration
→ dry enough to require watering?
    → find real usable well
    → source action
    → field action
    → watering
→ else harvest ready crop
→ else plant from real seed
→ else fallback
```

Watering trigger ma używać shared hydration policy/constant, nie lokalnego magic number. Początkową granicą powinien być istniejący drought threshold, chyba że podczas implementacji aktualny shared domain już ma bardziej właściwy `shouldWater` predicate.

### Action lifecycle

Użyć istniejącego `NpcPlannedAction` + `next`.

Wymagane revalidation:

1. query source przy planowaniu;
2. source nadal usable przy completion pobrania;
3. site nadal istnieje / identity pasuje przy final action;
4. resolve stale hydration ponownie w finalnym `onComplete`;
5. apply dokładnie jedno watering gain.

Nie mutować hydration:

- przy decision;
- przy rozpoczęciu ruchu;
- przy samym dotarciu do source.

### Brak source

Brak usable studni nie może blokować całego Farmer AI. Farmer przechodzi do istniejącego harvest/plant/fallback. Drought consequences nadal obowiązują.

## 10. Integration points

### `src/world/playerGarden.ts`

- zachować `PlayerGardenRecord` ownership;
- wydzielić/reuse hydration/drought math;
- nie zmieniać player watering semantics.

### `src/world/cultivationAnchor.ts`

- zachować geometry/read contract;
- ewentualnie dodać read-only `siteId` binding;
- bez mutable hydration.

### `src/world/foodSources.ts`

- settlement cultivated harvest modifier;
- site drought reset po harvest;
- brak globalnego crop scan poza istniejącymi bounded local hooks.

### `src/world/plantedCrops.ts`

- bez nowego crop state;
- zachować real seed/sowing-unit semantics.

### `src/world/cropLifecycle.ts`

- bez settlement hydration fields/timers;
- dalej base timing/yield + seed-recovery definitions.

### `src/world/weather.ts`

- reuse `computeWeather`, season/cycle rules;
- bez nowego weather ownera.

### `src/world/WaterSource.ts` / `src/world/playerWell.ts`

- reuse source semantics;
- `isWellWaterAvailable()` jest usability contractem;
- `WaterSource` nie staje się spatial registry.

### `src/ai/npcProfessionWork.ts`

- watering jako kolejna normalna ścieżka `planFarmWork()`;
- source→field przez existing action lifecycle.

### `src/ai/NpcAgent.ts`

- wyciągnąć/reuse istniejącą well selection policy dla arbitrary origin;
- nie dodawać Farmer FSM.

### `src/settlement/props.ts`

- projected anchor dostaje stable site binding z plan landmark;
- żadnego state ownership na propach.

### `src/settlement/createSettlement.ts`

- bind authoritative planned cultivation site;
- inject narrow cultivation/water hooks do NPC work;
- stream-in catch-up korzysta z tego samego site record.

### `src/settlement/SettlementsManager.ts`

- long-lived owner/lookup/snapshot settlement cultivation records;
- bez per-frame hydration loop.

### `src/settlement/settlementAgriculture.ts`

- preserve current bounded aggregate agriculture;
- add hydration/drought productivity input;
- no synthetic NPC watering.

### `src/persistence/saveData.ts`

- normal versioned schema + migration;
- persist minimal cultivation records.

## 11. Off-screen agriculture

### Decyzja

Unloaded Farmer watering **nie jest fizycznie symulowane**.

Dla unloaded non-home settlement:

```text
no NpcAgent
no source trip
no watering action

persistent cultivation hydration
→ lazy rain/drying/drought resolve
→ existing aggregate production
→ drought-constrained yield
```

To jest świadomy hybrid-simulation boundary.

### Aggregate constraint

`resolveSettlementAgricultureCatchUp()` ma rozwiązać authoritative settlement site przy catch-up i użyć jego hydration/drought do produkcji.

Aktualny aggregate flow liczy:

```text
CROP_DEFS base yield
→ seed recovery z base yield
```

Po tym planie:

```text
base yield
→ shared hydration/drought modifier
→ actual aggregate yield
→ seed recovery z actual yield
→ existing bounded batch calculation/storage
```

Nie grantować seed recovery z pełnego base yield, jeśli drought ograniczył rzeczywisty harvest.

Użyć jednego deterministic productivity snapshotu dla bounded catch-up. Nie odtwarzać historycznych watering trips, Farmer actions ani każdego crop cycle.

Jeśli aggregate catch-up materializuje co najmniej jeden cultivated harvest, resetować drought stress site przez ten sam post-harvest primitive przy `nowDays`.

Repeated catch-up dla tego samego `nowDays` musi pozostać idempotentny.

Home settlement pozostaje na detailed simulation i nie produkuje przez aggregate path.

## 12. Persistence, migration i bootstrap exactly once

Nie przechowywać hydration na runtime settlement/mesh.

Dodać settlement cultivation records do normalnego save snapshot/restore i `saveData.ts` validation/migration.

Nie wpisywać numeru `CURRENT_SAVE_VERSION` do implementacji planu — przed zmianą schema użyć aktualnego `main`.

### Existing save migration

Migration tworzy pustą nową collection, bez retroaktywnego drought history.

Przy pierwszym resolve deterministic authoritative site po migration:

```text
record missing
→ create once
→ hydration = fresh-site baseline (100)
→ lastHydrationUpdateAtDays = current nowDays
→ droughtStressDays = 0
→ persist record
```

Record existence jest markerem bootstrap. Nie potrzebujemy osobnego `hydrationInitialized` boolean.

Nie inicjalizować anchoru na day 0 dla istniejącego świata — spowodowałoby retroaktywną suszę za okres, gdy mechanic nie istniał.

### Fresh world

Record jest `getOrCreate` przy pierwszym normalnym poznaniu authoritative cultivation site i od tej chwili zachowuje pełną continuity.

### Required continuity

- save/load;
- WorldBundle rebuild;
- settlement unload/load;
- time skip;
- repeated settlement reconstruction;
- deterministic same seed/world time.

## 13. Performance

Wymagania:

- zero per-frame hydration tick;
- zero rain→all-fields broadcast;
- zero global NPC→fields scan;
- zero global field→all-world-water scan;
- source lookup tylko na Farmer watering decision boundary;
- bounded player-well/settlement-well query;
- hydration replay bounded przez istniejący horizon;
- aggregate agriculture cost niezależny od liczby elapsed days;
- żadnego nowego Workera.

## 14. Scope

Implementować:

- settlement cultivation persistent hydration record;
- stable site id z planned landmark identity;
- shared player/settlement hydration primitives;
- deterministic rain/drying/drought;
- settlement cultivated yield modifier;
- loaded Farmer real source→field watering route;
- nearest usable well selection from field origin;
- transient watering payload;
- aggregate drought productivity constraint;
- persistence/migration/bootstrap;
- focused tests.

## 15. Non-goals

Nie implementować:

- Builder quest/story/dialogue/reward;
- `SettlementWateringManager`;
- mutable state na `CultivationAnchor`;
- second Farmer AI / scheduler / FSM;
- physical NPC bucket ownership/liquid inventory logistics;
- lake/river shoreline discovery dla Farmer watering;
- irrigation channels;
- settlement `care`/weeding state;
- second crop lifecycle;
- literal hydration-based pause `CropLifecycle`;
- spatial rainfall;
- historical watering/rain event logs;
- historical off-screen CropPlacements;
- per-frame off-screen profession simulation;
- quest-specific source preferences.

## 16. Testy

### Shared hydration

- player hydration results unchanged after extraction;
- player/settlement state with identical inputs resolves identically;
- rain contribution deterministic;
- long time gap remains bounded;
- watering resolves stale state before gain;
- harvest resets drought only.

### Site identity/state

- field site id uses stable `VillageLandmarkPlan.id`;
- non-field uses stable primary garden landmark id;
- same settlement rebuild → same id;
- no x/z-derived persistent ids;
- state survives unload/load and save/load;
- existing record never reinitializes.

### Persistence migration

- pre-043 save gains empty cultivation collection;
- first resolve bootstraps once at current world time;
- no retroactive drought from world day 0;
- second resolve does not reset hydration.

### Farmer

- dry site + usable source → watering chain before harvest/plant;
- query origin is field/site position;
- nearest usable well wins with deterministic tie-break;
- nearer newly-usable player well changes target;
- unusable/repair-blocked player well is ignored;
- interrupted source/return action → no hydration mutation;
- successful final field action waters exactly once;
- no source → existing harvest/plant fallback remains available;
- hydrated site keeps existing harvest-before-plant flow.

### Yield

- settlement cultivated crop receives drought penalty;
- 0 hydration follows shared cultivated-death/zero-yield rule;
- player and NPC harvest of settlement crop agree;
- natural crop yield unchanged;
- successful cultivated harvest resets site drought stress.

### Aggregate

- unloaded Farmer watering is not simulated;
- rain/drying influences aggregate productivity;
- drought-reduced yield drives seed recovery from actual yield;
- home does not aggregate;
- repeated resolve same `nowDays` is no-op;
- large elapsed interval remains bounded.

## 17. Manual browser verification — user

Implementation agent nie uruchamia browser verification.

User powinien sprawdzić:

1. Settlement field/garden wysycha bez deszczu.
2. Deszcz realnie podnosi/utrzymuje hydration.
3. Farmer podczas `work` wykrywa suche authoritative pole/ogród.
4. Farmer idzie do realnej usable studni, a potem wraca na pole i dopiero wtedy hydration rośnie.
5. Przy odległej studni trasa jest zauważalnie długa.
6. Po ukończeniu bliższej usable player-built well kolejne watering wybiera bliższą studnię i skraca trasę.
7. Unusable/repair-blocked well nie jest wybierane.
8. Drought obniża realny settlement crop harvest, ale wild crops pozostają bez zmian.
9. Non-home settlement po unload → elapsed time → reload zachowuje hydration/aggregate consequence.
10. Save/load nie resetuje cultivation state.
11. PlayerGarden hydration/watering nadal zachowuje się jak przed planem.

## 18. Implementation order

```text
1. Shared cultivation hydration extraction + player regression tests
2. Stable settlement cultivation site identity + persistent record owner
3. Save schema/migration/bootstrap
4. VillagePlan landmark → runtime anchor/site binding
5. Shared cultivated harvest modifier/reset
6. Reusable arbitrary-origin usable-well selection
7. planFarmWork() source→field watering chain
8. Off-screen agriculture hydration/yield integration
9. Focused domain/integration/persistence tests
10. Technical verification only; no browser verification, no pnpm docs:sync
```

Szczegółowe recon findings, pitfalls i symbol-level guidance:  
`docs/plans/implementation-notes/settlements-npcs-043-settlement-cultivation-hydration-rain-and-farmer-watering-implementation-notes.md`.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
