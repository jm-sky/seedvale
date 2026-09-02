# Plan: save integrity guard

**Created:** 2026-09-03
**Status:** `done` ✅
**Priority:** high · **Effort:** S
**Depends on:** none
**Domain:** `persistence`
**Subdomains:** `indexeddb` `save-slots`
**Tags:** `save-integrity` `autosave` `pwa`

## Problem

The current persistence layer can conflate an absent save with an unreadable or invalid save. In particular, a write targeting an existing active slot must not replace an existing record that the current code cannot successfully parse.

This is especially important after a SaveData format change: an older record may become unreadable while its slot ID remains active. An automatic save must never silently destroy that record.

IndexedDB errors must likewise not be converted into an empty save list or missing save in a path that can lead to destructive writes.

## Goal

Make persistence fail-safe:

- distinguish missing records from invalid records and IndexedDB errors;
- never overwrite an existing invalid/unreadable slot;
- prevent boot/new-game/autosave flows from turning an unreadable existing save into a new save under the same slot ID;
- retain the existing named-slot model and current SaveData v1 contract.

## Scope

### Save database

Update the persistence layer so that a write to an existing slot first establishes that the existing record is readable and valid.

If the record exists but cannot be parsed:

- preserve the original record;
- reject/abort the write;
- surface a typed or otherwise explicit persistence failure to the caller.

If the record does not exist, retain the existing new-slot behavior.

### Read/list semantics

Review `readSave()` and `listSaves()` so that:

- missing records remain distinguishable from invalid records;
- IndexedDB failures are not silently represented as an empty database;
- callers cannot accidentally interpret a storage failure as confirmation that no saves exist.

### Application lifecycle

Trace and adjust the relevant boot/new-game/autosave flow:

```
boot → listSaves/readSave → active slot → new game fallback → autosave
```

An unreadable existing save must not automatically result in a new world being autosaved over its slot.

Autosave should stop or fail safely for an affected slot until the persistence problem is resolved.

### Diagnostics

Add minimal development-oriented diagnostics for:

- missing save;
- invalid/unreadable save;
- IndexedDB read error;
- IndexedDB write error.

Do not log complete SaveData contents.

## Constraints

- Do not restore the removed v1–v27 migration chain.
- Do not change the IndexedDB schema/version unless the implementation proves it necessary.
- Do not redesign the persistence architecture.
- Do not add backup/export functionality in this plan.
- Keep the existing named-slot API and eight-slot limit.
- Prefer a small, localized change over broad refactoring.

## Verification

Add or update regression coverage for the destructive scenario:

1. Create a valid save in a named slot.
2. Make the stored record unreadable/invalid from the current schema's perspective.
3. Start the application.
4. Trigger the normal autosave path.
5. Verify the original invalid record has not been replaced.

Also verify:

- valid save → save/autosave → reload works;
- existing valid slot is updated normally;
- missing slot can still be created;
- IndexedDB read failure does not become an empty-save/new-game path that overwrites a slot;
- invalid active slot does not get silently replaced;
- normal named-slot behavior and eight-slot limit remain unchanged.

The implementation should also inspect all call sites of `writeSave()`, `readSave()`, and `listSaves()` for assumptions about `null`/empty results.

When adding or changing important persistence/public architectural functions, add concise JSDoc where it improves preflight discovery, using `@domain` where appropriate.

**Zrób git commit i push do main, rebase jeżeli trzeba**
