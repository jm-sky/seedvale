# UX Review: Items, Inventory & Equipment

**Reviewed:** 2026-09-10  
**Model:** Cursor — Grok  
**Scope:** focused code recon/review; no implementation; no browser verification.  
**Recon:** [items-inventory-equipment-ux-recon.md](./items-inventory-equipment-ux-recon.md)  
**Related:** [interactions-targeting UX review](./2026-09-10--interactions-targeting-ux-review.md), planned polish in `items-player-022`.

## Executive summary

The item lifecycle already has the right owners: `Inventory` for ownership, `HeldTool` for the one in-hand slot, `ITEM_CATALOG` for capabilities/consumables/weapons, `inventoryView` for presentation, `inventoryTransfer` for moves, and `ContainerScreen` for chest/corpse transfers. Tool gates in gameplay code generally go through `hasItemCapability` / `Inventory.hasCapability` rather than `kind === 'shovel'`.

The main UX problem is not missing infrastructure. It is that **ownership, equipment and “what this item is for” are implemented more consistently than they are shown**. The player can own a packed tent that never appears in `[I]`, hold a tool that is a different concept from “primary weapon”, and fail world actions whose prompts never mentioned the requirement — or succeed inventory actions whose purpose is only a flavor paragraph.

No P0 blocker that makes the loop unplayable. The review found **7 P1**, **6 P2** and **4 P3** issues. Highest-value correction: make `inventoryView` cover every instance-backed kind, then surface catalog capabilities and held/bag policy through existing inventory, prompt and Quick Actions seams — not a new equipment system.

## Answers to the recon questions

| Question | From code |
| --- | --- |
| Does the player understand what they own and what is held/equipped? | Partially. Weight/size and a `w ręce:` line exist, but packed tents are absent from the inventory list, and held vs primary-weapon shortcut is two models. |
| Is it obvious what each item can be used for? | Weak. Merchant can filter by capability; inventory details show flavor text, melee/ranged numbers, consumable relief, books — not `capabilities`. |
| Are capability requirements communicated before failed attempts? | Inconsistent. Camp/well repair and Quick Actions fires use `CAPABILITY_NEED_LABEL` up front. Chop/dig/ore hide the action unless the tool is **held**. Water/campfire advertise fill/cook regardless of inventory. |
| Are pickup, loot and transfer flows efficient with many items? | No. One interactable per dropped unit; drop dumps the whole stack; container UI transfers whole stacks or one instance with no split. Already noted for grouping in `items-player-022`. |
| Are world actions and inventory actions consistent? | Same `consumeItem` for `[R]` on a world item and inventory “Zjedz”, which is good. Place/use is split: trap/chest have inventory buttons, tent/seeds/torch live in Quick Actions, chop/dig require the hand. |
| Does the implementation reuse `Inventory`, `HeldTool` and catalog capabilities? | Yes for gates. Presentation and a few copy paths still invent parallel wording (`[mixed usage]`, “Napełnij bukłak” for any liquid container, fuel toast that says “zapalić” on an already-lit fire). |

## P1 — confusing

### 1. Packed tents exist in `Inventory` but do not appear in the inventory screen

**UX problem:** After buying, packing, or otherwise acquiring a `tent`, the player can still pitch it from Quick Actions (`hasTent` uses `countInstances('tent')`), and it still contributes weight/size. Opening `[I]` does not list it. There is no way from the inventory UI to inspect tent condition, drop it, or place it the way traps/chests work.

**Why:** `tent` is in `INSTANCE_BACKED_KINDS`, but `buildInventoryGroups()` only builds groups for traps, weapon-maintenance kinds and liquid containers. Instance-backed kinds are then skipped in the count pass, so tents fall through both loops.

**Affected:** `src/items/inventoryView.ts`, `src/ui-vue/screens/InventoryScreenItemList.vue`, `src/items/itemInstances.ts`, pack path in `src/app/actions/restActions.ts`.

**Recommendation:** add a tent group builder (or a generic `0..100` condition group) next to `buildTrapGroup` / `buildWeaponGroup`. Do not invent a second tent inventory. Reuse the same instance rows the details pane already renders for traps/weapons.

### 2. “In the bag” vs “in the hand” is an unstated equipment rule

**UX problem:** The same capability sometimes means “own it”, sometimes “hold it”, sometimes “hold it or auto-equip if the hand is free”:

- Chop, rock-dig, ore, fishing, bury corpse: `hasItemCapability(heldTool, …)` — shovel in the bag does not show a dig target.
- Fire starting, sewing-kit tent repair, well work, terrain prep soil: `inventory.hasCapability(…)` — the tool may stay in the bag.
- Animal harvest: knife held **or** knife in bag with a free hand; `startHarvestMeat` auto-equips. Shovel bury does not.

The player cannot learn one rule for “I have the tool, why isn’t the action here?” vs “Potrzebujesz łopoty…” after pressing.

**Affected:** `src/app/interactables.ts`, `src/app/actions/groundActions.ts`, `src/app/actions/survivalActions.ts`, `src/app/actions/restActions.ts`, `src/app/userActions.ts`.

**Recommendation:** keep `HeldTool` as the single hand slot. Make the **policy** explicit in presentation, not a new slot system: if the action needs the hand and the capability is only in the bag, show the target with a disabled reason (`Weź {CAPABILITY_NEED_LABEL}` / `Weź łopatę`) instead of omitting it. Keep bag-only utilities (`sewing_kit`, `fire_starting` where already bag-gated) as bag checks. Align corpse bury with harvest’s auto-equip **or** require the hand for both.

### 3. Inventory never says what an item can do

**UX problem:** Details show category, weight, value, melee/ranged numbers, consumable `+N`, book skill gates, freshness. They never list `ITEM_CATALOG[kind].capabilities`. A sewing kit’s description mentions tent/bedroll repair; an axe’s description mentions chopping; a shovel’s does too — but that is prose, not the same labels the game uses in failure toasts (`narzędzia do rąbania`, `zestawu do szycia`). Merchant buy/offer **can** filter by those capabilities (`MerchantFilterBar` `CAPABILITY_LABEL`). The inventory the player uses to decide cannot.

Flavor fallback `To jest... ${item.label}.` still exists when `description` is missing.

**Affected:** `src/ui-vue/screens/InventoryScreenItemDetails.vue`, `src/ui-vue/screens/InventoryScreenItemList.vue`, `src/items/itemCatalog.ts`, `src/ui-vue/components/MerchantFilterBar.vue`.

**Recommendation:** render capabilities (and holdable / consumable / bait / container capacity) from the catalog on the details pane, using one shared Polish label table (lift `CAPABILITY_LABEL` out of the merchant filter). Do not duplicate purpose into a parallel “item lore” system.

### 4. Held tool and “primary weapon” are two equipment concepts

**UX problem:** `Weź` / `Odłóż` write `HeldTool` and the HUD `w ręce:` / `ui.hud.held` text. `Ustaw podstawową` writes `PrimaryWeaponSelection` and icon buttons on Quick Actions / touch chrome (no label on the button, only `aria-label`). Equipping from inventory is **kind-level**: `equip(kind)` resolves the first instance. Details can set a specific instance as primary melee/ranged, but cannot `Weź` that instance. Mixed-condition swords therefore look choosable and then put “whatever is first” in the hand unless the player uses the shortcut.

HUD held text has no caption (“w ręce” only inside the inventory header). Lit branch / `pochodnia (płonie)` overwrite the held label via `PlayerTorch`, which is correct physically but another name for the same slot.

**Affected:** `src/items/HeldTool.ts`, `src/items/primaryWeapons.ts`, `src/app/inventoryWiring.ts`, `src/ui-vue/screens/InventoryScreenItemDetails.vue`, `src/ui-vue/screens/HudScreen.vue`, `src/ui-vue/screens/QuickActionsScreen.vue`.

**Recommendation:** keep one hand (`HeldTool`). Treat primary melee/ranged as **shortcuts that call `equip`**, which they already do. Pass `instanceId` into `onEquip` from instance rows. Show the held name on HUD with a stable prefix, and show the shortcut buttons’ weapon name or a selected state when that kind is actually held.

### 5. Condition, fill and mixed stacks share one overloaded badge

**UX problem:** List rows show `[N%]`, `Stan N%`, or the English stub `[mixed usage]`. That percent means durability (traps/weapons), sharpness (second badge only in details), **fill level** (waterskins/buckets — comment in `inventoryView` admits this is “the closest existing UI concept”), or tent condition (once finding 1 is fixed). Players cannot tell a half-full waterskin from a damaged trap from a worn sword without opening details — and the list still uses the English mixed string.

**Affected:** `src/items/inventoryView.ts`, `src/ui-vue/screens/InventoryScreenItemList.vue`, `src/ui-vue/screens/InventoryScreenItemDetails.vue`.

**Recommendation:** keep one `InventoryGroupView`, but give presentation an explicit `meterKind: 'durability' | 'sharpness' | 'fill' | 'condition'`. Polish: `Stan`, `Ostrość`, `Napełnienie`, `Zużycie`. Replace `[mixed usage]` with `różne stany`.

### 6. Pickup is one object; drop is the whole stack; nearby identical drops fight for `[E]`

**UX problem:** `collect(id)` and each `kind: 'item'` candidate are one unit. Dropping 12× `branch` from inventory scatters 12 world items. Gaze then competes among them (and with other props) using the targeting rules already reviewed. There is no “podnieś wszystkie” / “podnieś stos”. World spawners and chunk items use the same one-prompt-per-node model.

`[R]` on a consumable pickup is a good reuse of `consumeItem`, but it **picks up first** (`canAdd` then consume). A full bag cannot eat food off the ground even though the net weight would be zero.

**Affected:** `src/items/createDroppedItems.ts`, `src/app/interactables.ts`, `src/app/gameLoop.ts`, `src/app/inventoryWiring.ts` (`dropItemStack`).

**Recommendation:** grouping nearby identical drops into one interaction candidate is already the intended smallest fix in `items-player-022` — do that, do not add a loot-vacuum manager. For drop, default to **one unit** (or an amount stepper) and keep “wyrzuć stos” as the explicit variant. For `[R]` eat, allow consume-from-world without a successful `canAdd` when the item is immediately consumed (net-zero), still using `consumeItem`.

### 7. Missing/unsuitable tools are communicated in three incompatible styles

**UX problem:** (overlaps the targeting review’s availability finding; restated here for the item loop)

- **Hidden:** no chop/dig/ore/fishing prompt unless the matching tool is held; tree stays `Obejrzyj drzewo`.
- **Optimistic:** water `[R] Napełnij bukłak` and campfire cook/fuel do not check inventory; failure is a toast (`Potrzebujesz pojemnika z wodą`, `Potrzebujesz przynęty`, `Potrzebujesz gałęzi lub belki, żeby je zapalić` — the last is also wrong copy on an already-lit fire).
- **Disabled with reason:** well work, camp repair, Quick Actions fires use `reasonLabel` / `CAPABILITY_NEED_LABEL` / `Brakuje: N× …`.

Ammo is closer to good: draw is refused with `Brak strzał w ekwipunku` **before** the draw, but the HUD never shows arrow count while a bow is held. After a successful shot, every fire toasts `Zostało N strzał`.

**Affected:** `src/app/interactables.ts`, `src/app/gameLoop.ts`, `src/app/actions/placementActions.ts`, `src/app/actions/gatheringActions.ts`, `src/ui-vue/playerQuickActions.ts`.

**Recommendation:** reuse the structured `{ enabled, reasonLabel }` pattern from FlavorDialog / well / camp repair for item-gated world prompts. Keep execution-time revalidation. Do not advertise fill/cook/fuel as if they will work. Show ammo on HUD next to held bow instead of per-shot remaining toasts.

## P2 — friction

### 8. Chest and corpse transfers are the same screen with chest vocabulary and all-or-nothing stacks

`ContainerScreen` columns are hard-coded `W skrzyni` / `U gracza` even when the header is `Zwłoki: {name}`. Deposit buttons still render on a corpse; pressing them toasts `Nie możesz zostawiać przedmiotów przy zwłokach.` Count items move the **entire** stack in one click; instance items get one `Zabierz`/`Włóż` per instance (five worn swords = five buttons). No split, no “zabierz wszystko”.

World-generated chests cannot be picked up (good); player chests can (`[R] Podnieś skrzynię`) and contents travel with the entry, not through player inventory (good, but easy to miss).

Household / settlement storage is **inspect-only** (`Zbadaj: Magazyn domowy/osady`), not a transfer. “Magazyn” in the world does not mean the same action as “skrzynia”.

**Affected:** `src/ui-vue/screens/ContainerScreen.vue`, `src/app/actions/containerActions.ts`.

**Recommendation:** parameterize column titles from the open session (`W skrzyni` vs `Przy zwłokach`). Hide deposit on loot-only sessions. Add stack split / “all” using existing `transferInventoryCount` / deposit-withdraw amount arguments (the handlers already take `count`). Do not merge settlement economy into player `Inventory`.

### 9. List actions ignore freshness and book/injury state the details already know

List shows `Zjedz` for perishable food with no freshness badge. Spoiled food still offers the button; `consumeItem` then toasts `To jedzenie się zepsuło.` Books always show `Czytaj`; details already compute `too_low` / `known`. Empty waterskins still offer `Wypij` until the toast `Bukłak jest pusty.`

**Affected:** `src/ui-vue/screens/InventoryScreenItemList.vue`, `src/app/actions/survivalActions.ts`.

**Recommendation:** pass `freshnessStage` (already on `InventoryGroupView`) onto the list row. Disable consume/read with the same reason strings `consumeItem` / `readBook` already produce. No second consumable ruleset.

### 10. Inventory contextual actions and world/Quick Actions do not cover the same items

Inventory list/details: consume, read, place trap, place chest, Weź/Odłóż, primary weapon, drop, sharpen/sell when merchant is open.  
**Not** in inventory: pitch tent, light torch/branch, plant seeds, build fire, place bedroll/platform (if carried as world objects rather than items). Those live in Quick Actions. A player who just bought a chest sees `Postaw`; a player who just bought a tent (once visible) still has to know Quick Actions.

World `[R]` eat matches inventory consume (good). World chop does not match any inventory “use axe on tree” — the axe must be held, which is fine if finding 2 is explained.

**Recommendation:** for placeable **items** (`tent`, `chest`, trap, maybe `wooden_torch`), keep one inventory verb that calls the existing placement/QA handler. Do not duplicate placement pipelines.

### 11. Construction can spend nearby ground piles, but the UI talks only about the bag

`constructionMaterials.ts` may consume dropped `branch`/`beam`/`stone` within 3 m. Work dialogs say `Brakuje: N× belka` as if only inventory counts. Nearby materials can make an action succeed when the bag looks empty, or fail when the player is looking at a pile outside radius.

**Affected:** `src/items/constructionMaterials.ts`, `src/app/actions/placementActions.ts`.

**Recommendation:** when quoting missing materials, mention that ground piles in reach also count (one clause). Do not add a second material inventory.

### 12. Ranged/melee feedback is richer in combat than in the bag

Details show damage/range/speed. They do not show stamina cost, ammo kinds, or that a miss drops a recoverable arrow. HUD held line does not show ammo. Primary shortcut buttons are icons only.

**Recommendation:** on ranged details, list `ammoKinds` and current counts from `ui.inventory.counts`. Optional HUD suffix `łuk myśliwski · 14 strzał` using existing counts. Keep projectile drop-on-miss as-is (already reuses `DroppedItems`).

### 13. Copy and vocabulary drift around water, fuel and mixed items

- Shore/well prompt says `Napełnij bukłak` while buckets also fill through `fillWaterskin`.
- Lit campfire fuel failure: `Potrzebujesz gałęzi lub belki, żeby je zapalić` while `[E]` is `Dołóż gałąź`.
- `[mixed usage]` is English in an otherwise Polish UI.
- `Weź` / `Odłóż` / `Ustaw podstawową` / `w ręce` / HUD icon shortcuts name overlapping states.

**Recommendation:** one water-container verb (`Napełnij pojemnik`, already used on some well dialogs). Fix the fuel toast to `dołożyć`. Align held vocabulary with finding 4.

## P3 — polish

### 14. Details image is always empty

`imageUrl` is hardcoded `null`; the pane shows a category lucide icon. Ground/hand already have meshes/GLBs for many kinds. Not a logic bug; it makes every item look like a placeholder.

### 15. Legacy waterskin rows still carry internal migration copy

`waterskin_empty` / `waterskin_full` descriptions say they migrate to `waterskin_medium`. Fine for code comments; if a legacy stack ever surfaces in UI, the player sees implementation notes.

### 16. Per-shot `Zostało N strzał` toast competes with hit/miss toasts

Useful once; noisy every shot. Prefer HUD ammo (finding 7/12).

### 17. Fishing while a rod is held silently replaces drink/fill

Documented in `interactables.ts` as the two-key tradeoff. The prompt switches to `[E] Łów rybę · [R] Zanęć` with no hint that drinking requires `Odłóż`. Acceptable if finding 2’s held policy is taught; otherwise a one-line HUD/prompt note is enough.

## Architecture findings

### Good seams to preserve

- `Inventory` owns counts, instances, food batches, weight/size; player and NPC share it.
- `HeldTool` is one right-hand slot, not a paper-doll. `PlayerTorch` correctly occupies that hand.
- `ITEM_CATALOG[].capabilities` + `hasItemCapability` / `hasCapability` / `CAPABILITY_NEED_LABEL` is the right requirement mechanism. Remaining `kind === 'knife'` hits in `items.ts` are mesh/presentation, not gates.
- `inventoryView.buildInventoryGroups` is the correct presentation seam — it is just incomplete for `tent`.
- `inventoryTransfer` is the right move primitive; container/corpse/NPC wage paths should keep calling it (or the existing container deposit/withdraw that already mirrors it).
- World `[R]` consume and inventory consume share `survivalActions.consumeItem`.
- Merchant capability filters already speak the catalog’s language.
- Construction material resolver already treats nearby drops as the same kinds as the bag.
- Primary weapon shortcuts already `equip()`; they are not a second combat loadout.

### Structural debt (presentation, not a new domain)

The missing layer is an **item presentation/query** over the catalog + live `Inventory`/`HeldTool`, analogous to the interaction view proposed in the targeting review:

```ts
type ItemUseView = {
  verb: string
  enabled: boolean
  reasonLabel?: string
}
```

Inventory buttons, Quick Actions fire rows, and world prompts should read the same catalog flags (`holdable`, `consumable`, `capabilities`, `book`, trap/chest placement). Vue should not switch on kind except where a dedicated widget already exists (sharpen, liquid fill).

Do **not** add an `EquipmentManager`, extra worn slots, or a second capability table. Backpack-as-carried-capacity is the correct model; it only needs the details pane to repeat `+N kg udźwigu` from `carryCapacityBonus`.

### Held vs bag — recommended policy

| Capability / action | Check | Player-facing |
| --- | --- | --- |
| Chop, dig, mine, fish, melee/ranged | held | Prompt exists always when relevant; disabled + `Weź …` if only in bag |
| Fire starting, textile repair, well/garden work already bag-gated | bag | Keep bag; show `Potrzebujesz {CAPABILITY_NEED_LABEL}` before start |
| Harvest meat | bag + auto-equip if free hand | Already implemented; use as the template if bury should match |
| Consumable / book / bait | bag | Inventory + world `[R]` |

## Recommended implementation order

1. Fix `buildInventoryGroups` for tents (and any future `0..100` instance kinds). This is a hole in “what do I own?”.
2. Shared capability/condition labels in inventory details + list badges (`Stan` / `Napełnienie` / `różne stany`). Lift merchant `CAPABILITY_LABEL`.
3. Pass `instanceId` into `Weź`; show held vs primary shortcut as one hand + two shortcuts.
4. World item-gated prompts: disabled reason instead of hide/optimistic, using existing `reasonLabel` / `CAPABILITY_NEED_LABEL`.
5. Pickup grouping + drop-one default (`items-player-022`); `[R]` eat without a full-bag `canAdd`.
6. Container/corpse column titles, hide deposit on loot, stack split/all.
7. List freshness / empty container / book state on the same buttons details already explain.
8. HUD ammo + held prefix; drop per-shot remaining toast.

## Manual verification scenarios

Browser verification was not done in this recon. After any implementation pass, high-value checks:

- Buy a tent from Kupiec, open `[I]`, pack a placed tent, confirm it lists with condition and can be dropped/pitched.
- Two swords with different sharpness: `Weź` a specific one; confirm HUD and primary shortcut.
- Shovel in bag, not held: look at soil and a corpse — is bury/dig visible and explained?
- Axe in bag vs held at a mature tree; fishing rod held vs in bag at a shore; sewing kit in bag at a damaged tent.
- Drop 8× gałąź, try to pick up the pile; drop 1 vs whole stack.
- Full inventory, `[R]` on a tomato on the ground.
- Chest: move 20× kamień without dumping all if split exists; corpse: no deposit; leftover loot.
- Waterskin 40% full vs worn trap vs mixed weapons in the list.
- Bow held, 0 arrows, then 1 arrow — prompt/HUD vs toast.
- Spoiled meat: list vs details vs `Zjedz`.
- Fill with a bucket at a lake (prompt currently says bukłak).

## Conclusion

Seedvale does not need a new inventory or equipment system. `Inventory`, `HeldTool` and `ITEM_CATALOG.capabilities` already answer ownership, the hand, and “can this do X?”. The player-facing loop fails when presentation **omits an owner** (tents), **overloads a badge** (percent), **splits equipment into Weź vs primary**, and **teaches three different rules** for missing tools. Fix those on the existing view/prompt/transfer seams. Pickup stacking belongs with `items-player-022`; targeting overlaps belong with the interactions review — do not solve them with a parallel loot or equipment manager.
