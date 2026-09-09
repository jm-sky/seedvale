# Construction Status, Inspection and Context Actions — Implementation Notes

**Reviewed:** 2026-09-09

## Current-state findings

- Plan jest nadal zgodny z aktualną architekturą. `Interactable` pozostaje per-frame adapterem zbudowanym przez `buildInteractables()`, a finalny `target` jest wybierany w `gameLoop.ts` przez istniejący gaze/cycle/combat pipeline. Inspection musi korzystać dokładnie z tego samego `target`; nie wykonywać ponownego world-space lookupu w Vue.
- `Keyboard.ts` ma jeden `KeyState`, `KEY_MAP`, `EDGE_TRIGGERED` i `consume*()` dla semantycznych akcji. `inspect` powinno zostać dodane jako peer `interact`/`altInteract`, włącznie z inicjalizacją stanu, `KeyV`, `EDGE_TRIGGERED`, unionem lokalnego `consume()` i publicznym `consumeInspect()`.
- Mobile nie ma osobnego input pipeline: `createTouchControls.ts` zapisuje bezpośrednio do tego samego `KeyState`, a `TouchChrome.vue` wywołuje callbacki skonfigurowane przez `VueUi`. Dodać `onInspect` analogicznie do `onAltInteract`; nie wywoływać resolvera inspection bezpośrednio z Vue.
- `TouchChrome.vue` ma obecnie `R` absolutnie po lewej stronie przycisku `E`. Inspect najlepiej dołożyć w tym samym action clusterze po lewej od `R`; jego widoczność powinna pochodzić ze stanu `ui.touch.inspectAvailable` synchronizowanego z aktualnie wybranym `target`, nie z listy wszystkich pobliskich interactables.
- Nowy inspection screen jest pełnym modalem. Sam `useOverlayScreen`/`openStack` zapewni Vue/Escape lifecycle, ale gameplay input blokuje osobno `activeModal()` w `src/app/modalState.ts`. Trzeba dodać inspection do `ActiveModal`/`activeModal()` oraz gałęzi w `gameLoop.ts`; inaczej światowe `E/R/V` i touch mogą działać pod otwartym screenem.
- W gałęzi `modal !== null` `gameLoop.ts` jawnie konsumuje stale presses. Po dodaniu `consumeInspect()` również tam trzeba go zawsze drenować, tak samo jak `interact`/`altInteract`, aby naciśnięcie `V` w modalu nie odpaliło po jego zamknięciu.

## Inspection ownership / resolver

- Read model powinien powstawać w warstwie app/gameplay, nie w `ui-vue` i nie w world-domain. Vue ma dostać gotowe sekcje/actions i tylko je renderować.
- Resolver powinien przyjmować bieżący `Interactable` i rozwiązywać mutable record po stabilnym `id` z aktualnego `WorldBundle` (`playerWells`, `terrainPreparations`, `palisades`, `standingTorches`, `residentialBuildings`). Nie traktować `complete`, `materialsSupplied`, `stage` ani `waterSource` z `Interactable` jako authority dla mutacji — te pola są celowo snapshotami prompt/dispatch.
- Nie dodawać `inspectable: boolean` do `Interactable`. Jedno wywołanie resolvera `target -> WorldInspectionView | null` powinno jednocześnie określać availability (`V`/mobile button) i budować view przy otwarciu.
- Po każdej akcji wykonywanej z inspection ponownie rozwiązać target po `kind + id` i przebudować view. Jeżeli target przestał istnieć (cancel/remove/completion usuwająca marker), zamknąć screen lub przejść do odpowiedniego completed view; nie patchować lokalnego Vue state.
- Nie przechowywać `Interactable` ani domain recordu w Vue. W screen state wystarczy read model + callbacks/stabilny target ref potrzebny do refreshu.

## Existing construction authorities

- **Well:** `src/world/playerWell.ts` jest authority dla `WELL_STAGE_ORDER`, stage work/material costs, `workProgress`, `wellRemainingWork()`, completion, water availability i roof condition. `wellRemainingWork()` obejmuje bieżący + przyszłe etapy i nadaje się do total remaining. `src/app/actions/placementActions.ts` ma już `describeWellWork(id)` oraz `describeWellRoofRepair(id)`; użyć/rozszerzyć te query zamiast ponownie kodować eligibility/material requirements w inspection resolverze. Mutacje nadal przez istniejące `workOnWell()` / `workOnWellRoofRepair()`.
- **Terrain preparation:** `terrainPreparationRemainingWork(record)` jest istniejącym authority dla pozostałej useful work. Aktywny marker znika po zakończeniu, więc completion podczas otwartego inspection musi obsłużyć utratę targetu.
- **Palisade:** `PALISADE_REQUIRED_WORK`, `completedWork`, `palisadeRemainingWork()` i `isPalisadeConstructionComplete()` są wystarczające; brak etapów. Removal pozostaje istniejącym `[R]` flow i musi zachować material-recovery semantics.
- **Standing torch:** analogicznie użyć `completedWork` + `standingTorchRemainingWork()` / `isStandingTorchConstructionComplete()`. Nie tworzyć sztucznych etapów. Completed inspection może pokazać stan zapalenia, ale ignition nadal korzysta z istniejącej akcji/revalidation.
- **Residential:** `ResidentialBuildingRecord.stage`, `stageWorkProgress`, `materialsSupplied` oraz definition/stage helpers są authority. `residentialBuildingRemainingWork()` celowo zwraca tylko useful work bieżącego, już zaopatrzonego etapu i `0` przy material block; to kontrakt Work Contracts i nie wolno zmieniać jego semantyki dla UI. Dla overall inspection dodać osobny pure helper sumujący wymagane work wszystkich etapów i dotychczas wykonane etapy + `stageWorkProgress`.
- Residential nie posiada partial material ledger. Inspection może wyświetlić wymagania bieżącego etapu i `materialsSupplied`, ale nie ilości „dostarczono X/Y”, jeśli record tego nie przechowuje.

## Work Contracts

- `src/world/workContract.ts` jest authority dla commitment/lifecycle. Target pozostaje właścicielem construction progress; kontrakt przechowuje tylko m.in. `requestedWorkShare`, `remainingWorkAtCreation`, `committedWork`, `npcWorkCompleted`, `requestedWorkerCount`, `assignments`, reward i state.
- `createWorkContracts.ts` ma `hasActiveContract(target)`, ale nie ma gotowego query zwracającego contract dla targetu. Jeżeli inspection potrzebuje summary, dodać mały query/helper zwracający non-terminal record dla `ContractTarget`; nie skanować kontraktów w Vue.
- `workContractActions.ts` ma obecnie wspólny `beginContractCreation(...)`, ale jest on lokalny i przyjmuje już policzone `x/z/remainingWorkAtCreation`. Dla inspection wydzielić publiczny application-level entry point przyjmujący stabilny `ContractTarget` i **wewnątrz** rozwiązać live record, pozycję, current useful remaining work oraz `hasActiveContract` przed rozpoczęciem pickerów. Nie przekazywać tych wartości ze snapshotu inspection.
- Zachować istniejący picker `work share -> worker count -> reward -> create` i notice-board posting. Inspection jest tylko drugim entry pointem; `openHireHelp()` w Quick Actions i jego lista pozostają.
- Dla residential helper do overall remaining **nie** może zastąpić `residentialBuildingRemainingWork()` przy tworzeniu kontraktu. Kontrakty pracują tylko nad aktualnie useful work, zgodnie z obecnym material/stage gate.
- Contract summary może być derived bez nowych pól persistence: state/advertisement, `requestedWorkerCount`, liczba aktywnych assignmentów (`isAssignmentWorkActive`), reward, `committedWork`, `npcWorkCompleted` i assignment statusy już istnieją.

## Water / liquid containers

- `survivalActions.ts` już obsługuje wszystkie `LIQUID_CONTAINER_KIND_LIST` (waterskins i bucket), wybierając najmniejszy kompatybilny container przez `canFillLiquidContainer()`. Nazwa `fillWaterskin()` jest legacy; nie zakładać, że quick flow ogranicza się faktycznie do bukłaka.
- Dla wyboru konkretnej instancji dodać application operation w tym samym obszarze co `fillWaterskin()`, np. `fillWaterContainer(source, instanceId)`. Powinna rewalidować przy wykonaniu: `isActionBlocked`, source quality/usability, well rope/restrictions, istnienie instance w inventory, `isLiquidContainerInstance`, `canFillLiquidContainer(inst, 'water')`, a mutation wykonać przez `Inventory.updateInstance()` + `fillLiquidContainer()`.
- Nie przekazywać do callbacka instance snapshotu z Vue. UI może dostać `instanceId`, label/capacity/current content; callback bierze tylko ID i ponownie odczytuje inventory.
- Istniejące szybkie `[R]` nadal wywołuje auto-select `fillWaterskin()`.

## Well repair integration

- Aktualny `gameLoop.ts` ma już specjalny completed-well branch: `describeWellRoofRepair()` buduje availability, a `R` przy uszkodzonym dachu otwiera `FlavorDialog` z repair/drink/fill. Inspection powinno przejąć **dodatkowy** ekran `V`, ale plan explicite zostawia `R` bez zmian — nie usuwać obecnego repair dialogu.
- Roof condition/repair pozostaje w `playerWell.ts` + `placementActions.ts` (world-020/world-021). Inspection nie może posiadać własnego condition state ani własnych repair kosztów.

## UI / lifecycle details

- Dedicated screen powinien korzystać z `useOverlayScreen` i `ui.openStack`; nie rozbudowywać `FlavorDialog.vue` do wielosekcyjnego construction screen. `FlavorDialog` nadal jest sensowny dla istniejących małych pickerów Work Contract i obecnego `[R]` well flow.
- Action callbacks w read modelu muszą przechodzić przez application/domain handlers. Komponenty sekcji/progress/materials nie importują `WorldBundle`, `Inventory`, `WorkContractRecord` ani construction modules.
- Inspection availability trzeba zerować w tych samych sytuacjach, w których `gameLoop` zeruje target/prompt: modal, mounted state, utrata targetu. Nie pozostawiać stale mobile buttona po wejściu w modal.
- Prompt `[V] Sprawdź` najlepiej dokleić po rozstrzygnięciu finalnego `target`, obok obecnego `cycleHint`; nie modyfikować wszystkich target-specific `promptLabel()` tylko po to, aby dodać trzeci hint.

## Pitfalls

- `gameLoop.ts` jest obecnie dużym dispatcherem. Nie dodawać w nim kompletnego switcha budującego inspection data; utrzymać tam tylko `consumeInspect()` + `if (inspection) open...`, a resolver/actions wydzielić do app layer.
- Nie capture'ować `bundle.playerWells`/`workContracts`/itp. w długowiecznych Vue callbackach, jeśli callback może przeżyć `WorldBundle` rebuild. Wzorzec w app actions korzysta z `ctx.bundle`; lookup wykonywać w momencie akcji/refreshu.
- `Interactable.playerWell.waterSource` jest per-frame snapshotem. Przy fill/drink z otwartego inspection source trzeba odtworzyć z live well recordu (`wellWaterSource`/current availability), szczególnie podczas repair/completion transitions.
- Completion/cancel/remove mogą zmienić rodzaj sensownego view albo usunąć interactable. Testy powinny obejmować refresh po mutacji, nie tylko initial resolver output.
- Plan nie wymaga nowego global action registry. Nie uogólniać wszystkich `Interactable.kind` ani istniejących `E/R` flows.

## Suggested implementation sequence

1. `inspect` w `Keyboard.ts` + touch callback/state + modal stale-edge draining.
2. Minimalny app-layer inspection resolver/read model i dedicated Vue screen; well vertical slice bez contracts/container picker.
3. Well repair/completed refresh + prompt/mobile availability.
4. Pozostałe 4 construction targets, wykorzystując ich istniejące remaining-work helpers.
5. Shared targeted Work Contract entry point + contract summary.
6. Concrete liquid-container selection z live revalidation.
7. Tests: resolver/read-model pure cases, keyboard edge semantics, targeted contract revalidation, concrete container fill, modal/refresh lifecycle; manual browser verification pozostaje po stronie użytkownika.
