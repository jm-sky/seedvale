# Plan: Building placement and construction UX coherence

**Created:** 2026-09-10
**Status:** `planned` 📋
**Type:** polish
**Priority:** high · **Effort:** L
**Depends on:** ~~ui-input-014~~, ~~ui-input-015~~, items-player-024
**Domain:** `ui-input`
**Subdomains:** `interaction` `feedback` `hud`
**Tags:** `placement` `construction` `inspection` `materials` `busy` `repair`
**Roadmap:** -

## Goal

Domknąć UX findings z `docs/reviews/ux/2026-09-10--building-placement-construction-repair-ux-review.md` na aktualnym `main`, bez tworzenia równoległego systemu budowy, placementu, inspekcji ani materiałów.

Docelowy model:

```text
PlacementPreviewActions = jeden preview lifecycle dla placeables
PlacementActions / domain owners = walidacja, koszty i mutacja
constructionMaterials.ts = jedno źródło availability inventory + nearby world
InteractionView = aktualne world actions i reasonLabel
WorldInspection = szczegóły konstrukcji / napraw / bezpiecznych akcji
BusyAction = wykonywanie i możliwość przerwania aktywnej pracy
```

Gracz ma przed zatwierdzeniem rozumieć **gdzie**, **co**, **za ile** i **dlaczego może/nie może** postawić lub kontynuować konstrukcję. Po rozpoczęciu pracy nie wymagać sztucznych powtórzeń `[E]` co arbitralną godzinę symulacji.

## Recon / reconciliation z aktualnym `main`

Zweryfikowane na `main` @ `27376fe6856d2e879415cb570b1de5aacf208ea3`.

- `src/app/actions/placementPreviewActions.ts` jest jednym shared preview lifecycle dla 14 rodzajów placeables, ale jego UI contract ma tylko binarne `valid` i `reasonLabel`.
- `src/app/actions/placementActions.ts` posiada shared `GroundPlacementDefinition`, `evaluatePlacementSite()` i `previewGroundPlacement()`. Preview i commit już współdzielą domain evaluation, więc nie tworzyć drugiego validatora.
- `items-player-024` jest na `verification needed`, ale jego kod jest już na `main` i dostarcza `materialAvailabilityBreakdown()` w `src/items/constructionMaterials.ts`. Ten plan ma ten helper rozszerzyć/użyć, nie implementować konkurencyjnego material query.
- `PlacementPreviewKind` nie obejmuje garden ani traps. `placeGardenAtAim()` i `placeTrapAtAim()` nadal wykonują własny instant placement.
- house placement ma istniejącą, ale obecnie nieosiągalną ścieżkę auto terrain-prep (`tryStartHouseTerrainPrep`), ponieważ preview przepuszcza confirm tylko dla `valid === true`.
- `src/app/inspection/inspectionTarget.ts` kieruje do `WorldInspection` tylko palisade/playerWell/residentialBuilding/standingTorch/terrainPreparation. Camp/bedroll/platform i trough nie mają tej samej ścieżki `[V]`.
- `WorldInspection` oraz `InspectionAction.enabled/reasonLabel` już istnieją; problemem jest niepełne zasilanie ich live availability, nie brak modelu.
- `InteractionView` jest canonical world-action presentation seam, ale część construction kinds nadal spada do legacy prompt parsing.
- recovery primitives (`computeMaterialRecovery`, `canReceiveRecovery`, `applyRecovery`) już istnieją i są używane przez obecne removers.
- `BusyOverlay.vue` pokazuje label/progress, ale nie ma affordance anulowania; `abortBusy` i partial-credit istnieją już niżej w app layer.
- obecne construction work APIs wykonują krótkie, stałe work bouts (`*_WORK_SESSION_HOURS` / `*_WORK_SESSION_SEC`). To jest UX-owy podział, który należy zastąpić ciągłą pracą ograniczoną rzeczywistym stanem aktora i targetu, bez zmiany ownershipu work progress.

## Product decisions

### Placement states

Placement preview ma rozróżniać trzy stany prezentacyjne:

1. **ready** — miejsce legalne i bieżące wymagania spełnione; confirm wykonuje placement,
2. **blocked/preparation** — geometria/miejsce może być użyte, ale przed właściwym placementem brakuje materiałów/capability albo wymagane jest przygotowanie terenu; UI pokazuje dokładny powód i dostępne wymagania,
3. **invalid** — miejsce fizycznie niedozwolone; confirm nie wykonuje placementu.

Nie sprowadzać braku materiałów do czerwonego geometry-invalid. Ghost powinien odróżniać co najmniej ready / preparation-or-requirements / invalid.

Dla domu na zbyt dużym nachyleniu użyć istniejącej auto terrain-prep ścieżki: preview ma pokazać stan przygotowania i akcję `Przygotuj teren [E]`, a confirm ma wywołać istniejącą mutację przygotowania terenu o rozmiarze wynikającym z footprintu domu.

### Material availability

Preview i inspection pokazują requirement availability z tego samego read-only resolvera co execution semantics:

```text
Belki: 4/7 — przy sobie 2 · w pobliżu 2
```

`items-player-024` dostarczył `materialAvailabilityBreakdown()`; rozszerzać ten seam tylko jeśli potrzeba agregacji wielu requirementów/formatowania. Mutation nadal revaliduje i konsumuje przez obecne `consumeMaterial()`.

Quick Actions może być tanim, niepozycyjnym hintem. Nie może udawać autorytetu dla site-dependent nearby materials. Pełna lista wymagań ma pochodzić z domain constants/stages, nie z ręcznie wpisanych stringów w Vue.

### Work continuity

Po rozpoczęciu pracy gracz pracuje **ciągle**, dopóki pozwalają na to aktualne ograniczenia symulacji. Nie wprowadzać sztucznego cyklu `1 h → [E] → 1 h → [E]`.

Aktywna praca kończy się przy pierwszym rzeczywistym warunku stopu, m.in.:

- ukończenie targetu lub bieżącego etapu wymagającego kolejnej dostawy,
- stamina/vigor/needs nie pozwalają bezpiecznie kontynuować zgodnie z istniejącymi regułami player needs,
- utrata wymaganej capability/tool,
- brak kolejnych wymaganych materiałów na transition stage,
- target staje się nieprawidłowy/niedostępny,
- istniejące combat/damage interruption,
- ręczne `Esc` / `Przerwij`.

Nie hardcodować „pracuj 6 godzin”. Jeśli stan gracza pozwala na 6 godzin reprezentowanej pracy, wynik ma naturalnie wynosić 6 godzin; jeśli na 2.3 h, praca kończy się wcześniej.

Nie zmieniać actor-neutral domain seams (`contributeWork`, well stage machine, terrain prep). Zmiana dotyczy orchestration jednego player work session nad tymi seamami.

### Destructive actions and recovery

Żadna kosztowna/niszcząca akcja nie może wykonywać się od pojedynczego przypadkowego `[R]`.

- unfinished construction: zawsze można anulować/usunąć z confirmation i jasnym recovery,
- małe własne completed objects (standing torch, trough, bedroll, platform oraz analogiczne portable/small structures) mogą być usunięte przez ten sam confirmation/recovery pattern,
- completed house i completed well: pełna demolition pozostaje poza scope; nie dodawać instant `Usuń`,
- używać istniejących recovery helpers i collection `remove(id)`; nie tworzyć drugiego salvage systemu.

### Inspection semantics

Docelowo:

- `[E]` = primary/use/work,
- `[R]` = secondary contextual action, ale nie bezpośrednie niszczenie kosztownego obiektu,
- `[V]` = inspect/details.

Camp composite, standalone bedroll/platform i player trough mają wejść do istniejącego `WorldInspection`; nie budować kolejnego panelu. Existing camp snapshot/repair logic ma zostać reuse.

### Garden and traps

Zarówno **garden**, jak i **traps** mają przejść przez shared placement preview. Placement pułapki jest decyzją przestrzenną i gracz powinien widzieć jej docelową pozycję oraz validity przed commit.

### Deferred

Poza scope pozostają:

- generic decay/condition/repair dla wszystkich structures,
- player-vs-NPC work attribution na progress barze,
- volumetric/3D building holograms,
- pełny demolition system dla ukończonych dużych structures,
- rename well `addWork` → `contributeWork` tylko dla stylistycznej spójności.

## Scope

### 1. Extend shared placement preview contract

Rozszerzyć `PlacementPreviewResult` / `PlacementPreviewUiView`, aby UI nie musiał wyprowadzać stanu z tekstu.

Preferowany kierunek:

```ts
type PlacementPreviewState = 'ready' | 'preparation' | 'invalid'

type PlacementRequirementView = {
  kind: ItemKind
  label: string
  required: number
  inInventory: number
  nearbyWorld: number
  available: number
  missing: number
}
```

Dokładny shape może być mniejszy, jeśli zachowuje semantykę. `valid: boolean` może zostać chwilowo dla compatibility, ale Vue/ghost powinny bazować na jawnym state, nie heurystyce `reasonLabel`.

`GroundPlacementDefinition` pozostaje ownerem suitability; requirements mogą być opcjonalnym read-only resolverem na poziomie konkretnego placeable/action, jeśli nie należą do geometry definition.

Acceptance:

- ghost rozróżnia ready / preparation-or-requirements / invalid,
- requirements są aktualizowane wraz z pozycją ghosta,
- confirm zawsze re-resolves live state.

### 2. Authoritative requirement presentation

Dla palisade, standing torch, trough, bedroll, platform, well stages i house stages/total:

- wyprowadzić costs z istniejących domain constants/definitions,
- usunąć ręcznie duplikowane cost strings w Quick Actions dla dotykanych pozycji,
- użyć `materialAvailabilityBreakdown()` dla pozycyjnego preview/inspection,
- brak materiałów pokazuje dokładny missing reason zamiast optimistic enabled action.

Dla houses UI ma móc pokazać total cost wynikający z `residentialBuildingDefinition(kind).stages`, a inspection nadal może dodatkowo pokazywać current-stage requirements.

### 3. House auto terrain preparation

Uczynić istniejącą `tryStartHouseTerrainPrep` ścieżkę osiągalną z shared preview.

- slope/terrain-preparation case nie jest zwykłym `invalid`,
- preview pokazuje wymagany preparation state i exact action label,
- confirm uruchamia istniejący terrain preparation flow z `coveringPreparationSize`,
- brak digging capability jest prezentowany jawnie przed confirm,
- po preparation gracz wraca do normalnego house placement flow; nie tworzyć automatycznego teleport/commit budynku.

Usunąć martwą alternatywną ścieżkę, jeśli po wiring pozostanie nieużywana.

### 4. Garden and trap shared preview

Dodać `garden` oraz concrete trap kinds do `PlacementPreviewKind` lub równoważny typowany wariant bez stringly-typed lookup.

- garden reuses obecny `evaluateGroundPlacement` / footprint / separation rules,
- trap reuses `TRAP_DEFS`, footprint/separation/reach i concrete instance selection,
- commit nadal wykonuje istniejące `placeGardenAtAim()` / `placeTrapAtAim()`-equivalent mutation po ponownej walidacji,
- Inventory/Quick Actions entry points delegują do shared preview; nie tworzyć osobnego preview per screen.

### 5. Semantic front markers and correct footprints

Zastąpić hardcode house-only marker explicit per-kind capability obok `SUPPORTS_ROTATION`.

Marker pokazuje się tylko tam, gdzie obiekt ma realny semantic front/entrance, co najmniej dla house i tent; bedroll/platform/chest tylko jeśli model/domain convention faktycznie nadaje orientacji znaczenie dla gracza.

Rozdzielić footprint preview dla `fireSimple`, `firePit`, `firePile`, aby ghost odpowiadał faktycznemu obiektowi zamiast mapować wszystkie trzy do `previewFire()` z jednym footprintem.

### 6. Finish construction `InteractionView` migration

Domknąć structured interaction view dla co najmniej:

- palisade,
- residential building,
- player trough,
- terrain preparation,
- nowych/zmienianych construction targets.

Nie używać `parseLegacyPrompt()` ani Polish-text regex jako authority dla ich available actions.

Derived view ma czytać live domain state i zwracać `enabled/reasonLabel`; execution nadal revaliduje.

Zachować product policy:

- brak specialist capability/tool zwykle ukrywa specialist action,
- znana akcja z brakującymi materiałami jest widoczna disabled z powodem,
- podstawowe/intuitive actions mogą pozostać widoczne mimo braku narzędzia, jeśli taki istniejący UX jest celowy.

### 7. Unify construction inspection on `[V]`

Rozszerzyć `InspectionTargetRef`, `WorldInspectionLookup` i `buildWorldInspection()` o:

- camp composite,
- standalone bedroll,
- standalone platform,
- player trough.

Reuse:

- `campRestSnapshot` / existing camp inspection rows,
- `describeCampRepair` / existing repair targets,
- existing trough work/fill state,
- existing `InspectionAction` enabled/reason/danger variants.

Camp semantics po zmianie:

```text
E = odpoczynek / użycie
V = inspekcja campu
WorldInspection = tent + bedroll + platform + stan + repair/actions
```

Nie utrzymywać równoległej camp inspection prezentacji na `[R]`, jeśli po migracji nie ma innego uzasadnienia.

### 8. Correct inspection action availability

Dla work/supply/repair actions w `WorldInspection`:

- `enabled` i `reasonLabel` wynikają z tych samych read-only checks co execution,
- `Dostarcz materiały` disabled, gdy nic legalnie nie można dostarczyć albo brakuje requirementów,
- work disabled z konkretnym powodem, gdy stage/material/capability nie pozwala pracować,
- requirement rows pokazują availability breakdown.

Vue nie może liczyć gameplay rules.

### 9. Continuous player construction work

Zastąpić stałe pojedyncze construction work bouts orkiestracją jednej ciągłej sesji player-work.

Objąć co najmniej istniejące player construction paths:

- palisade,
- standing torch,
- player trough,
- residential building,
- well construction/roof repair tam, gdzie semantyka jest zgodna,
- terrain preparation,
- camp repair jeśli korzysta z tego samego reprezentowanego work modelu i można go włączyć bez zmiany repair semantics.

Wymagania:

- progress jest naliczany przez istniejące domain owner APIs,
- represented world hours i stamina/vigor/needs pozostają spójne z istniejącymi `PlayerNeeds`/physical effort helpers,
- session oblicza/aktualizuje realny stop boundary zamiast wybierać arbitralne `*_WORK_SESSION_HOURS`,
- `Esc` kredytuje tylko faktycznie wykonaną część zgodnie z obecnym partial-credit contract,
- stage boundary może zatrzymać sesję, jeśli potrzebna jest material delivery/nowa capability; nie auto-consume kolejnych etapów bez istniejącej reguły,
- damage/combat interruption pozostaje obsługiwane przez istniejący busy/action cancellation path.

Jeśli obecny `BusyAction` nie wspiera dynamicznego końca sesji bezpiecznie, rozszerzyć jego publiczny contract minimalnie albo zbudować cienką construction-work orchestration warstwę w `app/actions`; nie przenosić gameplay ownership do BusyAction i nie tworzyć globalnego WorkManagera.

### 10. Busy cancellation UX and inspection transition

`BusyOverlay.vue` ma pokazywać możliwość przerwania aktywnej cancellable pracy:

- desktop: `Esc — przerwij`,
- touch: realny przycisk `Przerwij` podpięty do tego samego `abortBusy`.

Nie włączać pointer events globalnie dla całego overlay; tylko kontrola anulowania ma być interaktywna.

Gdy `WorldInspection` action rozpoczyna busy work/repair/supply action:

- inspection zamyka się przed/razem ze startem pracy,
- progress overlay jest widoczny,
- po zakończeniu nie otwierać inspection automatycznie.

### 11. Safe cancellation/removal and recovery

Dodać wspólną presentation/confirmation ścieżkę dla destructive actions.

- unfinished house/palisade/well/etc. cancellation pokazuje recovery przed commit,
- completed standing torch/trough/bedroll/platform i inne małe player-built objects objęte zakresem dostają removal, jeśli collection owner już ma bezpieczne `remove(id)`,
- tent zachowuje istniejące `packTent` semantics — nie zamieniać portable itemu w salvage action,
- completed house/well demolition pozostaje deferred.

Reuse `computeMaterialRecovery` / `canReceiveRecovery` / `applyRecovery`. Recovery presentation ma pochodzić z tego samego pure computation co mutation.

Destructive action z `[R]` może otworzyć/uzbroić confirmation, ale nie może natychmiast skasować kosztownego obiektu.

### 12. Repeat placement mode

Dla seryjnych struktur, przede wszystkim palisade, dodać contained repeat-placement affordance w shared preview.

Preferować `Postaw kolejny` toggle/pointer affordance albo równoważny jawny tryb. Po successful commit shared preview pozostaje aktywny dla tego samego kind tylko wtedy, gdy repeat jest włączony.

Nie naruszać `PlacementPreviewLifecycle` dla intent-driven flows (full camp/cook etc.), które po confirm muszą wyjść zgodnie z istniejącym lifecycle.

## Architecture decisions / guardrails

- Nie tworzyć `ConstructionManager`, `PlacementManager`, drugiego material resolvera ani globalnego action registry.
- `PlacementActions` i world collections pozostają ownerami mutation/state.
- `PlacementPreviewActions` pozostaje presentation/orchestration seam, nie ownerem kosztów.
- `constructionMaterials.ts` pozostaje canonical inventory + nearby-drops resolverem.
- `WorldInspection` pozostaje canonical details/action panel dla world construction.
- `InteractionView` pozostaje canonical prompt/action presentation.
- `BusyAction` pozostaje generic timed-action primitive; construction-specific stop policy należy do app/player construction orchestration.
- Execution zawsze revaliduje live state — preview/inspection są read models.
- Nie zmieniać save schema tylko dla UX symmetry.
- Nie implementować generic structure decay w tym planie.
- Dodawać JSDoc do nowych ważnych publicznych/architektonicznych funkcji i typów; użyć `@domain ui-input` lub właściwego domenowego tagu tam, gdzie pomaga preflight discovery.

## Verification

Automated:

- unit tests dla three-state preview derivation i confirm gating,
- tests dla requirement breakdown wiring z inventory + nearby dropped items,
- placement preview tests dla garden i traps,
- tests house slope → preparation path,
- `InteractionView` tests dla disabled/reason construction actions,
- `WorldInspection` tests dla camp/trough i action availability,
- continuous-work tests: completion, needs/stamina/vigor stop, stage stop, Esc partial credit, target disappearance/interruption,
- removal/recovery tests dla nowych kinds i confirmation semantics,
- repeat-placement lifecycle tests, szczególnie intent-driven exit.

Uruchomić właściwe `tsc` / `vue-tsc`, lint, build i test suite zgodnie z repo scripts.

Manual/browser verification wykonuje użytkownik. Agent ma przygotować checklistę obejmującą co najmniej placement colors/states, nearby-material movement, house auto-prep, trap/garden ghost, continuous work + Esc/touch cancel, `[V]` camp/trough, destructive confirmation i repeat palisade placement, ale **nie wykonuje browser verification samodzielnie**.

## Documentation

Po implementacji zaktualizować właściwy current-state documentation, przede wszystkim `docs/state/player-systems.md`, jeśli contract object placement preview / busy construction work / inspection zmienił się materialnie.

Nie uruchamiać `pnpm docs:sync`; repo workflow może zaktualizować derived docs.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
