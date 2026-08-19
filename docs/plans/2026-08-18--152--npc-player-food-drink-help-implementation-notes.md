# Plan 152 — NPC pomoc graczowi w jedzeniu i piciu — implementation notes

**Created:** 2026-08-18
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~106~~ ~~069~~ ~~122~~ ~~156~~

> Review against the current Seedvale codebase. This file refines implementation details for an AI agent; the plan `2026-08-18--152--npc-player-food-drink-help.md` remains unchanged.

## 1. Review verdict

Plan 152 fits the existing architecture. The implementation should be a small extension of existing NPC dialogue, `Inventory`, `PlayerNeeds`, relations and social reaction data.

The key rule is:

```text
existing NPC dialogue v2
        ↓
request food / request water
        ↓
small synchronous resolution
        ↓
existing NPC Inventory
        ↓
existing player Inventory / PlayerNeeds
```

Do **not** create `NpcHelpManager`, `PlayerAssistanceManager`, a second inventory, a second reputation/relationship store, a second interaction system or a player-only survival subsystem.

The plan's V1 boundary is important: a request may only use a resource that the NPC actually carries. `Household.stock` and `Household.water` are not a conversation-time fallback. Plans 069 and 156 should inform the existing household/storage ownership, not become a shortcut around NPC carried inventory.

## 2. Current code anchors

Start implementation by tracing these exact boundaries rather than designing new abstractions:

- `src/player/PlayerNeeds.ts` — `eatFood()` and `drinkWater()` are the existing domain operations for restoring the player's hunger/thirst. Do not mutate `needs.hunger.current` or `needs.thirst.current` directly. fileciteturn2file0L2-L2
- `src/items/Inventory.ts` — generic carried inventory. It already provides `count()`, `has()`, `add()`, `remove()`, weight checks and serialization. Use those methods; do not access `counts` or create a second transfer API. fileciteturn5file0L2-L2
- `src/items/itemCatalog.ts` — `ITEM_CATALOG` is the gameplay-facing source for `consumable.need`, `relief` and optional `resultKind`. Do not duplicate food/water relief tables. fileciteturn15file0L2-L2
- `src/ai/NpcAgent.ts` — existing NPC inventory/social wiring. Keep `NpcAgent` independent of `QuestManager`; pass social data through the existing lookup/hook pattern.
- `src/ai/reactionChance.ts` — existing `PlayerSocialLookup` and reaction model. `relationLevel` and `standing` already arrive together, and `computeReactionChance()` uses personality/traits/relation/standing. fileciteturn7file0L2-L2
- `src/quests/QuestManager.ts` / quest relation state — existing owner of per-NPC relation and `getPlayerStanding()`. Do not cache a second relation or standing value in dialogue/assistance state.
- `src/ui-vue/NpcDialogueMenu.vue` and `src/ui-vue/store.ts` — dialogue v2 is the UI/interaction entry point. The existing quest `help` / `QuestDialogOverride` flow should not be repurposed as a quest object merely to implement food/water assistance.
- `src/app/interactables.ts` and the existing `[E]` NPC interaction path — keep the current interaction system; do not add a second NPC interaction registration.

## 3. Dependencies: what to reuse

### Plan 106 — player needs / food

Treat the player's hunger/thirst pools and consumable semantics as already established. The assistance feature should call the same `PlayerNeeds` operations used by normal player consumption rather than introducing new relief logic. `ITEM_CATALOG` remains the source of `need`, `relief` and container `resultKind`. fileciteturn2file0L2-L2

### Plan 069 — household resources

`Household` remains authoritative for household food/water reserves. Those reserves must not be read and converted directly into a player gift during the V1 conversation. The only V1 source is the NPC's carried `Inventory`.

### Plan 122 — dialogue/social integration

Use the existing dialogue-v2 extension point and existing social lookup. Do not add another dialogue screen, interaction menu or NPC-specific social state.

### Plan 156 — household/settlement storage logistics

156 may change how resources reach households and NPC carried inventory over time. Plan 152 should consume whatever carried inventory exists at the moment of the request; it must not implement its own household-to-NPC provisioning path. If 156 later makes consumables naturally available in NPC inventory, 152 should benefit automatically.

## 4. Dialogue v2 integration

The important distinction is between the existing quest `help` topic and this new survival assistance request.

Do not put `food` / `water` fields into `QuestDialogOverride` simply because the UI already has a `helpResult`. That would couple a non-quest interaction to quest state.

Preferred shape:

```text
NpcDialogueMenu
  ├─ existing topics / quest help
  └─ request food
  └─ request water
          ↓
      local assistance callback/resolver
          ↓
      result: success / no_item / unwilling / invalid_state
```

The resolver may be a small domain function or a small callback supplied by the existing dialog-opening flow. It does not need a global manager.

`src/ui/createNpcDialog.ts` is only a compatibility facade; do not move the feature into the old dialog implementation when the actual UI is already Vue-based.

## 5. Visibility versus authoritative validation

The UI may hide a request when it clearly cannot make sense, for example when the player is already full for that need. However, UI visibility is never authoritative.

On click, the resolver must re-check:

1. current player hunger/thirst;
2. current NPC carried inventory;
3. current social state (`relationLevel`, `standing`, personality/traits as available);
4. NPC own-needs guard;
5. player inventory capacity when the result is an item transfer.

This prevents stale UI state from consuming or transferring an item incorrectly.

Do not make the button disappear solely because the NPC currently has no item if the intended UX is to allow a natural refusal. In that case `no_item` is a normal result.

## 6. Consumable selection

Do not hardcode a long `if tomato ... else bread ...` chain in the UI or resolver.

Use `ITEM_CATALOG[kind].consumable` as the source of truth:

```text
candidate kind
  → ITEM_CATALOG[kind].consumable
  → need === 'hunger' | 'thirst'
  → use catalog relief/resultKind
```

The resolver may use a small central preference rule when several carried food items are available, but the relief values must always come from the catalog.

Important: `Inventory` stores item counts by `ItemKind`, so selecting a candidate must operate on `npc.inventory.count(kind)` / `has(kind, 1)` rather than assuming item instances.

## 7. Food transfer semantics

Follow the plan's acceptance criteria literally: successful food assistance **transfers the food item from NPC carried inventory to the player's inventory**.

Do not silently change this into “NPC feeds the player and the food disappears”. The plan says the player receives the resource; acceptance explicitly requires the NPC inventory item to be removed and the player to receive it.

Safe order:

```text
find food kind
    ↓
check npc.inventory.has(kind, 1)
    ↓
check player.inventory.canAdd(kind, 1)
    ↓
resolve willingness
    ↓
npc.inventory.remove(kind, 1)
    ↓
player.inventory.add(kind, 1)
```

Because `Inventory.add()` can fail due to weight, do the `canAdd()` check before removing from the NPC. If a later operation can still fail, make the mutation path rollback-safe rather than leaving the item lost.

The food transfer itself must not call `eatFood()`; the player receives the consumable and can use the normal existing consumption path.

## 8. Water assistance semantics

Water is different because the current model represents household water as `Household.water`, while portable water is an item such as `waterskin_full`.

V1 must only use the carried portable item. Never do:

```text
Household.water → PlayerNeeds.thirst
```

inside this feature.

For a carried water item, follow the existing consumable semantics from `ITEM_CATALOG`: `need === 'thirst'`, `relief` from the catalog, and `resultKind` when the item is a container swap. `waterskin_full → waterskin_empty` must use the same semantics as normal player drinking rather than a second implementation of the swap. fileciteturn15file0L2-L2

The plan's acceptance criteria require the water request to remove the carried water item from the NPC and apply the existing hydration effect to the player. Therefore do not merely add `waterskin_full` to the player inventory and stop there.

Before coding, trace the existing player consume handler in `createApp.ts` / inventory interaction flow and reuse or extract the smallest common operation if necessary. Do not duplicate the `resultKind` swap logic.

## 9. Assistance resolver

Keep the resolver synchronous and event-driven. It runs only after the player selects the request.

Suggested result shape:

```ts
type NpcAssistanceResult = {
  kind: 'food' | 'water'
  outcome: 'given' | 'no_item' | 'unwilling' | 'invalid_state'
  itemKind?: ItemKind
}
```

The exact type/name should follow existing local conventions; this is guidance, not a required new public API.

Recommended order:

```text
request
  ↓
validate player need
  ↓
find carried candidate
  ↓
resolve social willingness
  ↓
validate own-needs guard
  ↓
validate player inventory capacity if applicable
  ↓
perform existing inventory/needs mutation
  ↓
return result for dialogue feedback
```

Never remove the NPC item before willingness and all transfer preconditions have succeeded.

No per-frame state is required.

## 10. Willingness: reuse relation, standing and reaction model carefully

This is the most important architectural point.

`reactionChance.ts` already combines:

- personal `relationLevel`;
- player standing from `QuestManager.getPlayerStanding()`;
- personality openness/extraversion;
- `curious` trait.

`PlayerSocialLookup` already exposes `{ relationLevel, standing }`, so do not make `NpcAgent` import `QuestManager`. fileciteturn7file0L2-L2

However, `computeReactionChance()` is a **probability**, not a deterministic willingness result. Its caller performs the random roll. Do not blindly call it and claim that the assistance decision is deterministic.

Preferred implementation:

1. reuse the same social inputs and weighting philosophy as `reactionChance.ts`;
2. give the concrete personal relation the strongest influence;
3. use standing as a secondary/global social signal;
4. use openness/extraversion and relevant traits as modifiers;
5. keep own-needs/carried-resource constraints outside the social score;
6. if a random roll is used, use the project's existing deterministic/randomness convention rather than introducing an ad-hoc RNG;
7. if the existing reaction model has a clean pure score helper, reuse/extend that helper instead of duplicating the formula.

Do not create a second reputation system, a second relation lookup, LLM decision making or a new utility-AI just for this interaction.

If the implementation requires a genuinely deterministic yes/no decision, derive it from a pure score/threshold or the existing deterministic event/RNG mechanism. Do not use `Math.random()` directly in the new resolver merely because `reactionChance.ts` has probabilistic callers.

## 11. NPC own-needs guard

The plan includes NPC own needs. Give this a narrow V1 meaning; do not build a new NPC survival system.

At minimum, an NPC should not casually give away a carried consumable when doing so would leave the NPC without an immediately needed resource and the existing NPC state says that need is critical.

Use existing NPC needs/state if already available. Do not infer household stock by teleporting or magically consulting the household as a replacement for the NPC's carried item.

If current NPC needs do not distinguish whether a particular carried item is reserved for the NPC, keep the guard conservative and simple. Do not invent a reservation ledger for plan 152.

## 12. Relations and standing must remain read-only here

The request itself should not create a new relation record or reputation manager.

A successful help interaction may be represented in dialogue feedback, but unless the existing relations API already defines a suitable relationship consequence, do not invent a new “helped player” relation mutation as part of this plan.

The decision reads:

```text
QuestManager relation state
        +
QuestManager.getPlayerStanding()
        +
existing NPC personality/traits
```

It does not write a parallel copy of any of those values.

## 13. Inventory atomicity and capacity

`Inventory.add()` enforces the weight limit and returns `false` on failure. This matters for food transfer because the player's inventory may be full.

Use the existing API:

```text
npc.inventory.has(kind, 1)
player.inventory.canAdd(kind, 1)
...
npc.inventory.remove(kind, 1)
player.inventory.add(kind, 1)
```

Do not bypass `canAdd()` or mutate private maps.

For water, account for the existing `resultKind` semantics and player inventory capacity according to the normal consume path. If the existing consume path needs the empty waterskin to remain with the player, use that same capacity validation before removing the NPC's full waterskin.

## 14. NPC carried consumables: verify before adding any new source

Do not assume that because `NpcAgent.inventory` exists, ordinary NPCs already carry food and water.

`Inventory` was introduced as a generic carried container and is already used by NPC resource/transport behaviour. fileciteturn5file0L2-L2

Before implementation, trace all existing writes to `NpcAgent.inventory` and determine whether normal NPCs can actually acquire:

- food consumables such as `tomato`, `raw_meat`, `roasted_meat`, `bread`;
- portable water such as `waterskin_full`.

If they can, use those real paths.

If they cannot, do **not** add a player-centric “give NPC food for plan 152” mechanism. The correct V1 runtime result may be that only specially equipped/test NPCs can provide assistance until an existing logistics/work system supplies such items naturally. Plan 156 should eventually improve that situation through the normal logistics chain.

## 15. Persistence

Do not add a new save format for assistance.

`Inventory` already has serialization support, but that does not prove that every NPC inventory is currently persisted. Verify the actual NPC save/load path before making claims about persistence.

If NPC carried inventory is runtime-only under the current policy, the assistance consequence is runtime-only as well. Do not introduce hidden persistence solely to preserve this feature.

Player inventory/needs should continue using their existing persistence path.

## 16. Performance

This is a low-frequency interaction.

Do not add:

- per-frame scans of NPC inventories;
- per-frame checks of player hunger for every NPC;
- global scans to find a helpful NPC;
- background willingness updates.

All candidate lookup and social resolution should happen when the player opens/uses the dialogue or selects the request. Keep the computation O(1) or proportional only to the small carried inventory being inspected.

## 17. Tests

Prefer tests around the pure resolver and existing state operations over UI-only tests.

Minimum useful cases:

- food carried + willing → success; NPC count decreases, player count increases;
- food absent → `no_item`, no inventory mutation;
- player cannot carry food → no mutation;
- water carried + willing → NPC water item decreases and existing thirst effect is applied;
- water absent → `no_item`, no mutation;
- unwilling → no inventory/need mutation;
- social result changes with relation level;
- standing is read through the existing social lookup rather than a second reputation source;
- `waterskin_full` preserves existing `resultKind` / empty-container behaviour;
- own-needs guard prevents giving a critical last carried resource when the existing NPC state supports that determination;
- repeated request after a successful transfer sees the changed inventory and does not give the same item twice.

## 18. Browser/manual verification

Use an NPC that **actually has** the relevant carried item. Do not add a production-only debug provisioning path just to make the test pass.

Check at minimum:

1. NPC with carried food + favourable relationship → request food → help succeeds → NPC inventory decreases and player inventory increases.
2. NPC without carried food → request food → normal refusal → no inventory mutation.
3. NPC with carried portable water → request drink → NPC carried water decreases and player's existing thirst state changes correctly.
4. NPC without carried water → request drink → normal refusal.
5. NPC with poor relation / low willingness → refusal is possible and does not consume the item.
6. Repeat after a successful transfer → the same carried item cannot be given twice.
7. Verify no extra per-frame behaviour appears while merely standing near an NPC.

## 19. Implementation traps to avoid

- Do not turn the quest `helpResult` into a generic bag of unrelated interaction types.
- Do not import `QuestManager` into `NpcAgent` just to obtain relation/standing.
- Do not create `NpcHelpManager`, `ReputationManager`, `AssistanceManager` or another global service.
- Do not create `NpcInventory` alongside the existing `Inventory`.
- Do not read `Household.stock` / `Household.water` during the V1 request as a fallback.
- Do not teleport NPCs home or create `goHomeAndFetchFoodForPlayer()`.
- Do not add a new per-frame NPC scan.
- Do not duplicate `ITEM_CATALOG` consumable relief values.
- Do not mutate `PlayerNeeds` fields directly.
- Do not use `Math.random()` ad hoc if deterministic simulation is required.
- Do not silently convert food assistance into immediate consumption; the plan's food acceptance criterion is an item transfer to the player.
- Do not introduce new persistence solely for this feature.

## 20. Verification commands

Run the repository's normal checks after implementation:

```text
npx tsc --noEmit
npm run lint
npm run build
npm test
```

Then perform browser/manual verification because the feature crosses Vue dialogue, runtime inventory and player needs.

The plan itself remains unchanged; this file is implementation guidance only.

> Zrób git commit i push do main, rebase jeżeli trzeba
