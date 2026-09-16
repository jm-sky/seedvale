# Implementation Notes: persistence-005 — Pending new save identity in pause menu

## Ownership

- Slot lifecycle stays in `src/persistence/saveDb.ts`: `beginNewSave` / `pendingNewSaveName` / first `writeSave` → `createSave` (sets `activeSaveId`, clears pending). Do not persist pending name or invent a second identity store.
- Pause label is app-side: `createSaveState().refreshActiveSaveName()` → `vueUi.setPauseActiveSaveName`. Vue only reads `ui.pauseMenu.activeSaveName`.
- `pickActiveSaveId(null, slots)` is correct for Continue/load when there is no pending new game; it is the wrong fallback while `pendingNewSaveName` is set.

## Implementation seam

Extract `resolvePauseActiveSaveName(pending, storedId, slots)` next to `pickActiveSaveId` in `src/persistence/saveSlots.ts` so the contract is unit-testable without mocking `SaveStateDeps`.

`refreshActiveSaveName` must still short-circuit on `listSavesResult()` `db-error` (persistence-004 §4) before applying pending or slot names — a read failure must not blank an already-shown label.

Do not call `listSaves` again after every manual save; after first write, pending is null and a later refresh (boot / New Game / Load) resolves the stored slot name.

## Pitfall

`pendingNewSaveName` is module state, not `localStorage`. Persistence tests that call `beginNewSave` must reset it (`setPendingNewSaveName(null)`) in `afterEach` so later cases do not inherit a pending identity.

## Tests

- Pure resolver: pending `"Quest Adventure"` + existing `"Przygoda"` + `storedId = null` must not pick `"Przygoda"`.
- Storage: `createSave('Przygoda')` → `beginNewSave('Quest Adventure')` → `writeSave` creates the new named slot and clears pending.
