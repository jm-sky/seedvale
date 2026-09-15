# Plan: World interaction targeting and acquisition feedback regressions

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** bug
**Priority:** high · **Effort:** M
**Depends on:** ~~ui-input-014~~, ~~ui-input-015~~, ~~items-player-024~~
**Domain:** `ui-input`
**Subdomains:** `interaction` `feedback` `input`
**Tags:** `targeting` `corpse` `well` `tab-cycle` `pickup-feedback`
**Roadmap:** -

## Cel

Naprawić trzy spójne regresje ergonomii interakcji z obiektami świata:

1. automatycznie pozyskane kamienie/gałęzie nie pokazują tego samego feedbacku co zwykły pickup,
2. martwe zwierzę jest trudne do wycelowania przy próbie oprawiania,
3. studnia przy grupie NPC jest trudna do wybrania przez target cycling / Tab, a stary prompt `[R] wymagania` sugeruje nieistniejącą akcję zamiast obecnego inspection flow.

Plan ma poprawić istniejący selection/feedback contract zamiast tworzyć osobne ścieżki dla studni, corpse lub ground rewards.

## Recon

### Acquisition feedback

- `src/app/gameLoop.ts` po zwykłym pickupie pokazuje grouped feedback w formie `+N · Masz: total` dla count-backed itemów.
- `src/app/actions/groundActions.ts` posiada osobne mutation paths dla digging, tree branch gathering i mining; inventory/HUD sync jest lokalny dla tych akcji.
- `items-player-024` już zdefiniował pożądany UX: grouped pickup feedback powinien raportować realny delta i wynikowy total.
- `Inventory` nie powinno otrzymywać UI side effects; feedback należy do application/UI seam po udanej mutacji.

### Well inspection / stale prompt

- `src/world/playerWell.ts` nadal generuje tekst zawierający `[R] wymagania`.
- `ui-input-014` później ustalił kontrakt `E = primary`, `R = alternate`, `V = inspect/details` i używa `WorldInspection` jako właściwego ekranu statusu budowy.
- `src/app/inspection/buildWorldInspection.ts` już buduje inspection view dla studni poprzez `describeWellWork(...)` / `describeWellRoofRepair(...)`.
- To wskazuje na stale prompt regression, nie brak systemu wymagań.

### Corpse / target cycling

- Target selection ma pozostać wspólnym mechanizmem `Interactable` / gaze / cycle; nie dodawać corpse-only interaction key ani well-only nearest-object lookup.
- Recon implementacyjny ma sprawdzić dokładny candidate collection/ranking używany przez Tab oraz raycast/collider po śmierci zwierzęcia. Poprawka ma zmieniać eligibility/ranking/hit target, nie globalny interaction range.

## Zakres

### A. Wspólny acquisition feedback helper

- Wydzielić mały application-level helper, który po udanym dodaniu count-backed itemu przyjmuje `kind`, rzeczywisty `delta` i aktualny total i pokazuje ten sam toast co world pickup.
- Zwykły pickup oraz ground/tree automatic acquisition powinny reuse'ować helper zamiast utrzymywać dwa formaty.
- Nie wyświetlać `+N` przed faktycznym commit inventory; overflow/partial add ma raportować realny delta.
- Instance-backed items zachowują własny feedback.

### B. Corpse interaction targeting

- Zidentyfikować, czy po śmierci interaction raycast nadal opiera się na wizualnym mesh, colliderze lub zbyt małym bounding target.
- Zapewnić stabilny corpse interaction target dla istniejących akcji harvest/inspect/bury.
- Preferować semantic interaction proxy/bounds związany z corpse state, jeśli obecny mesh po animacji leży poza wygodnym raycast footprintem.
- Nie zwiększać globalnego gaze cone/range dla wszystkich obiektów.
- Nie zmieniać combat hitboxa w ramach tego planu.

### C. Tab target cycling i studnia

- Sprawdzić wspólną listę candidate interactables używaną przez cycling.
- Studnia i inne meaningful world interactables w zasięgu muszą uczestniczyć w cycling obok NPC; NPC nie mogą monopolizować listy.
- Zachować deterministic/stable cycling order na podstawie aktualnej selekcji/spatial score zamiast specjalnego `if well`.
- Gdy studnia ma primary water action, powinna być wybieralna bez pixel-perfect gaze przez tłum NPC.
- Sprawdzić również palisade/standing torch/residential jako reprezentatywne non-agent targets, aby ranking nie był fixem tylko dla studni.

### D. Well prompt alignment

- Usunąć stale `[R] wymagania` z `wellPromptLabel(...)` tam, gdzie `R` nie ma odpowiadającej akcji.
- Requirements/status prowadzić przez istniejący `[V]` inspection/details contract.
- Nie przenosić primary drink/work action z `E`.
- Nie zmieniać istniejącej realnej alternate action pod `R`, jeżeli na danym completed-state faktycznie istnieje.

## Relevant files

- `src/app/gameLoop.ts`
- `src/app/interactables.ts`
- `src/app/actions/groundActions.ts`
- `src/app/inspection/buildWorldInspection.ts`
- `src/world/playerWell.ts`
- `src/fauna/AnimalAgent.ts`
- `src/ui-vue/` interaction/inspection components touched by current targeting flow
- related targeting / interaction tests discovered during implementation recon
- `docs/plans/ui-input-014-construction-status-and-context-actions.md`
- `docs/plans/implementation-notes/ui-input-015-interaction-targeting-and-action-semantics-implementation-notes.md`
- `docs/plans/items-player-024-inventory-item-use-ux-coherence.md`

## Guardrails

- Nie dodawać UI logic do `Inventory`.
- Nie tworzyć osobnego target picker dla studni ani corpse.
- Nie zwiększać globalnego interaction range jako obejścia.
- Nie dodawać nowych keybindings; reuse `Tab`, `E/R/V` i istniejący semantic input contract.
- Nie refaktorować całego interaction systemu, jeśli korekta candidate eligibility/ranking wystarczy.

## Verification

Automated:

- helper feedback pokazuje realny delta i final count,
- ground/tree acquisition wywołuje ten sam contract co zwykły pickup,
- well prompt nie reklamuje nieistniejącej `[R] wymagania`,
- target cycling test obejmuje miks NPC + well/non-agent world target,
- corpse interaction target pozostaje selectable po death pose.

Manual browser verification wykonuje User:

- zebrać stone/branch ręcznie i przez digging/tree action — feedback ma być spójny,
- zabić kilka zwierząt pod różnymi kątami i łatwo wejść w harvest interaction,
- stanąć przy studni z kilkoma NPC i przełączać Tab aż studnia zostanie wybrana,
- otworzyć inspection studni przez aktualny inspect binding.

Przy nowych/zmienianych publicznych helperach dodać JSDoc z `@domain ui-input`, jeśli poprawia to preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
