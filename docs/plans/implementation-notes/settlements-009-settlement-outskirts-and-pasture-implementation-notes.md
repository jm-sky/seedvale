# Implementation Notes: Settlement outskirts and pasture

**Plan:** `settlements-009-settlement-outskirts-and-pasture.md`

## Najważniejsze ustalenia z aktualnego codebase

### 1. `VillagePlan` jest właściwym ownerem, ale pasture nie powinno udawać obecnego `livestock` zone/plot

`src/settlement/villagePlan.ts` ma dziś `zones`, `plots`, `buildings`, `landmarks`, `paths`, `entrances`; wszystkie istniejące zone/plot placementy są projektowane wewnątrz `VillageBoundary`. Obecny `zone-livestock` + `plot-livestock-0` jest częścią core layoutu i nie jest satellite/outskirts area.

Dodać mały plain-data contract do `VillagePlan`, najlepiej osobny opcjonalny element typu `pasture` / `outskirts` z co najmniej:

- stable id,
- center + radius,
- well anchor,
- trough anchor,
- fence segments,
- connection/path anchor.

Nie rozszerzać `VillageBoundary` tylko po to, aby objąć pasture i nie przenosić istniejącego `zone-livestock` poza boundary. `SettlementDef` już zachowuje cały `plan`, więc runtime może czytać pasture bez drugiej projekcji stanu (`settlementGenerator.ts:settlementDefFromPlan`).

### 2. Placement wymaga osobnego outer-ring scorer, ale ma reuse istniejących geometrycznych gate'ów

`villagePlanner.ts:pickPlot()/scorePlotCandidate()` zakładają layout wewnątrz boundary; `outsideBoundaryPenalty` aktywnie karze pozycje poza nim, a fallback potrafi mimo odrzuceń zwrócić bezwarunkową pozycję. Nie wciskać pasture przez `pickPlot()` ze sztucznymi parametrami.

Zrobić bounded deterministic candidate search dla satellite area, reuse'ując te same zasady/utility:

- `localSlope()` / `heightSpread()` albo mały wspólny helper wyciągnięty bez zmiany zachowania core planner;
- `footprintOverlapsRiver(...)` + `PLOT_RIVER_MARGIN`-equivalent clearance;
- `pathIsDry(...)` i `SETTLEMENT_WATER_MARGIN`;
- kolizję footprintu z istniejącymi `plan.plots` oraz planned path corridors;
- seeded RNG / stable tie-break, nigdy `Math.random()`.

Preferowany ring powinien zaczynać się **poza `boundary.radius`**, ale pozostać blisko osady. Footprint pasture, well, trough i fence muszą być walidowane razem przed zaakceptowaniem kandydata; nie wybierać center, a propsów „upychać” później.

### 3. Plan mylnie zakłada pełny defensywny perimeter

`src/settlement/settlementPalisade.ts:plantEntrancePalisade()` nie buduje muru/ringu. To tylko krótkie skrzydła palisady po obu stronach jednego inland entrance; coastal settlement może nie dostać palisady w ogóle. Radius propsów bierze `plan.boundary.radius`, ale sam boundary nie jest murem.

Dlatego V1 nie może testować „outside wall radius” jako istniejącej prawdy o defensywnym perimeterze. Przy obecnej architekturze poprawny kontrakt to:

- pasture leży poza `VillageBoundary` / core built footprint;
- nie koliduje z placementami skrzydeł wejściowej palisady ani gate/road corridor;
- pozostaje semantycznie `outsideCore: true` / satellite area.

Nie dodawać w tym planie nowego pełnego defensive-perimeter systemu tylko po to, aby spełnić literalny opis planu. Jeśli później pojawi się canonical perimeter, pasture placement można podpiąć pod niego.

### 4. Lokalna ścieżka powinna wejść do `VillagePlan.paths`, ale nie przez obecny center→plot pipeline

`planLocalPathsAndEntrances()` buduje dziś core paths po istniejących plots/landmarks. Pasture connection należy dopisać deterministycznie po zaakceptowaniu pasture, używając tego samego `VillagePathPlan` shape (`points`, `halfWidth`, `kind`) i `pathIsDry()`.

Start connection wybierać z najbliższego sensownego existing local path/entrance, nie zawsze z plaza center. Nie tworzyć nowego road type ani osobnego runtime path graphu.

### 5. Well: reuse asset/runtime, ale planować jako pasture anchor zamiast zwykłego core plotu

`settlementStructures.ts:createWell()` jest tylko visualem; runtime studni osady korzysta z planned `well` landmarks/places i kolejki per studnia. Household wells są już generowane jako dodatkowe stable planned wells (`householdWellPlotId` / `householdWellLandmarkId`).

Pasture well powinno dostać stable id/anchor w planie i wejść w ten sam materialization/Place/interaction flow co inne settlement wells. Nie tworzyć `PastureWell`.

Nie dodawać pasture well jako kolejnego zwykłego `plot-infra-well`, bo ten id jest obecnie jednoznacznie plaza well i `buildingsAndLandmarksFromPlots()` ma specjalny branch dla dokładnie tego id.

### 6. Trough: obecny water contract jest silniej household-coupled niż sugeruje plan

`animalForaging.ts:findHouseholdTroughTarget()`:

- wymaga `ctx.household.water`,
- zwraca target dokładnie w `ctx.home.x/z`,
- zużycie jest semantycznie `waterSource: { kind: 'household' }`.

Czyli samo postawienie drugiego visuala trough na pasture **nie sprawi**, że livestock będzie z niego piło. Nie podmieniać `home` zwierzęcia na pasture i nie przenosić ownership z household.

Najmniejszy sensowny extension to uogólnić istniejący stored-water target/provider tak, aby household-owned livestock mogło dostać alternatywny settlement pasture trough position, nadal konsumując istniejący `Household.water` (lub przez mały owner/provider adapter wskazujący tę samą rezerwę). Zachować atomic consumption w obecnym `applySourceRelief`/water-source pipeline; nie tworzyć `SettlementTrough` inventory ani drugiego FSM.

Visual reuse: `settlementStructures.ts:createTroughVisual()/createTrough()`.

### 7. Shepherd integration należy zrobić w `npcProfessionWork.ts`, nie w schedule

Schedule tylko daje shepherdowi zwykły blok `work`. Faktyczna decyzja pracy jest dziś w `planShepherdWork()`:

1. shear ready sheep,
2. deposit wool,
3. podążaj do separated owned sheep względem `ctx.home`,
4. inaczej idź do centroidu owned flock / home.

To jest właściwy seam do dodania pasture destination. Dodać do `NpcWorkContext` read-only pasture anchor (lub settlement-plan resolver przy budowaniu contextu), nie shepherd-specific movement system.

Zachować priorytety shearing/deposit/separated-animal. Pasture powinno być fallbackowym daytime work destination, gdy nie ma pilniejszej pracy. `ctx.home` nadal zostaje household home dla powrotu/deposit/ownership.

### 8. Sam shepherd destination nie przemieści stada na pasture

Owned sheep mają własny `AnimalAgent` movement/roaming. Obecny `planShepherdWork()` może chodzić za zwierzęciem (`followAnimalId`), ale nie ma mechanizmu „prowadź flock do punktu”. `shepherdFlock.ts` jest tylko bounded lookup/selekcją; nie steruje sheep.

Jeżeli V1 ma realnie powodować obecność stada na pasture, reuse'ować istniejący fauna commitment/roaming seam przez **tymczasowy need/home/roam anchor override dla household livestock**, aktywny tylko w kontekście shepherd work/pasture. Nie teleportować i nie dodawać shepherd-specific steering. Po zakończeniu pracy anchor wraca do household baseline.

Jeżeli taki shared temporary anchor wymaga większego refactoru niż scope M, lepiej dostarczyć najpierw poprawny shepherd work destination + pasture water/forage anchor niż udawać herding samym NPC destination.

### 9. Livestock count do sizingu musi pochodzić z deterministic generation input, nie runtime listy

`settlement/livestock.ts` generuje household-owned livestock deterministycznie, w tym osobny shepherd flock (`shepherdFlockSize`). `VillagePlan` powstaje wcześniej w generation pipeline niż runtime `AnimalAgent` instances.

Nie uzależniać static pasture layout od kolejności streamingu/spawnu fauna. Jeśli rozmiar ma uwzględniać livestock, wyliczyć mały deterministic expected/declared livestock count z tych samych generation inputs/saltów albo ograniczyć V1 do `VillageSize` i zostawić runtime count jako przyszły refinement. Ten sam seed + settlement cell musi dawać identyczny plan niezależnie od stream order.

### 10. Fencing: plan-data first, rendering przez istniejące instanced-prop conventions

Settlement entrance palisade (`settlementPalisade.ts`) pokazuje właściwy wzorzec dla taniego fence rendering: stable planned numerics → `PropPlacement[]` → `buildInstancedProps`, z terenem próbkowanym przy materializacji.

Pasture fence powinien mieć w `VillagePlan` jawne segment endpoints/yaw + gap, a renderer tylko je materializować. Nie używać player-built `world/palisade.ts` state/persistence — to inny ownership i gameplay.

Fence jest markerem wizualnym, więc nie dodawać colliderów ani containment AI w V1.

## Sugerowana kolejność implementacji

1. Dodać minimalny pasture/outskirts plain-data contract do `VillagePlan`.
2. Dodać deterministic satellite placement w `villagePlanner.ts` po core plots, przed finalnym zwróceniem planu; zaakceptować center + well + trough + fence + connection jako jeden layout.
3. Dopisać pasture path do `VillagePlan.paths`.
4. Materializować well/trough/fence w istniejącym settlement streaming/props flow.
5. Uogólnić stored-water target tak, aby pasture trough używał tej samej household water reserve.
6. Wstrzyknąć pasture anchor do `NpcWorkContext` i rozszerzyć `planShepherdWork()`.
7. Dopiero wtedy dodać shared temporary livestock anchor/commitment, jeśli potrzebny do faktycznego dziennego pobytu stada.

## Testy, które mają największą wartość

- determinism: seed/cell → identyczny full pasture layout;
- `SM`/`OUTPOST` bez pasture, `MD/LG/XL` z pasture;
- cały pasture footprint poza `VillageBoundary`, bez river overlap i bez kolizji z core plots/path corridors;
- candidate failure ma bounded deterministic fallback albo jawny brak pasture — nie bezwarunkowy wet/overlap fallback;
- pasture well/trough/fence stable ids/positions;
- shepherd priorytety shearing/deposit pozostają przed pasture fallback;
- pasture trough target używa pasture coordinates, ale konsumuje tę samą authoritative household water reserve;
- household ownership i livestock stable ids nie zmieniają się;
- stream order nie wpływa na plan ani sizing.

## Powiązane systemy / plany

- `fauna-004-sheep-wool-and-shepherd` — istniejący shepherd/flock contract; nie tworzyć Pasture entity ani custom movement.
- `items-player-020` — player trough już uogólnił `WaterSourceRef`/provider seam; warto reuse'ować ten kierunek zamiast dokładać nowy typ source FSM.
- `settlements-013-horse-training-progression-vendor-and-paddock` — przyszły fenced paddock jest innym semantics niż otwarte pasture, ale powinien móc reuse'ować satellite-area/fence footprint helpers z tego planu. Nie implementować paddock requirements tutaj.

## Pułapki

- Nie traktować `VillageBoundary.radius` jako istniejącego muru; boundary jest footprintem planera, a settlement palisade to tylko entrance wings.
- Nie używać istniejącego `plot-livestock-0` jako pasture — zmieniłoby semantykę core layoutu.
- Nie podmieniać `AnimalAgent.home`/household ownership na pasture tylko po to, aby trough/roaming działały.
- Nie tworzyć drugiej rezerwy wody.
- Nie dodawać per-frame pasture queries ani globalnego managera.
- Nie dopuszczać fallbacku, który omija river/spacing constraints; dla satellite area lepszy jawny brak placementu niż błędna geometria.

> **Zrób git commit i push do main, rebase jeżeli trzeba**