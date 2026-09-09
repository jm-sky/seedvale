# Implementation Notes: items-player-018 — Camp inspection, condition and full camp setup

**Status:** implemented (2026-09-09)

## Implemented seams

- `src/world/sleepingUtilities.ts` — shared `resolveWeatherDrivenCondition()`; sleeping-utility shelter is a `0..1` factor, not a boolean. Snow exposure lives next to rain in `src/world/weather.ts`.
- `src/items/createPlacedTents.ts` — persistent `condition` / `lastConditionUpdateAtDays`, fresh tents at 100, `conditionOf()` (tents are never self-sheltered). `nodes()`/`pack()` keep the new fields. Decay rates `TENT_RAIN_DECAY_PER_DAY = 10` / `TENT_SNOW_DECAY_PER_DAY = 8`.
- Save schema bumped **v14 → v15** with `migrateSaveV14ToV15()` defaulting old tents to `condition: 100` and `lastConditionUpdateAtDays: elapsedDays`.
- `src/app/campRest.ts` — `CampRestContext` now carries `tentCondition` / `bedrollCondition` / `platformCondition`. Tent interpolates only the shelter contribution between existing no-tent and full-tent endpoints. Platform condition interpolates raised-bedroll factor `0.75..1.00`. `explainCampRest()` is the single calculation path for sleep and UI.
- `src/app/campRestSnapshot.ts` — reusable spatial resolver at an explicit `(x, z)` anchor. Player-built fires only.
- `src/app/actions/restActions.ts` — camp/tent rest consume the snapshot; `[R]` inspects via existing `FlavorDialog`.
- `src/app/actions/fullCampIntent.ts` — single-active `Rozbij pełny obóz` controller, same pattern as `createCookMealIntent` (ui-input-010). There is no generic `PlayerIntentController`.
- Placement preview lifecycle now reports tent/bedroll/platform confirm **after** Busy Action success (`PlacementMutationLifecycle` on `placeTentAtAim` / `placeBedrollAtAim` / `placePlatformAtAim`).
- Quick Action label: `Śpij na biwaku (8h)` (same `rest('camp')` bivouac). New `Rozbij pełny obóz`.

## Code-driven notes

- ui-input-010 did not add a shared `PlayerIntentController`; full-camp reuses the cook-meal intent pattern and `cancelActivePlayerIntent` in `createApp.ts`.
- Simple player fires still start lit, so a newly placed fire usually skips a separate ignite phase.
- Vue availability for full-camp is always-on; nearby camp / materials are resolved only after the intent starts.
- Partial placements are real world objects and are never rolled back.

## Tests added

- `src/app/campRest.test.ts` — tent/platform interpolation and explanation/quality identity
- `src/world/sleepingUtilities.test.ts` — factor-based shelter 0/50/100%
- `src/items/createPlacedTents.test.ts` — fresh 100, nodes/pack fields, 0% remains
- `src/app/campRestSnapshot.test.ts`
- `src/app/actions/fullCampIntent.test.ts`
- `src/persistence/saveData.test.ts` — v14 → v15 tent migration

## Related implementation

- Repair stays in `items-player-019`.
- No `CampManager` / persistent camp membership.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
