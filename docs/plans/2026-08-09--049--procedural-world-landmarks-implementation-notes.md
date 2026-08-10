# 049 — Proceduralne obiekty i landmarki terenu — implementation notes

Ten dokument jest technicznym uzupełnieniem planu [049 — Proceduralne obiekty i landmarki terenu](./2026-08-09--049--procedural-world-landmarks.md).

## Cel implementacyjny

Pierwsza wersja ma dodać deterministyczne landmarki do istniejącego pipeline'u generowania chunków, bez tworzenia równoległego systemu generowania świata.

Najważniejsza zasada:

> **Rozszerzamy istniejący `chunkEnvironment` / chunk worker / chunk manager zamiast budować osobny `LandmarkSystem`.**

Repozytorium już posiada większość potrzebnej infrastruktury:

- deterministyczny RNG per seed/chunk,
- worker-side procedural placement,
- terrain sampling przez `ChunkTileData`,
- klasyfikację terenu/biomów,
- istniejące `EnvironmentPlacement`,
- generowanie dekoracyjnych obiektów (`largeRock`, `rockCluster`, `fallenLog`, `campfire`),
- lifecycle chunków po stronie `chunkManager`.

## Istniejąca architektura do reuse

### `src/terrain/chunkEnvironment.ts`

To jest główny istniejący punkt rozszerzenia.

Obecnie definiuje:

```ts
type EnvironmentKind = 'largeRock' | 'rockCluster' | 'fallenLog' | 'campfire'

type EnvironmentPlacement = {
  x: number
  z: number
  kind: EnvironmentKind
  scale: number
  rotationY: number
  variant: number
}
```

oraz `computeChunkEnvironment(...)`, które już:

- działa deterministycznie per chunk,
- używa `createSeededRandom`,
- sprawdza wodę, nachylenie, drogi i regiony terenu,
- generuje wyłącznie dane, bez `THREE.Object3D`,
- jest wykonywane w workerze.

**Nie tworzyć drugiego generatora analogicznego do `computeChunkEnvironment`.**

Najbardziej naturalnym kierunkiem jest rozszerzenie tego pipeline'u o landmarki albo wydzielenie małej funkcji pomocniczej wewnątrz tego samego modułu, jeśli kod zacznie się robić zbyt duży.

### `src/terrain/chunkHeightmap.worker.ts`

Worker już wykonuje w kolejności:

```text
computeChunkTile
  → computeChunkVegetation
  → computeChunkItems
  → computeChunkEnvironment
```

Jeżeli landmarky pozostaną częścią environment pipeline'u, nie powinny wymagać nowego worker protocol.

### `src/terrain/chunkManager.ts`

Chunk manager już otrzymuje dane environment z workera i tworzy odpowiednie obiekty Three.js po stronie głównego wątku.

To zapewnia właściwy lifecycle:

- generate/load chunk → utworzenie obiektów,
- unload chunk → disposal całego chunku,
- ponowny load → deterministyczne odtworzenie.

Nie tworzyć globalnej kolekcji landmarków niezależnej od chunków.

## Proponowany model v1

Jeżeli obecny `EnvironmentPlacement` pozostanie odpowiedni, preferować jego rozszerzenie zamiast tworzenia równoległego typu.

Przykładowo:

```ts
type EnvironmentKind =
  | 'largeRock'
  | 'rockCluster'
  | 'fallenLog'
  | 'campfire'
  | 'stoneCircle'
  | 'monolith'
  | 'smallRuins'
```

Nazewnictwo powinno odpowiadać istniejącej konwencji repozytorium.

Nie wprowadzać `LandmarkPlacement`, jeśli jedyną różnicą względem `EnvironmentPlacement` jest semantyczna nazwa. Osobny typ ma sens dopiero wtedy, gdy landmarki będą miały inne dane lub lifecycle.

## Pierwszy zakres landmarków

Nie implementować od razu całej listy z głównego planu.

Pierwsza iteracja powinna zweryfikować pipeline na 2–3 typach o bardzo czytelnej sylwetce:

1. **monolit** — pojedynczy wysoki kamień,
2. **kamienny krąg** — kilka kamieni rozmieszczonych po okręgu,
3. **proste ruiny** — niewielki fragment muru/fundamentu.

Jeżeli któryś z tych obiektów wymaga nieproporcjonalnie dużo geometrii lub kodu, należy uprościć zakres zamiast budować ogólny framework konstrukcji proceduralnych.

## Placement

Placement powinien używać istniejącego world seed + chunk coordinates.

Nie używać `Math.random()`.

Nie tworzyć nowego globalnego generatora RNG.

Każdy chunk może wykonać własny deterministic roll. Landmark musi jednak być stabilny po unload/load.

Ważne: nie generować landmarku dokładnie według tej samej logiki co częste dekoracje. Landmark powinien mieć osobne, bardzo niskie prawdopodobieństwo.

Przykładowy model:

```text
chunk
  ↓
landmark roll
  ↓
jeśli brak → nic
  ↓
wybór typu
  ↓
terrain suitability
  ↓
placement
```

Dokładne wartości prawdopodobieństw powinny być łatwe do strojenia i umieszczone jako named constants/configuration.

## Terrain suitability

Wykorzystywać istniejące dane z `ChunkTileData` zamiast tworzyć drugi system klasyfikacji terenu.

W szczególności dostępne są już m.in.:

- `heights`,
- `continentalness`,
- `mountainRidge`,
- `moistureRegion`,
- `roadTint`.

Podstawowe reguły v1:

- brak placementu pod wodą,
- unikać bardzo stromych zboczy dla konstrukcji wymagających stabilnej podstawy,
- unikać dróg/clearingów, jeśli nie jest to zamierzone,
- korzystać z wysokości terenu przy osadzaniu obiektu,
- landmark nie powinien losowo wisieć nad ziemią ani znikać pod nią.

Preferencje środowiskowe mogą na początku być miękkim biasem, a nie rozbudowanym systemem constraintów.

## Chunk boundaries

To istotny przypadek brzegowy.

Jeżeli landmark ma większy rozmiar niż mały prop, jego elementy mogą wyjść poza granicę chunku.

W v1 preferowane rozwiązanie:

- landmark ma punkt zakotwiczenia w jednym chunku,
- generowanie może wyjść nieznacznie poza jego granicę,
- dane terrain są dostępne przez istniejący apron/sampling,
- nie tworzyć drugiego landmarku tylko dlatego, że sąsiedni chunk ma własny random roll.

Jeżeli pełne cross-chunk landmarki okażą się problematyczne, pierwsza implementacja może ograniczyć promień landmarku tak, aby cały obiekt mieścił się w chunku. Jest to lepsze niż dokładanie skomplikowanego systemu ownership.

## Geometria

Nie budować od razu ogólnego proceduralnego frameworka modułowych konstrukcji.

Dla v1 wystarczą małe funkcje tworzące konkretne landmarki, np. w istniejącym module props/environment albo w nowym małym module tylko wtedy, gdy repozytorium wymaga separacji.

Preferować istniejące helpery/proceduralne primitive'y, jeżeli już istnieją.

Landmark powinien:

- mieć czytelną sylwetkę,
- dobrze wyglądać z dystansu,
- być osadzony na terenie,
- mieć niewielką deterministyczną wariację.

Wariacja może obejmować:

- scale,
- rotation,
- liczbę elementów,
- niewielki offset,
- wysokość/rozmiar elementów,
- stopień zniszczenia.

Nie używać wariacji, która niszczy rozpoznawalność typu landmarku.

## Wydajność

Landmarki są celowo rzadkie.

Nie powinny znacząco zwiększyć kosztu generowania chunku ani liczby draw calls.

Jeżeli landmark składa się z kilku meshów, należy preferować istniejące mechanizmy tworzenia/reużycia prostych obiektów zamiast generowania dużej liczby unikalnych geometrii.

Nie dodawać dodatkowego globalnego update loop dla landmarków.

## Czego nie robić w 049

Poza zakresem:

- questy,
- interakcje z landmarkami,
- loot,
- NPC przypisani do landmarków,
- lore/dialogi,
- save/load stanu landmarków,
- collision gameplayowe,
- navigation/pathfinding,
- proceduralne wnętrza,
- ogólny system prefabów,
- pełny modułowy construction generator,
- LLM/content generation.

## Kryteria akceptacji

### Determinizm

- Ten sam seed daje te same landmarki w tych samych miejscach.
- Reload strony nie zmienia landmarków.
- Unload/load chunku nie zmienia landmarku.
- Zmiana seed powoduje inne rozmieszczenie.

### Integracja

- Landmark korzysta z istniejącego chunk generation pipeline.
- Nie powstaje drugi system RNG.
- Nie powstaje drugi lifecycle zarządzania obiektami świata.
- Nie ma globalnej kolekcji wszystkich landmarków.

### Terrain

- Landmark nie pojawia się pod wodą.
- Konstrukcje są poprawnie osadzone na terenie.
- Placement respektuje podstawowe ograniczenia nachylenia.
- Landmark nie koliduje przypadkowo z istniejącą drogą/osadą, jeśli nie jest to zamierzone.

### Wizualne

- Typ landmarku można rozpoznać po sylwetce.
- Wariacja nie niszczy jego czytelności.
- Landmark jest zauważalnym punktem eksploracji, ale pozostaje rzadki.

### Weryfikacja

Sprawdzić minimum:

1. kilka różnych seedów,
2. dłuższy spacer po świecie,
3. reload strony,
4. unload/load chunków,
5. granice chunków,
6. wodę i strome tereny,
7. okolice osady i dróg,
8. wydajność przy większym promieniu załadowanych chunków.

## Zalecana kolejność implementacji

1. Rozszerzyć istniejący environment placement o jeden landmark.
2. Dodać jego prostą geometrię.
3. Zweryfikować deterministyczność i chunk lifecycle.
4. Dodać drugi typ.
5. Dodać trzeci typ tylko jeśli pierwszy pipeline jest stabilny.
6. Dopiero później rozważyć wydzielenie wspólnych helperów/modułów konstrukcyjnych.

## Zasada dla Claude Code

Przed implementacją należy przede wszystkim sprawdzić aktualny stan:

- `src/terrain/chunkEnvironment.ts`,
- `src/terrain/chunkHeightmap.worker.ts`,
- `src/terrain/chunkManager.ts`,
- istniejące helpery w `src/settlement/props.ts`,
- `src/terrain/chunkHeightmap.ts` / protocol, jeśli potrzebne.

Nie należy ponownie projektować architektury świata. Jeśli istniejący kod pozwala osiągnąć cel przez małe rozszerzenie, należy wybrać tę opcję zamiast nowego subsystemu.
