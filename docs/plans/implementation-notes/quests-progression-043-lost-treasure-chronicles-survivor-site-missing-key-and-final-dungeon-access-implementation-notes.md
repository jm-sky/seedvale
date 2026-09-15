# Implementation Notes: quests-progression-043 — Lost Treasure Chronicles survivor site, missing key and final dungeon access

Recon baseline: current `main` on 2026-09-15. `quests-progression-041` and `quests-progression-042` are still `planned`, so 043 is **not implementation-ready**. Implement only after both land; use their final canonical dungeon, blockage/access, survivor-location and read-history contracts rather than reproducing them here.

## 1. Hard dependency boundary

041 notes currently propose a world/cave-owned obstruction definition plus sparse cleared-state persistence and cave traversal integration. 042 notes propose one deterministic authored survivor `ruins` location plus reuse of the existing 027 expedition binding/content. Treat those as expected contracts only, not current APIs.

Before coding 043, recon the landed 041/042 implementation and update these notes if their concrete ownership differs. Do not pre-implement missing 041/042 pieces inside 043.

## 2. Reuse the exact 027 dungeon/content identity

`src/quests/lostTreasureExpedition.ts` already provides the strongest existing dungeon/story identity: stable `caveId`, `caveLocationId`, claimed `storyFind` anchors, `finalTreasureAnchorId`, and stable world-container ids. 042 is expected to retain this physical content while retiring only the old independent quest lifecycle.

043 must use the same canonical cave selected by 041/042 and the same existing `finalTreasure` container. The keyed passage is a traversal gate before that content; it must not replace, move or re-seed `finalTreasure`.

## 3. Key identity: reuse ItemInstance semantics, not treasure-container state

Current item system already supports deterministic physical keys:

- `src/items/itemInstances.ts::createKeyInstance(id?)` creates `kind: 'key'` with a caller-supplied stable id;
- `key` is in `INSTANCE_BACKED_KINDS`;
- `Inventory.getInstance(instanceId)` gives exact-instance lookup;
- `WorldGeneratedContainerSpec.initialInstances` seeds authored instances only when no saved container snapshot exists.

Derive the key id directly from the landed final-access id, e.g. `item:world-access-key:<accessId>`, and use that exact id both in the access definition and survivor-pack `initialInstances`. Do not add a mapping registry or a quest boolean.

`src/world/treasureSites.ts::treasureKeyInstanceId()` / `attemptTreasureUnlock()` are precedents for identity semantics only. Do not reuse `TreasureSiteDefinition` or `unlockedTreasureContainerIds`: those are container-specific.

## 4. Survivor pack should be ordinary WorldGeneratedContainers state

`src/world/worldGeneratedContainers.ts` already has the correct lifecycle: a fresh spec seeds `initialInstances`, while a saved record fully replaces initial contents. This prevents the same key from respawning after pickup/rebuild.

Materialize one small survivor pack/container from the deterministic survivor anchor landed by 042. Keep its id deterministic from survivor-site/access identity. The key must exist before quest activation; 043 quest state only observes its movement.

Do not remove the container merely because the key was taken unless the landed authored-site convention explicitly does so. An empty/remnant pack is useful world history and its saved contents already encode depletion.

## 5. Final access should extend 041's physical blocker seam, not create a second traversal stack

Current caves use cave heightfield spatial authority (`Caves.resolveHorizontal()` and related cave queries), not generic wall colliders. 041 notes already require its collapse to join that traversal path.

The keyed final access should therefore reuse the same landed physical blocking/presentation mechanism as 041 where possible: deterministic definition + sparse mutable state + one traversal query. Prefer extending the 041 concept into a small passage/access definition with a gating mode (`work` for collapse, `key` for final access) only if that remains simple after 041 lands.

If 041 lands a deliberately obstruction-specific contract whose semantics do not fit keyed unlocks, keep definitions separate but reuse its traversal/presentation primitive and persistence plumbing. Do not create an app-only collider or quest-stage gate.

## 6. Placement belongs to cave route semantics

Do not place the final lock from arbitrary XYZ. Use the stable dungeon passage/chamber semantics landed by 041 and existing dungeon topology/anchor policy. It must be after the 042 expedition journal/evidence trail and before the existing 027 `finalTreasure` section.

If 041 adds a passage/blockage anchor role, extend/reuse that role family rather than abusing `storyFind`, `loot` or `finalTreasure`. Access id should derive from stable cave + passage identity, not array index or generated mesh object identity.

The physical presentation can be a gate/door/blocked portal, but collision/traversal and presentation must read the same unlocked state.

## 7. Unlock interaction

Follow `src/app/actions/containerActions.ts` only as an interaction precedent:

- detect nearby/interactable world object;
- validate exact instance with `inventory.getInstance(requiredKeyId)`;
- mutate world-owned state only after validation;
- show clear failure/success feedback.

Do **not** call treasure-container unlock helpers, forced-entry code or `unlockedTreasureContainerIds`.

Preferred V1 keeps the key after unlocking. Do not call `Inventory.removeInstance()` unless the landed shared access contract has explicitly standardized consuming keys; current generic treasure unlock semantics validate possession rather than requiring a quest-specific consumed token.

## 8. Survivor-site binding comes from 042; do not select it again

042 implementation notes already require a deterministic authored `ruins` location using normal `WorldLocationCatalog` / `LocationKnowledge`, with a small shared authored-ruins provider rather than another bespoke catalog hook.

043 should consume the landed survivor-site binding (host location id + local anchor). It must not independently search ruins again, because even a slightly different candidate/reservation set could move the physical key away from the location revealed by 042.

Reserve/exclude the earlier dark-forest estate and any other Chronicles-authored place through the same landed authored-site resolver. No new `WorldLocationKind` is needed (`worldLocationTypes.ts` already has `ruins`).

## 9. Quest observation and catch-up

Do not advance stages from the unlock action directly. Build progression from authoritative predicates:

- survivor area/site known: `LocationKnowledge` from 042;
- key recovered: exact `requiredKeyId` is owned by the player, or strong legacy evidence proves it had already been used/reached;
- final access unlocked: read-only query into the landed 041/043 world-access state.

Current `QuestManager` already uses injected world lookups for specialized objectives; if 041 did not add a reusable access-state objective, add the narrowest world-observing objective (for example `unlock_world_access`) rather than a generic callback predicate.

Avoid a per-frame inventory/world scan. Exact-id checks on stage activation, restore and relevant inventory/access events are sufficient.

## 10. Persistence and legacy compatibility

Persist only mutable owners:

- survivor pack contents through `SaveWorldGeneratedContainer`;
- key ownership through normal inventory/item-instance persistence;
- final-access unlocked state through the landed 041 world-mutation persistence seam or its coherent extension;
- location knowledge and quest progress through existing systems.

Do not persist deterministic access/key/site definitions if they reconstruct stably.

Legacy-open migration must be decided from **downstream authored state**, not player XZ. 041 notes already reject player position as proof because save data lacks cave spatial context. Strong proof for the final lock includes the reused 027 `finalTreasure` being depleted or legacy quest/world state that could only have occurred after traversing the future gate. Initialize the access as unlocked once; never respawn treasure/key/journal to restore chronology.

If a legacy save already owns the deterministic key instance, do not seed another copy. If it proves final access was traversed but no key exists, keep access open; do not manufacture a replacement key solely for narrative consistency.

## 11. Composition/rebuild order

Expected order after 041/042 land:

1. build caves and canonical Chronicles dungeon binding;
2. resolve shared cave content/passages and authored survivor-site binding once;
3. derive final-access id + required key id from stable world identities;
4. materialize world access state/presentation from saved mutation state;
5. add survivor-pack spec to the existing `WorldGeneratedContainers` spec list using the same required key id;
6. build the 043 contextual `QuestDef` from those final ids;
7. wire read-only quest lookups and normal world interaction for unlocking.

Same-session `WorldBundle` rebuild must carry both saved container contents and access mutation state so neither key nor lock resets.

## 12. Focused tests / main risks

Prioritize cross-system invariants:

- 043 consumes the exact 041/042 canonical cave and survivor-site binding; no second selection pass;
- access id and required key id are deterministic;
- survivor pack seeds exactly one deterministic key on a fresh world and never re-seeds after saved depletion;
- wrong generic `key` instance fails; exact instance succeeds;
- unlocking changes the actual cave traversal blocker and its presentation together;
- unlock survives save/load and `WorldBundle` rebuild;
- early key pickup and early unlock catch up later quest stages;
- final treasure depletion/open legacy state initializes access open and never respawns content;
- dark-forest estate is not reused as survivor host;
- no `WorldLocationKind`, treasure-container unlock set, or Chronicles-specific access manager is added.

Main risks are dependency drift in 041/042, selecting survivor/dungeon identity twice, splitting presentation from cave traversal state, and creating a second sparse persistence registry when the landed 041 mutation owner can safely represent both passage mutations.

> **Zrób git commit i push do main, rebase jeżeli trzeba**