# Implementation Notes: Player-Built Torch and Ignition

**Reviewed:** 2026-09-01  
**Plan:** `items-player-009-player-built-torch-and-ignition.md`  
**Codebase baseline:** `main`

## Review summary

Plan jest zgodny z aktualną architekturą. Najważniejsze: nie próbować użyć `PlacedFires/VillageFire` jako modelu gameplayowego dla stojącej pochodni — ten system ma własne fuel/burn/despawn semantics, których plan świadomie nie chce. Dla runtime visual/light istnieje już lepiej pasujący mechanizm: `settlement/houseLighting.ts::createVillageTorchLight()`.

## 1. Placement

Aktualny wspólny placement seam jest już gotowy:

- `src/items/tentPlacement.ts::evaluateGroundPlacement()`;
- `src/app/actions/placementActions.ts::GroundPlacementDefinition`, `evaluatePlacementSite()`, `previewGroundPlacement()`;
- `src/app/actions/placementPreviewActions.ts` — jedyny shared preview controller;
- `placementActions.ts::tentBlockers()` — wspólne lokalne blokery.

Stojąca pochodnia powinna wejść w ten sam flow co chest/tent:

`PlacementPreviewKind` → `previewGroundPlacement()` → finalna rewalidacja → utworzenie obiektu.

Nie dodawać drugiego preview ani validatora. Pochodnia może używać własnego footprint/separation, ale bazową walidację należy oprzeć na `evaluateGroundPlacement()`.

## 2. Construction material transaction

`src/items/constructionMaterials.ts` jest obecnie właściwym seamem:

- `MaterialRequirement`;
- `hasMaterial()`;
- `consumeMaterial()`;
- bounded search dropped items w `CONSTRUCTION_MATERIAL_RADIUS`.

Wymagania stojącej pochodni powinny być:

- `wooden_pole × 1`;
- `wooden_torch × 1`.

Istotna różnica względem `fire_starting`: **budowa nie wymaga firestartera**. `fire_starting` jest tylko capability potrzebną później do Ignite.

Jeżeli placement jest bezpośrednią operacją bez busy channel, nadal sprawdzić oba materiały przed mutacją i konsumować dopiero po poprawnej walidacji. Jeżeli zostanie dodany busy channel, wzorzec z `placeGardenAtAim()`/`placeTentAtAim()` jest właściwy: rewalidacja i koszt na completion.

Nie używać `wooden_torch` jako world-object record — po udanej budowie jest zużyty.

## 3. Runtime representation — ważna istniejąca implementacja

`src/settlement/houseLighting.ts::createVillageTorchLight()` już tworzy dokładnie typ runtime, którego potrzebuje standing torch:

- istniejący `torch.glb` post;
- authored Fire mesh;
- lekkie sparks;
- `THREE.PointLight`;
- `setLit(boolean)`;
- `update(dt)`.

Procedural fallback `createProceduralTorchPost()` jest również dostępny.

To jest preferowany runtime visual/light seam. Nie tworzyć nowego flame/light implementation ani kopiować kodu z `PlayerTorch.ts`.

**Nie używać jednak `VillageFire` jako authoritative state**: `VillageFire` ma fuel countdown, extinguish i placed-fire despawn semantics.

Nowa kolekcja stojących pochodni może posiadać record + runtime `VillageTorch`, analogicznie do `createPlacedContainers()`, `createPlayerWells()` i `createPlacedFires()`. Nie nazywać jej `TorchManager`.

## 4. Authoritative state / runtime

Minimalny record:

`{ id, x, z, yaw, lit }`

`lit` jest jedynym authoritative ignition state. Runtime `VillageTorch.setLit(lit)` jest tylko reprezentacją.

Factory powinien zapewnić:

`record → runtime post/torch → setLit(record.lit)`

oraz przy zmianie:

`unlit → lit` → update record + `runtime.setLit(true)`.

Nie przechowywać `THREE.Object3D`, `PointLight` ani particle state w SaveData.

## 5. Per-frame runtime update

`VillageTorch.update(dt)` jest potrzebne tylko dla aktywnego flame/sparks runtime.

Nie robić pętli aktualizującej wszystkie stojące pochodnie bez względu na stan. Najprostszy wzorzec:

- factory utrzymuje zbiór aktywnie zapalonych runtime torches;
- `update(dt)` iteruje tylko po aktywnych;
- `setLit(false)` usuwa runtime z aktywnego zbioru;
- `dispose()` usuwa wszystkie runtime objects i rejestracje świateł.

Dla PointLight użyć istniejącego `PointLightBudget` i rejestrować/unregisterować subtree tak jak `PlacedFires`.

## 6. Interaction / ignition

`src/app/interactables.ts` jest centralnym discovery layer. Dodać osobny `Interactable` kind dla stojącej pochodni, zawierający stabilne `id` i aktualny `lit`/prompt.

Nie próbować traktować jej jako `campfire`: obecny campfire dispatch prowadzi do `startIgniteFire()`, który wymaga również `FIRE_FUEL_KINDS` i korzysta z `VillageFire.light()`. To jest niezgodne z planem torch fuel/burn non-goals.

Ignition powinno być osobną akcją na istniejącym interaction/action path:

1. re-resolve record po `id`;
2. jeśli już `lit`, no-op;
3. sprawdź `inventory.hasCapability('fire_starting')`;
4. zmień authoritative `lit`;
5. zaktualizuj runtime `VillageTorch.setLit(true)`.

Plan nie wymaga busy channel ani zużycia materiału przy Ignite. Nie dodawać nowego sposobu zdobywania `fire_starting`.

## 7. WorldBundle / rebuild

`WorldBundle` obecnie posiada typed fields dla każdego player-created object. Standing torches powinny dostać analogiczny field, a nie global registry.

Trzeba przeprowadzić wszystkie istniejące granice:

1. `WorldSystemsSeed` — initial standing-torch records;
2. `buildWorldSystems()` — create factory;
3. `createWorldBundle()` — load initial SaveData;
4. `rebuildWorldBundle()` — snapshot `nodes()` przed dispose i odtworzenie;
5. `disposeWorldBundle()` — dispose runtime.

Nie przechwytywać starego `bundle.standingTorches` w długowiecznych closure'ach; czytać pole z mutable `WorldBundle`, zgodnie z istniejącym kontraktem.

## 8. Persistence

Obecny save v1 jest explicit, bez generic object registry:

- `src/persistence/saveData.ts` — `SaveX` schema;
- `src/app/saveState.ts` — serialization;
- `createApp.ts` — restore;
- `createWorldBundle()` — runtime creation.

Dodać dedykowany `SavePlacedTorch` z `id/x/z/yaw/lit`. Nie zmieniać formatu wersjonowania ani nie tworzyć polymorphic player-object save list.

Validator w `saveData.ts` musi również akceptować nowy field, z bezpiecznym defaultem dla brakującego pola tak, aby stare save'y nadal działały.

Kluczowy test:

`save unlit → load unlit`  
`save lit → load lit`

Po restore runtime musi być odtworzony z recordu.

## 9. Placement UX integration

`src/app/actions/placementPreviewActions.ts` ma obecnie:

`chest | tent | fireSimple | firePit`

Dodanie standing torch powinno być małą zmianą:

- nowy `PlacementPreviewKind`;
- label;
- `resolvePreview()`;
- `commit()`.

Preview ghost może używać istniejącego footprintu. Nie tworzyć osobnego torch preview mesh.

Finalne potwierdzenie musi nadal wywoływać authoritative placement action — cached `lastResult` nie może być podstawą mutacji.

## 10. Potential trap: current fire system is not a drop-in

`src/settlement/PlacedFires.ts` + `VillageFire.ts` są kuszącym reuse, ale semantycznie są złym ownerem dla standing torch:

- `VillageFire.light()` tworzy fuel;
- `update()` zmniejsza fuel;
- po wypaleniu fire gaśnie;
- `PlacedFires` ma własny despawn lifecycle.

Plan wyklucza fuel/burn duration/extinguishing, więc nie obchodzić tego przez `Infinity` ani sztuczne ogromne fuel. To byłoby ukryte, kruche rozszerzenie semantyki fire pit.

Reużywać natomiast istniejącego **torch visual/light runtime** (`createVillageTorchLight()`).

## 11. Files / symbols to inspect first

- `src/app/actions/placementActions.ts`
- `src/app/actions/placementPreviewActions.ts`
- `src/items/tentPlacement.ts`
- `src/items/constructionMaterials.ts`
- `src/app/interactables.ts`
- `src/interaction/Interactable.ts`
- `src/app/gameLoop.ts`
- `src/settlement/houseLighting.ts`
- `src/world/pointLightBudget.ts`
- `src/app/worldBundle.ts`
- `src/app/saveState.ts`
- `src/persistence/saveData.ts`
- `src/app/createApp.ts`

Jako wzorce lifecycle: `createPlacedFires()`, `createPlacedContainers()`, `createPlayerWells()`.

## 12. Verification focus

Poza testami z planu zweryfikować szczególnie:

- preview i final placement mają identyczną walidację;
- brak materiału nie zmienia świata ani inventory;
- placement zużywa dokładnie 1 pole + 1 wooden torch;
- nowa pochodnia jest unlit;
- Ignite bez `fire_starting` nie zmienia stanu;
- Ignite nie zużywa wooden torch/pola;
- ponowne Ignite nie tworzy kolejnego light/flame;
- lit torch pozostaje lit po upływie czasu;
- WorldBundle rebuild zachowuje `lit`;
- save/load zachowuje `lit`;
- dispose usuwa mesh, particles i PointLight registration;
- kilka zapalonych pochodni nie powoduje dodatkowego per-frame skanu wszystkich pochodni.

## Architectural conclusion

Najmniejsza zgodna implementacja to: **typed persistent standing-torch collection + istniejący shared placement preview/material seam + istniejący `createVillageTorchLight()` jako runtime visual/light + typed interaction action**.

Nie rozszerzać `VillageFire` o specjalny permanent-fire mode i nie budować żadnego globalnego torch/construction managera.

**Zrób git commit i push do main, rebase jeżeli trzeba**
