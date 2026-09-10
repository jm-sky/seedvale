# Implementation Notes: quests-progression-017 — RPG settlement quest matrices

**Prepared:** 2026-09-10  
**Plan:** `quests-progression-017-rpg-settlement-quest-matrices.md`

## Current status / blocker

At current `main` (`9f779b4058b6242b4d43fa7b3c2c5eb72007c165`) both direct dependencies are still `planned`:

- `quests-progression-015-stable-npc-identity-for-quests.md`
- `quests-progression-016-world-driven-settlement-quest-opportunities.md`

017 should **not be implemented before both land**. Current code still matches the pre-015/pre-016 architecture:

- quest-facing NPC identity is name-based;
- there is no shared settlement opportunity candidate/selection/history layer;
- `QuestManager` receives a closed `QuestDef[]` at construction.

After 015/016 land, do a focused recon of their actual contracts before coding 017. Do not implement the draft interfaces from their plans/notes if landed code differs.

## Existing architecture to preserve

### Quest runtime ownership

`src/quests/QuestManager.ts` owns runtime quest progress, resolution and consequences. It intentionally works from normal `QuestDef` definitions plus narrow injected world lookups.

RPG matrices belong **before** `QuestManager`:

```text
stable settlement/world context
→ lightweight RPG candidate
→ shared selection from 016
→ materialize normal QuestDef
→ QuestManager
```

Do not add runtime RPG registries, a second quest manager, DSL/interpreter, or manager imports inside `QuestManager`.

`src/app/createApp.ts` is currently the composition boundary that combines authored/world-derived quest definitions and constructs `QuestManager`. Unless 016 deliberately moves this responsibility, 017 should plug into the same composition step.

### Existing dynamic materialization pattern

`src/quests/quests.ts::buildLandmarkQuests()` already demonstrates the useful part of the desired pattern:

- bounded deterministic world lookup;
- bind to a real stable `landmarkId`;
- create an ordinary `QuestDef` before `QuestManager` construction;
- no runtime terrain/chunk resolver in `QuestManager` for immutable landmark identity.

Reuse this principle for **Sekret starego miejsca**, but route its candidate through the landed 016 shared selection lifecycle instead of creating another independent builder path.

### Settlement / NPC stable sources

`SettlementDef` in `src/settlement/settlementGenerator.ts` has a stable settlement id. Settlement definitions are deterministic and can be resolved independently of whether a settlement is streamed in; `src/settlement/settlementPlanCache.ts` is part of that definition-generation/cache path.

015 notes identify the authoritative NPC id as `src/settlement/npcState.ts::NpcId`; current live NPC ids are deterministic and settlement-namespaced. Once 015 lands, use its **actual** stable quest NPC ref/materialization helper. Never select giver/target from loaded `NpcAgent`s, nearest NPCs or display names.

For cross-settlement matrices, target settlement/NPC selection must be definition-based and independent of player/camera streaming state.

## Matrix implementation decisions

### 1. `Sekret starego miejsca` — first vertical slice

This is the safest first slice because current quest/world mechanisms already support stable procedural places.

Prefer an eligible real `LandmarkKind`/world-location source and existing objectives such as `interact_landmark` (or `discover_location` only if the landed source naturally maps to world-location discovery).

Do **not** add a new landmark kind, fallback coordinate, fake ruin/container or quest-only place state to make a scenario eligible. No eligible real source means no candidate.

Keep matrix-specific text/variant selection authored and deterministic from stable inputs such as matrix id + settlement id + source id. Do not introduce a generic templating engine.

### 2. `Podejrzany transport` — only on existing handoff semantics

Current quest primitives include `gather_item`, `read_item`, `loot_world_container`, `talk_to_npc`, `talk_to_npc_choice`, outcomes, inventory rewards and social consequences.

The important guardrail is ownership: `QuestManager` must not pretend that an item was transferred into a world container, NPC inventory or settlement economy if no existing domain path performs that transfer.

After dependencies land, inspect the actual inventory/NPC handoff seams. If no real transfer seam exists, keep V1 to an already-supported inventory + explicit dialogue-choice flow, or treat this matrix as blocked. Do not create a quest-only parcel inventory/ownership subsystem.

### 3. `Umowa między osadami` — framing only unless domain state exists

Multiple deterministic settlements already exist, but current `STATE.md` explicitly says inter-settlement trade is not implemented.

Therefore V1 may use real settlement/NPC identities for message/request/choice/travel framing, but must not claim a persistent trade agreement, diplomacy state or stock transfer unless such a domain seam exists by implementation time.

If the selected story requires settlement stock/economy mutation, split that capability into the owning settlement/economy domain instead of implementing it inside quests.

## Shared 016 lifecycle — mandatory reuse

016 is expected to own candidate selection, settlement-level availability limits, ordering/priority and repetition/history. 017 should add another candidate origin to that mechanism, not another selector.

When 016 lands, verify specifically:

- candidate discriminant/origin type;
- stable candidate/history key;
- priority ordering between world-driven and optional RPG candidates;
- whether selection happens entirely at boot or has a later regeneration seam;
- how cooldown/repetition data survives save/load.

World-driven problems should retain priority over optional RPG stories when they compete for a limited settlement opportunity slot.

Do not add matrix-local cooldown state if 016 already owns occurrence/history. Matrix code should only provide stable identity/source inputs needed by that shared mechanism.

## Persistence and determinism

Current quest persistence stores progress by quest id; definitions are rebuilt rather than persisted. Therefore every selected RPG quest that can survive save/load must reconstruct the same:

- quest id;
- giver/target NPC ids;
- settlement/source ids;
- authored variant/choice mapping;
- outcomes/rewards.

Use the landed 016 occurrence/history contract. Do not derive persistent choices from `Math.random()`, `Date.now()`, stream order, loaded entities or player position.

If a chosen variant cannot be reconstructed solely from stable source refs + shared history, persist the **minimal selection discriminator in the 016-owned representation**, not the whole `QuestDef` and not live world references.

## Quest definition / dialogue constraints

`src/quests/quests.ts::validateQuestDefinitions()` already validates final definitions and `talk_to_npc_choice` outcome wiring. Generated definitions must go through the same validation path as authored definitions.

Preserve plan-014 dialogue semantics: opening NPC dialogue or selecting the quest topic is observational; `talk_to_npc` / `talk_to_npc_choice` progresses only through the explicit quest dialogue action.

Once 015 lands, all giver/target/relation matching must use its stable NPC identity. Names remain presentation text only.

## Files to recon again after 015/016 land

Focus on these rather than rescanning the repository:

- `src/quests/quests.ts`
- `src/quests/QuestManager.ts`
- new files/types introduced by quests-progression-015 and 016
- `src/app/createApp.ts`
- `src/settlement/npcState.ts`
- settlement definition/cache helpers used by 015
- `src/settlement/settlementGenerator.ts`
- `src/settlement/settlementPlanCache.ts`
- world-location / landmark lookup used by `buildLandmarkQuests()`
- focused tests added by 015/016

## Tests that matter

Prefer focused contract tests over broad scenario duplication:

- same seed/context produces identical candidate/materialized quest ids and refs;
- matrix with no real eligible source produces no candidate;
- RPG candidates participate in the same 016 limit/priority/history as world-driven candidates;
- save/rebuild reconstructs the same materialized quest;
- duplicate NPC display names cannot retarget giver/choice targets after 015;
- `Sekret starego miejsca` completes through the existing real landmark/discovery objective path;
- transport/cross-settlement tests assert only domain mutations that actually exist.

## Main pitfalls

- Implementing 017 against planned 015/016 contracts before they land.
- Selecting NPCs or settlements from streamed/live objects.
- Duplicating 016 selection, priority, cooldown or persistence state.
- Adding generic quest grammar/template/source-ref abstractions for only a few authored matrices.
- Encoding fake economy, diplomacy, ownership or item transfer as quest progress.
- Persisting generated `QuestDef`s or runtime object refs instead of deterministic materialization inputs.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
