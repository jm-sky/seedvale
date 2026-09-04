# Implementation Notes: tools-012 Draft plans README automatic sync

## Current implementation facts

- `scripts/docs/plans-sync.ts` is the correct owner. `main()` already does: discover current plans → `validateUniqueIds()` → `repairPlans()` → README sync → `PLANNING.md` next-ID sync. Draft handling must happen **after** `repairPlans()` so `PLAN_STATUS_RE` sees canonical repaired metadata.
- `config.ts` already defines `Status`, `AVAILABLE_STATUSES`, `STATUS_DISPLAY_ORDER`, `STATUS_ICONS` and `PLAN_STATUS_RE`; do not add another status vocabulary/parser.
- `package.json` already wires `plans:sync` directly to `plans-sync.ts`, and `docs:sync` starts with the same script. No workflow/package-script changes are needed.
- There is currently no `plans-sync.test.ts`. `plans-sync.ts` calls `main()` unconditionally, so importing it directly in a unit test is awkward. Prefer extracting only the new pure README-section helper(s) to a small testable module rather than restructuring the whole script.

## Important discrepancy with the plan

`Planned` is **not** currently rebuilt deterministically as a whole. The script:

- sorts only `getPlannedFiles()`,
- adds only missing rows via `handleMissingPlans()`,
- removes rows whose status is no longer `planned`,
- keeps the existing order of already-present README rows.

The current `README.md` therefore contains a curated/non-alphabetical `Planned` order. Do **not** convert `Planned` to a full sorted rebuild as part of tools-012; that would be an unrelated behavioural change. Draft may use full deterministic rebuild without forcing Planned onto the same ownership model.

## Recommended implementation shape

1. Reuse the single discovered `plans: PlanInfo[]` set. Add one status-collection pass after repair, ideally something like `getPlanFilesByStatus(plans, statuses)` that reads each plan once and returns canonical status buckets. Avoid a separate directory scan for draft.
2. Keep the existing Planned incremental path intact unless a tiny extraction is behaviour-preserving.
3. Add a small section replacement helper that owns the body between a heading and the next `##` heading, e.g. `replaceSectionBody(lines, '## Draft', bodyLines)`. This is simpler and safer for a fully generated Draft section than cloning `findPlannedTableRange()` / `getExistingFiles()` / removal logic.
4. Insert/create `## Draft` immediately before `## In progress`. It should be generator-owned on every run, so stale rows disappear naturally after any status transition.
5. Use the current README table schema (`File | Summary | Pri | Effort | Depends`) and existing `TABLE_HEADER`/row formatting rather than introducing the plan document's shorter example schema. This maximizes reuse and keeps status sections visually consistent.
6. `buildRow()` currently derives whether to show implementation-notes markers by rereading `Status`; for `draft` it already produces no marker. If generalized, make this policy explicit (`showNotesMarker` or status argument) instead of letting a shared formatter stay implicitly tied to `planned`.
7. Canonical empty state should be `No draft plans.`. The section replacement helper should support non-table body content so an empty draft set does not require a fake/empty table.

## Integration / pitfalls

- Do not extend `syncImplementationNotesMarkers()` to Draft. Its current range begins at `## Planned`; leave draft outside this concern.
- Draft rows should be built from the **post-repair file content**, especially for repaired Priority/Effort/Depends on. Do not cache pre-repair metadata.
- Filename sort is appropriate for Draft because the section is newly generated and has no established manual ordering contract.
- Preserve all README content outside the exact Draft section. Section replacement should find the next level-2 heading rather than rely on a hard-coded end heading.
- If `## Draft` is missing, insertion must be deterministic and idempotent; if it already exists, replace its body instead of inserting a second section.
- The current repository has no Draft section yet, so the first real `plans:sync` after implementation must create it even when there are zero draft plans.

## Tests worth adding

Prefer focused tests around the extracted pure section logic plus one filesystem/integration-style sync test if practical. Cover only the high-value cases:

- creates Draft before `In progress` when missing,
- two drafts are sorted by filename and use current metadata values,
- draft → planned removes the draft row on next sync,
- empty set yields exactly `No draft plans.`,
- existing Draft body is fully replaced (no stale/manual rows),
- second run is byte-for-byte idempotent,
- Planned section content/order is unchanged by Draft synchronization.

The last regression test is important because it protects the current incremental/curated Planned behaviour from an over-broad generic refactor.
