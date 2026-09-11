# Plan: Non-Home Settlement Food Production v1

**Created:** 2026-09-11  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** none  
**Domain:** `settlements-npcs`  
**Type:** `feature`  
**Roadmap:** `docs/roadmap/agriculture-and-cultivation.md`  

## Cel

Uruchomić pierwszą, świadomie prostą wersję produkcji żywności w osadach innych niż home settlement.

Aktualnie non-home settlements mogą posiadać Farmerów, gardens i wizualne pola, ale ich rolnictwo ma dwie podstawowe luki:

1. gospodarstwa z realną agricultural capacity nie dostają początkowego realnego stocku nasion;
2. po unloadzie settlement jego runtime `Settlement` i `NpcAgent`s przestają być symulowane, więc produkcja zależy od obecności gracza.

Minimalny przepływ v1:

```text
non-home settlement
→ agricultural capacity
→ realny initial seed stock
→ existing crop rules
→ concrete crop ItemKinds
→ Household
→ existing surplus / SettlementEconomy flow
→ dalsza produkcja tak długo, jak istnieją realne inputy
```

Produkcja musi zachowywać ciągłość bez obecności gracza.

Plan nie implementuje kompletnej roadmapy agriculture ani sustainable seed recovery. Initial seed stock jest skończonym realnym zasobem; po jego wyczerpaniu produkcja może się zatrzymać do czasu wdrożenia kolejnego planu zamykającego pętlę nasion.

## 1. Recon — current code baseline

### 1.1 Home vs non-home settlement

`src/settlement/settlementGenerator.ts` posiada authoritative `SettlementDef.isHome`.

- `true` wyłącznie dla home settlement w komórce `(0,0)`;
- non-home settlements nie mogą być rozpoznawane ponownie przez pozycję, dystans od gracza ani specjalne id;
- `SettlementsManager` nie unloaduje home settlement, ale unloaduje pozostałe po wyjściu poza `unloadRadius`.

W tym planie używać wyłącznie istniejącego `SettlementDef.isHome` jako źródła rozróżnienia.

### 1.2 Farmer work

`src/ai/npcProfessionWork.ts::planFarmWork()` już implementuje detailed Farmer flow:

- rozwiązuje istniejący `CultivationAnchor`;
- preferuje harvest przed planting;
- korzysta z `SettlementFoodSourceHooks`;
- sadzi tylko wtedy, gdy `Household.items` zawiera realny seed item;
- usuwa seed atomowo przy udanym planting;
- używa istniejącego `ChunkManager.plantCrop()`;
- harvest przekazuje przez `Household.depositFood()`;
- overflow trafia do istniejącego `SettlementEconomy`.

Nie tworzyć:

- nowego Farmer AI;
- `FarmerInventory`;
- profession-specific crop registry;
- nowego work schedulera;
- nowego production storage.

### 1.3 Crop ownership

`src/world/cropLifecycle.ts` pozostaje źródłem prawdy dla:

- `CropId`;
- `CROP_DEFS`;
- growth timing;
- harvest item;
- yield;
- `resolveCropStage()`;
- `resolveCropHarvest()`.

`CropPlacement` / planted crops pozostają existing detailed reprezentacją fizycznych upraw.

Nie dodawać drugiego crop lifecycle ani farming-specific growth clock.

### 1.4 Household / economy

`Household.items` jest authoritative storage dla:

- seed items;
- concrete harvested food items.

`SettlementEconomy.items` jest authoritative settlement-level food storage.

Istniejący przepływ:

```text
harvest
→ Household.depositFood()
→ household capacity
→ overflow / surplus
→ SettlementEconomy.items
→ existing local exchange / Trader flow
```

pozostaje bez zmian.

Nie tworzyć abstrakcyjnego scalar `food`, drugiej ekonomii ani osobnego farmer storage.

## 2. `field` jako authoritative cultivation anchor

`VillagePlan` posiada landmark `field`, a `buildSettlementProps()` materializuje przy nim `farm.glb` / `createWheatField()`.

Obecnie jest to presentation-only. Farmer pracuje przez `SettlementLandmarks.cultivationAnchors`, które są tworzone z garden pads.

Rozszerzyć istniejący cultivation-anchor mechanism zamiast tworzyć nowy field system.

### Reguła v1

```text
foodSourceType === 'field'
→ authoritative agricultural anchor = field

otherwise
→ authoritative agricultural anchors = existing gardens
```

Dla `field` utworzyć realny `CultivationAnchor` z centralnie zdefiniowanym footprintem pola i podłączyć go do istniejącego `SettlementLandmarks.cultivationAnchors` / Farmer planning seam.

Nie traktować małego garden obok pola jako preferowanego gameplay targetu tylko dlatego, że garden anchor już istnieje.

Nie dodawać:

- `FieldSystem`;
- field-specific crop lifecycle;
- tile grid;
- species-specific density;
- species-specific yield.

V1 potrzebuje wyłącznie spójnego gameplay anchoru dla istniejącego Farmer flow.

## 3. Agricultural capacity

Initial resources i off-screen production nie powinny zależeć wyłącznie od jednego booleanu `hasFarmer`.

Wprowadzić małe, jawne pojęcie agricultural capacity wyprowadzone z już istniejącego settlement state, bez tworzenia osobnego profession system.

Minimum v1:

```text
real cultivation anchor(s)
+
real household / adult workforce z rolą Farmer
→ agricultural capacity
```

Capacity ma służyć wyłącznie jako ograniczenie produkcji i bootstrapu, nie jako nowa authoritative reprezentacja profesji.

Nie duplikować `Role`, family composition ani profession staffing.

Preferować mały resolver/helper nad persistent `AgricultureManager`.

## 4. Initial seed stock

Gospodarstwa uczestniczące w agricultural capacity muszą dostać mały, deterministyczny initial seed stock.

Seed stock:

- jest przechowywany wyłącznie w `Household.items`;
- korzysta z istniejących `CROP_SEED_ITEM`;
- jest dodawany tylko raz;
- nie jest dodawany ponownie po settlement stream-out/in;
- nie jest dodawany ponownie po save/load;
- nie zależy od obecności gracza;
- pozostaje zwykłym realnym inventory stockiem.

### Existing seam do reuse

`createHousehold()` ma już precedens profession-specific starting resource: Hunter household dostaje starting bandages przy genuinely first construction.

Nie dodawać kolejnego luźnego wyjątku `if (hasFarmer) ...` obok `hasHunter`, jeżeli można minimalnie uogólnić existing starting-resource seam.

Preferowany kierunek:

```text
family / profession composition
→ small starting-resource resolver
→ create/get Household
→ apply only if not already bootstrapped
```

Nie tworzyć osobnego inventory ani profession-resource registry, jeśli prosty data-driven mapping przy istniejącym household ownership wystarczy.

### V1 seed mix

Można użyć małego stałego lub deterministycznie jitterowanego zestawu istniejących:

- `seed_carrot`;
- `seed_potato`;
- `seed_cabbage`.

Nie implementować tutaj environment/species selection.

## 5. Existing-save bootstrap — dokładnie raz

Samo "first Household construction" nie wystarcza.

Istniejący save może zawierać non-home agricultural household utworzony przed tym planem. Taki household nie może zostać pominięty na zawsze, ale też nie może dostawać starter seeds przy każdym loadzie.

Wprowadzić jawny one-time bootstrap contract.

Wymagania:

- nowy agricultural household dostaje starter raz;
- istniejący pre-plan agricultural household może dostać starter raz przy pierwszym resolve po migracji;
- stream-out/in nie reseeduje;
- save/load nie reseeduje;
- zmiana detailed ↔ aggregate nie reseeduje;
- marker/bootstrap state musi być authoritative i persistowany albo jednoznacznie derivable z persistence version/household state bez fałszywych powtórzeń.

Preferować minimalny marker przy household/agricultural production state zamiast heurystyki typu "jeśli brak seedów, dodaj seeds" — brak seedów może być prawidłowym skutkiem zużycia.

Migracja starszego save powinna jawnie oznaczać brak wcześniejszego agriculture bootstrap, tak aby pierwszy resolve wykonał go dokładnie raz.

## 6. Loaded settlement — detailed production pozostaje authoritative

Gdy settlement jest loaded, zachować istniejący detailed flow:

```text
Farmer schedule/work
→ planFarmWork()
→ authoritative cultivation anchor
→ real seed
→ SettlementFoodSourceHooks.findPlantSpot()
→ ChunkManager.plantCrop()
→ shared CropLifecycle
→ harvest
→ Household.depositFood()
→ SettlementEconomy / local exchange
```

Nie uruchamiać aggregate production równolegle do działającego detailed settlement simulation.

Nie symulować dodatkowych "produkcyjnych ticków" tylko dlatego, że settlement jest non-home.

## 7. Unloaded non-home settlement — lazy agricultural catch-up

Aktualny `SettlementsManager` po unloadzie usuwa runtime `Settlement` i `NpcAgent`s, ale zachowuje registry-owned state, m.in.:

- `Household`;
- `SettlementEconomy`;
- authoritative NPC state.

Nie istnieje obecnie ogólna off-screen profession simulation, którą można tylko włączyć.

Dodać wąski lazy agricultural catch-up dla non-home settlements.

Nie budować w tym planie generalnego off-screen NPC schedulera.

### Lifecycle boundary

Catch-up powinien być rozliczany tylko na naturalnych boundaries, np.:

- przy stream-out ustawić/utrwalić temporal anchor;
- przed stream-in rozliczyć elapsed unloaded interval;
- przed snapshot/save rozliczyć state tylko wtedy, gdy jest to potrzebne dla poprawności persistence;
- przez jeden owner-correct manager-level/helper entry point, nie przez per-frame scan.

Dokładny owner `lastResolvedAtDays` ustalić podczas implementacji na podstawie najmniejszego existing state ownera, z wymaganiami:

- przeżywa stream-out/in;
- przeżywa save/load;
- nie należy do runtime `NpcAgent`;
- nie duplikuje `CropPlacement`;
- nie duplikuje `SettlementEconomy`.

Preferować minimalny settlement/household agricultural state nad osobnym globalnym `FarmManager`.

## 8. Batch catch-up zamiast historycznych crop cycles

Catch-up nie ma odtwarzać każdego historycznego:

```text
plant action
→ CropPlacement
→ mature
→ harvest action
```

Nie tworzyć historycznych meshów, NPC actions ani synthetic `CropPlacement`s.

Rozliczać produkcję batchowo z ograniczeń:

```text
elapsed unloaded world time
+ agricultural capacity
+ real available seeds
+ existing CROP_DEFS timings
+ existing CROP_DEFS yields
→ bounded number of completed production batches
```

Każdy rozliczony batch musi:

1. konsumować realny seed item;
2. produkować konkretny existing harvest `ItemKind`;
3. używać timing/yield z istniejących crop definitions;
4. trafiać przez `Household.depositFood()`;
5. respektować istniejący household capacity / overflow / SettlementEconomy.

Nie robić:

```text
food += elapsedDays * rate
```

ani żadnego farming-specific scalar production counter.

### Długi elapsed time

Algorytm musi być bounded.

Nie wykonywać pętli po tysiącach wirtualnych dni/cykli, jeżeli wynik można policzyć matematycznie z:

- seed count;
- cycle duration;
- capacity.

Koszt catch-up powinien być proporcjonalny do małej liczby agricultural households / crop kinds, nie do długości nieobecności gracza.

## 9. Detailed ↔ aggregate handoff

Najważniejszy invariant:

> Ten sam przedział czasu nie może zostać rozliczony przez detailed Farmer simulation i aggregate catch-up jednocześnie.

### Stream-out

- detailed production kończy się wraz z runtime settlement;
- zachować authoritative Household/Economy;
- zapisać właściwy temporal boundary;
- nie kasować już wykonanej produkcji;
- nie materializować nowych off-screen crops.

### Stream-in

- najpierw rozliczyć dokładnie zakończony off-screen interval;
- następnie uruchomić normalny detailed `Settlement` / `NpcAgent` flow;
- nie odtwarzać historycznych planting/harvest actions;
- repeated resolve przy tym samym `worldDays` musi być idempotentny.

### Home settlement

Home settlement nie korzysta z tego aggregate path, ponieważ pozostaje loaded i ma detailed simulation.

## 10. Seeds w Phase 1

Ten plan nie implementuje sustainable seed recovery.

Initial seed stock ma umożliwić realną pierwszą produkcję, ale pozostaje skończony.

```text
initial real seeds
→ planting / aggregate production
→ harvest
→ food
→ seeds mogą się skończyć
→ production stops
```

Nie uzupełniać nasion automatycznie.

Kolejny plan ma zamknąć prawdziwą pętlę:

```text
crop harvest
→ species-dependent seed recovery
→ seed reserve
→ replanting
→ surplus
```

Nie implementować temporary magical refill, którego później trzeba usuwać.

## 11. Persistence

Reuse istniejącej persistence:

- `HouseholdSnapshot.items` dla seed stock i concrete food;
- `SettlementEconomySnapshot` dla village storage;
- `SaveData.plantedCrops` dla realnych detailed planted crops.

Jeśli lazy catch-up wymaga nowego state, persistować wyłącznie minimum nierederwowalne, np.:

- one-time bootstrap marker;
- last agricultural resolution world-day anchor;
- ewentualny minimalny in-progress aggregate anchor tylko jeśli faktycznie potrzebny.

Nie persistować:

- crop visuals;
- calculated production rate;
- history wszystkich cykli;
- history wszystkich plant/harvest events;
- synthetic off-screen crops;
- Farmer runtime FSM/action state;
- danych, które można wyliczyć z `CROP_DEFS`, family composition lub settlement plan.

Każda zmiana `SaveData` musi użyć istniejącego migration/validation flow.

## 12. Performance

Wymagania:

- zero per-frame processing wszystkich settlements;
- zero globalnego scanowania wszystkich NPC → fields;
- zero permanentnych `NpcAgent`s dla unloaded settlements;
- zero permanentnych Three.js objects dla unloaded agriculture;
- zero historical CropPlacement materialization;
- bounded lazy catch-up;
- deterministic output;
- brak nowego Workera;
- brak nowego monolitycznego simulation managera.

Loaded settlement nadal używa high-fidelity existing simulation. Unloaded settlement używa małego aggregate resolvera.

## 13. Relevant systems / files

Zweryfikowane główne integration points:

- `src/settlement/settlementGenerator.ts`
  - `SettlementDef.isHome`
  - `foodSourceType`
- `src/settlement/villagePlanner.ts`
  - `field` landmark
- `src/settlement/props.ts`
  - `SettlementLandmarks`
  - garden cultivation anchors
  - visual field placement
- `src/world/cultivationAnchor.ts`
  - shared cultivation-anchor contract
- `src/ai/npcProfessionWork.ts`
  - `planFarmWork()`
- `src/world/foodSources.ts`
  - `SettlementFoodSourceHooks`
- `src/world/cropLifecycle.ts`
  - `CropPlacement`
  - `CROP_DEFS`
  - `resolveCropStage()`
  - `resolveCropHarvest()`
- `src/world/plantedCrops.ts`
  - `CROP_SEED_ITEM`
- `src/settlement/household.ts`
  - `Household.items`
  - starting household resources
  - `depositFood()`
  - `HouseholdSnapshot`
- `src/settlement/createSettlement.ts`
  - family → Household binding
  - profession composition available before household creation
- `src/settlement/SettlementsManager.ts`
  - home/non-home streaming
  - long-lived household/economy registries
  - unload/load boundary
- `src/economy/settlementEconomy.ts`
  - existing settlement-level food storage
- `src/persistence/saveData.ts`
- `src/app/saveState.ts`

Nie zakładać, że każdy z tych plików musi się zmienić. Implementacja ma wybrać najmniejszy owner-correct zestaw.

## 14. Existing mechanisms do reuse

Plan ma wzmacniać już istniejące mechanizmy:

- profession staffing / `Role`;
- `CultivationAnchor`;
- `planFarmWork()`;
- `SettlementFoodSourceHooks`;
- `ChunkManager.plantCrop()`;
- `CropLifecycle`;
- `Household.items`;
- `Household.depositFood()`;
- `SettlementEconomy.items`;
- `HouseholdRegistry` / `EconomyRegistry` survival across streaming;
- existing SaveData migration/validation.

Nie tworzyć równoległych odpowiedników.

## 15. Tests

Rozszerzyć istniejące testy i dodać tylko mały dedicated test resolvera catch-up, jeśli zostanie wydzielony jako pure helper.

### Field / cultivation

- `field` settlement tworzy realny `CultivationAnchor`;
- Farmer w `foodSourceType === 'field'` korzysta z field anchor;
- garden settlement zachowuje obecne garden behaviour;
- brak `FieldSystem` / osobnego crop state.

### Farmer detailed flow

- harvest nadal ma priorytet nad planting;
- Farmer nie sadzi bez realnego seed itemu;
- planting konsumuje realny seed;
- harvest trafia przez `Household.depositFood()`;
- nie powstaje duplicated crop state.

### Initial resources

- household z agricultural capacity dostaje deterministic initial seeds;
- household bez agricultural capacity nie dostaje seeds;
- stream-out/in nie reseeduje;
- save/load nie reseeduje;
- pre-plan existing agricultural household dostaje one-time bootstrap dokładnie raz;
- brak seeds po ich zużyciu nie uruchamia bootstrap ponownie.

### Aggregate catch-up

- home settlement jest wyłączony;
- unloaded non-home agricultural settlement produkuje;
- non-agricultural settlement nie produkuje;
- real seed jest wymagany i konsumowany;
- brak seeds → brak produkcji;
- output jest konkretnym crop `ItemKind`;
- timing korzysta z existing `CROP_DEFS`;
- household capacity i overflow używają existing economy flow;
- elapsed interval rozlicza się batchowo;
- bardzo długi elapsed time ma bounded cost;
- repeated resolve przy tym samym `worldDays` jest idempotentny;
- stream-in nie double-countuje;
- loaded detailed i unloaded aggregate paths nie overlapują.

### Persistence

- bootstrap marker/state round-trips;
- temporal catch-up anchor round-trips;
- seed stock i produced food round-tripują przez existing household persistence;
- older save migration pozwala na one-time bootstrap bez wielokrotnego grantowania.

Istniejące testy do zachowania/rozszerzenia obejmują co najmniej:

- `src/ai/npcProfessionWork.test.ts`;
- `src/world/cropLifecycle.test.ts`;
- `src/settlement/household.test.ts`;
- `src/settlement/professionStaffing.test.ts`;
- `src/persistence/saveData.test.ts`;
- relevant settlement streaming tests.

## 16. Verification

### Technical

- `pnpm lint:fix`
- `pnpm typecheck`
- relevant unit/integration tests
- `pnpm test`
- `pnpm build`

### Browser — User

AI nie wykonuje browser verification.

User sprawdza manualnie:

1. znaleźć non-home settlement z agricultural capacity;
2. dla `foodSourceType === 'field'` potwierdzić, że Farmer rzeczywiście pracuje przy polu, nie przy małym garden fallback;
3. potwierdzić planting realnych crops;
4. potwierdzić spadek realnego seed stock;
5. potwierdzić harvest do Household / settlement storage;
6. oddalić się tak, aby settlement się unloadował;
7. przepuścić odpowiednią ilość world time;
8. wrócić i potwierdzić catch-up food + seed consumption;
9. wejście/wyjście bez upływu czasu nie produkuje dodatkowego food;
10. po wyczerpaniu seeds produkcja zatrzymuje się;
11. save/load nie dodaje ponownie starter seeds;
12. istniejący starszy save dostaje starter tylko raz.

## 17. Out of scope

Nie implementować:

- species-driven sowing rules;
- species-specific planting density;
- species-specific field capacity;
- nowych crop species;
- nowych crop yield tables poza reuse obecnego `CROP_DEFS`;
- sustainable seed recovery;
- seed sorting / quality / storage losses;
- hydration pól;
- irrigation;
- perennial crops;
- self-seeding;
- crop rotation;
- soil fertility;
- weeds/disease expansion;
- pełnej aggregate simulation wszystkich profesji;
- globalnego off-screen NPC scheduler;
- inter-settlement food trade;
- nowej ekonomii;
- Farmer inventory;
- drugiego crop lifecycle.

## 18. Follow-up plans

Kolejne osobne plany powinny rozwijać ten sam seam:

1. species-driven sowing / density / yield;
2. sustainable seed recovery / replanting;
3. hydration / weather coupling;
4. perennial crops / self-seeding;
5. dalsza hybrid/off-screen agriculture simulation, jeśli potrzebna.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
