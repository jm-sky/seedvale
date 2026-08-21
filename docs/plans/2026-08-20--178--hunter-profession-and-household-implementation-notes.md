# Implementation Notes: Hunter Profession & Household

**Plan:** `2026-08-20--178--hunter-profession-and-household.md`
**Reviewed:** 2026-08-21
**Status:** review / implementation guidance

## 1. Review summary

The plan is directionally compatible with the current architecture, but it is **not directly implementable as written** without reconciling several important differences between the plan and the current code.

The biggest issue is that the current `Household` is a small economic reserve, not an item-instance storage/container. It stores only `food` and `wood` plus a separate water reserve. Bows, arrows, knives, hides and produced meat therefore cannot simply be deposited into `Household.stock` as the plan currently implies.

The second major gap is that `hunter` is not currently a `Role`. `Role` is a closed union and `SCHEDULE_TEMPLATES` is a `Record<Role, ...>`, so adding the profession requires extending the existing role/schedule machinery rather than introducing a hunter-specific scheduler.

NPC Combat is already substantially implemented, including melee and ranged lifecycle integration. Hunter should be the first real caller that creates combat intent and target selection; do not modify combat architecture merely to accommodate Hunter.

## 2. Current architecture to reuse

### NPC role / schedule

- `src/ai/characters.ts` owns `Role`, deterministic role generation and character definitions.
- `src/ai/schedule.ts` owns role schedules and `effectiveScheduleFor()` trait overlays.
- `NpcAgent` consumes the effective schedule and existing decision/action lifecycle.
- There is no `HunterSystem` and there should not be one.

Adding Hunter should therefore mean:

1. add `'hunter'` to `Role`,
2. decide how Hunter households are deterministically assigned during settlement/family generation,
3. add a role schedule in `SCHEDULE_TEMPLATES`,
4. implement Hunter-specific work through the existing NPC decision/action path,
5. let needs, sleep, eating, thirst, social/home behaviour continue to pre-empt work normally.

Do not add a second scheduler or a hunter update loop.

### NPC combat

Current NPC Combat already has the intended seams:

- `CombatIntent` / `CombatTargetHandle` in `src/combat/combatIntent.ts`,
- shared melee lifecycle in `src/combat/meleeAttack.ts`,
- shared ranged lifecycle/projectile code,
- NPC-specific weapon/ammo resolution in `src/ai/npcCombat.ts`,
- `NpcAgent.beginCombat()` / `cancelCombat()` and combat phase,
- NPC damage/defense through the shared HealthState/defense pipeline.

`NpcAgent` reads carried equipment rather than having a separate NPC equipment system. Hunter should prepare carried equipment before leaving home and pass a target handle to `beginCombat()`.

Do not add `HunterCombat`, `HunterSystem`, a target manager, or a second projectile/melee pipeline.

### Items

`src/items/items.ts` already contains the relevant item kinds, including:

- `raw_meat`, `deer_meat`, `wolf_meat`, `boar_meat`, `rabbit_meat`,
- `hide`,
- `bandage`,
- `short_bow`, `hunting_bow`, `long_bow`,
- `arrow`, `broadhead_arrow`, `war_arrow`.

`src/items/itemCatalog.ts` is the gameplay/AI-facing catalog and already owns `MeleeConfig`, `RangedConfig`, defense configuration and item flags. Use it as the source of truth. Do not create Hunter weapon stats elsewhere.

## 3. Important mismatch: household storage

Current `src/settlement/household.ts` defines:

- `Household.stock: EconomicStock`,
- `HouseholdResourceKind = 'food' | 'wood'`,
- a separate water reserve,
- small deterministic household capacities.

This means the plan's statements about a "real trade stock" of bows/arrows/hide/meat cannot currently be implemented by putting arbitrary items into `Household.stock`.

### Recommended boundary

Use the existing household/storage work rather than widening `EconomicStock` into a generic item container.

The correct ownership model should remain:

```text
NPC carried Inventory
        ↕
household storage / container system
        ↕
household
        ↕
settlement economy / trade
```

The item-instance storage/logistics plan should remain the owner of generic household item storage. Hunter should consume that mechanism once available, not invent a hunter-specific stock map.

If the required storage implementation is not yet present in the current branch, Hunter should either depend on it explicitly or be implemented in stages with the storage boundary kept clear. Do **not** silently overload `Household.stock` with weapon/ammo/hide quantities.

## 4. Hunter role assignment

`characterForSeed()` currently generates only from `RANDOM_ROLES`, which contains:

`woodcutter | farmer | guard | miner | fisher`

Adding `hunter` to the union alone is insufficient. The deterministic generation/settlement-family path must be reviewed so Hunter households are neither overrepresented nor absent.

Prefer a deterministic role-selection rule integrated with the existing family/settlement generation mechanism. If the design requires one specialised hunter household per suitable settlement, encode that as a settlement-generation rule rather than random per-NPC AI.

Preserve the existing reserved characters (`Anna`, `Piotr`, `Kasia`, `Marek`). Do not disturb quest-critical reserved seeds.

## 5. Hunter schedule and work lifecycle

A useful role schedule can provide long work blocks for preparation/hunting, but the schedule should not encode the whole hunting algorithm.

Suggested conceptual flow:

```text
schedule says: work
        ↓
existing NPC decision/action flow
        ↓
hunter work decision
        ├─ prepare equipment
        ├─ leave / travel
        ├─ hunt
        ├─ return
        └─ process/store/sell
```

Needs remain higher-priority than routine work. A hunter should still stop for sleep, hunger, thirst, injury, household needs and other existing interruptions.

A hunting trip is an action/activity with world time, not an instantaneous profession tick.

## 6. Hunting target selection

The plan's population protection rule should be implemented against the existing fauna/spawn-point state, not by adding a new ecosystem counter.

Current fauna already provides:

- stable `AnimalAgent.animalId`,
- `spawnPointId`,
- managed spawn-point population state,
- death callbacks into the owning spawner,
- depleted/disabled/recovering lifecycle.

Hunter target selection should therefore query nearby/live fauna through the existing fauna access path and inspect the animal's existing spawn-point relationship where needed.

Do not maintain a second `hunterPopulation` or `remainingAnimals` state.

The "exactly one living animal => 50% skip" rule should be deterministic where the rest of simulation decisions are deterministic. Avoid introducing `Math.random()` into a new simulation decision if the surrounding NPC decision system already has a seeded/random source available.

Target selection should be bounded/local. Never scan the entire fauna population every NPC tick.

## 7. Hunting combat flow

Hunter should become the first real producer of `CombatIntent` for NPC-vs-animal:

```text
Hunter decision
  ↓
select live animal
  ↓
verify carried bow + compatible arrows
  ↓
beginCombat({ target })
  ↓
shared NPC ranged combat
  ↓
AnimalAgent.applyDamage()
  ↓
existing animal death/corpse/spawn-point lifecycle
```

Prefer ranged combat with a bow. The knife is preparation/harvest equipment, not the primary attack weapon.

Do not make `NpcAgent` decide that a hunter should attack. `NpcAgent.beginCombat()` already intentionally accepts the decision from an external caller.

## 8. Hunting preparation / carried state

The plan specifies bow, 10–20 arrows, knife, water, food and bandage. Treat this as a logistics/action problem, not a new equipment abstraction.

Use the existing `Inventory` and carried state. Preparation should move existing item instances from the appropriate household storage/source into the NPC's carried inventory using the existing transfer mechanisms.

Do not create:

- `HunterEquipment`,
- `HunterLoadout`,
- `HunterStorage`,
- a parallel ammo count outside Inventory.

The ammo count must be represented by actual arrow item quantities/instances according to the current Inventory model, and NPC ranged combat should continue to consume the compatible ammo defined by `RangedConfig`.

The exact choice among `hunting_bow` / other bows should come from the item catalog and existing carried-item resolution rather than a hard-coded Hunter weapon table.

## 9. Hunt completion and loot

The existing fauna lifecycle already has death, corpse and knife-harvest mechanics. Reuse those mechanisms.

The plan's "meat + hide" result must be reconciled with the current implementation rather than adding a second loot path.

In particular, current fauna already distinguishes animal-specific meat and `hide`, and the knife harvest path produces harvested remains. Hunter should use the same canonical death/harvest/loot pipeline where possible.

If NPC harvesting currently has no action equivalent to player knife harvest, add a small reusable harvest operation at the appropriate world/fauna layer rather than reproducing the player harvest logic inside Hunter.

Do not make the Hunter directly mutate animal health and then manually manufacture loot if the existing fauna death/harvest path can own those consequences.

## 10. Meat processing

The plan references roasting, drying and preservation. These should be expressed through the existing cooking/preservation systems and their actions/recipes.

Do not create "hunter cooking AI".

The wife's work should be normal household work that reacts to available food and existing cooking/preservation mechanisms. If current household AI does not yet support these exact actions, extend the generic household/work action mechanism rather than branching on `role === 'hunter'` throughout cooking code.

The same principle applies to vegetables: the hunter family should use the existing shared village garden and existing gathering mechanism.

## 11. Cooking / plan 175 integration

The plan explicitly depends on the cooking-vessel/grate work. Before implementation, confirm the actual current cooking action API and ownership of the grate/fireplace state.

The Hunter plan should only provide the household/world setup needed for the normal cooking system to see the grate. It must not add a hunter-specific cooking recipe, action or interaction.

## 12. Drying / preservation / plan 159 integration

The current item catalog already has food freshness/bait metadata, and the plan 159 preservation system is the intended owner of drying/preservation.

Use the existing preservation action/recipe and item transformations. Do not duplicate freshness calculations or introduce a hunter-only dried-meat timer.

## 13. Bow and arrow production

This is the most likely area where the plan currently assumes more generic crafting support than is guaranteed by the current state.

Before implementation, identify the actual production/crafting mechanism used by existing NPC professions. If there is already a generic recipe/production definition, add bow/arrow recipes there.

Do not encode:

```text
if hunter then create bow
```

inside `NpcAgent`.

Instead model production as normal work:

```text
wood/material availability
        ↓
recipe/production action
        ↓
item instances
        ↓
household storage
        ↓
minimum hunting reserve
        ↓
surplus available to trade
```

If current economy only supports scalar `EconomicKind` production and not item-instance production, that is a real dependency/gap. Do not fake bow inventory with an economy integer.

## 14. Trade

The plan's "surplus bows/arrows/hide/meat" requires item-aware trade/storage if these are to be actual item instances.

Use the existing economy/trading system for the economic transaction, but keep ownership of item quantities in the canonical inventory/storage representation.

The minimum-reserve rule should be evaluated before releasing items for sale:

```text
household item stock
  ├─ reserve required for next hunt
  └─ surplus → trade
```

Avoid a second `hunterTradeStock` map.

If current trader infrastructure only trades selected `EconomicKind`s rather than arbitrary ItemKind values, extend that generic trade capability as needed. Do not add a Hunter-only seller.

## 15. Bandages

The initial five bandages should be real item quantities in the household/storage/inventory system, not a private Hunter counter.

The plan explicitly says later replenishment is outside scope. Therefore implement only the initial seeded stock and the normal transfer/use path.

Do not implement a wife/doctor/herbalist bandage production system here.

## 16. Household identity / wife

The hunter family should remain a normal `Family` / `Household` relationship.

Do not create `HunterHousehold` as a subtype or parallel registry.

The wife should have normal NPC state, needs, personality and schedule. Her role should be selected through existing role/work mechanisms where possible. Avoid making the spouse's behaviour a hidden side effect of the husband's role.

If the plan needs a guaranteed hunter + spouse pairing, implement this at family generation/settlement generation, not by dynamically spawning a wife from Hunter AI.

## 17. Home props

The plan requires a fire and grate. Use the existing settlement/home landmark and cooking-vessel mechanisms.

Do not add Hunter-specific prop ownership or a Hunter-specific fireplace system.

The house should remain a normal settlement `Place` with additional props/configuration where the generic home generation supports it.

## 18. Likely implementation order

Recommended order:

1. Reconcile role model and deterministic Hunter household generation.
2. Add Hunter schedule through existing `SCHEDULE_TEMPLATES`.
3. Verify generic NPC action/work extension point for profession-specific work.
4. Verify household item storage/logistics dependency; do not misuse `Household.stock`.
5. Add Hunter preparation/transfer of real item instances into carried inventory.
6. Add bounded deterministic animal target selection using existing fauna/spawn-point state.
7. Connect Hunter decision to existing `CombatIntent` + ranged NPC Combat.
8. Add NPC harvesting/return handling using existing fauna loot/harvest lifecycle.
9. Integrate existing cooking/preservation actions for household food.
10. Integrate generic production/recipe support for bows/arrows if currently available; otherwise record the exact dependency instead of inventing a local system.
11. Integrate item-aware household surplus/trading using existing storage/economy boundaries.
12. Add the initial five bandages through the same item storage path.
13. Add the generic home/grate configuration required by plan 175.
14. Verify save/stream/rebuild behaviour for the new household state and any item storage.

## 19. Potential traps

- **Closed `Role` union:** adding Hunter in one file will leave schedule/generation switches incomplete.
- **Household ≠ item storage:** current household stock cannot represent bows, arrows, hide or arbitrary item instances.
- **Don't duplicate combat:** NPC Combat is already implemented; Hunter should be a caller.
- **Don't duplicate fauna loot:** animal death/harvest already owns important consequences.
- **Don't use global fauna scans:** target queries must be local/bounded.
- **Don't use nondeterministic `Math.random()` for persistent simulation decisions.**
- **Don't bypass Inventory:** ammo, food, knife, bow and bandages should be real inventory quantities/items.
- **Don't make the wife a Hunter-specific AI class.**
- **Don't create private gardens or storage.**
- **Don't turn `EconomicStock` into a generic item bag just for this plan.**
- **Don't assume the plan's dependency numbers mean the implementation is unchanged:** verify current code first.
- **Streaming:** household state is registry-owned and must survive settlement streaming/rebuild; any new item-storage state must follow the same ownership/lifetime rules.
- **Off-screen simulation:** a hunt must have a coherent state/action representation even when the NPC is not rendered. Avoid camera/gameLoop dependencies.

## 20. Architectural decisions

1. **Hunter is a Role, not a subsystem.**
2. **Hunting is a normal NPC work/action flow, not a dedicated scheduler.**
3. **Combat remains in `src/combat` + `NpcAgent`; Hunter supplies intent and target.**
4. **Fauna remains authoritative for animal lifecycle and population consequences.**
5. **Inventory remains authoritative for carried item quantities.**
6. **Household storage/logistics remains the owner of persistent household item stock; do not overload `EconomicStock`.**
7. **Cooking/preservation remain generic systems.**
8. **Economy/trading remains generic; Hunter only creates a supply pattern.**
9. **Deterministic, bounded target selection is preferred over global scanning/random AI.**
10. **No new global Hunter manager.**

## 21. Verification focus

At minimum verify:

- deterministic Hunter role/family generation,
- role schedule and normal need pre-emption,
- equipment transfer home → carried → return,
- arrow consumption through existing ranged combat,
- animal target selection and the one-animal population protection rule,
- animal death/loot/harvest integration,
- household storage persistence across settlement streaming/rebuild/save/load,
- cooking/preservation using existing systems,
- bow/arrow production using generic production mechanisms,
- surplus vs minimum hunting reserve,
- generic trade integration,
- no second combat/scheduler/storage system introduced.

Browser verification is particularly useful once the full hunt lifecycle is active because it exercises NPC movement, combat animation/projectiles, animal death and household/world integration.

## 22. Bottom line

The plan should be implemented as a **composition of existing NPC, inventory, fauna, combat, household, cooking, preservation and economy systems**.

The implementation should first close the architectural gap around **item-aware household storage/logistics** if that capability is not already available. That is more important than adding Hunter-specific code. Once storage and generic work/action seams are confirmed, Hunter itself should be relatively thin: role + schedule + deterministic hunt decision + preparation/return actions + integration with existing combat and world consequences.

The plan's desired closed loop is sound; the main risk is accidentally creating parallel storage, crafting, cooking, trade or combat mechanisms because the current generic infrastructure is narrower than the plan assumes.
