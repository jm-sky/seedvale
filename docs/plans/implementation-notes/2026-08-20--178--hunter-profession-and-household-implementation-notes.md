# Implementation Notes: Hunter Profession & Household

**Plan:** `2026-08-20--178--hunter-profession-and-household.md`
**Reviewed:** 2026-08-24
**Status:** `implementation guidance`

## Purpose

Ten dokument uzupełnia plan 178.

Plan definiuje **co i dlaczego** należy zaimplementować.

Ten dokument definiuje przede wszystkim:

- gdzie szukać istniejących mechanizmów;
- co już jest dostępne;
- które granice architektury są istotne;
- gdzie spodziewać się braków;
- jak uniknąć niepotrzebnego reworku.

**Codebase is the source of truth.**

Jeżeli plan lub notes nie odpowiadają aktualnemu kodowi, zaufaj kodowi i dostosuj implementację.

---

## 1. Existing code to reuse

| Area | Relevant code / concept | Action |
|---|---|---|
| NPC roles | `src/ai/characters.ts` | extend `Role` |
| NPC schedule | `src/ai/schedule.ts` | extend existing templates |
| Decisions | existing pressure/decision pipeline | integrate `hunter` |
| Personality | existing role/personality modifiers | reuse |
| NPC combat | `src/combat/*`, `src/ai/npcCombat.ts` | reuse ranged path |
| Combat intent | `src/combat/combatIntent.ts` | create normal `CombatIntent` |
| NPC inventory | `NpcAgent` / `Inventory` | reuse |
| Items | `src/items/itemCatalog.ts`, item definitions | reuse |
| Fauna | `AnimalAgent` / spawn-point systems | reuse |
| Animal death | existing fauna lifecycle | reuse |
| Harvest | existing harvest path | reuse/extract generic operation |
| Household | existing `Household` / `Family` | reuse |
| Cooking | existing cooking system | reuse |
| Preservation | existing preservation system | reuse |
| Production | existing production/recipe system | extend generically if needed |
| Trade | existing economy/trading | extend generically if needed |

Do not create Hunter-specific versions of these systems.

---

## 2. Role / generation

`Role` is a closed union and role handling is spread across the AI/schedule/generation code.

Required:

1. add `hunter`;
2. fix exhaustive role handling;
3. add the existing schedule entry;
4. integrate deterministic Hunter generation where required by the plan;
5. preserve reserved NPC generation.

Do not implement Hunter generation by bypassing the existing settlement/family generation architecture.

---

## 3. Decision architecture

The current decision model is:

```text
state
→ needs / problems / goals
→ pressures
→ role/personality modifiers
→ decision
```

Hunter must plug into this pipeline.

Use existing pressure and personality mechanisms to make hunting more attractive when appropriate.

Do not implement:

```text
role === 'hunter' → hunt()
```

Do not add:

- Hunter-specific AI;
- Hunter-specific utility scoring;
- Hunter-specific pressure system;
- Hunter-specific decision arbiter.

The important distinction is:

```text
food pressure
→ hunter role modifier
→ hunting becomes a good decision
```

not:

```text
hunter
→ always hunt
```

---

## 4. Ranged combat

Plan 177 already provides the NPC ranged-combat foundation.

Inspect before changing anything:

```text
src/combat/combatIntent.ts
src/ai/npcCombat.ts
NpcAgent.beginCombat()
NpcAgent.cancelCombat()
```

Hunter should only provide:

```text
valid target
→ existing CombatIntent
→ existing NPC ranged combat
```

Reuse:

- bow item definitions;
- arrow item definitions;
- `RangedConfig`;
- projectile lifecycle;
- existing damage/death handling.

Do not redesign combat.

Do not create:

```text
HunterCombat
HunterProjectile
HunterTargetManager
```

If a concrete reusable gap is discovered, fix the generic combat mechanism rather than adding Hunter-specific code.

---

## 5. Hunting target selection

Use existing fauna and spawn-point state.

Relevant concepts include:

```text
AnimalAgent
animalId
spawnPointId
spawn population state
animal death lifecycle
```

Preferred species are defined by the plan.

Target selection must be:

- deterministic;
- bounded;
- activity/decision driven.

Do not scan the entire fauna population every NPC tick.

When a current target becomes invalid, select another through the same bounded mechanism.

### Single-animal protection

The plan specifies:

- if a spawn point has exactly one living animal, 50% chance to skip it;
- try another valid target;
- if none exists, the hunt may end without a kill.

Use the existing seeded/deterministic simulation RNG.

Never use `Math.random()` for this persistent simulation decision.

Do not create additional population state.

---

## 6. Animal death / harvest

Use the existing fauna lifecycle:

```text
CombatIntent
→ animal damage
→ existing animal death
→ existing corpse/dead-animal lifecycle
→ harvest
→ normal item/resource result
```

The Hunter must not directly delete animals or manufacture an independent hunting-loot result.

If harvesting currently exists only as player interaction:

1. inspect the existing implementation;
2. extract the smallest reusable generic harvest operation;
3. call it from Hunter.

Do not duplicate player harvest logic.

---

## 7. Inventory / household boundary

This is the most important architectural constraint.

`Household.stock` / `EconomicStock` represents economic quantities and is **not** a generic item-instance container.

Do not put:

- bows;
- arrows;
- hides;
- bandages;
- arbitrary item instances

into scalar economic stock.

Expected ownership:

```text
NPC Inventory
↕
household item storage / logistics
↕
Household
↕
economy / trade
```

Before implementing delivery, inspect the current generic item-storage/logistics mechanism.

If it already exists, use it.

If it does not exist, implement the smallest **generic** missing capability.

Do not create:

```text
HunterInventory
HunterStorage
HunterStock
huntedFood
```

or direct Hunter-specific mutation of household economic counters.

---

## 8. Household / spouse

Use the existing:

```text
Family
→ Household
→ NPC members
```

Hunter's household is not a special household type.

The spouse remains a normal NPC with:

- role;
- needs;
- personality;
- schedule;
- decisions.

Do not create `HunterHousehold` or `HunterWifeAI`.

If a guaranteed Hunter + spouse configuration is required, extend the existing family/settlement generation mechanism.

---

## 9. Cooking / preservation

Reuse the current cooking and preservation systems.

Expected ownership:

```text
meat
→ household item storage
→ existing cooking / preservation
→ food
```

Relevant dependencies:

- cooking/grate: plan 175;
- preservation/drying: plan 159.

Inspect their current APIs before implementation.

Do not create:

```text
HunterCooking
HunterDrying
HunterFoodTimer
```

The spouse should use normal NPC activities.

---

## 10. Bow / arrow production

First inspect the current generic production and recipe systems.

Desired flow:

```text
resources
→ generic production
→ bow / arrows
→ household item storage
→ required reserve
→ surplus
→ trade
```

If bows/arrows already work with generic production, add normal recipes/configuration.

If they do not, extend the generic production mechanism.

Do not implement crafting directly in `NpcAgent` or Hunter logic.

Do not create:

```text
if hunter then createBow()
```

---

## 11. Trade

Use the existing economy/trading system.

Potential Hunter-household surplus:

- meat;
- preserved meat;
- hide;
- bows;
- arrows.

Required distinction:

```text
household item stock
├─ required reserve
└─ surplus → trade
```

If the current trade system only supports scalar economic quantities, identify whether generic item-aware trade is already available.

If not, extend the generic trade boundary rather than creating Hunter-specific trade state.

Do not create `HunterTradeStock` or a Hunter-only seller.

---

## 12. Initial supplies

The plan specifies:

```text
5 × bandage
```

These should use the normal item/inventory/storage representation.

Do not implement bandage production in this plan.

---

## 13. Performance / simulation

Hunter must work independently of:

- player input;
- camera;
- rendering;
- player proximity.

Target discovery must not become an O(all fauna) operation for every Hunter every tick.

Prefer:

```text
decision/activity
→ bounded target query
```

over:

```text
every NPC tick
→ scan all fauna
```

Persistent Hunter/household state belongs to the simulation/domain layer, not rendering objects.

---

## 14. Implementation order

Use this order to minimise rework:

1. Inspect role, schedule and deterministic generation.
2. Add `hunter` and update exhaustive role handling.
3. Integrate Hunter into existing pressure/decision modifiers.
4. Inspect and resolve the generic household item-storage boundary.
5. Implement bounded deterministic prey selection.
6. Connect Hunter to existing ranged `CombatIntent`.
7. Connect death → harvest → inventory.
8. Connect inventory → household storage.
9. Reuse/extend generic cooking, preservation, production and trade.
10. Add initial supplies/home configuration.
11. Run focused automated tests.
12. Perform browser/gameplay verification.

If a missing generic capability is discovered, resolve that capability before continuing with Hunter-specific code.

---

## 15. Known architectural traps

Avoid these unless the existing code proves they are genuinely required:

- Hunter-specific AI;
- second scheduler;
- second combat pipeline;
- Hunter-specific inventory/storage;
- item instances inside `EconomicStock`;
- `Math.random()` in simulation;
- global fauna scans per NPC tick;
- duplicated animal death/loot logic;
- Hunter-specific cooking/preservation;
- Hunter-specific trade;
- spouse behaviour derived directly from husband's profession;
- player/camera-dependent hunting;
- temporary Hunter-specific workarounds for missing generic systems.

---

## 16. Focused verification

Do not repeat the entire plan's verification checklist.

Focus implementation checks on the risky integration boundaries:

### AI

- `hunter` participates in normal pressure/decision arbitration;
- hunting does not bypass higher-priority needs;
- deterministic target selection works.

### Combat

- Hunter creates the existing ranged `CombatIntent`;
- arrows are consumed through normal inventory/item logic;
- animal death remains owned by fauna lifecycle.

### Items / household

- harvest result becomes normal item/resource state;
- NPC inventory → household transfer uses generic storage;
- scalar `EconomicStock` is not abused for arbitrary item instances.

### Economy

- production uses generic recipes/mechanisms;
- household reserve is preserved;
- only surplus enters trade.

### Simulation

- no global fauna scan per NPC tick;
- works without player/camera;
- state survives relevant streaming/rebuild paths.

---

## 17. Final rule

Implement Hunter as **composition of existing Seedvale systems**.

When something is missing:

```text
missing generic capability
→ extend generic system
→ use it from Hunter
```

Never:

```text
missing generic capability
→ create Hunter-specific workaround
```

Keep the implementation focused on plan 178 and avoid unrelated refactors.