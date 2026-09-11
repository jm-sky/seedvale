# Plan: Real cave habitats and animal home navigation

**Created:** 2026-09-07
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** ~~world-terrain-019~~, ~~fauna-016~~
**Domain:** `fauna`
**Subdomains:** `habitat` `migration`
**Tags:** `caves` `home` `navigation` `water-trips`
**Roadmap:** -

## Cel

Połączyć realne walk-in caves świata z systemem fauna habitat/home tak, aby fizyczna jaskinia była jednym źródłem prawdy dla miejsca, a normalny `AnimalAgent` mógł traktować jej wnętrze jako home, wychodzić przez wejście na powierzchnię po jedzenie i wodę oraz wracać do wnętrza.

Pierwszym konsumentem będzie `quests-progression-008-treasure-map-bear-cave.md`, ale mechanizm nie może być quest-specific ani bear-specific.

Docelowy model:

```text
real world cave / stable cave identity
→ fauna habitat binding
→ deterministic interior home anchor + entrance transition
→ normal AnimalAgent
→ cave-aware movement to surface
→ normal hunger / thirst / roaming / trips
→ return through entrance to interior home
```

Nie tworzyć `bearLeavesCaveForQuest`, quest-owned coordinates ani drugiej definicji tej samej fizycznej cave.

## Stan obecny

Seedvale ma obecnie dwa niezależne znaczenia `cave`.

### Real world cave

`src/world/createCaves.ts` posiada deterministyczne cave definitions/identity oraz runtime cave lifecycle. Cave V2 (`world-terrain-008`, zamknięty) dostarczył `CaveTopology` i produkcyjną infrastrukturę. Finalny production spatial contract, którego ten plan potrzebuje, pochodzi z `world-terrain-019-cave-heightfield-production-migration.md`:

```text
CaveTopology
→ CaveSpatialRepresentation
├─ presentation mesh
├─ gameplay spatial queries
└─ collision proxy
```

Real cave jest world-owned. Presentation geometry jest aktywowana/dezaktywowana zależnie od obserwatora, ale identity i gameplayowa reprezentacja nie mogą zależeć od kamery ani obecności gracza.

`worldLocationCatalog.ts` potrafi już mapować stabilne `caveId` na world location `cave:<caveId>`.

### Fauna `cave`

`createFauna.ts` ma niezależny `SPAWNER_SPECS` z dekoracyjnym spawnerem `type: 'cave'`, m.in. dla bear. `PreySpawner` posiada własną pozycję, lifecycle i respawn policy. Ten habitat nie jest realną walk-in cave i nie zna jej topology ani interior.

`AnimalAgent.home` jest obecnie zwykłym punktem na powierzchni. Ground sampling fauny korzysta z terrain height sampler przekazanego z `WorldBundle`, a nie z cave floor/spatial queries. Samo ustawienie `home` wewnątrz cave dałoby więc błędną fizykę/movement.

`fauna-016-animal-habitats-roaming-water-trips-and-settlement-rats.md` dostarcza home-relative roaming i reusable water-trip lifecycle. Należy go rozszerzyć zamiast tworzyć osobny cave behaviour.

## Ownership

### World / world-terrain

World pozostaje właścicielem fizycznej cave:

- stable `caveId` / world-place identity,
- `CaveTopology`,
- production spatial representation,
- entrance,
- chamber/interior semantics potrzebnych do wyznaczenia home anchor,
- render-independent gameplay spatial queries,
- collision/presentation jako derived concerns.

World nie wie, że cave jest „bear cave” i nie posiada fauna lifecycle.

### Fauna

Fauna jest właścicielem:

- habitat binding do world place,
- home konkretnego zwierzęcia,
- population/occupancy policy,
- roaming,
- hunger/thirst,
- water trips,
- decyzji o wyjściu i powrocie,
- normalnego `AnimalAgent` lifecycle.

### Composition root

`WorldBundle` / `buildFauna()` powinien przekazywać fauna minimalny world-owned contract potrzebny do rozwiązania cave habitat i movement queries. Nie tworzyć globalnego managera ani bezpośredniego importowania scene-owned cave meshes przez `AnimalAgent`.

## 1. Stable real-cave habitat binding

Dodać mały fauna-owned contract pozwalający habitat/home wskazać istniejący real world place zamiast przechowywać drugą kopię współrzędnych.

Konceptualnie:

```text
AnimalHabitatBinding
  habitatId
  sourceRef: world cave identity / world-location identity
  resolved home anchor
```

Dokładny TypeScript contract ustalić względem finalnego production API z `world-terrain-019`. Nie wiązać nowego API z transitional `CaveVolume`, jeśli produkcyjny spatial contract go zastępuje.

Stable reference jest źródłem identity. Resolved coordinates mogą być runtime cache, ale nie drugim authoritative definition.

Kontrakt ma nadawać się później do innych world-backed habitats, ale nie projektować teraz ogólnego frameworka dla wszystkich typów miejsc.

## 2. Interior home anchor

Dla real cave habitat `home` zwierzęcia znajduje się **wewnątrz cave**, nie przy samym wejściu.

World cave contract powinien umożliwiać deterministyczne wyznaczenie habitat-safe interior anchor, preferencyjnie w semantycznym `main chamber` lub innym jawnie odpowiednim interior node/region.

Anchor musi:

- leżeć na poprawnej walkable cave floor,
- być stabilny dla tej samej cave identity/topology,
- nie zależeć od wygenerowanego render mesha,
- być dostępny również gdy presentation cave jest unloaded,
- mieć poprawną drogę przez cave topology do entrance.

Nie wybierać home przez losowy raycast w aktywny mesh.

## 3. Cave-aware animal ground/navigation seam

To jest kluczowy element integracji.

Obecny fauna movement używa surface terrain height sampler. Rozszerzyć world/movement seam tak, aby normalny `AnimalAgent` mógł poruszać się po właściwym ground zarówno na surface, jak i wewnątrz real cave.

Preferować reusable world/entity spatial query zamiast fauna-specific lub bear-specific floor sampler.

Contract musi obsłużyć co najmniej:

```text
interior home
→ cave passage
→ mouth / entrance transition
→ surface terrain
```

i odwrotnie.

Query powinno być Y-aware zgodnie z kierunkiem Cave V2 i nie może utrwalać 2.5D założenia „jedna wysokość floor dla X/Z”, które blokowałoby przyszłe multi-level caves.

Nie implementować pełnego ogólnego navmesha, jeśli istniejące local steering + production cave spatial queries wystarczą do niezawodnego przejścia pierwszej L1 cave. Jednocześnie nie kodować sekwencji punktów tylko dla jednego bear questa.

Jeżeli podczas implementacji `world-terrain-019` nie dostarcza jeszcze production gameplay spatial contractu potrzebnego do movement, traktować to jako blocker/dependency do dokończenia, a nie budować równoległy compatibility system w fauna.

## 4. Wyjście z cave i powrót

Cave resident nie może być fizycznie przywiązany do interior home radius.

Normalne potrzeby i tripy muszą móc uruchomić ruch poza cave:

```text
need / trip target on surface
→ leave-home intent
→ navigate interior → entrance
→ normal surface movement
→ satisfy need / trip
→ return intent
→ surface → entrance → interior
→ reach actual home anchor
```

Powrót nie kończy się przy mouth. Zwierzę wraca do interior home anchor.

Istniejące home-relative bounds (`ROAM_RADIUS` i podobne guards) nie mogą blokować legalnego wyjścia po zasoby. Rozszerzyć ich semantykę tak, aby committed need/trip/home journey mogło przekroczyć zwykły local roaming band, zachowując guard przeciw runaway/pathological chase.

Nie tworzyć osobnego cave-only behaviour FSM, jeśli obecny trip/target lifecycle można rozszerzyć o route semantics.

## 5. Hunger, thirst i food trips

Cave resident korzysta z normalnego metabolism i istniejących hunger/thirst systems.

Jeżeli jedzenie lub woda są poza cave, zwierzę powinno móc opuścić home, zaspokoić potrzebę i później wrócić.

Nie dodawać sztucznego cave food/water tylko po to, aby resident nie musiał wychodzić.

Jeżeli obecny food/water target selection zakłada wyłącznie surface-local home radius, rozszerzyć wspólny target-selection/journey seam w minimalnym zakresie potrzebnym do cave residents.

## 6. Bear water trips

Dodać bear species-level `trips.water` wykorzystujące mechanizm z fauna-016.

Parametry dobrać w istniejącym stylu konfiguracji species i utrzymać je declarative. Nie tworzyć konfiguracji tylko dla treasure-map bear.

Water trip bear powinien:

- wybrać surface water destination przez istniejący world-water lookup,
- wyjść z cave przez normalny cave/surface route,
- wykonać istniejącą stay phase,
- wrócić do interior home anchor.

Threat/combat/urgent needs nadal mogą przerwać lub opóźnić movement zgodnie z istniejącymi priorytetami `AnimalAgent`.

## 7. Habitat binding vs population/respawn policy

Rozdzielić pojęcia:

```text
physical habitat/home binding
!=
population spawning/repopulation policy
```

Real cave może być:

- home ordinary animal population,
- home persistent occupanta z `fauna-018`,
- chwilowo/persistently empty,
- w przyszłości home kilku occupantów.

Nie zakładać, że każda real cave automatycznie tworzy bear albo jakiekolwiek zwierzę.

`PreySpawner` może opcjonalnie korzystać z real-cave habitat binding, ale nie powinien być jedyną reprezentacją habitat identity.

To pozwala `fauna-018-persistent-habitat-occupants.md` używać stabilnego real cave habitat bez zmiany cave w quest-owned spawner.

## 8. Fate obecnego dekoracyjnego fauna `cave`

Nie usuwać lekkich dekoracyjnych dens jako mechanizmu world population.

Usunąć jednak semantyczną kolizję z real walk-in caves. Obecny fauna spawner `type: 'cave'` powinien zostać przemianowany/rozdzielony na pojęcie typu `den` / `rockDen` zgodnie z istniejącym naming style.

Takie habitaty pozostają lekkimi, nie-walk-in miejscami dla ordinary fauna i nie korzystają z Cave V2 topology.

Po migracji `cave` w fauna powinno jednoznacznie oznaczać real world cave-backed habitat albo nie być używane jako dekoracyjny typ.

Nie zmieniać zachowania pozostałych `thicket`, `grove`, wolf den itp. poza koniecznym rename/wiring.

## 9. Integracja z fauna-018 persistent habitat occupants

Ten plan nie implementuje persistence konkretnego wild animal — to odpowiedzialność `fauna-018-persistent-habitat-occupants.md`.

Kontrakty mają się jednak składać bez adapterów questowych:

```text
real cave identity
→ fauna-019 habitat binding + interior home
→ fauna-018 persistent occupant slot
→ stable AnimalAgent identity/state
```

Treasure-map quest może dzięki temu wskazać cave/world state, ale nie posiada `bearAlive`, home coordinates ani movement logic.

Nie uzależniać samego real-cave habitat binding od tego, czy occupant jest persistent.

## 10. Relacja do world-terrain-019

`world-terrain-019-cave-heightfield-production-migration.md` jest dependency architektonicznym.

Fauna-019 powinien konsumować produkcyjne rezultaty heightfield migration:

- stable production cave identity/topology,
- production entrance + gameplay spatial queries,
- poprawne entity/collision/spatial semantics potrzebne do przechodzenia interior ↔ surface.

Nie zależeć od:

- aktywnego Three.js mesh,
- camera state,
- render activation distance,
- collider registry jako źródła cave identity,
- transitional V1 `CaveVolume` jako nowego trwałego contractu,
- production SDF internals.

Nie czekać na kosmetyczny leftover cleanup poza finalnym production spatial contractem.

## 11. Persistence i reconstruction

Geometria cave i habitat anchor pozostają deterministycznie rekonstruowane z world/cave identity; nie zapisywać duplikatu topology ani współrzędnych cave w save.

Ordinary wild fauna pozostaje zgodna z obecną persistence policy.

Persistent concrete cave resident korzysta z `fauna-018`; fauna-019 dostarcza tylko stabilny habitat/home binding, który można odtworzyć przed hydration occupanta.

Po save/load persistent resident może zostać przywrócony zarówno wewnątrz cave, jak i podczas surface journey. Nie wymagać persistence transient route/path state — po reconstruction normalny behaviour może ponownie wyznaczyć drogę na podstawie stabilnego habitat binding i trwałego AnimalAgent state.

## 12. Performance i off-screen independence

Fauna simulation nie może aktywować cave presentation geometry tylko dlatego, że zwierzę ma tam home lub przechodzi przez cave.

Cave-backed habitat i spatial/navigation queries muszą działać na taniej world-owned representation dostępnej bez render mesh.

Nie dodawać:

- per-frame scan wszystkich caves dla każdego animal,
- scene graph lookup,
- raycastów do nieaktywnego/aktywnego cave mesh jako simulation contract,
- player/camera-distance warunków zmieniających decyzje zwierzęcia.

Habitat binding rozwiązać podczas construction/reconstruction i cache'ować stable reference/anchor. Spatial query podczas movement powinno być lokalne do znanej cave/route, nie globalnym wyszukiwaniem.

Zachować możliwość przyszłej hybrid/off-screen simulation: low-fidelity resident nadal musi mieć stable home identity i możliwość logicznego `inside cave` / `outside` continuity bez obecności gracza.

## 13. Pierwszy consumer: treasure-map bear cave

Po wdrożeniu fauna-018 + fauna-019 quest powinien móc skonfigurować świat konceptualnie:

```text
selected real cave
+ fauna habitat binding to that cave
+ persistent occupant key: resident
+ species: bear
→ one concrete bear whose real home is inside that cave
```

Bear:

- śpi/przebywa i wraca do real cave interior,
- może wyjść na surface z powodu hunger/thirst/water trip,
- korzysta z normalnego combat/predator/death lifecycle,
- nie jest sterowany przez quest,
- zachowuje persistent identity/lifecycle przez fauna-018.

Quest może zastać bear w cave albo poza nią, zależnie od rzeczywistego stanu symulacji. To jest pożądane emergent behaviour, nie błąd wymagający quest override.

## Testy

Dodać focused automated tests co najmniej dla:

- stable real cave identity rozwiązuje ten sam fauna habitat binding,
- interior home anchor jest deterministyczny i należy do poprawnej cave,
- habitat resolution nie wymaga aktywnego render mesh,
- animal ground query wybiera cave floor wewnątrz i surface ground na zewnątrz,
- entrance transition pozwala przejść interior → surface i surface → interior bez teleportu,
- Y-aware query nie opiera poprawności wyłącznie na X/Z single-floor assumption,
- normal local roaming nie wyprowadza cave resident przypadkowo przez home bound,
- committed hunger/thirst/trip journey może legalnie przekroczyć local home radius,
- po zakończeniu surface journey animal wraca do interior home, nie tylko entrance,
- interrupted water trip zachowuje istniejące fauna-016 priority semantics,
- bear ma declarative water-trip policy i korzysta ze wspólnego mechanizmu,
- ordinary surface animals zachowują dotychczasowy ground/movement behaviour,
- ordinary decorative dens nadal spawnują/recoverują zgodnie z obecnymi regułami,
- real cave habitat nie tworzy automatycznie occupanta bez population/occupant declaration,
- real cave habitat współpracuje z persistent occupant slot z fauna-018 bez replacement spawn,
- reconstruction nie wymaga zapisania cave geometry ani transient route state.

## Manual verification

Manual verification wykonuje użytkownik w przeglądarce.

Po implementacji sprawdzić co najmniej:

1. Bear startuje/przebywa wewnątrz realnej walk-in cave.
2. Może fizycznie przejść z chamber przez passage i mouth na surface bez teleportu.
3. Hunger/thirst może wyprowadzić go poza cave do rzeczywistego resource target.
4. Bear water trip wyprowadza go do wody, wykonuje stay i kończy powrotem do interior home.
5. Combat/threat może zakłócić journey bez utraty poprawnego home binding.
6. Bear potrafi wrócić z surface przez entrance do chamber.
7. To samo zachowanie nie zależy od pozycji kamery; cave mesh może być streamed niezależnie od simulation state.
8. Ordinary fauna i dekoracyjne dens nie dostają regresji movement/spawn.
9. Po podłączeniu fauna-018 save/load residenta nie tworzy duplikatu ani replacementu.

## Non-goals

Poza zakresem:

- implementacja `quests-progression-008` jako questa,
- persistence konkretnego wild animal — `fauna-018`,
- persistence wszystkich wild animals,
- pełny ogólny navmesh/pathfinding rewrite,
- quest-specific bear behaviour,
- `bearLeavesCaveForQuest`,
- teleportowanie cave residents przez entrance,
- duplikowanie cave coordinates w fauna/quest,
- aktywowanie cave render mesh dla off-screen fauna,
- proceduralne przypisywanie species do wszystkich real caves,
- pełna ecosystem/population simulation dla cave biomes,
- migration/hibernation/seasonal denning,
- przebudowa Cave V2 geometry poza dependency contract wymaganym przez fauna movement,
- finalny tuning wszystkich species trips.

## Implementation notes

Przygotować i utrzymywać:

`docs/plans/implementation-notes/fauna-019-real-cave-habitats-and-animal-home-navigation-implementation-notes.md`

Implementation notes powinny przede wszystkim zapisać aktualny po `world-terrain-019` contract cave identity/topology/spatial queries, dokładny fauna movement seam, `AnimalAgent` home/trip guards, `PreySpawner` population ownership oraz `WorldBundle` composition wiring.

Nie kopiować do notes całego planu.

Przy implementacji dodać JSDoc do ważnych nowych publicznych/architektonicznych funkcji i typów tam, gdzie poprawia to preflight discovery; użyć `@domain fauna` dla fauna-owned seams i odpowiedniego domain tag dla world-owned spatial contractu.

## Verification techniczne

Uruchomić adekwatnie:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Nie uruchamiać browser verification — wykonuje je użytkownik.

Nie uruchamiać ręcznie `pnpm docs:sync`; derived documentation jest synchronizowana automatycznie przez GitHub workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
