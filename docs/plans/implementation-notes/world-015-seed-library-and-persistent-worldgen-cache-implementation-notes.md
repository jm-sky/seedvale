# Implementation Notes: Seed Library and persistent worldgen cache

**Reviewed:** 2026-09-05  
**Plan:** `world-014-seed-library-and-persistent-worldgen-cache.md`

## Review conclusion

Plan pasuje do aktualnej architektury, ale są dwa istotne fakty z code recon:

1. `world-013` jest już zaimplementowany na `main`: `WorldLocationCatalog` ma lazy runtime coarse-tile cache (`Uint8Array` + `Float32Array`), `landmarksInRange()` oraz wspólny lightweight classifier oparty bezpośrednio o `sampleFloorAt` / `sampleContinentalnessAt` / `sampleMountainRidgeAt` / `sampleHeightAt` i shared `terrainClassification.ts` helpers. `world-014` ma ten cache rozszerzyć o persistence, nie tworzyć drugiej reprezentacji coarse terrain.
2. Nie istnieje obecnie osobny "lekki discovery resolver" zwracający lokacje bez sampling. `locationDiscovery.landmarksInBand()` deleguje wprost do `WorldLocationCatalog.landmarksInRange()`, które może materializować brakujące coarse cells. Dlatego generator nazwy/profilu seeda **nie może po prostu wywołać mechanizmu mapy**. Może reuse'ować już dostępne dane/cache albo shared tanie classification primitives, ale nie może uruchamiać `landmarksInRange()` tylko po to, by nazwać seed.

Najważniejsza granica implementacyjna: Seed Library metadata, save state i persistent derived cache to trzy różne ownershipy.

Persistent cache ma być **inkrementalny i narastający wraz z normalnym używaniem świata**. Nie ograniczać go do initial state/startowego regionu. Jeżeli gameplay, mapa kupiona u handlarza albo inne prawidłowe query naturalnie policzy dalszą deterministyczną geografię lub landmarki, wynik powinien móc zostać zapisany do persistent cache i użyty w kolejnych sesjach/save'ach tego samego seeda. Sam persistence layer nigdy nie może jednak inicjować dodatkowego world scan tylko po to, aby zapełnić cache.

## 1. Persistence: obecna baza jest save-specific

`src/persistence/saveDb.ts` obecnie posiada:

```text
DB_NAME = 'seedvale'
DB_VERSION = 1
STORE_NAME = 'saves'
```

`openDb()` tworzy tylko store `saves`, a helpery `storeGet/storePut/storeDelete/storeGetAll` są na stałe związane z tym store. Nie dokładać seedów przez prefiksy kluczy w `saves`, bo `readAllSlots()` iteruje cały store i interpretuje każdy row jako save envelope.

Najmniejszy spójny refactor to wydzielić współdzielony IndexedDB open/upgrade seam i podnieść `DB_VERSION`, tworząc osobne stores `seeds` i `worldgenCache`. Save API (`readSave`, `writeSave`, `listSaves...`) powinno zachować dotychczasowy kontrakt i dalej operować wyłącznie na `saves`.

Nie wymaga to migracji istniejących save rows: `onupgradeneeded` ma tylko dodać nowe stores, pozostawiając `saves` nietknięte.

Warto rozważyć mały `src/persistence/db.ts` / `seedDb.ts` zamiast rozbudowywania `saveDb.ts` w ogólny God Object. `saveDb.ts` powinien pozostać właścicielem save-slot semantics, nie Seed Library.

## 2. Seed identity vs SaveData

`src/persistence/saveData.ts` już zapisuje seed w `SaveConfig.seed`. Nie zastępować tego `seedRecordId` ani nie uzależniać możliwości load save'a od obecności rekordu Seed Library.

To ważne dla backward compatibility i odporności na cleanup/corruption:

```text
SaveData.config.seed = authoritative world identity for that save
SeedRecord          = optional/manageable catalog metadata for the same number
worldgenCache       = disposable optimization
```

Jeżeli istniejący save wskazuje seed bez `SeedRecord` (wszystkie stare save'y będą takim przypadkiem), Seed Library powinna umieć lazy/backfill utworzyć minimalny rekord bez przebudowy save'a i bez world scan.

Nie zmieniać `SaveData` schema tylko po to, aby dodać Seed Library, chyba że podczas implementacji pojawi się rzeczywista informacja per-save, której nie da się wyprowadzić z istniejącego `config.seed`.

## 3. New Game lifecycle — dwa entrypointy, które trzeba spiąć

Boot flow jest w `src/main.ts` + `src/ui/createStartScreen.ts` + `src/ui-vue/screens/StartScreen.vue`.

Aktualnie `StartScreenChoice` dla nowej gry ma tylko:

```ts
{ type: 'new', name: string }
```

`main.ts` robi `beginNewSave(choice.name)` i uruchamia `createApp(..., { newGame: true })`.

Drugi istotny flow jest już wewnątrz uruchomionej aplikacji: `src/app/createApp.ts` obsługuje New Game transition i obecnie jawnie robi `config.seed = randomSeed()` przed `rebuildWorld(true)`.

Nie poprawiać tylko boot StartScreen. Wybór seeda musi być wspólnym intentem dla obu ścieżek New Game, inaczej New Game z pause/save-management nadal będzie losował seed po staremu.

Preferować mały jawny typ/intent, np. resolved seed number przekazany do lifecycle New Game, zamiast globalnego mutable `pendingSeed`. `beginNewSave()` już posiada procesowy `pendingNewSaveName`, ale dokładanie tam kolejnych niezależnych pól zwiększa ukryty coupling.

`rebuildWorld(true)` pozostaje właścicielem resetu dynamicznego state. Reuse seeda nie może omijać tego resetu.

## 4. StartScreen jest osobną krótkotrwałą aplikacją Vue

`src/ui/createStartScreen.ts` dynamicznie montuje `src/ui-vue/screens/StartScreen.vue`; to nie jest główny in-game `App.vue`.

Seed list/selection potrzebne do New Game powinny być załadowane przed `createStartScreen(...)` i przekazane jako props/data, podobnie jak save management entries. Nie wykonywać IndexedDB reads ani worldgen z render/computed funkcji Vue.

`StartScreen.vue` ma już lokalny formularz New Game i walidację save name. To naturalny punkt na selector istniejącego seeda + jawne "Wygeneruj nowy seed".

Uwaga na przypadek `initialManagement.entries.length === 0`: `main.ts` obecnie omija StartScreen i od razu uruchamia `createApp(container)`. Jeśli pierwszy seed ma być świadomie widoczny/zarządzalny już przy pierwszej grze, ten shortcut trzeba rozstrzygnąć jawnie. Najprostsza zgodna opcja: pierwszy boot tworzy minimalny SeedRecord dla wybranego/losowego seeda bez otwierania management UI; późniejsze New Game pokazuje bibliotekę. Nie dodawać ciężkiej generacji do first-boot path.

## 5. Seed management screen — reuse UI conventions, nie world runtime

Boot `StartScreen.vue` już prezentuje save management i jest najbliższym istniejącym UI patternem dla listy zarządzalnych rekordów. Seed management może być osobnym krótkotrwałym ekranem/dialogiem otwieranym z main menu/start screen, zamiast wciskać cały CRUD do in-game world bundle.

Seed management potrzebuje wyłącznie persistence API + policzone metadata:

- list/read/update SeedRecord,
- count/reference informacji z healthy saves,
- clear cache,
- guarded delete.

Nie powinien potrzebować `WorldLocationCatalog`, `ChunkManager`, `WorldBundle` ani `createApp` tylko do renderowania listy.

Liczbę save'ów używających seeda można wyprowadzić z istniejących healthy `SaveSlotInfo.seed`; nie utrzymywać osobnego mutable `saveIds[]` w SeedRecord.

## 6. Generated profile/name: nie używać `landmarksInRange()`

Aktualny `src/world/locations/locationDiscovery.ts` nie ma specjalnego zero-cost discovery API. `landmarksInBand()` jest tylko wrapperem na `catalog.landmarksInRange()`. To API jest zoptymalizowane przez `world-013`, ale nadal proceduralnie sampluje brakujące coarse cells.

Dlatego Seed Library nie może robić:

```text
create/list SeedRecord
→ landmarksInRange(...)
→ coarseCellAt(...)
→ procedural sampling
```

ani wywoływać `nearestSettlements()` / cemetery lookup, jeżeli wymagałoby to materializacji danych tylko dla nazwy.

Do generated name/profile użyć jednej z dwóch bezpiecznych klas danych:

1. **cheap startup-local facts**, które normalny New Game i tak musi policzyć dla świata startowego; albo
2. **already-materialized facts**, które runtime cache udostępnia bez sampling.

Jeżeli implementacja potrzebuje dostępu do drugiej kategorii, dodać do `WorldLocationCatalog` read-only/non-materializing seam zamiast używać `coarseCellAt()`. Taki seam musi zwracać "unknown/not cached" dla brakującej komórki i nigdy nie wywoływać `classifyCoarseCell()`.

Nie wystawiać mutable typed arrays z katalogu. API powinno zachować ownership cache po stronie `WorldLocationCatalog`.

Generated name może być prosty. Brak danych jest prawidłowym stanem i nie uzasadnia dodatkowego scan.

## 7. `world-013` cache: aktualny konkretny kształt

W `src/world/locations/worldLocationCatalog.ts` runtime cache wygląda obecnie tak:

```text
Map<"tx,tz", {
  state: Uint8Array(LOCATION_TILE_CELLS²)
  height: Float32Array(LOCATION_TILE_CELLS²)
}>
```

`LOCATION_TILE_CELLS = 16`; komórki są materializowane lazy. `CELL_UNKNOWN = 0`, a `coarseCellAt()` jest jedynym seamem, który klasyfikuje/cache'uje coarse cell.

To jest właściwa reprezentacja do persistent integration. Nie tworzyć osobnego per-cell object cache.

Najczystszy integration point jest przy lifecycle tile/cache:

```text
get tile
→ hydrate persisted tile state if available
→ coarseCellAt reads hydrated bytes
→ newly sampled cells mark tile dirty
→ debounce/batch dirty tiles
→ async upsert outside critical scan path
```

Trzeba zachować lazy-cell semantics: tile może być częściowo unknown. Persistent payload musi round-tripować `CELL_UNKNOWN`, `state` i mountain `height` bez udawania, że cały 16×16 tile został policzony.

To oznacza również, że persistent cache nie jest snapshotem initial state. Jeżeli początkowo tile zawiera 20 policzonych komórek, a późniejszy gameplay policzy następnych 30, ten sam persistent record powinien zostać zaktualizowany do bogatszego partial tile. Nie zapisywać po każdej komórce; markować tile jako dirty i batchować/debounce'ować upsert.

## 8. Persistent cache key musi uwzględnić terrain inputs, nie tylko seed

`WorldLocationCatalogDeps` czyta na bieżąco `getSeed()` oraz `getSampleParams()`. `invalidateScanCache()` jest obecnie wołane po world rebuild, ponieważ zmiana seed **lub terrain params** może unieważnić runtime cache.

Persistent namespace key nie może więc być tylko:

```text
seed / locations-coarse / version / tile
```

Jeżeli `WorldConfig.terrain` zawiera ustawienia wpływające na `RawSampleParams`, klucz/fingerprint musi obejmować wszystkie relevant deterministic sampling inputs albo używać stabilnego worldgen/config fingerprint. W przeciwnym razie dwa światy z tym samym seedem, ale inną terrain config, mogą błędnie współdzielić coarse bytes.

Nie używać `JSON.stringify(config)` bez jawnego kontraktu. Zdefiniować mały stabilny fingerprint dokładnie z inputs, które wpływają na ten namespace, i versionować namespace przy zmianie algorytmu/shape.

Ta sama zasada dotyczy późniejszych namespaces dla deterministycznych landmarków: cache może być współdzielony między save'ami tylko wtedy, gdy klucz obejmuje wszystkie inputs wpływające na ich identity/position/type/name.

## 9. Async IndexedDB vs synchroniczny katalog — główna integracyjna pułapka

`WorldLocationCatalog.landmarksInRange()` jest synchroniczne. IndexedDB jest asynchroniczne.

Nie zmieniać całego catalog/discovery API na async tylko dla persistent cache — rozlałoby to async przez merchant, guard i inne gameplay flows.

Preferowany lifecycle:

```text
world/seed activation
→ async hydrate known relevant persisted cache into runtime catalog
→ normal synchronous catalog queries
→ misses still sample synchronously as today
→ newly computed deterministic data marks tile/record dirty
→ dirty records scheduled for batched async persistence
```

Hydration nie może blokować first paint ani New Game tylko po to, aby mieć cache. Jeżeli cache nie jest gotowy, correctness fallback to obecny procedural sampling.

Unikać race, w którym spóźniony hydrate starego seeda zapisze dane do katalogu już po `rebuildWorld()` na nowy seed. Każdy async load/write musi być związany z world/cache identity (seed + fingerprint + namespace version) i przed apply potwierdzić, że identity nadal jest aktywne.

Zapis cache ma być session-accumulating: dane policzone później w tej samej sesji lub w kolejnych sesjach powinny wzbogacać persistent cache. Persistence nie może jednak wymuszać policzenia brakujących komórek/regionów.

## 10. `invalidateScanCache()` zmienia znaczenie przy persistence

Obecnie `invalidateScanCache()` robi runtime reset przy rebuildzie. Po world-014 nie może automatycznie oznaczać "usuń persistent cache".

Rozdzielić semantics:

```text
invalidate runtime/hydrated cache for active catalog
≠
clear persistent cache requested by user/version cleanup
```

Zachować istniejące `invalidateScanCache()` jako tani lifecycle reset katalogu. Seed management `Clear cache` powinien iść przez osobne persistence API i — jeśli czyszczony seed jest aktualnie aktywny — również jawnie invalidować jego runtime cache.

## 11. Deterministyczne landmarks jako persistent derived data

Landmarki wyliczone przez normalne gameplay/map queries są kandydatem do persistent cache, jeżeli ich identity jest w pełni deterministyczne z seeda i jawnie fingerprintowanych worldgen inputs.

Istotny przypadek:

```text
merchant map purchase
→ applyLocationMap / normal location query
→ policzenie brakującej geografii/coarse cells/landmarks
→ wynik użyty do discovery w bieżącym save
→ deterministic derived result trafia do runtime cache
→ async persistence dla seeda
```

Przy kolejnym save na tym samym seedzie lub kolejnej sesji deterministic result może zostać hydrated/reuse'owany bez ponownego kosztownego liczenia.

Twarda granica ownership:

```text
deterministic landmark existence / id / position / type / deterministic name
    = seed/worldgen derived cache, możliwy do współdzielenia

LocationKnowledge / MapDiscovery / revealed state / navigation target
    = mutable per-save player state, nigdy nie współdzielić
```

Persistent landmark cache nie oznacza, że landmark jest odkryty przez gracza. Save B może użyć cached geometry/location result z Save A, ale dopóki jego własny gameplay/map purchase nie wykona odpowiedniego reveal, `LocationKnowledge` pozostaje niezmienione.

Nie wykonywać proactive landmark scan w celu zapełnienia cache. Cache landmarków powstaje wyłącznie jako efekt query, które normalny gameplay i tak musiał wykonać.

Nie zakładać jednego monolitycznego `WorldLocation[]` cache dla wszystkich query. Podczas implementacji wybrać stabilną reprezentację/namespace zgodną z faktycznym ownership `WorldLocationCatalog`; jeżeli coarse cells wystarczają do taniego odtworzenia landmarków, nie duplikować danych. Osobny landmark namespace ma sens tylko dla wyników, których ponowne wyprowadzenie z coarse cache nadal jest mierzalnie kosztowne albo których stabilna reprezentacja jest niezależna.

## 12. Cemetery cache nie jest dobrym pierwszym persistent payloadem

`world-013` ma również `cemeteryCache: Map<settlementId, WorldLocation | null>`. Nie persistować go automatycznie razem z coarse terrain w pierwszej iteracji.

Cemetery lookup zależy od `ChunkManager.findLandmarkNear()` i settlement/chunk-generation identity, a jego invalidation fingerprint jest szerszy niż prostego coarse classifiera. Plan mówi, aby persistence dodawać tam, gdzie istnieje stabilna reprezentacja i zmierzony koszt — zacząć od coarse tiles oraz deterministycznych location results faktycznie potrzebnych przez map queries.

Można rozszerzyć namespace później osobno, z własną wersją/fingerprintiem.

## 13. SeedRecord validation i backward compatibility

Nie wkładać do IndexedDB surowych niezwalidowanych obiektów UI. Dodać mały parser/type guard dla `SeedRecord`, podobnie jak persistence warstwa chroni `SaveData`/save envelopes.

Przy uszkodzonym SeedRecord:

- nie blokować load save'a,
- nie usuwać automatycznie save'a,
- można odtworzyć minimalne metadata z `SaveData.config.seed`,
- user metadata z uszkodzonego rekordu nie zgadywać.

Dla istniejących save'ów Seed Library powinna wykrywać unikalne `SaveSlotInfo.seed` i lazy zapewniać rekordy. Nie robić jednorazowego world generation migration.

## 14. Seed deletion

Ponieważ save przechowuje własny `config.seed`, technicznie usunięcie SeedRecord nie niszczy danych save'a, ale semantycznie biblioteka powinna chronić referencjonowane rekordy.

Guard powinien być liczony z aktualnych save slots przy operacji delete, nie z cached `saveCount` w SeedRecord.

`Clear cache` może działać niezależnie od save references.

`Delete seed` dla nieużywanego seeda powinien usuwać SeedRecord i jego persistent cache namespaces. Nie usuwać save'ów kaskadowo.

## 15. Cache cleanup

Nie budować pełnego quota managera. W persistence record cache warto jednak od początku mieć wystarczające metadata do bounded cleanup, np. namespace/key, seed/fingerprint, `lastAccessedAt` i payload byte estimate jeśli tani do policzenia.

Cleanup musi działać po cache records, nie po SeedRecord. Seed metadata są małe i nie są disposable.

Nie aktualizować `lastAccessedAt` synchronously przy każdym coarse-cell hit — to zamieni tani runtime cache hit w storage churn. Aktualizować co najwyżej per hydrate/tile persistence/session w sposób batchowany.

Ponieważ cache rośnie wraz z naturalnym eksplorowaniem/liczeniem dalszej geografii, bounded cleanup jest ważniejszy niż przy cache ograniczonym do initial state. Nadal nie budować skomplikowanego quota managera bez pomiarów.

## 16. Tests — gdzie je osadzić

Istniejące testy `src/world/locations/worldLocationCatalog.test.ts` są właściwym miejscem dla:

- hydration payload == cold sampled result,
- partial tile z `CELL_UNKNOWN`,
- późniejsze sampling wzbogaca istniejący partial tile zamiast zastępować/psuć dane,
- dirty tile persistence jest batchowana i nie wymaga zapisu per cell,
- persistent/warm/cold parity,
- deterministic landmark result parity po hydrate,
- cached landmark nie zmienia `LocationKnowledge` ani `MapDiscovery`,
- no-materialize read seam dla profilu,
- stale async hydration ignored after world identity change.

Dla nowego seed persistence dodać osobne testy obok persistence modułu:

- IndexedDB v1 → v2 upgrade zachowuje `saves`,
- SeedRecord CRUD/validation,
- lazy backfill z istniejących save seedów,
- clear cache nie dotyka seed metadata/save rows,
- delete guard oparty o realne save references,
- namespace/version/fingerprint isolation,
- cache seeda A nie trafia do seeda B,
- cache zapisany przez Save A na wspólnym seedzie może być reuse'owany przez Save B bez przenoszenia mutable discovery state.

Dodać scenariusz integracyjny odpowiadający realnemu problemowi mapy:

```text
cold seed
→ merchant map query materializuje dalsze deterministic locations
→ cache write
→ nowa sesja/save na tym samym seedzie
→ hydrate
→ ten sam map/location query zwraca identyczny wynik z mniejszym kosztem
```

`StartScreen.vue`/start-flow testy powinny sprawdzić przede wszystkim przekazanie wybranego seeda do New Game intent; nie testować worldgen przez komponent Vue.

## 17. Zalecana kolejność implementacji

1. Wydzielić shared IndexedDB open/upgrade seam i dodać `seeds` + `worldgenCache`, zachowując obecne save API i dane.
2. Dodać `SeedRecord` persistence/validation oraz lazy backfill z istniejących healthy saves.
3. Rozszerzyć New Game intent i oba entrypointy (boot StartScreen + in-app New Game), bez jeszcze persistent worldgen cache.
4. Dodać Seed Library management UI pracujące wyłącznie na metadata/persistence.
5. Dodać tani generated profile/name z jednoznaczną zasadą "no new sampling"; w razie potrzeby dodać read-only non-materializing seam do istniejącego runtime cache.
6. Zdefiniować `locations-coarse` persistent payload, namespace version i terrain-input fingerprint.
7. Dodać async hydrate + inkrementalny dirty-write lifecycle wokół istniejących 16×16 coarse tiles, z partial-tile semantics, batching/debounce i generation/identity guard przeciw stale async apply.
8. Podłączyć naturalne dalsze materializowanie geografii do tego samego dirty-write lifecycle; nie ograniczać persistence do initial/startup state.
9. Zweryfikować map/merchant query path i persistować deterministyczne landmark results tylko tam, gdzie nie dubluje to wystarczającego coarse cache; zachować `LocationKnowledge`/`MapDiscovery` wyłącznie per-save.
10. Dodać `Clear cache` i prosty bounded cleanup.
11. Zebrać browser measurements: first seed, repeated New Game on same seed, cold/warm merchant map query, cold/warm location query oraz IndexedDB payload/write cost.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji działa w GitHub workflow.

Browser/gameplay verification wykonuje użytkownik.