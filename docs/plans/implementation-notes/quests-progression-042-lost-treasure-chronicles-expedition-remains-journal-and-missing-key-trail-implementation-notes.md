# Implementation Notes: quests-progression-042 — Lost Treasure Chronicles expedition remains, journal and missing-key trail

Recon baseline: current `main` on 2026-09-15. `quests-progression-041` is still `planned`, so 042 is **not implementation-ready**. Implement only after 041 lands, and bind to 041's final canonical dungeon/blockage APIs rather than reproducing its selection logic.

## 1. Keep 027 world content; retire only its independent quest lifecycle

`src/quests/lostTreasureExpedition.ts` already owns the canonical expedition binding and physical content contract:

- `resolveLostTreasureExpeditionBinding()` selects deterministic sponsor/stakeholder + one dungeon;
- ordered `storyFind` anchors are derived from `Caves.dungeonChambersOf()` semantics, not array/XYZ order;
- `lostTreasureExpeditionAnchorClaims()` claims camp/journal/evidence/`finalTreasure`;
- `lostTreasureExpeditionContainerSpecs()` materializes all four containers independently of quest acceptance;
- the journal has one deterministic `ItemInstance` id via `lostTreasureExpeditionJournalInstanceId(caveId)`.

Do **not** remove this binding/container materialization when superseding 027. Stop exposing `buildLostTreasureExpeditionQuest()` as an independent offer, but continue resolving the same binding, claims and container specs because they are world/history state now reused by Chronicles.

The runtime slot in `src/quests/lostTreasureExpeditionRuntime.ts` may remain the shared binding seam unless 041 lands a better canonical-story binding. Avoid introducing a second expedition binding type solely for 042.

## 2. 041 must decide the dungeon before 042 claims/materializes expedition content

041 notes already require one canonical dungeon and warn against re-running 027 selection after reservation sets change. Follow that contract.

After 041 lands, preferred composition is:

1. resolve canonical story dungeon once;
2. derive/rebind the 027 expedition trail to that `caveId` using current ordered dungeon chamber semantics;
3. submit 026/027/041 claims to the existing cave content policy;
4. materialize the unchanged expedition containers from the resolved claims;
5. materialize the 042 quest definition from those stable ids.

If 041 reuses the current 027 cave, keep all existing ids unchanged. If 041 deliberately chooses another compatible dungeon, rebind deterministically; never copy old container contents into newly invented ids. Define an explicit legacy compatibility path before changing ids, otherwise existing saves will orphan mutable container records.

## 3. The current journal is identity-backed but is not yet a general readable-item flow

The plan's `read_item` stage cannot be implemented by quest definition alone.

Current code:

- `QuestManager` supports `{ type: 'read_item', itemKind }` and catch-up through `QuestWorldProgressLookup.hasReadItem()`;
- `src/app/createApp.ts` currently implements that lookup only for `treasure_map_dark_forest` via `worldFlags.treasureMapDarkForestRead`;
- `expedition_journal` exists as an identity-only story item, but 027 never required reading it.

Therefore add the smallest **shared, save-backed item-read history** needed by `read_item`; do not add `expeditionJournalRead` or another Chronicles-specific boolean. `QuestManager.onReadItem()` should continue being the event seam, while `hasReadItem()` must answer from persisted read history on restore/catch-up. Preserve the old treasure-map compatibility flag/migration as needed rather than breaking existing saves.

The inventory UI/action also needs an actual way to read `expedition_journal`. Reuse the existing inventory read action path; add minimal reusable readable-story-item metadata/content rather than a quest-specific button/callback. Do not make reading consume or replace the journal instance.

## 4. Reframe the existing journal; do not create another item

Keep:

- `LOST_TREASURE_EXPEDITION_JOURNAL_KIND = 'expedition_journal'`;
- the deterministic `journalInstanceId`;
- `WorldGeneratedContainerSpec.initialInstances` seeding in the existing leader-pack container.

Only authored content/presentation should change so the journal says that one survivor left with the missing access key/item, without naming the final external site.

Saved container state must remain authoritative. A journal already moved to player or NPC inventory must never be re-seeded.

## 5. Deeper clue should reuse the existing evidence container

The current evidence step is already one claimed deep `storyFind` container with stable `evidenceContainerId`, and `isLostTreasureExpeditionEvidenceLooted()` derives completion from its authored counts.

Do not add another evidence container or large document. Prefer the existing `loot_world_container` objective and put the second half of the clue in the stage result/progress text. The stage effect may reveal the survivor-site `WorldLocation` once both story beats are satisfied.

Only add a new physical evidence item if implementation of the landed readable-item system makes that clearly simpler and it still preserves the one-trail invariant; it is not required by the current architecture.

## 6. Survivor site: extend the authored-world-place seam, not quest-only coordinates

`WorldLocation` already has stable `ruins` locations, `LocationKnowledge`, navigation targets and save persistence. `src/world/locations/darkForestTreasureSite.ts` is the current authored quest-site precedent: deterministic definition, stable `ruins:<key>` identity, physical world materialization, and location-catalog integration.

Use the same ownership pattern for the survivor site:

- deterministic from world seed + canonical expedition binding;
- outside the canonical dungeon and on valid terrain;
- stable `ruins:` location id;
- physical presentation/world definition exists independently of 042 quest activation;
- only `LocationKnowledge` / navigation is mutable player knowledge.

There is currently a bespoke `WorldLocationCatalogDeps.getDarkForestTreasureSite`. With a second authored ruins site, prefer the smallest shared authored-ruins resolver/provider instead of adding another `getLostTreasureSurvivorSite` special case. Do **not** build a generic remains/camp simulation system.

The revealed `WorldLocation` is the bounded search target. Do not expose the future key coordinate or create a quest marker outside normal location/navigation systems.

## 7. Suppressing legacy 027 must not reset its world/social consequences

Current 027 is fully materialized and has terminal outcomes that can transfer the exact journal and apply relations/reputation. For legacy saves:

- stop materializing/offering the independent 027 `QuestDef` once Chronicles owns this story;
- preserve all saved container records, player/NPC inventories, relations/reputation and final-treasure depletion;
- do not replay 027 rewards or outcome consequences;
- do not stage-by-stage copy 027 progress into 042.

Use legacy 027 progress only as **compatibility evidence** where physical state alone cannot prove history (especially a previously completed/advanced 027). A completed legacy 027 is sufficient evidence that the expedition trail was already traversed; it must not force journal/finalTreasure respawn.

Check how `QuestManager` currently drops/retains initial progress for defs that are no longer materialized. If unknown entries disappear on the next save, that is acceptable for the retired quest only after all compatibility predicates needed by 041/042 have been evaluated during restore.

## 8. Catch-up predicates must use authoritative physical state

Build chapter catch-up from existing ids/state, not transient interaction events:

- camp/evidence/final treasure: `WorldGeneratedContainers` state + existing `isLostTreasureExpedition*Looted()` helpers;
- journal recovered: exact `journalInstanceId` absent from source container and present in player or canonical stakeholder inventory, or strong legacy 027 progress proof;
- journal read: shared persisted read history from §3, with completed legacy 027 accepted as a compatibility shortcut if needed;
- dungeon known: `LocationKnowledge` / canonical cave id from 041;
- survivor site known: `LocationKnowledge.has(survivorLocationId)`.

Do not infer history from player position, current loaded chunks, or current NPC proximity.

## 9. 027 stakeholder binding remains the historical identity

`resolveLostTreasureExpeditionBinding()` already deterministically selects sponsor and optional second stakeholder from stable generated `NpcId`s. Keep those ids as the expedition's historical stakeholder binding even though 042 has no terminal hand-in choice.

Do not select another sponsor/family pair for Chronicles. Later chapters can reuse the same ids for dialogue/consequences.

If the journal was handed in under old 027, resolve its exact instance through the corresponding NPC `personalInventory`; do not reverse the transfer or create a replacement journal.

## 10. Quest shape

Prefer a contextual Chronicles `QuestDef` built before `QuestManager`, using final ids from 041 + the reused 027 binding:

1. investigate/catch up to expedition trail;
2. obtain + `read_item(expedition_journal)`;
3. loot existing evidence container;
4. reveal survivor-site location and complete.

The reveal should use the existing `reveal_location` stage effect so `LocationKnowledge` and navigation remain authoritative. No new journal-specific objective and no future lock objective are needed.

If early physical state means stages 1–3 are already satisfied, let existing world-objective catch-up advance them immediately on activation/restore.

## 11. Persistence / rebuild traps

- Do not persist deterministic cave/anchor/stakeholder/survivor-site bindings if they reconstruct stably.
- Persist only mutable state in its existing owner: container records, item inventories, shared item-read history, `LocationKnowledge`, quest progress, and 041's obstruction mutation.
- Same-session `WorldBundle` rebuild must reuse the existing saved container records; `initialInstances` must not reinsert the journal.
- If 041 changes canonical cave identity relative to old 027 saves, solve id compatibility explicitly before implementation; silent rebinding would duplicate/orphan world state.
- `finalTreasure` remains physically materialized and untouched by 042, even if already depleted.

## 12. Focused tests

Prioritize these cross-system invariants:

- independent 027 offer/quest definition is suppressed while its binding/claims/container specs still materialize;
- 042 uses exactly the 041 canonical dungeon and the existing 027 camp/journal/evidence/final ids when compatible;
- journal read history survives save/load and satisfies `read_item` catch-up;
- journal previously transferred to sponsor/stakeholder is not recreated;
- deeper evidence remains the existing container and never refills;
- survivor site id/placement is deterministic and resolves through normal `WorldLocationCatalog`/`LocationKnowledge`;
- reveal gives a bounded site location, not future key coordinates;
- legacy active/completed 027 is retired without replaying rewards/social consequences;
- already-looted `finalTreasure` remains depleted;
- 026 claims remain disjoint and unaffected.

## 13. Main risks

- **Hard dependency:** 041 is not implemented; do not guess its final canonical dungeon/blockage contract.
- **Read-history gap:** current `read_item` restore support is effectively treasure-map-specific; a journal stage would otherwise regress after reload.
- **Binding/id drift:** moving the expedition trail to a different cave can orphan persisted container ids and the deterministic journal id.
- **Quest/world coupling:** removing 027 quest code must not remove its pre-existing physical world content.
- **Authored-site duplication:** a second bespoke location-catalog special case would be the start of a parallel authored-location mechanism; share the tiny ruins resolver seam instead.

> **Zrób git commit i push do main, rebase jeżeli trzeba**