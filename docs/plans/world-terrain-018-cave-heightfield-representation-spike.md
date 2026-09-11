# Plan: Cave Heightfield Representation Spike

**Created:** 2026-09-10  
**Status:** `verification needed` 🔍  
**Implemented at:** 2026-09-11 (iteration 2 — rounded 2.5D representation)  
**Priority:** high · **Effort:** M  
**Depends on:** none  
**Domain:** `world-terrain`  
**Type:** `infrastructure`  
**Subdomains:** `terrain` `rendering`  
**Tags:** `caves` `heightfield` `prototype` `performance`  
**Roadmap:** -

> **Superseded for the target representation (2026-09-11).** §4, §7, §8 i §9
> tego planu opisują model `binary footprint + flat floor + flat ceiling +
> explicit boundary walls`. Pierwsza implementacja pokazała, że to jest
> właśnie wada, a nie cel. Docelową reprezentację definiuje teraz
> `docs/design/caves/06-heightfield-cave-representation-design.md`
> (`floorY` + `ceilingY`, footprint = `gap > 0`, ściany powstają przez
> zbieżność floor/ceiling). Cel spike'a (§1–§3), harness (§5, §6, §10),
> metryki (§11), fixtures (§12), ograniczenia 2.5D (§13), non-goals (§14),
> guardraile (§15) i kryteria decyzji (§18) pozostają aktualne.

## 1. Cel

Sprawdzić w izolowanej, szybko uruchamianej scenie debugowej, czy Cave V2 może używać znacznie tańszej reprezentacji opartej o lokalny footprint + wysokość podłogi + wysokość sufitu zamiast pełnego lokalnego 3D SDF.

Spike ma odpowiedzieć na dwa pytania jednocześnie:

1. czy reprezentacja 2.5D `floor + ceiling + boundary walls` daje wystarczającą jakość wizualną;
2. czy jaskinia z tej reprezentacji jest poprawna i naturalna w użyciu z perspektywy chodzącego gracza, przy zdecydowanie niższym koszcie generacji.

To jest **eksperyment porównawczy**, nie migracja produkcyjnego Cave V2.

## 2. Kontekst

Aktualny produkcyjny Cave V2 zachowuje rozdział:

```text
CaveTopology
    ↓
CaveSdfSpatialRepresentation
    ↓
render extraction / gameplay queries / collision
```

`CaveTopology` jest representation-neutral i już opisuje wejście, nodes, segments/centerlines, target width/height oraz features. Spike ma zachować ten kontrakt i podmienić wyłącznie reprezentację przestrzenną/presentation w izolowanym harnessie.

Historyczny Generalized Sweep nie jest wariantem, do którego wracamy. Jego ring/tube construction pozostaje odrębnym, odrzuconym podejściem.

## 3. Hipoteza

Dla jaskini, w której dla jednego `(x, z)` wystarcza pojedyncza podłoga i pojedynczy sufit, można reprezentować wnętrze przez:

```text
CaveTopology
    ↓
CaveHeightfieldRepresentation
    ├─ footprint / inside mask
    ├─ floorY(x, z)
    ├─ ceilingY(x, z)
    └─ footprint boundary
            ↓
       floor mesh
       ceiling mesh
       boundary wall mesh
```

Koszt powinien skalować się przede wszystkim z powierzchnią `X × Z`, zamiast z objętością `X × Y × Z` wymaganą przez gridową ekstrakcję SDF.

## 4. Kluczowa decyzja reprezentacji

Nie modelować pionowych ścian jako ekstremalnie stromych fragmentów heightmapy.

Heightfield ma odpowiadać wyłącznie za podłogę i sufit. Ściany mają być generowane z granicy footprintu poprzez połączenie odpowiednich punktów `floorY` i `ceilingY`.

Dzięki temu:

- pionowe/niemal pionowe ściany nie walczą z ograniczeniem jednej wysokości na `(x,z)`;
- szerokość tunelu/chamber pozostaje jawna w footprint;
- floor i ceiling mogą mieć niezależny noise/shape;
- mesh pozostaje prosty i tani.

## 5. Izolowany harness

Nie uruchamiać pełnego świata do iteracji nad spike'em.

Dodać lekki tryb URL zgodny z istniejącym wzorcem `?modelTest`:

```text
?caveHeightfieldTest
```

Tryb ma ominąć:

- save/start screen;
- terrain chunk streaming;
- settlements;
- NPC/fauna;
- economy;
- weather/audio/UI świata;
- `WorldBundle`.

Scena ma zawierać tylko elementy potrzebne do porównania reprezentacji:

- renderer;
- lokalny surface terrain fixture;
- jedno wejście;
- jedną deterministyczną `CaveTopology`;
- wariant heightfield;
- wariant SDF do porównania;
- model gracza / jednoznaczny humanoidalny model skali;
- dwa tryby kamery/testu: **Walk** i **Inspect**.

Nie tworzyć drugiego projektu Vite ani osobnego package/app.

### 5.1. Walk mode — obowiązkowy

Harness musi pozwolić wejść do jaskini i przejść ją jako gracz.

Minimalne wymagania:

- model gracza widoczny w third-person;
- WASD / obecny podstawowy schemat ruchu desktopowego;
- kamera zachowująca się możliwie podobnie do produkcyjnej third-person camera;
- grawitacja / przyklejenie do podłoża;
- kolizja z cave floor, boundary walls i ceiling;
- możliwość wejścia z powierzchni przez mouth/portal do wnętrza;
- brak przechodzenia przez ściany, sufit i podłogę;
- spawn przed wejściem, aby test obejmował transition surface → cave.

Nie importować pełnego `PlayerController`, jeśli wymaga on szerokiego runtime/world context. Preferować mały debugowy kontroler ruchu, ale reużywać istniejące czyste parametry/algorytmy ruchu lub collision, jeśli da się to zrobić bez bootowania świata.

Walk mode nie ma implementować survivalu, stamina, inventory, interaction, combat ani innych systemów gracza.

**Invariant ground resolution (dodany po review).** Gdy gracz jest stabilnie wewnątrz jaskini, outdoor surface heightmap nie może przejąć ground resolution — żadnego snapu na powierzchnię, wypchnięcia w górę ani „swimu" po niewidzialnym terenie nad podłogą jaskini. Harness reużywa produkcyjny łańcuch zamiast wyprowadzać własną regułę:

```text
column intervals (clipped do analytic surface, SURFACE_CLIP_EPS)
    ↓ pickInterval(y)                 ← caveSdfQuery, CAVE_FLOOR_GRACE
applyCaveGroundHysteresis(...)        ← caveSdfQuery, CAVE_UNDERGROUND_MISS
    ↓
floorY / ceilingY  |  outdoor surface
```

Oba warianty (heightfield i SDF) przechodzą przez ten sam seam (`CaveWalkWorld`), więc różnica w Walk mode jest różnicą reprezentacji, nie kontrolera. Sondy slope/kamery używają produkcyjnego `withCaveFloorFallback`, a occupancy kamery mirroruje `occupancyIntervalAt`.

### 5.2. Inspect mode — obowiązkowy

Drugi tryb ma używać `OrbitControls` lub równoważnej lekkiej kamery inspekcyjnej, aby można było:

- obejrzeć cave z zewnątrz i od środka;
- sprawdzić floor/walls/ceiling i seam wejścia;
- wykrywać dziury, odwrócone normale, przecinanie geometrii i artefakty footprintu;
- porównać warianty SDF i heightfield z podobnych ujęć.

Przełączenie Walk ↔ Inspect powinno być proste i nie wymagać reloadu całej aplikacji.

## 6. Surface fixture i wejście

Spike ma mieć mały lokalny fragment terenu, wystarczający do czytelnego wejścia i oceny relacji cave ↔ surface. Nie kopiować całego chunk pipeline.

Fixture powinien zawierać:

- łagodny obszar podejścia;
- realny stok wokół wejścia;
- pagórkowaty teren przebiegający nad tunelem/chamber;
- wystarczający overburden nad dalszą częścią jaskini.

**Aktualizacja po review (2026-09-10).** Ręcznie rysowany cliff/ridge fixture był zbyt sztuczny, żeby ocenić Cave V2 w kontakcie z rzeczywistym ukształtowaniem świata. Harness używa teraz produkcyjnego czystego samplera terenu:

```text
worldConfig.defaultTerrainConfig()   → RawSampleParams
chunkHeightmap.sampleHeightAt(x, z)  → analityczna wysokość (bez ChunkManagera/workera)
mouthCarve.mouthCarveDepth(x, z)     → produkcyjna nisza wejścia
```

To jest ta sama funkcja, którą `ChunkManager` udostępnia jako `sampleBaseHeight`, a `createCaves()` podaje Cave V2 jako `analyticSurfaceHeight`. Lokalne współrzędne harnessu są mapowane na stały world anchor (`caveHeightfieldTerrain.ts`), wybrany tak, aby podejście opadało na zewnątrz, a teren wznosił się nad tunelem — powierzchnia jest ~12–14 m nad graczem w najgłębszej komorze.

Obowiązkowe: heightfield i SDF budowane są na **dokładnie tym samym** samplerze (`caveHeightfieldBaseSurfaceAt`). Chodzony/renderowany teren (`caveHeightfieldWalkSurfaceAt`) to ten sam sampler minus produkcyjna nisza wejścia — tak samo, jak produkcja rozdziela `sampleBaseHeight` (clipping jaskini) od zmodyfikowanej heightmapy (grunt gracza).

Ważne: spike nadal nie rozwiązuje produkcyjnego proceduralnego wyboru i deformacji terenu wokół wejścia — fixture tylko *anchoruje* ręcznie zapisaną topologię do prawdziwego terenu (`minSurfaceOverFootprint` + `mouthOverburdenRequirement`, te same reguły co `productionTopology.ts`).

## 7. Footprint generation

Footprint ma wynikać z istniejącego `CaveTopology`, nie z ręcznie narysowanego finalnego kształtu.

Minimalny kierunek:

1. projekcja `topology.segments[].centerline` do XZ;
2. resampling centerline w stałym kroku;
3. interpolacja `targetWidth` między nodes;
4. rasteryzacja/union lokalnych dysków lub kapsuł do maski 2D;
5. chamber/widening wynikają z większych `targetWidth`, a nie z osobnej równoległej definicji;
6. opcjonalne małoskalowe odkształcenie granicy/noise po utworzeniu bazowego footprintu.

Nie wprowadzać SDF 2D tylko dlatego, że istnieje SDF 3D, jeśli prostszy distance-to-centerline / capsule raster wystarczy do spike'a.

## 8. Floor i ceiling

Dla komórek wewnątrz footprintu wyprowadzić co najmniej:

```text
floorY(x,z)
ceilingY(x,z)
```

Bazowe wysokości mają wynikać z topology centerline i node `targetHeight`.

Wymagania:

- floor może opadać/wznosić się zgodnie z centerline Y;
- ceiling nie może być prostym globalnym offsetem od powierzchni;
- target height ma kontrolować lokalny clearance;
- floor i ceiling mogą mieć niezależne, deterministyczne nierówności;
- zachować minimalny clearance wymagany przez `CaveTopology.minClearance`;
- nierówności nie mogą losowo zamykać tunelu.

## 9. Mesh i collision proxy

Wygenerować trzy logiczne części geometrii:

```text
floor
ceiling
boundary walls
```

Mogą trafić do jednego `BufferGeometry`, jeśli to upraszcza kod i pomiary.

Ceiling musi mieć poprawny winding/normals widoczne od wnętrza. Boundary walls muszą łączyć floor z ceiling bez szczelin.

Walk mode wymaga również lekkiego collision proxy. Nie budować drugiego kompletnego systemu fizyki. Proxy powinno wynikać z tej samej reprezentacji heightfield/footprint, a nie z niezależnej ręcznie utrzymywanej geometrii kolizji.

Nie próbować podczas spike'a odtwarzać wszystkich finalnych efektów materiałowych produkcyjnego Cave V2. Wspólny/prosty materiał jest wystarczający do oceny geometrii.

## 10. SDF comparison

Harness powinien umożliwiać porównanie **tej samej** `CaveTopology` w co najmniej dwóch wariantach:

```text
heightfield
sdf
```

Porównanie powinno być możliwe zarówno w Inspect mode, jak i podczas przejścia jaskini w Walk mode.

Dopuszczalne UI:

- parametr URL;
- prosty klawisz toggle;
- minimalny debug control.

Nie utrzymywać dwóch produkcyjnych cave systems. SDF w harnessie służy wyłącznie jako baseline jakości i kosztu.

## 11. Metryki

Dla obu wariantów zmierzyć co najmniej:

- representation/build time;
- mesh generation/extraction time;
- total generation time;
- vertices;
- triangles;
- final geometry bytes lub porównywalny estymowany rozmiar.

Dla heightfield dodatkowo warto raportować:

- grid resolution / cell size;
- liczba komórek footprintu;
- boundary edge count.

Pomiary mają obejmować samą reprezentację/geometry, nie koszt pełnego bootu aplikacji.

## 12. Przypadki testowe w spike'u

Nie kończyć oceny na jednym prostym korytarzu. Ten sam harness powinien dać co najmniej trzy deterministyczne topology fixtures:

1. **passage + chamber** — obecny podstawowy archetype;
2. **bend + widening** — sprawdzenie granic, ścian i interpolacji floor/ceiling;
3. **branch / junction** — sprawdzenie union footprintu i zachowania ścian przy połączeniu.

Każdy fixture musi być możliwy do przejścia w Walk mode, o ile topology sama nie definiuje celowo nieprzechodniego fragmentu.

Jeżeli obecny production topology builder łatwo daje odpowiedni fixture bez world dependencies, można go reuse. Jeśli wymaga szerokiego world context, użyć małych, jawnych `CaveTopology` fixtures zamiast wciągać world boot do harnessu.

## 13. Ograniczenia, które spike ma jawnie pokazać

Reprezentacja z pojedynczym `floorY` i `ceilingY` dla `(x,z)` **nie obsługuje ogólnego multi-level 3D**.

Wynik spike'a musi więc odnotować zachowanie/ograniczenie dla:

- crossing tunnels na różnych wysokościach;
- stacked passages;
- vertical shafts;
- natural bridges;
- true internal overhangs/shelves wymagających więcej niż jednego przedziału solid/void w tej samej kolumnie XZ.

Nie maskować tego ograniczenia dodatkowymi wyjątkami podczas spike'a.

Pojedynczy shelf/rock feature może być pokazany jako osobny derived mesh tylko jeśli jest to mały eksperyment i jasno nie udaje rozwiązania ogólnego multi-level representation.

## 14. Non-goals

W tym planie nie:

- zmieniać produkcyjnego `createCaves()`;
- zmieniać `CaveSdfSpatialRepresentation`;
- usuwać SDF;
- zmieniać cave streaming/worker lifecycle;
- zmieniać collision/gameplay query production ownership;
- przepisywać produkcyjnego `PlayerController` ani third-person camera;
- odtwarzać wszystkich systemów gracza w harnessie;
- zmieniać save/persistence;
- zmieniać proceduralnego world siting caves;
- integrować nowej reprezentacji z realnymi terrain chunks;
- rozwiązywać fauna/NPC navigation w jaskiniach;
- projektować pełnego multi-level cave system;
- robić unrelated refactorów renderer/debug framework.

## 15. Guardrails przeciw błędnym wnioskom

1. **Ta sama topology** — nie porównywać ładnego ręcznie ustawionego heightfieldu z inną jaskinią SDF.
2. **Nie mylić ze Sweep** — footprint/floor/ceiling nie może być ring sweepem przebranym za heightfield.
3. **Nie mierzyć world bootu** — interesuje nas koszt samej reprezentacji i mesha.
4. **Nie oceniać tylko z OrbitControls** — jaskinia musi zostać przejścia w Walk mode.
5. **Nie budować fake collision** — collision proxy ma wynikać z tej samej cave representation.
6. **Nie optymalizować przed pomiarem** — pierwsza wersja ma być prosta i czytelna.
7. **Nie rozszerzać produkcji** — wynik spike'a najpierw ocenia Player.
8. **Nie ukrywać 2.5D limitations** — brak stacked geometry jest architektonicznym trade-offem, nie bugiem do łatania wyjątkami.
9. **Nie duplikować topology truth** — szerokość/wysokość/path pochodzą z `CaveTopology`.
10. **Determinism** — topology fixture i noise mają być powtarzalne.
11. **Nie bootować pełnego gracza** — ruch testowy ma być tak lekki, jak pozwala na to wiarygodne sprawdzenie traversal/collision.

## 16. Oczekiwane pliki / integration surface

Najbardziej prawdopodobne miejsca zmian:

```text
src/debug/debugMode.ts
src/main.ts
src/app/createApp.ts
src/debug/createCaveHeightfieldTestScene.ts
src/debug/caves/caveHeightfieldTerrain.ts
src/debug/caves/caveHeightfieldFixtures.ts
src/debug/caves/caveHeightfieldRepresentation.ts
src/debug/caves/caveHeightfieldMesh.ts
src/debug/caves/caveHeightfieldTraversal.ts
src/debug/caves/caveHeightfieldWalkWorld.ts
src/debug/caves/caveHeightfieldPlayer.ts
```

Jeżeli da się bezpiecznie reuse istniejące czyste helpery ruchu/collision/camera, zrobić to zamiast kopiować ich logikę. Nie wolno jednak przez ten reuse wciągnąć normalnego world bootu.

Preferować trzymanie experimental representation pod `src/debug/caves/` dopóki spike nie zostanie zaakceptowany.

## 17. Weryfikacja techniczna

Agent implementacyjny:

- typecheck;
- lint dla zmienionego zakresu / normalny lint projektu;
- build;
- focused unit tests dla czystych builderów i collision queries, jeśli dają istotną wartość.

Player wykonuje manual browser verification.

Manual comparison powinien odpowiedzieć:

- czy wejście czyta się jako naturalne przejście z surface do wnętrza;
- czy da się płynnie wejść, przejść passage/bend/chamber i wrócić;
- czy gracz nie wpada w floor, nie przenika walls i nie przebija ceiling;
- czy kamera third-person zachowuje się sensownie w wąskich i szerokich fragmentach;
- czy passage/chamber nie wyglądają jak pipe;
- czy floor/walls/ceiling są naturalne i bez seams;
- czy bend/widening/junction są przekonujące;
- czy rozdzielczość potrzebna do dobrego wyglądu nadal daje istotną przewagę wydajnościową;
- czy ograniczenia 2.5D są akceptowalne dla kierunku Seedvale;
- czy gracz stabilnie wewnątrz jaskini nigdy nie zostaje snapnięty/wypchnięty na powierzchnię (także pod pagórkiem/overburden);
- czy third-person camera nie parkuje na stoku nad jaskinią.

## 18. Kryterium decyzji po spike'u

Spike nie powinien automatycznie zmienić reprezentacji produkcyjnej.

Po manual comparison zapisać wynik jako osobny review/decision note z jedną z decyzji:

```text
A. reject heightfield → zostać przy SDF
B. promising but insufficient → kolejny ograniczony spike
C. accept direction → przygotować osobny plan migracji Cave V2
```

Wariant C wymaga zarówno akceptowalnej jakości wizualnej, jak i poprawnego Walk mode/traversal. Dopiero wtedy można planować zmiany `createCaves()`, gameplay queries, collision i streaming.

## 19. JSDoc / discoverability

Ważne publiczne/czyste funkcje reprezentacji, meshera i lekkiego traversal/collision opisać JSDocem wskazującym, że należą do **experimental cave heightfield spike**, oraz dodać `@domain world-terrain` tam, gdzie poprawia to późniejszy preflight/code-map discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
