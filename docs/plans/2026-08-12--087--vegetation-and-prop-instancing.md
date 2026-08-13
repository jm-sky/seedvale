# Plan: Instancing roślinności i propsów (review 005, pozycja 15 / A1)

**Status:** `verification needed` (fazy 1–5 **Must** + faza 7 **Nice** [LOD przez `count`] zaimplementowane i technicznie zweryfikowane [`tsc`/`lint`/`test`/`build`]. Faza 6 [Should, osady] celowo odłożona — niski ROI. Faza 8 poza zakresem. Faza 0 — pomiar bazowy w przeglądarce — nigdy nie wykonana; brak liczb przed/po. Szczegóły: [implementation notes](./2026-08-12--087--vegetation-and-prop-instancing-implementation-notes.md))
**Created:** 2026-08-12
**Priority:** 🔴 high
**Effort:** XL
**Depends on:** ~~007~~ (chunk streaming), ~~065~~ (GLB skały/pnie), ~~073~~ (sizeClass/wiek drzew), ~~review 005 poz. 0~~ (instrumentacja `renderer.info` — bez niej nie ma jak potwierdzić hipotezy ani efektu)
**Źródło:** [reviews/2026-08-12--005--performance-architecture-and-assets.md](../reviews/2026-08-12--005--performance-architecture-and-assets.md) — finding **A1** (+ **P10** jako skutek uboczny), pozycja **15** w tabeli kolejności.

**Twarde ograniczenie:** zero regresji wizualnej. Każda instancja ma wylądować w **dokładnie tej samej macierzy świata**, co dzisiejszy sklonowany `Object3D` — plan jest tak zbudowany, żeby to było testowalne jednostkowo, a nie „na oko" (Faza 1).

---

## 1. Stan faktyczny (zweryfikowany w kodzie)

### Skala problemu

- W całym `src/` jest **dokładnie jeden** `InstancedMesh` — trawa (`grass.ts:829`). Wszystko inne to osobne `Object3D`.
- `chunkVegetation.ts:42-43`: `BASE_CANDIDATES_PER_CHUNK = 16` + `FOREST_EXTRA_CANDIDATES = 90 × centerForest` → do **106 kandydatów/chunk**, akceptacja w gęstym lesie wysoka (`chunkVegetation.ts:192-198`).
- `loadRadius: 3` → 7×7 = **49 chunków**. Rząd wielkości: **2–4 tys. obiektów roślinności** naraz.
- Modele drzew mają po **2 primitives** (`tree_c.glb`: 6 678 tri / 2 prims; `birch_1.glb`: 4 596 / 2) → 2 draw calle na drzewo; z passem cienia ×2.
- Do tego `chunkEnvironment` (skały, klastry, pnie) i `buildSettlementProps` (`props.ts`) — kilkaset propsów per osada, każdy przez `cloneProp` (`props.ts:1456`).

Każdy z tych obiektów jest osobnym węzłem grafu sceny, więc `WebGLRenderer.projectObject` odwiedza go co klatkę **niezależnie od frustum cullingu**, a `CSS2DRenderer.render` (`gameLoop.ts:589`, finding **P10**) przechodzi ten sam graf drugi raz, żeby znaleźć kilkadziesiąt `CSS2DObject`.

### Co już działa na naszą korzyść

- **Geometria i materiały są już współdzielone** między klonami: `loadCached` (`loadGltf.ts:42-74`) oznacza je `userData.sharedGpu = true`, a `cloneProp` robi `src.clone(true)`, czyli klonuje wyłącznie węzły, nie zasoby GPU. Brakuje **tylko warstwy agregującej transformy**.
- **Placementy są już czystymi danymi** liczonymi w workerze (`VegetationPlacement`, `chunkVegetation.ts:19`; `EnvironmentPlacement`) — nie ma tu nic do przenoszenia między wątkami.
- **Wzorzec LOD przez `count`** jest już udowodniony na trawie (`grass.ts:852-862`), łącznie z uzasadnieniem, dlaczego prefiks instancji jest nieobciążoną podpróbką przestrzenną.
- **Interakcje nie zależą od meshy roślinności.** `buildInteractables` (`interactables.ts:155`) bierze drzewa z `chunkManager.getNearbyTrees` → `treeLifecycle.getNearbyPresence`, czyli z danych. Highlight gaze dotyczy wyłącznie NPC/zwierząt (`gameLoop.ts:202-209`). Jedyny `THREE.Raycaster` w repo (`props.ts:558`) celuje w domy przy budowie osady, nie w roślinność. **Instancing nie zabiera żadnej ścieżki interakcji.**

### Co blokuje naiwne podejście — trzy konkretne rzeczy

1. **`refreshTreeVisual`** (`chunkManager.ts:757-798`) znajduje drzewo przez `rec.vegetation.children.find(c => c.userData.treeId === treeId)`, usuwa je i wstawia mesh etapu (`createTreeStageMesh`). Instancja musi umieć zniknąć **bez przebudowy całego bufora**.
2. **Shader wiatru liści** (`foliageWind.ts:14-30`) liczy pozycję świata jako `modelMatrix * vec4(transformed, 1.0)` i skalę obiektu jako `length(modelMatrix[0].xyz)`. Pod instancingiem `modelMatrix` to macierz **grupy chunka**, a nie drzewa — bez poprawki wszystkie drzewa w chunku dostałyby **tę samą fazę wiatru** (i złą amplitudę). To jest realna regresja wizualna, nie detal.
3. **`disposeObject3D`** (`loadGltf.ts:162`) słusznie pomija zasoby `sharedGpu`, ale nie woła `InstancedMesh.dispose()` — a to jedyne, co zwalnia bufor `instanceMatrix` (ta sama pułapka, którą `grass.ts:867` już komentuje).

---

## 2. Projekt

### 2.1 Nowy moduł: `src/render/instancedProps.ts`

```ts
/** Jeden mesh z (przygotowanego) szablonu GLB: współdzielona geometria +
 *  materiał + macierz LOKALNA względem własnego frame'u roota. */
export type PropPrimitive = {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  localMatrix: THREE.Matrix4
  castShadow: boolean
  receiveShadow: boolean
}

export type PropPlacement = {
  speciesIndex: number
  x: number
  z: number
  groundY: number
  rotationY: number
  scale: number
  /** Klucz do późniejszego usunięcia pojedynczej instancji (np. `treeId`). */
  key?: string
}

export type InstancedPropGroup = {
  group: THREE.Group
  /** Swap-remove: ostatnia instancja wchodzi w zwolniony slot. `false` = nieznany klucz. */
  removeByKey: (key: string) => boolean
  dispose: () => void
}

export function buildInstancedProps(
  templates: readonly THREE.Object3D[],   // roots po `prepareProp`
  placements: readonly PropPlacement[],
  name: string,
): InstancedPropGroup | undefined
```

**Płaskowanie szablonu.** `flattenPropTemplate(root)` liczone **raz per szablon** i cache'owane w `WeakMap<Object3D, PropPrimitive[]>` (szablony są memoizowane w `chunkManager.ts:76-89`, więc to naturalnie jeden wpis per gatunek). `localMatrix` to iloczyn lokalnych macierzy łańcucha **poniżej** roota — własna transformacja roota (`position`/`scale` ustawione przez `prepareProp`) jest z tego wyłączona, bo wchodzi do macierzy instancji.

**Macierz instancji — bez przepisywania matematyki.** Zamiast wyprowadzać wzór z `cloneProp` + `placeOnGround` (i ryzykować, że przeoczymy niuans — np. że `prepareProp` liczy offsety **przed** domnożeniem skali w `cloneProp:1463`, więc offsety nie są skalowane), używamy **scratch `Object3D`**, który odtwarza tamte kroki dosłownie:

```ts
scratch.position.copy(templateRoot.position)   // p0 z prepareProp
scratch.quaternion.copy(templateRoot.quaternion)
scratch.scale.copy(templateRoot.scale)         // s0 z prepareProp
scratch.scale.multiplyScalar(placement.scale)  // ≡ cloneProp
scratch.rotation.y = placement.rotationY       // ≡ cloneProp/clonePropWithYaw
scratch.position.set(                          // ≡ placeOnGround
  placement.x + templateRoot.position.x,
  placement.groundY + templateRoot.position.y,
  placement.z + templateRoot.position.z,
)
scratch.updateMatrix()
instanceMatrix = scratch.matrix.clone().multiply(primitive.localMatrix)
```

To jest ~1 µs per placement i **eliminuje całą klasę błędów** „prawie ta sama transformacja".

**Bucketowanie.** Klucz = `(speciesIndex, primitiveIndex)`. Wszystkie primitywy jednego gatunku dzielą **ten sam porządek instancji**, więc jedna instancja ma jeden indeks we wszystkich swoich bucketach — swap-remove musi zdjąć ten sam indeks w każdym z nich i zaktualizować mapowanie klucza dla przesuniętej instancji. Ten niezmiennik jest tani i jest tym, co czyni `removeByKey` trywialnym.

Po wypełnieniu: `instanceMatrix.needsUpdate = true` + `computeBoundingSphere()` (bez tego culling jest liczony z bounds unitowego szablonu — dokładnie ten błąd, który `grass.ts:835` już komentuje). `castShadow`/`receiveShadow` przenoszone per primityw, więc próg `SMALL_MESH_SHADOW_THRESHOLD` (`loadGltf.ts:25`, pozycja 5 review) zostaje w mocy.

### 2.2 Poprawka shadera wiatru (warunek konieczny, nie opcja)

`foliageWind.ts` — `BEGIN_VERTEX_WIND` dostaje gałąź instancingową:

```glsl
mat4 propMatrix = modelMatrix;
#ifdef USE_INSTANCING
  propMatrix = modelMatrix * instanceMatrix;
#endif
float objScale = length( propMatrix[ 0 ].xyz );
vec3 world = ( propMatrix * vec4( transformed, 1.0 ) ).xyz;
```

Materiał jest współdzielony między roślinnością instancjonowaną a nadal-klonowanymi propsami osady, ale `USE_INSTANCING` to define — three.js i tak kompiluje osobny program per wariant, więc **jeden załatany materiał obsługuje obie ścieżki**. `customProgramCacheKey` (`foliageWind.ts:87-89`) zostaje; warto podbić `WIND_CACHE_KEY` do `v2`.

Depth/shadow material zostaje bez wiatru — tak jak dziś (`foliageWind.ts:65-66`), więc pass cienia nic tu nie traci.

### 2.3 Drzewa z cyklem życia

Placement drzewa daje `key = treeId`. Instancjonowana jest **tylko** postać `visual === 'living'` (klon szablonu GLB). Etapy `limbed`/`felled`/`harvested`/`stump` to proceduralne meshe (`createTreeStageMesh`, `treeVisuals.ts`) — zostają zwykłymi `Object3D` dorzucanymi obok, bo jest ich mało i są unikalne per drzewo.

`refreshTreeVisual` (`chunkManager.ts:757`) przechodzi na:

1. `rec.vegetationInstances?.removeByKey(treeId)` — jeśli zwróci `true`, drzewo było instancją; jeśli `false`, szukaj w `rec.vegetationExtras.children` po `userData.treeId` (poprzedni mesh etapu) i usuń jak dziś.
2. Zbuduj nowy wizual i dodaj do `rec.vegetationExtras` (grupa nie-instancjonowanych dodatków tego chunka).
3. Pozycja/yaw: dziś czytane z usuwanego mesha (`chunkManager.ts:783`). Po zmianie biorą się z `treeLifecycle` presence (`presence.x`/`presence.z`) plus zapamiętany yaw — `TreePresence` już niesie `x`/`z`, `speciesIndex`, `sizeClass`, `sizeJitter`, `initialStage`, więc jedyne, co trzeba dołożyć per chunk, to mapa `treeId → rotationY`. **Ubocznie to naprawia zależność od `mesh.position`**, która dziś zakłada, że mesh jeszcze istnieje.

`ChunkRecord` (`chunkManager.ts:174`) dostaje więc:

```ts
vegetationInstances?: InstancedPropGroup
vegetationExtras?: THREE.Group     // meshe etapów + wszystko, czego nie da się instancjonować
treeYaw?: Map<string, number>
```

`rec.vegetation` (dzisiejsza `THREE.Group`) znika na rzecz tych dwóch — `unload` (`chunkManager.ts:710-713`) sprząta oba.

### 2.4 `disposeObject3D` i `InstancedMesh`

`loadGltf.ts:162` — dorzucić:

```ts
const inst = obj as THREE.InstancedMesh
if (inst.isInstancedMesh) inst.dispose()   // zwalnia instanceMatrix; geometry.dispose() tego nie robi
```

Bezpieczne dla wszystkiego innego (`isInstancedMesh` jest `undefined` na zwykłych meshach) i potrzebne każdemu przyszłemu instancingowi.

### 2.5 Zakres — co jest instancjonowane, a co nie

| System | Plik | Instancing | Uwaga |
|---|---|---|---|
| Krzaki / kaktusy / trzcina (chunk) | `chunkManager.ts:604` | ✅ faza 3 | brak stanu runtime — najprostszy przypadek, zaczynamy tu |
| Drzewa żywe (chunk) | `chunkManager.ts:605-637` | ✅ faza 4 | wymaga `removeByKey` + rework `refreshTreeVisual` |
| Meshe etapów drzew | `treeVisuals.ts` | ❌ | mało sztuk, unikalne, mutowane |
| Skały / klastry / pnie (chunk) | `chunkManager.ts:669` | ✅ faza 5 | `clonePropWithYaw`, ten sam kształt danych |
| Proceduralne landmarki (monolit, ruiny, krąg) | `chunkManager.ts:96-117` | ❌ | geometria budowana per sztuka, nie ze wspólnego szablonu |
| Itemy do podniesienia (chunk) | `chunkManager.ts:647` | ❌ | usuwane pojedynczo przez `collectItem`, czytane po `children` (`chunkManager.ts:925`) — osobna, późniejsza decyzja |
| Drzewa/krzaki osady | `props.ts:1625`, `:2270` | 🟡 faza 6 (**Should**) | `landmarks.trees[].mesh` jest trzymany przez `SettlementLandmarks` i używany przez `treeVisuals.replaceTreeMesh` — wymaga własnego przejścia |
| Domy, studnia, tabliczki, palisada | `props.ts` | ❌ | pojedyncze sztuki per osada, część z raycastem (`props.ts:558`) i tintem |
| Złoża rudy | `resourceDeposits.ts` | ❌ | `tintPropMaterials` klonuje materiał per sztuka — instancing wymagałby `setColorAt`, osobny temat |

**Nie wymaga nowych modeli ani dźwięków** — [MODELS.md](../assets/MODELS.md) / [SOUNDS.md](../assets/SOUNDS.md) bez zmian.

---

## 3. Fazy

| # | Zakres | Priorytet |
|---|---|---|
| 0 | **Pomiar bazowy.** Ustalony seed + pozycja w gęstym lesie i druga w osadzie; odczyt `Draw calls` / `Triangles (rendered)` / `Geometries (GPU)` / `Simulate (ms)` / `Render (ms)` z folderu „Performance" (`createDebugGui.ts:578-607`). Bez tej liczby nie wiadomo, czy A1 jest w ogóle największym problemem (kandydat konkurencyjny: fill rate z **A3**). | **Must** |
| 1 | **`instancedProps.ts` + test równoważności macierzy.** Moduł, zero wpięcia. Test (`instancedProps.test.ts`, Vitest/node — sama matematyka `three`, bez WebGL): dla syntetycznej hierarchii szablonu i kilkunastu placementów porównać `matrixWorld` każdego mesha ze ścieżki `cloneProp` + `placeOnGround` + `updateMatrixWorld` z macierzą wyliczoną przez `buildInstancedProps`, element po elemencie, tolerancja 1e-6. **To jest formalny dowód „bez regresji wizualnej" dla transformacji.** Osobno: test `removeByKey` (swap-remove utrzymuje spójność indeksów między primitywami jednego gatunku). | **Must** |
| 2 | **Wiatr liści pod instancingiem** (§2.2) + `disposeObject3D` dla `InstancedMesh` (§2.4). Ląduje przed fazą 3, bo faza 3 bez tego jest regresją wizualną. | **Must** |
| 3 | **Wpięcie: krzaki / kaktusy / trzcina.** Drzewa nadal po staremu — chunk ma wtedy obie ścieżki naraz, co jest dobrym testem, że współistnieją. Pomiar. | **Must** |
| 4 | **Wpięcie: drzewa żywe** + rework `refreshTreeVisual` (§2.3) + `treeYaw`. Pomiar. Ręczny test: ściąć drzewo w chunku z wieloma drzewami, sprawdzić że znika **tylko ono**. | **Must** |
| 5 | **Wpięcie: environment (skały/klastry/pnie).** Pomiar. | **Must** |
| 6 | **Osada: drzewa i krzaki klastrów** (`plantTreeCluster`, drzewa placu) — wymaga zastąpienia `landmarks.trees[].mesh` uchwytem instancji. | **Should** |
| 7 | **LOD przez `count`** dla dalekich chunków (wzorzec `grass.ts:852`) + ponowny pomiar **P10** (`labelRenderer.render` przechodzi teraz drastycznie mniejszy graf — sprawdzić, czy finding jeszcze istnieje). | **Nice to have** |
| 8 | Podniesienie gęstości roślinności / promienia — **odzyskany budżet, osobna decyzja wizualna**, nie część tego planu. | **Nice to have** |

---

## 4. Ryzyka

| # | Ryzyko | Reakcja |
|---|---|---|
| R1 | Transformacja instancji ≠ dzisiejsza (offsety `prepareProp`, kolejność skalowania) | Scratch `Object3D` odtwarzający dosłownie `cloneProp` + `placeOnGround` (§2.1) + test równoważności (faza 1). Nie wyprowadzamy wzoru ręcznie. |
| R2 | Wiatr liści identyczny dla wszystkich drzew w chunku | Faza 2 przed fazą 3. Weryfikacja wizualna: dwa drzewa obok siebie muszą kołysać się w różnej fazie. |
| R3 | Utrata per-obiektowego frustum cullingu — chunk rysowany w całości, gdy widać jego skrawek | Bucket jest chunk-lokalny (64 j.), więc granulacja pozostaje rozsądna. Netto i tak wygrywamy: dziś `projectObject` przechodzi każdy obiekt co klatkę *mimo* cullingu. Do potwierdzenia pomiarem `Triangles (rendered)` w fazie 3. |
| R4 | Materiał przezroczysty w którymś GLB → zmiana kolejności sortowania (per-bucket zamiast per-obiekt) | `hardenFoliageAlpha` (`foliageWind.ts:47`) konwertuje materiały liści na alpha-test w kolejce nieprzezroczystej, więc wynik jest niezależny od kolejności. **Do sprawdzenia w fazie 3:** czy któryś materiał `nature/*` zostaje `transparent` mimo to. |
| R5 | Wyciek `instanceMatrix` przy unload chunka | §2.4 + kontrola `Geometries (GPU)` w GUI po kilku cyklach wejścia/wyjścia z obszaru. |
| R6 | `refreshTreeVisual` przestaje trafiać w drzewo (nie ma już mesha do `find`) | Faza 4 + ręczny test ścinania. `getNearbyTrees`/`buildInteractables` nie zmieniają się wcale — chodzą po `treeLifecycle`, nie po scenie. |
| R7 | Zakres puchnie na osady i itemy | §2.5 wprost wypisuje, co jest poza zakresem; fazy 6+ są **Should/Nice**, nie **Must**. |

---

## 5. Weryfikacja

**Techniczna:** `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — po każdej fazie.

**Pomiarowa (przeglądarka, dev server — prowadzi użytkownik):** ten sam seed i te same dwa punkty obserwacyjne co w fazie 0; odczyt `Draw calls` / `Triangles (rendered)` / `Render (ms)` przed i po każdej z faz 3/4/5. Oczekiwanie z review: z ~2 draw calle × N drzew do **~2 draw calle × liczba gatunków × chunk**. `Triangles (rendered)` może **wzrosnąć** (mniej granularny culling) — to jest oczekiwane i akceptowalne, o ile `Render (ms)` spada.

**Wizualna (przeglądarka — prowadzi użytkownik), zgodnie z CLAUDE.md:**

1. Ten sam seed przed i po — las, krzaki, skały i pnie mają stać **w tych samych miejscach, w tej samej skali i obrocie**.
2. Kołysanie liści: sąsiednie drzewa w różnej fazie (R2).
3. Cienie: drzewa/skały nadal rzucają, drobne propsy nadal nie (próg z pozycji 5 review).
4. Ścięcie drzewa: znika dokładnie jedno, na jego miejscu pojawia się mesh etapu; wejście i wyjście z obszaru (unload/reload chunka) zachowuje stan.
5. Świt/zmierzch: brak zmian w cieniach i AO względem stanu sprzed zmiany.

`tsc`/`lint`/`build`/`test` **nie** są dowodem poprawności wizualnej pracy w Three.js.
