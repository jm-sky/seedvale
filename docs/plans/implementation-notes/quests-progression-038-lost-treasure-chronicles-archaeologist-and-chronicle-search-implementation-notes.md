# Implementation Notes: quests-progression-038 — Lost Treasure Chronicles archaeologist and chronicle search

Recon baseline: current `main` on 2026-09-15. `quests-progression-037` is still `planned`; its implementation notes exist but its authored-resident/story binding does not yet exist in code. Treat 037 as a real dependency and consume its landed exports rather than duplicating its elder/story-selection logic.

## 1. Build on the 037 authored-resident seam, do not pre-empt it

Plan 037's notes define the intended narrow seam at settlement generation: deterministic authored-resident injection before `VillagePlan` creation, stable `NpcId` through `settlementNpcId()`, and contextual quest materialization outside name-keyed `QUESTS`.

For 038, extend that seam with a second authored resident instead of creating another mechanism. The archaeologist selection should be a pure deterministic resolver over real `SettlementDef`s:

- exclude home, `OUTPOST`, and the elder's settlement;
- require a larger settlement than the elder settlement when possible, preferring `MD`/`LG`/`XL`;
- bounded deterministic ordering/tie-break by distance + stable settlement id;
- inject the archaeologist only into the chosen settlement before final NPC identity is derived.

Do not look the archaeologist up by display name. Export a story binding carrying stable `settlementId`, `NpcId` and household id. Keep insertion order deterministic; `settlementNpcId()` depends on flattened family/member order.

038 should import 037's exported elder binding and stable quest/outcome ids. Do not duplicate string ids for the winter/dispute outcomes.

## 2. Lead quality is derived, never stored

`QuestManager` already owns player↔NPC relation and completed outcome ids; `ReputationManager` owns settlement reputation dimensions. Resolve the elder lead from those three inputs only.

Use one pure helper returning two variants, e.g. basic/strong. Keep the threshold intentionally small and explicit. The strong variant should add presentation information only; it must not change which cemetery/ruins are authoritative or materialize different world content.

The chapter quest can use normal `QuestAvailability` / prior-outcome prerequisites for whether it becomes offerable, but the derived lead variant itself should stay outside save data.

## 3. Resolve one complete story binding before quest construction

Follow `src/quests/lostTreasureExpedition.ts`: resolve world/NPC identity first, then build ordinary `QuestDef[]` and world-content specs from that binding.

A focused module such as `src/quests/lostTreasureChronicleSearch.ts` should own derived ids and deterministic choices, for example:

- archaeologist `NpcId` / settlement id;
- cemetery landmark id + grave index + grave spot id;
- ruins landmark id + world-location id + container id;
- `truth: 'grave' | 'ruins'`;
- exact chronicle instance id;
- exact evidence instance id;
- quest id and relevant authored outcome ids.

The binding is reconstructable and should not be persisted.

Choose grave-vs-ruins from `worldSeed` plus a stable story salt after both candidate sites are resolved. Do not use quest state, acceptance time, streaming order or `Math.random()`.

## 4. Cemetery/grave identity: reuse the real grave grid

`src/world/hiddenFinds.ts` already defines cemetery grave identity as the real landmark id plus `cemeteryGraveLayout()` index. Generic grave spots therefore have stable ids of the form:

`<cemeteryLandmarkId>:<graveIndex>`.

Use the settlement cemetery resolved by the canonical cemetery assignment path (`ChunkManager.resolveCemeteryForSettlement` / cemetery assignment data), not a nearest-landmark guess. Pick one deterministic grave index from the actual `cemeteryGraveLayout()` for that cemetery.

Do not rely on `resolveHiddenFindLoot()` to produce the story item. Generic cemetery loot deliberately selects only a capped subset of graves and only produces its ordinary loot table.

The existing explicit buried-placement seam in `hiddenFinds.ts` is currently key-specific (`ExplicitBuriedPlacement.keyInstanceId`) and `groundActions.ts` mints a key with `createKeyInstance()`. Generalize this narrowly into an exact-instance buried placement that can carry any pre-created identity-backed `ItemInstance`, while preserving the existing treasure-key caller. This is preferable to a second story-only digging pipeline.

Order remains important: explicit authored/systemic buried placement should resolve before generic Hidden Find loot for the same grave and mark the corresponding generic grave spot resolved so one shovel completion cannot award both story content and ordinary grave loot.

## 5. Sanctioned grave access: one generic authorization callback

Current `groundActions.ts::applyGraveDisturbanceIfExposed()` always performs the social-exposure roll and applies `GRAVE_DISTURBANCE_EXPOSURE`; there is no authorization seam.

Add only a generic read callback to `GroundActionsDeps`, conceptually:

`isGraveDisturbanceAuthorized(cemeteryId, graveSpotId): boolean`.

Check it before the exposure roll. `groundActions` must know only cemetery/spot identity, not Lost Treasure Chronicles ids.

For this chapter, authorization can be derived from an authored quest outcome owned by `QuestManager`. Prefer a tiny favour quest using existing objectives/dialogue/consequences; its terminal sanctioned outcome becomes the authoritative permission fact. Because `questManager` is already created before the action modules in `createApp.ts`, the dependency can be supplied as a closure querying normal quest state/outcome rather than a new persisted permission registry.

Authorization must apply only to the one target grave. Do not suppress consequences for the whole cemetery.

## 6. Ruins: bind an existing procedural landmark, reserve it from collisions

`smallRuins`/`ruins` already have stable landmark ids. Reuse the bounded deterministic landmark-candidate pattern from `src/world/treasureSites.ts` rather than depending on loaded chunks or `getNearbyLandmarks()` at quest acceptance time.

Select one eligible ruins landmark near the archaeologist/research context with a stable candidate sort. Exclude ids already reserved by authored/systemic treasure content; reuse the existing reservation/collision concepts rather than letting two stories claim the same physical ruin/container anchor.

A generic ruins landmark has no persistent inventory of its own. Materialize one surface `WorldGeneratedContainerSpec` with a stable id and deterministic offset/yaw from the ruin. `WorldGeneratedContainers` already persists counts and exact item instances and restores saved contents instead of re-seeding `initialInstances`.

If a location id for arbitrary landmarks is already available when implementation starts, use it. Otherwise add the smallest world-location adapter for the selected stable ruins landmark; do not add quest-only map markers.

## 7. Use exactly two identity-backed story items

Add `encoded_chronicle` as an identity-backed `ItemKind` with story category/catalog metadata, following `expedition_journal` and `IDENTITY_ONLY_ITEM_KINDS`.

For wrong-site evidence, prefer one additional identity-backed evidence kind/instance shared by both truth branches, e.g. `chronicle_search_evidence`. Only the false site receives that exact evidence instance. This keeps the invariant simple:

- true site → one chronicle instance;
- false site → one evidence instance;
- never two chronicles;
- never duplicate evidence on reload.

Create both ids from stable story constants, not `createItemInstanceId()`.

When the grave is the source, the generalized explicit buried placement grants/drops the exact chronicle instance and the ruins container starts with the exact evidence instance. When ruins are the source, invert those two placements.

If inventory is full after digging, preserve the exact instance through the existing dropped-item instance serialization path; resolving the grave is not equivalent to player ownership.

## 8. Quest flow: world facts first, final completion on item ownership

Current quest vocabulary already has `recover_hidden_find`, `loot_world_container`, `discover_location`, nonlinear objective slots/transitions and world-state catch-up. Use them; do not add `checkedGrave` / `checkedRuins` flags.

Recommended shape:

1. archaeologist dialogue/reveal stage;
2. nonlinear investigation stage observing both candidate sources in any order;
3. final ownership stage for `encoded_chronicle`, transitioning directly to the chapter success outcome.

The investigation stage may mark the false-site evidence as useful progress, but it must not complete the chapter. Build the stage definition from the deterministic truth so the true/false source semantics are fixed before play.

For the final ownership condition, first verify whether current `gather_item` catch-up semantics are sufficient for an identity-backed story kind without forcing giver hand-in. If not, add one reusable exact-instance/inventory objective rather than resolving success merely from the source being looted. The plan's invariant is physical player ownership: a chronicle dropped beside a full inventory is not yet acquired.

Do not complete from `resolvedHiddenFindSpotIds` or container depletion alone.

## 9. Location knowledge and reveals

Use `revealLocationKnowledge()` / `questLifecycleHooks.revealLocation`; `LocationKnowledge` remains the persisted authority.

The archaeologist should reveal the cemetery/ruins destination at location granularity only. The grave index, buried item coordinates and container offset stay hidden implementation facts.

Early physical discovery remains valid: revealing an already confirmed location is idempotent. Do not reset discovery to make the chapter readable.

## 10. Catch-up and persistence details

Existing owners already provide the required persistence:

- `resolvedHiddenFindSpotIds` for the grave one-shot;
- `WorldGeneratedContainers` saved inventory for the ruins source;
- inventory/dropped-item instance persistence for exact story items;
- `LocationKnowledge` for discovery;
- `QuestManager` for lifecycle/outcomes/relations;
- `ReputationManager` for social state.

Important restore cases:

- if the exact chronicle is already in player inventory, activate/catch up straight to chapter completion;
- if the grave spot is resolved but the exact chronicle is in a persisted ground drop, do not rematerialize it;
- if the ruins container was previously saved empty, `initialInstances` must not refill it;
- if the false-site evidence is already acquired/looted, preserve that fact through its physical owner rather than quest-local state.

The generalized buried placement must not recreate a resolved exact instance after save/load.

## 11. Composition/lifecycle

Resolve the story binding and all required world-content specs before `QuestManager` construction, alongside the current contextual quests. Definitions are still complete-at-construction; there is no runtime `registerDef`.

World-generated container specs must be included in the bundle's existing declarative spec assembly before `createWorldGeneratedContainers()` is built. Do not mutate container registries later merely because the quest was accepted.

This is also why the chronicle truth/site binding must exist independently of quest acceptance: early looting/digging has to be coherent.

The archaeologist remains an ordinary NPC. If dead, do not respawn him or replace his `NpcId`; later plans may define narrative fallback.

## 12. Tests worth adding

Focus on cross-system invariants rather than duplicating quest-framework tests:

- deterministic archaeologist settlement/NpcId and no 037 elder-id regression;
- deterministic cemetery + grave index + ruins binding and same-seed truth;
- one and only one chronicle source in both truth variants;
- explicit grave placement suppresses generic grave loot for that spot;
- unauthorized grave dig uses the existing exposure path, authorized target grave skips it, other graves do not;
- full inventory leaves the exact chronicle as a persisted drop and does not complete the chapter;
- saved empty ruins container does not re-seed story instances;
- grave-first and ruins-first flows, including false-site evidence first;
- activation after prior grave resolution, ruins looting, location discovery, and already-owned chronicle;
- same-seed rebuild/save-load preserves ids and source ownership.

Likely focused files: the new story module test, `src/app/actions/groundActions.test.ts`, `src/world/hiddenFinds.test.ts`, `src/world/worldGeneratedContainers.test.ts`, and targeted `QuestManager.test.ts` coverage only if a reusable exact-instance objective is added.

## 13. Main implementation risks

- **037 identity contract is not landed yet.** Implement 037 first or adapt to its final exported authored-resident/binding seam; do not independently solve the same problem in 038.
- **Generic Hidden Finds cannot currently carry exact story instances.** Generalize the existing explicit buried path rather than bypassing it.
- **Resolved grave != acquired chronicle.** Inventory-full/drop handling must keep those states distinct.
- **Ruins must be selected off stable world data, not loaded-chunk order.** Reuse the bounded deterministic candidate approach already used by systemic treasure sites.
- **Authorization must stay generic.** `groundActions` receives a spot-level permission answer, never quest ids or story imports.
- **Avoid content collisions.** Reserve the selected ruins/container ids against existing treasure/story claims.

> **Zrób git commit i push do main, rebase jeżeli trzeba**