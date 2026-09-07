# Implementation Notes: quests-progression-009 — Mapa do skarbu — ruiny w ciemnym lesie

## Stan wejściowy

Recon wykonany na `main` 2026-09-07 przed implementacją planu.

Najważniejsze istniejące kontrakty:

- `src/terrain/biomeRegions.ts` — `forestDensityAt()` i `forestBiomeAt()` są czystymi, deterministycznymi samplerami; `deepForest` nie wymaga loaded chunks ani Three.js.
- `src/terrain/chunkEnvironment.ts` — `EnvironmentKind` zawiera `smallRuins`; `LandmarkKind` obejmuje `smallRuins`; landmarki mają stabilne `EnvironmentPlacement.id` pochodne od `(seed, chunk, kind, ordinal)`.
- `chunkEnvironment.ts::landmarkChanceBias('smallRuins', ...)` już preferuje las, ale zwykłe `smallRuins` są losowym chunk contentem przez `SMALL_RUINS_CHANCE`; nie używać tego rolla jako gwarancji miejsca questowego.
- `src/world/locations/worldLocationTypes.ts` ma obecnie `WorldLocationKind = 'settlement' | 'cave' | 'cemetery' | 'lake' | 'mountainPeak'`; **ruin jeszcze nie ma**.
- world-012 utrzymuje rozdział: world-location identity/position jest deterministyczne, a player knowledge/navigation jest persisted w map state.
- istniejące Near/Far Map ujawniają knowledge o istniejących locations; ich reveal logic jest pierwszym miejscem do reuse dla fizycznej treasure map.
- `src/items/container.ts` daje `Container` oparty o zwykły `Inventory`; istniejące `PlacedContainers` reprezentują player storage, w tym placement/carry semantics.
- `src/fauna/AnimalSpawner.ts` ma `SpawnerType = 'wolfDen'` i lifecycle spawnera; `createFauna.ts` jest aktualnym ownerem tworzenia/rozmieszczenia dzikiej fauny i habitat spawnerów.
- `AnimalAgent.spawnPointId` wiąże zwierzę ze źródłem; spawner lifecycle/death accounting ma pozostać authoritative.
- quest system już obsługuje binding do realnych landmarków/spawnerów. Nie dodawać quest-owned pozycji ani fauna state.

## Zamknięte decyzje planistyczne

Plan jest `planned`; poniższe decyzje nie są już otwartymi wariantami projektowymi:

1. Większe ruiny dostają **nowy generic `LandmarkKind` oraz nowy model/layout**, a nie tylko większy wariant `smallRuins`.
2. Skrzynia zawiera authored treasure payload **coins + jeden rubin**.
3. Early discovery i early loot są autorytatywne: jeśli gracz znajdzie ruiny lub opróżni skrzynię przed questem / przed odczytaniem mapy, późniejszy quest ma ten stan respektować i nie może respawnować contentu.
4. Questowe wolf den używają **normalnego istniejącego fauna lifecycle/recovery**; nie dodawać specjalnej permanentności dla 009.
5. Treasure map jest **fizycznym itemem**. Preferowany UX to akcja `Odczytaj`, która reuse ten sam location-knowledge reveal co istniejący zakup map, zamiast tworzyć drugi system odkrywania.

Dokładny seam dla `Odczytaj` trzeba potwierdzić na finalnym kodzie, ale jest to decyzja implementacyjna, nie blocker planu.

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

physical treasure map
→ Odczytaj
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

## 2. Nowy LandmarkKind i WorldLocationKind ruin

Aktualny `LandmarkKind` zna `smallRuins`, ale plan wymaga nowego semantycznego rodzaju większych ruin. Dodać generic ruins kind zgodny z aktualnym namingiem, np. `ruins`; nie używać nazwy quest-specific typu `darkForestTreasureRuins`.

Nowy kind powinien otrzymać własny model/layout. Można reuse materiały/geometrię/props primitives z `smallRuins`, ale identity oraz rendering contract mają być odrębne.

Aktualny union w `src/world/locations/worldLocationTypes.ts` nie zna ruin. Dodać odpowiadający generic `WorldLocationKind`, najlepiej tę samą nazwę semantyczną.

Po dodaniu kind przejrzeć:

- `EnvironmentKind` / `LandmarkKind` i miejsca exhaustive switch, jeśli finalna implementacja wymaga nowego `EnvironmentKind`,
- `WORLD_LOCATION_KINDS`,
- catalog `getById()` / enumerate/search paths,
- naming/weight assignment,
- map marker presentation/color/icon switch exhaustiveness,
- discovery filters i Near/Far Map candidate pools,
- tests world-location parsing/resolution.

Nie zakładać, że wszystkie proceduralne `smallRuins` automatycznie stają się `WorldLocation`. Plan potrzebuje co najmniej tej jednej gwarantowanej większej lokacji. Globalne katalogowanie każdego proceduralnego `smallRuins` jest poza zakresem.

## 3. Nowy model większych ruin

`src/terrain/chunkEnvironment.ts` / `settlement/props.ts` już definiują proceduralne `smallRuins` i ich render factory.

Dla 009:

- dodać nowy larger ruin model/layout,
- zachować normalny landmark rendering/materialization lifecycle,
- reuse istniejące geometry/material primitives tam, gdzie ma to sens,
- nie zwiększać `SMALL_RUINS_CHANCE`,
- nie próbować wymusić konkretnego rolla chunk-environment przez manipulowanie RNG,
- site-specific placement ma być jawnie generowany z site definition.

Jeżeli nowy `LandmarkKind` wymaga również nowego `EnvironmentKind`, dodać go spójnie i przejrzeć exhaustive switches. Nie tworzyć osobnego questowego renderer/scene graph.

## 4. Fizyczna treasure map i `Odczytaj`

Zmiana względem wcześniejszego draftu: treasure map ma być fizycznym itemem.

Najpierw prześledzić finalny flow zakupu `map_near` / `map_far` do miejsca, w którym aktualizowany jest `LocationKnowledge` / navigation. Celem nie jest skopiowanie logiki, tylko wydzielenie lub reuse minimalnej wspólnej capability:

```text
revealLocation(locationId)
set/select navigation target
```

Preferowany item contract:

```text
treasure map item
→ item action: Odczytaj
→ reveal existing ruins WorldLocation
→ optional/set navigation target
```

`Odczytaj` musi być idempotentne. Jeśli location jest już znana, nie duplikować knowledge entry; można jedynie ustawić/odświeżyć navigation zgodnie z istniejącym UX.

Nie dodawać quest-only minimap marker state i nie tworzyć world contentu podczas odczytu.

Jeśli current item architecture ma generic use/action registry, rozszerzyć ją. Jeśli nie, dodać najmniejszy reusable item action seam zamiast hardcodować treasure-map special case w `QuestManager`.

## 5. Fizyczna skrzynia — reuse bez błędnego ownershipu

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

Authored loot V1 jest zamknięty: **coins + jeden rubin**. Liczbę coins dobrać w authored content/config przy implementacji zgodnie z aktualną ekonomią/reward scale, bez zmiany typu nagrody.

Initial contents mogą być deterministycznie odtworzone z chest/site ID, ale po zabraniu payload save/load nie może odtworzyć initial contents. Jeżeli istniejący `Inventory` serialization jest najprostszym poprawnym contractem, użyć go zamiast budowania custom loot format.

Quest progress powinien obserwować world-container state/event. Nie grantować kopii lootu przez quest reward.

## 6. Multi-wolfDen identity i normalny lifecycle

Current fauna ma rzeczywisty `wolfDen`, ale istniejący authored den historycznie używał stałego `WOLF_DEN_ID`.

Dla 009 potrzeba 2–3 stabilnych den związanych z jednym site. Implementator powinien sprawdzić finalny `AnimalSpawner.ts` i `createFauna.ts`:

- jeśli spawner model już wspiera dowolne stable IDs — użyć go bez nowego systemu,
- jeśli nadal istnieje singleton assumption — uogólnić identity minimalnie tak, aby `wolfDen:<siteId>:0..2` były normalnymi spawn-point IDs,
- zachować kompatybilność istniejącego `WOLF_DEN_ID` / starych questów i save data.

Każdy site den:

- jest normalnym fauna spawnerem,
- ma `kind: wolf`, `type: wolfDen`,
- wykorzystuje istniejący population cap/respawn/depletion/recovery contract,
- tworzy wilki z poprawnym `spawnPointId`,
- jest rejestrowany w tej samej kolekcji/persistence co inne habitat spawners.

Nie dodawać specjalnego `permanentlyDestroyed` tylko dla 009 i nie dodawać tablicy wilków do quest state.

## 7. Placement wolfDen

Pozycje den wyznaczać po site center z osobnego deterministic streamu.

Guardrails:

- 2 albo 3 den zależnie od deterministic rolla,
- ring wokół ruin, nie wewnątrz footprintu,
- terrain/habitat fit przez te same helpers co zwykłe fauna placement,
- clearance od skrzyni/ruin, dróg, wody i siebie nawzajem,
- bounded candidate attempts + fallback,
- nie spawnuj den bezpośrednio w reakcji na quest activation.

Materialization ma wejść w istniejący fauna setup. Jeśli `createFauna()` jest settlement-relative i nie ma injection dla authored world habitat positions, dodać mały generic input contract (`additional habitat definitions` / podobny) zamiast importowania quest modułu do fauna.

## 8. Quest objectives i early-state semantics

Nie dodawać wolf kill objective.

Prawdopodobne minimalne rozszerzenia, zależnie od finalnego `QuestObjective` po 002–005:

```ts
{ type: 'read_item'; itemId: string }
{ type: 'discover_location'; locationId: string }
{ type: 'loot_world_container'; containerId: string }
```

Nazwy są kontraktem semantycznym, nie wymaganiem literalnego API.

`loot_world_container` powinno znaczyć „authored treasure payload został odebrany / container spełnia terminal loot state”, a nie samo otwarcie UI. Gracz może otworzyć skrzynię i nic nie zabrać — wtedy stage nie powinien fałszywie zakończyć się.

Early discovery i early loot są authoritative:

- stage discovery przy aktywacji/restore sprawdza aktualny knowledge state,
- stage loot przy aktywacji/restore sprawdza aktualny chest state,
- nie polegać wyłącznie na przyszłych eventach,
- nie wymagać ponownego `Odczytaj` ani ponownego otwarcia skrzyni, jeśli world state już spełnia warunek,
- nigdy nie respawnować loot w celu „naprawienia” progresu.

Implementację oprzeć o stable ID + world-state predicate/event, nie distance polling w `QuestManager.update()`.

## 9. Persistence blast radius

Sprawdzić finalny `src/persistence/saveData.ts` i save/load wiring.

Nowy mutable state najpewniej dotyczy world-generated chest oraz ewentualnego item/action state, jeśli treasure map wymaga czegoś ponad zwykłe inventory persistence. Multi-den identity powinno użyć istniejącego spawn-point save modelu.

Wymagane invariants po restore:

- location position identyczna bez save field,
- player knowledge zachowane przez istniejące map persistence,
- chest contents/depletion zachowane exact-once,
- każdy den wraca z właściwym stable ID i zwykłym lifecycle state,
- fizyczna mapa zachowuje się jak zwykły persisted item,
- ponowne `Odczytaj` jest bezpieczne,
- quest restore nie próbuje ponownie reveal/spawn world contentu.

Nie zwiększać save version automatycznie. Najpierw sprawdzić aktualne parser/defaulting rules i użyć optional/defaulted field, jeśli zgodne z obowiązującym persistence contract.

## 10. Ważne testy

Największą wartość mają testy invariants, nie snapshoty renderu:

- ten sam seed → ten sam site ID/position,
- różne seedy → sensownie różne site positions,
- site jest klasyfikowany jako `deepForest` albo używa jawnie przetestowanego fallbacku,
- resolver kończy pracę przy braku idealnego kandydata,
- nowy ruins `LandmarkKind` i odpowiadający `WorldLocationKind` resolvują się poprawnie,
- chest i den IDs są stabilne,
- 2–3 den nie kolidują z ruin footprintem,
- early discovery przed questem jest respektowane,
- early chest loot przed questem / przed `Odczytaj` jest respektowane,
- chest payload `coins + ruby` nie duplikuje się po restore/rebuild,
- den używają zwykłego fauna lifecycle i nie są resetowane przez quest,
- `Odczytaj` reveal jest idempotentny,
- fizyczna treasure map reuse wspólny location-knowledge reveal zamiast drugiego store,
- istniejące `worldLocationKindFromId()`, mapy, `PlacedContainers`, fauna spawners i stare wolf quests nie regresują.

## Call sites do sprawdzenia przed implementacją

Poniższe pliki są zweryfikowanymi punktami wejścia z reconu; nie oznacza to, że każdy musi zostać zmieniony:

- `src/terrain/biomeRegions.ts`
- `src/terrain/chunkEnvironment.ts`
- `src/settlement/props.ts` / właściwy finalny ruin factory/model owner
- `src/world/locations/worldLocationTypes.ts`
- `src/world/locations/worldLocationCatalog.ts`
- world-012 knowledge/navigation owner i save wiring
- `src/items/container.ts`
- `src/items/createPlacedContainers.ts` lub finalny owner `PlacedContainers`
- item definitions/action registry oraz `map_near` / `map_far` purchase/reveal call sites
- `src/fauna/createFauna.ts`
- `src/fauna/AnimalSpawner.ts`
- `src/quests/quests.ts`
- `src/quests/QuestManager.ts`
- `src/app/createApp.ts`
- `src/persistence/saveData.ts`

Nie rób repository-wide refactoru przy okazji. Jeżeli finalny codebase ma już generic generated-world-content albo generic item-action seam, użyć go i zredukować blast radius planu.

## Dokumentacja

Po implementacji zaktualizować canonical state docs dla:

- world locations / discovery,
- landmarks/world terrain dla nowego ruins kind/model,
- fauna, jeśli zmienia się multi-den identity,
- player/items, jeśli dochodzą generated world containers lub reusable item action,
- quest/progression state.

Nie uruchamiać `pnpm docs:sync` ręcznie — workflow robi synchronizację automatycznie.

> **Zrób git commit i push do main, rebase jeżeli trzeba**