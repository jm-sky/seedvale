# Implementation Notes: Profession quests, guard rewards & wildlife help

**Plan:** `quests-progression-020-profession-quests-guard-rewards-and-wildlife-help.md`  
**Reviewed against:** `main` 2026-09-12  
**Important concurrent change:** a separate fix for multiple quest contexts per NPC/dialogue/marker is being implemented at the same time. Re-read the dialogue section below against current `main` immediately before coding this plan; do not reimplement work that already landed.

## 1. Quest/dialogue baseline and concurrent-fix boundary

Current pre-fix `src/quests/QuestManager.ts` still exposes `QuestDialogOverride` with `line`, optional `offer`, optional `actions`; `QuestDialogAction.onSelect()` already re-reads live quest state. `QuestManager` owns one runtime state per `questId`; persistence is already per quest.

The concurrent fix is expected to add a presentation-neutral multi-context/topic layer and make `labelMarker(npcId)` a global reduction across all quests for that NPC. After that fix lands:

- **reuse its topic/entry contract** for Hunter/Guard quest presentation;
- do not add another `QuestDialogTopic`/primary-quest abstraction;
- do not touch marker arbitration unless this plan introduces a new state that genuinely needs it;
- keep `QuestDialogAction` for authored state-changing speech, not for choosing which quest context to inspect;
- §8 of the plan becomes mostly satisfied infrastructure: this plan should only supply proper authored labels/report lines for its new quests and use the new generic entry path.

Files to re-check after the concurrent fix:

- `src/quests/QuestManager.ts`
- `src/ui-vue/store.ts`
- `src/ui-vue/NpcDialogueMenu.vue`
- `src/quests/QuestManager.test.ts`
- `src/ui-vue/npcDialogueOpen.test.ts`
- `docs/state/quests.md`

If the fix has landed, do not overwrite its tests/contracts with the older single-help-result assumptions recorded in this plan.

## 2. Role-based quest materialization

Use the existing world-driven quest pipeline, not authored display names:

- `src/quests/opportunities/worldQuestMaterialization.ts::opportunityNpcsFromSettlement()` already returns stable NPC id + role from `SettlementDef`.
- `materializeSettlementQuestOpportunity()` is the existing path from data-only opportunity to normal `QuestDef`.
- `src/app/createApp.ts` already assembles/materializes world-driven quests before `new QuestManager(...)`.

Hunter/Guard content should therefore be represented as deterministic settlement quest opportunities/materializers keyed by stable settlement/NPC identity. Do not add role lookup inside `QuestManager` and do not hardcode `Marek`, `Kasia`, etc.

For the Hunter chain, bind one concrete hunter `NpcId` in Hunter I and make Hunter II/III reconstruct to that same deterministic giver. Sequential gating stays a normal `quest_outcome` prerequisite.

## 3. Hunter I/II progress: add one reusable counted harvest objective

`src/fauna/animalHarvest.ts::harvestAnimalIntoInventory()` is the shared successful knife-harvest mutation used by player and Hunter NPC paths. It currently returns `{ meatKind, hide }`; it does not know quests.

Add a player-only reporting seam **after** successful player harvest, at the player caller (`src/app/actions/survivalActions.ts` path), not inside `harvestAnimalIntoInventory()`. This avoids NPC Hunter harvests progressing player quests.

Recommended contract:

```ts
type PlayerAnimalHarvestContext = {
  animalId: string
  animalKind: AnimalKind
  lootKinds: readonly ItemKind[]
}

questManager.onAnimalHarvested(context)
```

Add objective:

```ts
{ type: 'harvest_animals', kind: AnimalKind, count: number }
```

This is a counted predicate objective, not a bound individual objective. Do not reuse `kill_target_animal`; its one-individual binding/persistence semantics are deliberately different.

### Persistence

Current `QuestProgressEntry` only stores quest id/state/stage/outcome. A counted objective needs minimal persisted stage progress. Prefer one generic optional field on quest progress (e.g. objective progress count) rather than a Hunter-specific registry. The shape must remain reset/advance-safe:

- starting a counted stage → count `0`;
- matching harvest → increment capped at target;
- stage advance → clear/reset stage-local count;
- save/load → exact count restored;
- legacy saves → default `0`.

Do not persist harvested animal ids for this objective; the corpse harvest is already one-shot, so duplicate increment in one runtime path should be prevented by the fauna harvest owner.

Hunter I should require `harvest_animals deer ×3`, then `gather_item hide ×3` hand-in. Hunter II should require `harvest_animals stag ×2` as minimum proof of hunting, then `gather_item antler ×2`; 50% trophy chance may naturally force more than two stag harvests.

## 4. Antler loot: extend the existing harvest result, not QuestManager

Current `harvestAnimalIntoInventory()` atomically marks the corpse harvested, adds one species meat, then attempts one `hide`. Extend its result to carry extra loot in a general way, e.g. `lootKinds`/`extras`, instead of adding a quest-only boolean.

`antler` belongs in normal item ownership:

- `src/items/items.ts` — `ItemKind`, `ITEM_DEFS`
- `src/items/itemCatalog.ts` — normal resource metadata
- `src/items/tradeCatalog.ts` — trade value used by generic economy
- generated/item docs only through existing docs workflow; do not hand-maintain generated indexes.

### 50% roll

Do not call `Math.random()` in harvest. There is no shared global string-hash helper today; several systems use a small local FNV-1a + `createSeededRandom()` convention. Prefer a tiny fauna-owned deterministic trophy resolver whose input is explicit, rather than burying random state in `Inventory` or quests.

Important boundary: ordinary wild animal identity is not guaranteed across full rebuild/save restore. Do **not** expand per-individual wild-fauna persistence solely to preserve an unharvested antler roll. The required invariant is one roll for one authoritative corpse harvest; `animal.harvestMeat()` already makes the operation one-shot. If the caller can provide a stable seed/key for the live corpse, use it; otherwise document that pre-harvest rebuild may regenerate ordinary wild individuals and therefore their future loot, consistent with existing wild-fauna persistence limits.

Only adult `stag` qualifies. Check the existing life-stage/juvenile field on `AnimalAgent` rather than inferring from scale/model.

## 5. Hunter III: reuse fauna-023 attraction and report actual consumption

`fauna-023` already established the correct architecture:

```text
world authoritative dropped items/traps/blood
→ one read-only attraction snapshot per fauna pass
→ AnimalAgent resolver/movement
→ exact source revalidation
→ atomic dropped-item consume
→ food relief
```

Relevant files/contracts:

- `src/fauna/animalDefs.ts` — `AnimalDef.diet`, `dietAcceptsItem()`
- `src/fauna/animalAttraction.ts` / attraction logic in `AnimalAgent`
- `src/items/createDroppedItems.ts` — atomic non-pickup consume path added by fauna-023
- `src/app/gameLoop.ts` — reused attraction snapshot buffer built once per fauna pass
- `src/fauna/AnimalSpawner.ts` / `src/fauna/createFauna.ts` — `thicket` / `spawnPointId` ownership

Add deer/stag plant-item diet compatibility through `AnimalDef.diet`; do not add quest-only feeding behavior. `apple`, `carrot`, `berries` should be ordinary compatible items.

The missing seam is **successful loose-food consumption notification**. Emit it only after atomic source removal succeeds and relief is applied. The event should include at least:

```ts
{
  animalId: string
  animalKind: AnimalKind
  spawnPointId?: string
  itemKind: ItemKind
}
```

QuestManager consumes that through an injected/reporting method and matches a `feed_habitat_animals` objective against the target `spawnerId`, accepted species and allowed food.

For dedupe, prefer one counted objective with a small runtime `Set<animalId>` plus persisted count. Because ordinary wild ids are not stable across restore, do not serialize the set as authoritative identity. To avoid post-load double-count abuse, the safer V1 rule is **count successful consumption events, not unique lifetime animals** if stable event identity cannot be guaranteed. If current fauna exposes a stable spawn-slot/source identity for thicket animals, use it; otherwise change the plan semantics explicitly rather than pretending runtime `animalId` survives restore.

## 6. Guard torch gift and sword recognition: generalize the current legacy module

Current legacy path:

- `src/items/guardSword.ts::askGuardForSword()` grants when `woda-dla-marka` is complete **or** relation `>= 1`;
- `src/app/inventoryWiring.ts` owns the dialogue handler and checks `worldFlags.guardSwordGifted`;
- `src/persistence/saveData.ts` / `src/app/saveState.ts` persist that one-shot flag.

Replace the sword-specific helper with a small guard-reward resolver/module. It may return a player-facing line plus a resolved grant (`wooden_torch`, `long_sword`, coins, none), but must not own Inventory/Reputation/QuestManager.

### Torch gift

Read:

- relation from `QuestManager.getRelation/getRelationLevel`,
- home settlement renown from `ReputationManager.getRenown(settlementId)`.

V1 eligibility: `friendly` OR renown `>= 6`; reward `2 × wooden_torch`; one-shot persisted separately from sword recognition.

### Sword routes

Use three persistent facts, not one ambiguous boolean:

- sword reward already physically granted/substituted,
- renown route claimed,
- alpha route claimed.

Legacy migration: old `guardSwordGifted: true` means sword reward already consumed; route flags start false unless existing save semantics provide stronger evidence. `woda-dla-marka` must never synthesize entitlement.

For alpha recognition, hook the **existing player-caused animal kill path** used by `src/reputation/animalDeeds.ts`; do not infer from generic `onAnimalDeath()`. Fauna owns the variant. The app-level kill context may inspect the killed `AnimalAgent`/resolved variant at death time and set the persisted recognition fact, while normal animal-deed reputation remains unchanged.

Do not identify alpha via scale, label or `dangerSignificance` threshold alone: quest-dangerous wolves can also modify significance. Use the existing fauna variant identity if exposed; if the player-kill context currently only carries significance, extend it narrowly with resolved variant/deed classification at the app/fauna seam rather than duplicating variant tables in quests.

Coin substitute must use `tradeValue('long_sword')`, not `sellPrice()` and not literal `50`.

## 7. Evening guard quest: settlement torch contract must be extended first

The source plan has now been corrected to make this explicit. Current code still has the gap:

- `src/settlement/houseLighting.ts::VillageTorch` is documented as **night-auto**, not player-fueled;
- `src/settlement/settlementNightCycle.ts::createSettlementNightCycle()` sets every village torch `true` automatically at dusk and `false` at dawn;
- only `VillageFire` has the existing player-lightable campfire lifecycle.

Do not implement `light_settlement_fires` as a read-only lookup over today's torches — it would auto-complete when dusk crosses `NIGHT_FIRE_THRESHOLD`.

### Required settlement-owned extension

Before the quest objective:

1. Give canonical settlement torch posts stable identity derived from stable settlement identity + authored/plan torch slot; never use mesh identity or loaded-array index as durable identity.
2. Expose read-only `isLit()` from `VillageTorch` or the nearest settlement-owned wrapper.
3. Register a normal player interaction for canonical village torches so `[E]` can manually ignite the selected torch. Reuse existing fire-starting/tool/inventory conventions where practical; do not add quest-only ignition logic.
4. Keep the lit mutation in settlement lighting. Quest code only observes.
5. Do not add a `TorchManager` or duplicate torch state in quests.

### Dusk automation policy

Outside the active quest, behavior must remain exactly as today:

```text
dusk → canonical village torches auto-light
dawn → canonical village torches extinguish
```

During the active evening-light objective, required torches in the target settlement must not auto-light before the player. Implement this as a narrow **quest-neutral policy/input** to settlement lighting, e.g. `shouldAutoLightTorch(torchId)`, injected/wired from app composition. `settlementNightCycle.ts` must not import `QuestManager` and must not know quest ids.

Policy requirements:

- default returns normal auto-light behavior;
- suppression is scoped to the target settlement/required torches only;
- other settlements continue normal dusk automation;
- dawn extinction remains normal;
- completion/cancel/rebuild removes suppression;
- save/load reconstructs suppression from authoritative active quest state rather than persisting another lighting flag.

Then `light_settlement_fires` can read canonical torch `isLit()` + `VillageFire.isLit()` through a read-only lookup.

The source plan does **not** authorize silently reducing the quest to campfire-only. If implementation recon proves manual canonical torches infeasible without disproportionate redesign, stop and update the plan rather than faking torch progress or changing gameplay during implementation.

## 8. Offer window: use world time lookup, no timers

`src/world/dayNight.ts` confirms:

- `timeOfDay` is `[0,1)`, hour = `timeOfDay * 24`;
- `elapsedDays` is absolute world days and advances through time skip;
- default day length is 480 real seconds but must not enter quest logic.

Do not materialize a one-day static `QuestDef` at boot. Add a read-only time lookup to availability evaluation, e.g. current `{ timeOfDay, elapsedDays }`, and derive the deterministic one-hour offer window from `(worldSeed, guardNpcId, floor(elapsedDays))`.

The availability predicate applies only while state is `not_offered`; once accepted, normal quest lifecycle owns it and the window no longer expires the quest.

Keep this reusable but narrow. A general prerequisite shape such as `time_window` is fine only if evaluation can express the deterministic daily offset without storing mutable dates in authored definitions; otherwise use a small dynamic availability callback at composition root.

## 9. Tests worth adding beyond the plan list

Focus tests on seams that are easy to regress:

- NPC Hunter harvest does not increment player `harvest_animals`;
- player successful harvest increments once and save/load restores the count;
- `stag` trophy cannot be rerolled by calling harvest twice on the same corpse;
- juvenile stag never returns antler;
- feed progress happens after successful atomic world-item consumption, not on target selection/approach;
- wrong `spawnPointId`/species/item does not progress Hunter III;
- legacy `guardSwordGifted` save cannot re-grant a sword;
- normal wolf kill never sets alpha recognition;
- quest-marked dangerous normal wolf does not count as alpha;
- first sword route gives `long_sword`, second route gives exactly `tradeValue('long_sword')` coins;
- default dusk/dawn village-torch automation remains unchanged without an active evening quest;
- active evening objective suppresses only the required target torches and cannot auto-complete from dusk automation;
- manual canonical torch ignition changes settlement-owned state that the quest reads;
- time skip crossing into/out of the offer window produces the same result as normal clock progression.

After the concurrent multiple-quests fix lands, add at least one integration fixture with Hunter I/II/III or Guard contexts sharing one giver to prove plan 020 content uses the generic multi-context path rather than reintroducing first-match behavior.

## 10. Implementation order

1. Rebase/pull `main` and verify the concurrent multiple-quests dialogue/marker fix; adapt to its final contract.
2. Add counted objective persistence + `harvest_animals` reporting seam.
3. Add `antler` item + harvest trophy resolver and Hunter I/II opportunities.
4. Add deer/stag diet + successful-consumption callback + Hunter III opportunity.
5. Generalize guard gift/sword recognition persistence and dialogue; migrate legacy flag.
6. Extend canonical settlement torch identity/state/manual interaction and quest-neutral dusk auto-light policy; lock the existing default behavior with tests.
7. Add evening quest time availability + read-only settlement-light objective.
8. Add/adjust authored player-facing dialogue using the already-landed multi-context UI contract.
9. Update `docs/state/quests.md`, and update fauna/items/settlement/persistence state docs only where implemented contracts changed.

Important architectural/public functions/types added for counted objectives, consumption reporting, guard reward resolution, canonical settlement torch identity/state or settlement-light policy should get concise JSDoc with the appropriate `@domain` tag.

## 11. Model recommendation

**Model:** Opus, Sonnet

This is cross-domain work across quest lifecycle/persistence, fauna harvest and attraction, guard progression, settlement lighting/interactions and save compatibility. Opus is the safer primary implementation model; Sonnet is the cheaper fallback with acceptable risk if the notes are followed closely.

> **Zrób git commit i push do main, rebase jeżeli trzeba**