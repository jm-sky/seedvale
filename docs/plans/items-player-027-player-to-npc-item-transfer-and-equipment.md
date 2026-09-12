# Plan: Player-to-NPC item transfer and equipment

**Created:** 2026-09-11
**Status:** `verification needed` 🔍 — implemented + technically verified (`tsc`, lint, targeted vitest). Browser/manual verification is owned by the user.
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-026~~
**Domain:** `items-player`
**Subdomains:** `inventory` `items` `interaction`
**Tags:** `companions` `npc-inventory` `item-transfer` `equipment`
**Roadmap:** `companions.md`

## Goal

Allow the player to deliberately give a concrete owned item to an ordinary NPC so that:

```text
player Inventory
    ↓ ownership transfer
NPC personalInventory
    ↓
normal NPC decisions / actions
    ↓
combat / needs / work / other supported item use
```

Initial supported examples include:

- weapons,
- ammunition where current NPC action systems support it,
- tools,
- food,
- drink/liquid containers where already supported,
- other ordinary item kinds whose NPC action systems already know how to use them.

The capability is general-purpose **Player → NPC**, not Companion-specific. A normal settlement NPC and an accompanying NPC use the same mechanism.

In this plan, **equipment means normal action-time selection of gear the NPC already owns**, not player-managed equipment slots.

Do not create:

- `CompanionInventory`,
- `CompanionEquipment`,
- `NpcGiftInventory`,
- duplicated item definitions,
- companion-only weapon/tool/food use,
- a party inventory screen.

Preserve the distinction:

```text
item ownership
    ≠
permission to access storage
    ≠
NPC decision to use item
```

This plan concerns direct ownership transfer into NPC personal belongings and making existing NPC action systems correctly see/use those belongings.

Player-storage permissions are a separate future plan.

## Current architecture and recon

### 1. `Inventory` is already actor-neutral ownership

`src/items/Inventory.ts::Inventory` is already used by both player and NPC ownership.

It owns:

- count-based items,
- concrete item instances,
- food freshness batches,
- liquid-container state,
- capacity,
- item-instance durability/condition where applicable.

`NpcAuthoritativeState.personalInventory` is a normal `Inventory`, not a companion-specific container.

Therefore this plan must not introduce another inventory abstraction.

### 2. NPC personal belongings already have the correct authoritative owner

`src/settlement/npcState.ts::NpcAuthoritativeState.personalInventory` is:

- always present,
- authoritative,
- reused by live `NpcAgent`,
- preserved across NPC reconstruction,
- persisted through `NpcStateSnapshot`,
- persisted through `SaveData.npcStates`.

It is explicitly distinct from `NpcAgent.carried`, which remains transient work/logistics cargo.

Ownership rule:

```text
personal belongings / provisions / weapons / tools / gifted ammunition
→ personalInventory

temporary profession / logistics / task cargo
→ NpcAgent.carried
```

Player-given ordinary belongings belong in `personalInventory`.

### 3. Generic ownership-transfer primitives already exist

`src/items/inventoryTransfer.ts` already provides:

```ts
transferInventoryCount(...)
transferInventoryInstance(...)
```

They operate between any two `Inventory` objects.

They already handle:

- destination capacity preflight,
- atomic failure,
- count stacks,
- instance identity,
- perishable freshness transfer.

This is the canonical ownership-transfer primitive for this plan.

Do not manually:

```text
player.remove()
npc.add()
```

at a UI call-site.

### 4. Player → NPC transfer already exists for wages

`src/app/actions/workContractPayment.ts` already transfers real `coin` items:

```text
player Inventory
→ NPC personalInventory
```

using the generic inventory-transfer seam.

That proves the ownership model and destination are already valid for direct Player→NPC transfer.

The new feature should generalize the interaction/use case, not create a new transfer architecture.

### 5. NPC equipment is currently derived from inventory/action context

There is currently **no persistent NPC equipment-slot system**.

NPC combat resolves usable equipment from `personalInventory`:

- melee weapon,
- ranged weapon,
- defense-capable item.

`src/ai/npcCombat.ts` derives these from `ITEM_CATALOG` and inventory contents.

Therefore V1 must **not introduce `NpcEquipmentState` solely because an item was given to an NPC**.

For existing NPC combat, possession is sufficient input for normal weapon resolution.

### 6. NPC combat already consumes `personalInventory`

`NpcAgent.canFightBack()` checks melee/ranged capability from `personalInventory`.

Consequently:

```text
player gives sword
→ sword enters personalInventory
→ existing combat resolution sees sword
```

should work without an explicit Equip command, assuming the current deterministic resolver considers that weapon suitable.

Giving a weapon must not force immediate combat or override the NPC decision pipeline.

### 7. Ranged ammunition currently has a split ownership path

Current NPC ranged combat resolves the bow from `personalInventory`, but ammunition may still come from transient `NpcAgent.carried` in existing hunter flows.

This matters because player-given ammunition is a persistent personal belonging and must therefore enter `personalInventory`.

Do not copy gifted ammunition into `carried` merely to satisfy the current combat API.

If NPC ranged combat cannot currently consume ammunition from `personalInventory`, extend the general ammo-resolution path so it can use the correct persistent owner while preserving existing transient hunter/work supply semantics.

Do not create companion ammunition state.

### 8. Food and water use already extend normal needs strategy

`npc-017` established that personal provisions belong in `personalInventory` and normal hunger/thirst strategy can consume them.

This plan must reuse that behavior.

Example:

```text
player gives food
→ food belongs to NPC
→ NPC is not hungry
→ nothing happens
→ later hunger pressure wins
→ normal personal-food strategy consumes it
```

No `CompanionRations`.

### 9. Player equipment is a separate concept

The player uses `HeldTool` for one item in hand.

`HeldTool` is explicitly a one-slot player-facing state over inventory, not a general equipment system.

Do not reuse or attach a `HeldTool` object to every NPC merely to represent combat equipment.

NPC actions already resolve their required item differently.

### 10. World/container transfer UI exists but is not the ownership authority

`ContainerScreen` / `containerActions.ts` already expose:

- count transfer,
- concrete instance transfer,
- quantity selection,
- capacity feedback.

However these are currently specific to chest/corpse sessions.

This plan may reuse presentation components where practical, but should not turn living NPCs into fake containers.

The mutation API should stay independently usable from dialogue/contextual interaction.

## Architectural decisions

### 1. One general Player → NPC transfer operation

Introduce a focused application-layer operation conceptually like:

```ts
giveItemToNpc({
  npcId,
  kind,
  amount,
})
```

and an instance equivalent where required.

Exact API naming may adapt to the current app-action structure.

It must:

1. resolve the authoritative NPC state by stable `NpcId`,
2. reject dead/non-interactable recipients where appropriate,
3. revalidate source ownership,
4. revalidate destination capacity,
5. use `transferInventoryCount()` or `transferInventoryInstance()`,
6. trigger existing inventory/UI refresh hooks,
7. return a semantic result suitable for UI feedback.

Do not make Vue mutate inventories directly.

### 2. Destination is `NpcAuthoritativeState.personalInventory`

Never:

```text
NpcAgent.carried
Companion inventory
Work Contract record
accompany commitment
dialogue state
```

The transfer changes ownership.

The item remains with the NPC after:

- conversation closes,
- accompaniment ends,
- NPC returns home,
- settlement unload/reload,
- save/load,

unless another normal system later consumes, transfers, drops or loots it.

### 3. Transfer and item use remain independent

A successful transfer means only:

> The NPC now owns this item.

It does **not** mean:

- equip now,
- eat now,
- drink now,
- attack now,
- work now,
- follow player,
- reserve this item forever.

Normal action systems remain authoritative for use.

### 4. No player-managed NPC equipment in V1

The player does not assign equipment slots in this plan.

Based on current architecture, equipment remains **derived from inventory + action context**.

Examples:

```text
combat
→ resolve suitable weapon from personalInventory

hunger
→ resolve usable food from personalInventory

work
→ action checks required item/capability in personalInventory
```

Do not add persisted fields such as:

```ts
equippedWeaponId
equippedToolId
activeEquipmentSlots
```

unless recon during implementation finds an existing action whose correctness fundamentally requires retaining a selected item across action ticks.

If that happens, prefer **transient action-local selected item identity** over persistent equipment state.

### 5. Concrete instance identity must survive transfer

For instance-backed items, transfer the concrete item, not merely its `ItemKind`.

Examples include weapons with:

- durability,
- sharpness,

and liquid containers with:

- contents,
- litres.

Use `transferInventoryInstance()`.

A sword at 40% durability must remain that same sword after transfer.

### 6. Stack items use quantity-aware transfer

For count-backed items use `transferInventoryCount()`.

UI should support explicit quantity for stacks greater than one, reusing the quantity-selection pattern established by `items-player-024` where practical.

V1 should support:

```text
Give 1
Give N
```

without requiring whole-stack transfer.

### 7. Capacity remains real

NPC `personalInventory` capacity must be respected.

No companion bonus capacity.

Failure should leave both inventories unchanged.

Player-facing response should distinguish at least:

- item no longer owned,
- NPC cannot carry it,
- NPC unavailable/dead,
- successful transfer.

### 8. Existing item semantics remain authoritative

Do not add a new list such as:

```ts
GIFTABLE_ITEMS
COMPANION_USABLE_ITEMS
NPC_EQUIPMENT
```

Ordinary inventory items may be transferred unless there is a concrete gameplay reason to reject a category.

Whether an NPC can actually use an item comes from existing systems including:

- `ITEM_CATALOG`,
- capabilities,
- melee/ranged definitions,
- consumable definitions,
- existing NPC action requirements.

An unusable item may still legitimately be owned by the NPC.

Ownership and usability are separate.

### 9. Weapon choice should remain deterministic

Current NPC combat resolver picks from eligible items deterministically using catalog order.

Giving another weapon may therefore alter which weapon is selected.

This plan should review that behavior explicitly.

If current ordering produces clearly wrong outcomes, for example:

```text
NPC owns weak knife + strong sword
→ always selects knife
```

then improve the **general NPC weapon-selection resolver**, not add companion equipment state.

Preferred direction if modification is necessary:

```text
eligible personal weapons
→ action-context suitability
→ deterministic best candidate
```

using existing weapon stats/capabilities.

Do not add a player-issued permanent `Use this sword` command in this plan.

### 10. Ranged ammunition follows ownership, not current hunter plumbing

Player-given ammunition must be transferred into `personalInventory` like any other personal belonging.

If ranged execution currently resolves ammo only from `NpcAgent.carried`, generalize the ammo resolver rather than copying gifted arrows into transient cargo.

Preserve the semantic distinction:

```text
personalInventory
→ ammunition the NPC personally owns

NpcAgent.carried
→ transient work/hunting/logistics supply where existing flows intentionally use it
```

The resolver may consider both sources where appropriate, but exactly one real inventory must own each consumed unit.

Consumption must remove the arrow from the inventory that actually supplied it.

### 11. Tools should be usable only through existing real tool requirements

For NPC actions that already have a real tool/capability requirement:

```text
NPC owns required tool/capability
→ normal action may use it
```

Do not expand this plan into converting abstract profession work into fully physical tool use.

If a current supported action already claims to require a tool but still relies on role/loadout assumptions instead of real ownership, fix that action narrowly.

Do not add companion-specific:

```text
if (isCompanion) use gifted axe
```

### 12. Food remains ordinary personal food

Player-given food must preserve:

- freshness,
- provenance,
- normal spoilage behavior.

Normal NPC needs decide when to eat it.

Giving food must not directly call hunger relief.

Reuse the personal-provision strategy introduced around `npc-017`.

### 13. Liquids remain concrete container instances

If the player gives a filled container:

```text
player's container instance
→ NPC personalInventory
```

with contents/litres preserved.

Existing NPC personal-water logic determines later consumption.

Do not convert it into a `waterAmount` field on the NPC.

### 14. Transfer does not imply future ownership reversal

After giving an item, it belongs to the NPC.

This plan should not silently allow the player to reopen the NPC's inventory and remove arbitrary belongings.

A future:

```text
request return / give back / trade / theft / loot
```

has social and ownership semantics beyond direct giving.

V1 may expose NPC inventory read-only where useful, but unrestricted taking from living NPCs is outside scope.

NPC corpse loot remains the existing death system.

### 15. No player-storage permissions

This plan must stop at:

```text
player explicitly transfers owned item
→ NPC now owns it
```

Do not implement:

```text
NPC may browse player chest
NPC may withdraw allowed food
reserve quantities
shared-storage policy
```

Those belong to the separate roadmap stage.

### 16. Persistence needs no new inventory schema

`personalInventory` already persists complete inventory contents.

Therefore item transfer itself should need:

- no new top-level `SaveData` field,
- no companion inventory snapshot,
- no equipment snapshot solely for transferred ownership,
- no save-version bump merely because items changed owner.

Transferred belongings should round-trip through the existing NPC-state serialization automatically.

### 17. Death uses the existing personal-belongings path

Existing NPC death moves actual personal belongings into corpse loot rather than synthesizing profession equipment.

Therefore a sword given by the player must naturally become part of corpse loot if still owned when the NPC dies.

Do not special-case gifted items.

### 18. Initial UI should stay contextual and small

Preferred V1 interaction:

```text
interact with living NPC
→ Give item
→ select from player's transferable inventory
→ optional quantity / concrete instance
→ confirm
```

Reuse existing inventory presentation/grouping and quantity selection where economical.

Do not create a full two-column editable party inventory.

A small modal/sheet may visually reuse components from `ContainerScreen`, but living-NPC semantics must remain explicit.

### 19. Stable NPC identity

Mutation must operate on `NpcId`, never:

- display name,
- mesh,
- current list index.

This preserves correctness across same-name NPCs and reconstruction.

## Equipment conclusion

Current recon does **not** justify separate persistent NPC equipment state.

V1 model should be:

```text
personalInventory = ownership

action context
    +
existing catalog capabilities / weapon definitions
    ↓
derive suitable item when action starts
```

Possible transient state is acceptable while an action executes, for example:

```text
combat action selects weapon instance X
→ use X for this combat/action
```

if needed for consistent durability/animation behavior.

But the selected runtime item should not become another authoritative ownership/equipment registry.

A persistent equipment layer should only be introduced later if gameplay requires durable semantic distinctions such as:

- worn armor,
- left/right-hand slots,
- intentionally assigned tool independent of current action,
- equipment bonuses requiring persistent slot occupancy.

None of those are currently required by this plan.

## Expected integration points

Verify against current `main` during implementation.

### Ownership / transfer

- `src/items/Inventory.ts`
- `src/items/inventoryTransfer.ts`
- `src/settlement/npcState.ts`

### App mutation

Prefer a focused action module near existing:

- `src/app/actions/workContractPayment.ts`
- other NPC/player contextual actions.

Do not put mutation in Vue.

### NPC interaction

- existing NPC contextual interaction/dialogue seam,
- stable `NpcId` lookup,
- interaction/action presentation.

Reuse current NPC interaction rather than creating companion interactions.

### Inventory UI

Potential reuse:

- `src/items/inventoryView.ts`
- current quantity selector from `items-player-024`,
- Vue inventory item rows/details.

Do not duplicate item labels/state formatting.

### Combat

- `src/ai/npcCombat.ts`
- `src/ai/NpcAgent.ts`
- `src/items/itemCatalog.ts`

Verify transferred melee/ranged/defense items participate automatically.

Explicitly verify persistent player-given ammunition can be resolved/consumed from `personalInventory` without corrupting existing transient hunter supply.

### Needs

- existing personal-food strategy,
- existing personal liquid-container strategy,
- `src/ai/npcStrategies.ts`,
- relevant `NpcAgent.beginNeed()` execution.

### Work/tool actions

Inspect only actions that already have real tool/capability requirements and ensure they query actual inventory/capabilities rather than relying solely on profession/loadout assumptions.

Do not broaden scope into physicalizing abstract profession work.

### Persistence

- `src/settlement/npcState.ts`
- `src/persistence/saveData.ts`

Expected result: no schema addition required.

## Scope

Includes:

- explicit player → living NPC ownership transfer;
- arbitrary normal NPC recipient;
- stack/count items;
- concrete instance-backed items;
- capacity-safe atomic transfers;
- freshness preservation;
- instance identity preservation;
- weapons;
- persistent player-given ammunition;
- food;
- drink containers where current NPC behavior supports them;
- tools only where current NPC actions already have real tool/capability requirements;
- general reuse of `personalInventory`;
- interaction/UI for selecting the item and quantity/instance;
- normal NPC combat seeing transferred weapons;
- normal ranged combat correctly resolving persistent player-given ammunition;
- normal needs seeing transferred food/drink;
- narrow fixes where an already-tool-aware action still ignores real ownership;
- persistence through existing NPC inventory;
- transferred items participating in normal NPC death/corpse loot;
- useful diagnostics/inspection where existing NPC inventory/debug surfaces support it.

## Non-goals

- `CompanionInventory`;
- `CompanionEquipment`;
- player-owned NPCs;
- player-storage permissions;
- chest reserve rules;
- autonomous withdrawal from player storage;
- permanent equipment slot system;
- armor/worn-equipment system;
- ordering NPCs to immediately equip a specific item;
- forcing NPCs to use gifted items;
- unrestricted taking items back from living NPCs;
- trading/bartering redesign;
- theft/pickpocket mechanics;
- gifting/social relationship consequences;
- companion-specific combat;
- companion-specific hunger/provision system;
- moving normal work/logistics cargo from `NpcAgent.carried` into `personalInventory`;
- converting abstract profession work into physical tool workflows;
- party inventory UI;
- crafting/repair redesign;
- unrelated item-system refactor.

## Related plans

### `settlements-npcs-026` — NPC personal inventory and persistent belongings

Implemented foundation and historical dependency.

It established `NpcAuthoritativeState.personalInventory` as the persistent ownership boundary. This plan extends use of that existing owner rather than adding another inventory/equipment state.

### `npc-029` — NPC accompany/follow commitment

Not a hard dependency.

Transferred belongings remain useful during accompaniment, but Player→NPC transfer must work for an ordinary NPC regardless of accompany state.

Do not read `accompanyCommitment` to decide whether the recipient has an inventory.

### `npc-030` — Paid expedition escort

Related consumer.

Paid escorts may benefit from supplied gear/provisions, but the Work Contract must not own those items.

### `npc-031` — Voluntary expedition joining

Related consumer.

A voluntarily accompanying NPC uses exactly the same personal inventory as any other NPC.

### `npc-017` — Work Contracts food and drink

Reuse its established personal-provision behavior:

```text
personalInventory
→ normal hunger/thirst strategy
```

No expedition ration counter.

### `items-player-023` — Systemic item utility and food safety

Reuse catalog-driven item semantics. Do not create companion-specific item classifications.

### `items-player-024` — Inventory and item-use UX coherence

Reuse current inventory presentation, concrete-instance selection and quantity-selection UX where practical.

## Implementation order

1. Verify the current living-NPC interaction/dialogue seam suitable for a `Give item` action.
2. Add one application-layer Player→NPC transfer API over existing `inventoryTransfer` primitives.
3. Connect a minimal item-selection UI using current inventory presentation and quantity/instance selection.
4. Verify count transfer, freshness transfer and concrete instance transfer.
5. Verify NPC combat automatically sees transferred melee/ranged/defense equipment.
6. Review weapon resolution quality when multiple owned weapons exist; improve the general resolver only if current deterministic selection is unsuitable.
7. Generalize ranged ammunition resolution if required so persistent player-given ammo in `personalInventory` can be consumed by normal NPC ranged combat without copying it into `carried`.
8. Verify transferred food and filled liquid containers participate in existing personal need strategies.
9. Inspect only already-tool-aware NPC actions and connect transferable tools through existing capability/inventory rules where real ownership is currently ignored.
10. Verify reconstruction/save-load persistence with no new ownership schema.
11. Verify NPC death moves transferred personal belongings through the existing corpse-loot lifecycle.
12. Extend existing diagnostics/inspection only as needed.

Important architectural/public additions should receive concise JSDoc where useful for AI preflight discovery, including `@domain items-player`.

## Verification

### Automated — ownership transfer

Verify:

- count item transfers Player → NPC;
- selected quantity only is transferred;
- concrete instance identity is preserved;
- transfer fails atomically if player no longer owns the item;
- transfer fails atomically if NPC capacity is exceeded;
- player and NPC cannot simultaneously own the same transferred item.

### Automated — freshness and instance state

Verify:

- perishable food preserves freshness/provenance;
- weapon durability/sharpness survive transfer;
- filled liquid container preserves content/litres;
- save/load preserves the same state.

### Automated — normal NPC use

Verify:

```text
give weapon
→ normal combat resolver can see it
```

and:

```text
give food
→ NPC does not immediately consume it
→ later hunger decision may consume it
```

and equivalent current water/tool support.

### Automated — ranged ammunition

Verify:

```text
player gives arrows
→ arrows enter personalInventory
→ NPC ranged combat can resolve and consume them
→ consumed arrow disappears from personalInventory
```

Also verify existing hunter/transient `carried` ammunition still works and there is no duplicated ownership between the two sources.

### Automated — no equipment duplication

Verify no additional persistent NPC equipment copy is required.

If action-local selection is introduced, removing/transferring the underlying item must not leave an authoritative phantom equipped item.

### Automated — persistence

Verify:

```text
give item
→ settlement unload/reload
→ same NPC still owns item

give item
→ save/load
→ same NPC still owns same item/instance
```

No duplicate initial loadout must appear after reconstruction.

### Automated — death

Verify:

```text
player gives weapon
→ NPC dies while still owning it
→ existing corpse loot contains that real weapon instance
```

with no duplicate profession-generated copy.

### Automated — regressions

Verify:

- Work Contract coin payment still works;
- NPC initial loadout seeding remains once-only;
- ordinary NPC combat with original loadouts remains unchanged;
- existing hunter ammunition supply remains functional;
- personal food/water behavior remains unchanged without player transfer;
- `NpcAgent.carried` logistics semantics remain independent.

### Manual browser verification — User

AI does not perform browser verification.

User should verify at least:

1. Interact with an ordinary NPC and give one item.
2. Give part of a stack rather than the whole stack.
3. Give a concrete weapon instance and confirm the correct condition survives.
4. NPC with supplied weapon uses it when normal combat behavior chooses combat.
5. Give arrows to an NPC with a bow and verify normal ranged combat can consume those arrows.
6. Giving food does not cause immediate forced eating.
7. Hungry NPC later consumes suitable supplied food through normal behavior.
8. Give a filled water container and confirm normal thirst behavior can use it where supported.
9. NPC that cannot carry another item rejects transfer without item loss.
10. Save/load keeps transferred items.
11. Leaving/re-entering the settlement keeps transferred items.
12. NPC death exposes still-owned transferred items through normal corpse loot.
13. NPC does not need to be an active companion for any of the above.

## Completion criteria

The plan is complete when:

```text
ordinary player-owned item
→ explicit transfer
→ ordinary NPC personalInventory owns it
→ ownership survives reconstruction/save
→ ordinary NPC decisions/actions can use it where supported
→ no CompanionInventory
→ no CompanionEquipment
→ no forced item use
```

and the ownership boundaries remain:

```text
Inventory
    owns items

NpcAuthoritativeState.personalInventory
    owns NPC personal belongings

NPC decision/action
    decides when an owned item is useful

storage access policy
    remains a separate future concern
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**
