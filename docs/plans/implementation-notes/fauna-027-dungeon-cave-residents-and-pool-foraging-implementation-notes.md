# Implementation notes: fauna-027 dungeon cave residents and pool foraging

**Reviewed:** 2026-09-13  
**Plan:** `docs/plans/fauna-027-dungeon-cave-residents-and-pool-foraging.md`  
**Baseline:** `main` at `7aec70cdd90e9c49dda5312eeb7afd2aab46ffa2`

## Aktualny stan zależności

- `world-terrain-024` ma już implementację dungeon archetype na `main`; status planu pozostaje `verification needed`, bo otwarte jest wyłącznie gameplay verification. Używać `Caves.archetypeOf()` i `Caves.dungeonChambersOf()` / `DungeonChamber.nodeId`, nie rekonstruować semantyki dungeon z topology array.
- `world-terrain-025` jest zaimplementowany. `Caves.undergroundPoolOf(caveId)` zwraca trwały semantic `CaveUndergroundPool` z `chamberNodeId`, `waterSource`, `footprint` i zwalidowanym suchym `shorelineApproach`. Pool celowo **nie** wchodzi do globalnego surface-water/swimming pipeline.
- `fauna-019`, `fauna-022`, `fauna-023` są już obecne w kodzie i należy rozszerzać ich aktualne kontrakty, nie wersje opisane w planach.

## Kluczowe istniejące seams

- `src/app/worldBundle.ts::buildFauna()` — właściwy composition root. Dzisiaj przekazuje `undefined` jako `persistentOccupantDecls` i `caveHabitats`; tutaj należy złożyć deterministic dungeon declarations/bindings z gotowego `Caves`.
- `src/fauna/persistentOccupants.ts` — authority stable slotów/tombstones. `PersistentOccupantDecl` ma dziś tylko `habitatId + occupantKey + kind`; nie wymaga nowego save schema dla dungeonów.
- `src/fauna/createFauna.ts` — restore/spawn persistent occupants przez zwykły `spawnAgent()`; `caveHabitatBindings` jest `Map<habitatId, AnimalHabitatBinding>`.
- `src/fauna/animalCaveHabitat.ts` — jedyny fauna-facing adapter do cave spatial contractu. Obecny binding niesie tylko `caveId`.
- `src/world/caves/caveHabitat.ts` — ma już BFS (`shortestNodePath`), flattening centerline (`buildRoutePoints`) i floor snapping. `resolveCaveTraversal()` wybiera jednak zawsze pierwszą standable chamber.
- `src/fauna/animalForaging.ts` — authority selection/validation/relief. `AnimalAgent` powinien nadal tylko przechowywać target, prowadzić movement/timer i wołać ten moduł.

## Resident declarations i identity

Najlepiej dodać mały pure fauna helper, np. `src/fauna/dungeonResidents.ts`, który dostaje wyłącznie representation-neutral dane dungeonów i zwraca declarations + cave bindings. Nie wkładać population policy do `createCaves.ts`.

Enumeracja raz przy budowie świata:

```text
caves.definitions()
→ archetypeOf(caveId) === 'dungeon'
→ dungeonChambersOf(caveId)
→ deterministic resident plan
→ PersistentOccupantDecl[] + AnimalHabitatBinding[]
```

Decyzje `reserved` / 75% / species powinny być hashowane per `(caveId, chamberNodeId, purpose)`, a nie konsumować jeden mutable RNG stream. To usuwa call-order/iteration-order sensitivity. Nie używać `Math.random()` ani nowych saltów z world-terrain `CAVE_RNG_SALT`; fauna powinna mieć własny mały deterministic namespace.

`DungeonChamber.class` jest gotowym filtrem semantycznym. `entrance-adjacent` nie powinien dostać initial home. Guaranteed fallback wybierać dopiero spośród legalnych, nierozreserved chambers.

### Chamber-scoped habitat ID

Obecny `createFauna()` mapuje tylko jeden `AnimalHabitatBinding` na `habitatId`. Jeżeli każdy resident użyje `habitatId = caveId`, kilka chambers nadpisze sobie binding i wszyscy trafią do jednego home.

Nie rozszerzać z tego powodu persistence schema. Użyć stabilnego habitat ID per chamber, np.:

```text
habitatId   = <caveId>:dungeon-chamber:<chamberNodeId>
occupantKey = resident
```

To zachowuje obecny registry/map contract i daje stable `persistentAnimalId()` zawierający cave + chamber + semantic slot. Maks. jeden initial resident/chamber dobrze pasuje do tego modelu.

## Cave home i routing — wymagane rozszerzenie istniejącego contractu

`Caves.resolveHabitat(caveId, entityHeight)` / `resolveCaveTraversal()` nie potrafią dziś wskazać konkretnej chamber: zawsze wybierają pierwszą standable chamber. Samo wygenerowanie różnych declarations nie wystarczy.

Minimalnie rozszerzyć istniejący cave contract o stable `homeNodeId` (optional argument albo osobny narrow resolver) i threadować go przez `AnimalHabitatBinding.source`. Resolver ma używać tych samych `heightfieldGroundColumn` + BFS/centerline helpers; nie dodawać navmesha/pathfindera.

Nie spawnnować bezwarunkowo na `DungeonChamber.position`. Pool footprint jest przesunięty wokół pozycji swojej chamber i node center może wypaść w mokrej części. Dla pool chamber preferować istniejący, zwalidowany suchy `pool.shorelineApproach` albo inny deterministyczny dry point zwalidowany przez ten sam heightfield/clearance contract. Y zawsze z retained cave spatial authority.

### Trasa do pool

Obecny `CaveTraversalDescriptor` zna tylko `home ↔ entrance`. `AnimalAgent.pursueSourceTarget()` idzie natomiast prostą przez `steerToward(target)`; to nie jest wystarczające dla pool w innej, zakręconej/branchowej chamber.

Wyciągnąć z `caveHabitat.ts` mały reusable resolver trasy między dwoma topology node ids, oparty na istniejących `shortestNodePath` + `buildRoutePoints` + `snapRouteFloor`. `resolveAnimalCaveHabitat()` może raz zcache'ować home→pool route na runtime context. Do przejścia użyć istniejącego `advanceCaveRoute()` i osobnego monotonic cursoru source-route; nie budować drugiego systemu nawigacji.

Pool source oferować tylko jako cave-local source, gdy agent faktycznie jest w swoim cave interior. Nie globalnie skanować pools z `AnimalAgent.update()`.

## Pool jako water/food source

`CaveUndergroundPool.shorelineApproach` jest już właściwym V1 targetem dla picia i fish feeding. Nie próbować wykrywać pool przez `sampleLocalWater`, `waterLevel` ani surface shoreline probes — underground pool celowo nie jest częścią tych systemów.

Najmniejszy reusable seam:

- fauna-owned plain environmental source na `AnimalCaveContext` (stable `id`, approach `x/z`, pool chamber id, `foodKind: 'fish'`), zbudowany przez adapter z `Caves.undergroundPoolOf()`;
- `ForagingContext` dostaje ten cave-local source tylko podczas aktywnego needs lookup;
- `WaterSourceRef` może dostać mały infinite/environmental arm z id;
- `SourceTargetKind` może dostać jeden `environmentalFood` arm z `ItemKind`, bez item entity/provider stocku.

Nie stosować do cave pool globalnego `ctx.roamRadius`: to płaski home-distance guard dla obecnego surface/local foragingu i odrzuci legalny pool w dalszej dungeon chamber. Dla tego source authority powinno być: ten sam cave + poprawna cached route + legalny approach point.

### Obecna predator/diet pułapka

`findFoodTarget()` ma dziś twardy dispatch:

```text
predator → carcass only
other    → diet-aware target
```

Samo dodanie `fish` do environmental candidates nie sprawi więc, że bear/wolf zacznie go jeść. Najmniejsza zmiana zachowująca stare priorytety:

```text
predator: carcass → environmental diet-compatible fallback
other:    existing diet target → environmental diet-compatible fallback
```

Compatibility i relief brać z istniejących `dietAcceptsItem()` / `dietItemReliefScale()`. `applySourceRelief()` dla infinite environmental food wywołuje `consumeFood()` i **niczego nie usuwa**; water arm analogicznie tylko `drinkWater()`.

Aktualnie `BEAR_DIET` zawiera `fish`, ale `MEAT_DIET` używany przez wolf nie. Nie dopisywać fish do `MEAT_DIET` tylko po to, żeby dungeon działał — zmieniłoby to również bait/dropped-food semantics globalnie. V1 może więc naturalnie mieć fish-compatible bear i fish-incompatible wolf.

## Variant

`AnimalVariant` nie jest częścią `AnimalSaveState`, a cave persistent spawn musi znać wariant już w konstruktorze, zanim `hydrate()` odtworzy stan. Ponieważ exceptional roll jest w planie opcjonalny, najbezpieczniej zostawić residents jako `normal` w V1.

Jeżeli roll zostanie mimo to wdrożony, musi być deterministyczny z resident identity i przejść do `spawnAgent(..., variant)` przez deterministic declaration/runtime metadata. Obecny production assignment `alpha` jest wolf-den-specific; nie przypisywać `alpha` bearowi ani nie tworzyć dungeon-only stat path.

## Persistence / lifecycle

Nie dodawać save migration dla dungeon residents. Existing `PersistentOccupantSnapshot` już przechowuje `AnimalSaveState` i permanent slot tombstone; śmierć/decay/removal powinny przejść istniejącym `readyToRemove() → markRemoved() → dispose` flow.

Ważny pierwszy-consumer edge case: persistent occupant restore/spawn w `createFauna.ts` jest dziś poza `isSystemEnabled('animals')` guardem. Po podaniu realnych dungeon declarations `?debugDisableSystems=animals` zacząłby mimo to spawnnować residents. Włączyć persistent construction do tego samego animals-system guardu.

## Performance / aktualne ograniczenie

Nie ma dziś osobnego hibernation/streaming tieru dla persistent occupants: live `AnimalAgent` należy do globalnego `Fauna` i jest aktualizowany normalnym loopem. Nie wiązać lifecycle z cave presentation streamingiem — semantic cave/pool istnieją niezależnie od mesha.

Jeżeli literalne wymaganie planu o braku permanentnej detailed simulation dalekich residents ma wejść już w fauna-027, potrzebny jest **generic fauna off-screen/update-frequency seam**, nie dungeon-specific unload/despawn. Taki seam obecnie nie istnieje i jest realnym rozszerzeniem scope. Nie maskować tego przez niszczenie/odtwarzanie agentów przy streamowaniu cave. Przy obecnej rzadkości dungeonów można zachować istniejący lifecycle tylko wtedy, gdy to wymaganie zostanie potraktowane jako future-scaling guardrail, a nie jako kryterium V1.

## Najwyższej wartości testy

- pure dungeon resident planner: reserved chamber, 75%, guaranteed fallback, weighted species, stable IDs oraz identyczny wynik przy zmianie input iteration order;
- targeted cave habitat: resident A/B w różnych `homeNodeId` faktycznie dostaje różne homes/routes; pool chamber nie spawnuje w mokrym center;
- cave route home→pool dla branched dungeon używa topology graph, nie straight-line steering;
- `animalForaging.test.ts`: environmental water relief; bear wybiera fish fallback i źródło pozostaje; wolf ignoruje fish przy obecnym diet; surface/carcass/feed/grass regressions;
- persistent occupant integration: reload nie duplikuje, tombstoned resident nie wraca;
- debug animals-disabled: dungeon residents nie są tworzeni.

## Sugerowana kolejność

1. Targeted cave-home + generic node-to-node cave route, z testami.
2. Pure deterministic dungeon resident planner i chamber-scoped habitat bindings.
3. Wiring w `worldBundle.ts` → istniejące persistent occupant construction.
4. Cave-local pool semantic adapter + cached home→pool route.
5. Minimalne environmental arms w `animalForaging.ts` i source-route pursuit w `AnimalAgent`.
6. Persistence/regression tests i current-state docs zgodnie z faktyczną implementacją.

## Model recommendation

**Model:** Opus, Sonnet

Największe ryzyko nie leży w population rollu, tylko w poprawnym złożeniu chamber-specific cave routing, persistent identity i istniejącego foraging lifecycle bez drugiego systemu nawigacji/AI. Opus jest najlepszym wyborem; po tym reconie Sonnet jest rozsądnym tańszym fallbackiem.