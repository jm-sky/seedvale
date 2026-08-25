# Implementation Notes: NPC professions — complete profession work integration

**Plan:** `settlements-npcs-002-npc-professions-complete-profession-work-integration.md`
**Reviewed:** 2026-08-25
**Status:** `implementation guidance`

## 1. Review result

Plan is directionally correct, but several parts describe the pre-178/131 state. **Code is the source of truth.** Do not reimplement systems that already exist.

The main correction is scope:

- `woodcutter` already has real tree harvesting + carry/deposit integration.
- `hunter` already has real hunting/combat/harvest/household-item integration from plan 178.
- `miner` already has real `ResourceDeposits` extraction through `SettlementMiningHooks`, NPC `Inventory`, and settlement-level ore stock.
- `Role`, schedules and workplace dispatch already exist for all of those roles.
- The missing profession work is primarily **farmer, fisher, guard, trader and blacksmith**, plus whatever small shared dispatch/workplace changes are required to integrate them cleanly.

Do not spend implementation time migrating Woodcutter/Hunter/Miner unless the new common mechanism genuinely replaces an existing duplicated path without behavioural change.

## 2. Existing architecture to extend

Use these seams rather than adding profession-specific managers:

| Responsibility | Existing owner |
|---|---|
| role identity/generation | `src/ai/characters.ts` |
| daily role schedule | `src/ai/schedule.ts` |
| NPC decision/role integration | `src/ai/NpcAgent.ts`, `Needs.ts`, `decisionModifiers.ts`, `npcStrategies.ts` |
| executable work | `NpcAgent` + `PlannedAction` / `ActionLifecycle` in `src/simulation/` |
| movement/failure handling | `NpcAgent` + `npcMovementWatchdog.ts` |
| physical places | `src/settlement/places.ts` + `SettlementLandmarks` |
| household stock/items | `src/settlement/household.ts` |
| settlement stock | `src/economy/` |
| generic item ownership | `src/items/Inventory.ts` |
| tool requirements | `src/items/itemCatalog.ts` capabilities (`plan 184`) |
| weapon maintenance | `src/items/weaponMaintenance.ts` |
| farming/crops | `src/world/cropLifecycle.ts`, existing planting/garden paths |
| NPC food-source access | `src/world/foodSources.ts` / `SettlementFoodSourceHooks` |
| fishing | `src/world/fishing.ts` + existing player gathering action |
| mining | `src/terrain/resourceDeposits.ts` + `SettlementMiningHooks` |
| NPC hunting | `src/fauna/huntingHooks.ts` + existing Hunter path |
| combat/threat response | `src/combat/`, `src/ai/npcCombat.ts`, `npcAnimalThreat.ts` |
| trade | existing `src/items/trade.ts` / `tradeCatalog.ts` and settlement economy |
| world wiring | `src/app/worldBundle.ts` |

`WorldBundle` already forwards mining, food-source and hunting hooks into every settlement/NPC. New domain hooks should follow this pattern if direct manager access would create coupling.

## 3. Role/schedule state is partly already complete

Current `Role` is:

```ts
'woodcutter' | 'farmer' | 'guard' | 'trader' | 'miner' | 'fisher' | 'hunter'
```

So only `blacksmith` is a new role in this plan.

`SCHEDULE_TEMPLATES` already contains all seven existing roles. Add Blacksmith there rather than introducing a scheduler. `work` is the existing entry point; `NpcAgent.choose()` resolves scheduled work only after need arbitration.

`workplaceFor()` already maps existing roles to landmarks. It currently treats `miner` as the stockpile anchor, although real mining uses `SettlementMiningHooks`, and Hunter uses the well as an idle/stand anchor. Preserve this distinction: a workplace anchor is not necessarily the actual work target.

Adding `blacksmith` requires updating every exhaustive `Role` consumer, not only `characters.ts` and `schedule.ts`.

## 4. Profession work dispatch

Inspect the current `NpcAgent.beginIdle()` / work path before refactoring. The class already owns the `goTo → execute → onComplete` adapter over `PlannedAction`.

The goal of this plan should be a **small role-work dispatch seam**, only if the current method has become unwieldy. A reasonable shape is:

```text
scheduled work
  → resolve role work
  → PlannedAction | null
  → existing goTo/execute lifecycle
```

Do not introduce `ProfessionAI`, `ProfessionScheduler`, a second FSM, or a registry containing duplicated NPC state.

Prefer small pure resolver/helper functions for target selection where that reduces `NpcAgent` complexity. Keep authoritative mutations in the existing world/economy domain modules.

## 5. Farmer — biggest integration risk

Do not assume `SettlementFoodSourceHooks` is a complete farming API. `src/world/foodSources.ts` currently provides **harvestable food discovery/harvest** for NPC hunger, including crops, but it is not a general farmer work API.

Farmer work needs three different operations:

```text
dry crop → water
ready crop → harvest
empty/plantable → plant
```

Before adding any Farmer action, inspect the current crop placement/lifecycle and the existing player planting/watering action paths. Reuse their domain mutation functions; extract a small generic operation only when the player path is currently too UI-coupled.

Important:

- do not duplicate crop growth/hydration state in `NpcAgent`;
- do not create `NpcFarmManager` or `NpcCropState`;
- target selection must revalidate the crop before mutation;
- harvest must use the same crop yield rules as player/world harvest;
- watering must use the existing water-source/household logistics contracts rather than silently increasing hydration;
- planting must use existing seed/item definitions and crop lifecycle rather than minting crops directly.

`PlayerGarden`/cultivation maintenance is a separate player-built-garden concept. Do not accidentally make settlement fields depend on `PlayerGardens`.

## 6. Fisher — reuse the existing deterministic fishing rule

`src/world/fishing.ts` already owns the actual fishing rule:

- `fishingSpotId()`;
- deterministic `(spot, attempt)` roll;
- catch chance/bait bonus;
- `fish` as a normal `ItemKind`;
- persistent spot bait state.

`src/app/actions/gatheringActions.ts` currently wraps this for the player and is UI/busy-channel oriented. NPC work must **not call player action code** merely to reuse the rule.

Extract/reuse the smallest domain operation needed for NPCs, e.g. a generic deterministic fishing attempt returning success/yield, while leaving player busy/toast/skill handling in the player layer.

The NPC needs a valid water/fishing location. `workplaceFor()` currently uses `landmarks.dock` when available, otherwise the well; the fallback to a well is not a valid fishing target. Do not let a Fisher silently "fish at the well". Either provide a real fishing target query based on the existing water geometry/spot convention or return a clean no-work fallback.

NPC fishing should add `fish` to the existing NPC `Inventory`, then use the normal delivery path to household/settlement stock. Do not invent a fish stock or fishing population simulation.

## 7. Miner — already implemented; treat as reference implementation

Current code already has the intended pattern:

```text
miner work
 → SettlementMiningHooks.queryNearest/mine
 → NPC Inventory
 → goTo stockpile
 → settlement economy
```

`ResourceDeposits` is also wired around settlement interest regions so NPC mining can work without the player being nearby.

Do not implement another mining query/action. If the common profession-work dispatch is introduced, adapt the existing `beginOreGathering` path to it with minimal change.

Ore belongs to settlement-level economy (`iron`/`coal`/`gold`), not `Household.stock`. This is an important ownership boundary established by plan 131.

## 8. Guard — use existing threat/combat systems

Guard should not get a new combat AI.

Existing pieces already include:

- NPC combat lifecycle and loadouts;
- animal threat sensing/response;
- shared melee/ranged combat;
- night-watch schedule;
- movement watchdog.

The missing part is meaningful **patrol/observation while idle during work**.

For v1, use deterministic patrol points derived from existing settlement places/landmarks. Avoid introducing persistent patrol-route objects. A small cyclic or seeded selection of existing points is enough.

When a threat is detected, transition into the existing threat/combat response path. Do not bypass `CombatIntent` or create `GuardCombatAI`.

Do not confuse the Guard's workplace anchor (`landmarks.well`) with a complete patrol route.

## 9. Trader — existing trade is largely player-facing

The plan's biggest risk is assuming that the current merchant system already supports NPC-to-NPC/economy trade.

Audit `src/items/trade.ts`, `tradeCatalog.ts`, merchant screen wiring and settlement economy before implementing Trader work.

The existing `MerchantScreen` is a player-facing presentation. Do not invoke it or UI code from NPC simulation.

If the current trade logic only answers "player buys/sells to merchant", extract the smallest **domain-level transaction primitive** needed by both sides. It should operate on authoritative settlement/household state, not UI state.

For v1, a Trader can have an economic effect without simulating a global market. Prefer something bounded and local, for example:

```text
settlement shortage/surplus
 → trader transfers eligible goods between settlement-owned stocks
 → settlement state changes
```

Do not create `TraderInventory`, `TraderMarket`, `GlobalMarketManager` or fake transactions that merely animate the NPC.

Also keep the distinction between `Household.items` (discrete item instances/stacks) and `SettlementEconomy` scalar stock. Extend generic trade only if item-aware trade is actually required by the selected v1 behaviour.

## 10. Blacksmith — use existing weapon-maintenance API

`src/items/weaponMaintenance.ts` is already the authoritative maintenance domain operation. `sharpenWeapon(inventory, instanceId, 'whetstone')`:

- validates a weapon instance;
- checks current sharpness;
- requires/consumes a `whetstone`;
- updates the exact `Inventory` instance;
- uses the central maintenance profile.

Do not reproduce sharpening math or durability mutation in `NpcAgent`.

Important implementation detail: maintenance is **instance-based**, not `ItemKind` count-based. The Blacksmith must inspect the relevant NPC/household inventories for `WeaponItemInstance`s requiring maintenance. Do not turn weapon instances back into scalar stock.

Before adding the work action, inspect how `whetstone` is currently sourced and whether the intended Blacksmith workflow has access to it. If there is no generic source, do not silently mint whetstones; either use an existing source or keep the work action unavailable until the generic dependency exists.

The work should end at the generic `sharpenWeapon()` operation. No separate Blacksmith durability/sharpness state.

## 11. Blacksmith workplace assets

The two new assets are currently parked:

```text
public/models/parked/anvil.glb
public/models/parked/workbench-grind.glb
```

They should be integrated through the existing settlement asset/prop mechanism, not loaded directly by `NpcAgent`.

Use the existing asset index/parked-manifest and settlement prop/workplace conventions. `constructionCatalog.ts` is specifically a construction-semantics layer over the MegaKit/furniture sets; do not add a second asset registry just for Blacksmith props.

The workplace should expose stable positions that NPC work can target. Keep simulation state outside `Object3D`s.

Visual placement needs browser verification because the assets are new and their orientation/scale/collision are not established by the plan text.

## 12. Household/economy ownership

Keep the current boundaries:

```text
NPC temporary carry → Inventory
household food/wood/water → Household
household discrete items → Household.items
settlement bulk economy → SettlementEconomy
```

Do not add profession-specific stores.

For newly produced food/fish, use the existing food/item representation and existing household/settlement delivery semantics. For ore, keep settlement-level storage. For weapon maintenance, mutate the actual item instance in the owning inventory.

If a new transfer is needed, implement a generic transfer helper rather than `depositFish()` / `depositTraderGoods()` / `depositBlacksmithItems()`.

## 13. Determinism and target selection

Profession work is simulation, not presentation. Target selection should be deterministic where the existing system is deterministic.

Prefer:

```text
bounded local query
→ stable distance/id ordering
→ action
```

over random per-tick selection.

Do not use `Math.random()` for persistent profession decisions. Use the existing seeded mechanisms where a roll is genuinely needed.

Do not scan all world entities every NPC tick. Target discovery belongs at the work decision boundary, not in `update()` every frame.

## 14. Fallbacks and action validity

A profession must not get stuck because its workplace exists but its real work target does not.

Examples:

- Farmer: no plantable/dry/ready crop → maintenance/other suitable work or normal idle fallback.
- Fisher: no valid water target → normal idle/fallback, never fish at a well.
- Miner: existing `SettlementMiningHooks` failure → existing fallback.
- Guard: no patrol point → use settlement centre/normal work anchor.
- Trader: no opportunity → remain at trade place or perform existing generic helper work.
- Blacksmith: no maintenance target or no whetstone → fallback without consuming/creating anything.

Every action must preserve the existing `PlannedAction` lifecycle and movement watchdog. Never teleport directly to a workplace as the normal work path.

## 15. Generation/staffing

Do not redesign profession staffing in this plan.

After adding `blacksmith`, audit:

- `RANDOM_ROLES`;
- reserved characters;
- natural-resource role forcing;
- all role exhaustiveness;
- deterministic family-generation snapshots/tests.

Adding a member to a deterministic role pool changes downstream seeded rolls. Existing tests that pin generated roles may need deliberate re-pinning, as happened when Hunter was added.

Trader is intentionally reserved to Kasia today. Do not accidentally make `trader` random merely because all roles are now being reviewed.

The NPC vision wants future staffing/minimum profession coverage, but that is a separate system. Do not solve it by adding ad-hoc guarantees here.

## 16. Tests — focus on domain seams

Do not only test that a role exists. Test the actual world mutation boundary.

Minimum useful coverage:

- `characters.test.ts`: Blacksmith role + exhaustive role handling; reserved characters unchanged.
- `schedule.test.ts`: Blacksmith schedule and generic role schedule coverage.
- Farmer: deterministic target selection; water/plant/harvest success; stale target/no target fallback.
- Fisher: valid water target; deterministic catch; inventory delivery; invalid target fallback.
- Guard: deterministic patrol target selection; threat delegates to existing combat path.
- Trader: real economic state change; no-op when no valid opportunity.
- Blacksmith: weapon instance requiring maintenance; successful `sharpenWeapon`; missing whetstone; already-max; no target.
- Shared work dispatch: every role resolves through the normal schedule/work path; Woodcutter/Hunter/Miner regressions remain covered.

Keep pure decision/target tests separate from browser verification of movement and placement.

## 17. Verification priorities

Technical checks are necessary but insufficient. This plan changes visible NPC behaviour and new settlement assets.

Browser/manual verification should specifically observe:

1. Farmer reaches actual crops and changes their state rather than standing at the garden anchor.
2. Fisher reaches real water and produces fish through the shared fishing rule.
3. Miner still extracts real deposits without player proximity.
4. Guard patrols and responds using existing combat.
5. Trader causes an observable economy change, not just idle animation.
6. Blacksmith reaches the anvil/grind workplace and actually changes a weapon instance.
7. NPCs recover cleanly from missing targets / blocked workplaces.
8. New Blacksmith props have correct scale, rotation, placement and collision behaviour.
9. Work continues when the player is elsewhere.

Do not claim browser verification from typecheck/tests/build alone.

## 18. Scope traps to avoid

Do not add:

- profession-specific AI classes;
- profession-specific schedulers;
- a second NPC FSM;
- player-action calls from NPC simulation;
- profession-specific inventories/stores;
- global market simulation;
- fish agents/populations;
- a new patrol-route manager;
- a new maintenance/durability system;
- fake production solely for animations;
- age-based work participation (explicitly out of scope);
- MPFB2/assets for NPC bodies.

If an existing player action is too coupled to UI, extract its **domain operation** and keep UI orchestration in the player layer.

## 19. Recommended implementation order

Adjust the plan's order slightly to reflect the actual codebase:

```text
1. Recon current NpcAgent work dispatch + exhaustive Role consumers
2. Add Blacksmith role/schedule/workplace plumbing
3. Farmer — crop target/actions using existing crop domain
4. Fisher — extract/reuse generic fishing attempt rule
5. Guard — deterministic patrol + existing threat/combat
6. Trader — audit and minimally generalize trade domain
7. Blacksmith — workplace + generic weapon maintenance
8. Consolidate shared profession-work dispatch only where justified
9. Audit role generation/staffing without redesigning staffing
10. Focused tests
11. Browser/gameplay verification
```

Keep Woodcutter, Hunter and Miner as working reference paths throughout the refactor.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
