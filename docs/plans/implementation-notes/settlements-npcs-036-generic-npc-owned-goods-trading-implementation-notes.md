# Implementation Notes: settlements-npcs-036 — Generic NPC-Owned Goods Trading

**Plan:** `docs/plans/settlements-npcs-036-generic-npc-owned-goods-trading.md`  
**Reviewed:** 2026-09-14  
**Status:** `planned` 📋  
**Source of truth:** current `main` code + docs.

## Dependency contract with settlements-npcs-033

Implement this only after `settlements-npcs-033` is complete. Do not recreate its planned architecture.

Expected seam from `033`:

- one shared ordinary-NPC/merchant trade surface;
- one social purchase-pricing path;
- one atomic transaction path for real external owners;
- one trade availability/reserve resolver or equivalent extension point;
- live revalidation on commit;
- NPC payment into `personalInventory`;
- Hunter `arrow` as the proven household-owned case.

Before editing, inspect the actual implemented API because names may differ from the plan/notes. If `033` narrowed explicit-owner transfer to stack-only arrows, extend that seam here rather than adding a parallel transaction helper.

## Authoritative owners

### Household goods

`src/settlement/household.ts`

`Household.items` is an unbounded `Inventory` owned by the household. It stores unrelated semantic classes together: concrete food, wood items, seeds, hunted outputs, production inputs and production outputs. Existing `Household.surplus(kind)` is only for household resource categories (`food`/`wood`), not arbitrary `ItemKind`.

Consequence: generic trade availability must not derive from `Household.items.count(kind) > 0` and must not repurpose `Household.surplus()` for arbitrary items.

### NPC belongings

`src/settlement/npcState.ts`

`NpcAuthoritativeState.personalInventory` is persistent and shared by live/reconstructed `NpcAgent`s. It is distinct from:

- `NpcAgent.carried` — transient work/logistics payload;
- `transportCargo` — authoritative cargo of an active transport order.

Only `personalInventory` is in scope for personal goods trading. Never merge these three ownership domains.

## Existing transfer primitives

`src/items/inventoryTransfer.ts`

Reuse:

- `transferInventoryCount(source, destination, kind, n, nowDays)` — capacity-preflighted stack transfer; preserves perishable freshness using `removeWithFreshness` / `addWithFreshness`;
- `transferInventoryInstance(source, destination, instanceId)` — transfers the existing instance and preserves id/state.

Do not use `createAcquiredInstance()` for NPC-owned stock. That helper is appropriate for catalog-like acquisition, not ownership transfer.

`src/app/actions/npcItemTransfer.ts` is useful precedent for stable-`npcId` re-resolution at commit and exact instance transfer into `personalInventory`.

## Payment precedent

`src/app/actions/workContractPayment.ts`

`payWorkContractAssignment()` already shows the correct pattern for real NPC money ownership:

- resolve current NPC state;
- validate player coin amount;
- validate NPC `personalInventory` capacity;
- use `transferInventoryCount()`;
- rollback if a later semantic commit fails.

The final `033` transaction helper should own trade atomicity. Reuse this ownership/capacity pattern rather than duplicating wage-payment code.

## Personal loadout protection

`src/ai/npcLoadout.ts`

Important symbols:

- `defaultWeaponForRole(role)`;
- `seedInitialPersonalBelongingsIfNeeded(...)`;
- `isNpcLoadoutBelonging(kind, role)`.

Every ordinary role gets at least a knife fallback; Hunter/Woodcutter have extra role-specific belongings and Shepherd has shears. Therefore category-based rules such as “tools/weapons in personalInventory are sellable” are unsafe.

Use `isNpcLoadoutBelonging(kind, role)` as a mandatory protection rule, not as the entire eligibility rule. Personal goods still need an explicit positive allowlist/policy.

## Household production outputs already present

`src/economy/production.ts` and `src/economy/npcWork.ts` currently create these concrete `Household.items` outputs:

- Hunter: `arrow` from branch/beam — handled by `033`;
- Textile Worker: `wool_material`, `linen_material`, `bandage`;
- Herbalist: `dressing`;
- Blacksmith: `iron_rod`.

These are the safest first expansion because they already have explicit production semantics and authoritative household ownership.

Do not expose their inputs as a side effect:

- `wool`;
- `flax`;
- `herb`;
- `branch` / `beam`;
- seeds.

Household food is also deliberately out of scope because it participates in household reserve/consumption semantics.

## Item metadata is insufficient for trade eligibility

`src/items/items.ts`

`ItemDef` currently exposes generic categories such as `resource`, `tool`, `utility`, `food`, `weapon`, `armor`, `knowledge`. Those categories describe gameplay/use, not ownership or willingness to sell.

Do not infer NPC trade eligibility from category.

There are story/identity items in the `ItemKind` union (`signet_ring`, `bandit_ledger`, `marked_valuable`, treasure-map/story artifacts). Because no universal “quest item” flag exists, a positive trade allowlist is safer than a growing denylist.

## tradeCatalog is valuation, not ownership policy

`src/items/tradeCatalog.ts`

`canSell(kind)` currently means whether the player can sell a kind to the merchant. It only excludes `shell` and `coin`; it does not express whether an NPC is willing/allowed to sell an owned item.

Do not reuse `canSell()` as the NPC eligibility gate.

Use the purchase-pricing helper delivered by `033` and existing `tradeValue()`/merchant valuation as the price basis. If one newly enabled output has a poor fallback value, update the single authoritative valuation layer rather than putting price constants in profession/trade-policy code.

## Recommended policy shape

Prefer one bounded policy module (likely the module introduced by `033`, e.g. `src/economy/npcTradeAvailability.ts`) with explicit owner source semantics rather than scattered `if (role === ...)` branches.

Conceptually the resolver needs enough context to answer:

```text
counterparty NPC
role
household owner (if any)
personalInventory
item kind / instance
nowDays
→ unavailable | available quantity/instances + owner source
```

Policy should support:

- `household` source with optional reserve resolver;
- `personal` source with mandatory personal-protection checks;
- deterministic enumeration/order;
- live recomputation at commit.

Do not persist policy results.

## Initial policy entries

Household source:

- `arrow` — owned by `033`, keep its Hunter reserve rule;
- `wool_material` — sellable output;
- `linen_material` — sellable output;
- `bandage` — sellable output;
- `dressing` — sellable output;
- `iron_rod` — sellable output.

For these new outputs, V1 reserve can be zero only where current code has no existing household self-consumption/reserve requirement. Re-check immediately before implementation in case later plans add such demand. If a real reserve/demand now exists, reuse it rather than preserving the zero assumption.

Personal source:

- implement the path and tests with explicit allowlisted kinds;
- reject loadout belongings, `coin`, story/identity items and anything not allowlisted;
- do not manufacture runtime personal stock merely to demonstrate the feature.

## UI integration

Do not add another Vue screen.

`src/app/inventoryWiring.ts` is currently merchant-centric (`MerchantPricing`, `activeMerchantPricing`, `buildSellPriceContext`, merchant sync functions). `033` is expected to generalize this. This plan should only extend the stock rows/counterparty source returned by that final shared seam.

Vue must receive plain offer/session data, not `Household`, `NpcStateRegistry` or production objects.

## Live revalidation details

Commit must fail without mutation when any of these changed since preview:

- NPC disappeared/died/became unavailable;
- household association changed or source owner cannot be resolved;
- quantity decreased;
- exact instance disappeared;
- item became protected due to role/loadout/reserve state;
- player funds/capacity changed;
- NPC coin capacity changed;
- social pricing context changed and the transaction no longer matches the committed quote semantics defined by `033`.

Do not reserve goods just because the trade screen is open.

## Files likely to change

Primary after `033` implementation:

- the trade availability/policy module introduced by `033`;
- `src/app/inventoryWiring.ts` or its generalized trade-session replacement;
- tests near the shared transaction/availability code.

Potential supporting changes:

- `src/items/tradeCatalog.ts` only for missing/incorrect nominal values;
- `src/items/trade.ts` only if the final `033` explicit-owner primitive lacks required instance-owner support;
- `src/ui-vue/store.ts` / shared trade screen only if stock-row types cannot represent owner-backed instances after `033`.

Read/reuse, avoid unrelated changes:

- `src/settlement/household.ts`;
- `src/settlement/npcState.ts`;
- `src/ai/npcLoadout.ts`;
- `src/economy/production.ts`;
- `src/economy/npcWork.ts`;
- `src/items/inventoryTransfer.ts`;
- `src/app/actions/npcItemTransfer.ts`;
- `src/app/actions/workContractPayment.ts`.

## Regression risks

1. **Selling tools NPC needs:** category-based exposure would allow role weapons/tools to disappear.
2. **Household starvation/production breakage:** exposing food/seeds/inputs can silently damage existing simulation loops.
3. **Quest/story leakage:** `ItemKind` has no universal quest-item eligibility flag.
4. **Instance reminting:** catalog acquisition helpers would destroy identity/state.
5. **Freshness reset:** future food trade must stay on `transferInventoryCount()`.
6. **Owner mixing:** `personalInventory`, `carried` and `transportCargo` must remain distinct.
7. **Policy drift:** future production output must not become tradeable automatically just because it exists in `Household.items`.
8. **033 duplication:** do not introduce a second session/pricing/transaction mechanism while extending stock coverage.

## Verification focus

Automated tests should prove policy safety more strongly than breadth. The important negative cases are: loadout, food reserve, production inputs, seeds, story goods and unrelated future items remain unavailable.

Manual browser verification is the user's responsibility. AI must not run browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
