# Implementation Notes: ui-input-017 — Quest log information architecture

## Current seams to keep

- `QuestManager.list()` remains the only quest-list source. It already returns presentation-ready `QuestListEntry` (`title`, `description`, giver identity, state, stage/objective, result text, promised reward). Do not make Vue resolve `QuestDef`, quest ids, prerequisites or world-source state.
- UI path is `QuestManager.list()` → `src/ui/createQuestLog.ts` compatibility facade → `src/ui-vue/store.ts` (`QuestLogState.entries`) → `src/ui-vue/screens/QuestLogScreen.vue`. Keep this path; no new quest-log store/model.
- `createQuestLog.ts` should stay a thin facade. Information architecture belongs in the Vue screen and, only where presentation metadata is genuinely unavailable, in `QuestListEntry` produced by `QuestManager.list()`.

## Important current-code discrepancy

`QuestManager.list()` intentionally includes some `not_offered` definitions that are currently *exposable* offer candidates (`computeExposableNotOfferedIds()`), while `QuestLogScreen.vue` currently renders them under “Wszystkie” as `niedostępny`.

For this plan, **do not change offer discovery or `QuestManager.list()` visibility semantics just to clean the UI**. Exclude `not_offered` at the Quest Log presentation/category layer. This preserves the manager contract used by quest offering while satisfying the plan’s “do not show `not_offered`” requirement. Vue may branch on the explicit `QuestState`; it must not re-evaluate availability/prerequisites.

## Categories

Use explicit state buckets rather than the current `all | active | complete` predicate:

- current: `active`, `ready_to_report`;
- offers: `offered`;
- history: `complete`, `failed`, `invalidated`, `abandoned`;
- hidden from Quest Log: `not_offered`.

Default to the current bucket. `ready_to_report` should be visually distinguishable/high-priority inside current tasks rather than buried in generic active ordering. Keep terminal states together in history, but retain their existing state/result labels so failure/abandonment is not presented as success.

Do not introduce a second persisted “quest log category” field: categories are a pure projection of `QuestState`.

## Authored vs world-driven / grouping

The dependency `quests-progression-031` is already implemented to the point where per-source world-driven defs exist with stable ids and live source gating, but neither `QuestDef` nor `QuestListEntry` currently exposes a generic authored/world-driven discriminator or `groupKey`.

Do **not** infer source/type from id prefixes such as `world:` in Vue. Do not add metadata speculatively just because the plan mentions it.

Only add explicit presentation metadata to `QuestDef`/`QuestListEntry` if the final UI actually needs a visible distinction or grouping after exercising the post-031 list shape. If grouping is needed, define an optional explicit presentation `groupKey` at definition/materialization time and copy it through `QuestManager.list()`; grouping must never collapse quests by title, giver, id parsing, objective type or source-status heuristics.

## Rendering and ordering

- Avoid repeated `ui.questLog.entries.filter(...)` calls in the template. Build computed buckets/counts once from the entries snapshot; this also centralizes the `not_offered` exclusion.
- Use stable quest `entry.id` as the row key as today.
- Preserve existing `currentObjective`, `resultText`, promised reward formatting and relation lookup. Relation is presentation-only and already keyed by stable `giverNpcId`; do not move it into quest persistence.
- For deterministic/readable ordering, prefer a small explicit state priority (`ready_to_report` before `active`; offers separately). Do not invent chronology unless a real timestamp is added by another system—none exists in current `QuestListEntry`/progress.

## Dependency / lifecycle constraints

- `quests-progression-031-per-source-opportunity-defs.md` is currently `verification needed`, not merely a future design. Its code path pre-materializes stable per-source defs and relies on live gating; this plan must tolerate many hidden `not_offered` defs without exposing them.
- Opening/refreshing still passes fresh `QuestListEntry[]` through the existing store API. No persistence change is needed and no category/filter selection should become save state.
- Keep existing overlay lifecycle (`useOverlayScreen`, `closeQuestLog`, modal handling, `[L]`/Esc integration) unchanged.

## Tests / verification focus

Add focused UI/pure-helper coverage for bucket classification if practical; the valuable cases are: `not_offered` never appears, `offered` is separate, `ready_to_report` is current and prioritized, all four terminal states land in history, and many 031-style hidden per-source defs do not affect visible counts/list rows.

Do not require browser verification from the implementation agent; normal typecheck/tests/build are sufficient automated checks. Visual/browser verification remains manual.
