# Implementation Notes: World Locations, Discovery and Map Navigation

**Reviewed:** 2026-09-03  
**Plan:** `world-012-world-locations-discovery-and-map-navigation.md`

## Review conclusion

Plan kierunkowo pasuje do obecnej architektury mapy, ale kilka założeń planu nie odpowiada już kodowi. Najważniejsze: obecna mapa **nie ma jeszcze location knowledge**; `MapKnownLocation` jest tylko projekcją settlementów wynikającą z `MapDiscovery`. Ponadto obecne dane jezior nie mają globalnej/stabilnej tożsamości, a proceduralne landmarki są obecnie generowane chunkowo.

Implementację oprzeć na istniejącej mapie i istniejących generatorach, ale nie próbować udawać, że te systemy już dostarczają globalny katalog `WorldLocation`.

## 1. Istniejąca mapa — wykorzystać, nie przebudowywać

Aktualny przepływ:

````
MapDiscovery
  → discoveredCells

MapProjection
  → MapCellData

MapData
  → queryCells()
  → knownLocations()

drawWorldMapFrame()
drawMinimapFrame()
````

Istotne pliki:

- `src/world/map/mapTypes.ts`
- `src/world/map/mapData.ts`
- `src/world/map/mapDiscovery.ts`
- `src/world/map/mapProjection.ts`
- `src/world/map/mapConfig.ts`
- `src/ui-vue/lib/drawMap.ts`
- `src/ui-vue/lib/drawMinimap.ts`
- `src/ui-vue/screens/WorldMapScreen.vue`

`MapDiscovery` ma pozostać wyłącznie Fog of War komórek.

Obecne `MapData.knownLocations()` automatycznie pokazuje settlement, jeśli jego komórka jest odkryta. To właśnie należy usunąć/zastąpić location-knowledge query — nie rozszerzać tej funkcji o drugi warunek typu `discoveredCells OR discoveredLocations`.

## 2. WorldLocation powinien być katalogiem danych, nie UI

Wprowadzić jeden wspólny katalog/registry lokacji, którego dane są czyste i niezależne od Three.js/Vue.

Preferowany przepływ:

````
deterministic world sources
        ↓
WorldLocation[]
        ↓
location knowledge
        ↓
MapData
        ↓
full map / minimap / discovery UI
````

Nie wkładać `discovered`, targetów ani stanu UI do `WorldLocation`. To są osobne warstwy.

Nie tworzyć osobnych registry dla cave/lake/cemetery/peak.

`MapKnownLocation` powinien stać się projekcją danych `WorldLocation + LocationKnowledge`, a nie drugim źródłem prawdy.

## 3. Ważna rozbieżność: jeziora nie mają obecnie globalnego ID

`src/terrain/waterBodies.ts` ma:

````
WaterBody {
  id
  cellCount
  worldArea
}
````

ale `id` jest **lokalne dla jednego chunkowego flood-filla**. To nie jest stabilne ID jeziora w świecie. Jedno jezioro może więc mieć inne `body.id` w różnych chunkach.

Nie używać tego `id` jako `WorldLocation.id`.

Przed implementacją `lake` trzeba stworzyć lekką, deterministyczną reprezentację globalnego jeziora albo stabilny sposób wyznaczenia jego reprezentanta/ID. Nie tworzyć jednak drugiego systemu hydrologii ani globalnej wersji `detectWaterBodies()` używanej przez renderowanie.

Render/woda nadal powinny korzystać z istniejącego:

- `terrain/waterBodies.ts`,
- `ChunkManager`,
- istniejącego `WaterSource`/shore detection.

## 4. Procedural landmarks też wymagają globalnego katalogowania

`src/terrain/chunkEnvironment.ts` już daje stabilne ID dla:

- `monolith`,
- `stoneCircle`,
- `smallRuins`,
- `cemetery`.

Ale plan 012 potrzebuje tylko `cemetery` w pierwszej wersji.

Obecne landmarki są generowane przy tworzeniu chunk environment. Nie zakładać, że wszystkie są aktualnie dostępne w pamięci — far map musi móc znaleźć lokacje poza aktualnie załadowanymi chunkami.

Dla `cemetery` szczególnie ważne są istniejące ograniczenia:

- village fringe,
- clearing exclusion,
- road clearance,
- deterministyczny cemetery size.

Nie tworzyć uproszczonego drugiego algorytmu, który może wskazać cmentarz w innym miejscu niż fizyczny landmark.

Najlepiej wydzielić/reużyć istniejącą deterministyczną logikę placementu tak, aby katalog lokacji i rzeczywiste `EnvironmentPlacement` miały ten sam wynik.

## 5. Cave jest już dużo lepiej przygotowana

Aktualny `src/world/createCaves.ts` tworzy deterministyczne `CaveDefinition[]` przez `generateCaveDefinitions()`.

`CaveDefinition` ma stabilne `caveId` i entrance. To jest właściwe źródło dla:

````
WorldLocation(kind='cave')
  id       = caveId
  position = entrance
````

Nie analizować meshów jaskiń ani aktywnych cave runtime objects.

Katalog lokacji powinien używać definicji, nie `CaveRuntime`.

## 6. Settlementy

Settlement ma już stabilne:

- `SettlementDef.id`,
- `x/z`,
- `name`.

Źródło powinno pozostać `SettlementsManager` / `SettlementDef`, a nie UI ani załadowane settlement objects.

To jest istotne, ponieważ settlementy są streamowane. Far map nie może zależeć od tego, czy settlement jest obecnie aktywny.

Obecna funkcja `MapData` korzysta z `peekDef({ gx, gz })`; zachować ten deterministyczny model lookupu zamiast skanować aktywne settlementy.

## 7. Mountain peaks

Nie istnieje obecnie reprezentacja konkretnego szczytu jako world object.

Nie próbować robić peaków z aktualnych meshów gór ani z najwyższego punktu każdego chunka.

Potrzebny jest deterministyczny generator konkretnych peak locations oparty o istniejące sampling/region data. ID/nazwa/pozycja muszą być niezależne od kolejności ładowania chunków.

Jeżeli fizyczny marker szczytu jest dodawany w tym planie, powinien korzystać z tego samego `WorldLocation`, ale rendering pozostaje warstwą world/terrain.

## 8. Location knowledge — nowa warstwa obok MapDiscovery

Aktualne:

````
SaveMap = { discoveredCells: string[] }
````

jest wystarczające dla Fog of War, ale nie dla planu 012.

Dodać osobny stan, np. logicznie:

````
discoveredLocations: ...
````

Powinien przechowywać wyłącznie sparse knowledge keyed by stable location ID.

Nie zapisywać:

- nazw,
- pozycji,
- discovery weight,
- procedural layout.

Te dane wynikają z seed + location ID / generatora.

Stan `estimated → discovered → confirmed` powinien należeć do knowledge, nie do `WorldLocation`.

## 9. Persistence — obecny schema jest v1 i jest versionowany

`src/persistence/saveData.ts` jest obecnie jedynym właścicielem schematu, a `CURRENT_SAVE_VERSION = 1`.

Zmiana `SaveMap` wymaga aktualizacji wersji i migracji zgodnie z persistence-003. Nie dodawać pola „po cichu” przy pozostawieniu walidatora na v1.

Wykorzystać istniejący:

- `src/persistence/saveData.ts`,
- `src/app/saveState.ts`,
- migrację `v1 → v2` w obecnym pipeline.

`src/app/createApp.ts` powinno otrzymywać już zwalidowany/migrowany `SaveData`; nie implementować migracji w map systemie.

## 10. Discovery sources

Aktualny `MapSource` już zawiera:

````
'exploration' | 'npc' | 'book' | 'map'
````

Plan używa `map`, więc nie dodawać równoległego `book` tylko dlatego, że typ historycznie je zawiera.

Dla tego planu:

- NPC → `npc`,
- purchased map → `map`,
- physical confirmation → `exploration`.

Jeżeli `book` nie jest używane, nie trzeba go teraz usuwać — to osobny cleanup.

## 11. Strażnik — wykorzystać istniejący dialogue v2

Aktualny NPC dialogue to `src/ui-vue/NpcDialogueMenu.vue` + `src/ai/dialogueTemplates.ts` + state/handlers w `src/ui-vue/store.ts`.

Nie dodawać drugiego dialog UI ani specjalnego systemu rozmów dla lokacji.

Najmniejsza integracja to nowy topic/handler dla istniejącego `NpcDialogueMenu`, dostępny tylko dla właściwego strażnika.

Wybór lokacji powinien być deterministyczny tam, gdzie ma wpływ na stan świata/testowalność. Nie używać globalnego `Math.random()` do wyboru odkryć, jeśli można oprzeć wybór na istniejącym seedowanym RNG/hash + stabilnym NPC/location context.

Discovery musi być idempotentne: ponowne przekazanie już znanej lokacji nie tworzy nowego wpisu ani fałszywego feedbacku.

## 12. Merchant maps — nie rozbudowywać Inventory ponad potrzebę

Obecny merchant opiera się na:

- `ItemKind`,
- `ITEM_DEFS`,
- `MERCHANT_PRICES`,
- `MERCHANT_STOCK`,
- `settleTransaction()`.

Mapa jako item powinna wykorzystać dokładnie ten mechanizm. Dodać dwa nowe `ItemKind` (Near/Far), jeśli przyjęty zostanie planowany model fizycznych itemów.

Nie tworzyć osobnego `MapItemSystem`.

Po zakupie:

````
purchase
  → inventory
  → apply map knowledge once
````

Wiedza pozostaje po usunięciu itemu.

Jeżeli mapa jest tylko tokenem „knowledge delivery”, jej runtime effect nie powinien być związany z późniejszym używaniem/wyposażeniem itemu.

## 13. Weighted selection

`discoveryWeight` jest rankingiem informacji, nie generowaniem świata.

Najpierw:

`distance filter`

potem:

`weighted ranking / deterministic weighted pick`

Nie skanować tylko aktywnych chunków.

Dla top-5/top-10 zachować stabilny tie-break po `WorldLocation.id`, aby identyczny seed nie dawał niestabilnej kolejności przy równych wagach.

Settlementy mają osobny nearest-distance query i nie powinny trafiać do landmark weighted pool.

## 14. Distance conversion

Plan przyjmuje:

````
20 km = 1 gameplay day
````

Nie mieszać tego z fizyczną prędkością playera/NPC.

Wartość „około N dni drogi” powinna być prostą funkcją poziomego dystansu, bez pathfindingu:

````
days = distanceKm / 20
````

Najważniejsze do ustalenia podczas implementacji: obecne world units muszą mieć jawny współczynnik prezentacyjny do km. Nie zakładać automatycznie, że 1 world unit = 1 km tylko dlatego, że plan podaje km.

Jeżeli obecna skala świata nie ma takiego kontraktu, wydzielić jeden stały gameplay conversion constant zamiast rozrzucać `/20` po UI.

## 15. Full map UX

`WorldMapScreen.vue` jest już gotowym overlayem z canvasem, pan/zoom i centrowaniem początkowym na graczu.

`drawWorldMapFrame()` obecnie rysuje:

- odkryte komórki,
- wszystkie `knownLocations()`,
- gracza.

Rozbudowę zrobić w tej samej warstwie.

Kliknięcie lokacji wymaga hit-testu świata → location. Nie wykrywać jej przez canvas pixel color ani nie zmieniać discovery przy kliknięciu.

Panel/popover powinien korzystać z danych location/knowledge i callbacku ustawiającego target, zamiast przechowywać kopię lokacji w Vue.

## 16. Targets — stan gameplayowy, nie element map renderer

Maksymalnie 3 cele powinny być przechowywane jako stabilne `locationId[]` w jednym małym stanie nawigacji.

Nie dodawać target state do `WorldLocation`.

Proponowany przepływ:

````
locationId[]
   ↓
NavigationTargets
   ├─ full map
   └─ minimap
````

Walidacja celu musi sprawdzać, że ID nadal wskazuje istniejącą i odkrytą lokację.

Przy nowym seedzie targety muszą zostać wyzerowane.

Jeśli cele mają przetrwać save/load, zapisuj tylko ID. W przeciwnym razie będzie to niespójne z „aktywny cel” jako częścią stanu gracza.

## 17. Minimap — obecna implementacja wymaga świadomej zmiany

Aktualne `drawMinimapFrame()` pokazuje `mapData.knownLocations()`, a dla lokacji poza minimapą rysuje strzałkę.

To **nie spełnia jeszcze** planu 012: po implementacji minimapa ma pokazywać tylko 1–3 aktywne cele.

Nie tworzyć drugiego systemu arrow. Istniejąca:

````
drawArrow()
rotateDelta()
````

jest dokładnie mechanizmem do ponownego użycia.

Usunąć z minimapy automatyczne rysowanie wszystkich known locations; podać jej wyłącznie aktywne targety.

## 18. Game loop / per-frame cost

Obecnie `gameLoop.ts` robi co frame:

- `mapDiscovery.update()`,
- `minimap.update()`.

Nie dodawać pełnego skanowania `WorldLocation[]` co klatkę.

Targets są maksymalnie trzy, więc minimap może dostać gotową listę 1–3 lokacji i policzyć tylko ich projekcję.

World-map query może pozostać wykonywany tylko podczas paint overlay — obecny `WorldMapScreen` już tak działa.

## 19. Debug

Istniejący debug infrastructure należy rozszerzyć, nie tworzyć osobnego debug UI.

Debug location powinien mieć możliwość:

- reveal one ID,
- reveal all,
- list all,
- show IDs.

Szczególnie ważne jest testowanie lokacji poza loaded chunkami i deep caves.

„Reveal” powinno mutować wyłącznie location knowledge. Nie dopisywać komórek do `MapDiscovery`, bo złamie to rozdzielenie Fog of War / location knowledge.

## 20. Testy — rozszerzyć istniejące map tests

Istnieje już `src/world/map/mapProjection.test.ts`, który pokrywa:

- map coordinates,
- projection,
- MapDiscovery,
- MapData settlement filtering.

Nie tworzyć osobnego harnessu mapowego.

Dodać małe testy dla:

- stabilności `WorldLocation.id`,
- deterministycznych nazw,
- location knowledge serialize/restore,
- idempotentnego reveal,
- distance ranges,
- weighted top-N,
- no duplicate Near/Far,
- max 3 targets,
- unknown target rejection,
- settlement/landmark pool separation.

Dla źródeł świata osobne testy powinny pozostać przy ich generatorach, np. cave generator.

## 21. Zalecana kolejność

````
1. ustalić/naprawić globalne źródła stable locations:
   settlement + cave + cemetery + lake + peak

2. wprowadzić WorldLocation catalog

3. wprowadzić LocationKnowledge + persistence

4. przepiąć MapData.knownLocations() z cell discovery
   na location knowledge

5. discovery API + guard dialogue

6. merchant Near/Far maps

7. navigation targets

8. full-map interaction/popover

9. minimap → tylko targets

10. debug + focused tests
````

Nie zaczynać od UI. Bez stabilnego katalogu lokacji i knowledge layer łatwo zbudować UI na danych zależnych od streamingu.

## 22. Główne pułapki

- Nie używać chunk-local `WaterBody.id` jako globalnego lake ID.
- Nie generować far-map lokacji wyłącznie z loaded chunks.
- Nie traktować `MapKnownLocation` jako authoritative state.
- Nie mieszać `MapDiscovery.discoveredCells` z `discoveredLocations`.
- Nie dodawać osobnego GPS/navigation system.
- Nie przechowywać pozycji/nazw proceduralnych lokacji w save.
- Nie dodawać pełnego NPC knowledge systemu — plan tego nie wymaga.
- Nie używać `Math.random()` dla stateful discovery, jeśli wynik powinien być deterministycznie testowalny.
- Nie skanować wszystkich lokacji co frame.
- Nie zostawiać obecnego automatycznego settlement reveal przez `MapData.knownLocations()`.
- Nie implementować travel simulation/pathfindingu.
- Nie tworzyć drugiego systemu mapowego obok `src/world/map/`.

**Kluczowa decyzja architektoniczna:** `WorldLocation` jest stabilną tożsamością miejsca, `LocationKnowledge` jest wiedzą gracza, `MapDiscovery` jest wiedzą o terenie, a targety są osobnym stanem nawigacji. Te cztery pojęcia nie powinny zostać połączone w jeden obiekt.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
