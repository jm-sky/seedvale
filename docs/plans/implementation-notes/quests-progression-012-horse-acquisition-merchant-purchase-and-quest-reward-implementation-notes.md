# Implementation Notes: Horse acquisition through merchant purchase and quest reward

**Plan:** `quests-progression-012-horse-acquisition-merchant-purchase-and-quest-reward.md`  
**Reviewed against:** current `main`, 2026-09-11

## Implemented (2026-09-10)

- `src/settlement/horseAcquisition.ts` — derived `getHorseAcquisitionState()`, `MERCHANT_HORSE_PRICE` (250), merchant horse id resolver.
- `src/items/trade.ts` — `settlePricedPurchase()` / `previewPricedPurchaseNetCoins()` for atomic world-entity purchases.
- `src/quests/quests.ts` — `buildHorseAcquisitionQuest()` (`wilki-u-kupca`, `destroy_spawn_point`, `horseRewardAnimalId` on `QuestDef`).
- `src/quests/QuestManager.ts` — transfer-before-commit outcome order, quest-state reservation, `onHorseRewardTargetDied()`.
- `src/app/inventoryWiring.ts` + `MerchantScreen.vue` — special horse offer outside `MERCHANT_STOCK`.
- `src/app/createApp.ts` — binds home merchant horse id, fauna transfer seam, death hook.

Bugfix (2026-09-11): `wilki-u-kupca` was rebound from `clear_wolf_den` onto the existing `destroy_spawn_point` objective. Pack-clear and permanent habitat destruction stay separate fauna-owned facts; `wilcza-jama` is unchanged.

Ownership transfer reuses `SettlementsManager.transferAnimalOwnership()` from fauna-020 — no parallel path.

## Existing merchant horse identity

The wagon horse is already a real livestock `AnimalAgent`. `spawnLivestock()` creates exactly one horse with deterministic id:

```text
merchant-horse-<settlementId>
```

and no `ownerHouseId`. It is persisted through the existing livestock registry and uses the same health/needs/death lifecycle as other livestock.

Use a small resolver in the settlement/fauna boundary to select the acquisition target and then retain its stable `animalId`; authored quest code should not reconstruct or parse the `merchant-horse-*` naming convention.

Do not create a second merchant horse, `ItemKind`, decorative horse or quest spawn.

## Do not persist a duplicate acquisition enum unless it proves necessary

The plan describes `available / reserved / transferred / unavailable`, but most of this state can be derived from existing authorities after `fauna-020`:

```text
transferred  = target ownership is player
reserved     = horse-reward quest is active / awaiting reward
unavailable  = target is dead/removed or cannot be resolved
available    = target exists, is alive, not player-owned and quest is not reserving it
```

Prefer one derived `getHorseAcquisitionState()` view over another persisted lifecycle store. Quest progress already persists; animal ownership/death must persist through `fauna-020`. This removes a four-way consistency problem across quest, merchant and fauna state.

If implementation discovers genuinely non-derivable state, persist only that missing fact rather than mirroring ownership/death/quest status.

## Merchant purchase: extend payment semantics, not `MERCHANT_STOCK`

Current merchant buying is `ItemKind`-only:

- catalog/prices: `src/items/tradeCatalog.ts`
- atomic mixed barter/coin settlement: `src/items/trade.ts::settleTransaction()`
- UI wiring: `src/app/inventoryWiring.ts`

Do not put the horse into `MERCHANT_PRICES`, `MERCHANT_STOCK` or the normal purchase basket.

The horse offer should be a separate world-entity offer in the existing merchant screen/dialogue, but it should reuse the **same barter/coin arithmetic**. Avoid duplicating `computeNetCoins()` semantics. Prefer extracting a narrow priced-purchase helper from `trade.ts` that can validate an explicit coin-equivalent price + player offer and commit an external acquisition action.

For atomicity, validate the whole payment first, then call the synchronous fauna transfer seam, and mutate the inventory only after transfer succeeds. A failed transfer must leave coins/items untouched. After successful transfer, the already-validated inventory mutation should be deterministic and immediate.

Keep the horse price declarative outside `ItemKind` pricing. Current ordinary goods peak around 160 coins while a new game starts with 10 coins, so treat the horse as a clearly higher-tier purchase and test the chosen value against actual income sources rather than silently reusing an item price.

## Quest acceptance should use quest state as the reservation

`QuestManager.handleGiverInteract()` currently transitions `offered → active` directly inside `offer.onAccept`. There is no separate acceptance-effect transaction.

If the offer is shown only while the target is currently `available`, use the transition to `active` as the reservation itself. The merchant offer must derive visibility from the same acquisition-state view, so an active horse-reward quest immediately suppresses purchase.

Do not add a second persisted `reserved` boolean beside quest state.

Before accepting, re-check that the target is still alive/transferable. If the current modal flow freezes world simulation while dialogue is open, this is mainly a defensive invariant; still keep the check at the domain boundary.

## Quest reward requires changing the current outcome application order

Current `QuestManager.applyOutcome()` does this:

```text
set terminal quest state
→ grant item rewards
→ apply consequences
```

That is safe for current item rewards, but **not** for a horse transfer that can fail because the animal died or became unavailable. Do not set the quest to `complete` and then attempt the transfer.

Add a narrow injected reward/effect seam for this authored case, or otherwise split outcome validation/commit so the horse transfer succeeds **before** terminal quest state and consequences are committed. Keep item rewards on the existing `grantItem` path.

Required semantic order for the horse outcome:

```text
validate reserved target
→ transfer same animal through fauna-020
→ only on success commit terminal outcome + consequences
```

If transfer fails because the target is dead/unavailable, resolve through an authored failed/unavailable outcome instead of resurrecting/replacing it.

Do not turn this into a generic scripting language.

## Wolf objective: `destroy_spawn_point`, not `clear_wolf_den`

`quests-progression-007` is implemented. Permanent habitat destruction is a real, source-owned spawn-point fact:

```text
state === 'disabled' && canRecover === false
```

observed by `Fauna.isQuestSpawnPointPermanentlyDestroyed()` and polled by `QuestManager.pollDestroySpawnPointObjectives()`.

`wilki-u-kupca` originally shipped bound to `clear_wolf_den`. That objective still means **the den's initial pack is dead** (`Fauna.isWolfDenCleared()` / `denWolfAnimalIds`) and is required by `wilcza-jama`. Binding the merchant quest to it left a gameplay hole: the player could `[E] Zniszcz` the den (permanent destruction) while the quest stayed `active`, because pack-clear and habitat-destroy are different world facts.

The quest now uses the existing generic objective:

```ts
{ type: 'destroy_spawn_point', spawnerId: WOLF_DEN_ID }
```

Do not:

- strengthen `clear_wolf_den` / `isWolfDenCleared()` to mean permanent destruction;
- add a quest-owned `wolfDenDestroyed` flag;
- change `wilcza-jama`.

`clear_wolf_den` and `destroy_spawn_point` remain two different observations of fauna-owned state.

Relevant files:

- `src/fauna/AnimalSpawner.ts`
- `src/fauna/createFauna.ts`
- `src/fauna/wolfDenScenario.ts`
- `src/app/createApp.ts`
- `src/quests/quests.ts`
- `src/quests/QuestManager.ts`
- `docs/plans/implementation-notes/quests-progression-007-wolves-approach-settlement-implementation-notes.md`

## Death / reload invariants

The merchant horse already uses deterministic livestock identity and tombstones. After `fauna-020`, the acquisition code should ask the fauna/settlement ownership boundary for current status rather than inspecting settlement arrays directly.

High-value tests beyond the plan list:

- source settlement unload cannot make a transferred horse appear `available` again;
- active horse-reward quest + dead/tombstoned target derives `unavailable` without another flag;
- merchant UI reopened after reservation/transfer derives fresh state, with no local cache/boolean;
- failed horse reward does not commit quest `complete`, relation or reputation consequences;
- purchase payment is not consumed if `transferAnimalOwnership` returns failure;
- both purchase and quest reward call the same fauna ownership-transfer seam.

## Suggested implementation order

1. Preflight the **implemented** `fauna-020` API and adapt to its actual names/contracts.
2. Add the derived acquisition-state resolver around the real merchant horse identity.
3. Extend merchant payment/UI with the special priced world-entity offer.
4. Add the authored wolf quest and acceptance reservation through quest state.
5. Make horse reward commit-safe before terminal quest outcome mutation.
6. Add persistence/reload tests across merchant horse source-slot reconciliation and quest progress.

No browser verification by the implementation agent; manual browser verification belongs to the user.
