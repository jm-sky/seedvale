# Plan: Construction Status, Inspection and Context Actions

**Created:** 2026-09-09
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** M
**Depends on:** ~~ui-input-002~~, ~~items-player-017~~, ~~npc-018~~, ~~settlements-005~~, ~~world-021~~
**Domain:** `ui-input`
**Subdomains:** `interaction` `feedback` `menus`
**Tags:** `construction` `inspection` `work-contracts` `context-panel`
**Roadmap:** -

## Cel

Dodać spójny mechanizm **Inspect / Details** dla wybranych obiektów świata oraz wykorzystać go jako właściwy ekran statusu budowy i zarządzania pracą.

Pierwszym pełnym use-case'em są:

- player-built well,
- terrain preparation,
- palisade,
- standing torch,
- residential building.

Mechanizm ma być rozszerzalny później na inne inspectable world objects bez tworzenia równoległych systemów UI.

UI ma prezentować istniejący authoritative world state. Nie dodawać osobnego construction/inspection state w domenie.

## Global interaction contract

Zachować obecne dwa kanały interakcji:

```text
E = primary interaction
R = alternate interaction
```

Ich obecna semantyka pozostaje bez zmian.

Dodać trzeci, niezależny kanał:

```text
V = inspect / details
```

### Reguły

- `[E]` wykonuje obecną primary action.
- `[R]` wykonuje obecną alternate action.
- `[V]` otwiera inspection/details view.
- `[V]` działa tylko dla targetów mających meaningful inspection.
- Brak inspection oznacza brak reakcji i brak promptu/buttona.
- Nie przenosić istniejących `[R]` actions do inspection w ramach tego planu.
- Nie zmieniać istniejących `[E]/[R]` bindings.
- Inspection pozostaje trzecim, jednoznacznym kanałem; nie dodawać fallbacku `E -> inspect` ani `R -> inspect`.

## Desktop input

Rozszerzyć istniejący keyboard state o osobny inspect input, preferencyjnie `inspect: boolean`, `KeyV -> inspect` i `consumeInspect(): boolean`.

Nie przeciążać `interact` ani `altInteract`. `V` jest globalnym input semanticznym „inspect”, nie construction-specific shortcutem.

Nie naruszać istniejących `E`, `R`, `T` (dismount), `F` (placement rotation) ani pozostałych global shortcuts.

## Mobile input

Obecny touch UI posiada `[R] [E]`. Dodać trzeci przycisk po ich lewej stronie, bliżej środka ekranu:

```text
[Inspect] [R] [E]
```

Inspect button:

- jest widoczny tylko wtedy, gdy aktualny target ma inspect capability,
- znika po utracie targetu,
- znika dla targetów bez meaningful inspection.

Nie wymagać litery `V` na mobile. Preferować ikonę inspection/details (`Search`, `Eye`, `Info` lub istniejący odpowiednik Lucide) i accessibility label `Sprawdź`.

## Inspection capability i dispatch

Nie dodawać `inspect` jako niezależnego boolean rozrzuconego po UI. Lepszym źródłem prawdy jest `inspection view exists -> target is inspectable`, np. `getInspection(target): WorldInspectionView | null`.

Nie tworzyć nowego target selection. Reuse:

```text
buildInteractables()
-> pickInGaze / selected target
-> current Interactable
-> inspection resolver
-> inspection view
-> UI
```

Vue nie wykonuje ponownego world-space search.

## Scope v1

Pełne inspection zaimplementować dla:

- player-built well — construction, completed well, roof condition/repair,
- active terrain preparation,
- palisade — unfinished/completed, jeśli istnieją meaningful dane,
- standing torch — construction/completed,
- residential building — construction oraz completed player-owned building, jeśli istnieją meaningful dane.

Nie migrować w tym planie wszystkich pozostałych `Interactable.kind`.

## Construction inspection

Pokazywać zależnie od targetu:

- nazwę i opis,
- bieżący status,
- etap,
- postęp pracy,
- pozostałą pracę,
- materiały,
- aktywny Work Contract,
- dostępne management actions.

Nie wymuszać identycznego zestawu pól dla każdego targetu.

### Stages i progress

Dla targetów posiadających jawne etapy pokazywać label etapu, indeks/liczbę etapów i progress bieżącego etapu. Nie tworzyć fikcyjnych etapów dla palisade, standing torch ani terrain preparation.

Pokazywać authoritative `completedWork`, `requiredWork`, `remainingWork`, gdzie istnieją. Progress bar jest wyłącznie derived presentation.

Overall construction progress pokazywać tylko, gdy można go wyliczyć jednoznacznie. Dla residential:

```text
sum(required work completed stages) + current stageWorkProgress
------------------------------------------------------------
sum(required work all stages)
```

Nie persistować overall percentage.

Nie zmieniać semantyki `residentialBuildingRemainingWork(...)`, jeśli pozostaje current useful-work authority dla Work Contracts. Jeśli inspection potrzebuje total work remaining until complete, dodać osobny pure derived helper.

## Materials

UI nie może wymyślać większej szczegółowości niż domena. Residential posiada `materialsSupplied: boolean`, a nie ledger częściowych dostaw per materiał.

Poprawne jest pokazanie wymagań oraz stanu `Materiały wymagane` / `Materiały dostarczone`. Nie pokazywać fikcyjnego `Belki 3 / 6` i nie dodawać partial-material persistence tylko dla inspection UI.

## Well inspection

Player-built well jest pierwszym vertical slice'em, bo już łączy construction, water use, requirements, condition i repair.

### Unfinished well

- `E` pozostaje pracą/budową.
- `R` pozostaje zgodne z obecnym zachowaniem.
- `V` otwiera inspection z etapem, postępem, remaining work, materiałami i akcjami typu `Buduj dalej`, `Zleć pomoc`.
- Jeśli na danym etapie istnieje już dostępny `WaterSource`, inspection może pokazać istniejące water actions.

### Completed well

- `E` pozostaje obecną szybką akcją picia.
- `R` pozostaje bez zmian.
- `V` otwiera inspection z dostępnością wody, condition daszku i akcjami `Napij się`, `Napełnij pojemnik`, a przy uszkodzeniu także `Napraw`.

Nie zmieniać ownership condition/repair z `world-020`/`world-021`.

## Liquid container selection

Obecny water-fill flow automatycznie wybiera odpowiedni carried liquid container. Inspection może wyświetlić listę kompatybilnych carried liquid-container instances i pozwolić wybrać konkretną instancję, np. kilka bukłaków i wiadro wraz z aktualnym napełnieniem.

Nie tworzyć nowego liquid-container modelu. Reuse:

- `LiquidContainerItemInstance`,
- inventory instance IDs,
- `canFillLiquidContainer(...)`,
- `fillLiquidContainer(...)`,
- `Inventory.updateInstance(...)`,
- istniejące WaterSource gates.

Obecny auto-select helper pozostaje dla existing quick interactions. Dodać application-level operation umożliwiającą napełnienie konkretnego `source + instanceId` z live revalidation: container nadal istnieje i jest carried, może przyjąć water, source nadal jest usable, a rope/water/source restrictions nadal obowiązują.

Vue nie mutuje container instance bezpośrednio.

## Inspection UI architecture

Nie rozbudowywać `FlavorDialog.vue` do dużego inspection frameworka. Dodać dedicated screen, np. `WorldInspectionScreen.vue` / `InspectionScreen.vue`, zgodnie z istniejącym naming convention.

Reuse:

- `useOverlayScreen`,
- `openStack`,
- Escape,
- touch scroll,
- existing modal/input lifecycle,
- UI tokens.

Nie tworzyć osobnego modal managera.

Preferowany neutralny read model może wyglądać jak:

```ts
type WorldInspectionView = {
  targetId: string
  title: string
  description?: string
  sections: readonly InspectionSection[]
  actions: readonly InspectionAction[]
}
```

Nie zamrażać dokładnego API, jeśli current UI primitives sugerują prostszy model. Oddzielić inspection data od capabilities/actions. Mutacje przechodzą przez application callbacks.

## Reusable UI components

Nie implementować jednego ogromnego komponentu z dziesiątkami branchy. Wydzielać małe presentation components po faktycznym reuse, orientacyjnie:

```text
InspectionScreen
 |- InspectionHeader
 |- InspectionSection
 |   |- InfoRow
 |   `- ProgressBar
 |- MaterialsSection
 |- LiquidContainerSection
 |- ContractSection
 `- InspectionActions
```

Komponenty mają być props-driven, bez gameplay imports, world/inventory/contract lookups, progress calculations i action eligibility logic.

## Work Contracts

Inspection nie tworzy osobnego hiring systemu.

`Zleć pomoc` ma uruchamiać ten sam flow co Quick Actions:

```text
work share -> worker count -> reward -> create -> notice board posting
```

Wydzielić shared application-level entry point z obecnego `workContractActions.ts`, zamiast kopiować dialog flow.

### Quick Actions guardrail

Nie usuwać, nie ukrywać ani nie zmieniać obecnych Quick Actions. Zachować `Zleć pomoc`, listę contracts, construction placement entries, notice-board flow oraz cancellation/payment management. Inspection jest drugim entry pointem.

Jeżeli target ma non-terminal Work Contract, nie tworzyć drugiego; pokazać status istniejącego na podstawie aktualnego recordu, np. contract state, requested work share/count, active workers, reward, committed work i NPC work completed. Nie dodawać nowych persistence fields dla presentation.

## Actions inside inspection

Inspection może udostępniać management/actions odpowiednie dla targetu, np. `Buduj dalej`, `Dostarcz materiały`, `Zleć pomoc`, `Anuluj budowę`, `Usuń`, `Napraw`, `Napij się`, `Napełnij pojemnik`.

Nie oznacza to usuwania tych akcji z `[E]` lub `[R]`. Primary/alternate interaction może również występować w inspection jako jawna akcja.

## Cancel vs remove

Nie ujednolicać mechanicznie. Zachować istniejące domain semantics, material recovery, recovery rates, removal rules i ownership. Residential nadal cancel construction; palisade nadal remove segment.

## Live state and refresh

Inspection view jest snapshotem presentation state. Każda mutation action musi revalidować live state.

Jeżeli inspection pozostaje otwarty po akcji zmieniającej target, odbudować view z authoritative state. Nie mutować lokalnie progress/material/contract values w Vue.

Dotyczy m.in. work bout, supply materials, stage transition, contract creation/cancellation, repair oraz container fill.

## Completed targets

Completion nie może pozostawiać stale construction UI. Po zakończeniu budowy inspection przechodzi do normalnej informacji o obiekcie, np. well: construction status -> water + condition + actions.

## Prompt / HUD

Dla inspectable targetu gaze prompt może dodatkowo pokazać `[V] Sprawdź` obok istniejących `[E]/[R]`. Na mobile litera `V` nie jest potrzebna — widoczny jest inspect button.

Nie przepisywać target-specific promptów w Vue. Jeśli dodanie trzeciego hintu powoduje zbyt długie stringi, preferować rozdzielenie presentation action hints zamiast pełnego HUD refactoru.

## Existing systems to reuse

Focused recon potwierdził istotne seamy:

### Input
- `src/input/Keyboard.ts`
- `KeyState`
- `KEY_MAP`
- edge-triggered consumers

### Mobile
- `src/input/createTouchControls.ts`
- `configureTouchChrome(...)`
- `src/ui-vue/screens/TouchChrome.vue`

### Interaction
- `src/interaction/Interactable.ts`
- `src/app/interactables.ts`
- current target selection
- `src/app/gameLoop.ts` interaction dispatcher

### UI
- `src/ui-vue/store.ts`
- `useOverlayScreen`
- `openStack`
- existing modal screens
- `FlavorDialog.vue` tylko jako small-action-dialog reference, nie inspection container

### Well
- `src/world/playerWell.ts`
- `src/app/actions/placementActions.ts`
- `describeWellWork(...)`
- `describeWellRoofRepair(...)`
- `workOnWell(...)`
- `workOnWellRoofRepair(...)`

### Water
- `src/app/actions/survivalActions.ts`
- current `drinkFromWaterSource(...)`
- current auto-select fill operation
- liquid-container domain helpers
- Inventory instance operations

### Construction
- `src/world/palisade.ts`
- `src/world/standingTorch.ts`
- `src/world/residentialBuilding.ts`
- `src/terrain/terrainPreparation.ts`

### Contracts
- `src/world/workContract.ts`
- `src/app/actions/workContractActions.ts`

## Non-goals

Nie obejmuje:

- zmiany znaczenia `R`,
- migracji wszystkich alt actions,
- nowego global action registry,
- wszystkich world objects,
- nowego construction managera,
- nowego Work Contract systemu,
- partial material delivery,
- rebalance construction/contracts,
- przebudowy liquid-container domain,
- condition system redesign,
- pełnego redesignu HUD,
- nowego input frameworka,
- wymiany target selection.

## Implementation order

1. Dodać semantic `inspect` input do `Keyboard.ts`.
2. Dodać mobile inspect callback/input path.
3. Dodać conditional inspect button do `TouchChrome.vue`.
4. Dodać inspection availability dla current target.
5. Dodać dedicated inspection screen/state/open-close lifecycle.
6. Zdefiniować minimalny read-model/action contract.
7. Zaimplementować player-built well jako pierwszy vertical slice.
8. Zintegrować completed well + roof condition/repair.
9. Dodać concrete liquid-container selection.
10. Dodać terrain preparation.
11. Dodać palisade.
12. Dodać standing torch.
13. Dodać residential building.
14. Dodać global/overall residential progress helper.
15. Wydzielić reusable Work Contract creation entry point.
16. Dodać contextual `Zleć pomoc`.
17. Dodać active contract summary.
18. Uzupełnić reusable UI components zgodnie z faktycznym reuse.
19. Dodać testy.
20. Uzupełnić implementation notes i state docs.

## Tests

### Input
- `V` ustawia inspect edge.
- `consumeInspect()` czyści edge.
- repeat nie powoduje wielokrotnych akcji.
- `T` nadal dismount.
- `E/R` bez regresji.

### Mobile
- inspect button hidden bez inspectable target,
- visible dla inspectable target,
- click wysyła inspect action,
- `E` i `R` zachowują dotychczasowe callbacki.

### Inspection resolver
- unsupported target -> `null`,
- unfinished/completed/damaged well,
- terrain prep,
- palisade,
- torch,
- residential.

### Construction
- zero/partial/completed progress,
- residential stage transition,
- overall progress,
- total remaining,
- material-blocked stage.

### Liquid containers
- kilka bukłaków,
- bukłak + wiadro,
- częściowo pełny container,
- full container zgodnie z UX,
- wybrany `instanceId` napełnia właściwy container,
- stale/missing instance jest odrzucony przez live validation,
- source restrictions nadal obowiązują.

### Work Contracts
- brak contractu -> `Zleć pomoc`,
- active contract -> summary zamiast duplicate creation,
- material-blocked target zachowuje istniejącą eligibility,
- Quick Actions nadal używa tego samego flow.

### Stale snapshot

Otwarty inspection nie może ufać staremu snapshotowi po zmianie world state; application revalidates przed mutation.

## Manual browser verification

Browser verification wykonuje User.

Sprawdzić desktop: `E`, `R`, `V`, target switching i brak reakcji `V` dla nieinspectable targetów.

Sprawdzić mobile: `[Inspect] [R] [E]`, pozycję, ergonomię, visibility, touch landscape i safe-area.

Sprawdzić targety: unfinished/completed/damaged well, kilka liquid containers, terrain preparation, palisade, standing torch, small/medium house i active Work Contract.

Regresje: wszystkie istniejące `[E]`, wszystkie istniejące `[R]`, Quick Actions, Busy Overlay, notice-board posting, repair, save/load i completed-object behavior.

## Documentation

Zaktualizować:

- `docs/state/player-systems.md`,
- odpowiedni UI/input state documentation,
- implementation notes dla `ui-input-014`.

Implementation notes powinny zawierać dokładne input symbols, touch callback wiring, inspection availability ownership, view builders, per-target domain helpers, WaterSource/liquid-container seams, Work Contract shared flow, overlay lifecycle, stale-state rules oraz listę `[E]/[R]` zachowanych bez zmian.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
