# Implementation Notes: quests-progression-041 — Lost Treasure Chronicles dungeon binding and persistent collapsed access

Recon baseline: current `main` on 2026-09-15. `quests-progression-040` is still `planned`, so 041 is not implementation-ready until the Lost Treasure Chronicles binding/map-read contract from 037–040 exists. Implement against the landed 040 APIs; do not create a parallel story-state owner here.

## 1. Reuse the 027 dungeon binding; do not select a second destination

`src/quests/lostTreasureExpedition.ts::resolveLostTreasureExpeditionBinding()` already deterministically selects one real `dungeon` cave from stable world seed + settlement identity and exposes `caveId` + `caveLocationId`. It requires an ordered `storyFind` trail plus an unclaimed `finalTreasure`; the chosen binding is reconstructed, not persisted.

Preferred 041 binding is therefore the active 027 `caveId`. If compatibility checks fail, fallback must run the same kind of deterministic eligibility pass over existing dungeon cave ids; never pick from loaded caves and never persist coordinates just to stabilize the result.

Do not bind 041 by re-calling 027 selection with a different reserved-anchor set after claims have changed. Resolve one canonical story dungeon in composition, then derive both the 027 and 041 bindings from that stable cave identity where practical.

## 2. Current anchor arbitration is already sufficient

`src/world/caves/caveAdventureContentPolicy.ts::resolveCaveAdventureContentPolicy()` accepts `anchorClaims` for any supplied cave archetype. Claims are deterministic by `reservationKey`; collisions fail as `anchor_already_claimed`.

027 currently claims four anchors in its dungeon:

- early `storyFind` camp,
- later `storyFind` journal,
- deep/final `storyFind` evidence,
- `finalTreasure`.

026 uses its own side/deep claims and deliberately leaves `finalTreasure` to 027. Do not add another reservation mechanism.

The missing piece is a semantic place for a blockage. `CaveContentAnchorRole` currently contains treasure/prop/story roles only; there is no passage/blockage role. If 041 needs an anchor claim, add the smallest cave-owned passage/blockage anchor role generated from the dungeon topology and heightfield, with stable id derived from `caveId` + stable source node/segment identity. Do not place rubble from arbitrary global XYZ or from array indices.

Preferred physical location is on the main route after the entrance-adjacent area but before 027's journal/evidence/final content. `dungeonTopology.ts` has stable role ids for the route (`dungeon-passage-*`, chambers, deep/final passage); use those ids rather than geometric depth guesses.

## 3. Obstruction should be a small world/cave service, not quest state

There is no existing generic destructible-world/obstruction registry to reuse. Add one narrow cave/world contract, e.g. a pure definition plus sparse mutable cleared ids:

```ts
type WorldObstructionDef = {
  id: string
  sourcePlaceId: string
  x: number
  y: number
  z: number
  yaw: number
  requiredCapability: ItemCapability
}
```

Keep deterministic definition/placement separate from mutable state. Persist only sparse mutation (`cleared` ids; progress only if incremental work is actually chosen). Definition coordinates reconstruct from cave identity/anchor.

Avoid putting this into `SaveWorldFlags`: that object is currently story-specific compatibility flags. Use a dedicated optional `SaveData` field for sparse world obstruction mutations, following other optional/sparse world-state fields.

`WorldBundle` is the correct rebuild lifetime owner. Carry obstruction state through its rebuild input/output exactly as other persistent world systems do, so a same-session rebuild cannot re-close rubble.

## 4. Traversal must join the cave spatial authority

Caves do not use ordinary wall colliders: `Caves.resolveHorizontal()` is the canonical player cave horizontal containment seam and cave habitat helpers reuse the same heightfield spatial authority. A standalone visible rubble mesh plus app-only quest gate would be wrong.

Do not modify the heightfield itself when rubble clears. Treat rubble as an additional cave-scoped blocking primitive whose active/cleared state is queried by traversal. The safest architecture is to keep the obstruction resolver cave/world-owned and compose it with the existing cave horizontal movement query, so the same definition can later be queried by NPC/fauna navigation without knowing quest state.

Do not route this through `groundActions.ts` terrain digging: pickaxe ground work mutates streamed surface terrain and is not the cave passage authority.

Presentation should read the same active obstruction definition/state as collision. Clearing must remove/disable both in one mutation; do not maintain an independent mesh boolean.

## 5. Use `rock_mining`; keep V1 atomic

`src/items/itemCatalog.ts` already defines `ItemCapability = 'rock_mining'` and shared `CAPABILITY_NEED_LABEL`. Player inventory/tool code already checks capabilities rather than hardcoded pickaxe ids.

Recon found no generic cave/world incremental work primitive that can be reused without broadening unrelated construction/terrain systems. Prefer one deliberate atomic/timed interaction for V1, gated by `Inventory.hasCapability('rock_mining')` or the existing held-tool capability seam used by interactables/actions. Do not introduce rubble durability, generic work-hours or shovel+pickaxe sequencing solely here.

Expose the obstruction through the normal interactable/action layer only while active and within range. The interaction mutates world obstruction state; QuestManager only observes the result.

## 6. Quest observation likely needs one narrow objective

Current `QuestObjective` has specialized world-state objectives (`discover_location`, `loot_world_container`, infestation/spawn-point predicates, etc.) but no generic arbitrary world-state predicate/objective. Do not invent a callback-shaped objective API.

A narrow objective such as:

```ts
{ type: 'clear_world_obstruction', obstructionId: string }
```

is justified if 040's landed story APIs do not add a reusable equivalent. Inject a read-only lookup into `QuestManager` in the same style as existing world-owned objective lookups. Completion must poll/catch up from authoritative obstruction state on activation/restore; the clearing action must not call a quest-specific “complete stage” method.

For map/location stages reuse existing `read_item`, `discover_location` and `reveal_location` effect/navigation seams. `caveWorldLocationId(caveId)` is already the 027 location identity; do not create a second location id for the same dungeon.

## 7. Legacy-save migration: use persisted authored-content proof, not player position

`SavePlayer` persists `x/z/yaw/pitch`, but not a cave id, Y or spatial context. Therefore “player saved beyond the future obstruction” is not a safe standalone migration predicate from current save data; XZ can overlap surface/cave space.

Strong concrete proof that an old save already traversed beyond the new blockage is existing 027 mutable content/progress for the same binding, especially:

- 027 journal/evidence/final container state showing the authored payload was removed (`isLostTreasureExpeditionJournalPackLooted`, `isLostTreasureExpeditionEvidenceLooted`, `isLostTreasureExpeditionFinalTreasureLooted`);
- persisted 027 `QuestProgressEntry` at a stage beyond the blockage, `ready_to_report`, or `complete`;
- any 026 claimed cache state only if the chosen rubble placement is demonstrably before that exact cache on the main traversal path.

Use the strongest downstream proof available and initialize the new obstruction as cleared once. Do not respawn/reset those containers. Do not infer “cleared” merely because the dungeon location is discovered; discovery only proves the entrance/site was known.

If the final placement is before the 027 journal container, journal removal/progress is sufficient migration evidence. This is preferable because it creates a simple, testable compatibility rule.

## 8. 040 map semantics are a hard dependency

040 notes intentionally keep `treasure_map_dark_forest` for save compatibility but remove its old estate-reveal meaning; reading it should become story read-history without choosing a dungeon yet. 041 should attach the landed map-read state to the canonical dungeon reveal.

Do not reintroduce `worldFlags.treasureMapDarkForestRead` as the binding owner. It may remain a legacy read-history compatibility input, but destination identity comes from deterministic dungeon binding and `LocationKnowledge`.

If the map was read before 041 becomes active, activation catch-up should reveal/navigate to the same `caveWorldLocationId(caveId)` immediately.

## 9. Composition order matters

Expected order inside world/app composition:

1. build caves and deterministic cave anchors;
2. resolve 026/027 bindings and shared anchor policy;
3. resolve 041 canonical dungeon + blockage definition/claim against the same cave data;
4. create world obstruction state/presentation from deterministic def + saved cleared ids/legacy migration evidence;
5. materialize world-generated containers unchanged;
6. build the contextual 041 `QuestDef` before `QuestManager` construction using the final cave/obstruction ids;
7. wire read-only obstruction lookup and clear interaction.

Do not make opening the rubble reseed or rematerialize 026/027 containers.

## 10. Focused tests

Prioritize cross-system invariants:

- 041 prefers the exact 027 `caveId` and `caveWorldLocationId` when compatible;
- blockage id/placement is deterministic and its claim coexists with 026/027 claims;
- blockage lies on a stable main-route passage before the intended downstream 027 content;
- `rock_mining` capability clears it; no/invalid capability does not;
- active blockage changes actual cave traversal; cleared state removes both traversal block and presentation;
- cleared ids survive save/load and same-session `WorldBundle` rebuild;
- early clearing completes/catches up the quest later;
- old save with downstream 027 journal/evidence/final state initializes blockage as cleared;
- location discovery alone does not trigger migration;
- 026/027 containers/items remain untouched and never respawn.

## 11. Main risks

- **Dependency drift:** 040 and earlier Chronicles chapters are not implemented yet; use their final binding/read APIs rather than pre-implementing them in 041.
- **Spatial duplication:** cave walls use heightfield queries, not generic colliders. A separate app-only rubble collider will diverge from cave traversal ownership.
- **Bad legacy predicate:** persisted player XZ cannot prove deep-cave access. Prefer downstream authored-content/quest evidence.
- **Anchor semantics:** current content anchors are chamber/content-centric. Add one minimal stable passage/blockage semantic instead of abusing `storyFind`/`loot` or raw coordinates.
- **Binding drift:** do not let 041 and 027 independently choose the “same” dungeon from subtly different candidate sets.

> **Zrób git commit i push do main, rebase jeżeli trzeba**