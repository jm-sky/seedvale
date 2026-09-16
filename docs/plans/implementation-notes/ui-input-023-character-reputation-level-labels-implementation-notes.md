# Implementation Notes: Character reputation level labels

Plan: `ui-input-023-character-reputation-level-labels.md`

## Current code path

Reputation rendering is already entirely derived in `src/ui-vue/screens/CharacterScreen.vue`:

```text
ui.characterScreen.reputation.selected.reputation
→ reputationRows computed
→ Character Screen reputation rows
```

`ui-input-019` already owns settlement selection and refresh. Do not touch that flow for this plan.

## Exact implementation seam

### `src/ui-vue/screens/CharacterScreen.vue`

Relevant symbols:

- `REPUTATION_ROWS`
- `reputationRows`
- `CharacterSection title="Reputacja"` rendering block

Current `REPUTATION_ROWS` contains only:

- reputation dimension key,
- Polish row label,
- icon.

Current `reputationRows` reads the selected settlement reputation and adds only `value`.

The smallest coherent implementation is to extend these existing row definitions / derived rows with presentation metadata. Do not create another reputation-row registry.

## Recommended presentation structure

Keep numeric reputation authoritative and derive the display level from it.

A small pure helper is justified because the threshold boundaries need exact tests. Prefer a UI-owned file such as:

`src/ui-vue/reputationPresentation.ts`

Suggested responsibilities only:

- classify one numeric value into one of five semantic levels,
- resolve the label for grammatical gender/form,
- expose a semantic tone/class choice suitable for the Character Screen.

Do not import `ReputationManager` into the helper. It needs only the numeric value and presentation metadata.

If exported publicly within the UI layer, add a short JSDoc with `@domain ui-input`.

## Threshold contract

Use the plan's exact inclusive boundaries:

```text
-100 .. -50  very-low
 -49 .. -10  low
  -9 ..   9  neutral
  10 ..  49  high
  50 .. 100  very-high
```

Do not derive thresholds from percentage or renown. `ReputationManager` already clamps reputation to `-100..100`; UI classification does not need to mutate or re-clamp the value.

Important boundary cases for tests:

`-100, -50, -49, -10, -9, 0, 9, 10, 49, 50, 100`.

## Grammar

The current fixed dimension labels make a general localization/flection system unnecessary.

`trust` / `Zaufanie` uses neuter forms:

- `Bardzo niskie`
- `Niskie`
- `Neutralne`
- `Wysokie`
- `Bardzo wysokie`

The other four current dimensions use feminine forms:

- `Bardzo niska`
- `Niska`
- `Neutralna`
- `Wysoka`
- `Bardzo wysoka`

Best place to encode the distinction is the existing `REPUTATION_ROWS` definition, e.g. a compact grammatical variant or label set. Do not infer Polish grammar from strings at runtime.

## Rendering decision

Keep the existing left side unchanged:

```text
[icon] dimension label
```

Replace the current right-side number-only span with a compact group containing:

```text
level label   numeric value
```

The exact number must remain visible.

Prefer `flex`, `gap`, and `shrink-0` / wrapping behavior consistent with the rest of `CharacterScreen.vue`; the reputation section spans both columns (`md:col-span-2`) but still needs to remain readable on narrow widths.

Color must reinforce the text, not replace it.

## Color mapping

Use semantic Tailwind classes already available in the project rather than new inline hex values when practical.

Recommended direction:

- very-low: stronger red text,
- low: red text,
- neutral: muted/gray text,
- high: green text,
- very-high: stronger green text.

Do not introduce a global status-color abstraction or design-system token solely for this plan.

Avoid coloring the whole row aggressively; color the qualitative label and keep the numeric value subdued so the section remains visually balanced.

## State ownership boundaries

Read-only references:

### `src/reputation/ReputationManager.ts`

Current contract:

- five independent reputation dimensions,
- each `-100..100`,
- neutral `0`,
- `renown` is independent and `0..100`.

No changes required.

### `src/ui-vue/store.ts`

`ui.characterScreen.reputation.selected.reputation` already contains the exact values required by the view.

Do not add derived `level`, `label`, or `tone` fields to the store.

### `src/app/createApp.ts`

Existing Character Screen reputation refresh is event-driven (screen open / settlement selection / social consequence), established by `ui-input-019`.

No changes required because the new presentation is a Vue computed derivation.

## Renown exclusion

`Rozpoznawalność` currently renders directly below the five reputation dimensions with the `Star` icon.

Leave it unchanged.

Do not reuse the reputation classifier for renown: high renown means more widely known, not socially positive.

## Tests

If the helper is extracted, add a focused unit test beside it using the repository's existing Vitest setup. Test the classifier as a pure function rather than mounting `CharacterScreen.vue`.

Minimum useful coverage:

- every threshold edge listed above,
- neuter labels for `trust`,
- feminine labels for the remaining variant,
- one result per allowed numeric value / no gaps between ranges.

Do not add component-test infrastructure only for this plan if none is already present.

## Likely files changed

Expected:

- `src/ui-vue/screens/CharacterScreen.vue`
- `src/ui-vue/reputationPresentation.ts` (recommended if extracting helper)
- `src/ui-vue/reputationPresentation.test.ts` (if helper extracted)

Unexpected unless current code changed since recon:

- `src/reputation/ReputationManager.ts`
- `src/ui-vue/store.ts`
- `src/app/createApp.ts`
- persistence files

Treat changes to those unexpected files as a signal to re-check scope before proceeding.

## Implementation order

1. Add pure level classification + grammar mapping.
2. Add focused boundary tests.
3. Extend `REPUTATION_ROWS` / `reputationRows` with presentation metadata.
4. Update only the right side of each reputation row to show qualitative label + number.
5. Run relevant tests/typecheck/lint according to repository workflow.
6. Leave browser/gameplay verification to the User.

## Pitfalls

- Do not average the five reputation dimensions.
- Do not persist the derived label.
- Do not put UI language into `ReputationManager`.
- Do not classify `renown` as good/bad.
- Do not let `-9` or `9` escape the neutral band.
- Do not make color the only distinction between levels.
- Do not build a generic localization/flection framework for five static labels.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
