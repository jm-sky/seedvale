# Implementation Notes: Player-to-NPC item transfer and equipment

Plan: `docs/plans/items-player-027-player-to-npc-item-transfer-and-equipment.md`

## Current code facts

- `Inventory` is already the shared ownership container. `NpcAuthoritativeState.personalInventory` is the authoritative NPC belongings store and the live `NpcAgent.personalInventory` references the same object. Do not add companion/gift/equipment inventory state.
- Resolve recipients through `SettlementsManager.getNpcState(npcId)`, not through a retained `NpcAgent`. This allows the mutation to target authoritative state across reconstruction/streaming boundaries.
- `src/items/inventoryTransfer.ts` is the canonical ownership seam:
  - `transferInventoryCount(source, destination, kind, n, nowDays)` preserves food freshness batches and is all-or-nothing;
  - `transferInventoryInstance(source, destination, instanceId)` preserves concrete instance identity/state and is all-or-nothing.
- `src/app/actions/workContractPayment.ts` is the closest existing Player → NPC mutation pattern: app-layer function, authoritative NPC-state lookup, semantic result, inventory transfer helper, no Vue-side mutation.
- Existing NPC dialogue actions are wired from `src/app/inventoryWiring.ts` through `vueUi.configureNpcDialogueMenu(...)`; `src/ui-vue/NpcDialogueMenu.vue` / `src/ui-vue/store.ts` are the current interaction surface. Prefer extending this flow rather than using legacy `createNpcDialog` or turning NPCs into container sessions.
- Inventory presentation helpers already exist in `src/items/inventoryView.ts`; reuse their grouping/instance data where possible instead of rebuilding item-label/grouping logic for the give-item UI.

## Important discrepancy: combat ownership is only partly migrated

The plan is directionally correct, but current `main` still has a split ranged path:

- melee weapon: `resolveNpcMeleeWeapon(this.personalInventory)`;
- ranged weapon: `resolveNpcRangedWeapon(this.personalInventory)`;
- defense: `resolveIncomingNpcDamage({ carried: this.personalInventory, ... })`;
- **ammo:** `resolveNpcAmmoKind(this.carried, rangedWeapon.ranged)`.

`src/ai/npcCombat.ts` also still names resolver parameters/comments `carried`, even though current callers use `personalInventory` for weapon/defense resolution.

For this plan, do not copy gifted arrows into transient `NpcAgent.carried`. Generalize the ranged-ammo lookup/consumption so personal ammunition can be used while preserving any existing hunter/work cargo path that intentionally owns arrows in `carried`. The resolver must report/retain the actual source inventory so firing removes exactly one arrow from the inventory that supplied it.

Do not introduce persistent NPC equipment slots to solve this split.

## App-layer transfer operation

Add one focused action module near `workContractPayment.ts` (for example `src/app/actions/npcItemTransfer.ts`). Keep mutation outside Vue.

Recommended dependency boundary:

- player `Inventory`;
- `getNpcState(npcId)`;
- current `nowDays` for stack/perishable transfer.

The operation should re-resolve by stable `NpcId` at commit time and return semantic statuses rather than booleans. At minimum distinguish recipient missing/dead, source item/instance missing, destination capacity failure and success.

Use `state.health.dead` for authoritative death rejection. Interaction-range/currently-streamed checks belong to the interaction/UI entry point; ownership transfer itself should not depend on a mesh reference.

For count-backed items pass the real simulation day into `transferInventoryCount`; using its default `0` would corrupt freshness semantics. For instance-backed items accept the concrete `instanceId`, not only `ItemKind`.

After success, route through the same player-inventory refresh path used by other inventory mutations (`onInventoryChanged` / HUD weight refresh as applicable). Do not manually maintain a second UI inventory snapshot.

## UI integration

Prefer adding a small `Give item` action to the existing NPC dialogue menu and opening a focused player-inventory picker/sheet. Keep it one-way: Player → NPC.

Reuse existing inventory grouping and quantity-selection conventions from the current inventory/container UI, but do not reuse `openTransfer`/container semantics: living NPC ownership is not a chest session and V1 must not expose arbitrary take-back.

The UI should submit either:

- `{ npcId, kind, amount }` for count-backed items, or
- `{ npcId, instanceId }` for instance-backed items.

Do not infer the recipient from display name or list index at commit time.

## Equipment/use behavior

No new equipment registry is justified by current code. Ownership stays in `personalInventory`; action systems derive usable gear when needed.

Do not expand this plan into a profession/tool rewrite. Only adjust an existing NPC action when it already claims to use real item ownership/capabilities but still reads the wrong inventory.

Weapon selection is currently deterministic by `ITEM_CATALOG` key order (`MELEE_CAPABLE_KINDS`, `RANGED_CAPABLE_KINDS`). Do not redesign it pre-emptively. If tests added for this plan demonstrate an obviously wrong choice between multiple owned weapons, fix the general resolver in `npcCombat.ts` using existing item stats; do not add player-assigned equipment state.

## Persistence and death caveat

No new save field is needed for the transfer itself: `personalInventory` already persists through `NpcStateSnapshot` / `SaveData.npcStates`.

However, the plan currently overstates corpse behavior. `src/settlement/npcPostDeath.ts::extractNpcLoadoutLoot()` still transfers only role-filtered loadout kinds and explicitly documents that full `personalInventory` handoff (including food freshness) remains a follow-up. Therefore **do not use corpse round-trip as proof that arbitrary gifted items are preserved on death**.

This plan should not silently broaden `npc-010` corpse persistence unless required by accepted scope. Add a regression test that establishes the current expected behavior for gifted combat gear, and leave non-loadout gifted belongings to the existing corpse-lifecycle follow-up unless the plan is intentionally amended.

## Tests worth adding

Prioritize narrow tests around boundaries that are easy to regress:

- count transfer preserves freshness and is atomic on NPC capacity failure;
- instance transfer preserves id + instance state;
- dead/missing NPC rejects without mutating either inventory;
- gifted melee/ranged weapon is visible to the existing combat resolver;
- gifted personal ammo can be fired and is removed from the correct owning inventory;
- existing `carried` hunter ammo path still works after ammo-source generalization;
- save/snapshot round-trip keeps transferred belongings.

Existing useful test areas: `src/items/inventoryTransfer.test.ts`, NPC combat tests, NPC-state serialization tests and `src/ui-vue/npcDialogueOpen.test.ts` for dialogue lifecycle.

## Main pitfalls

- Mutating `NpcAgent.carried` because it is convenient for combat/work code.
- Calling `transferInventoryCount(..., nowDays = 0)` for food.
- Representing instance-backed items as counts and losing durability/liquid state.
- Holding a transient `NpcAgent` as the authoritative recipient instead of resolving `NpcId` → `NpcAuthoritativeState` at commit.
- Letting Vue remove/add inventory items directly.
- Reusing container UI mutation semantics and accidentally enabling take-back from living NPCs.
- Assuming arbitrary gifted items currently reach corpse loot; current code does not guarantee that.
- Adding persistent equipment slots to compensate for the remaining ammo/carried split.
