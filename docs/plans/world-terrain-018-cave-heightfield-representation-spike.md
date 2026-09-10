# Plan: Cave Heightfield Representation Spike

**Created:** 2026-09-10  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** none  
**Domain:** `world-terrain`  
**Type:** `infrastructure`  
**Subdomains:** `terrain` `rendering`  
**Tags:** `caves` `heightfield` `prototype` `performance`  
**Roadmap:** -

## 1. Cel

Sprawdzić w izolowanej, szybko uruchamianej scenie debugowej, czy Cave V2 może używać znacznie tańszej reprezentacji opartej o lokalny footprint + wysokość podłogi + wysokość sufitu zamiast pełnego lokalnego 3D SDF.

Spike ma odpowiedzieć na pytanie architektoniczne przed dalszą optymalizacją reprezentacji SDF:

> Czy dla obecnego i przewidywalnego krótkoterminowo kształtu jaskiń Seedvale reprezentacja 2.5D `floor + ceiling + boundary walls` daje wystarczającą jakość wizualną i gameplayową przy zdecydowanie niższym koszcie generacji?

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

Dodać lekki tryb URL zgodny z istniejącym wzorcem `?modelTest`, roboczo:

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
- camera + `OrbitControls`;
- światło;
- lokalny surface terrain fixture;
- jedno wejście;
- jedną deterministyczną `CaveTopology`;
- wariant heightfield;
- wariant SDF do porównania;
- prosty obiekt referencyjny o rozmiarze człowieka lub inne jednoznaczne odniesienie skali.

Nie tworzyć drugiego projektu Vite ani osobnego package/app.

## 6. Surface fixture i wejście

Spike ma mieć mały lokalny fragment terenu, wystarczający do czytelnego wejścia i oceny relacji cave ↔ surface. Nie kopiować całego chunk pipeline.

Fixture powinien zawierać:

- płaski/łagodny obszar podejścia;
- lokalny stromy stok / skalną ścianę;
- wejście umieszczone w tej ścianie;
- wystarczający overburden nad dalszą częścią jaskini.

Ważne: "pionowa ściana wejścia" jest elementem fixture/prototypu. Spike nie ma jeszcze rozwiązywać produkcyjnego proceduralnego wyboru i deformacji realnego terenu wokół wejścia.

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

## 9. Mesh

Wygenerować trzy logiczne części geometrii:

```text
floor
ceiling
boundary walls
```

Mogą trafić do jednego `BufferGeometry`, jeśli to upraszcza kod i pomiary.

Ceiling musi mieć poprawny winding/normals widoczne od wnętrza. Boundary walls muszą łączyć floor z ceiling bez szczelin.

Nie próbować podczas spike'a odtwarzać wszystkich finalnych efektów materiałowych produkcyjnego Cave V2. Wspólny/prosty materiał jest wystarczający do oceny geometrii; warianty powinny jednak być oświetlone w sposób pozwalający czytać floor/walls/ceiling.

## 10. SDF comparison

Harness powinien umożliwiać porównanie **tej samej** `CaveTopology` w co najmniej dwóch wariantach:

```text
heightfield
sdf
```

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
- zmieniać third-person camera;
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
4. **Nie optymalizować przed pomiarem** — pierwsza wersja ma być prosta i czytelna.
5. **Nie rozszerzać produkcji** — wynik spike'a najpierw ocenia Player.
6. **Nie ukrywać 2.5D limitations** — brak stacked geometry jest architektonicznym trade-offem, nie bugiem do łatania wyjątkami.
7. **Nie duplikować topology truth** — szerokość/wysokość/path pochodzą z `CaveTopology`.
8. **Determinism** — topology fixture i noise mają być powtarzalne.

## 16. Oczekiwane pliki / integration surface

Najbardziej prawdopodobne miejsca zmian:

```text
src/debug/debugMode.ts
src/main.ts
src/app/createApp.ts
src/debug/createCaveHeightfieldTestScene.ts
src/world/caves/caveHeightfieldRepresentation.ts
src/world/caves/caveHeightfieldMesh.ts
```

Jeżeli reprezentacja ma istnieć wyłącznie na czas spike'a, dopuszczalne jest trzymanie builderów pod `src/debug/caves/` zamiast `src/world/caves/`. Preferować tę opcję, jeśli produkcyjny kod nie musi jeszcze niczego importować.

Nie zakładać nazw plików jako obowiązkowych, jeśli current code podczas implementacji pokazuje lepszy istniejący seam.

## 17. Weryfikacja techniczna

Agent implementacyjny:

- typecheck;
- lint dla zmienionego zakresu / normalny lint projektu;
- build;
- focused unit tests dla czystych builderów, jeśli dają istotną wartość.

Player wykonuje manual browser verification.

Manual comparison powinien odpowiedzieć:

- czy wejście czyta się jako naturalne przejście z surface do wnętrza;
- czy passage/chamber nie wyglądają jak pipe;
- czy floor/walls/ceiling są naturalne i bez seams;
- czy bend/widening/junction są przekonujące;
- czy rozdzielczość potrzebna do dobrego wyglądu nadal daje istotną przewagę wydajnościową;
- czy ograniczenia 2.5D są akceptowalne dla kierunku Seedvale.

## 18. Kryterium decyzji po spike'u

Spike nie powinien automatycznie zmienić reprezentacji produkcyjnej.

Po manual comparison zapisać wynik jako osobny review/decision note z jedną z decyzji:

```text
A. reject heightfield → zostać przy SDF
B. promising but insufficient → kolejny ograniczony spike
C. accept direction → przygotować osobny plan migracji Cave V2
```

Dopiero wariant C może prowadzić do zmian `createCaves()`, gameplay queries, collision i streaming.

## 19. JSDoc / discoverability

Ważne publiczne/czyste funkcje reprezentacji i meshera opisać JSDocem wskazującym, że należą do **experimental cave heightfield spike**, oraz dodać `@domain world-terrain` tam, gdzie poprawia to późniejszy preflight/code-map discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
