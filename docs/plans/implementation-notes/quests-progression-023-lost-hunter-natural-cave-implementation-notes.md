# Implementation notes: quests-progression-023 — Lost hunter natural cave

## Recon summary

- `world-terrain-028` is already implemented. `src/world/caves/caveContentAnchors.ts` exposes `storyFind` / `loot` anchors for accepted natural caves, with underground `x/y/z/yaw` resolved from the retained cave heightfield. Use `Caves.archetypeOf(caveId)` + `Caves.contentAnchorsOf(caveId)`; do not derive underground coordinates in quest code.
- Quest runtime remains `QuestDef` → `QuestManager`. Generated-NPC materialization already exists under `src/quests/opportunities/`; use stable `NpcId`, never display names or loaded `NpcAgent`s.
- `WorldGeneratedContainers` already persists container inventories including item instances, but `WorldGeneratedContainerSpec` currently accepts only `initialCounts`. There is no declarative initial-instance seam yet.
- Bows (`short_bow`, `hunting_bow`, `long_bow`) are currently count-based. `INSTANCE_BACKED_KINDS` does not include them. Therefore a distinctive physical bow cannot currently be proved by identity after loot/save/load/transfer.
- `revealLocationKnowledge()` is the canonical reveal + optional navigation-target seam. `QuestManager` currently has no generic stage side-effect for revealing a location when dialogue advances.

## Recommended composition

Implement this as one deterministic contextual/world-driven quest binding built before `QuestManager` construction, not as hardcoded authored names/coordinates.

Recommended binding data, kept derived and not persisted:

```ts
{
  questId,
  settlementId,
  giverNpcId,
  witnessNpcId,
  caveId,
  caveLocationId: `cave:${caveId}`,
  storyAnchorId,
  packContainerId,
  bowInstanceId,
}
```

All ids must be deterministic from stable world identity. Quest save state should continue storing only normal `QuestProgressEntry`; rebuilding the same seed must reconstruct the same binding.

### NPC binding

`opportunityNpcsFromSettlement()` currently exposes only `{ id, name, role, child }`, so it cannot distinguish members of one household/family. Do not infer kinship from names.

For this quest, add the smallest reusable settlement-materialization helper that retains family/household grouping while deriving the same `NpcId` order as `flattenedSettlementMembers()` / `settlementNpcId()`. This can either extend `OpportunityNpc` with stable family/household metadata or expose a separate richer selector input; avoid changing quest identity ownership.

Selection should be deterministic:

1. giver: adult from a household with another plausible adult/family context;
2. witness: different adult hunter;
3. fallback witness: woodcutter;
4. fallback: another adult.

The missing hunter is historical story data, not a generated live NPC. Do not reserve or synthesize an extra NPC identity for the deceased hunter.

### Cave / anchor binding

Select from `caves.definitions()` only caves where:

- `caves.archetypeOf(caveId) === 'natural'`;
- `contentAnchorsOf(caveId)` contains a `storyFind` and `loot` pair from the main natural chamber where possible.

Prefer stable ordering by existing cave definition order / stable cave id; do not use runtime distance to camera/player. The selected cave must be excluded from any other authored content binding in the same composition pass.

There is no need for a new persisted cave-claim registry. A small pure composition arbiter/set of claimed cave/anchor ids is sufficient and can later be reused by `quests-progression-024`. If another current consumer already claims the candidate anchor, skip to the next valid natural cave; never share one anchor silently.

Use the anchor's exact underground Y and set `spatialContext: { kind: 'cave', caveId }` on world content.

## Hunter pack and evidence

Use one fixed `WorldGeneratedContainerSpec` at the `loot` anchor. The pack must be materialized from world composition regardless of quest offer/acceptance/state.

Add a reusable optional `initialInstances` field to `WorldGeneratedContainerSpec` and pass it to the new `Inventory(...)` only when no saved container snapshot exists. This is preferable to post-create mutation because it preserves the existing "spec defines initial state, saved snapshot overrides it" lifecycle and prevents rebuild duplication.

The pack id should derive from quest/story binding + anchor/cave identity, not stage state. Keep supplies modest and count-based; the distinctive bow is the only item that needs stable identity.

For `storyFind`, keep V1 presentation cheap. A small world-owned static evidence prop is enough if an existing prop/model fits; do not create a corpse lifecycle or NPC death record for historical remains. If no suitable asset exists, bind the story discovery to the pack/anchor rather than introducing a new simulation system solely for decoration.

## Distinctive bow identity

Do not represent possession with a quest boolean.

The minimal reusable path is to support generic identity-only instances for selected otherwise-stateless item kinds and use a deterministic instance id such as:

```text
quest:lost-hunter:<caveId>:bow
```

Prefer extending existing item-instance acquisition/transfer semantics rather than adding a quest-specific inventory. The important invariant is that the same `ItemInstance.id` survives:

```text
world container → player inventory → giver/NPC inventory or removal
```

Do not globally convert all bows to durability/stateful weapons unless required by existing inventory code. If `Inventory`/transfer UI needs classification, add the narrowest generic "identity-backed" mechanism that lets `hunting_bow` be stored as an instance while ordinary bows may remain count-based.

Review these paths while implementing:

- `src/items/itemInstances.ts` (`ItemInstance`, clone/save support, instance-backed classification);
- `src/items/Inventory.ts` (`addInstance`, `removeInstance`, save/restore);
- container transfer actions/UI, which already support instance rows;
- NPC personal inventory transfer helpers for the return-to-family outcome.

The completion check for returning the bow must query the deterministic instance id, not `inventory.has('hunting_bow', 1)`.

## Witness reveal / navigation

`revealLocationKnowledge(locationId, catalog, knowledge, navigationTargets, { setNavigation: true })` is already the correct world seam. Cave locations use the existing `cave:<caveId>` identity resolved by the world-location catalog.

Current `talk_to_npc` / stage dialogue actions only advance quest state and apply social consequences; they cannot reveal a location. Add one small reusable quest-to-world effect seam rather than special-casing this quest in UI code.

Recommended shape: a typed stage/dialogue effect such as `reveal_location { locationId, setNavigation }`, executed by `QuestManager` through an injected callback supplied by `createApp.ts`. `QuestManager` should not import location systems directly. Execute the effect exactly once as part of the same explicit player action that advances the witness stage.

Do not use `discover_location` for the witness stage: that objective means the player's knowledge already contains the location and would invert the intended flow.

## Quest stages / completion

Suggested runtime mapping using existing vocabulary:

1. offer from giver;
2. explicit `talk_to_npc` / dialogue action with witness; on selection reveal cave + set navigation;
3. `loot_world_container` for the exact hunter pack;
4. return/report to giver;
5. terminal choice.

`loot_world_container` is appropriate for "find the pack" because it reads authoritative `WorldGeneratedContainers` state and survives restore. Ensure its completion predicate requires authored payload removal as it does today; opening the chest alone must not advance.

For the terminal choice, `talk_to_npc_choice` is not ideal because its choices are distinguished by NPC target, while both primary outcomes are spoken to the same giver. Prefer a small reusable report-choice mechanism if one already emerges during implementation; otherwise extend the existing explicit report/action model to support multiple outcome actions for one NPC. Do not fake the choice by creating a second NPC target.

Before resolving `return_bow_to_family`, atomically remove the exact bow instance from the player and only then apply the successful outcome/consequences. If the player no longer owns it, keep the quest reportable but do not expose/allow that action. `report_fate_keep_bow` leaves the instance untouched.

Use normal `QuestConsequences` for relationship/reputation/renown deltas. No duplicate bow reward.

## Persistence / rebuild traps

- Quest definition/binding, cave anchors, location id and bow id are deterministic derived data; do not add them to `SaveData`.
- World-generated container mutable contents already persist. Adding `initialInstances` must preserve saved-snapshot precedence so a looted bow never respawns on rebuild/load.
- Player/NPC inventories already persist item instances; make sure the new identity-only bow survives `toSaveItemInstance()` / `instancesFromJSON()` and cloning without losing its id.
- WorldBundle rebuild must reconstruct the same pack spec and cave spatial context; it must not deposit a second instance into a saved container.
- Avoid a quest-specific "found remains" boolean when pack loot / location knowledge can provide authoritative progress.

## Tests worth adding

Focus on boundaries that are easy to break:

- deterministic giver/witness/cave/anchor/bow ids for the same seed/settlement data;
- selector never uses child as preferred giver/witness and honors hunter → woodcutter → adult fallback;
- natural cave binding requires actual `storyFind` + `loot` anchors and skips claimed candidates;
- witness action calls the injected location reveal exactly once and sets navigation;
- pack exists before quest acceptance and uses exact cave Y/spatial context;
- `initialInstances` are used only for a fresh container; saved contents win on restore/rebuild;
- exact bow instance moves container → player and survives serialization;
- return outcome removes that exact instance; keep outcome does not;
- unrelated `hunting_bow` does not satisfy/replace the distinctive bow;
- no bow duplication after load or `WorldBundle` rebuild.

Manual browser verification remains the User's responsibility.