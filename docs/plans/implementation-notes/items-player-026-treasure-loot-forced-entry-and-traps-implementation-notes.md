# Implementation Notes: Treasure loot, forced entry and traps

Plan: `items-player-026-treasure-loot-forced-entry-and-traps.md`

## Dependency status

`world-024-systemic-treasure-sites-and-keys.md` is implemented (`verification needed`). Systemic chests use stable `world-container:${siteId}` ids on `WorldGeneratedContainers`, lock mutations live in `unlockedTreasureContainerIds`, and `treasureSites.ts` reconstructs site/key identity from seed. This plan consumes those contracts; it does not invent a parallel chest/lock layer.

The existing authored dark-forest treasure (`worldBundle.ts` + `world/locations/darkForestTreasureSite.ts`) remains a separate quest chest with its own `ruby` + coin payload.

## Existing systems to reuse

### Container contents

`src/world/createPlacedContainers.ts` is the current authority for placed chest contents:

- `PlacedContainerEntry.contents` is the live `Inventory`;
- `nodes()` serializes counts, instances and food batches;
- `deposit*` / `withdraw*` mutate that same inventory;
- rebuild recreates meshes from records without recreating contents.

Do not create treasure-owned loot state once a systemic chest has been materialized. Initial deterministic loot should be injected when the `world-024` chest record is first created/materialized; afterward the container `Inventory` is authoritative.

Important: ordinary player-placed container IDs currently use `Date.now()`. Systemic treasure must use the stable ID supplied by `world-024`; do not route systemic creation through `PlacedContainers.place()` if that would replace the stable ID.

### Items and gems

`ItemKind` is still a closed string union in `src/items/items.ts`; `ruby` is a normal count-based item and is already used by authored treasure. Add the six sized ruby/diamond kinds as ordinary `ItemKind`s unless code changes before implementation provide a reusable variant seam.

Keep legacy `ruby` intact. Existing authored content/tests explicitly read `ruby`, including `darkForestTreasureSite.ts`; do not silently reinterpret or migrate it as part of this plan.

Prices/value, holdability, capabilities and other gameplay metadata belong in `src/items/itemCatalog.ts`; inventory weight/size/basic presentation remains in the existing item definitions. Gem value should therefore enter the same merchant/economy value path as other items, not a treasure-specific valuation table exposed to trade code.

### Tool gating

`ITEM_CATALOG[kind].capabilities` + `hasItemCapability()` / `Inventory.hasCapability()` are the canonical tool-requirement seams. Do not add `kind === 'axe'` / `kind === 'pickaxe'` checks in treasure code.

Before adding a new capability, verify whether an existing capability semantically fits forced entry. If none does, a generic physical capability such as prying/striking is acceptable only if it describes reusable item utility beyond treasure; then declare it on appropriate existing tools in `ITEM_CATALOG` and extend capability tests. Do not add a treasure-only capability name.

For a force action, prefer checking the held tool (`hasItemCapability(heldTool.held(), ...)`) when the fiction requires the tool in hand. This matches current dig/chop/mining interaction gates better than an inventory-wide check.

### Timed action / commit boundary

`src/app/busyAction.ts` already provides the correct cancellation boundary:

- `start(..., onComplete)`;
- `cancel()` never calls `onComplete`;
- stamina/vigor costs are optional per-second channel costs.

Use `onComplete` as the forced-entry commit point. Capture only stable gameplay inputs needed for the attempt when starting or completing the action, then resolve the committed attempt exactly once. Cancellation before completion must not advance `attemptIndex`.

Do not put deterministic outcome logic inside `BusyAction`; it deliberately remains domain-agnostic.

If force duration should depend on player Strength, reuse `src/player/physicalWorkStrength.ts` at the action call-site rather than modifying `BusyAction`.

### Player damage

Blade-trap HP loss must call `applyPlayerDamage()` from `src/player/playerDamage.ts`; do not edit `player.health.currentHp` directly.

For a chest trap there is normally no external attacker position, so treat it as environmental damage unless the implementation deliberately models a defensible directional strike. Supplying no attacker position currently means no directional block arc, while still preserving the shared downed/blood-hit lifecycle.

## Recommended ownership split

Keep deterministic immutable configuration separate from mutable consequences:

- `world-024`: site/chest identity, lock/key ownership, stable chest placement;
- `items-player-026` pure helpers: loot profile resolution, force-result resolution, trap configuration/resolution, vulnerable-content selection;
- placed container `Inventory`: actual surviving contents;
- thin `world-024`/world-side mutation record keyed by stable `containerId`: only state not represented elsewhere (`attemptIndex`, forced-open, trap one-shot state, damaged/destroyed if required).

Do not create `TreasureLootManager` / `TreasureTrapManager`; this work is event-driven and has no tick lifecycle.

## Determinism

Use a local deterministic hash/RNG derived from stable inputs. Do not consume mutable/global RNG (`Math.random()` or a shared advancing RNG) for loot, mechanical outcome, trap type or destruction selection.

Recommended conceptual seeds:

```text
loot:       worldSeed + treasureSiteId/containerId + "loot"
trap config:worldSeed + treasureSiteId/containerId + "trap"
attempt:    containerId + attemptIndex + relevant capability snapshot
```

Use explicit salt strings so later additions do not perturb previous rolls by changing call order.

`attemptIndex` must advance in the same synchronous mutation that applies the outcome. There is no transaction layer in current runtime persistence, so avoid a two-step "increment now, consequences later" flow that can be observed by an intervening save/rebuild.

## Loot materialization

Generate initial loot only when the systemic chest has no persisted/materialized container record yet. Do not infer "uninitialized" from an empty inventory: an emptied chest is a valid persistent state.

`world-024` should therefore expose/retain a distinction between "deterministic definition not yet materialized" and "materialized record whose contents may now be empty". If its final implementation already guarantees record creation at world setup, inject loot at that creation seam and nowhere else.

The existing authored treasure uses `initialCounts`; reuse the pattern, not its fixed ruby/coin payload or quest-specific depleted check.

## Contents damage

Do not add durability/condition to all `ItemInstance`s.

If loot-damage classification is needed, add the smallest reusable physical metadata seam on item catalog/definitions (for example resilient / fragile / flammable) only if at least the treasure resolution genuinely consumes it generically. Keep coins and all gemstones explicitly resilient through that shared metadata/default policy, not repeated item-name checks in each trap resolver.

Apply destruction by mutating the existing container `Inventory` once. Deterministically choose losses from the pre-resolution contents snapshot; never reroll per `withdraw()` call or UI open.

## Destroyed chest / surviving valuables

Current `PlacedContainers` has no destroyed-container/remains lifecycle and no generic "drop entire Inventory to ground" API visible in the current container implementation. Do not fake one with an abstract reward balance.

Prefer the smallest extension after `world-024` is implemented:

1. if it introduces/remaps a persistent container-remains state, reuse it;
2. otherwise keep a destroyed systemic chest as a persistent non-lockable remains/container entry that still owns the surviving `Inventory`, with changed interaction/presentation;
3. only build a reusable world-item drop path if an actual generic mechanism exists by implementation time.

This is safer than deleting the chest record and then needing a second ownership system for surviving coins/gems.

Player-placed ordinary chests must not inherit destruction semantics unless the abstraction is genuinely generic and required.

## Interaction integration

Integrate forced entry into the same contextual interaction/action contract used by current interactables; do not add a treasure modal or separate input mode.

The final `world-024` lock API should remain the authority for whether a chest is locked/unlocked. A successful force result should mutate that same lock state (or its explicitly exposed forced-open equivalent), then fall through to normal container interaction.

Revalidate at BusyAction completion that the same stable chest still exists and is still forceable before applying the attempt. Do not commit against a stale mesh/object reference across a world rebuild.

## Persistence

Persist only mutation state that cannot be reconstructed:

- `attemptIndex`;
- trap triggered/resolved one-shot state;
- forced-open / damaged / destroyed state if not already represented by the lock/container record;
- actual container inventory through existing `PlacedContainerRecord` serialization.

Do not persist generated loot tables or trap definitions if they are stable functions of seed + site identity.

Any new save fields must follow the current `SaveData` parse/migration/default conventions. Missing fields in older saves should normalize to the untouched/unattempted state; do not require migration of legacy authored `ruby` treasure.

## Useful implementation order

1. Wait for / recon implemented `world-024` contracts and its implementation notes.
2. Add gem kinds + catalog/value metadata and tests.
3. Add pure deterministic loot/trap/force-resolution helpers with tests.
4. Wire initial loot into systemic chest materialization.
5. Extend thin persistent treasure-chest mutation state with `attemptIndex` and trap/damage flags.
6. Add contextual Force Open action using held capability + `BusyAction` completion as commit.
7. Route blade damage through `applyPlayerDamage()` and apply deterministic contents damage.
8. Add destroyed/remains semantics only if an actual force/fire outcome requires them.

## Tests worth keeping focused

Beyond the plan's cases, explicitly cover these architecture regressions:

- an empty-but-materialized chest never regenerates deterministic loot;
- cancelling `BusyAction` leaves `attemptIndex` unchanged;
- completion increments/consumes exactly one attempt and cannot apply consequences twice;
- outcome is invariant to unrelated RNG calls and interaction order;
- legacy authored `ruby` treasure remains valid;
- systemic stable container ID survives rebuild and is not replaced by `PlacedContainers.place()` ID generation;
- player-placed normal chests remain unaffected by lock/trap/destruction state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
