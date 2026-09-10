# Plan: Mapa do skarbu — ruiny w ciemnym lesie

**Created:** 2026-09-07
**Status:** `verification needed` 🔍
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

Mapa jest fizycznym przedmiotem prowadzącym do już istniejącego miejsca. Jej użycie nie tworzy lokacji ani zagrożenia, tylko ujawnia wiedzę o istniejącym miejscu i ustawia nawigację:

```text
world seed
→ deterministyczny punkt głęboko w deepForest
→ większe ruiny + fizyczna skrzynia + 2–3 wolfDen
→ miejsce istnieje od startu świata

physical treasure map
→ akcja „Odczytaj”
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

## 2. Nowy kind i model ruin

Docelowe ruiny mają być **trochę większe od obecnego `smallRuins`**, czytelne jako główny punkt ekspedycji i semantycznie odrębne od obecnego proceduralnego wariantu.

Wprowadzić:

- nowy generic `LandmarkKind` dla większych ruin, np. `ruins` — finalna nazwa ma być spójna z aktualnym namingiem,
- nowy model / layout ruin przeznaczony dla tego rodzaju landmarku,
- stabilne ID i deterministic placement,
- normalny landmark/world rendering lifecycle, bez questowego renderer/scene graph.

Nowy model może reuse materiały, geometrię lub props primitives z obecnych ruin tam, gdzie jest to sensowne, ale nie jest tylko parametrycznym wariantem `smallRuins`.

Nie zmieniać globalnej losowej częstości `smallRuins` tylko po to, by uzyskać tę jedną lokację. Site-specific ruiny wynikają z deterministycznej definicji world feature, a nie z `SMALL_RUINS_CHANCE`.

## 3. World location i discovery

Ruiny powinny być pełnoprawnym miejscem, które może zostać znalezione bez mapy.

Rozszerzyć world-location catalog o generic kind ruin zgodny z nowym landmarkiem, zamiast trzymać questową pozycję wyłącznie w `QuestManager`.

Wymagany kontrakt:

```text
site resolver
→ stable location id + x/z
→ ruins landmark
→ WorldLocationCatalog
→ player discovery / map knowledge
→ NavigationTarget
```

Discovery przez zwykłe wejście w okolice powinno działać tym samym mechanizmem co inne world locations.

Nie dodawać specjalnego quest-only minimap marker state.

## 4. Fizyczna mapa i akcja „Odczytaj”

Mapa do skarbu ma być **fizycznym przedmiotem**.

Preferowany V1 contract:

- gracz znajduje authored treasure-map item,
- item udostępnia akcję `Odczytaj` przez istniejący item/action pipeline,
- `Odczytaj` reuse efekt ujawniania lokalizacji stosowany przez istniejące mapy zakupowe, zamiast tworzyć drugi system wiedzy,
- odczytanie ujawnia konkretny `WorldLocation.id`,
- ustawia lub umożliwia wybór navigation target,
- jest idempotentne,
- nie tworzy ruin, skrzyni ani wilków.

Jeżeli obecny zakup `map_near` / `map_far` ma reveal logic zaszyty bez reusable seam, wydzielić najmniejszą wspólną capability/action do ujawnienia location knowledge i użyć jej zarówno z zakupu, jak i z `Odczytaj`.

Jeżeli gracz wcześniej odkrył ruiny sam, odczytanie mapy nie duplikuje wpisu ani nie zmienia world state poza ewentualnym ustawieniem nawigacji.

## 5. Fizyczna skrzynia i loot

W ruinach umieścić fizyczną skrzynię z realną zawartością.

Authored treasure payload V1:

- coins,
- jeden rubin.

Skrzynia musi:

- istnieć od początku świata razem z lokacją,
- mieć stabilne ID wynikające z site ID,
- używać istniejącej reprezentacji `Container` / `Inventory` tam, gdzie jest to bezpieczne,
- mieć deterministycznie wygenerowany/ustalony payload `coins + ruby`,
- persistować stan po otwarciu / zabraniu zawartości,
- nie odtwarzać skarbu po save/load ani `WorldBundle` rebuild.

Nie zakładać, że obecne `PlacedContainers` są właściwym ownerem generated chest: ich semantyka obejmuje player placement/carry. Najmniejsze poprawne rozszerzenie powinno współdzielić `Container` + transfer UI, ale rozdzielić źródło/ownership generated world container od player-built storage, jeżeli bez tego skrzynia mogłaby być błędnie przenoszona, usuwana lub serializowana.

Preferować generic seam dla **world-generated containers**, który później może obsłużyć inne ruiny, obozy, grobowce i jaskinie. Nie tworzyć `QuestTreasureChestManager`.

## 6. 2–3 wolf den wokół ruin

Po wybraniu centrum lokacji deterministycznie wyznaczyć **2 albo 3** pozycje `wolfDen` w pierścieniu wokół ruin.

Den są generowane na potrzeby tej world feature, ale po utworzeniu są zwykłymi habitat spawnerami fauna:

- normalne `SpawnerType = 'wolfDen'`,
- stabilne IDs pochodne od site ID + ordinal,
- normalne wilki z `spawnPointId`,
- zwykły istniejący combat/death/depletion/recovery lifecycle,
- normalne roaming/habitat zachowanie,
- standardowa persistence spawn-point state.

Nie dodawać specjalnej permanentności dla den w tym queście. Mają zachowywać się dokładnie jak zwykłe `wolfDen` zgodnie z aktualnym fauna contractem.

Nie spawnuj wilków na podstawie aktywności questa.

Nie używać jednego globalnego `WOLF_DEN_ID` dla wszystkich den. Jeśli aktualny spawner model nadal zakłada singleton ID, rozszerzyć go do generic stable spawn-point identity bez psucia istniejących authored den.

Deny powinny być rozmieszczone tak, aby tworzyły wyraźnie niebezpieczną strefę, ale nie blokowały jedynego wejścia do skrzyni.

## 7. Walka jest opcjonalna

Quest **nie wymaga zabicia wilków**.

Nie dodawać objective `kill N wolves`, `clear all dens` ani hidden kill counter.

Gracz może:

- walczyć i zmniejszyć lokalne zagrożenie,
- oddziaływać na den zgodnie z normalnym fauna lifecycle,
- odciągnąć wilki,
- ominąć je,
- wejść do ruin w odpowiednim momencie i zabrać skarb bez walki.

To jest zamierzona różnica względem prostego combat questa. Wilki są rzeczywistą presją świata, nie warunkiem progression.

Jeśli gracz zabije wilki lub zmieni stan den przed poznaniem mapy, skutki pozostają w świecie. Quest nie resetuje ani nie odtwarza encountera.

## 8. Quest flow V1

Quest powinien prowadzić do już istniejącej lokacji.

Minimalny przebieg:

### Etap A — znalezienie i odczytanie mapy

Authored content prowadzi gracza do fizycznej mapy.

Po akcji `Odczytaj`:

- reveal konkretnego `WorldLocation.id`,
- ustawienie / udostępnienie navigation target,
- bez tworzenia nowego world contentu.

### Etap B — dotarcie do ruin

Quest obserwuje odkrycie / wejście w istniejącą lokację.

Jeżeli gracz odkrył ruiny wcześniej, stage powinien od razu respektować już istniejący knowledge/discovery state zamiast wymagać ponownego triggera.

### Etap C — zdobycie skarbu

Warunkiem postępu jest rzeczywiste odebranie authored treasure payload `coins + ruby` ze stabilnej skrzyni, nie wejście w marker i nie kill count.

Jeżeli gracz opróżnił skrzynię przed przyjęciem questa albo przed odczytaniem mapy, ten trwały world state jest autorytatywny. Quest ma rozpoznać wcześniejsze zdobycie skarbu i odpowiednio przejść dalej / raportować wcześniejsze odkrycie. Nie respawnować loot i nie wymagać ponownego otwierania skrzyni.

### Etap D — raport / outcome

Po zdobyciu skarbu można wykorzystać normalny terminal quest resolution/reward/consequence flow dostępny w aktualnym quest systemie.

Sam skarb jest realnym lootem ze skrzyni; nie duplikować tej samej nagrody dodatkowym quest grantem.

## 9. Quest objectives i binding

Preferować generic objective/world-state seams:

- `read/use item` lub równoważny istniejący item-action predicate dla mapy,
- `discover_location` / równoważny istniejący discovery predicate,
- `loot world container` z konkretnym stable container/site ID,
- existing `talk_to_npc` dla authored flow, jeśli content go potrzebuje.

Jeżeli aktualny quest system nie ma generic objective dla world container, dodać jeden wąski typ oparty o zdarzenie/stabilny world-state predicate, a nie `dark_forest_treasure_chest` specjalny case.

`QuestManager` ma być obserwatorem:

```text
item action / map read state
LocationKnowledge / world location state
WorldGeneratedContainer state
```

Nie może być właścicielem pozycji ruin, chest contents ani wolf den lifecycle.

## 10. Persistence i early discovery/loot

Persistent mutable state powinien być minimalny:

- player location knowledge/navigation — istniejący `SaveData.map`,
- generated chest contents/opened/depleted state — przez ownera world-generated containers,
- den lifecycle — przez istniejący spawn-point persistence,
- quest progress — przez normalny quest save state,
- mapa jako item — przez istniejący inventory/item persistence, jeśli już obejmuje nowy item/action state.

Nie persistować samego położenia ruin, jeśli jest czystą deterministyczną funkcją seeda.

Po save/load:

- site regeneruje się w tym samym miejscu,
- skrzynia pozostaje opróżniona, jeśli loot zabrano,
- den zachowują zwykły persisted lifecycle zgodny z fauna,
- odkryta lokacja pozostaje odkryta,
- odczytanie mapy pozostaje idempotentne,
- quest nie przywraca wcześniejszej wersji świata.

Early discovery i early loot są authoritative: aktywacja/restore kolejnego stage musi sprawdzać aktualny world state, a nie polegać wyłącznie na przyszłym evencie.

## 11. Performance i determinism

- site selection wykonywać raz na world bundle / przez cache world-location catalog, nie per frame,
- nie skanować wszystkich loaded chunks w poszukiwaniu „środka lasu”,
- używać czystych terrain/biome samplers dostępnych poza render lifecycle,
- IDs ruin, chest i den muszą być stabilne z world seed + site ID,
- generated content powinien materializować się wraz z odpowiednimi chunkami / existing fauna setup, nie utrzymywać niepotrzebnych Three.js obiektów off-screen,
- nie dodawać osobnego Web Workera dla pojedynczego bounded site search.

## 12. Non-goals V1

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

## 13. Relacja do przyszłych ekspedycji

Nowe seamy powinny umożliwić późniejsze reuse:

```text
stable hidden world site
+ WorldLocation knowledge
+ physical readable map/item reveal
+ optional generated container
+ optional fauna habitats
→ cave treasure
→ abandoned camp
→ tomb
→ larger ruins
→ other hidden finds
```

Nie budować frameworka ponad potrzeby V1, ale unikać nazw/ownershipu związanych wyłącznie z tym jednym questem tam, gdzie mechanizm jest oczywiście ogólny (`WorldLocation`, readable map reveal, generated container, stable habitat IDs).

## Implementation order

1. Zweryfikować finalny stan world-012, fauna-016, item actions/map purchase reveal i container ownership na bieżącym `main`.
2. Dodać deterministyczny resolver dark-forest treasure site, nowy ruins `LandmarkKind` i world-location representation.
3. Dodać nowy model/layout większych ruin, reuse istniejących landmark/prop primitives tam, gdzie pasują.
4. Dodać minimalny generic owner/seam dla world-generated chest z persistence, transfer interaction i payload `coins + ruby`.
5. Dodać 2–3 stabilne wolfDen jako zwykłe fauna spawners pochodne od site definition.
6. Dodać fizyczny treasure-map item oraz akcję `Odczytaj`, reuse wspólnego location-knowledge reveal z istniejącymi mapami zakupowymi.
7. Dodać quest objectives obserwujące map read/discovery/chest state, authored quest content, testy determinism/persistence/early-discovery/early-loot oraz dokumentację canonical state.

Dla ważnych nowych publicznych/architektonicznych funkcji i klas dodać JSDoc z `@domain quests-progression` lub właściwym domain ownerem (`world`, `world-terrain`, `fauna`, `items-player`) tam, gdzie pomaga preflight discovery.

# Verification

## Automated

Uruchomić odpowiednie testy jednostkowe/integracyjne dla:

- deterministycznego wyboru site z world seed,
- deepForest placement i bounded fallback,
- nowego ruins `LandmarkKind` / world-location kind i stable IDs,
- stable IDs chest/2–3 den,
- world-location resolution/discovery/reveal,
- fizycznej mapy i idempotentnej akcji `Odczytaj`,
- reuse reveal logic względem istniejących map zakupowych,
- generated chest payload `coins + ruby`, persistence i exact-once depletion,
- spawn-point creation/persistence dla wielu wolfDen,
- quest progress przy normalnym flow,
- quest progress gdy lokację/skarb odkryto przed przyjęciem questa lub przed odczytaniem mapy,
- save/load i `WorldBundle` rebuild,
- typecheck,
- build.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji działa w workflow.

## Manual — User

User sprawdza w przeglądarce:

1. Nowy świat ma nowy rodzaj większych ruin głęboko w ciemnym lesie jeszcze przed rozpoczęciem questa.
2. Ruiny mają nowy model/layout i można je znaleźć przypadkiem bez mapy.
3. Przy ruinach są 2–3 realne wolfDen i normalne wilki.
4. Wilki można zabić, ominąć lub odciągnąć; zabicie nie jest wymaganym objective, a den używają zwykłego fauna lifecycle.
5. Fizyczna skrzynia istnieje w ruinach od początku i zawiera coins + rubin.
6. Opróżniona skrzynia nie odzyskuje skarbu po save/load ani rebuildzie świata.
7. Fizyczną mapę można znaleźć i użyć przez akcję `Odczytaj`.
8. `Odczytaj` ujawnia istniejącą lokację i nawigację, ale niczego nie spawnuje; ponowne odczytanie jest bezpieczne/idempotentne.
9. Jeśli ruiny lub skarb znaleziono wcześniej, późniejszy quest respektuje ten stan i nie resetuje świata ani nie respawnuje skarbu.
10. Existing landmarks, maps, containers, fauna i questy nie mają regresji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
