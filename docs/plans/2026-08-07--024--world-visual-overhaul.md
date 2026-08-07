# Plan: Wizualny overhaul świata (rośliny, niebo/chmury, góry w tle)

**Status:** `in progress` — część 1 (roślinność) i 2 (kolor nieba, bez chmur) zaimplementowane; część 3 (góry) i chmury z części 2 nadal `planned`
**Created:** 2026-08-07
**Priority:** średni — kolejkowane **po** [terrain-worker-pool](./2026-08-07--006--terrain-worker-pool.md) (obecny priorytet #1); nie zakłada istnienia workerów, tylko dzisiejszy main-thread kod. Części 1+2 wykonane równolegle do worker-poola (zero styku plików), część 3 (wymaga `createApp.ts`) odłożona do po scaleniu worker-poola.

## Potrzeba

Inspiracja: devlog SimonDev o jego MMORPG. Trzy konkretne braki w dzisiejszym świecie Seedvale:

1. Tylko 2 typy drzew, brak krzewów/różnorodności rozmiarów w lasach (`src/settlement/props.ts`)
2. Niebo (`src/world/createSky.ts`, Preetham/`Sky.js`) wygląda "wypłukane na biało", brak chmur
3. Teren urywa się płasko na krawędzi mapy (`halfExtent`) bez żadnego tła — SimonDev ma ładne szczyty górskie widoczne w oddali

Potwierdzone przy planowaniu: projekt **nie musi** trzymać się sztywno stylu low-poly/CC0-only — może iść w bardziej realistyczne modele/efekty tam gdzie to ma sens.

Osobno rozważony i **odrzucony na teraz**: pipeline Mixamo→Blender→glTF, którego SimonDev użył do NPC (za Doc McCurdy). Modele postaci w `public/models/characters/*.glb` (Quaternius) już mają pełny zestaw animacji (`Idle`, `Walk`, `Run`, `Run_Back`, `Roll`, `Wave`, combat clips itd. — potwierdzone rozpakowaniem JSON-chunka z GLB). Pipeline zostaje jako **opcja na przyszłość**, gdyby zabrakło konkretnej animacji/modelu, którego Quaternius nie ma.

## 1. Więcej odmian roślinności — `done`

Rozszerzyć `src/settlement/props.ts` bez nowej abstrakcji:

- `TREE_URLS` → 3 pozycje (`tree_a.glb`, `tree_b.glb`, nowy `tree_c.glb`), lekko różne target height zamiast jednej stałej 4.2
- Nowa `BUSH_URLS` (`bush_a.glb`, `bush_b.glb`), target height ~1.0–1.4
- `loadTreeTemplates()` → osobne wywołania dla drzew i krzewów (ten sam wzorzec `loadPropOrFallback`)
- `cloneTree` → uogólnić na `cloneProp(templates, index, scale)` (już prawie to robi dziś)
- `plantTreeCluster`: wybór gatunku zależny od pozycji w promieniu klastra (krzewy bliżej brzegu/mniejsza skala, duże drzewa bliżej centrum) zamiast czystego round-robin
- Fallbacki: `createTree()` zostaje fallbackiem dla drzew; dodać `createBush()` (spłaszczona kula, flat shading, w stylu `createStockpile()`) jako fallback dla krzewów

**Assety — nieblokujące.** `loadPropOrFallback` już dziś łapie błąd ładowania i używa fallbacku, więc `tree_c.glb`/`bush_a.glb`/`bush_b.glb` mogą fizycznie nie istnieć w `public/models/nature/` i gra i tak wyrenderuje się poprawnie proceduralnym fallbackiem. Źródło docelowe: Quaternius "Ultimate Stylized Nature" (CC0, glTF) — zidentyfikowane w [research/2026-08-07-3d-asset-sources.md](../research/2026-08-07-3d-asset-sources.md). Zero zmian w kodzie potrzebnych, gdy user podrzuci pliki pod właściwą nazwą.

## 2. Niebo: gradient (`done`) + chmury (`planned`)

**Fix "wypłukanego" wyglądu** (niezależnie od chmur) — `done`, 2 iteracje: w `src/world/dayNight.ts` (`skyParamsFromTime`) dzienne `rayleigh` sięgało ~2.6 przy południu — pierwsza próba (podniesienie `rayleigh` do 3.4 licząc na "głębszy błękit") pogorszyła sprawę. Sprawdzone w źródle `node_modules/three/examples/jsm/objects/Sky.js`: domyślny `rayleigh` shadera to **1** — wysoki `rayleigh` pcha człon ekstynkcji (`Fex`) w stronę 0 na całej kopule, co saturuje każdy kanał koloru i zaciera różnicę per-długość-fali odpowiedzialną za błękit (stąd biel/szarość zamiast koloru — potwierdzone manualnym testem usera: turbidity 1-2 + rayleigh 3.5 + wysokie słońce = dalej biało). Poprawka: `rayleigh` bliżej natywnej skali shadera (`0.85 + dayFactor * 0.95`, południe: 1.8), `turbidity` zostaje głównym driverem ciepłego/mglistego horyzontu przy niskim słońcu (`1.6 + (1 - |elev|) * 2.8`, południe: 1.6, horyzont: 4.4). **Zweryfikowane przez usera (2026-08-07):** średnio/słabo, ale "ujdzie" — odłożone na razie, nie dalszej iteracji teraz. Wrócić do tego przy okazji chmur (część 2 dalej) albo jeśli ktoś zgłosi że nadal razi.

**Chmury:** gotowy PNG asset (nie proceduralna canvas-tekstura) — płaskie sprite'y/quady z miękką alfa-teksturą chmury (`public/textures/cloud.png`, CC0), rozmieszczone na stałej wysokości ~150–200 (poniżej `fogFar` max 260, poniżej `camera.far`=500), billboard tylko po osi Y, wolny drift z wrapem na promieniu. Fallback: mała proceduralna canvas-tekstura, gdyby PNG nie załadował się poprawnie (spójne z `loadPropOrFallback`-owym wzorcem gdzie indziej).

Odrzucone: noise-shader na kopule (custom `ShaderMaterial` — nikt dziś w projekcie tego nie pisze, koszt nieproporcjonalny); instanced low-poly puffs (ładniejsze BOTW-style, ale większy scope niż uzasadnia kosmetyczna poprawka).

**Nowy plik:** `src/world/createClouds.ts` — wzorzec jak `createSky.ts`/`createOcean.ts` (`addTo(scene)`, `update(dt)`, `dispose()`), wpięty w `createApp.ts` obok `sky`/`ocean` w `tick()`.

## 3. Górski horyzont

Jeden statyczny mesh — pierścień/sylwetka gór, promień poza `halfExtent` (dziś 64, z `worldConfig.terrain.size=128`) + margines, np. r≈180–220 (mieści się przed `fogFar` 260 i `camera.far` 500). Wierzchołki górnej krawędzi przesunięte pionowo przez `fbm01()` z `src/terrain/fbm.ts` (reużycie istniejącej funkcji, nowy seed tylko na sylwetkę szczytów). Materiał: `flatShading: true` (spójne z `biomeColors.ts`/`props.ts`), stonowany fioletowo-niebieski, `fog: true` żeby wtapiał się o zmierzchu/nocy, bez cieni (`castShadow`/`receiveShadow` = false — to tło, nie gameplay). Brak LOD/streamingu — to **nie** jest to samo co duży/sferyczny świat ([world-streaming-persistence](./2026-08-07--007--world-streaming-persistence.md), osobna dużo większa inicjatywa) — statyczna geometria budowana raz przy starcie/rebuildzie świata, tak jak `terrain.mesh`.

Parametry (promień, wysokość szczytów, kolor) na sztywno w kodzie, nie w `worldConfig.ts`/GUI — kosmetyczne tło, nie wymaga live-tuningu.

**Nowy plik:** `src/world/createMountains.ts` (`create(): { mesh, dispose }`, statyczny, brak `update`), wpięty w `createApp.ts` obok `sky.addTo(scene)`.

Odrzucone: reużycie pełnego `createTerrainMesh` w mniejszej rozdzielczości na tło — nadmiarowe (heightmap sampling, biome colors, water-level logic niepotrzebne dla nieinteraktywnego tła).

## Świadomie poza teraz

- Chmury objętościowe / dynamiczna pogoda
- Więcej niż ~5 gatunków roślin, density-based LOD dla propsów
- Góry jako część proceduralnej generacji terenu / streaming (osobna inicjatywa)
- Mixamo→Blender pipeline (notatka-na-przyszłość, nie temat do implementacji teraz)

## Weryfikacja (po implementacji)

- `npm run dev` → wizualna inspekcja: niebo mniej "białe", chmury na horyzoncie, góry w tle poza krawędzią terenu, mieszanka drzew/krzewów w klastrach lasu
- Cykl dzień/noc (`timeMultiplier` w GUI) — góry/chmury wtapiają się we mgłę o zmierzchu/nocy, nie "wystają" ostro
- Brak regresji: NPC/fauna/gracz nadal chodzą poprawnie po terenie (krzewy/drzewa to tylko wizualne propsy, bez collision dziś)
- `npx tsc --noEmit` — brak błędów typów

## Powiązane

- [research/2026-08-07-3d-asset-sources.md](../research/2026-08-07-3d-asset-sources.md) — Quaternius pack
- [research/2026-08-07-simodev-refs-review.md](../research/2026-08-07-simodev-refs-review.md) — audyt referencji SimonDev
- [plans/2026-08-07--006--terrain-worker-pool.md](./2026-08-07--006--terrain-worker-pool.md) — blokuje start (kolejność)
- [plans/2026-08-07--007--world-streaming-persistence.md](./2026-08-07--007--world-streaming-persistence.md) — osobna inicjatywa, nie mylić z góralnym tłem tutaj
- [plans/2026-08-07--028--biome-regions.md](./2026-08-07--028--biome-regions.md) — kontynuacja "więcej roślinności" w stronę makro-obszarów o odrębnym charakterze (pustynia/bagno/las)
- `src/settlement/props.ts`, `src/world/createSky.ts`, `src/world/dayNight.ts`, `src/terrain/fbm.ts`, `src/app/createApp.ts`, `src/scene/createCamera.ts`
