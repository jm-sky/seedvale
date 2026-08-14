# Village Generation Overhaul

**Status:** `done`
**Reviewed:** 2026-08-11 against current `main` repository state
**Priority:** 🔴 high
**Effort:** XL

## Implementation progress (2026-08-11)

Completed plan steps 1–16 (technically verified: `tsc` / lint / build / unit tests).

- Steps 1–9: plan types → site/footprint → identity → families → zones/plots → buildings/landmarks → local paths/entrances
- **Step 10:** `layoutClearingsFromPlan` — terrain clearings from plan plots/center
- **Steps 11–12:** `buildSettlementProps(..., plan)` landmarks; `createSettlement` passes `def.plan`
- **Step 13:** planned dock landmark + `minorLocationsFor` prefers plan dock; `attachPlannedDock` in generator
- **Steps 14–15:** shared `settlementPlanCache`; `RoadNetwork` entrances via `entranceToward`; local corridors from `pathPlansToCorridorData`
- **Step 16:** `summarizeVillagePlan` + lil-gui “Log home VillagePlan”

**Technically verified.** Browser/manual layout verification still needed (village look, roads from entrances, dock, props alignment).

Next: manual browser pass against §16 acceptance criteria.

## Goal

Przebudować generowanie osad tak, aby wioska była najpierw **deterministycznie zaplanowaną strukturą przestrzenną**, a dopiero potem instancjonowanym zestawem budynków, NPC, livestock i propsów.

```text
world seed + settlement cell
 + terrain / environment / resources
 + village identity/context
          ↓
     VillagePlan
          ↓
 terrain modifiers + local paths
          ↓
 buildings + landmarks
          ↓
 settlement runtime
          ↓
 RoadNetwork (global roads via entrances)
```

`VillagePlan` jest jednym źródłem prawdy dla **lokalnego layoutu** jednej osady. Nie tworzyć równoległych generatorów obok `settlementGenerator.ts`, `villageClearing.ts`, `props.ts`, `places.ts` i `roadNetwork.ts`.

W v1 **nie implementować** pełnego `traits/history` frameworku z pierwotnego szkicu 047. Identity ma reprezentować istniejący kontekst generacji; traits/history mogą być późniejszym rozszerzeniem tego samego modelu.

---

## 1. Current implementation / repository context

### `src/settlement/settlementGenerator.ts`

`generateSettlementDef()` jest obecnie głównym wejściem generacji osady. Aktualny pipeline:

```text
cell
→ cellSeed()
→ cell center / home center
→ resourcesNear() + resourceAttractionAt()
→ findSettlementSite()
→ classifySettlementTerrain()
→ dominantResourceNear()
→ OUTPOST / rollVillageSize()
→ generateFamilies()
→ layoutClearings()
→ SettlementDef
```

`SettlementDef` zawiera aktualnie `id`, `gx/gz`, `x/z/y`, `size`, `families`, `clearings`, `isHome`, `terrain`, `name`, `nameCulture`, `dominantResource`, `foodSourceType`.

Zachować:

- `SETTLEMENT_GRID_STEP = 280`;
- jitter ±30% pół-kroku;
- home = `(0,0)`;
- `cellSeed()` jako settlement seed;
- zasoby generowane z **world seed**, nie `seedForCell`;
- `findSettlementSite()` jako site search, nie pełny village generator;
- `classifySettlementTerrain()` jako jedyne źródło klasyfikacji;
- OUTPOST jako specjalny branch;
- `generateFamilies()` jako źródło rodzin/NPC.

To jest główny seam migracji do `VillagePlan`. Nie tworzyć drugiego `generateVillage()` omijającego ten pipeline.

### `src/settlement/families.ts`

Aktualnie:

```ts
export type VillageSize = 'SM' | 'MD' | 'LG' | 'OUTPOST'
```

`generateFamilies()` obsługuje rodziny, relacje, role, osobowości, resource-driven dedicated family i OUTPOST.

Home zawsze zawiera reserved families Anna+Piotr i Kasia+Marek. Nie zmieniać tego — questy/dialogue zależą od tych imion.

047 ma rozszerzyć typ do:

```ts
'SM' | 'MD' | 'LG' | 'XL' | 'OUTPOST'
```

`OUTPOST` nadal nie jest normalnym wynikiem `rollVillageSize()`.

### `src/settlement/settlementTerrain.ts`

`classifySettlementTerrain()` zwraca:

```ts
'ocean' | 'mountain' | 'swamp' | 'desert' | 'forest'
```

Nie tworzyć nowego `VillageBiome`/`PlainsTerrain`. Ten moduł pozostaje warstwą klasyfikacji/query.

### `src/settlement/villageClearing.ts`

`layoutClearings()` już ma:

- `core` clearing;
- `houses[]`, jeden na rodzinę;
- `regional` smoothing;
- `averageHeight()`;
- `pathIsDry()` z 5 próbkami core→house;
- 4 próby wyboru house site;
- fallback house blisko core;
- deterministic seeded placement.

To jest istniejąca funkcjonalność 031/036, ale **nie może pozostać niezależnym źródłem layoutu** po wdrożeniu 047. Plan ma przejąć decyzję o pozycjach, a moduł ma pozostać helperem terrain-modifier/adapterem.

### `src/settlement/props.ts`

`SettlementLandmarks` to runtime `THREE.Vector3`/obiekty: `well`, `stockpile`, `garden`, `market`, `homes`, `trees`, opcjonalnie `dock`, `dockRoute`, `campfire`.

`VillagePlan` ma być plain-data; `props.ts` ma instancjonować plan do istniejących landmarks. Nie przenosić Three.js do planu.

`findFlatSpot()` jest jedynym obecnie zaimplementowanym elementem planu 036: retry dla stockpile/garden/campfire/second stockpile na trudnym terenie. Po 047 może pozostać jako **fallback korekty kandydata**, ale nie jako drugi planner.

### `src/settlement/places.ts`

`Place` jest istniejącym NPC-facing API dla `home`, `workplace`, `food`, `social`; `workplaceFor()` mapuje role na `SettlementLandmarks`.

Nie tworzyć `VillagePlanPlace` ani drugiego workplace/location systemu.

### `src/settlement/createSettlement.ts`

Aktualnie `createSettlement()`:

1. buduje props z `def.clearings`, `def.size`, `def.foodSourceType`;
2. tworzy `SettlementLandmarks`;
3. tworzy `Place.home`;
4. przypisuje rodzinę do domu po `familyIndex`;
5. wylicza `workplaceFor()`;
6. tworzy NPC;
7. spawnuje livestock z `landmarks.homes`;
8. dodaje dock/signposts/fire.

047 ma usunąć **layout inference**, nie runtime responsibilities.

### `src/settlement/SettlementsManager.ts`

Manager ma własny `defCache`, generuje `SettlementDef`, streamuje settlementy i przed `createSettlement()` czeka na `waitForChunks(chunksNear(...))`.

Aktualne istotne zachowania:

- home zawsze loaded;
- `EAGER_NEIGHBOR_COUNT = 2`;
- load/unload po dystansie;
- height-dependent props są budowane dopiero po wymaganych chunkach.

047 nie przenosi streamingu do `VillagePlan`. Docelowo manager i `roadNetwork.ts` mają korzystać z jednego resolvera planów zamiast utrzymywać dwa niezależne cache/generator paths.

### `src/settlement/roadNetwork.ts`

To istniejący właściciel globalnego routingu:

- `neighborsFor()`;
- `findRoute()` / A*;
- `segmentsNear()`;
- `villageSegmentsNear()`;
- dock routes/signposts;
- cache tras i `SettlementDef`.

Góry są kosztowne, ale przechodnie; woda jest hard reject.

047 **nie tworzy drugiego A***. `VillagePlan.paths` dotyczy lokalnych paths; `RoadNetwork` pozostaje właścicielem dróg między osadami i powinien docelowo konsumować `VillagePlan.entrances`.

### `src/settlement/minorLocations.ts`

Dock jest obecnie analitycznie wyliczany z `SettlementDef` i samplerów, z własnym cache. 047 ma włączyć wynik tej decyzji do planu; podczas migracji może istnieć adapter, ale nie może powstać drugi niezależny dock generator.

### `src/settlement/livestock.ts`

Livestock jest zakotwiczone o `landmarks.homes`. Zachować istniejący system; po 047 źródłem pozycji domów ma być `VillagePlan → SettlementLandmarks → spawnLivestock()`.

### `src/terrain/chunkHeightmap.ts`

Istnieją worker-safe:

- `RegionalSmoothingSegment`;
- `ClearingSegment`;
- `RoadCorridorSegment`;
- terrain corridor application.

`computeChunkTile()` stosuje regional village smoothing przed corridorami roads/clearings. Wykorzystać ten pipeline; nie tworzyć drugiego systemu modyfikacji heightmapy ani nowego worker protocol.

### `src/terrain/naturalResources.ts`

Plan 032 jest w kodzie obecny jako world-level deterministic layer:

- `resourcesNear()`;
- `dominantResourceNear()`;
- `resourceAttractionAt()`;
- `resourceWeights()`;
- `SIGNIFICANT_RICHNESS`;
- `RESOURCE_ROLE`.

047 ma konsumować te dane, nie tworzyć `VillageResourceSystem`.

### Persistence

`SaveData` nie persystuje obecnie `SettlementDef`/layoutu. Settlementy są odtwarzane deterministycznie z world seed/cell. 047 zachowuje tę własność w v1.

---

## 2. Dependencies 032 / 036 — verified state

### 032 — `2026-08-08--032--natural-resources-economy.md`

Plan ma status `verification needed`, ale wymagane mechanizmy istnieją w codebase:

- `NaturalResource` + resource grid;
- resource attraction podłączone do `findSettlementSite()`;
- `dominantResourceNear()`;
- `RESOURCE_ROLE` / `SIGNIFICANT_RICHNESS`;
- `FoodSourceType` / `foodSourceTypeFor()`;
- resource-driven OUTPOST;
- resource-aware naming.

Nie znaleziono osobnego `032...implementation-notes.md`. Dla 047 źródłem prawdy jest aktualny codebase + plan 032.

**Wniosek:** 047 może korzystać z obecnego API 032 i nie potrzebuje kolejnej implementacji 032. Status 032 pozostaje osobną decyzją i nie wolno go zmieniać w ramach 047.

### 036 — `2026-08-08--036--village-siting-difficult-terrain.md`

Status `verification needed`; zaimplementowany jest tylko punkt 1: `props.ts::findFlatSpot()`.

Nadal brak:

1. szerokiego footprint-aware site scoring;
2. tarasowania;
3. dekoracyjnego maskowania skarp.

`villageClearing.ts` ma już `pathIsDry()` i regional smoothing.

Nie znaleziono osobnego `036...implementation-notes.md`.

**Wniosek:** 047 nie wymaga ukończenia całego 036. Pozostałe elementy 036 są częścią problemu, który 047 rozwiązuje wyżej poziomowo przez `VillagePlan`, footprint scoring i planowanie terrain/paths/plots. Nie implementować osobnego 036 przed 047.

047 wchłania z 036 tylko:

- footprint terrain suitability;
- slope/dryness/path scoring;
- istniejący `findFlatSpot()` jako fallback.

Pełne tarasowanie pozostaje poza v1, chyba że okaże się konieczne do spełnienia acceptance criteria; wtedy rozszerzyć `VillagePlan`/terrain modifiers, nie tworzyć osobnego systemu 036.

---

## 3. Existing systems to extend — no parallel architecture

| System | Current owner | 047 |
|---|---|---|
| `settlementGenerator.ts` | settlement identity + generation entry point | główny seam do `VillagePlan` |
| `findSettlementSite.ts` | candidate/site search | rozszerzyć o footprint suitability |
| `settlementTerrain.ts` | terrain classification | pozostawić query layer |
| `naturalResources.ts` | world resources | użyć jako input identity/scoringu |
| `families.ts` | family/NPC generation | zachować; dodać XL/shared config |
| `villageClearing.ts` | clearing/terrain primitives | zasilać z planu |
| `props.ts` | runtime props/landmarks | instancjonować plan |
| `places.ts` | NPC runtime places | zachować |
| `livestock.ts` | animal runtime | zachować |
| `minorLocations.ts` | dock/minor location helper | migrować do planu przez adapter |
| `roadNetwork.ts` | global roads/routes | konsumować entrances; bez drugiego pathfinder |
| `SettlementsManager.ts` | streaming/runtime lifecycle | jeden plan resolver/cache |
| `chunkHeightmap.ts` | worker terrain modifiers | konsumować plan-derived segments |

Nie dodawać `VillageLayoutGenerator`, `VillagePathFinder`, `VillageResourceSystem`, `VillageTerrainGenerator` ani `VillagePlaceSystem`.

---

## 4. Architecture / data model

### 4.1 `VillageIdentity`

Minimalny v1:

```ts
export type VillageIdentity = {
  id: string
  cell: { gx: number, gz: number }
  isHome: boolean
  size: VillageSize
  terrain: SettlementTerrain
  dominantResource: NaturalResource | null
  foodSourceType: FoodSourceType
  name: string
  nameCulture: NameCulture
}
```

Nie dodawać teraz `traits`/`history`. Jeśli później będą potrzebne, rozszerzyć ten model.

### 4.2 `VillagePlan`

Plain data, bez Three.js:

```ts
export type VillagePlan = {
  identity: VillageIdentity
  site: { x: number, z: number, y: number, radius: number }
  boundary: VillageBoundary
  center: VillageCenter
  zones: VillageZone[]
  plots: VillagePlot[]
  buildings: VillageBuildingPlan[]
  landmarks: VillageLandmarkPlan[]
  paths: VillagePathPlan[]
  entrances: VillageEntrance[]
}
```

Nazwy mogą być dopasowane do repo, ale ownership ma pozostać taki sam.

### 4.3 Boundary / center

`boundary` ma zależeć od `VillageSize` i opisywać faktyczny footprint, nie stały `localRadius`.

`center` jest jednym semantycznym punktem dla public/core zone, głównych paths i rozkładu residential/work. W v1 istniejący core/site center + well jest domyślnym centrum.

### 4.4 Zones

Minimalnie:

```ts
'residential' | 'public' | 'production' | 'food' | 'livestock' | 'utility'
```

Nie każda osada ma wszystkie strefy.

Strefy wynikają z `size + terrain + dominantResource + foodSourceType + family roles`.

Przykłady:

- `field` → food zone + field area;
- `fishing` → food zone + dock/path, jeśli dock istnieje;
- `iron/gold + miner` → production/resource zone;
- livestock → livestock zone;
- każda osada → residential + public/core.

### 4.5 Plots / buildings

Minimalne plot roles:

```ts
'house' | 'work' | 'food' | 'livestock' | 'infrastructure'
```

Każdy house plot ma stabilne przypisanie `familyIndex/familyId`.

`VillageBuildingPlan` powinien zawierać stable id, semantic role, position, footprint, rotation oraz powiązania z family/zone/plot.

Role budynków pozostają domenowe:

```text
residential / production / food / livestock / utility / public
```

Nie tworzyć typów per GLB.

### 4.6 Landmarks

Planowane `well`, `stockpile`, `garden`, `market`, `campfire`, homes itd. są plain data. Plan wybiera **gdzie**, `props.ts` wybiera **jak**.

### 4.7 Local paths / entrances

`VillagePlan.paths` obejmuje tylko lokalne połączenia:

```text
entrance → center
center → residential
center → production
center → food
center → livestock
center → important local infrastructure/resource
```

`VillageEntrance` jest semanticznym punktem:

```ts
{ id, x, z, y, angle, kind: 'road' | 'path' }
```

Globalne drogi nie należą do planu. `RoadNetwork` łączy entrances.

---

## 5. Identity / size / resources

### XL

Dodać `XL` do `VillageSize` i jedną wspólną tabelę konfiguracji size obejmującą co najmniej:

- family count;
- footprint/radius;
- house spacing;
- zone/plot counts;
- infrastructure counts;
- path/road density;
- livestock capacity, jeśli potrzebne.

Nie duplikować wartości po wielu modułach.

`OUTPOST` pozostaje special case: 1 family, 1 resident, 1 house, minimal infrastructure.

### Resources

Zachować istniejący przepływ 032:

```text
resourceAttractionAt()
→ findSettlementSite()
→ dominantResourceNear()
→ VillageIdentity
→ family role / zones / plots / food source
```

Resource bonus nie może pokonać twardego rejectu wody/braku przestrzeni.

---

## 6. Site selection / terrain suitability

`src/settlement/findSettlementSite.ts::findSettlementSite()` pozostaje podstawowym site finderem.

Rozszerzyć go o **footprint-aware scoring**, zamiast tworzyć drugi finder.

Ponieważ size jest dziś wybierany po site selection, implementacja ma rozwiązać to deterministycznie:

1. wykonać provisional size roll z tego samego settlement seed/context;
2. użyć go do footprint scoringu;
3. po wyborze site użyć dokładnie tego samego size, bez drugiego niezależnego losowania.

Jeżeli agent wybierze konserwatywny footprint zamiast provisional size, musi zachować jeden deterministyczny size source i udokumentować kompromis.

Scoring powinien uwzględniać:

**positive:**

- dry land;
- low average slope;
- low height variation;
- sufficient usable footprint;
- good center;
- resource fit;
- food fit;
- możliwość local paths/entrances;
- możliwość rozmieszczenia wymaganych plots.

**negative:**

- water;
- steep terrain;
- large elevation spread;
- insufficient dry area;
- inaccessible obstacles;
- water crossing on required paths;
- settlement footprint overlap;
- brak sensownego global entrance.

Wagi powinny być centralnym config/table, nie magicznymi wartościami w kilku funkcjach.

Dla water/path checks reużywać wzorca obecnego `villageClearing.ts::pathIsDry()` zamiast tworzyć nowy water subsystem.

---

## 7. Center / layout patterns

Wprowadzić mały zestaw strategii:

```ts
'central' | 'linear' | 'clustered' | 'roadside' | 'waterfront'
```

Pattern jest strategią bazowego układu, **nie drugim generatorem**. Wybór deterministyczny z identity + terrain + seed.

Pattern wyznacza osie/regiony; finalne pozycje wybiera wspólny placement/scoring.

Używać kontrolowanej deformacji seeded RNG, nie idealnych gridów/okręgów.

---

## 8. Placement / scoring

Wspólny flow:

```text
zone
→ candidate points
→ terrain gate
→ water/path gate
→ overlap/spacing gate
→ relationship score
→ resource/work score
→ deterministic tie-break
→ selected plot
```

Kandydat oceniany m.in. przez:

- slope/height variation;
- distance to center;
- distance to local path;
- distance to related building;
- distance/resource relation;
- zone compatibility;
- collision/spacing;
- dry path to center;
- boundary inclusion.

Tie-break musi korzystać z `cellSeed()` + stable plot id. Nigdy `Math.random()`.

Relacje jawne w planie:

- family → house;
- role → workplace;
- farm → storage;
- livestock → home/farm;
- production → storage;
- well → public center;
- entrance → center;
- resource plot → dominant resource.

---

## 9. Concrete implementation steps

### 1. Plain-data plan types

Dodać preferencyjnie `src/settlement/villagePlan.ts`:

- `VillageIdentity`;
- `VillagePlan`;
- `VillageBoundary`;
- `VillageCenter`;
- `VillageZone`;
- `VillagePlot`;
- `VillageBuildingPlan`;
- `VillageLandmarkPlan`;
- `VillagePathPlan`;
- `VillageEntrance`.

Bez Three.js/runtime references.

### 2. Centralized size configuration

Rozszerzyć `families.ts` o XL i współdzielić konfigurację z plannerem/props/livestock tam, gdzie potrzebne.

Dodać testy size/XL/OUTPOST.

### 3. One authoritative generation seam

W `settlementGenerator.ts` wydzielić logiczny pipeline:

```text
resolve settlement context
→ choose site
→ resolve identity
→ create VillagePlan
```

`generateSettlementDef()` może pozostać thin compatibility wrapper, ale nie może wykonywać drugiej generacji.

### 4. Footprint-aware site search

Rozszerzyć `findSettlementSite.ts` o footprint scoring. Zachować obecne `resourceAttraction` API i twarde water gates.

Dodać deterministic tests na controlled height samplers.

### 5. Boundary + center

Po site selection utworzyć jeden boundary i jeden center zależny od size. Wszystkie późniejsze etapy używają tych danych.

### 6. Pattern + zones

Wybrać pattern, potem wygenerować minimalne zones wynikające z identity/size.

### 7. Plots

Wygenerować house plots 1:1 z families oraz wymagane work/food/livestock/infrastructure plots. Każdy plot przez wspólny scorer.

### 8. Buildings + landmarks

Utworzyć plain-data buildings/landmarks z plotów. `well`, `stockpile`, `garden`, `market`, `campfire`, homes mają jedno źródło pozycji.

### 9. Local paths + entrances

Po buildings:

1. wybrać entrance candidates;
2. entrance→center;
3. center→required zones;
4. opcjonalne house/work paths;
5. wygenerować worker-safe local corridor data.

Nie zostawiać ścieżek przez wodę; jeśli path jest niemożliwy, zmienić plot/candidate.

### 10. Terrain adapter

`villageClearing.ts` przekształcić w adapter plan→terrain modifiers. `layoutClearings()` nie może dalej wybierać house positions niezależnie.

Wykorzystać istniejące `RegionalSmoothingSegment`/`ClearingSegment`/`RoadCorridorSegment` i istniejącą kolejność w `chunkHeightmap.ts`.

### 11. Runtime props

`props.ts::buildSettlementProps()` konsumuje plan-derived positions. Usunąć sztywne house/core offsets i niezależne random placement.

`findFlatSpot()` może tylko korygować zaakceptowanego kandydata w ramach planu, nie wybierać alternatywnej architektury wioski.

### 12. Runtime settlement

`createSettlement.ts` konsumuje plan-derived landmarks. Zachować family→home, `Place`, `workplaceFor`, NPC, livestock, dock/signposts/fire.

### 13. Minor locations

`minorLocations.ts` staje się adapterem do planu. Dock nie może różnić się od docka zaplanowanego przez `VillagePlan`.

### 14. RoadNetwork

Zachować `neighborsFor()` i `findRoute()`.

Globalne route endpoints pochodzą z `VillagePlan.entrances`. Local path data pochodzi z planu. Usunąć duplicate layout/definition cache, gdy plan resolver jest gotowy.

### 15. SettlementsManager

Zastąpić lokalny `defCache` jednym plan resolver/cache. Zachować streaming, `waitForChunks()`, eager neighbors i runtime lifecycle.

### 16. Debug visualization

Debug bezpośrednio z planu: boundary, center, zones, plots, building footprints, local paths, entrances, resource influence, terrain modifiers i opcjonalnie candidate scores.

### 17. Tests

Minimum:

- same seed/cell → same identity/plan;
- stream out/in → same plan;
- families ↔ houses 1:1;
- brak overlapów;
- plots inside boundary;
- required paths dry/reachable;
- OUTPOST 1 family/house;
- XL większy footprint/layout;
- home reserved families;
- resource-driven behavior;
- deterministic entrances.

---

## 10. Integration points

### 031

Zachować family generation, 1 family = 1 house, clearing/terrain modification, reserved home NPCs i `Place` integration. 047 zastępuje layout decisions, nie domenę rodzin.

### 032

Używać istniejących `NaturalResource`, `resourcesNear`, `resourceAttractionAt`, `dominantResourceNear`, `RESOURCE_ROLE`, `SIGNIFICANT_RICHNESS`, `FoodSourceType`. Nie zmieniać resource semantics.

### 036

Wchłonąć footprint/slope/dryness scoring i istniejące `findFlatSpot()` jako fallback. Nie czekać na tarasowanie z 036.

### 025

Zachować `SETTLEMENT_GRID_STEP`, cell identity, home `(0,0)`, streaming i `SettlementsManager` lifecycle.

### 026

Zachować globalny `RoadNetwork` i A*. 047 poprawia local entrances/paths, nie tworzy nowego routingu.

### 028 / terrain

Używać istniejących terrain samplers/biome weights. Nie tworzyć nowego biome systemu.

---

## 11. Changes to files/modules

### Modify

- `src/settlement/settlementGenerator.ts` — authoritative plan generation seam.
- `src/settlement/families.ts` — XL + centralized size config.
- `src/settlement/findSettlementSite.ts` — footprint-aware suitability.
- `src/settlement/villageClearing.ts` — plan→terrain adapter.
- `src/settlement/props.ts` — instantiate planned positions.
- `src/settlement/createSettlement.ts` — consume plan-derived runtime data.
- `src/settlement/minorLocations.ts` — consume/adapt planned dock.
- `src/settlement/roadNetwork.ts` — entrances/local path integration; eliminate duplicate plan resolution.
- `src/settlement/SettlementsManager.ts` — single plan cache/resolver.
- `src/settlement/livestock.ts` — only size compatibility if required; no new placement system.
- `src/config/worldConfig.ts` — centralized planner tunables if needed.
- `src/ui/createDebugGui.ts` — debug/tuning only.
- `src/terrain/chunkHeightmap.ts` — only if existing terrain segment API needs a small extension.

### Add if needed

- `src/settlement/villagePlan.ts` — authoritative plain-data model.
- `src/settlement/villagePlanner.ts` — orchestration/scoring if separation from `settlementGenerator.ts` is useful.
- planner/scoring `*.test.ts`.

Do **not** add parallel `VillageLayoutGenerator`, `VillagePathFinder`, `VillageResourceSystem`, `VillageTerrainGenerator` or `VillagePlaceSystem`.

---

## 12. Migration / backward compatibility

Recommended migration:

```text
VillagePlan authoritative
       ↓
SettlementDef compatibility projection
       ↓
existing runtime consumers
```

Do not keep duplicated layout data indefinitely. If `SettlementDef` remains after 047, it must be a thin projection and must not make independent placement decisions.

No new persisted `VillagePlan` format is required in v1: settlement generation remains deterministic from world seed/cell.

Existing saves must preserve home identity and reserved NPC names; exact old village geometry does not need to remain byte-for-byte identical because 047 intentionally changes generation.

---

## 13. Persistence / streaming

`VillagePlan` must be:

- deterministic;
- plain/serializable;
- independent of loaded chunks;
- independent of Three.js.

Never store `THREE.Vector3`, `Object3D`, `NpcAgent`, `AnimalAgent`, meshes or scene nodes in the plan.

Streaming remains:

```text
resolve plan
→ if runtime required: waitForChunks(chunksNear(plan.site))
→ instantiate runtime
```

Plans may be resolved for roads/neighbor metadata even when runtime settlement is unloaded.

Preserve `waitForChunks()` because props must use terrain with village modifications already applied.

---

## 14. Performance

Keep planning bounded and analytic:

- bounded site candidates;
- bounded plot candidates;
- cached terrain/resource samples;
- plan cache per cell;
- no eager generation of the world;
- no Three.js during planning;
- no repeated A* for the same route;
- no duplicate resource scans;
- no duplicate settlement definition caches.

Do not move planner work to a worker mechanically. Profile first; worker communication has a cost and current settlement generation is main-thread analytic work.

---

## 15. Edge cases

### Home

Cell `(0,0)`, reserved Anna/Piotr + Kasia/Marek, quest assumptions intact, player spawn inside planned core.

### OUTPOST

Exactly one family/resident/house, minimal utility infrastructure, no normal LG/XL expansion, resource relationship retained.

### Mountain

Keep terrain character; do not flatten the entire village. Prefer low-slope plots, preserve controlled elevation differences, keep house paths dry.

### Waterfront

Only use dock/food infrastructure if valid dock exists. Never force buildings/path through water.

### No dominant resource

Use existing fallback food/source and generic structure; do not invent resource buildings.

### Neighboring large settlements

Use existing grid separation, but planner boundary should reject obvious footprint overlap when neighboring plans are available.

### No valid candidate

Deterministic fallback chain:

```text
best valid candidate
→ nearest safe candidate
→ existing site/core fallback
```

Never `Math.random()` as fallback.

---

## 16. Verification / acceptance criteria

### Architecture

- [ ] one authoritative `VillagePlan` per settlement;
- [ ] no second village layout generator;
- [ ] `SettlementDef` cannot diverge from plan layout;
- [ ] `RoadNetwork` remains global road owner;
- [ ] `Place` remains NPC runtime location owner;
- [ ] `naturalResources.ts` remains resource owner.

### Determinism

- [ ] same seed + cell + config → identical plan;
- [ ] stream out/in → identical plan;
- [ ] no new layout decision uses `Math.random()`.

### Layout

- [ ] family ↔ house is 1:1;
- [ ] props do not independently randomize houses;
- [ ] one explicit center/core;
- [ ] zones explain placement;
- [ ] production/food/livestock areas depend on identity;
- [ ] local paths are planned.

### Terrain

- [ ] site scoring evaluates more than the existing ±2.5 local probe;
- [ ] footprint has sufficient dry area;
- [ ] required house paths are dry/reachable;
- [ ] existing worker-safe terrain modifiers are reused;
- [ ] mountain villages remain visibly mountainous without random-looking placement;
- [ ] no second terrain generator.

### Roads

- [ ] normal village has semantic entrance(s);
- [ ] global roads use existing `RoadNetwork`;
- [ ] local paths connect center to required zones;
- [ ] no second pathfinding system.

### Runtime

- [ ] landmarks instantiate from plan;
- [ ] `Place.home` uses planned houses;
- [ ] `workplaceFor()` remains functional;
- [ ] livestock anchors to planned homes;
- [ ] family relationships remain intact;
- [ ] dock/minor location agrees with plan;
- [ ] debug view shows actual plan.

### Size/resources

- [ ] XL is materially larger/richer than LG;
- [ ] OUTPOST remains special;
- [ ] 032 resource attraction/dominant resource remains functional;
- [ ] resource-driven family roles/food source remain available.

### Quality gates

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Then manually inspect multiple deterministic seeds:

- normal/flat;
- forest;
- mountain;
- waterfront;
- resource-rich mountain/outpost;
- XL;
- several-family settlement;
- neighboring settlements/global roads;
- stream-out/stream-in.

Visual verification should judge **relationships between elements**, not just object count.

---

## 17. Implementation order

```text
1. villagePlan.ts types
2. centralized VillageSize/XL config
3. settlementGenerator.ts plan seam
4. footprint-aware site scoring
5. boundary + center
6. layout pattern
7. zones
8. plots
9. buildings + landmarks
10. local paths + entrances
11. terrain modifier adapter
12. props runtime adapter
13. createSettlement runtime adapter
14. minorLocations adapter
15. RoadNetwork integration
16. SettlementsManager single plan cache
17. debug visualization
18. tests
19. manual visual verification
```

At every step keep existing runtime behavior working. Do not maintain a second decision source temporarily unless it is an immediate compatibility adapter whose layout authority is removed in the same change.

---

## 18. Dependency assessment

Current README:

```text
Depends on: ~~031~~, 032, 036
```

### 031

Correct. Already `done`; it is the family/home/clearing foundation.

### 032

Implementation dependency is satisfied in code: required resource APIs and resource-aware site selection exist. README status remains `verification needed`; do not change it here.

Therefore 047 does **not** need another 032 implementation pass.

### 036

Dependency is too broad. Only `findFlatSpot()` is currently implemented. The remaining 036 work is either superseded by 047's planner/scoring or explicitly deferred (full terraces/decorative masking).

**Recommended dependency after this review:**

```text
Depends on: ~~031~~, 032
```

Remove 036 as an implementation dependency. Do not change 036's own README status in this task.

Under the repository's README convention, 032 remains an uncrossed dependency while it is `verification needed`; that is a project-status gate, not a missing API/implementation prerequisite. Technically, the current repository is sufficient to implement 047.

---

## 19. Final implementation-readiness

**YES.** Agent implementing 047 can start from this plan plus the explicitly named code modules without repeating broad repository research.

The plan now fixes:

- actual `SettlementDef` and family APIs;
- current 032 resource model and integration;
- actual partial state of 036;
- existing clearing/terrain-modifier pipeline;
- existing `SettlementLandmarks`/`Place`/livestock/NPC integration;
- global `RoadNetwork` ownership;
- multi-settlement streaming and chunk sequencing;
- persistence constraints;
- exact migration path to one authoritative `VillagePlan`;
- forbidden parallel architectures;
- concrete implementation order and acceptance criteria.
