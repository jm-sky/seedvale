# Implementation notes — quests-progression-015 — Stable NPC identity for quests

## Current code facts

- Authoritative NPC id type already exists: `src/settlement/npcState.ts::NpcId = string`. `NpcAuthoritativeState.id`, `NpcStateRegistry` and `SettlementsManager.getNpcState(id)` use it.
- Runtime NPC ids are generated in `src/settlement/createSettlement.ts` from the deterministic flattened family order as:
  ```text
  `${def.id}:npc:${i}`
  ```
  This same id survives stream-out/in and save/load because authoritative state is keyed by it.
- There is no general live `NpcId -> NpcAgent` resolver. Do not add one unless a concrete call-site needs it. Dialogue and marker paths already hold the live `NpcAgent`; pass `npc.id` directly there.
- `QuestManager` remains app-lifetime state outside `WorldBundle`. Its NPC-facing identity is currently name-based: `QuestDef.giverName`, `talk_to_npc.npcName`, `talk_to_npc_choice.choices[].npcName`, relation prerequisites/consequences, `onInteract(npcName)`, `labelMarker(npcName)` and `relations: Map<string, number>`.
- `src/app/gameLoop.ts` currently refreshes markers with `questManager.labelMarker(npc.name)`.
- `src/ui-vue/store.ts::openNpcDialogueMenu()` wires `state.resolveQuestHelp = () => questManager.onInteract(npc.name)`. Plan 014 already made opening dialogue observational; preserve that exact explicit-action lifecycle.
- `src/app/createApp.ts` builds the final runtime quest definitions before `new QuestManager(...)`, currently combining authored/dynamic definitions and adding `settlementId: homeSettlementId`. This is the correct composition boundary for binding authored NPC names to exact ids.

## Recommended quest-facing contract

Use the existing `NpcId` rather than creating a second identity type. A small value shape in `src/quests/quests.ts` is sufficient, e.g. `QuestNpcRef { npcId: NpcId }`; keep display name separate/presentational.

Do not store `NpcAgent`, settlement runtime objects or marker objects in quest definitions/progress. For live interactions/markers, the caller already has `NpcAgent`, so comparison should be `ref.npcId === npc.id` with no resolver.

Keep authored text free to mention names. The identity-bearing fields must use ids after runtime materialization; `giverName` may remain only as presentation data if the quest list/dialogue still needs it, but it must not participate in matching, relation keys or marker targeting.

## Authored quest materialization

Do not hand-copy the `${settlementId}:npc:${i}` formula independently in quest code. Extract/reuse one pure settlement-side helper that derives NPC descriptors from a `SettlementDef` using the same `def.families.flatMap(...)` order used by `createSettlement.ts`, returning at least `{ id: NpcId, name: string }`.

Use that helper in `createApp.ts` while final quest definitions are materialized. Today all static authored quest definitions are bound to the home settlement there; resolve each authored giver/target/relation name once to an exact `NpcId` before constructing `QuestManager`.

Fail fast on missing or ambiguous authored names during materialization/definition validation. Do not keep a runtime fallback that scans loaded NPCs by name.

This helper also avoids coupling identity binding to settlement streaming: `SettlementDef` is deterministic and available before the live NPC exists.

## QuestManager changes

Convert the narrow NPC-facing API to ids:

- `onInteract(npcId: NpcId)` / equivalent narrow ref;
- `labelMarker(npcId: NpcId)`;
- `matchingTalkChoice(...)` comparison by id;
- giver offer/reminder/report checks by giver id;
- `talk_to_npc` and `talk_to_npc_choice` target checks by id;
- relation prerequisite/outcome application by id.

`QuestManager.list()` can continue returning giver display text. Presentation should read authored/materialized name data; it does not need a live NPC lookup.

Keep existing dirty-marker behavior. `gameLoop.ts` should only change the argument from `npc.name` to `npc.id`; no new marker registry is needed.

## Player↔NPC relations: not a blocker, but migrate the authoritative key

`QuestManager.relations` is the authoritative player↔NPC relation store. It is separate from `src/settlement/npcRelationships.ts::NpcRelationships` (NPC↔NPC); do not touch or merge that system.

Changing only quest prerequisites/consequences while leaving `QuestManager.relations` keyed by name would preserve the collision bug. Migrate this map/API to `NpcId`.

Two current non-quest consumers must follow the same key change:

- `src/app/createApp.ts`: `getPlayerSocialTarget` currently calls `questManager.getRelationLevel(context.npcName)`. Thread/use the NPC id in the existing social lookup context and query by id.
- `src/app/inventoryWiring.ts`: merchant sell-pricing currently calls `getRelation(npc.name)` / `getRelationLevel(npc.name)`. Pass `npc.id`.

`QuestManager.getPlayerStanding()` is an aggregate over relation values and does not care about key semantics; keep it unchanged.

Do not introduce a `npcId -> name -> relation` adapter.

## Persistence / legacy saves

`src/app/saveState.ts` persists `quests.relations` from `QuestManager.exportRelations()` as `Record<string, number>`. The serialized shape can remain unchanged; only key semantics change from legacy name to `NpcId`.

Current saves therefore need an explicit compatibility path. Prefer one-time normalization at the composition/materialization boundary where the deterministic home-settlement NPC descriptors are available:

1. materialize authored NPC name -> stable id;
2. convert legacy relation keys that are known authored NPC names to those ids before constructing `QuestManager`;
3. pass through keys already matching stable ids;
4. do not silently map an ambiguous name.

The previous identity fix (`2026-08-22--199`) excluded reserved authored names from procedural generation, so legacy authored names are unambiguous in existing saves. Use that only as migration compatibility; new runtime behavior must be id-only.

A generic persistence migration in `src/persistence/saveData.ts` is a poor fit if it would have to reconstruct settlement/NPC identity without world context. Keep persistence parsing structural and perform semantic legacy-key normalization where `SettlementDef` is available.

Quest progress itself stores quest/stage/outcome ids, not NPC runtime references; no separate NPC target field is needed in `QuestProgressEntry` if final `QuestDef` materialization deterministically recreates the same refs on load.

## Cross-settlement / streaming

Do not make the new contract assume `def.settlementId === target settlement`. `QuestNpcRef` should contain the globally stable `NpcId`; future quest materialization may resolve giver and target from different `SettlementDef`s.

No live target is required while the target settlement is unloaded. When it streams back in, `createSettlement.ts` reconstructs the same `${settlementId}:npc:${i}` and the existing `NpcStateRegistry` reuses the same authoritative state.

For marker rendering, only loaded NPCs are iterated, which is correct: an unloaded target simply has no floating marker until its settlement is loaded. Do not add off-screen marker objects or force settlement loading.

## Validation and tests worth adding

- `src/quests/QuestManager.test.ts`: duplicate display names with different ids for giver, `talk_to_npc`, `talk_to_npc_choice`, prerequisite and outcome relation consequence.
- `src/ui-vue/npcDialogueOpen.test.ts`: explicit authored dialogue action passes/uses id and wrong same-name NPC does not advance.
- marker seam (`src/app/gameLoop.ts` or the nearest existing focused test): same-name NPCs receive marker only for the matching id.
- authored materialization test: reserved name resolves to the deterministic home NPC id; missing/ambiguous target fails instead of falling back by name.
- persistence regression: legacy `{ Anna: n }` relation data normalizes to Anna's stable id; new id-keyed data round-trips unchanged.
- keep existing quest authored/regression tests green; update fixtures from names to ids instead of adding compatibility behavior inside `QuestManager`.

## Important pitfalls

- `NpcId` is currently only a string alias, so TypeScript will not protect accidental use of `npc.name`. Search all `QuestManager.getRelation*`, `onInteract` and `labelMarker` call-sites after the signature change.
- Do not derive identity from `displayName`; `NpcAgent.name` is already insufficient and `displayName` is even more presentation-specific.
- Do not duplicate flattened-family index logic in `createApp.ts`; otherwise a future change in settlement member ordering can silently retarget every authored quest.
- Do not persist resolved live NPC objects or require a target settlement to be loaded during save/load.
- Do not modify NPC↔NPC `NpcRelationships`, reputation/renown ownership, or the plan-014 explicit dialogue-action semantics as part of this migration.

## Suggested implementation order

1. Extract the pure settlement NPC descriptor/id derivation used by `createSettlement.ts`.
2. Materialize authored quest NPC refs in `createApp.ts` and normalize legacy saved relation keys there.
3. Change quest definition/objective/consequence/prerequisite types to `NpcId` refs.
4. Convert `QuestManager` matching and relation storage/API to ids.
5. Change live dialogue and marker call-sites to pass `npc.id`.
6. Change the two non-quest player-relation consumers (`createApp.ts`, `inventoryWiring.ts`) to id.
7. Update focused tests and then run quest/persistence regressions, typecheck and build.

## Shipped (2026-09-10)

- Identity helper: `src/settlement/npcIdentity.ts` (`settlementNpcId` / `settlementNpcDescriptors`); `createSettlement.ts` uses it.
- Authored names stay in `AuthoredQuestDef`; runtime `QuestDef` uses `QuestNpcRef`. Materialization and legacy relation-key normalization live in `src/quests/materializeAuthoredQuests.ts`, called from `createApp.ts`.
- `QuestManager` matching, markers, relations, and `onInteract`/`labelMarker` are id-only. Live call-sites pass `npc.id`. `PlayerSocialContext.npcId` replaced `npcName`.
- No name→id adapter in `QuestManager`. NPC↔NPC `NpcRelationships` untouched.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
