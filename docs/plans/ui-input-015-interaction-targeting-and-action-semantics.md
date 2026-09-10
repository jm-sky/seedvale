# Plan: Interaction Targeting and Action Semantics

**Created:** 2026-09-10
**Status:** `done` ✅
**Priority:** high · **Effort:** M
**Depends on:** ui-input-014
**Domain:** `ui-input`  
**Type:** `polish`  
**Subdomains:** `interaction` `input` `feedback`
**Tags:** `targeting` `prompts` `actions` `mobile`
**Roadmap:** -

## Goal

Ujednolicić obecny interaction pipeline tak, aby gracz zawsze dostawał przewidywalny zestaw informacji:

```text
current target
→ primary / alternate / inspect actions
→ availability + blocked reason
→ desktop / touch presentation
→ existing execution path
```

Plan nie tworzy nowego interaction managera ani nowego target-selection systemu. Rozszerza istniejące:

- `Interactable`,
- `buildInteractables()`,
- `pickInGaze()`,
- current target resolution w `gameLoop.ts`,
- `FlavorDialog` prompt,
- touch chrome,
- `WorldInspection` capability z `ui-input-014`.

Najważniejszy cel UX: gracz ma rozumieć **co jest aktualnym celem, jakie akcje są dostępne i dlaczego konkretna akcja jest zablokowana** bez zgadywania na podstawie różnych konwencji per feature.

## Context / source review

Plan wynika z:

- `docs/reviews/ux/2026-09-10--interactions-targeting-ux-review.md`,
- current `src/interaction/Interactable.ts`,
- current `src/interaction/findInteractionTarget.ts`,
- current `src/app/interactables.ts`,
- current `src/app/gameLoop.ts`,
- `ui-input-014` inspection implementation,
- istniejącego `FlavorDialog` action contract (`enabled` + `reasonLabel`).

Review potwierdził, że fundament interaction architecture jest dobry. Problemem jest implicit presentation contract: `promptLabel` + rozbudowany dispatch w `gameLoop.ts` wspólnie kodują semantykę E/R/V, availability i feedback.

## Scope boundaries

Ten plan obejmuje tylko wspólny interaction/input layer.

### Explicitly outside scope

- composite camp target, camp details/repair — `items-player-022`,
- grouped dropped-item interaction — `items-player-022`,
- house placement/front marker — `items-player-022`,
- construction inspection implementation — `ui-input-014`,
- nowe rodzaje inspection dla wszystkich world objects,
- combat redesign,
- quest redesign,
- inventory redesign,
- generic outline/highlight renderer dla wszystkich world props,
- zmiana keybindów E/R/V,
- nowy global action registry,
- przenoszenie domain mutation do Vue.

## Interaction semantic contract

Utrzymać istniejące kanały:

```text
E = primary interaction
R = alternate contextual interaction
V = inspect / details
```

Interpretacja:

- `E` — najważniejsza bezpośrednia akcja na current target,
- `R` — druga contextual action, jeśli istnieje,
- `V` — details/inspection wyłącznie gdy `inspectionTargetRef(target)` istnieje.

Nie próbować mechanicznie przebudować wszystkich istniejących gameplay choices. Celem v1 jest jednoznaczna prezentacja tych trzech kanałów i availability, przy zachowaniu dotychczasowych execution paths.

## 1. Structured interaction view

Dodać presentation/query contract produkowany w application/interaction layer, nie w Vue.

Minimalny kierunek:

```ts
type InteractionActionSlot = 'primary' | 'alternate' | 'inspect'

type InteractionActionView = {
  slot: InteractionActionSlot
  label: string
  enabled: boolean
  reasonLabel: string
}

type InteractionView = {
  targetLabel: string
  actions: readonly InteractionActionView[]
}
```

Dokładne nazwy mogą się różnić, ale kontrakt musi spełniać:

- zero mutation,
- zero ownership gameplay state,
- output jest derived z current `Interactable` + live/read-only context,
- Vue nie interpretuje `Interactable.kind`,
- execution nadal korzysta z istniejących handlers i revalidation,
- inspect availability pozostaje zgodne z `inspectionTargetRef()`.

Preferowane miejsce: `src/interaction/interactionView.ts` lub analogiczny mały moduł przy obecnym `Interactable`/targeting code.

Dodać JSDoc + `@domain ui-input` dla publicznego kontraktu/resolvera.

## 2. Stop using prompt string syntax as action authority

Obecnie `FlavorDialog.vue` zakłada:

```text
prompt startsWith('[')
? render as-is
: prefix '[E] '
```

To oznacza, że semantyka inputu zależy od treści stringa.

Po planie:

- prompt HUD renderuje action slots z `InteractionView`,
- `[E]`, `[R]`, `[V]` są renderowane przez presentation layer,
- `promptLabel` może pozostać przejściowo w `Interactable` dla kompatybilności/flavor target label, ale nie może być źródłem prawdy o dostępnych inputach,
- migrację robić incrementalnie, bez big-bang zmiany wszystkich interactables naraz.

Pierwszy etap powinien odwzorować obecne zachowanie bez celowego gameplay rebalance.

## 3. Explicit action availability and blocked reasons

Jeżeli przyczyna blokady jest znana przed inputem, current target view powinien ją znać.

Przykłady istniejących informacji:

- brak wymaganej capability/tool,
- brak inventory item/container/ammo,
- brak stamina,
- obiekt w state, w którym dana akcja nie jest możliwa,
- repair/construction action z `reasonLabel`,
- water source unavailable,
- trap armed/broken,
- brak zwierzęcia prowadzonego do cart.

Nie duplikować domain validation w presentation query.

Preferować istniejące read-only preflight/describe helpers (`describe*`, query helpers, capability queries). Gdy takiego helpera nie ma, dodać mały pure/read-only helper obok domain action, jeśli execution path i presentation muszą dzielić tę samą regułę.

Execution handler nadal musi revalidate live state — enabled prompt nigdy nie jest mutation authority.

### Feedback convention

- known blocked action → widoczna disabled/reason prezentacja,
- attempted stale/changed action → existing error toast,
- immediate success → istniejący toast/audio, jeśli dany flow już go ma,
- timed action → istniejący busy/progress channel,
- details → `WorldInspection` / existing contextual dialog.

Nie tworzyć nowego notification systemu.

## 4. Deterministic gaze target ranking

Zachować `pickInGaze()` jako jeden wspólny picker.

Obecny highest-dot-only wybór poprawić tak, aby bardzo bliskie angularnie candidates nie przełączały się przypadkowo i foreground target był przewidywalniejszy.

V1 ranking:

1. kandydat musi przejść existing range + cone eligibility,
2. primary criterion: facing dot / centeredness,
3. dla kandydatów praktycznie równie wycentrowanych użyć deterministic tie-break:
   - actionable target przed flavor/status-only target,
   - potem mniejszy dystans,
   - potem stable deterministic fallback.

Nie definiować globalnej tabeli typu `NPC > item > tree > ...` w tym planie. Review nie daje podstaw do takiej produktowej hierarchii.

Dodać mały centeredness epsilon/tolerance jako jawny constant z testami zamiast polegać na exact floating-point equality.

## 5. Target stability / hysteresis

Current target nie powinien migotać między dwoma prawie równoważnymi candidates przy minimalnym ruchu kamery.

Dodać najmniejszy możliwy stability rule, np. previous target może pozostać wybrany, jeśli:

- nadal jest eligible,
- nowy kandydat nie wygrywa o meaningful centeredness margin.

Nie persistować selected world target. To runtime-only input/presentation state.

Nie stosować hysteresis do combat soft-lock, który ma własny lifecycle.

## 6. Non-combat target cycling

Normalny `[Tab]` powinien cyklować po sensownym zbiorze targetów, nie po wszystkich obiektach w promieniu niezależnie od kierunku patrzenia.

Zbudować jeden ordered cycle set z current nearby/gaze interaction candidates:

- tylko eligible/plausible targets,
- deterministic order oparty na tym samym rankingu co gaze,
- bez source-array insertion order jako UX authority,
- cycling nie wykonuje ponownego world query.

Po utracie/zmianie candidate set:

- indeks ma zostać bezpiecznie znormalizowany,
- zniknięcie selected target nie może powodować stale selection.

Combat target cycling pozostaje poza zmianą tego etapu poza zachowaniem kompatybilności z current `PlayerCombat`.

## 7. Touch action availability

`TouchChrome.vue` obecnie warunkowo pokazuje Inspect/Cycle, ale E i R są zawsze widoczne.

Podłączyć touch presentation do `InteractionView`:

- E enabled/visible zgodnie z primary action,
- R visible tylko gdy alternate action istnieje; disabled, jeśli action istnieje, ale jest blocked,
- Inspect nadal wynika z inspect action/capability,
- reason nie musi być stale renderowany przy buttonie; current gaze prompt może go prezentować,
- E press/release semantics dla ranged combat muszą zostać zachowane.

Nie tworzyć touch-specific action rules. Mobile renderuje ten sam action view co desktop.

## 8. Prompt presentation

Zastąpić ręcznie składane stringi typu:

```text
[E] ... · [R] ... · [V] ... · [Tab] ...
```

presentation renderem z uporządkowanych slotów.

W v1 prompt powinien pokazać:

- current target/action label,
- primary,
- alternate, jeśli istnieje,
- inspect, jeśli istnieje,
- cycle hint tylko gdy rzeczywiście jest więcej niż jeden eligible target.

Nie wymaga to dużego redesignu HUD. Można zachować wizualny kontener `FlavorDialog` prompt i zmienić wyłącznie jego data contract/rendering.

## 9. Preserve targeted skills integration

`targetedSkillSelection` i `queryTargetedSkillAction()` już reuse current `Interactable`.

Nie tworzyć osobnego targeting path dla skills.

Jeżeli skill jest selected:

- jego prompt/action może tymczasowo override primary interaction tak jak dziś,
- cycle set i current target nadal pochodzą z tego samego interaction targeting,
- blocked reason skill action powinien korzystać z tego samego structured presentation convention, jeżeli current query już go udostępnia lub można go dodać bez domain duplication.

## Architecture decisions

- `Interactable` pozostaje per-frame adapterem, nie authoritative state.
- `buildInteractables()` pozostaje wspólnym candidate gathererem.
- `pickInGaze()` pozostaje centralnym gaze pickerem.
- Nie dodawać raycast registry per feature.
- Interaction view jest presentation/query state, nie action ownership.
- Execution nadal należy do obecnych app/action/domain handlers.
- Every mutation revalidates live state.
- `WorldInspection` z `ui-input-014` pozostaje canonical inspect/details mechanism.
- Vue nie importuje gameplay domain rules i nie switchuje po `Interactable.kind` w celu ustalenia akcji.
- Touch i desktop konsumują ten sam derived action model.
- Nie tworzyć globalnego God Object `InteractionManager`.

## Likely files

Core:

- `src/interaction/Interactable.ts`
- `src/interaction/findInteractionTarget.ts`
- new `src/interaction/interactionView.ts` or equivalent
- `src/app/interactables.ts`
- `src/app/gameLoop.ts`

Inspection integration:

- `src/app/inspection/inspectionTarget.ts`

UI/input:

- `src/ui-vue/store.ts`
- `src/ui-vue/screens/FlavorDialog.vue`
- `src/ui-vue/screens/TouchChrome.vue`
- `src/input/createTouchControls.ts` only if callback/state wiring needs adjustment

Representative domain read-only helpers only if needed:

- `src/app/actions/*`
- `src/world/*`
- `src/items/itemCatalog.ts`

Nie przenosić dużej części `gameLoop.ts` tylko dla kosmetycznego refactoru. Wydzielać query/presentation logic tam, gdzie zmniejsza realną duplikację semantyki.

## Implementation order

1. Dodać `InteractionActionView` / `InteractionView` i pure resolver API.
2. Odwzorować existing primary/alternate/inspect semantics dla representative target set bez zmiany execution.
3. Przełączyć desktop gaze prompt na structured slots, zachowując current visual style.
4. Przełączyć touch E/R/Inspect availability na ten sam view.
5. Dodać blocked reason presentation dla reguł, które current code już potrafi queryować bez mutation.
6. Rozszerzyć shared preflight helpers wyłącznie tam, gdzie presentation i execution dziś duplikowałyby regułę.
7. Rozszerzyć `pickInGaze()` o deterministic tie-break i target stability.
8. Zbudować non-combat cycle set z tego samego ranking contract.
9. Zachować i zweryfikować targeted skill override.
10. Dodać tests dla targeting/ranking/view/touch availability.
11. Uzupełnić relevant state/code docs i implementation notes.

## Tests

### Interaction view

- target z tylko primary action,
- primary + alternate,
- primary + alternate + inspect,
- inspect-only capability nie tworzy fake E/R,
- blocked action zawiera poprawny `enabled=false` + reason,
- execution state nie jest mutowany przez query,
- unsupported/flavor-only target ma poprawną presentation semantics.

### Target ranking

- wyraźnie bardziej centered candidate wygrywa,
- prawie równy dot → actionable wygrywa z flavor-only,
- równy semantic class → bliższy wygrywa,
- exact tie → wynik deterministyczny,
- out-of-range/out-of-cone nigdy nie wchodzi,
- per-candidate `interactRange` nadal działa,
- previous eligible target pozostaje przy zmianie poniżej hysteresis margin,
- nowy wyraźnie lepszy target przejmuje selection.

### Cycling

- obiekt za graczem nie trafia do normalnego cycle set tylko dlatego, że jest w 2.5 m,
- order jest deterministyczny,
- candidate removal nie zostawia stale index,
- single candidate → brak cycle hint,
- multiple eligible candidates → cycle available.

### Touch

- no target → brak fałszywego alternate action,
- primary-only → E dostępne, R ukryte,
- alternate blocked → R widoczne/disabled,
- inspectable → Inspect widoczne,
- non-inspectable → Inspect ukryte,
- ranged E pointerdown/up nadal generuje draw/release path.

### Regression

Representative flows powinny zachować execution behavior:

- NPC talk,
- animal observe/control/attack,
- tent/bedroll/platform (z uwzględnieniem przyszłego `items-player-022`),
- trap,
- container,
- well/water edge,
- player-built well,
- palisade/torch/house construction,
- crop/tree/deposit,
- item pickup,
- corpse,
- notice board,
- targeted skill action.

## Manual verification

User verifies in browser after implementation:

1. Ustawić kilka interactable props bardzo blisko siebie i sprawdzić stabilność current target przy minimalnym ruchu kamery.
2. Sprawdzić foreground vs background target przy prawie tej samej osi patrzenia.
3. Tab przez kilka bliskich targetów — targety poza sensownym gaze/context nie powinny pojawiać się losowo.
4. Sprawdzić representative E/R/V prompts na tent/container/trap/well/buildable/NPC/animal/item.
5. Powtórzyć te same przypadki na touch — R/Inspect mają odpowiadać realnej availability.
6. Sprawdzić blocked actions: brak narzędzia/materialu/container/ammo/stamina.
7. Sprawdzić ranged draw/release na touch po zmianie prezentacji E.
8. Sprawdzić targeted skills z kilkoma bliskimi targetami.

## Deferred decisions — not part of this plan

Poniższe tematy z review wymagają osobnej decyzji albo późniejszego planu:

- czy combat mobile powinien dostać osobny odpowiednik `Shift+Tab` dla world targets, czy uprościć combat cycling,
- czy każdy meaningful world object powinien docelowo mieć `V` inspection,
- czy dodać generic visual outline/marker dla non-agent selected targetów,
- czy wprowadzać globalną semantic priority table między kategoriami typu NPC/item/buildable/tree.

Plan celowo ich nie rozstrzyga.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
