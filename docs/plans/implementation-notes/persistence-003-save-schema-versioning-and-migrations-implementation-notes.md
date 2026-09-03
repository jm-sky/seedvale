# Implementation notes: persistence-003 save schema versioning and migrations

## Current code findings

- \`src/persistence/saveData.ts\` is the canonical v1 schema + runtime validator. \`SaveData\` currently has literal \`version: 1\`; \`isSaveData()\` hard-codes \`v.version !== 1\`; \`loadSaveData()\` returns \`SaveData | null\` and currently performs no migration.
- \`src/app/saveState.ts\` independently declares \`const SAVE_VERSION = 1\` and writes it in \`buildSaveData()\`. This is the concrete duplication that the plan should remove: export/use \`CURRENT_SAVE_VERSION\` from the persistence schema module instead.
- \`src/persistence/saveSlots.ts\` stores named saves as \`{ name, data }\`. There is intentionally no top-level envelope version; the schema version is currently inside \`data.version\`. Keep this storage model. Schema version detection can inspect \`data.version\` before calling current-schema validation.
- \`parseStoredSave()\` is the central boundary between raw IndexedDB values and \`SaveData\`. It currently collapses every invalid/unknown version into \`null\`. This is the main seam that must become status-aware so migration failure, invalid data and unsupported future versions are not indistinguishable.
- \`src/persistence/saveDb.ts\` owns IndexedDB and already has the persistence-002 destructive-write guard: an existing unreadable row is never overwritten. Preserve that ownership and extend the guard to distinguish migration failure / future version from ordinary invalid data.
- \`listSaves()\` currently filters unreadable rows out of the normal slot list; \`readSave()\` returns \`null\` for every failure; \`writeSave()\` refuses to overwrite an unparsable existing row. Do not let the new migration layer regress these safety properties.
- \`src/main.ts\` currently treats \`listSaves()\`/ \`readSave()\` returning no data as permission to start a new game. This is dangerous once unsupported/migration-failed states are represented explicitly: boot must not interpret those states as “no save”.
- \`src/persistence/saveData.test.ts\`, \`src/persistence/saveSlots.test.ts\` and \`src/persistence/saveDb.test.ts\` already cover the v1 contract, raw/enveloped storage and persistence-002 write protection. Extend these tests rather than creating a parallel persistence test harness. \`fake-indexeddb\` is already a dev dependency.

## Architecture / implementation decisions

- Keep the migration pipeline inside \`src/persistence/\`. Runtime/app modules should receive only a validated current \`SaveData\`.
- Make \`CURRENT_SAVE_VERSION\` the only current-version constant. Prefer defining it next to \`SaveData\` in \`saveData.ts\`, because that module already owns the persisted contract. \`saveState.ts\` should import it.
- Keep v1 as-is. Do **not** wrap the existing named-slot envelope in another version field and do not resurrect the historical v1–v27 migration chain.
- Separate three concepts that are currently conflated by \`null\):
  1. raw value is malformed / structurally invalid;
  2. version is older and has a known migration path, or migration failed;
  3. version is newer than the application and is unsupported.
  Use a small discriminated result at the persistence boundary rather than throwing these cases into generic \`null\`.
- A useful internal shape is a status/result carrying \`data\` only for successful current-schema loads and carrying the detected version/error for failures. Keep the public API as small as practical; do not introduce a generic persistence framework.
- Migration functions should be pure and sequential: lookup by exact source version, transform to the next version, repeat until \`CURRENT_SAVE_VERSION\`, then run the existing current validator. Never let a migration call world/config/runtime code.
- Avoid mutating the object read from IndexedDB. Use \`structuredClone\` (or equivalent explicit immutable construction) before transformations if a migration needs nested changes. The existing save objects are plain structured-clone-compatible data.
- Do not persist a migrated representation during load. A successful migration should only exist in memory until an ordinary later save writes the current schema.
- \`writeSave()\` must validate/inspect the existing row before replacing it. For an older row, migration must succeed first; for a future version or failed migration, refuse the write and leave the original bytes untouched. This is the persistence-002 safety invariant.

## Important integration details

- \`parseStoredSave()\` is used by slot listing, legacy-\`current\` promotion, reads, rename and write protection. Changing its return type affects all of those paths; update them together instead of adding ad-hoc version checks in individual callers.
- \`migrateLegacyIfNeeded()\` in \`saveDb.ts\` currently parses the legacy raw/enveloped \`current\` row and then writes a named envelope before deleting \`current\`. Keep its existing scope: persistence-003 is schema migration, not a new IndexedDB migration mechanism. A schema-migration failure must prevent deletion of the legacy row.
- The current named envelope has \`name\` outside \`data\`. Preserve it through migration. Only \`data\` changes schema.
- \`saveState.ts\` is the only app-side producer of the full runtime \`SaveData\`; replacing its local version constant is sufficient for normal save creation.
- \`createApp.ts\` accepts an already loaded \`SaveData\`; do not move migration into \`createApp\` or individual restore functions. \`src/main.ts\` is the correct place to react to a load failure/status because it controls the start-screen/new-game decision.
- The current start-screen model only receives valid \`SaveSlotInfo[]\`. If unsupported saves need to be surfaced to the user, add the smallest explicit status path needed; do not make an unsupported row look like an ordinary missing/deleted slot.
- Keep the active save id intact on unsupported/migration-failed records. In particular, never clear/repurpose it merely because the slot cannot currently be loaded.

## Testing priorities

- Keep a complete native v1 fixture and assert it loads without invoking migration.
- Add a synthetic v1→v2 migration test only as a mechanism demonstration if the implementation needs one; do not change the real current schema to v2. The migration can be a test-only/future fixture mechanism rather than gameplay data.
- Test the migration registry/chain for deterministic output, input immutability, exact source/target versions and rejection of missing migration steps.
- Test \`futureVersion > CURRENT_SAVE_VERSION\` explicitly and ensure the raw IndexedDB record remains structurally unchanged after attempted save/autosave.
- Test migration failure separately from malformed data. Both must preserve the stored row, but they must remain distinguishable.
- Test current v1 save/load and named-slot behaviour as regression coverage.
- Test that a successfully migrated save is returned to runtime as the current schema but is **not** rewritten during read/list.
- Prefer unit tests around \`saveData.ts\`/migration logic plus the existing \`saveDb.test.ts\` for actual IndexedDB preservation. No browser/manual verification is needed for the pure migration mechanism beyond normal save/load smoke testing.

## Pitfalls

- Do not keep \`version: 1\` in \`isSaveData()\` while introducing a current-version constant; that would leave the central source of truth split.
- Do not make \`loadSaveData()\` silently migrate and return \`null\` on failure. The caller needs to know whether the slot is invalid, migration-failed or future-version.
- Do not use a default/empty \`SaveData\` as fallback after any persistence error. \`main.ts\` currently has fallback behaviour that must be audited carefully.
- Do not delete or overwrite a row merely because its version is unknown to the current runtime.
- Do not put gameplay defaults or repair logic into migrations. A migration should translate persisted representation; domain hydration remains responsible for runtime derivation/defaults.
- Do not treat an optional field added by persistence-001 as evidence that a historical migration chain should return. Current v1 intentionally accepts some optional persistence-001 fields as “absent means fresh/default”.
- IndexedDB version (\`DB_VERSION = 1\`) is unrelated to SaveData schema version. Do not couple or increment it for SaveData migrations.

## Suggested implementation order

1. Extract \`CURRENT_SAVE_VERSION\` and remove \`saveState.ts\`'s duplicate.
2. Introduce a typed stored-save inspection/load result and central migration pipeline in \`saveData.ts\` (or a small adjacent migration module if that keeps the file manageable).
3. Make \`saveSlots.ts\` preserve the distinction between valid, invalid, migration-failed and unsupported records.
4. Update \`saveDb.ts\` read/list/write/legacy-promotion paths while preserving persistence-002's no-destructive-overwrite invariant.
5. Update \`main.ts\` so non-missing persistence states cannot fall through to “new game”.
6. Extend the existing unit fixtures/tests for v1, migration, failure preservation and future-version rejection.
7. Run \`pnpm test\`, \`pnpm run type-check\` and \`pnpm run build\`.

**Zrób git commit i push do main, rebase jeżeli trzeba**
