# Implementation Notes: quests-progression-009 — Mapa do skarbu — ruiny w ciemnym lesie

## Stan wejściowy

Recon wykonany na `main` 2026-09-07 przed implementacją planu.

Najważniejsze istniejące kontrakty:

- `src/terrain/biomeRegions.ts` — `forestDensityAt()` i `forestBiomeAt()` są czystymi, deterministycznymi samplerami; `deepForest` nie wymaga loaded chunks ani Three.js.
- `src/terrain/chunkEnvironment.ts` — `EnvironmentKind` zawiera `smallRuins`; `LandmarkKind` obejmuje `smallRuins`; landmarki mają stabilne `EnvironmentPlacement.id` pochodne od `(seed, chunk, kind, ordinal)`.
- `chunkEnvironment.ts::landmarkChanceBias('smallRuins', ...)` już preferuje las, ale zwykłe `smallRuins` są losowym chunk contentem przez `SMALL_RUINS_CHANCE`; nie używać tego rolla jako gwarancji miejsca questowego.
- `src/world/locations/worldLocationTypes.ts` ma obecnie `WorldLocationKind = 'settlement' | 'cave' | 'cemetery' | 'lake' | 'mountainPeak'`; **ruin jeszcze nie ma**.
- world-012 utrzymuje rozdział: world-location identity/position jest deterministyczne, a player knowledge/navigation jest persisted w map state.
- `src/items/container.ts` daje `Container` oparty o zwykły `Inventory`; istniejące `PlacedContainers` reprezentują player storage, w tym placement/carry semantics.
- `src/fauna/AnimalSpawner.ts` ma `SpawnerType = 'wolfDen'` i lifecycle spawnera; `createFauna.ts` jest aktualnym ownerem tworzenia/rozmieszczenia dzikiej fauny i habitat spawnerów.
- `AnimalAgent.spawnPointId` wiąże zwierzę ze źródłem; spawner lifecycle/death accounting ma pozostać authoritative.
- quest system już obsługuje binding do realnych landmarków/spawnerów. Nie dodawać quest-owned pozycji ani fauna state.

## Decyzja architektoniczna: site istnieje przed questem

To jest najważniejszy invariant planu.

Nie implementować:

```text
Quest accepted
→ spawn ruins/chest/den
```

Implementować:

```text
world seed
→ resolveDarkForestTreasureSite()
→ stable site id + position
→ materialized ruins/chest/den when relevant world systems load

quest/map
→ reveal existing WorldLocation
```

Pozycja site nie powinna trafiać do save tylko po to, żeby była stabilna. Persistować wyłącznie mutable state.

## 1. Site resolver

Preferowany owner: `src/world/locations/` albo mały world-domain moduł wywoływany przez `WorldLocationCatalog`, nie `src/quests/`.

Resolver powinien:

- przyjmować world seed i istniejące pure terrain/biome samplers,
- generować bounded listę kandydatów z osobnego stałego salt/stream,
- oceniać `deepForest`, density, slope/water/road/settlement clearance,
- wybrać deterministycznie najlepszy poprawny kandydat,
- mieć jawny bounded fallback zamiast `while(true)`/global scan,
- zwracać stabilny site ID niezależny od quest progress.

Nie implementować selekcji przez `ChunkManager.getNearbyLandmarks()`: ta ścieżka działa na załadowanych chunkach i nie nadaje się do world-independent identity.

Jeżeli world-013/014/015 zmieniły katalog/cache przed implementacją, podpiąć resolver w ich finalny cache contract zamiast dodawać drugi indeks.

## 2. WorldLocationKind

Aktualny union w `src/world/locations/worldLocationTypes.ts` nie zna ruin.

Najmniejsze spójne rozszerzenie to generic `ruins` kind, nie `darkForestTreasureRuins`.

Po dodaniu kind przejrzeć:

- `WORLD_LOCATION_KINDS`,
- catalog `getById()` / enumerate/search paths,
- naming/weight assignment,
- map marker presentation/color/icon switch exhaustiveness,
- discovery filters i Near/Far Map candidate pools,
- tests world-location parsing/resolution.

Nie zakładać, że `smallRuins` automatycznie stają się wszystkimi `WorldLocation`: plan potrzebuje co najmniej tej jednej gwarantowanej większej lokacji. Globalne katalogowanie każdego proceduralnego `smallRuins` jest osobną decyzją i nie jest wymagane.

## 3. Większe ruiny

`src/terrain/chunkEnvironment.ts` / `settlement/props.ts` już definiują proceduralne `smallRuins` i ich render factory.

Preferuj reuse ich geometry/material primitives:

- nowy larger layout/variant może należeć do props/landmark renderer,
- nie zwiększaj `SMALL_RUINS_CHANCE`,
- nie próbuj wymusić konkretnego rolla chunk-environment przez manipulowanie RNG,
- site-specific placement powinien być jawnie generowany z site definition.

Jeżeli dodanie kolejnego `EnvironmentKind` byłoby potrzebne tylko do renderowania, rozważyć najpierw czy wystarcza parametryzowany ruin factory. `EnvironmentKind` jest również częścią interaction/landmark identity, więc nie rozszerzać union bez potrzeby.

## 4. Fizyczna skrzynia — reuse bez błędnego ownershipu

`PlacedContainers` są player-owned storage. Nie wrzucać generated treasure chest do tej kolekcji bez jawnego rozdzielenia semantyki, bo obecne call sites obejmują placement, carrying, encumbrance i player persistence.

Reuse, który jest pożądany:

- `Container` jako item owner,
- `Inventory` jako contents representation,
- istniejący container transfer UI,
- istniejący chest prop/model jeśli finalny codebase go udostępnia.

Nowy seam powinien być generic dla `world-generated containers`, np. registry/records z:

```text
stable container id
world position / source site id
Container
portable = false (lub równoważny ownership contract)
persisted mutable contents/state
```

Nazwa i kształt mają wynikać z aktualnego container architecture; nie tworzyć `QuestTreasureChestManager`.

Loot:

- generować deterministycznie z world seed + chest id,
- initial contents nie muszą być persistowane w całości, jeżeli można je odtworzyć czysto i persistować tylko depletion/delta,
- jeżeli istniejący `Inventory` serialization jest najprostszym poprawnym contractem, użyć go zamiast budowania custom loot format,
- po zabraniu przedmiotów save/load nie może odtworzyć initial payload.

Quest progress powinien obserwować world-container state/event. Nie grantować kopii lootu przez quest reward.

## 5. Multi-wolfDen identity

Current fauna ma rzeczywisty `wolfDen`, ale istniejący authored den historycznie używał stałego `WOLF_DEN_ID`.

Dla 009 potrzeba 2–3 stabilnych den związanych z jednym site. Implementator powinien sprawdzić finalny `AnimalSpawner.ts` i `createFauna.ts`:

- jeśli spawner model już wspiera dowolne stable IDs — użyć go bez nowego systemu,
- jeśli nadal istnieje singleton assumption — uogólnić identity minimalnie tak, aby `wolfDen:<siteId>:0..2` były normalnymi spawn-point IDs,
- zachować kompatybilność istniejącego `WOLF_DEN_ID` / starych questów i save data.

Każdy site den:

- jest normalnym `PreySpawner`/fauna spawnerem,
- ma `kind: wolf`, `type: wolfDen`,
- wykorzystuje istniejący population cap/respawn/depletion contract,
- tworzy wilki z poprawnym `spawnPointId`,
- jest rejestrowany w tej samej kolekcji/persistence co inne habitat spawners.

Nie dodawać tablicy wilków do quest state.

## 6. Placement wolfDen

Pozycje den wyznaczać po site center z osobnego deterministic streamu.

Guardrails:

- 2 albo 3 den zależnie od deterministic rolla,
- ring wokół ruin, nie wewnątrz footprintu,
- terrain/habitat fit przez te same helpers co zwykłe fauna placement,
- clearance od skrzyni/ruin, dróg, wody i siebie nawzajem,
- bounded candidate attempts + fallback,
- nie spawnuj den bezpośrednio w reakcji na quest activation.

Materialization ma wejść w istniejący fauna setup. Jeśli `createFauna()` jest settlement-relative i nie ma injection dla authored world habitat positions, dodać mały generic input contract (`additional habitat definitions` / podobny) zamiast importowania quest modułu do fauna.

## 7. Discovery i mapa jako wiedza

Map reveal powinien używać dokładnie tego samego `LocationKnowledge`/map state co world-012.

Nie dodawać `treasure_map` do `ItemKind` w V1.

Authored action powinien sprowadzać się do:

```text
revealLocation(site.locationId)
set/select navigation target
```

Jeżeli quest system nie ma injected capability do reveal world-location knowledge, dodać narrow callback dependency przy app wiring. `QuestManager` nie powinien importować map store/catalog bezpośrednio.

Early discovery:

- stage wejścia do ruin powinien sprawdzać aktualny authoritative knowledge/discovery state przy aktywacji/restore,
- nie opierać completion wyłącznie na przyszłym `location_discovered` event,
- analogicznie chest stage powinien sprawdzać już-opróżniony stan przy aktywacji.

## 8. Quest objective

Nie dodawać wolf kill objective.

Prawdopodobne minimalne rozszerzenia, zależnie od finalnego `QuestObjective` po 002–005:

```ts
{ type: 'discover_location'; locationId: string }
{ type: 'loot_world_container'; containerId: string }
```

Nazwy są kontraktem semantycznym, nie wymaganiem literalnego API.

Jeśli `discover_location` istnieje już po wcześniejszych planach, reuse.

`loot_world_container` powinno znaczyć „authored treasure payload został odebrany / container spełnia terminal loot state”, a nie samo otwarcie UI. Gracz może otworzyć skrzynię i nic nie zabrać — wtedy stage nie powinien fałszywie zakończyć się, jeśli plan/content wymaga zdobycia skarbu.

Implementację oprzeć o stable ID + world-state predicate/event, nie distance polling w `QuestManager.update()`.

## 9. Persistence blast radius

Sprawdzić finalny `src/persistence/saveData.ts` i save/load wiring.

Nowy mutable state najpewniej dotyczy tylko world-generated chest, jeśli multi-den identity mieści się w istniejącym spawn-point save model.

Wymagane invariants po restore:

- location position identyczna bez save field,
- player knowledge zachowane przez istniejące map persistence,
- chest contents/depletion zachowane exact-once,
- każdy den wraca z właściwym stable ID i lifecycle state,
- quest restore nie próbuje ponownie reveal/spawn world contentu.

Nie zwiększać save version automatycznie. Najpierw sprawdzić aktualne parser/defaulting rules i użyć optional/defaulted field, jeśli zgodne z obowiązującym persistence contract.

## 10. Ważne testy

Największą wartość mają testy invariants, nie snapshoty renderu:

- ten sam seed → ten sam site ID/position,
- różne seedy → sensownie różne site positions,
- site jest klasyfikowany jako `deepForest` albo używa jawnie przetestowanego fallbacku,
- resolver kończy pracę przy braku idealnego kandydata,
- chest i den IDs są stabilne,
- 2–3 den nie kolidują z ruin footprintem,
- early discovery przed questem jest respektowane,
- early chest loot przed questem jest respektowane,
- chest loot nie duplikuje się po restore/rebuild,
- destroyed/depleted den nie jest resetowany przez quest,
- reveal mapy jest idempotentny,
- istniejące `worldLocationKindFromId()`, mapy, `PlacedContainers`, fauna spawners i stare wolf quests nie regresują.

## Call sites do sprawdzenia przed implementacją

Poniższe pliki są zweryfikowanymi punktami wejścia z reconu; nie oznacza to, że każdy musi zostać zmieniony:

- `src/terrain/biomeRegions.ts`
- `src/terrain/chunkEnvironment.ts`
- `src/settlement/props.ts` / właściwy finalny ruin factory
- `src/world/locations/worldLocationTypes.ts`
- `src/world/locations/worldLocationCatalog.ts`
- world-012 knowledge/navigation owner i save wiring
- `src/items/container.ts`
- `src/items/createPlacedContainers.ts` lub finalny owner `PlacedContainers`
- `src/fauna/createFauna.ts`
- `src/fauna/AnimalSpawner.ts`
- `src/quests/quests.ts`
- `src/quests/QuestManager.ts`
- `src/app/createApp.ts`
- `src/persistence/saveData.ts`

Nie rób repository-wide refactoru przy okazji. Jeżeli finalny codebase ma już generic generated-world-content seam, użyć go i zredukować blast radius planu.

## Dokumentacja

Po implementacji zaktualizować canonical state docs dla:

- world locations / discovery,
- fauna, jeśli zmienia się multi-den identity,
- player/items, jeśli dochodzą generated world containers,
- quest/progression state.

Nie uruchamiać `pnpm docs:sync` ręcznie — workflow robi synchronizację automatycznie.

> **Zrób git commit i push do main, rebase jeżeli trzeba**