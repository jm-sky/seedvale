# Plan: House Browser

**Created:** 2026-08-26  
**Status:** `verification needed` 🔍 — implemented + technically verified (`tsc`/lint/build/test all green, 1904 tests); browser/manual verification (§9) not yet performed.  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~111~~  
**Domain:** `settlements`

## 1. Cel i zasady

Dodać minimalny standalone **House Browser**, który pozwala szybko wczytać istniejącą `HouseDefinition` i obejrzeć wynik składania przez ten sam `HouseBuilder`, którego używa właściwa gra.

Uruchomienie:

```text
?houseTest=COTTAGE_4X4_A
```

lub:

```text
?houseTest
```

→ pierwsza dostępna definicja.

Browser nie uruchamia świata, terrainu, NPC, settlementów, save'ów ani gameplayu.

Nie tworzyć alternatywnej logiki składania domu, drugiego asset registry/cache ani osobnego systemu edycji.

## 2. Debug entrypoint

Dodać:

```text
src/debug/createHouseTestScene.ts
```

Wzorować strukturę na istniejącym `createModelTestScene.ts`.

Odpowiedzialność:

- minimalny Three.js `Scene`,
- renderer,
- kamera,
- `OrbitControls`,
- ground i grid,
- podstawowe światło,
- `ConstructionCatalog`,
- wybór `HouseDefinition`,
- przygotowanie template'ów przez istniejące API `HouseBuilder`,
- utworzenie `HouseAssembly`,
- dodanie `HouseAssembly.root` do sceny,
- render loop,
- resize,
- cleanup.

Nie używać `createApp()` ani world bootstrapu.

## 3. URL i debug flow

Zmodyfikować:

```text
src/debug/debugMode.ts
src/main.ts
```

Dodać:

```ts
isHouseTestMode()
houseDefinitionFromUrl()
```

Przepływ:

```text
main.ts
  ↓
?houseTest=...
  ↓
createHouseTestScene()
  ↓
HouseDefinition
  ↓
HouseBuilder
  ↓
HouseAssembly
```

`houseTest` ma pierwszeństwo przed `modelTest`. Normalny boot gry pozostaje bez zmian.

## 4. HouseDefinition i HouseBuilder

Wykorzystać istniejące źródło definicji:

```text
src/assets/houseDefinitionExample.ts
```

Nie tworzyć nowego registry ani hardcoded mapy w debug scene.

Dla wybranej definicji wykorzystać istniejące API:

```text
houseDefinitionAssetIds(definition)
        ↓
loadHousePartTemplates(catalog, assetIds)
        ↓
HouseBuildContext
        ↓
HouseBuilder
        ↓
HouseAssembly
```

`HouseBuilder` jest już niezależny od `SettlementsManager`, więc nie należy go refaktoryzować ani kopiować jego logiki. Zmiany w `HouseBuilder` są poza zakresem, chyba że implementacja ujawni konkretny brak potrzebnego API.

### Wybór definicji

```text
?houseTest=COTTAGE_4X4_A
```

→ właściwa definicja.

```text
?houseTest
```

→ pierwsza dostępna definicja.

```text
?houseTest=FOO
```

→ czytelny błąd:

```text
Unknown house definition: FOO

Available:
COTTAGE_4X4_A
COTTAGE_4X4_B
...
```

Lista dostępnych definicji ma pochodzić dynamicznie z istniejącego źródła.

Nieznana definicja nie może uruchomić normalnego świata.

## 5. Scena i kamera

Scena zawiera wyłącznie:

```text
Scene
├── HouseAssembly.root
├── Ground
├── Grid
├── AmbientLight
└── DirectionalLight
```

Bez terrainu, chunków, sky/weather, NPC, playera, settlement runtime, save systemu, audio, physics i gameplay UI.

Kamera korzysta z istniejącego `OrbitControls`.

Po utworzeniu `HouseAssembly`:

- obliczyć bounding box `HouseAssembly.root`,
- ustawić target na środek bounds,
- ustawić początkowy dystans na podstawie rozmiaru bounds.

Dzięki temu browser działa również dla większych domów.

Ground i grid mają ułatwiać ocenę footprintu, pozycji i rotacji elementów.

## 6. Pozycje i zakres v1

Bez GUI edycji.

Pozycje elementów są poprawiane bezpośrednio w:

```text
src/assets/houseDefinitionExample.ts
```

a następnie sprawdzane po reloadzie browsera.

V1 nie zawiera:

- dropdownu,
- element pickera,
- transform gizmos,
- live editingu,
- inspectora,
- exportu pozycji,
- zapisu zmian.

## 7. Cleanup i błędy

`createHouseTestScene()` powinno poprawnie zwalniać zasoby:

```text
stop render loop
remove resize listener
controls.dispose()
HouseAssembly.dispose()
renderer.dispose()
renderer.domElement.remove()
```

Wykorzystać istniejące `HouseAssembly.dispose()` zamiast duplikować disposal jego zasobów.

Błędy wyboru definicji i ładowania assetów powinny zakończyć debug scene czytelnym komunikatem, bez fallbacku do normalnego world bootstrapu.

## 8. Testy

Testować logikę niezależną od renderowania Three.js:

- poprawny `houseTest` wybiera właściwą definicję,
- brak ID wybiera pierwszą definicję,
- nieznane ID zwraca czytelny błąd i listę dostępnych definicji,
- `modelTest` nadal działa,
- brak `houseTest` nadal uruchamia normalną grę,
- przy jednoczesnym `houseTest` i `modelTest` pierwszeństwo ma `houseTest`.

Nie pisać unit testów renderowania Three.js.

## 9. Browser verification

Ręcznie sprawdzić co najmniej:

```text
/?houseTest
/?houseTest=COTTAGE_4X4_A
```

oraz kilka innych istniejących definicji.

Sprawdzić:

- kompletność złożonego domu,
- poprawność pozycji elementów,
- dach i narożniki,
- otwarcia/drzwi,
- framing kamery,
- orbit i zoom,
- resize,
- cleanup/reload,
- obsługę nieznanej definicji.

Następnie porównać wizualnie wynik z domem składanym przez normalny settlement runtime.

Kluczowa weryfikacja: browser i normalna gra korzystają z tego samego `HouseDefinition` oraz `HouseBuilder`, więc wynik składania powinien być identyczny.

## 10. Zakres plików

### Nowy

```text
src/debug/createHouseTestScene.ts
```

### Modyfikowane

```text
src/debug/debugMode.ts
src/main.ts
```

### Wykorzystywane bez zmian

```text
src/assets/houseDefinitionExample.ts
src/assets/constructionCatalog.ts
src/settlement/houseBuilder.ts
src/render/createRenderer.ts
```

## 11. Kolejność implementacji

1. Dodać `isHouseTestMode()` i `houseDefinitionFromUrl()`.
2. Utworzyć `createHouseTestScene.ts`.
3. Podłączyć `houseTest` w `main.ts` przed `modelTest`.
4. Podłączyć istniejący `ConstructionCatalog` + `HouseBuilder`.
5. Dodać ground, grid, lights i `OrbitControls`.
6. Dodać automatyczny framing kamery.
7. Dodać error handling i cleanup.
8. Dodać testy wyboru definicji.
9. Wykonać browser verification.

**Zrób git commit i push do main, rebase jeżeli trzeba**
