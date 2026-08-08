# Plan: Generowanie wiosek (rozmiar → rodziny → domy → obszary terenu)

**Status:** `verification needed` — zaimplementowane zgodnie z opisem poniżej (`src/settlement/families.ts`, `src/settlement/villageClearing.ts`, rozszerzenia `settlementGenerator.ts`/`createSettlement.ts`/`props.ts`/`characters.ts`/`NpcAgent.ts`/`chunkHeightmap.ts`/`roadNetwork.ts`/`chunkManager.ts`/`worldConfig.ts`), `npx tsc --noEmit`/`npm run lint`/`npm run build`/`npm run test` czyste (w tym nowe testy jednostkowe `src/settlement/families.test.ts`) — **brak jeszcze wizualnej weryfikacji w przeglądarce**, patrz „Do przetestowania" niżej
**Created:** 2026-08-08
**Scope:** rozszerza [multi-settlements.md](./2026-08-07--025--multi-settlements.md) (siatka osad, streaming) i [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md) (`CharacterDef`, Big Five, `HealthState`); reużywa wzorzec spłaszczania terenu z [roads-and-paths.md](./2026-08-07--026--roads-and-paths.md)

## Stan implementacji (2026-08-08)

Zaimplementowane zgodnie ze szkicem poniżej, z kilkoma decyzjami podjętymi podczas implementacji (odpowiedzi na pytania doprecyzowujące zadane przed startem):

- **Spłaszczanie terenu: realna modyfikacja heightmapy** (nie tylko wyszukiwanie płaskich miejsc) — `ClearingSegment` w `terrain/chunkHeightmap.ts`, analogicznie do `RoadCorridorSegment`, ale z falloff liczonym od punktu (koło), nie od odcinka. `applyRoadCorridor` scalone z nowym `applyTerrainCorridors`, który bierze pod uwagę drogi i clearingi razem (najsilniejszy segment wygrywa), reużywa kanału `roadTint`/`applyRoadTint` dla koloru — brak osobnego systemu tintów.
- **Generator rodzin dotyczy wszystkich osad, w tym home** — `families.ts`'s `generateFamilies(seed, size, isHome, nameCulture)` z podłogą 2 zarezerwowanych rodzin (Anna+Piotr, Kasia+Marek) dla `isHome`, chroniącą hardkodowane imiona w `quests/quests.ts`.
- **Circular-import unikniętу przez podział na 2 moduły**: `settlement/villageClearing.ts` jest czystą/leaf funkcją (`layoutClearings`, bez importu z `settlementGenerator.ts`), a rozwiązywanie sąsiednich definicji osad dla pipeline'u czanków (`clearingSegmentsNear`) dopisano do już istniejącego `settlement/roadNetwork.ts` (ten sam cache `defFor`/`RoadNetworkContext` co dla dróg) — plan zakładał jeden plik `villageClearing.ts` z `segmentsNear()`, ale `settlementGenerator.ts` musi importować `layoutClearings` (do zbudowania `SettlementDef.clearings`), a resolver sąsiadów musi importować `settlementGenerator.ts` — trzymanie obu w jednym pliku dałoby cykl importów.
- **`characters.ts`**: `SEEDS`/`CHARACTERS` (8 postaci) skurczone do `RESERVED_CHARACTERS` (4: Anna/Piotr/Kasia/Marek) + nowa `characterForSeed(seed, gender)` dla proceduralnych członków rodzin. Znaleziony i naprawiony bug: `personalityForIndex()` indeksuje tablicę przez `% length`, co dla ujemnych (xor-owanych) seedów dawało `undefined` — naprawione przez `personalityForIndex(seed >>> 0)` w `characterForSeed`.
- **`FamilyRelation` rozszerzone o `'single'`** (poza husband/wife/child z draftu) — rodzina 1-osobowa (dozwolona w drafcie: "1–3 osób") potrzebowała jakiejś etykiety; użycie husband/wife dla samotnego mieszkańca sugerowałoby nieistniejącego małżonka.
- **Dziecko: skala 0.5–0.8 na modelu dorosłym** (nie stały 0.75) — zakres, bo prawdziwe dzieci wahają się od małego dziecka po prawie-dorosłego nastolatka; `TODO: Use real child model` w `families.ts` przy `CHILD_SCALE_RANGE`.
- **Domy/obiekty wioski**: `villageClearing.ts::layoutClearings` — 1 core clearing (studnia/skład/ogród, +ognisko dla MD/LG, +drugi skład dla LG) + 1 clearing per rodzina (chatka) na seeded pierścieniu wokół core, z retry (do 4 prób) jeśli kandydat wypada pod wodą.
- **Config**: `RegionParams.village` (`coreRadius`, `houseRadius`, `heightStrength`, `tintStrength`) w `worldConfig.ts` + nowy folder „Village" w `createDebugGui.ts`, wzorem „Roads".

Sanity check: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — wszystkie czyste. **Nie zweryfikowano jeszcze w przeglądarce** — patrz „Do przetestowania" (wymaga manualnego testu przez użytkownika, zgodnie z zasadą projektu).

## Kontekst

Szkic tego planu powstał jako draft (ChatGPT) i został tu przejrzany oraz dopasowany do realiów kodu przed wpisaniem do kolejki. Punkt wyjścia: każda osada dziś ma płaską, niezróżnicowaną listę 3-5 NPC-ów (`SettlementDef.npcCount`, seeded roll) bez żadnej struktury rodzinnej, a domy stoją na trzech sztywnych offsetach niezależnie od tego, ilu NPC-ów faktycznie tam mieszka. Cel: **wioska generowana jako całość** — rozmiar (SM/MD/LG) → rodziny → NPC-e z relacjami (`husband`/`wife`/`child`) → **1 rodzina = 1 dom** → kilka małych, lokalnie wyrównanych obszarów terenu pod zabudowę → obiekty wspólne (studnia/skład, więcej dla większych wiosek). Bez ekonomii, rozwoju czy migracji — to fundament pod przyszłe „żywe" wioski (patrz „Kierunek na przyszłość" niżej), nie kompletny system.

Dwie decyzje zapadły przy doprecyzowaniu planu (przed wpisaniem do kolejki):

1. **Spłaszczanie terenu pod obszarami wioski to realna modyfikacja heightmapy** (jak drogi), nie tylko wyszukiwanie już-płaskich miejsc — droższe niż alternatywa, ale wierniejsze opisowi „lokalnie wyrównane obszary".
2. **Generator rodzin dotyczy wszystkich osad, w tym home** (nie tylko streamowanych non-home) — wymaga jednak ochrony istniejących questów v1, patrz Decyzja 2 niżej.

## Stan obecny (dla kontekstu)

- `src/settlement/settlementGenerator.ts` — `generateSettlementDef()` per grid-cell (`SETTLEMENT_GRID_STEP=280`, deterministyczne z seeda). Dziś: `npcCount = 3 + floor(rand*3)` (3-5, płaskie), `npcNames` pre-rolled per slot. Brak pojęcia size i brak rodzin. `npcCount`/`npcNames` używane wyłącznie wewnętrznie w `createSettlement.ts` — bezpieczne do zastąpienia (brak innych konsumentów).
- `src/settlement/findSettlementSite.ts` — szuka jednego płaskiego miejsca dla **centrum** osady (80 próbek, odrzuca zbyt nierówne). Zostaje bez zmian — ten plan dokłada kolejny krok (obszary/clearing) nad tym, nie zamiast.
- `src/settlement/settlementTerrain.ts` — `classifySettlementTerrain()` już zwraca `SettlementTerrain = 'ocean' | 'mountain' | 'swamp' | 'desert' | 'forest'` (uśrednia continentalness/mountainRidge/moistureRegion wokół site), dziś używane tylko do nazewnictwa. **Draft mówi o „przyjaznych równinach", ale taka kategoria nie istnieje w kodzie** — `'forest'` jest dzisiejszym fallbackiem/domyślną kategorią i najbliżej odpowiada temu, co draft nazywa równinami.
- `src/settlement/createSettlement.ts` — `count` dla home = `Math.min(5, Math.max(3, homes.length+1))` (zawsze 4 dziś, bo zawsze 3 chatki), dla non-home = `def.npcCount`. `homePlaces` z `landmarks.homes`, cykl `i % length` gdy NPC > chatek.
- `src/settlement/props.ts` — `buildSettlementProps()`: chatki na sztywnych offsetach `[[-5,-2],[-4,4],[5,-3]]` (zawsze 3), studnia/skład/ogród na sztywnych offsetach od centrum site. Brak spłaszczania terenu — `placeOnGround` po prostu próbkuje `sampleHeight` w danym punkcie.
- `src/ai/characters.ts` — `SEEDS` (8 hardkodowanych postaci: Anna/Piotr/Kasia/Marek/Ola/Tomek/Zofia/Jacek, z rolą+traits), `CHARACTERS = SEEDS.map(+personality)`, `characterForIndex(treeIndex) = CHARACTERS[treeIndex % 8]`. Używane w 2 miejscach: `settlementGenerator.ts` (gender do generowania imion non-home) i `NpcAgent.ts` (dobór puli modelu GLB po gender + przypisanie gender/role/traits/personality w konstruktorze). `genderForName()` — defensywny lookup po imieniu, używany w `QuestManager.ts` z fallbackiem na losowy gender.
- `src/ai/NpcAgent.ts` — `treeIndex` ma dziś **potrójną rolę**: (1) indeks do `characterForIndex`, (2) indeks do puli modeli GLB przez gender (`modelUrlForIndex`), (3) wybór drzewa do rąbania (`this.treeIndex = treeIndex % landmarks.trees.length`). Ten plan rozdziela (1)+(2) od (3).
- Brak modeli „dziecko" — `NPC_MODEL_URLS` ma tylko pule `male`/`female` (dorosłe Quaternius). Draft chce `child` jako relację rodzinną, ale nie ma na to osobnego assetu.
- `src/quests/QuestManager.ts` — `relations: Map<npcName, number>` to sympatia gracz↔NPC z questów, **inna oś** niż relacje rodzinne z draftu — nie mieszać.
- `SaveData` (`src/persistence/saveData.ts`, v3) — osady/`SettlementDef` nie są dziś persystowane (deterministyczne z seeda, przeliczane on-load). Ten plan zachowuje tę własność.

### Krytyczne ograniczenie: questy v1 hardkodują imiona

`src/quests/quests.ts` hardkoduje 4 imiona (`Anna`, `Piotr`, `Kasia`, `Marek`) jako giver/target questów v1. Te imiona pochodzą dziś z puli 8 postaci w `characters.ts`, używanej **tylko** w home-osadzie (komentarz w `settlementGenerator.ts`: „randomizing home names would silently break the only quests the game has"). Dzisiejszy home ma zawsze dokładnie 4 NPC (`Math.min(5, Math.max(3, homes.length+1))` z 3 chatek → zawsze 4) = indeksy 0-3 = Anna/Piotr/Kasia/Marek — nie przypadek. Generator rodzin dla home musi to świadomie chronić (Decyzja 2), inaczej implementacja po cichu wywala questy v1.

## Decyzje

### 1. Rozmiar wioski ważony terenem — reużywa istniejący `SettlementTerrain`, nie nową oś „plains"

`forest` (dzisiejszy fallback = odpowiednik „przyjaznych równin" z draftu) ma najwyższą szansę na MD/LG; `mountain`/`desert`/`swamp` biased do SM; `ocean` neutralnie. Wagi startowe (do kalibracji w edytorze, jak reszta configu w projekcie):

| Terrain | SM | MD | LG |
|---|---|---|---|
| forest | 20% | 40% | 40% |
| ocean | 30% | 45% | 25% |
| mountain | 65% | 30% | 5% |
| desert | 65% | 30% | 5% |
| swamp | 60% | 30% | 10% |

Zakresy liczby rodzin jak w draftcie: SM 1-3, MD 2-4, LG 3-5 (wstępne, do zmiany podczas implementacji).

### 2. Home-osada: rodziny też, ale z „reserved" floorem chroniącym questy

2 zarezerwowane rodziny odtwarzają dzisiejszy skład 1:1: Anna+Piotr jako `husband`/`wife`, Kasia+Marek jako `husband`/`wife` — te same role/traits/personality co dziś (`SEEDS[0..3]`, verbatim). `VillageSize` dla home liczy się tak samo jak dla innych osad (ważony jej `SettlementTerrain`), ale wynik działa jako **podłoga 2 rodziny**: rzut ≤2 → home ma dokładnie te 2 zarezerwowane (identyczne zachowanie jak dziś, 4 NPC, te same imiona); rzut większy → dokłada się `(N-2)` proceduralnie wygenerowanych rodzin **na wierzchu** zarezerwowanych. Home nigdy nie traci Anny/Piotra/Kasi/Marka — questy v1 działają bez zmian.

`Ola`/`Tomek`/`Zofia`/`Jacek` przestają być „specjalne" (żaden quest ich nie referencuje) — trafiają do ogólnej puli proceduralnej jak każde inne imię: mogą się pojawić, ale nie są gwarantowane.

### 3. Realne spłaszczanie terenu — nowy moduł `src/settlement/villageClearing.ts`

Wzorowany na `roadNetwork.ts`/`chunkHeightmap.ts` z `roads-and-paths.md`, ale z segmentem **punktowym** (koło), nie liniowym:

- `ClearingSegment = { x, z, radius, targetH, heightStrength, tintStrength }` — nowa, równoległa tablica obok `roads` w `ChunkTileParams`/`RawSampleParams` (nie generalizacja `RoadCorridorSegment` — mniejsze ryzyko niż refaktor już wysłanego kodu dróg).
- `sampleRawTexel` (`src/terrain/chunkHeightmap.ts`): dla każdego pobliskiego clearing — `falloff = smoothstep(dist_do_środka, inner, radius)` (dystans euklidesowy do punktu, nie do odcinka jak przy drogach), `floorH = lerp(floorH, targetH, falloff * heightStrength)`. Najsilniejszy segment (drogowy lub clearing) wygrywa przy nakładaniu, jak dziś przy skrzyżowaniach dróg.
- **Kolor: reużyć `applyRoadTint`/kanał `roadTint`** (ta sama „ubita ziemia") zamiast nowego równoległego systemu tintów — mniej duplikacji, wioska i drogi wizualnie spójne jako „teren zadeptany".
- `targetH` per clearing liczony **raz**, przy generowaniu osady (`generateSettlementDef`), przez uśrednienie kilku próbek `sampleHeight` wokół środka clearing — ten sam ambient `sampleHeight` callback, którego już używa `findSettlementSite`, więc brak problemu z kolejnością bootstrapu (clearing danej osady nie istnieje jeszcze jako input do własnego liczenia targetu — dokładnie tak samo jak trasy dróg liczą wysokość przed własnym wygładzeniem).
- Layout: **1 clearing „core"** (promień ~8-10 jedn.) na środku site — studnia/skład/ogród (+ dodatkowa studnia/skład/ognisko dla MD/LG, reguła do dostrojenia w edytorze) + **1 clearing per rodzina** (promień ~4-5 jedn.) na chatkę, rozmieszczone po seeded pierścieniu/scatter wokół core (promień ~10-25 jedn. od centrum) — skala zbliżona do dzisiejszych sztywnych offsetów, tylko generowana zamiast hardkodowanej.

**Sugerowana kolejność implementacji:** najpierw warstwa danych (rodziny/postacie, bez zmian w terenie — wioski nadal wizualnie jak dziś, tylko dynamiczna liczba chatek na niezmodyfikowanym terenie), potem warstwa terenowa (clearing/flatten/tint) jako osobny, testowalny krok — spójne z tym, jak `roads-and-paths.md` było integrowane osobno od `multi-settlements.md`.

### 4. „Dziecko" bez osobnego modelu — ograniczenie v1, nie blocker

Brak assetu dziecka w `NPC_MODEL_URLS`. V1: `child` to tylko metadana relacji (`FamilyMember.relation`), NPC nadal korzysta z dorosłego modelu (mniejsza skala jako tani wizualny sygnał — opcjonalnie, do oceny w przeglądarce).

### 5. Relacje rodzinne to metadane, nie nowy system gameplay

`FamilyMember.relation` (`husband`/`wife`/`child`) nie zasila `QuestManager.relations` (sympatia gracz↔NPC — inna oś, bez zmian). Widoczne tylko jako grupowanie w ekranie „Mieszkańcy" (`src/ui/createVillagersScreen.ts`, drobne rozszerzenie UI). Zgodne z „poza zakresem" draftu (brak ekonomii/rozwoju w v1).

### 6. `characters.ts` refaktor

`SEEDS`/`CHARACTERS` kurczy się do 4 zarezerwowanych postaci (Anna/Piotr/Kasia/Marek — potrzebne questom). Nowa funkcja `characterForSeed(seed): Omit<CharacterDef, 'name'>` zastępuje `characterForIndex(treeIndex)` dla **wszystkich** proceduralnie generowanych członków rodzin (home-extra + wszystkie non-home) — ten sam zamknięty pool `Role`/`Trait`, ale wybór seeded-per-member zamiast `% 8`. `genderForName()` zostaje, ale dotyczy już tylko 4 zarezerwowanych imion (wystarczające dla `QuestManager.ts`, który i tak ma fallback na losowy gender).

### 7. `NpcAgent`: character jako parametr

Konstruktor/`create()` przyjmuje gotowy `CharacterDef` (z `FamilyMember.character`) zamiast wywoływać `characterForIndex(treeIndex)` wewnątrz. `treeIndex` zostaje **tylko** do wyboru drzewa (`this.treeIndex = treeIndex % landmarks.trees.length`) — rozdzielenie od doboru postaci. `modelUrlForIndex()` zamienia się na dobór po `character.gender` bezpośrednio.

## Zakres

- `src/settlement/families.ts` (nowy) — `VillageSize` (`'SM' | 'MD' | 'LG'`), `FamilyRelation` (`'husband' | 'wife' | 'child'`), `FamilyMember { name, relation, character: CharacterDef }`, `FamilyDef { id, members }`, `rollVillageSize(terrain, seed)` (tabela wag z Decyzji 1), `generateFamilies(seed, size, isHome)` (Decyzja 2 — floor 2 zarezerwowanych rodzin dla home).
- `src/settlement/villageClearing.ts` (nowy) — `ClearingSegment`, layout core + per-rodzina clearings (Decyzja 3), `segmentsNear()` analogiczne do `roadNetwork.ts`'s hook do `chunkManager.paramsFor()`.
- `src/settlement/settlementGenerator.ts` — `SettlementDef` zyskuje `size: VillageSize`, `families: FamilyDef[]`; usunięcie `npcCount`/`npcNames` (superseded przez sumę członków rodzin).
- `src/settlement/createSettlement.ts` — liczba NPC = suma `members` po wszystkich rodzinach; `homePlaces` 1:1 z rodziną/domem (nie cykl `i % length`).
- `src/settlement/props.ts` — `buildSettlementProps()`: dynamiczna liczba chatek z `villageClearing.ts` zamiast sztywnego `homeOffsets` (3 pozycje).
- `src/terrain/chunkHeightmap.ts` — `RawSampleParams`/`ChunkTileParams` += `clearings: ClearingSegment[]`; `sampleRawTexel` blenduje w stronę `targetH` jak przy drogach.
- `src/terrain/biomeColors.ts` — bez zmian, o ile reużywamy `applyRoadTint`/`roadTint` (do potwierdzenia podczas implementacji, czy kanał da się bezpiecznie dzielić między drogami i clearingami).
- `src/ai/characters.ts` — `SEEDS` → 4 zarezerwowane postacie; nowa `characterForSeed()`.
- `src/ai/NpcAgent.ts` — `character: CharacterDef` jako parametr zamiast `characterForIndex(treeIndex)`; `treeIndex` tylko do wyboru drzewa; `modelUrlForIndex` → dobór po `character.gender`.
- `src/ui/createVillagersScreen.ts` (opcjonalnie) — grupowanie NPC-ów po rodzinie w widoku.

## Poza zakresem v1

- Rozwój/migracja/przyrost rodzin, ekonomia, budżet wioski, ulepszanie budynków, specjalizacja obszarów, zaawansowane layouty (jak w draftcie).
- Wizualne rozróżnienie dziecko/dorosły poza ew. skalą modelu (brak assetu).
- Relacje rodzinne wpływające na gameplay (needs, dialog, questy) — czysto deskryptywne w v1.
- Questy między wioskami (dziedziczone z `multi-settlements.md`).
- Persystencja rodzin/wiosek w save — niepotrzebna, wszystko deterministyczne z seeda.

## Done when

- [x] `families.ts`: `rollVillageSize`/`generateFamilies` deterministyczne z seeda, floor 2 zarezerwowanych rodzin dla home, testy jednostkowe (vitest) na rozkład rozmiaru per terrain i na floor (`src/settlement/families.test.ts`).
- [x] `SettlementDef` niesie `size`+`families`; `npcCount`/`npcNames` usunięte.
- [x] Liczba chatek = liczba rodzin (nie zawsze 3); NPC-e przypisane 1:1 do domu swojej rodziny.
- [x] Home-osada dalej ma NPC-ów o imionach Anna/Piotr/Kasia/Marek z tymi samymi rolami/traits co dziś — questy v1 bez regresji (statycznie, patrz „Do przetestowania" dla weryfikacji w przeglądarce).
- [x] Teren pod klastrami domów/obiektów wspólnych widocznie płynniejszy (spłaszczony), ale nie idealnie płaski dysk — reużywa `sampleRawTexel`/`applyRoadTint` (statycznie zaimplementowane, wizualna weryfikacja jeszcze do zrobienia).
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` czyste.

## Do przetestowania (http://localhost:5577/) — jeszcze nie wykonane

1. Kilka seedów (`?seed=`) — rozmiar wiosek widocznie różny między osadami (SM/MD/LG), zgodnie z ich terenem (więcej domów w lesie/na równinie, mniej w górach/pustyni).
2. Home-osada (spawn gracza) — Anna/Piotr/Kasia/Marek nadal obecni, dialog i questy v1 (`[E]`, quest log `[L]`) działają jak wcześniej.
3. Domy nie zachodzą na siebie ani na studnię/skład; wioska nie wygląda jak jeden wielki płaski dysk, tylko kilka mniejszych spłaszczonych plam terenu.
4. Ekran „Mieszkańcy" pokazuje relację (mąż/żona/dziecko) obok roli/osobowości; dziecko widocznie mniejsze od dorosłych.
5. Sanity check regresji: chodzenie, sprint, drogi między osadami (`roads-and-paths.md`) nadal widoczne i nie kolidują wizualnie z nowymi obszarami wioski.

## Następnie

- Wizualne rozróżnienie dziecko/dorosły (osobny model/skala), jeśli dojdą assety.
- Relacje rodzinne wpływające na needs/dialog (np. rodzina jada/odpoczywa razem) — dopiero po tym, jak fundament z tego planu się sprawdzi.
- Rozwój wioski (nowe rodziny, nowe domy, zanik/migracja) — patrz „Kierunek na przyszłość" w draftcie, świadomie odłożone.

## Powiązane

- [multi-settlements.md](./2026-08-07--025--multi-settlements.md) — siatka osad, streaming, `SettlementDef`, ochrona home-osady jako precedens.
- [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md) — `CharacterDef`, Big Five, `HealthState`, ekran „Mieszkańcy" — ten plan buduje na tym, nie duplikuje.
- [roads-and-paths.md](./2026-08-07--026--roads-and-paths.md) — wzorzec spłaszczania terenu (`RoadCorridorSegment`/`sampleRawTexel`/`applyRoadTint`) reużyty dla `ClearingSegment`.
- [biome-regions.md](./2026-08-07--028--biome-regions.md) — ta sama warstwa `sampleRawTexel`/`ChunkTileData`.
- `src/settlement/settlementGenerator.ts`, `src/settlement/createSettlement.ts`, `src/settlement/props.ts`, `src/ai/characters.ts`, `src/ai/NpcAgent.ts`, `src/terrain/chunkHeightmap.ts`
