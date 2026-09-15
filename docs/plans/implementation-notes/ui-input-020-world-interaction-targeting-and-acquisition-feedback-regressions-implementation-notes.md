# Implementation Notes: World interaction targeting and acquisition feedback regressions

**Plan:** `ui-input-020-world-interaction-targeting-and-acquisition-feedback-regressions.md`  
**Reviewed against:** `main`, 2026-09-15

## Recon conclusion

To są trzy regresje w istniejącym application interaction contract, nie trzy nowe systemy. `gameLoop.ts` już ma grouped pickup toast `+N · Masz: total`; `groundActions.ts` mutuje inventory osobno. Target cycling działa na `cycleCandidates` z `Interactable` w `INTERACT_RANGE`; nie tworzyć well-only pickera. `ui-input-014` ustanowił `V = inspect/details`, a `playerWell.ts` nadal emituje stare `[R] wymagania`.

## Acquisition feedback

### Reuse

- zwykły pickup branch w `src/app/gameLoop.ts` — obecny format i moment po inventory commit;
- `onInventoryChanged()` / HUD sync — istniejący post-mutation seam;
- `groundActions.ts` — dig/tree/deposit completion jest właścicielem mutation call-sites.

### Decision

Wydzielić pure/application helper formatujący i pokazujący feedback dla count-backed acquisition, np. przyjmujący `kind`, `delta`, `total`, `toast`. Nie wkładać go do `Inventory`.

Call-sites muszą wyliczać realny `before/after` albo używać zwróconego committed delta. Nie zakładać `+1`, bo overflow/stacked acquisition może być częściowe. Instance-backed paths pozostawić poza helperem.

## Target cycling / well

`gameLoop.ts` posiada `cycleCandidates` i cycling state. Review UX potwierdza, że normalny Tab używa wszystkich `Interactable` w `INTERACT_RANGE`, a historycznie kolejność była source/build-order, nie spatial-order. Implementacja powinna poprawić wspólną candidate eligibility/order, nie dodawać `if well`.

Sprawdzić dokładnie miejsce budowy `cycleCandidates` w `gameLoop.ts` oraz `buildInteractables()` w `app/interactables.ts`:

- well musi faktycznie powstawać jako `Interactable` w stanie, w którym ma drink/work/inspect action;
- NPC i world targets mają trafić do tej samej world-cycle listy zgodnie z aktualnym combat/non-combat contractem;
- sorting ma być stabilny i geometryczny (distance/angle + stable id tie-break), a nie zależny od build order;
- nie zmieniać combat soft-lock / living-target cycle poza konieczną kompatybilnością.

## Corpse targeting

Najpierw potwierdzić, jak `buildInteractables()` reprezentuje dead `AnimalAgent`: punkt/mesh/bounds i czy death pose zmienia geometryczne centrum. Fix powinien pozostać semantic-interaction-only.

Preferowany seam: corpse interactable dostaje stabilny interaction point/proxy derived z corpse world position/bounds, używany przez gaze/cycle selection. Nie zmieniać combat collidera, globalnego `INTERACT_RANGE` ani całego gaze cone.

Existing actions harvest/bury/inspect mają nadal konsumować tę samą `AnimalAgent` identity.

## Well prompt

`wellPromptLabel(...)` w `src/world/playerWell.ts` nadal dopisuje `[R] wymagania`. `ui-input-014` przeniósł status/requirements do `WorldInspection` (`V`).

- usuń stale `[R] wymagania` tam, gdzie nie istnieje realne alternate action;
- `E` zachowuje work/drink;
- realny `R` dla completed well pozostaje, jeśli istnieje w interactable contract;
- `buildWorldInspection.ts` + `describeWellWork(...)` są źródłem requirements/status, nie nowy dialog.

## Files / symbols

- `src/app/gameLoop.ts` — pickup feedback + `cycleCandidates`.
- `src/app/interactables.ts` — well/NPC/corpse world-target creation and semantic positions.
- `src/app/actions/groundActions.ts` — stone/branch acquisition mutations.
- `src/world/playerWell.ts` — `wellPromptLabel(...)`.
- `src/app/inspection/buildWorldInspection.ts` — existing well details.
- interaction/targeting tests and `AnimalAgent` corpse-state tests as discovered by compiler/search.

## Verification

Automated tests should cover: real committed acquisition delta; stable cycling across mixed NPC+well targets; dead animal remains selectable after death pose; stale `[R] wymagania` absent while inspection still exposes requirements.

Browser verification wykonuje User.
