# Plan: Real cave habitats and animal home navigation

**Created:** 2026-09-07  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** L  
**Depends on:** ~~world-terrain-019~~, ~~fauna-016~~  
**Domain:** `fauna`  
**Type:** `feature`  
**Subdomains:** `habitat` `migration`  
**Tags:** `caves` `home` `navigation` `water-trips`  
**Roadmap:** -

> **Review 2026-09-11.** Plan został ponownie zweryfikowany względem aktualnego `main` po migracji caves na production heightfield. `world-terrain-019` jest zamknięty, SDF runtime usunięty, a retained `CaveHeightfieldRepresentation` jest jedynym production spatial authority. Nadal brakuje jednak cave-scoped semantic/traversal API dla fauna/quests/NPC — ten plan obejmuje dodanie tego wąskiego world-owned contractu jako pierwszego etapu zamiast czekania na nieistniejący kolejny blocker.

## Cel

Połączyć realne walk-in caves świata z systemem fauna habitat/home tak, aby fizyczna jaskinia była jednym źródłem prawdy dla miejsca, a normalny `AnimalAgent` mógł traktować jej wnętrze jako home, wychodzić przez wejście na powierzchnię po jedzenie i wodę oraz wracać do wnętrza.

Pierwszym konsumentem będzie `quests-progression-008-treasure-map-bear-cave.md`, ale mechanizm nie może być quest-specific ani bear-specific.

```text
real cave identity + retained CaveTopology/heightfield
→ world-owned cave traversal descriptor
→ fauna habitat binding
→ interior home + entrance route
→ normal AnimalAgent needs/trips/combat
→ surface journey
→ return through entrance to interior home
```

Nie tworzyć quest-owned cave coordinates, `bearLeavesCaveForQuest`, osobnego cave FSM ani drugiej spatial representation.

## Stan obecny po world-terrain-019

### Real caves

`src/world/createCaves.ts` buduje upfront dla każdej zaakceptowanej cave:

- stabilne `caveId`,
- retained `CaveTopology`,
- retained `CaveHeightfieldRepresentation`,
- deterministic walk-surface sampler,
- `CaveDefinition` pozostawione głównie dla catalog/streaming bounds,
- streamed presentation niezależną od gameplayowej reprezentacji.

Heightfield jest jedynym production spatial authority. Production SDF path i cave wall colliders zostały usunięte.

Aktualny publiczny `Caves` API udostępnia m.in.:

- `queryGround(x,y,z)` — Y-aware, ale **player-stateful** przez ground hysteresis; nie jest właściwym seamem dla wielu zwierząt,
- `occupancyAt(x,y,z)` — stateless strict occupancy,
- `resolveHorizontal(x,z,y,radius,entityHeight)` — entity-neutral wall containment,
- `contains(...)`,
- `sampleFloor(x,z)` / `sampleCeiling(x,z)` — legacy Y-blind/global convenience,
- `archetypeOf(caveId)`, `contentAnchorsOf(caveId)`.

Brakuje publicznego cave-scoped API pozwalającego po `caveId` pobrać semantic interior anchor, entrance route i stateless ground dla konkretnej cave. `CaveRuntime` ma już wszystko potrzebne wewnętrznie (`topology`, `heightfield`, `walkSurfaceAt`).

### Cave topology

`CaveTopology` jest representation-neutral i zawiera:

- `entrance`,
- semantic nodes (`entrance`, `passage`, `widening`, `chamber`, ...),
- połączone `segments` z world-space `centerline`,
- features.

Natural cave recipe ma jawny główny `chamber`; adventure caves korzystają z tego samego topology modelu. To jest właściwe źródło route semantics — nie render mesh.

### Fauna

Fauna nadal używa surface `HeightSampler` (`chunkManager.sampleHeight`) jako podstawowego ground seam. `AnimalAgent.home` jest punktem świata; movement-domain `ROAM_RADIUS = 50` oraz foraging validation zakładają zwykły surface home.

Po fauna-016 istnieją reusable:

- species roaming,
- hunger/thirst seeking,
- committed `AnimalTrip` z `traveling` / `staying` / `returning`,
- water destination lookup poza zwykłym wander bandem.

Po fauna-017 logika jest rozdzielona między `AnimalLife.ts`, `animalForaging.ts`, `animalRoaming.ts` i `AnimalAgent.ts`. Nie skupiać nowej logiki z powrotem w `AnimalAgent`.

Po fauna-018 istnieje fauna-owned persistent occupant registry i wiring save/rebuild. `createFauna()` już przyjmuje declarations/snapshots persistent occupants, ale żaden real-cave occupant nie jest jeszcze deklarowany.

### Dekoracyjne fauna caves

`createFauna.ts::SPAWNER_SPECS` nadal używa `type: 'cave'` dla lekkiego `createCaveMouth()` spawn pointu. To nie jest walk-in cave i semantycznie koliduje z real caves.

## Ownership

### World / world-terrain

World pozostaje właścicielem:

- cave identity,
- `CaveTopology`,
- retained heightfield,
- entrance i topology route,
- cave-scoped ground/occupancy/containment,
- semantic interior anchor.

World nie wie, że cave jest „bear cave” i nie posiada lifecycle zwierzęcia.

### Fauna

Fauna pozostaje właścicielem:

- bindingu habitat → world cave,
- home konkretnego zwierzęcia,
- journey intent,
- roaming / needs / trips,
- population/occupancy policy,
- persistent occupant integration,
- normalnego `AnimalAgent` lifecycle.

### Composition root

`WorldBundle` tworzy real caves na critical path, natomiast fauna jest obecnie budowana w tle. Przekazać do `buildFauna()` / `createFauna()` wąski read-only contract z już zbudowanego `Caves`; nie importować `createCaves.ts`, Three.js mesh ani `ChunkManager` do animal behaviour modules.

## 1. World-owned cave traversal contract

Dodać w `src/world/createCaves.ts` albo w małym module pod `src/world/caves/` wąski publiczny contract rozwiązywany po `caveId`.

Konceptualnie:

```ts
type CaveTraversalDescriptor = {
  caveId: string
  entrance: { x: number; y: number; z: number; yaw: number }
  home: { x: number; y: number; z: number }
  routeToEntrance: readonly { x: number; y: number; z: number }[]
}
```

oraz cave-scoped stateless spatial helpers potrzebne przez movement, np.:

```ts
resolveTraversal(caveId): CaveTraversalDescriptor | null
queryGroundIn(caveId, x, y, z): CaveGroundHit | null
resolveHorizontalIn(caveId, ...): { x, z }
```

Dokładna nazwa może się różnić, ale wymagania są stałe:

- lookup O(1) przez istniejący `v2ByCaveId`,
- brak globalnego scan caves na tick zwierzęcia,
- brak player hysteresis,
- brak zależności od aktywnej presentation,
- brak eksportowania mutable `CaveRuntime` / raw heightfield do fauna.

Nie tworzyć drugiej reprezentacji spatial ani wrappera nad `CaveVolume`.

## 2. Interior home anchor

Home cave residenta ma leżeć wewnątrz cave, nie przy mouth.

Anchor wyznaczać deterministycznie z `CaveTopology`:

1. preferować semantic main `chamber`,
2. dla topology bez literalnego `id === 'chamber'` wybrać deterministic entrance-connected chamber zgodnie z topology semantics,
3. X/Z brać z semantic node,
4. Y potwierdzić/snapować do **tej cave's retained heightfield floor**, nie do surface terrain i nie do mesh raycastu.

Anchor musi mieć standable clearance i poprawną trasę do entrance. Jeśli semantic candidate nie jest standable w production heightfield, resolver ma odrzucić descriptor/testować fallback topology candidate — nie zapisywać „prawie poprawnego” punktu.

## 3. Route: topology centerline, nie navmesh

Dla pierwszych L1 caves nie dodawać ogólnego navmesha.

Route interior ↔ entrance wyprowadzać z `CaveTopology.nodes/segments` jako uporządkowaną ścieżkę po graphie od home chamber do `entrance`. Segmentowe `centerline` są naturalnymi waypointami.

Każdy route waypoint powinien używać production floor tej cave. Fauna nie może ufać topology `y` jako finalnej rendered floor, jeśli retained heightfield daje dokładniejszą wartość.

Route jest world-owned semantic data. Animal może cache'ować resolved descriptor, ale authoritative identity pozostaje `caveId`.

## 4. Cave-aware animal movement seam

Nie używać `Caves.queryGround()` dla animals, bo ten API ma player-specific hysteresis state.

Rozszerzyć fauna movement o wspólny ground/spatial seam, który dla cave journey:

- używa cave-scoped stateless floor query,
- stosuje cave horizontal containment dla rozmiaru konkretnego zwierzęcia,
- przy mouth przechodzi na istniejący surface terrain sampler,
- poza cave zachowuje obecne colliders/water traversal.

Production caves są świadomie 2.5D: jeden walkable vertical interval na `(x,z)`. Nie projektować fauna-019 pod nieistniejące multi-level caves. Y-aware oznacza tu poprawne rozróżnienie cave entity vs surface entity nad tunelem i prawidłowe portal semantics, zgodnie z obecnym heightfield contractem.

Nie zmieniać `Caves.sampleFloor/sampleCeiling` w główny animal contract; są globalne/Y-blind i nie niosą habitat identity.

## 5. Habitat binding

Dodać mały fauna-owned binding wskazujący real world habitat przez stable reference, np.:

```ts
type AnimalHabitatBinding = {
  habitatId: string
  source: { kind: 'cave'; caveId: string }
}
```

Resolved home/route są runtime-derived z world contractu, nie drugim persistent definition.

Nie projektować teraz uniwersalnego `WorldPlaceHabitatFramework`. Typ ma być rozszerzalny, ale scope pozostaje caves.

## 6. Journey semantics: leave i return

Cave resident musi móc legalnie opuścić local home band z powodu committed potrzeby/tripu i wrócić do prawdziwego interior home.

```text
interior need/trip
→ follow routeToEntrance
→ mouth
→ normal surface target movement
→ satisfy/stay
→ committed return
→ entrance
→ reverse cave route
→ interior home
```

`ROAM_RADIUS` pozostaje guardem lokalnego roamingu i zwykłego foragingu. Nie zwiększać go globalnie.

Zamiast tego rozdzielić:

- **local roam/search bound** — obecna semantyka,
- **committed journey** — jawnie może przekroczyć home bound,
- **home return** — zawsze może przejść po habitat route.

Runaway/chase guards pozostają; wyjątek dotyczy intencjonalnego journey, nie dowolnego movement.

## 7. Hunger, thirst i water trips

Cave resident korzysta z normalnego metabolism i normalnych target providers.

Jeśli resource target jest na surface, routing do entrance poprzedza istniejący pursuit. Nie dodawać cave-only food/water ani sztucznego resource wewnątrz jaskini.

Bear dostaje declarative `AnimalDef.trips.water` w tym samym mechanizmie co istniejące species. Nie dodawać `kind === 'bear'` do trip state machine.

## 8. Dekoracyjny `cave` → `rockDen`

Przed wprowadzeniem real cave-backed habitat usunąć kolizję nazewniczą.

Preferowana nazwa: `rockDen` — odróżnia dekoracyjny `createCaveMouth()` prop od realnego world cave i od istniejącego specjalnego `wolfDen`.

Zmiana obejmuje konsekwentnie:

- `PreySpawner['type']`,
- `SPAWNER_SPECS`,
- labels/markers/tests,
- stable spawner id/persistence compatibility.

Nie zmieniać samego spawner lifecycle ani placement behaviour.

Ponieważ spawner type uczestniczy w stabilnej tożsamości, rename musi mieć migration/legacy-id handling albo zachować dotychczasowy stable id mimo nowej presentation/type nazwy. Nie orphanować zapisanych `SavedSpawnPointState`.

## 9. Integracja z fauna-018

fauna-018 jest już zaimplementowany na `main` (pozostaje verification gate), więc fauna-019 nie projektuje własnej persistence warstwy.

Docelowo:

```text
caveId
→ cave traversal descriptor
→ fauna habitat binding
→ PersistentOccupantDecl habitat/slot
→ stable AnimalAgent id + snapshot/hydrate
```

Cave-backed binding nie może zależeć od tego, czy occupant jest persistent. Ordinary habitat może istnieć bez occupanta.

Treasure-map bear będzie tylko pierwszą deklaracją korzystającą z tego contractu.

## 10. Persistence i reconstruction

Nie zapisywać:

- cave topology,
- route waypointów,
- home coordinates wynikających z cave,
- heightfield danych,
- transient journey path state.

Zapisywać tylko stan należący do istniejących persistent occupant / AnimalAgent contracts oraz stable cave/habitat identity potrzebne do reconstruction.

Po load/rebuild descriptor jest ponownie rozwiązywany po `caveId`. Jeżeli saved resident był na surface, może wznowić normalne decyzje i wrócić przez reconstructed route; nie wymaga serializacji route cursor.

## 11. Performance i off-screen independence

Wymagania:

- cave topology/heightfield pozostają dostępne bez aktywnego mesh,
- habitat descriptor rozwiązać raz przy construction/hydration i cache'ować,
- route jest mała i deterministic,
- cave-scoped spatial query idzie bezpośrednio do znanego runtime po `caveId`,
- żadnych scene graph lookupów, raycastów ani presentation activation,
- żadnych warunków zależnych od player/camera distance.

To ma działać również przy przyszłej niższej częstotliwości/off-screen symulacji.

## 12. Pierwszy consumer: treasure-map bear cave

Po fauna-019 + istniejącym fauna-018 world composition powinno móc zadeklarować:

```text
selected real caveId
+ cave-backed habitat
+ persistent occupant slot: resident
+ species: bear
→ jeden konkretny bear z home w cave interior
```

Bear może być akurat w cave albo poza nią; quest nie wymusza jego pozycji i nie steruje jego movementem.

## Implementacja — kolejność

1. Dodać cave-scoped semantic/traversal contract nad istniejącym `CaveRuntime` i focused world tests.
2. Bezpiecznie przemianować dekoracyjny fauna `cave` spawner na `rockDen` z compatibility dla stable ids/snapshots.
3. Dodać `AnimalHabitatBinding` + cave descriptor resolution w `createFauna()`.
4. Rozszerzyć wspólny animal ground/horizontal movement seam o cave context.
5. Dodać route traversal interior ↔ entrance oraz explicit committed journey semantics ponad `ROAM_RADIUS`.
6. Wpiąć needs/trips i bear `trips.water`.
7. Zintegrować cave habitat z istniejącym persistent occupant registry bez nowego persistence subsystemu.
8. Dodać focused tests; browser verification pozostawić użytkownikowi.

## Testy

Dodać co najmniej testy dla:

- `caveId` rozwiązuje ten sam descriptor bez aktywacji presentation,
- home anchor jest deterministic, standable i w semantic chamber,
- route jest wejście↔home i pochodzi z topology graph/centerlines,
- cave-scoped ground nie używa player hysteresis i nie myli surface entity nad tunelem,
- animal przechodzi interior → mouth → surface i z powrotem bez teleportu,
- local roam nadal respektuje bound, committed need/trip może legalnie go przekroczyć,
- return kończy się w interior home, nie na entrance,
- threat/combat może przerwać journey bez utraty habitat identity,
- bear water trip jest declarative,
- surface animals zachowują dotychczasowy movement,
- `rockDen` rename nie orphanuje istniejącego spawner snapshotu,
- real cave bez occupant declaration pozostaje pusta,
- persistent cave occupant nie dostaje replacement spawn po tombstone,
- save/load nie wymaga geometry ani transient route persistence.

## Manual verification

Manual verification wykonuje użytkownik w przeglądarce.

Sprawdzić co najmniej:

1. Bear przebywa wewnątrz realnej walk-in cave.
2. Fizycznie przechodzi chamber → passage → mouth → surface bez teleportu.
3. Hunger/thirst/water trip może wyprowadzić go do realnego surface target.
4. Po journey wraca przez entrance do interior home.
5. Combat/threat nie psuje home binding.
6. Movement nie zależy od tego, czy cave presentation jest aktualnie streamed.
7. Ordinary surface fauna i dekoracyjne `rockDen` nie mają regresji.
8. Po podłączeniu persistent occupanta save/load nie tworzy duplikatu/replacementu.

## Non-goals

Poza zakresem:

- implementacja całego `quests-progression-008`,
- nowy persistence subsystem dla wild fauna,
- persistence wszystkich wild animals,
- ogólny navmesh/pathfinding rewrite,
- multi-level cave support ponad obecny production heightfield contract,
- quest-specific bear behaviour,
- teleportowanie cave residents,
- duplikowanie cave coordinates w fauna/quest,
- aktywowanie render mesh dla off-screen fauna,
- automatyczne zasiedlanie wszystkich caves,
- cave biome ecosystem / hibernation / migration,
- unrelated Cave V2 cleanup (`CaveDefinition` catalog/streaming leftovers).

## Implementation notes

Aktualizować:

`docs/plans/implementation-notes/fauna-019-real-cave-habitats-and-animal-home-navigation-implementation-notes.md`

Notes mają wskazywać konkretne obecne symbole/files, ownership i call-sites; nie kopiować całego planu.

Przy implementacji dodać JSDoc do nowych publicznych contractów (`@domain world-terrain` / `@domain fauna`) tam, gdzie poprawia discovery.

## Verification techniczne

Uruchomić adekwatnie:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Nie uruchamiać browser verification — wykonuje je użytkownik.

Nie uruchamiać ręcznie `pnpm docs:sync`; derived documentation synchronizuje GitHub workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

## Implementacja 2026-09-12

Zaimplementowane w całości, zgodnie z kolejnością z sekcji "Implementacja — kolejność":

1. `Caves.resolveHabitat` / `queryGroundIn` / `resolveHorizontalIn` (`src/world/caves/caveHabitat.ts` + wiring w `createCaves.ts`) — cave-scoped traversal contract, O(1) przez `v2ByCaveId`, bez presentation, z testami (`caveHabitat.test.ts`).
2. Dekoracyjny spawner `cave` → `rockDen` (`SpawnerType`, `SPAWNER_SPECS`, labels), z zachowanym legacy `cave` id-segmentem w `spawnerId()` — istniejące `SavedSpawnPointState` nie są osierocone.
3. `AnimalHabitatBinding` + `resolveAnimalCaveHabitat` (`src/fauna/animalCaveHabitat.ts`), wpięte w `createFauna()` (`caveWorld`/`caveHabitats` parametry) i `worldBundle.ts::buildFauna()` (adapter nad już zbudowanym `Caves`).
4. Wspólny ground/horizontal seam: `AnimalAgent.snapY()` woli cave-scoped floor/containment, fallback do surface `sampleHeight`; `entityRadius`/`entityHeight` z `def.scale`/`def.modelHeight` (reużyte, nie nowa stała).
5. `advanceCaveRoute` (mały, nie-persystowany cursor — nie nearest-point, żeby folded `adventure` route nie cofał zwierzęcia) + `AnimalAgent.continueTrip()` przechodzi interior↔entrance przed/po surface leg.
6. `clampBounds()` pomija `ROAM_RADIUS` podczas aktywnego `AnimalTrip` (ogólna poprawka, nie cave-specific) — reszta needs/foraging bez zmian (`animalForaging.ts` nietknięty, zgodnie z notatkami).
7. `bear: { trips: { water: BEAR_WATER_TRIP } }` w `animalDefs.ts`.
8. Nie dodano żadnej realnej deklaracji `PersistentOccupantDecl` dla bear/treasure-map (świadomie poza zakresem — `quests-progression-008` pozostaje osobnym pluginem konsumującym ten kontrakt).

Testy: `src/world/caves/caveHabitat.test.ts` (world), `src/fauna/animalCaveJourney.test.ts` (fauna — habitat resolution, ground/wander seam, outbound/return journey przez syntetyczny cave world contract, `clampBounds` podczas trip, non-lethal hit nie gubi habitat identity), plus zaktualizowane istniejące testy przy `rockDen` rename. `npx tsc --noEmit` / `npm run lint:fix` / `npm run build` / `npm run test` — zielone. Browser/gameplay verification pozostaje do wykonania przez użytkownika (patrz sekcja "Manual verification").