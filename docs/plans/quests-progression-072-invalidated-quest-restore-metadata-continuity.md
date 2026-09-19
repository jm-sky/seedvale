# Plan: Invalidated quest restore metadata continuity

**Created:** 2026-09-19
**Status:** `planned` 📋
**Type:** fix
**Priority:** medium · **Effort:** XS
**Depends on:** none
**Domain:** `quests-progression`
**Subdomains:** `quests` `progression`
**Tags:** `persistence` `restore` `journal`
**Roadmap:** -

## Goal

Keep player-history and durable quest metadata when an active wild-animal-bound quest is correctly converted to `invalidated` during save/load restore.

Do not change the existing rule that ordinary wild individual bindings are not trusted across restore.

## Current defect

`QuestManager` first normalizes the restored `QuestProgressEntry`, including persisted journal/context fields.

For an active wild `kill_target_animal` / `find_animal` stage it then bypasses `setQuestState()` and writes:

```ts
this.states.set(entry.id, {
  state: 'invalidated',
  stageIndex: restored.stageIndex,
})
```

This drops:

- `journal`;
- `worldKnowledge`;
- `dialogueCooldowns`;
- `observation`.

That differs from the class's normal transition contract, where `setQuestState()` preserves those durable fields and only `reset()` intentionally clears them.

## Required change

When restore determines that a wild target is untrustworthy:

1. preserve the normalized durable quest metadata that remains meaningful after invalidation;
2. set lifecycle to `invalidated`;
3. do not reconstruct or persist the runtime `animalTargets` binding;
4. do not accidentally preserve active-stage counted/slot progress as if the quest could continue;
5. keep rebuild invalidation semantics aligned with restore semantics where they share the same lifecycle meaning.

Prefer a small shared transition helper if needed; do not create a second persistence shape.

## Relevant files

- `src/quests/QuestManager.ts`
- `src/quests/QuestManager.test.ts`
- `src/quests/quests.ts` only if type/JSDoc clarification is required.

## Verification

Add focused tests proving:

1. active wild-target quest restores as `invalidated`;
2. restored journal entries survive that invalidation;
3. persisted observation/world-knowledge/dialogue metadata survives where present;
4. no wild runtime target is rebound;
5. livestock restore still rebinds using the existing deterministic path;
6. New Game `reset()` still clears all metadata.

Browser verification remains the user's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
