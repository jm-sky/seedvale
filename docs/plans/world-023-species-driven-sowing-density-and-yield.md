# Plan: Species-Driven Sowing, Density and Yield

**Created:** 2026-09-11
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `world`  
**Type:** `feature`  
**Roadmap:** `docs/roadmap/agriculture-and-cultivation.md`  

## Cel

Formalnie zmienić wspólną semantykę cropów z obecnego przypadkowego modelu:

```text
1 seed item
→ 1 CropPlacement
→ 1 wizualna roślina
→ 1 harvest item
```

na model species-driven:

```text
1 seed item = 1 sowing unit / porcja materiału siewnego

1 planted sowing unit
→ 1 CropPlacement
→ species-defined logical plant count
→ bounded visual representation
→ wspólny lazy lifecycle
→ species-defined base harvest
```

`CropPlacement` pozostaje jednostką symulacji i lifecycle, nie pojedynczą biologiczną rośliną.

Player, NPC Farmer, natural crops oraz aggregate agriculture z `settlements-npcs-030` mają korzystać z tego samego `CropDefinition`, lifecycle i harvest resolvera. Nie tworzyć osobnych modeli `FarmerYield`, `NPCFieldCrop`, `PlayerCropDefinition` ani per-plant runtime entities.

## 1. Current baseline i ownership

`src/world/cropLifecycle.ts` jest authoritative ownerem wspólnego crop modelu:

- `CropId`;
- `CropDefinition`;
- `CROP_DEFS`;
- species growth timing;
- `CropPlacement`;
- `resolveCropStage()`;
- `resolveCropHarvest()`.

Obecne species to `carrot`, `potato`, `cabbage`. Każdy posiada już własne `matureAfterDays` i `spoilAfterDays`, ale wszystkie mają obecnie `yieldCount: 1`.

Nie przywracać historycznego `growthDurations.seed/sprout/growing` z implementation notes planu 126. Aktualny `young → mature → spoiled` lifecycle jest źródłem prawdy.

Plan należy do domain `world`, ponieważ species semantics, lifecycle, placement i harvest są współdzielone przez naturalne cropy, playera i NPC. `settlements-npcs` pozostaje konsumentem tego kontraktu.

## 2. CropPlacement semantics

`CropPlacement` jest jedną logiczną jednostką populacji crop species w konkretnym miejscu.

Dla planted crop:

```text
1 consumed sowing unit
→ 1 CropPlacement
→ species-defined logical plant population
```

Dla natural crop:

```text
procedural natural placement
→ 1 CropPlacement
→ natural-generation population/density policy
```

Oba przypadki współdzielą:

- `CropDefinition`;
- species lifecycle;
- stage resolution;
- harvest semantics;
- rendering infrastructure tam, gdzie jest to praktyczne.

Nie utożsamiać jednak automatycznie naturalnego `CropPlacement` z jedną zasianą garścią materiału siewnego.

Nie rozszerzać `CropPlacement` o tablicę biological plants. Aktualny minimalny shape pozostaje wystarczający:

```ts
{
  id,
  x,
  z,
  cropId,
  stageStartedAt,
}
```

Nie persistować per-plant IDs, growth stages, timestamps ani visual transforms.

## 3. Seed item = sowing unit

Jeden count-based `seed_*` item oznacza jedną porcję / jednostkę materiału siewnego, a nie jedno biologiczne nasiono.

Jedna udana akcja planting nadal:

```text
consume seed item ×1
→ create CropPlacement ×1
```

Nie tworzyć wielu `CropPlacement`s z jednego seed itemu.

Player i NPC Farmer mają korzystać z tego samego kontraktu.

`tree_seed ×1 → 1 planted tree` pozostaje spójnym species-specific przypadkiem, ale nie jest powodem do unifikacji `TreeLifecycle` i `CropLifecycle`.

## 4. Species-driven definition

Rozszerzyć aktualny `CropDefinition` o minimalną authoritative informację opisującą logiczną populację jednego planted placementu.

Preferowany kierunek:

```ts
type CropDefinition = {
  id: CropId

  matureAfterDays: number
  spoilAfterDays: number

  logicalPlantsPerSowingUnit: number

  harvestItem: ItemKind
  yieldCount: number
  spoiledItem?: ItemKind
}
```

Nazwę pola zweryfikować przy implementacji względem aktualnych call-sites. Ważna jest semantyka, nie dokładna nazwa.

`logicalPlantsPerSowingUnit` opisuje biologiczną/logical population powstałą z jednej planted sowing unit. Nie oznacza liczby runtime entities ani liczby renderowanych meshów.

`yieldCount` pozostaje bazowym całkowitym plonem jednego zdrowego mature `CropPlacement` przed cultivation modifiers.

### Relacja logical plants → yield

Design musi jawnie zachować relację:

```text
species logical plant population
× species production characteristics
→ base placement yield
```

Nie oznacza to konieczności dodawania `yieldPerPlant` do runtime state ani wykonywania per-plant obliczeń.

`yieldCount` może pozostać precomputed/design-time totalem na placement, ale jego wartości powinny być uzasadnione przez logical plant count i charakter gatunku. `logicalPlantsPerSowingUnit` nie może stać się parametrem wyłącznie wizualnym.

Nie zakładać, że:

```text
logicalPlantsPerSowingUnit === yieldCount
```

Nie ustalać arbitralnie konkretnych wartości bez decyzji gameplay/design.

## 5. Seed item mapping

Obecne `CROP_SEED_ITEM` w `src/world/plantedCrops.ts` jest małym i czytelnym kontraktem itemowym.

Nie przenosić automatycznie `seedItem` do `CropDefinition` tylko po to, aby skonsolidować dwa typy odpowiedzialności.

Preferować:

- zachowanie `CROP_SEED_ITEM` jako item/planting mapping;
- test kompletności `CropId ↔ seed item`;
- brak duplikacji density/yield poza `CropDefinition`.

Jeżeli aktualny kod przy implementacji pokaże wyraźną korzyść z derivation, można zastosować thin derived adapter, ale nie tworzyć drugiego niezależnego źródła species semantics.

## 6. Shared planted-crop flow

### Player

Aktualny flow pozostaje:

```text
CropId
→ CROP_SEED_ITEM[cropId]
→ consume seed ×1
→ ChunkManager.plantCrop()
→ CropPlacement ×1
```

Zmienia się znaczenie placementu, nie player-specific planting flow.

Nie dodawać osobnej akcji „sow multiple plants”.

### NPC Farmer

Aktualny Farmer pozostaje na shared path:

```text
Household seed
→ findPlantSpot()
→ remove(seed, 1)
→ SettlementFoodSourceHooks.plant()
→ ChunkManager.plantCrop()
```

Harvest nadal przechodzi przez shared `ChunkManager.harvestCrop()` / crop harvest semantics, a wynik trafia do `Household.depositFood()`.

`FARM_SEED_PRIORITY` może pozostać polityką wyboru gatunku. Nie przechowywać density/yield w `npcProfessionWork.ts`.

Farmer nie zna i nie symuluje indywidualnych biological plants.

## 7. Harvest

`resolveCropHarvest()` pozostaje shared base-harvest resolverem.

Dla mature crop:

```text
CropDefinition.yieldCount
→ CropHarvestYield.count
```

Downstream pipeline pozostaje:

```text
species base yield
→ optional cultivation care/hydration modifier
→ final count
→ player Inventory / Household.depositFood()
```

Nie przenosić hydration/care do `CropDefinition` w tym planie.

Nie dodawać profession-specific multiplierów ani `FarmerYield`.

## 8. Natural crops

Naturalne cropy z `src/terrain/chunkCrops.ts` również używają `CropPlacement`, `CropDefinition`, `resolveCropStage()` i `resolveCropHarvest()`.

Nie tworzyć osobnego `NaturalCropDefinition` ani osobnego lifecycle/yield table.

Jednocześnie planted sowing density nie może automatycznie zamienić każdej proceduralnej dzikiej rośliny w pełne pole.

Natural placement powinien zachować własną deterministyczną presentation/population policy, opartą na tym samym species modelu, bez mnożenia simulation records.

W szczególności:

- nie zwiększać `CROP_CANDIDATES_PER_CHUNK` tylko po to, aby uzyskać gęstszy wygląd;
- nie tworzyć N natural `CropPlacement`s dla N biological plants;
- zachować aktualną sparse procedural generation;
- naturalny harvest nadal korzysta ze wspólnych species harvest semantics.

Jeżeli natural population wymaga osobnego derived parametru presentation, powinien on być stateless/deterministic i nie tworzyć równoległego lifecycle.

## 9. Compatibility with settlements-npcs-030

`settlements-npcs-030-non-home-settlement-food-production-v1.md` pozostaje ownerem:

- non-home agricultural capacity;
- field `CultivationAnchor`;
- starter seed bootstrap;
- detailed ↔ aggregate handoff;
- lazy off-screen agricultural catch-up.

031 nie zmienia tych granic ownership i nie wymaga technicznie wcześniejszej implementacji 030. Dlatego nie jest twardą dependency planu.

Po implementacji obu planów aggregate production z 030 musi korzystać z aktualnego shared species modelu:

```text
real seed unit consumed
→ species cycle duration
→ shared species base yield
→ Household.depositFood()
```

Nie kopiować plant count/yield do osobnego agriculture definition ani catch-up state.

Off-screen resolver nie materializuje biological plants, detailed `CropPlacement`s ani visual instances.

## 10. Rendering model

Obecne założenie:

```text
1 CropPlacement
→ 1 standalone Object3D
```

nie może zostać naiwnie pomnożone przez logical biological plant count.

Jawnie rozróżnić trzy wartości:

```text
logical biological plant count
simulation CropPlacement count
rendered instance count
```

### Logical count

Authoritative dla planted sowing unit i species-driven.

### Simulation count

Jeden lifecycle record na jeden `CropPlacement`.

### Rendered count

Presentation-only, deterministic i bounded.

Rendered count może być mniejszy niż logical count. Dla małej populacji renderer może pokazać wszystkie rośliny; dla gęstego gatunku może użyć reprezentatywnej liczby instancji.

Nie persistować rendered count ani transformów.

## 11. Species-aware visual policy

Nie zakładać automatycznie:

```text
renderedInstanceCount = logicalPlantsPerSowingUnit
```

Renderer potrzebuje species-aware presentation policy pozwalającej zachować czytelność i performance.

Może to być:

- mały pure resolver;
- derived visual density;
- bounded count wynikający z logical population i wspólnego visual budgetu.

Nie dodawać pola `visualDensity` do authoritative simulation state bez potrzeby. Jeśli parametr jest potrzebny, preferować presentation config lub derived resolver związany z crop visuals.

Przykładowy koncept:

```text
resolveCropVisualLayout(
  CropPlacement,
  CropDefinition,
  CropGrowthStage,
)
→ bounded deterministic visual transforms
```

Resolver nie posiada lifecycle i nie mutuje simulation state.

## 12. Deterministic visual seed

Visual layout musi być stabilny między:

- stage transitions;
- chunk unload/load;
- save/load.

Wyprowadzać visual seed deterministycznie z istniejącej identity, np. z:

```text
CropPlacement.id + cropId
```

Nie persistować dodatkowego visual seed, jeśli można go bezstratnie wyprowadzić.

Nie używać `Math.random()`.

## 13. Visual batching / instancing

Repo posiada istniejący reusable mechanism `src/render/instancedProps.ts::buildInstancedProps()` oparty o `THREE.InstancedMesh`.

To jest pierwszy mechanizm do rozważenia i reuse przed tworzeniem nowego rozwiązania.

Nie wymuszać jednak użycia dokładnie tego helpera, jeśli aktualne crop requirements — szczególnie dynamiczne stage transitions, one-interactable-per-placement i runtime planting/harvest — wymagałyby skomplikowania jego kontraktu.

Dopuszczalny jest mały crop-specific presentation wrapper, jeśli:

- reuse'uje istniejące instancing/batching primitives;
- nie tworzy równoległego globalnego render managera;
- zachowuje bounded draw calls;
- zachowuje deterministic layouts;
- nie tworzy ciężkiego GLB clone na każdą biological plant.

Preferowany kierunek dla loaded chunk:

```text
CropPlacements
→ resolve stage
→ deterministic visual transforms
→ group/batch by species/stage/template
→ InstancedMesh representation
```

## 14. Runtime planting / harvest visuals

Nowo zasadzony placement musi pojawić się natychmiast bez tworzenia permanentnego per-plant runtime systemu.

Jeżeli pełna przebudowa chunk crop batcha przy każdej pojedynczej zmianie okaże się niepotrzebnie kosztowna, dopuszczalny jest lekki temporary/standalone representation path, podobny koncepcyjnie do istniejących dynamicznych world mutations.

Po naturalnym rebuild/reload placement powinien wejść do normalnego batched path.

Harvest usuwa logicznie jeden `CropPlacement` i całą jego presentation representation.

## 15. Interaction

Istniejący crop `Interactable` pozostaje jeden na `CropPlacement`, nie jeden na visual plant.

Targeting / `[E] Zbierz` wskazuje cały logical placement.

Harvest:

```text
1 CropPlacement
→ 1 shared harvest outcome
→ remove all rendered instances belonging to placement
```

Nie tworzyć per-plant interaction ani colliderów.

## 16. Placement footprint

Obecne `CROP_PLANT_FOOTPRINT_RADIUS` i `CROP_PLANT_SEPARATION` są wspólne dla species.

Nie zmieniać ich automatycznie na podstawie `logicalPlantsPerSowingUnit`.

031 nie implementuje species-specific field capacity ani pełnego spacing/agronomy modelu.

Visual layout placementu powinien mieścić się w jego logicznym footprint albo footprint musi zostać jawnie skorygowany jako wspólna decyzja. Nie rozsypywać visual plants poza aktualną planting/interaction semantics bez zmiany odpowiedniego kontraktu.

## 17. Persistence and migration

Nie dodawać plant-count pól do `SavePlantedCrop` tylko dlatego, że zmienia się species semantics.

Aktualny record nadal może przechowywać:

```text
id
x
z
cropId
stageStartedAt
```

Logical planted population jest derivable z `cropId` i aktualnego `CropDefinition`.

Zmienia się jednak semantyka istniejących persisted placements:

```text
legacy: one placement ≈ one plant
new: one planted placement = one species-defined sowing unit/population
```

Przy implementacji sprawdzić aktualny `CURRENT_SAVE_VERSION`. Zgodnie z persistence contract zmiana persisted semantics wymaga jawnej decyzji migracyjnej i — jeśli kwalifikuje się jako schema/semantic migration według aktualnego `saveData.ts` — bumpu wersji, migration entry, validation i tests.

Nie hardcodować w planie numeru save version.

Legacy planted crop powinien zostać deterministycznie zachowany jako jeden logical placement tego samego `cropId`; nie mnożyć records podczas migracji.

Nie persistować visual instances ani resolved visual count.

## 18. Performance guardrails

Hard requirements:

- 1 planted seed unit → 1 simulation `CropPlacement`;
- zero per-biological-plant lifecycle state;
- zero per-biological-plant persistence;
- zero per-biological-plant interactables/colliders;
- zero per-frame crop growth tick;
- stage nadal resolved lazy;
- rendered plant count bounded niezależnie od logical population;
- crop visuals batchowane/instancjonowane, gdy representation count tego wymaga;
- deterministic visual layouts;
- chunk unload usuwa Three.js representation, nie persistent placement;
- zero permanentnych crop meshes dla unloaded chunks;
- aggregate/off-screen agriculture nie materializuje detailed plants ani CropPlacements;
- brak nowego Workera dla crop lifecycle;
- brak nowego globalnego Agriculture/Crop God Object;
- koszt symulacji zależy przede wszystkim od liczby `CropPlacement`s, nie biological plant count.

## 19. Relevant files / integration points

Zweryfikowane główne miejsca:

- `src/world/cropLifecycle.ts`
  - `CropId`
  - `CropDefinition`
  - `CROP_DEFS`
  - `CropPlacement`
  - `resolveCropStage()`
  - `resolveCropHarvest()`

- `src/world/plantedCrops.ts`
  - `CROP_SEED_ITEM`
  - placement footprint/separation
  - planted crop parsing

- `src/world/cropVisuals.ts`
  - aktualny standalone crop-stage visual path

- `src/terrain/chunkCrops.ts`
  - natural `CropPlacement` generation

- `src/terrain/chunkManager.ts`
  - crop attach
  - planted/wild merge
  - nearby crop queries
  - `plantCrop()`
  - `harvestCrop()`
  - chunk unload

- `src/render/instancedProps.ts`
  - istniejący reusable instancing mechanism

- `src/app/actions/placementActions.ts`
  - player seed consumption / planting

- `src/app/actions/gatheringActions.ts`
  - player harvest / capacity / cultivation modifiers

- `src/world/foodSources.ts`
  - shared NPC harvest and planting hooks
  - cultivation modifier seam

- `src/ai/npcProfessionWork.ts`
  - Farmer planting / harvest

- `src/persistence/saveData.ts`
  - `SavePlantedCrop`
  - save version / migration contract

- `src/app/saveState.ts`
  - persisted planted crop collection

- `docs/plans/settlements-npcs-030-non-home-settlement-food-production-v1.md`
  - detailed / aggregate agriculture ownership

Nie zakładać, że każdy wymieniony plik musi zostać zmieniony.

## 20. Species values — decyzja przed implementacją

Plan świadomie nie ustala jeszcze konkretnych wartości dla:

- `logicalPlantsPerSowingUnit` dla carrot;
- `logicalPlantsPerSowingUnit` dla potato;
- `logicalPlantsPerSowingUnit` dla cabbage;
- docelowego `yieldCount` każdego species;
- maksymalnej / docelowej liczby rendered instances per placement.

Przed finalnym ustawieniem `CROP_DEFS` ustalić je jako krótką decyzję gameplay/design.

Dla każdego species wartości powinny uwzględniać osobno:

1. sensowną relację sowing unit → logical plants;
2. charakter gatunku i liczbę zbieranych food items na population;
3. balans produkcji żywności;
4. visual readability;
5. rendering budget.

Nie wymaga to per-plant runtime simulation.

## 21. Tests

### CropDefinition

- każde `CropId` ma kompletny shared definition;
- logical plant count jest dodatni;
- base yield jest dodatni;
- species timings nadal rozwiązują się przez ten sam lifecycle;
- `CropId ↔ CROP_SEED_ITEM` mapping jest kompletny.

### Sowing semantics

- player seed ×1 tworzy dokładnie jeden `CropPlacement`;
- NPC seed ×1 tworzy dokładnie jeden `CropPlacement`;
- planted placement reprezentuje species-defined logical population;
- brak per-plant simulation records.

### Harvest

- mature placement zwraca species base yield;
- young nie daje harvestu;
- spoiled semantics pozostają bez zmian;
- player i NPC odczytują ten sam base yield;
- existing cultivation modifier skaluje base yield dopiero po shared harvest resolverze.

### Natural crops

- natural placement nadal korzysta ze wspólnego species lifecycle/harvest;
- planted sowing density nie mnoży proceduralnych placements;
- natural visual/population representation pozostaje deterministic i bounded.

### Rendering

- jeden placement generuje deterministic bounded visual layout;
- layout jest stabilny po chunk reload;
- stage transition nie losuje nowego spatial layoutu;
- rendered count nie musi odpowiadać logical count;
- wiele visual plants nie generuje draw calla per biological plant;
- harvest usuwa całą representation jednego placementu.

### Persistence

- existing planted crop pozostaje jednym logical placementem tego samego species;
- migration, jeśli wymagana, nie mnoży records;
- save/load zachowuje identity i lifecycle anchor;
- logical population jest derivable z species definition;
- visual transforms/count nie trafiają do save.

### Compatibility with 030

Po implementacji obu planów:

- detailed Farmer harvest i aggregate catch-up korzystają z tego samego species base yield;
- one off-screen seed consumed zachowuje tę samą sowing-unit semantics;
- aggregate path nie materializuje visual/logical plant entities;
- detailed/aggregate ownership z 030 pozostaje bez zmian.

## 22. Technical verification

Uruchomić:

- `pnpm lint:fix`
- `pnpm typecheck`
- relevant focused tests
- `pnpm test`
- `pnpm build`

Dodać lub rozszerzyć testy przede wszystkim wokół:

- `src/world/cropLifecycle.test.ts`;
- planted crop semantics;
- chunk crop rendering/harvest integration;
- player planting/harvest;
- `src/ai/npcProfessionWork.test.ts`;
- persistence, jeśli plan zmieni persisted semantics/version.

Dla nowych ważnych publicznych/architektonicznych resolverów dodać JSDoc z odpowiednim `@domain world`, jeżeli poprawi to preflight/code-map discovery.

## 23. Browser verification — User

AI nie wykonuje browser verification.

User sprawdza manualnie:

1. zasadzić po jednej jednostce każdego istniejącego crop species;
2. potwierdzić, że jedna sztuka seed itemu znika na planting;
3. potwierdzić, że jeden planting wizualnie przedstawia odpowiednią grupę roślin;
4. upewnić się, że grupa zachowuje się jako jeden interactable/placement;
5. przepuścić world time i sprawdzić species-specific growth;
6. zebrać crop i potwierdzić species-specific yield;
7. sprawdzić player garden z istniejącym care/hydration modifierem;
8. obserwować Farmera i potwierdzić ten sam planting/yield model;
9. odejść i wrócić po chunk reload — layout nie powinien się losowo zmienić;
10. save/load nie powinien mnożyć placements ani visual plants;
11. sprawdzić natural crop i upewnić się, że nie został przypadkowo zamieniony w pełne planted field;
12. przy większej liczbie crop placements sprawdzić brak wzrostu draw calls odpowiadającego każdej biologicznej roślinie.

## 24. Non-goals

Nie implementować:

- seed recovery / replanting — osobny plan 032;
- automatycznego seed reserve;
- hydration zmian;
- nowych weather modifiers;
- seasons;
- crop suitability;
- perennial lifecycle;
- regrowth;
- self-seeding;
- crop genetics;
- crop quality;
- disease / weeds expansion;
- soil fertility;
- crop rotation;
- species-specific field capacity;
- pełnego field tile/grid systemu;
- nowych crop species;
- generalnego off-screen agriculture redesign;
- osobnego Farmer yield modelu;
- osobnego NPC crop state;
- indywidualnych biological plant entities;
- per-plant interaction;
- unifikacji TreeLifecycle i CropLifecycle.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
