# Plan: save schema versioning and future migrations

**Created:** 2026-09-03  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** M  
**Depends on:** persistence-002
**Domain:** `persistence`

## Goal

Introduce explicit SaveData schema versioning and a safe migration mechanism for future persisted-data changes.

The current `SaveData v1` remains exactly as it is and is the starting point for the new migration policy.

All save formats and migrations from before the current hard-cut to v1 are permanently out of scope. They are not restored or migrated.

From this point forward:

    current v1
      ↓ breaking persisted-data change
    v2 + migration v1 → v2
      ↓
    v3 + migration v2 → v3

Runtime always consumes the current schema.

## 1. Current save version

Introduce one central source of truth: `CURRENT_SAVE_VERSION`.

It is initially `CURRENT_SAVE_VERSION = 1`.

Do not duplicate the current version number throughout the persistence layer.

## 2. Persisted save version

Every persisted save must expose its schema version in a form that can be determined before current-schema validation.

Prefer a small persisted envelope if compatible with the existing `wrapSave()` / slot model:

    {
      version: 1,
      data: { ... }
    }

Do not redesign the existing storage format merely for abstraction. Inspect the current persistence model first and make the smallest safe change.

The schema version describes the persisted representation, not a runtime gameplay concept.

## 3. Migration pipeline

Future persisted-data changes use a central migration pipeline:

    stored save
        ↓
    detect version
        ↓
    current → validate
    older known version → migrate
    future version → reject safely
        ↓
    validate current schema
        ↓
    runtime

Migrations stay inside the persistence boundary.

## 4. Migration contract

Each migration should be an isolated deterministic transformation:

    migrateSaveV1ToV2(...)
    migrateSaveV2ToV3(...)

A migration:
- accepts exactly the previous persisted contract;
- returns exactly the next persisted contract;
- does not depend on runtime world state;
- has no external side effects;
- does not mutate its input;
- can be tested independently.

Avoid a single monolithic migration function containing all historical transformations.

## 5. Versioning rule

Use a simple and conservative rule:

> If the persisted representation or its semantics change, increment the save schema version and provide a migration from the previous version.

Therefore `v1 → v2` is required for changes such as:
- changing a persisted field type;
- changing persisted structure;
- renaming/removing persisted fields;
- changing the meaning/semantics of persisted data;
- adding persisted fields when the persisted schema itself changes.

Pure runtime changes that do not alter persisted data do not require a version bump.

The goal is to avoid subjective decisions about whether a persisted change is breaking enough.

## 6. Migration safety

Migration must never destroy the original persisted record.

    stored v1
       ↓
    migrate
       ↓ failure
    original v1 remains untouched

Do not:
- delete the original record before successful migration;
- write partially migrated data;
- replace an old record with a default/empty state;
- allow migration failure to become missing save.

This builds on the integrity protections introduced by `persistence-002`.

## 7. Migrated save persistence

Prefer migration in memory during load:

    stored v1
       ↓
    read
       ↓
    migrate in memory → v2
       ↓
    runtime
       ↓
    normal save
       ↓
    stored v2

Do not automatically overwrite the stored record merely because it was successfully read and migrated.

If automatic persistence of a migrated representation is introduced later, it must be atomic and preserve the original until the new representation is safely committed.

## 8. Unsupported future versions

If `storedVersion > CURRENT_SAVE_VERSION`, the application must:
- refuse to load it;
- preserve the stored record unchanged;
- never treat it as a missing save;
- never overwrite it through autosave;
- expose an explicit `unsupported-version` persistence state.

This protects saves created by a newer application version from being opened by an older one.

## 9. Invalid and migration-failed saves

Persistence must distinguish at least:

    missing
    invalid
    migration-failed
    unsupported-version
    IndexedDB error

None of these states, except an actual missing record, may be silently converted into no save exists.

In particular:

    migration-failed
          ↓
    NOT
          ↓
    new game + autosave over old slot

## 10. Testing

For every future migration, add a fixture for the previous schema:

    vN fixture
       ↓
    migration
       ↓
    vN+1
       ↓
    current validation

Tests should verify:
- existing persisted data retains its intended meaning;
- defaults for newly introduced data are correct;
- structural transformations are correct;
- migrations are deterministic;
- input data is not mutated;
- migration failure preserves the original record;
- unsupported future versions are rejected safely;
- normal current-version save/load continues to work.

The initial implementation of this plan does not need a real migration because the current format remains v1. It only needs to establish the mechanism and demonstrate it is ready for the first future `v1 → v2` change.

## 11. Future schema-change workflow

When changing persisted SaveData:
1. Determine whether persisted representation or semantics change.
2. If not, no schema migration is required.
3. If yes:
   - increment `CURRENT_SAVE_VERSION`;
   - define the new persisted schema;
   - implement migration from the immediately previous version;
   - add migration fixtures/tests;
   - verify normal save/load;
   - verify migration failure preserves the original record.
4. Never perform another hard-cut for a persisted schema change.

## 12. Historical compatibility boundary

This plan starts at the current `SaveData v1`.

It does not restore or support any migration chain that existed before the current hard-cut.

In particular:
- historical v1–v27 migration code is not restored;
- old formats from before the hard-cut are not recovered;
- no compatibility layer for those formats is required.

The first migration created under this policy will be:

    current v1 → future v2

## 13. Relationship with other persistence plans

### persistence-001

`persistence-001` defines the persisted simulation state and may extend the current SaveData.

It does not need to implement the migration framework defined here.

### persistence-002

`persistence-002` prevents unreadable/invalid existing records from being destructively overwritten.

This plan provides the mechanism for making future schema changes safely migratable.

Together:

    002 = never destroy an unreadable save
    003 = future schema changes are migratable

## Non-goals

- Restoring historical v1–v27 migrations.
- Recovering saves from before the current hard-cut.
- Changing the current SaveData v1 format as part of this plan.
- Replacing IndexedDB.
- Cloud saves.
- Multiplayer persistence.
- Save export/import.
- Gameplay migration logic outside the persistence boundary.

## Acceptance criteria

- Current `SaveData v1` remains unchanged and loads without migration.
- `CURRENT_SAVE_VERSION` is the single source of truth.
- Persisted data has an explicit schema version.
- Future persisted schema changes use a version bump and migration.
- Migrations are isolated, deterministic and testable.
- Runtime receives only the current schema.
- Migration happens before persisted data enters simulation/runtime systems.
- Failed migrations preserve the original stored record.
- Future/unsupported versions cannot be overwritten by an older application.
- Missing, invalid, migration-failed, unsupported-version and IndexedDB errors remain distinguishable.
- No historical pre-hard-cut migration chain is restored.
- The mechanism is ready for the first future `v1 → v2` migration.

**Zrób git commit i push do main, rebase jeżeli trzeba**