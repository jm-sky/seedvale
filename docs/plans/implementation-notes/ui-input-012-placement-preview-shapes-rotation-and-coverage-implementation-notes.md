# Implementation Notes: Placement preview shapes, rotation and coverage

**Reviewed:** 2026-09-07  
**Plan:** `ui-input-012-placement-preview-shapes-rotation-and-coverage.md`  
**Codebase baseline:** `main`

## Review summary

Plan pasuje do obecnej architektury. Nie potrzeba nowego placement systemu: `PlacementPreviewActions` jest już jedynym controllerem lifecycle preview, a `GroundPlacementDefinition` + `evaluatePlacementSite()` / `previewGroundPlacement()` są wspólnym seamem domenowym.

Najważniejsze zmiany powinny pozostać małe:

- dodać jawny preview footprint (`circle` / `box`) obok istniejącego clearance radius,
- rozdzielić **aim direction** od **object yaw** dla rotowalnych obiektów,
- trzymać bazowy yaw + rotation steps w `PlacementPreviewActions`,
- przekazywać wynikowy yaw do read-only preview i do finalnego confirm,
- dodać studnię do obecnego preview flow,
- rozszerzyć istniejący Vue overlay o shared rotate callbacks.

Nie zmieniać `evaluateGroundPlacement()` na OBB/box collision w ramach tego planu. Obecny `footprintRadius` nadal jest domenowym clearance dla walidacji; nowy shape ma służyć prezentacji.

## 1. Aktualne ownership i lifecycle

`src/app/actions/placementPreviewActions.ts` obecnie posiada:

- `active: PlacementPreviewKind | null`,
- start/cancel/confirm,
- mutual exclusion z terrain preparation,
- per-frame `resolvePreview()`,
- lifetime jednego `PlacementPreviewGhost`,
- `[E]` przez `keyboard.consumeInteract()`,
- dispatch do realnego placement action po confirm.

Zachować ten ownership. Rotation state należy właśnie tutaj, nie do `placementPreview.ts`, Vue ani palisady.

Istotny detal: obecny `confirm()` robi `exit()` przed `commit(kind)`. Po dodaniu rotation state trzeba **najpierw przechwycić wynikowy yaw**, potem wyjść z preview, a dopiero potem wywołać commit z tym yaw. Inaczej `exit()` wyzeruje stan potrzebny finalnemu re-resolve.

## 2. Kontrakt placementu: nie mieszać clearance i preview shape

Aktualny `PlacementPreviewResult`:

`{ x, z, yaw, footprintRadius, valid, reasonLabel }`

Aktualny `GroundPlacementDefinition` również zawiera tylko `footprintRadius`.

Rekomendacja: dodać osobny descriptor prezentacyjny, np.:

```ts
type PlacementPreviewFootprint =
  | { kind: 'circle'; radius: number }
  | { kind: 'box'; width: number; depth: number }
```

oraz przekazywać go przez `GroundPlacementDefinition` / `PlacementPreviewResult` tam, gdzie używany jest shared seam.

Nie używać box dimensions jako zamiennika obecnego `footprintRadius` w `evaluateGroundPlacement()`. Dzisiejsza walidacja jest celowo oparta o promień/separation i plan nie obejmuje zmiany tego modelu.

`supportsRotation` powinno być osobną capability placementu, najlepiej w descriptorze/lifecycle config `PlacementPreviewActions`, nie wyprowadzane z `footprint.kind`.

## 3. Rotation: rozdzielić aim yaw od object yaw

To jest najważniejsza zmiana względem obecnego kodu.

Dzisiaj `tent`, `chest`, `standingTorch`, `palisade`, `bedroll`, `platform` i `workContract` używają `mouseLook.state.yaw` jednocześnie do:

1. wyliczenia punktu przed graczem (`x/z`),
2. zapisania orientacji obiektu (`site.yaw`).

Po rozpoczęciu placementu plan wymaga, aby kamera nadal mogła zmieniać miejsce aim, ale nie obracała obiektu. Dlatego dla rotowalnych placementów:

- `aimYaw = mouseLook.state.yaw` nadal wylicza `x/z`,
- `objectYaw = snappedStartYaw + rotationSteps * PI/4` trafia do `site.yaw`.

Nie zamrażać całego `aim()` na yaw startowym, bo wtedy obrót kamery przestałby przesuwać preview przed graczem zgodnie z aktualnym spojrzeniem.

Najmniejsza zmiana API to przekazywanie opcjonalnego `objectYaw` do odpowiednich `preview*Placement()` i `place*AtAim()` / definicji placementu. Nie zapisywać override w module domenowym jako mutable global state.

## 4. Bazowy yaw i 45° steps

Przy `start(kind)` dla placementu z `supportsRotation`:

- odczytać aktualny `mouseLook.state.yaw`,
- snapnąć raz do najbliższego `PI / 4`,
- ustawić `rotationSteps = 0`.

Potem tylko explicit rotate zmienia `rotationSteps`. Normalizowanie yaw do `[-PI, PI)` lub `[0, 2PI)` jest opcjonalne; ważniejsza jest stabilność i 8 przewidywalnych stanów.

Dobrze wydzielić mały pure helper typu `snapPlacementYaw45()` / `rotatePlacementYaw()` i przetestować go bez Three.js.

`start()` musi zawsze inicjalizować nową bazę — nic z poprzedniego placementu nie może przeciekać po cancel/confirm.

## 5. Palisade snapping

`src/world/palisade.ts::resolvePalisadeSite()` jest już właściwym i wystarczającym mechanizmem. Nie dodawać grafu połączeń ani palisade managera.

Po zmianie palisade aim powinien mieć:

- raw `x/z` wyliczone z bieżącego `mouseLook.state.yaw` i `PALISADE_PLACE_REACH`,
- `yaw` ustawiony na shared `objectYaw`,
- dopiero ten raw site przekazany do `resolvePalisadeSite()`.

Resolver już ustawia środek nowego segmentu tak, aby jego `back` endpoint trafił w znalezione połączenie i zachowuje `aim.yaw`. Dzięki temu preview po snapie może pokazać dokładnie finalny transform bez nowej logiki.

Confirm musi ponownie wykonać tę samą ścieżkę z aktualnym `objectYaw`; nie używać `lastResult` poza gate `valid`.

## 6. Studnia

`placeWellAtAim()` jest obecnie pojedynczym, ręcznie zbudowanym `evaluateGroundPlacement()` flow i nie ma `previewWellPlacement()`.

Przed wpięciem do `PlacementPreviewActions` warto wydzielić `wellPlacementDefinition()` analogicznie do tent/torch/palisade, a następnie:

- `previewWellPlacement()` → `previewGroundPlacement(wellPlacementDefinition())`,
- `placeWellAtAim()` → `evaluatePlacementSite(wellPlacementDefinition())`.

To usuwa ryzyko driftu preview/confirm i nie dotyka dalszego construction lifecycle studni.

Studnia jest circular i nie potrzebuje manual rotation.

## 7. Placement coverage i footprinty

Tabela obejmuje **aktualne `PlacementPreviewKind` + studnię**, czyli zakres wspólnego placement-preview po tym planie.

| Placeable | Preview footprint | Wymiary / źródło | Rotation |
|---|---|---|---|
| `chest` | box | `0.9 × 0.55 m`; aktualnie prywatne `CHEST_WIDTH` / `CHEST_DEPTH` w `world/containerProp.ts` | yes |
| `tent` | box | `TENT_WIDTH = 1.76`, `TENT_LENGTH = 2.42` w `items/tentProp.ts` | yes |
| `fireSimple` | circle | `FIRE_FOOTPRINT_RADIUS = 0.7` w `app/userActions.ts` | no |
| `firePit` | circle | `FIRE_FOOTPRINT_RADIUS = 0.7` | no |
| `firePile` | circle | `FIRE_FOOTPRINT_RADIUS = 0.7`; `PlacedFires` nie przechowuje yaw | no |
| `standingTorch` | circle | `STANDING_TORCH_FOOTPRINT_RADIUS = 0.3` w `world/standingTorch.ts` | no |
| `palisade` | box | długość `PALISADE_LENGTH = 2.2`; użyć szerokości clearance `2 * PALISADE_FOOTPRINT_RADIUS = 0.6` zamiast modelowego ~0.14 m, żeby ghost pokazywał zajmowany korytarz | yes |
| `bedroll` | box | `0.7 × 1.9 m`; aktualnie prywatne `BEDROLL_WIDTH` / `BEDROLL_LENGTH` w `world/sleepingUtilityProp.ts` | yes |
| `platform` | box | finalnie `1.2 × 1.8 m` po obecnym `group.scale = 0.75`; źródłowe `1.6 × 2.4` w `world/sleepingUtilityProp.ts` | yes |
| `workContract` | circle | target jest realną studnią; `CONTRACT_TARGET_FOOTPRINT_RADIUS = WELL_FOOTPRINT_RADIUS = 0.9` | no |
| `well` | circle | `WELL_FOOTPRINT_RADIUS = 0.9` w `world/playerWell.ts` | no |

Dla boxów nie kopiować powyższych liczb drugi raz do action code. Tam gdzie dimensions są dziś prywatne w prop file (`chest`, `bedroll`, `platform`), przenieść/wyeksportować małe world-space constants z sensownego ownera i użyć ich zarówno w propie, jak i descriptorze preview.

Nie rozszerzać przy okazji shared preview na pułapki, garden, tree/crop planting ani `putDownContainerAtAim()`. Aktualny kod nie ma dla nich `PlacementPreviewKind`; to osobna decyzja produktowa poza konkretnym zakresem tego planu.

## 8. Renderer `src/world/placementPreview.ts`

Obecny ghost tworzy raz circle fill + ring i per frame robi tylko scale/position/color. Zachować tę właściwość.

Najprościej utrzymywać w jednym ghost group gotową geometrię circle i box, przełączając `visible` oraz skalując odpowiednie child meshes. Nie tworzyć `BufferGeometry` podczas `tick()`.

API powinno przyjmować footprint + yaw, np. jeden `setTransform(..., yaw)` i `setFootprint(...)`, zamiast rendererowi dawać `PlacementPreviewKind`.

Box powinien być zorientowany zgodnie z `PlacementPreviewResult.yaw`. Circle może ignorować yaw wizualnie.

Palisade preview powinno używać **snapped `result.x/z/yaw`**, nie raw aim.

## 9. Desktop input — konflikt `G`

`src/input/Keyboard.ts` ma już:

- `KeyG -> drop`,
- `drop` jako edge-triggered state,
- `consumeDrop()` używane później przez game loop do wyrzucania przedmiotu.

Nie dodawać drugiego window `keydown` listenera dla rotation.

Najmniej inwazyjna integracja:

- dodać `KeyF` jako nowy edge-triggered `rotateLeft` + `consumeRotateLeft()`,
- podczas aktywnego rotowalnego placementu traktować istniejące `keyboard.consumeDrop()` jako `rotateRight()` dla `G`.

Ponieważ event zostanie wtedy skonsumowany w placement lifecycle, późniejszy zwykły drop nie odpali. Poza placement mode `G` zachowa dotychczasowe znaczenie.

Jeśli implementacja wybierze bardziej semantyczny refactor Keyboard, nie może skończyć z dwoma latent states ustawianymi przez ten sam `KeyG`, bo po wyjściu z preview jeden z nich może zostać skonsumowany jako opóźniony drop.

## 10. Vue / mobile controls

Aktualny `PlacementPreviewOverlay.vue` już ma confirm/cancel i jest właściwym miejscem dla mobile controls.

`src/ui-vue/store.ts` ma istniejący wzorzec thin callbacks:

- `configurePlacementPreviewConfirm()`,
- `confirmPlacementPreview()`,
- analogiczne `TerrainPreparationControls` dla wielu przycisków.

Rozszerzyć ten sam wzorzec o `rotateLeft` / `rotateRight`; Vue nie powinno liczyć yaw ani steps.

`PlacementPreviewUiView` / `PlacementPreviewState` powinny dostać co najmniej `supportsRotation`, aby overlay wiedział, czy pokazać:

- desktop hint `F / G — Obróć`,
- dwa touch buttons.

Nie wykrywać mobile w domenie placementu. Overlay może po prostu renderować przyciski w swoim istniejącym responsive UI; capability nadal pochodzi ze shared placement state.

## 11. Fire placement jest wyjątkiem od `GroundPlacementDefinition`

`app/userActions.ts::previewFirePlacement()` nadal ręcznie buduje `PlacementPreviewResult`; trzy fire kinds współdzielą tę samą funkcję i `PlacedFires.place()` nie zapisuje yaw.

Nie ma potrzeby migrować fire do `GroundPlacementDefinition` tylko dla jednolitości. Wystarczy zwrócić circular preview descriptor i `supportsRotation = false` na shared boundary.

## 12. Pułapki / regresje

- Nie przechowywać `lastResult` jako authoritative transform dla confirm.
- Nie resetować rotation state przed przechwyceniem yaw do commit.
- Nie używać frozen start yaw do wyliczania `x/z`; zamrożona ma być orientacja obiektu, nie aim point.
- Nie pozwolić `G` jednocześnie rotować i dropować itemu.
- Nie tworzyć box geometry per frame.
- Nie importować Vue/store do action/domain modules.
- Nie przenosić palisade snapping do preview controller/renderer.
- Nie zmieniać placement collision semantics z circle na box w tym planie.
- `mouseLook.state.zoomLocked` oraz mutual exclusion z terrain-preparation pozostają bez zmian.

## 13. Przydatna kolejność implementacji

1. Dodać `PlacementPreviewFootprint` + renderer circle/box/yaw bez zmiany gameplayu.
2. Dodać capability/rotation state i pure 45° helpers w `PlacementPreviewActions`.
3. Rozdzielić aim yaw / object yaw dla `tent`, `chest`, `palisade`, `bedroll`, `platform`; przepiąć confirm na captured yaw.
4. Włączyć `well` przez `wellPlacementDefinition()`.
5. Dodać UI state/callbacks + `PlacementPreviewOverlay.vue` buttons/hint.
6. Dodać `F` i bezpieczne przejęcie istniejącego `G` podczas rotowalnego preview.
7. Testy: snap/rotation lifecycle, yaw override preview-vs-confirm, palisade resolver z 45° yaw; reszta browser verification należy do Usera.

## 14. Kluczowe pliki

- `src/app/actions/placementPreviewActions.ts` — lifecycle, rotation state, dispatch.
- `src/app/actions/placementActions.ts` — shared placement contract; tent/well/torch/palisade/bedroll/platform.
- `src/app/actions/containerActions.ts` — chest aim + confirm.
- `src/app/actions/workContractActions.ts` — circular well-sized contract target.
- `src/app/userActions.ts` — fire preview, no persisted yaw.
- `src/world/placementPreview.ts` — renderer only.
- `src/world/palisade.ts` — `PALISADE_LENGTH`, endpoints, `resolvePalisadeSite()`.
- `src/items/tentProp.ts`, `src/world/containerProp.ts`, `src/world/sleepingUtilityProp.ts` — current visual dimensions.
- `src/input/Keyboard.ts` — `F` addition and existing `G/drop` conflict.
- `src/ui-vue/store.ts`, `src/ui-vue/screens/PlacementPreviewOverlay.vue`, `src/ui-vue/mount.ts` — shared UI controls/wiring.
- `src/app/createApp.ts` — existing preview wiring; extend callbacks only, no new controller.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
