# Plan: House Browser and Tools Menu

**Created:** 2026-08-26
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~111~~
**Domain:** `tools`

## Cel

Zastąpić obecny prototyp `?houseTest` dedykowaną aplikacją Vue + Tailwind dla przeglądania modularnych domów oraz uporządkować dostęp do narzędzi developerskich przez sekcję `Tools` w menu głównym.

House Browser ma być narzędziem prezentacyjnym opartym na tych samych źródłach prawdy co gameplay:

```text
HouseDefinition
    ↓
ConstructionCatalog
    ↓
HouseBuilder
    ↓
HouseAssembly
    ├── Three.js representation
    └── Collider[] (read-only)
```

Nie tworzyć drugiego systemu budowania domów, osobnych definicji domów ani osobnych colliderów.

## Zakres

### 1. Osobna aplikacja House Browser

Dodać osobny Vite entrypoint:

```text
/house-browser
```

Aplikacja:

- Vue 3,
- TypeScript,
- Tailwind CSS v4,
- Three.js,
- wykorzystuje istniejący `HOME_HOUSE_DEFINITIONS`, `ConstructionCatalog` i `HouseBuilder`,
- umożliwia przełączanie domów bez przeładowania strony,
- nie uruchamia świata gry ani systemów gameplayowych.

Dodać:

```text
house-browser.html
src/house-browser/
  main.ts
  App.vue
  style.css
  houseBrowserScene.ts
  houseBrowserTypes.ts
  colliderPreview.ts
  components/
    HouseList.vue
    HouseInfo.vue
    SceneControls.vue
    ColliderControls.vue
    CameraControls.vue
```

Nie jest wymagane tworzenie osobnego projektu npm ani osobnego Vite configu.

### 2. Vite multi-page entry

W `vite.config.ts` rozszerzyć istniejące `rollupOptions.input`:

```ts
build: {
  rollupOptions: {
    input: {
      main: resolve(rootDir, 'index.html'),
      assetBrowser: resolve(rootDir, 'asset-browser.html'),
      houseBrowser: resolve(rootDir, 'house-browser.html'),
    },
  },
},
```

Projekt już wykorzystuje Vue, Tailwind 4 i multi-entry Vite; reuse istniejącej konfiguracji zamiast dodawania nowej infrastruktury.

### 3. Tailwind UI

`house-browser.html` powinien zawierać wyłącznie mount point Vue i entry script.

`src/house-browser/style.css`:

```css
@import "tailwindcss";

html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}
```

Główny layout:

```text
┌──────────────────────┬─────────────────────────────────────────┐
│ HOUSE BROWSER        │                                         │
│                      │                                         │
│ House list           │             Three.js                   │
│                      │               house                    │
│ House info           │                                         │
│                      │                                         │
│ Scene                 │                                         │
│ Colliders             │                                         │
│ Camera                │                                         │
└──────────────────────┴─────────────────────────────────────────┘
```

Panel boczny ma być zbudowany z Tailwind, bez wprowadzania dodatkowego UI frameworka.

### 4. House selection

Lista ma być generowana bezpośrednio z `HOME_HOUSE_DEFINITIONS`.

UI:

- ID domu,
- label,
- zaznaczenie aktywnego domu,
- przewijana lista przy większej liczbie definicji.

Zmiana domu nie może wymagać reloadu.

API sceny:

```ts
export interface HouseBrowserScene {
  setHouse(id: string): Promise<void>
  setConfig(config: HouseBrowserConfig): void
  resetCamera(): void
  setCameraView(view: CameraView): void
  dispose(): void
}
```

Podczas asynchronicznego ładowania assetów zastosować generation/token guard, aby starsze żądanie nie mogło dołączyć starego `HouseAssembly` po późniejszym wyborze innego domu.

Przykład:

```ts
let loadGeneration = 0

async function setHouse(id: string): Promise<void> {
  const generation = ++loadGeneration

  // load assets and build assembly

  if (generation !== loadGeneration) {
    assembly.dispose()
    return
  }

  // attach current assembly
}
```

### 5. House info

Panel informacji powinien wykorzystywać dane rzeczywistego `HouseDefinition` / `HouseAssembly`, a nie duplikować ich w UI.

Pokazywać w pierwszej wersji co najmniej:

- ID,
- label,
- rozmiar / footprint, jeśli istnieje w definicji,
- size class, jeśli istnieje,
- liczbę elementów wynikającą z assembly/census, jeśli dostępna,
- liczbę colliderów.

Jeżeli istniejący `HouseAssembly` nie wystawia colliderów/census, najpierw znaleźć aktualny mechanizm i rozszerzyć go minimalnie, zamiast tworzyć równoległe obliczenia.

### 6. Scene configuration

Dodać typ:

```ts
export interface HouseBrowserConfig {
  showGrid: boolean
  showGround: boolean
  showShadows: boolean
  showColliders: boolean
  colliderPadding: number
  cameraAutoFit: boolean
}
```

Default:

```ts
export const DEFAULT_HOUSE_BROWSER_CONFIG: HouseBrowserConfig = {
  showGrid: true,
  showGround: true,
  showShadows: true,
  showColliders: false,
  colliderPadding: 0,
  cameraAutoFit: true,
}
```

Vue powinno utrzymywać config jako reaktywny stan i przekazywać go do sceny przez jedno API `setConfig()`.

### 7. Camera controls

Dodać przyciski:

- Reset / Fit,
- Front,
- Back,
- Left,
- Right,
- Top.

Kamera powinna automatycznie dopasować się do aktualnego domu po jego załadowaniu, jeśli `cameraAutoFit` jest aktywne.

### 8. Collider preview

Istnieje już `src/debug/colliderDebugView.ts`. Należy reuse/refactor istniejącego mechanizmu zamiast tworzyć drugi renderer colliderów.

Obecny debug view obsługuje `circle` oraz OBB przez `InstancedMesh` i jest czysto wizualny. W House Browser należy udostępnić analogiczny mechanizm dla konkretnego `Collider[]` należącego do aktualnego domu.

Docelowe API:

```ts
export interface ColliderPreviewConfig {
  visible: boolean
  padding: number
}

export interface ColliderPreview {
  setColliders(colliders: readonly Collider[]): void
  setVisible(visible: boolean): void
  setPadding(padding: number): void
  dispose(): void
}
```

Jeżeli refaktor istniejącego `colliderDebugView.ts` jest potrzebny, zachować kompatybilność z istniejącym debug overlay.

### 9. Collider padding

Dodać opcję:

```text
Show colliders: [x]
Padding:        ─────●──── 0.10 m
```

Zakres UI w pierwszej wersji:

```text
0.00 – 0.50 m
step 0.01 m
```

Padding jest **wyłącznie wizualny**. Nie może modyfikować authoritative `Collider`.

Circle:

```ts
const radius = collider.radius + padding
```

OBB:

```ts
const halfWidth = collider.halfWidth + padding
const halfDepth = collider.halfDepth + padding
```

Nigdy:

```ts
collider.radius += padding
```

Powinna istnieć czysta funkcja, jeśli ułatwi to testowanie:

```ts
inflateCollider(collider, padding)
```

z gwarancją, że obiekt źródłowy pozostaje niezmieniony.

### 10. Tools w Main Menu

Przy okazji uporządkować główne menu gry.

Dodać pozycję:

```text
Tools ›
```

Pod nią:

```text
Tools
├── House Browser
├── Asset Browser
└── ...
```

`Tools` ma być nawigacją do osobnych aplikacji, a nie kontenerem uruchamiającym ich Three.js w głównej grze.

Dodać centralny registry:

```ts
export interface ToolDefinition {
  id: string
  label: string
  description?: string
  path: string
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'house-browser',
    label: 'House Browser',
    description: 'Browse modular house definitions',
    path: '/house-browser',
  },
  {
    id: 'asset-browser',
    label: 'Asset Browser',
    description: 'Browse available game assets',
    path: '/asset-browser',
  },
]
```

Main Menu ma renderować registry, a nie mieć osobne hardcoded akcje dla każdego narzędzia.

Dzięki temu późniejsze narzędzia mogą być dodane przez pojedynczy wpis:

```text
NPC Inspector
Settlement Browser
Fauna Browser
World Observatory
Performance tools
```

Nie implementować tych narzędzi w ramach tego planu.

### 11. Nawigacja

Kliknięcie narzędzia powinno przejść bezpośrednio do jego osobnego entrypointu.

Preferować prostą nawigację URL zamiast mieszania tool-specific logiki z runtime gry.

### 12. Usunięcie obecnego House Test UI

Po przejęciu funkcji przez House Browser usunąć prototypowe UI z `createHouseTestScene.ts`, w szczególności ręcznie generowany panel wyboru domu.

Usunąć `?houseTest` jako docelowy sposób uruchamiania browsera, o ile po migracji nie pozostaje potrzebny do żadnego innego debug workflow.

Nie usuwać istniejącego debug collider overlay, jeśli jest wykorzystywany przez gameplay/debug mode.

### 13. Porządek odpowiedzialności

Docelowy podział:

```text
Vue
 └── UI state / selection / controls

HouseBrowserScene
 └── Three.js lifecycle / camera / rendering

HouseBuilder
 └── authoritative house assembly

ColliderPreview
 └── read-only visualization of Collider[]
```

Nie tworzyć:

- `HouseBrowserHouseBuilder`,
- `HouseBrowserHouseDefinition`,
- `HouseBrowserCollider`,
- drugiego ConstructionCatalog,
- osobnego asset registry tylko dla browsera.

## Pliki do sprawdzenia / prawdopodobnie zmienione

```text
vite.config.ts
house-browser.html
src/house-browser/main.ts
src/house-browser/App.vue
src/house-browser/style.css
src/house-browser/houseBrowserScene.ts
src/house-browser/houseBrowserTypes.ts
src/house-browser/colliderPreview.ts
src/house-browser/components/*.vue
src/debug/createHouseTestScene.ts
src/debug/colliderDebugView.ts
src/settlement/houseBuilder.ts
src/settlement/houseDefinitionExample.ts
src/world/collision.ts
```

Dokładne ścieżki i API należy potwierdzić w aktualnym kodzie przed implementacją. Nie zakładać, że `HouseAssembly` już wystawia dokładnie opisane pola.

## Testy

Dodać testy dla czystej logiki, przede wszystkim:

### Collider padding

```ts
it('does not mutate source collider', () => {
  const collider = {
    type: 'circle',
    x: 0,
    z: 0,
    radius: 1,
  }

  const result = inflateCollider(collider, 0.25)

  expect(result.radius).toBe(1.25)
  expect(collider.radius).toBe(1)
})
```

Testować również OBB oraz padding `0`.

### House lookup

```ts
it('finds a house by id', () => {
  expect(findHouseDefinition('HOUSE_8X6_A')?.id).toBe('HOUSE_8X6_A')
})
```

Jeżeli istnieje już normalizacja house ID, reuse istniejącą funkcję zamiast tworzyć drugą.

### Async house switching

Zweryfikować logicznie, że starszy request nie może nadpisać nowszego wyboru domu.

## Verification

Uruchomić:

```bash
pnpm run type-check
pnpm run lint
pnpm run test
pnpm run build
```

Następnie browser/manual verification:

```text
pnpm run dev
```

Otworzyć:

```text
http://localhost:5577/house-browser
```

Sprawdzić:

1. House Browser otwiera się jako osobna aplikacja.
2. Lista wszystkich aktualnych definicji jest dostępna.
3. Każdy dom można przełączać bez reloadu.
4. Kamera dopasowuje się do wybranego domu.
5. Reset / Front / Back / Left / Right / Top działają.
6. Grid działa.
7. Ground działa.
8. Shadows działają.
9. `Show colliders` pokazuje rzeczywiste collidery domu.
10. Circle i OBB są poprawnie wizualizowane.
11. Padding `0` pokrywa rzeczywisty collider.
12. Padding dodatni rozszerza wyłącznie wizualizację.
13. Padding nie zmienia gameplayowego `Collider`.
14. Szybkie przełączanie domów podczas ładowania assetów nie zostawia starego assembly.
15. Wielokrotne przełączanie nie powoduje widocznych duplikatów ani wycieków zasobów.
16. Main Menu zawiera `Tools`.
17. `Tools → House Browser` prowadzi do `/house-browser`.
18. `Tools → Asset Browser` prowadzi do `/asset-browser`.
19. Main Menu nie inicjalizuje sceny House Browser / Asset Browser.
20. Główny gameplay nadal uruchamia się bez zmian.

Visual Three.js correctness wymaga browser/manual verification; sam type-check/build nie jest wystarczającym dowodem.

## Performance

House Browser jest narzędziem developerskim, ale nadal:

- reuse `InstancedMesh` dla colliderów,
- dispose poprzedniego assembly i assetów,
- nie uruchamia pełnej symulacji świata,
- nie aktualizuje collider preview co frame, jeśli statyczny house tego nie wymaga,
- nie dodaje nowych workerów bez mierzalnej potrzeby.

Collider preview powinien być przebudowywany tylko przy zmianie domu lub paddingu, a nie bez potrzeby co frame.

## Poza zakresem

- edycja HouseDefinition w UI,
- edycja colliderów,
- zapis zmian domu,
- proceduralne generowanie nowych domów,
- NPC/settlement simulation w browserze,
- nowe typy modularnych elementów,
- nowe narzędzia poza wpisami House Browser i Asset Browser w menu.

## Completion criteria

Plan jest kompletny, gdy:

- House Browser działa jako osobny Vue app,
- wykorzystuje prawdziwy `HouseBuilder`,
- UI jest wykonane w Vue + Tailwind,
- wszystkie aktualne domy można przeglądać,
- kamera i podstawowe opcje sceny działają,
- collidery można włączać/wyłączać,
- collider padding działa wyłącznie wizualnie,
- Main Menu ma uporządkowane `Tools`,
- House Browser i Asset Browser są dostępne z `Tools`,
- stary prototyp `?houseTest` zostaje usunięty lub świadomie pozostawiony wyłącznie jako potrzebny debug fallback,
- type-check, lint, test i build przechodzą,
- browser/manual verification została wykonana.

**Zrób git commit i push do main, rebase jeżeli trzeba**
