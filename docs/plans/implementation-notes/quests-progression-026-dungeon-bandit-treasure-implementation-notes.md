# Implementation notes: quests-progression-026 dungeon bandit treasure

**Reviewed:** 2026-09-13  
**Plan:** `docs/plans/quests-progression-026-dungeon-bandit-treasure.md`  
**Baseline:** `main` at `3fe62b1f3c55efc53b76332e867dd83d7edfd1c8`

## Dependency status

- `world-terrain-028` is implemented. Dungeon caves already expose deterministic `sideTreasure`, `loot`, `storyFind` and `finalTreasure` anchors through `Caves.contentAnchorsOf()`.
- `fauna-027` is implemented in code but still `verification needed`. Its residents are normal fauna-owned persistent `AnimalAgent`s; this quest must not own, respawn or require killing them.
- Do not use `finalTreasure`; `quests-progression-027` needs that endpoint independently.

## Important current-code gaps

### Shared cave claim arbitration is still adventure-only

`src/world/caves/caveAdventureContentPolicy.ts::resolveCaveAdventureContentPolicy()` validates `anchorClaims` against `adventureCaveIds` and returns `cave_not_adventure` for dungeon anchors. Before this quest can safely coexist with `quests-progression-027`, generalize the **anchor-claim** half to all supplied `CaveContentAnchor`s while leaving adventure profile reservation/80:20 profile logic adventure-only.

Do not add a quest-local claimed-anchor set. Keep deterministic reservation keys, sorted arbitration and `claimOf()`/`unresolved` semantics. A small rename away from `CaveAdventureContentPolicy` is justified only if needed to make the now-shared responsibility clear.

### World-generated container specs cannot seed item instances

`WorldGeneratedContainerSpec` currently has only `initialCounts`; `createWorldGeneratedContainers()` restores persisted `instances`, but fresh specs cannot declare them. The marked valuable therefore cannot be a real exact physical instance without extending this seam.

Add the smallest generic support, e.g. `initialInstances?: readonly ItemInstance[]`, used only when there is no saved record. Saved container state must always win on restore/rebuild so the story item cannot reappear after removal.

## Dungeon binding and cache materialization

Use `src/world/caves/caveContentAnchors.ts` as placement authority:

- each usable side chamber may expose `sideTreasure` with id `<caveId>:sideTreasure:<sourceNodeId>`;
- the deep chamber has a `loot` anchor when placement succeeds;
- anchors are already floor-snapped, pool-aware and non-overlapping.

Required anchors can still fail closed in the current implementation; cave acceptance is not revoked. The quest selector must therefore choose a real `dungeon` having a usable deep `loot` anchor and enough claimed side anchors for the chosen cache count. Never invent coordinates or fall back to chamber centres.

Materialize quest caches before `createWorldGeneratedContainers()` in the world-composition path, alongside `caveTreasureContainerSpecs()`. Dungeon anchors currently produce **no** generic cave chests there, so quest-owned specs are the correct materialization seam. Container ids should derive from the claimed anchor ids and remain stable across rebuild/load.

The physical caches must exist independently of quest acceptance. Quest progress discovers/uses already-existing world content; accepting the quest must never spawn or refill it.

## Story items

Current `ItemKind`s have no ledger/ring/marked-property kind, and ordinary gems are count-backed. `ItemInstance` itself is intentionally generic, while `INSTANCE_BACKED_KINDS` decides which kinds preserve identity.

Use dedicated small story item kinds rather than abusing `key` or a generic ruby:

- ledger/evidence: a physical item kind; count-backed is acceptable only if no exact-item hand-in is required;
- marked valuable: make it instance-backed with a deterministic id derived from the quest/cave/claimant binding. No extra per-instance fields are needed unless UI requires them.

If the ledger is also surrendered on the guard path, making both story items instance-backed gives the cleanest exact ownership checks and avoids future collisions with another copy of the same item kind.

## NPC selection and quest definition

Follow generated-opportunity conventions rather than authored-name binding:

- `src/quests/opportunities/rpgQuestMatrices.ts::adultOpportunityNpcs()` already provides the adult pool;
- `src/quests/opportunities/guardProfessionQuests.ts::selectGuardQuestGiver()` is the current guard-selection pattern;
- `src/quests/opportunities/rpgQuestMaterialization.ts` already contains preferred-role secondary-NPC selection patterns.

Select deterministically from stable settlement NPC order/`NpcId`:

1. giver: adult `guard`, then `hunter`, then first plausible adult;
2. claimant: different adult, prefer `trader`; same settlement first, then a deterministic nearby-settlement candidate if the existing quest-composition inputs expose one cheaply.

Quest id must include stable world identity (at least cave id + giver/claimant ids) so restored progress binds to the same generated story.

Build the final `QuestDef` before `new QuestManager(...)` in `createApp.ts`, like other contextual/generated definitions. Do not make `QuestManager` search settlements or caves.

## Progress and choice

Reuse existing objective vocabulary where possible:

- exact dungeon discovery can use the existing location-knowledge reveal seam (`revealLocationKnowledge.ts`) plus a contextual location id if the cave already participates in location knowledge; otherwise reveal navigation context without introducing duplicated discovery state;
- deep cache completion should use `loot_world_container` for the exact deep container, not “open chest” or fauna kills;
- side caches are optional and must not gate completion;
- terminal branching fits `talk_to_npc_choice` / explicit dialogue actions and normal `QuestOutcome`s.

The missing piece is **transactional exact-item surrender**. `QuestManager` currently knows inventory counts/objectives, while `giveItemInstanceToNpc()` in `src/app/actions/npcItemTransfer.ts` already performs atomic Player → NPC instance transfer into `NpcAuthoritativeState.personalInventory`.

Prefer injecting one narrow quest hand-in callback that delegates to the existing transfer primitive and returns success/failure; do not duplicate inventory mutation inside quest code. Resolve an outcome only after both required transfers succeed. If atomic two-item transfer cannot be guaranteed without broadening the shared transfer API, implement `return_marked_property` + `keep_marked_property` first as the plan allows, rather than consuming one item and failing halfway through the guard path.

For `keep_marked_property`, do not remove or clone the item. Resolution records only the social consequence; inventory remains authoritative.

## Social consequences

Use existing `QuestConsequences`:

- claimant relation deltas through stable `QuestNpcRef`;
- settlement `integrity`/other existing reputation dimensions and `renown` through `ReputationManager`'s injected consequence seam.

Do not add quest-specific reputation storage. Verify the chosen dimension names against `ReputationDimension` before authoring values.

## Persistence / rebuild traps

- Quest state persists through `QuestProgressEntry`; cave/anchor claims and generated definitions should reconstruct deterministically and stay unpersisted.
- `WorldGeneratedContainers` persists mutable counts **and instances**. Fresh `initialInstances` must not be merged back into an existing saved container.
- Rebuild must preserve removed/handed-in story items exactly once.
- Claim arbitration must be deterministic and shared with `quests-progression-027`; changing definition ordering must not silently move the claim.
- Do not derive completion from fauna resident state. Residents can be alive, dead or absent without invalidating the treasure quest.

## Suggested implementation order

1. Generalize shared cave anchor claims beyond adventure caves and add collision tests covering `026` + `027` reservations.
2. Add fresh-spec instance seeding to `WorldGeneratedContainers` with save/rebuild no-respawn tests.
3. Add story item kinds/instances and deterministic dungeon/cache/NPC binding helper.
4. Materialize side/deep caches from resolved claims in world composition.
5. Materialize the `QuestDef` and wire exact deep-container progress + location reveal.
6. Add transactional physical hand-in path and authored outcomes/consequences.

Focused tests should cover deterministic NPC/cave binding, no `finalTreasure` claim, claim conflict failure, optional side caches, exact deep container objective, instance identity through chest → player → NPC, keep path retaining the item, and no duplication after save/load or `WorldBundle` rebuild.

> **Zrób git commit i push do main, rebase jeżeli trzeba**