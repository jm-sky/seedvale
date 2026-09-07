# Plan: Mapa do skarbu — ruiny w ciemnym lesie

**Created:** 2026-09-07
**Status:** `draft` 📝
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** fauna-016, world-012
**Domain:** `quests-progression`
**Subdomains:** `quests` `progression`
**Tags:** `treasure-map` `deep-forest` `ruins` `wolf-den` `chest`
**Roadmap:** -

## Cel

Dodać drugą ekspedycję skarbową: większe ruiny ukryte głęboko w `deepForest`, fizyczną skrzynię ze skarbem oraz 2–3 prawdziwe `wolfDen` wokół miejsca.

Lokacja jest tworzona **od razu razem ze światem** i istnieje niezależnie od tego, czy quest został odkryty lub przyjęty. Gracz może trafić na ruiny przypadkiem, ominąć wilki i otworzyć skrzynię bez mapy.

Mapa nie tworzy miejsca ani zagrożenia. Jest wyłącznie wiedzą o istniejącym miejscu:

```text
world seed
→ deterministyczny punkt głęboko w deepForest
→ większe ruiny + fizyczna skrzynia + 2–3 wolfDen
→ miejsce istnieje od startu świata

map knowledge
→ ujawnienie istniejącej lokacji
→ navigation target
→ podróż / eksploracja
→ skrzynia może zostać zdobyta z walką albo bez walki
```

Quest ma korzystać z rzeczywistych systemów świata. Nie dodawać `questSpawn`, questowego combat encounter, quest-only wilków ani tworzenia ruin dopiero po aktywacji questa.

## Stan obecny i mechanizmy do ponownego użycia

Aktualny `main` posiada istotne fundamenty:

- `src/terrain/biomeRegions.ts` udostępnia deterministyczne `forestDensityAt()` / `forestBiomeAt()` i klasyfikację `deepForest`.
- `src/terrain/chunkEnvironment.ts` posiada stabilne landmark IDs oraz proceduralny `smallRuins`; obecna wersja jest jednak mniejsza niż docelowa lokacja tego questa.
- `WorldLocation` / `WorldLocationCatalog` z world-012 oddzielają deterministyczną tożsamość miejsca od persisted player knowledge/navigation.
- `SaveData.map` persistuje odkryte locations i navigation targets; Near/Far Map już ujawniają wiedzę o istniejących miejscach zamiast tworzyć content.
- `src/items/container.ts` / `PlacedContainers` dają istniejący model `Container` + `Inventory` i fizyczną interakcję ze skrzynią, ale obecny ownership dotyczy player-placed storage. Nie traktować `PlacedContainers` automatycznie jako gotowego ownera generated treasure chest.
- fauna ma prawdziwy `wolfDen` habitat spawner, normalne wilki, death accounting, depletion/destruction lifecycle i spawn-point state.
- fauna-016 dodała habitat-aware placement i roaming; nowe den mają używać tego samego fauna lifecycle, nie własnego runtime encountera.
- quest system posiada world binding do landmarków/spawnerów i może obserwować istniejący stan świata.

Kod pozostaje źródłem prawdy podczas implementacji. Jeżeli `world-012`, fauna lub container ownership zmieni się wcześniej, wykorzystać finalny publiczny kontrakt zamiast odtwarzać starszą strukturę z planu.

## 1. Deterministyczna lokacja skarbu

Dodać jeden stabilny world feature reprezentujący tę ekspedycję.

Nie losować pozycji przy przyjęciu questa i nie persistować przypadkowej pozycji tylko dlatego, że quest jej potrzebuje. Położenie powinno być deterministyczną funkcją world seed i stałego site ID/salt.

Resolver wybiera punkt spełniający co najmniej:

- `forestBiomeAt(x, z) === 'deepForest'`,
- odpowiednio wysoka lokalna gęstość lasu,
- rozsądny dystans od home settlement / głównych clearings,
- brak kolizji z wodą, stromym terenem, drogami i innym dużym world contentem zgodnie z istniejącymi placement helpers,
- wystarczająco duży footprint dla ruin, skrzyni i 2–3 den.

Nie wykonywać nieograniczonego globalnego skanu ani loaded-chunk search. Kandydatów generować z ograniczonego, deterministycznego zestawu próbek wokół sensownego world radius i wybierać najlepszy poprawny kandydat.

Jeżeli żaden kandydat nie spełnia idealnego progu, zastosować jawny bounded fallback obniżający wymagania stopniowo; świat nie może wejść w nieskończony search loop.

## 2. Większe ruiny

Docelowe ruiny mają być **trochę większe od obecnego `smallRuins`** i czytelne jako główny punkt ekspedycji.

Preferowane rozwiązanie:

- rozszerzyć istniejący system props/landmarks o większy wariant ruin lub parametryzowany layout,
- zachować stabilne ID i deterministic placement,
- nie tworzyć osobnego quest renderer/scene graph.

Nie zmieniać globalnej losowej częstości `smallRuins` tylko po to, by uzyskać tę jedną lokację.

Site-specific ruiny mogą korzystać z tych samych factory/layout primitives co zwykłe ruiny, ale ich obecność wynika z deterministycznej definicji world feature, a nie z `SMALL_RUINS_CHANCE`.

## 3. World location i discovery

Ruiny powinny być pełnoprawnym miejscem, które może zostać znalezione bez mapy.

Rozszerzyć world-location catalog o odpowiedni rodzaj dla ruin / tego typu landmarks, zamiast trzymać questową pozycję wyłącznie w `QuestManager`.

Wymagany kontrakt:

```text
site resolver
→ stable location id + x/z
→ WorldLocationCatalog
→ player discovery / map knowledge
→ NavigationTarget
```

Discovery przez zwykłe wejście w okolice powinno działać tym samym mechanizmem co inne world locations.

Mapa do skarbu w V1 może być **wiedzą**, nie osobnym `ItemKind`:

- zdobycie/odczytanie informacji o mapie ujawnia konkretny `WorldLocation.id`,
- tworzy lub wybiera istniejący navigation target,
- nie tworzy ruin, skrzyni ani wilków,
- jeśli gracz wcześniej odkrył lokację sam, mapa nie duplikuje wpisu.

Nie dodawać specjalnego quest-only minimap marker state.

## 4. Fizyczna skrzynia

W ruinach umieścić fizyczną skrzynię z realną zawartością.

Skrzynia musi:

- istnieć od początku świata razem z lokacją,
- mieć stabilne ID wynikające z site ID,
- używać istniejącej reprezentacji `Container` / `Inventory` tam, gdzie jest to bezpieczne,
- mieć deterministycznie wygenerowany loot,
- persistować stan po otwarciu / zabraniu zawartości,
- nie odtwarzać skarbu po save/load ani `WorldBundle` rebuild.

Nie zakładać, że obecne `PlacedContainers` są właściwym ownerem generated chest: ich semantyka obejmuje player placement/carry. Najmniejsze poprawne rozszerzenie powinno współdzielić `Container` + transfer UI, ale rozdzielić źródło/ownership generated world container od player-built storage, jeżeli bez tego skrzynia mogłaby być błędnie przenoszona, usuwana lub serializowana.

Preferować generic seam dla **world-generated containers**, który później może obsłużyć inne ruiny, obozy, grobowce i jaskinie. Nie tworzyć `QuestTreasureChestManager`.

## 5. 2–3 wolf den wokół ruin

Po wybraniu centrum lokacji deterministycznie wyznaczyć **2 albo 3** pozycje `wolfDen` w pierścieniu wokół ruin.

Den są generowane na potrzeby tej world feature, ale po utworzeniu są zwykłymi habitat spawnerami fauna:

- normalne `SpawnerType = 'wolfDen'`,
- stabilne IDs pochodne od site ID + ordinal,
- normalne wilki z `spawnPointId`,
- zwykły combat/death/depletion lifecycle,
- normalne roaming/habitat zachowanie,
- standardowa persistence spawn-point state.

Nie spawnuj wilków na podstawie aktywności questa.

Nie używać jednego globalnego `WOLF_DEN_ID` dla wszystkich den. Jeśli aktualny spawner model nadal zakłada singleton ID, rozszerzyć go do generic stable spawn-point identity bez psucia istniejących authored den.

Deny powinny być rozmieszczone tak, aby tworzyły wyraźnie niebezpieczną strefę, ale nie blokowały jedynego wejścia do skrzyni.

## 6. Walka jest opcjonalna

Quest **nie wymaga zabicia wilków**.

Nie dodawać objective `kill N wolves`, `clear all dens` ani hidden kill counter.

Gracz może:

- walczyć i zmniejszyć lokalne zagrożenie,
- zniszczyć/deplete den zgodnie z normalnym fauna lifecycle,
- odciągnąć wilki,
- ominąć je,
- wejść do ruin w odpowiednim momencie i zabrać skarb bez walki.

To jest zamierzona różnica względem prostego combat questa. Wilki są rzeczywistą presją świata, nie warunkiem progression.

Jeśli gracz zabije wilki lub zniszczy den przed poznaniem mapy, skutki pozostają w świecie. Quest nie resetuje ani nie odtwarza encountera.

## 7. Quest flow V1

Quest powinien prowadzić do już istniejącej lokacji.

Minimalny przebieg:

### Etap A — zdobycie wiedzy

NPC / authored content przekazuje informację z mapy prowadzącą do ruin.

Mechanicznie:

- reveal konkretnego `WorldLocation.id`,
- ustawienie navigation target,
- bez tworzenia nowego world contentu.

### Etap B — dotarcie do ruin

Quest obserwuje odkrycie / wejście w istniejącą lokację.

Jeżeli gracz odkrył ruiny wcześniej, stage powinien od razu respektować już istniejący knowledge/discovery state zamiast wymagać ponownego triggera.

### Etap C — zdobycie skarbu

Warunkiem postępu jest rzeczywiste opróżnienie/odebranie authored treasure payload ze stabilnej skrzyni, nie wejście w marker i nie kill count.

Jeżeli skrzynia została opróżniona przed przyjęciem questa, quest musi potrafić rozpoznać ten trwały world state i odpowiednio przejść dalej / raportować wcześniejsze odkrycie. Nie respawnować loot.

### Etap D — raport / outcome

Po zdobyciu skarbu można wykorzystać normalny terminal quest resolution/reward/consequence flow dostępny w aktualnym quest systemie.

Sam skarb jest realnym lootem ze skrzyni; nie duplikować tej samej nagrody dodatkowym quest grantem.

## 8. Quest objectives i binding

Preferować generic objective/world-state seams:

- `discover_location` / równoważny istniejący discovery predicate,
- `loot/open world container` z konkretnym stable container/site ID,
- existing `talk_to_npc` dla authored flow.

Jeżeli aktualny quest system nie ma generic objective dla world container, dodać jeden wąski typ oparty o zdarzenie/stabilny world-state predicate, a nie `dark_forest_treasure_chest` specjalny case.

`QuestManager` ma być obserwatorem:

```text
LocationKnowledge / world location state
WorldGeneratedContainer state
```

Nie może być właścicielem pozycji ruin, chest contents ani wolf den lifecycle.

## 9. Persistence i early discovery

Persistent mutable state powinien być minimalny:

- player location knowledge/navigation — istniejący `SaveData.map`,
- generated chest contents/opened/depleted state — przez ownera world-generated containers,
- den lifecycle — przez istniejący spawn-point persistence,
- quest progress — przez normalny quest save state.

Nie persistować samego położenia ruin, jeśli jest czystą deterministyczną funkcją seeda.

Po save/load:

- site regeneruje się w tym samym miejscu,
- skrzynia pozostaje opróżniona, jeśli loot zabrano,
- zniszczone/depleted den zachowują swój stan,
- odkryta lokacja pozostaje odkryta,
- quest nie przywraca wcześniejszej wersji świata.

## 10. Performance i determinism

- site selection wykonywać raz na world bundle / przez cache world-location catalog, nie per frame,
- nie skanować wszystkich loaded chunks w poszukiwaniu „środka lasu”,
- używać czystych terrain/biome samplers dostępnych poza render lifecycle,
- IDs ruin, chest i den muszą być stabilne z world seed + site ID,
- generated content powinien materializować się wraz z odpowiednimi chunkami / existing fauna setup, nie utrzymywać niepotrzebnych Three.js obiektów off-screen,
- nie dodawać osobnego Web Workera dla pojedynczego bounded site search.

## 11. Non-goals V1

Nie implementować w tym planie:

- generic procedural treasure-map generator,
- losowych wielu treasure sites,
- fog-of-war zagadki z ręcznym odczytywaniem mapy,
- compass/bearing puzzle,
- quest-only wilków lub encounter managera,
- wymogu zabicia zwierząt,
- underground ruins/dungeon,
- lockpicking,
- trap puzzle,
- respawnującego treasure lootu,
- globalnego overhaul wszystkich `smallRuins`,
- pełnego regionalnego ecosystem population simulatora.

## 12. Relacja do przyszłych ekspedycji

Nowe seamy powinny umożliwić późniejsze reuse:

```text
stable hidden world site
+ WorldLocation knowledge
+ optional generated container
+ optional fauna habitats
→ cave treasure
→ abandoned camp
→ tomb
→ larger ruins
→ other hidden finds
```

Nie budować frameworka ponad potrzeby V1, ale unikać nazw/ownershipu związanych wyłącznie z tym jednym questem tam, gdzie mechanizm jest oczywiście ogólny (`WorldLocation`, generated container, stable habitat IDs).

## Implementation order

1. Zweryfikować finalny stan world-012, fauna-016 i container ownership na bieżącym `main`.
2. Dodać deterministyczny resolver dark-forest treasure site i world-location representation.
3. Dodać większy ruin layout jako reuse istniejących landmark/prop primitives.
4. Dodać minimalny generic owner/seam dla world-generated chest z persistence i transfer interaction.
5. Dodać 2–3 stabilne wolfDen jako zwykłe fauna spawners pochodne od site definition.
6. Dodać map-knowledge reveal i quest objectives obserwujące discovery/chest state.
7. Dodać authored quest content, testy determinism/persistence/early-discovery oraz dokumentację canonical state.

Dla ważnych nowych publicznych/architektonicznych funkcji i klas dodać JSDoc z `@domain quests-progression` lub właściwym domain ownerem (`world`, `fauna`, `items-player`) tam, gdzie pomaga preflight discovery.

# Verification

## Automated

Uruchomić odpowiednie testy jednostkowe/integracyjne dla:

- deterministycznego wyboru site z world seed,
- deepForest placement i bounded fallback,
- stable IDs ruin/chest/2–3 den,
- world-location resolution/discovery/reveal,
- generated chest loot/persistence/exact-once depletion,
- spawn-point creation/persistence dla wielu wolfDen,
- quest progress przy normalnym flow,
- quest progress gdy lokację/skarb odkryto przed przyjęciem questa,
- save/load i `WorldBundle` rebuild,
- typecheck,
- build.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji działa w workflow.

## Manual — User

User sprawdza w przeglądarce:

1. Nowy świat ma większe ruiny głęboko w ciemnym lesie jeszcze przed rozpoczęciem questa.
2. Ruiny można znaleźć przypadkiem bez mapy.
3. Przy ruinach są 2–3 realne wolfDen i normalne wilki.
4. Wilki można zabić, ominąć lub odciągnąć; zabicie nie jest wymaganym objective.
5. Fizyczna skrzynia istnieje w ruinach od początku i zawiera realny loot.
6. Opróżniona skrzynia nie odzyskuje skarbu po save/load ani rebuildzie świata.
7. Zniszczenie/depletion den pozostawia normalne trwałe skutki fauna lifecycle.
8. Zdobycie mapy ujawnia istniejącą lokację i nawigację, ale niczego nie spawnuje.
9. Jeśli ruiny lub skarb znaleziono wcześniej, późniejszy quest respektuje ten stan i nie resetuje świata.
10. Existing landmarks, maps, containers, fauna i questy nie mają regresji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**