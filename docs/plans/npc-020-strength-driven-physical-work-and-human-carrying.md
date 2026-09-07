# Plan: Strength-driven physical work and human carrying

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-019~~
**Domain:** `npc`
**Subdomains:** `work`
**Tags:** `spea` `strength` `physical-work` `carrying` `items-player`
**Roadmap:** `physical-attributes-health-and-medicine.md`

## Goal

Extend Strength beyond melee into two concrete existing systems:

1. **physical work speed** for Player and NPC;
2. **human carrying capability** for the Player.

Reuse the existing action, inventory and encumbrance mechanisms instead of introducing parallel Strength-specific systems.

Preserve the architectural rule established by `npc-019`:

```text
base/profiled Strength
→ consumer-specific capability mapping
→ existing gameplay system
```

Strength does not directly own action duration, inventory, movement, Stamina or logistics.

The same Strength value may intentionally map differently to melee, work and carrying.

## 1. Scope boundary

This plan adds two new Strength consumers:

```text
Strength
├─ melee                 npc-019
├─ physical work speed   npc-020
└─ human carry capacity  npc-020
```

It does **not** introduce a universal Strength multiplier.

Each consumer owns its own mapping because producing force in combat, sustained manual work and carrying a load are different capabilities.

Do not introduce:

- `StrengthManager`;
- `PhysicalCapabilityManager`;
- generic `AttributeEffect[]`;
- generic modifier stacking;
- a universal `strengthMultiplier()` reused by unrelated systems.

## 2. What counts as physical work

Strength should affect actions where force production materially contributes to completing the task.

Initial Player candidates already represented by real timed actions include:

- digging soil;
- pickaxe digging;
- leveling terrain;
- moving earth / mound work;
- tree chopping;
- ore mining;
- other existing excavation/construction work only where implementation recon confirms the action duration represents physical effort.

Initial NPC candidate:

- real ore mining in `npcProfessionWork.ts`.

Further existing NPC actions may opt in only if their semantics clearly represent physical work.

Do **not** make all `BusyAction`s or all NPC `work` actions Strength-sensitive.

Examples that stay Strength-neutral unless a future mechanic explicitly requires otherwise:

- fishing;
- crop harvesting;
- planting;
- cooking;
- fire lighting;
- trading;
- guard patrol;
- conversation;
- generic workplace waiting;
- actions whose duration mainly represents waiting/process time rather than physical effort.

The caller/consumer explicitly decides whether Strength applies.

## 3. Shared physical-work mapping

Introduce one small pure resolver for Strength-sensitive work.

Initial calibration:

```text
Strength   work-speed multiplier
0.00       0.75
0.25       0.875
0.50       1.00
0.75       1.125
1.00       1.25
```

Equivalent:

```ts
speedMultiplier = 0.75 + strength * 0.5
duration = baseDuration / speedMultiplier
```

Properties:

- `Strength = 0.5` is the neutral reference and preserves current duration;
- stronger characters complete physical work faster;
- weaker characters complete it slower;
- work output/yield is not multiplied.

The Player introduced by `npc-019` starts with `Strength = 0.6`, therefore initially receives:

```text
work speed = 1.05×
```

This is intentional. Do not shift the work curve to make Player `0.6` neutral.

`0.5` remains the species/reference neutral point.

## 4. Player physical-work integration

Apply Strength at explicit physical-work action call sites.

Preferred flow:

```text
existing base duration
→ Strength work resolver
→ existing BusyAction
→ existing completion callback
```

Do not make `BusyAction` itself attribute-aware.

`BusyAction` remains a generic timed-channel mechanism.

Strength must not alter:

- target selection;
- tool requirements;
- reach;
- terrain/resource ownership;
- success eligibility;
- cancellation semantics;
- yield;
- item consumption;
- world mutation;
- audio/animation ownership.

The existing action completion callback still executes exactly once.

## 5. Physical work and Stamina

Strength and Endurance remain separate.

Do not modify in this plan:

- max Stamina;
- Stamina regeneration;
- Vigor;
- Endurance;
- fatigue;
- `physicalEffortBusyOptions()` rates;
- NPC physiological recovery;
- direct Stamina discounts based on Strength.

Where an existing physical action consumes Stamina continuously per second, stronger characters may naturally spend less **total** Stamina because they finish sooner.

```text
same stamina cost / second
× shorter action duration
→ lower total stamina spent
```

This is an emergent consequence of faster work.

Do not additionally reduce the per-second cost using Strength, otherwise Strength would be counted twice.

Endurance will own later exertion/recovery semantics.

## 6. NPC physical-work integration

NPC work already uses `NpcPlannedAction.durationSec`.

Apply the same shared physical-work resolver only to genuine physical tasks.

The first required NPC integration is real ore mining in `npcProfessionWork.ts`.

Conceptually:

```text
existing mining base duration
× waitMultiplier
→ Strength-adjusted physical duration
→ existing NpcPlannedAction
```

Exact ordering may follow current code conventions as long as:

- `Strength = 0.5` preserves the existing duration;
- Player and NPC use the same physical-work rule.

Do not apply Strength globally to `rollWorkDurationSec()`.

That helper is reused by semantically different profession actions and generic work periods.

Do not make farmer harvesting, fishing, guard patrol, trader logistics or generic workplace stands faster merely because an NPC has high Strength.

If a profession does not currently perform real physical work, do not invent new behaviour just to expose Strength.

## 7. Existing Player carrying system

Player carrying already has an authoritative real-weight pipeline:

```text
Inventory item weight
+ liquid mass
+ carried-container weight
→ current load kg

human/equipment carry capacity
→ Inventory.maxWeight

load vs capacity
→ computeEncumbrance()
→ existing movement slowdown / block
```

Reuse it.

Do not introduce a second Strength-specific encumbrance system.

`computeEncumbrance()` remains the authority for overload consequences.

## 8. Human base carry capability

Raw SPEA must not directly mean kilograms.

Use an explicit **human carry baseline** and let Strength modify that capability.

Current Player base carry capacity is `20 kg`.

Keep the neutral human reference:

```text
Strength = 0.5
→ base human carry capacity = 20 kg
```

Initial calibration:

```text
Strength   human base carry capacity
0.00       14 kg
0.25       17 kg
0.50       20 kg
0.75       23 kg
1.00       26 kg
```

Equivalent:

```ts
capacityKg = 14 + strength * 12
```

This is a human capability mapping, not part of `PhysicalAttributes`.

Do not create a generic cross-species `strengthToKg()`.

Keep the resolved value continuous; do not round the simulation capacity to whole kilograms.

## 9. Starting Player carrying capacity

The Player starts with:

```text
Strength = 0.6
```

Therefore the initial body-derived carrying capacity is:

```text
14 + 0.6 × 12
= 21.2 kg
```

This small starting advantage is intentional.

Do not move the neutral point from `0.5` to `0.6`.

Do not change the Strength distribution or `npc-019` calibration merely to retain exactly `20 kg` for the starting Player.

Do not round `21.2 kg` in the simulation. UI presentation may format the value independently if needed, but presentation must not change the authoritative capacity.

## 10. Attribute bonuses vs carrying bonuses

Keep two mechanisms semantically distinct.

### Attribute modifier

A future modifier such as:

```text
+0.10 Strength
```

changes effective Strength and therefore may influence every Strength consumer:

```text
melee
physical work
human carrying
future Strength capabilities
```

### Explicit carry-capacity bonus

A modifier such as:

```text
+10 kg carry capacity
```

affects carrying only.

It must not secretly become a Strength increase.

Conceptual composition:

```text
base Strength
+ later attribute modifiers
→ effective Strength

human carry resolver(effective Strength)
+ explicit equipment/gameplay carry bonuses
→ final carry capacity
```

This distinction must be preserved in naming and ownership.

This plan does not need to build the future generic attribute-modifier system merely to document this composition boundary.

## 11. Equipment carry bonuses

`Inventory.maxWeight` already derives its effective capacity from a base limit plus `carryCapacityBonus` values such as backpack capacity.

Preserve this behaviour.

Conceptually:

```text
humanBaseCarryCapacity(effectiveStrength)
+ equipment carryCapacityBonus
→ final maxWeight
```

Equipment bonuses remain additive.

Do not:

- multiply backpack bonuses by Strength;
- convert equipment bonuses into Strength;
- modify item weights;
- change backpack catalog values;
- let Strength alter inventory size/gabarite capacity.

Weight and gabarite remain separate constraints.

If implementation requires changing how `Inventory` receives its base max weight, make the smallest adaptation that keeps `Inventory` attribute-agnostic.

`Inventory` should receive/derive a capacity value, not know what Strength is.

## 12. Encumbrance remains unchanged

Keep `computeEncumbrance(loadKg, capacityKg)` semantics unchanged.

Strength influences capacity upstream.

Existing overload behaviour remains authoritative.

Do not add:

- Strength-specific movement speed bonuses;
- Agility interaction;
- alternative overload thresholds;
- new weight penalties.

Movement/Agility belongs to a later plan.

## 13. NPC `carried` is not yet physical human capacity

NPC currently uses a temporary carried inventory with `NPC_CARRY_MAX_WEIGHT = 5 kg`.

This existing inventory acts as a **temporary logistics carrier** used by systems such as:

- resource gathering;
- hunter yield;
- profession transfers;
- household/economy logistics;
- carried weapons/ammunition.

The current `5 kg` value is gameplay/logistics tuning.

It must not be interpreted as the biological carrying capacity of an NPC.

Therefore `npc-020` must **not** replace it with the human Strength carry resolver.

Doing so would silently rebalance multiple NPC economy/logistics flows.

## 14. Future NPC physical carrying boundary

Document the intended later distinction:

```text
human physical carrying capability
vs
task/logistics cargo allowance
```

A future NPC carrying/logistics plan may resolve:

```text
physical capacity
+ equipment
+ current carried gear
+ task/logistics constraints
→ permitted cargo
```

`npc-020` establishes the human carrying semantics needed for that later integration but leaves current NPC logistics quantities unchanged.

## 15. Do not convert logistics constants into Strength

Do not change constants such as:

- `HELPER_DELIVERY_MAX_CARRY`;
- household transfer batch limits;
- trader batch sizes;
- hunt expedition limits;

into formulas based directly on Strength.

Do not scatter logic such as `Math.round(strength * maxItems)` through NPC economy code.

Those constants currently represent task/logistics tuning, not physical human capability.

Their migration should happen only when NPC cargo capacity is deliberately modeled end-to-end.

## 16. Capability ownership after npc-020

The intended architecture becomes:

```text
PhysicalAttributes.strength
        │
        ├── human/profile resolution
        │
        ▼
resolved Strength
        │
        ├── melee consumer
        │      → damage multiplier
        │
        ├── physical-work consumer
        │      → duration/speed
        │
        └── human-carry consumer
               → body carry capacity kg
                       │
                       + equipment carry bonuses
                       ▼
                 Inventory capacity
                       ▼
                 existing encumbrance
```

No consumer should reach sideways into another consumer.

Examples:

- carry resolver does not know melee;
- melee resolver does not know Inventory;
- physical-work resolver does not know Stamina;
- `PhysicalAttributes` does not expose gameplay multiplier methods.

## 17. Tests

### Physical work

Protect at least:

- `Strength 0.0 → work speed ×0.75`;
- `Strength 0.5 → ×1.00`;
- `Strength 1.0 → ×1.25`;
- Player starting `Strength 0.6 → ×1.05`;
- higher Strength monotonically shortens physical-work duration;
- neutral Strength preserves legacy duration exactly;
- Player and NPC use the same shared rule;
- explicitly non-physical actions remain unchanged;
- action completion still happens once;
- cancellation semantics remain unchanged.

Do not require integration tests for every BusyAction.

Prefer focused resolver tests plus representative Player/NPC integration tests.

### Carrying

Protect at least:

```text
Strength 0.0 → 14 kg
Strength 0.5 → 20 kg
Strength 0.6 → 21.2 kg
Strength 1.0 → 26 kg
```

Also verify:

- equipment `carryCapacityBonus` remains additive;
- attribute bonuses and kg bonuses stay conceptually separate;
- authoritative simulation capacity is not rounded;
- item weights remain unchanged;
- liquid mass remains unchanged;
- carried-container weight remains included;
- gabarite capacity remains independent;
- encumbrance thresholds remain unchanged;
- Player starting Strength produces the expected base capacity;
- no NPC logistics constant changes as a side effect.

## 18. Documentation and discovery

Update canonical state documentation after implementation.

For Player document:

```text
Strength → physical work speed
Strength → human body carry capacity
body capacity + equipment bonuses → maxWeight
maxWeight + actual load → existing encumbrance
```

For NPC document:

- Strength-sensitive real physical work;
- NPC temporary `carried` inventory remains logistics/task capacity, not biological capacity;
- NPC physical carrying integration is deferred.

Do not duplicate the biological/species reference tables.

`docs/world/species-physical-reference.md` remains authoritative for the rule that SPEA is species-relative and raw Strength is not kilograms.

`docs/world/human-strength-calibration.md` remains authoritative for human Strength calibration.

Add/update JSDoc where new architectural/public capability resolvers benefit preflight discovery, using `@domain` tags where appropriate.

## Non-goals

`npc-020` does **not** implement:

- Endurance consumers;
- Stamina maxima/recovery changes;
- Vigor changes;
- fatigue;
- work skills/proficiency;
- profession skill;
- tool-quality work multipliers;
- work yield bonuses;
- Strength-dependent resource yield;
- generic attribute-modifier framework;
- injury/disease Strength penalties;
- attribute progression;
- UI for attributes;
- fauna carrying;
- horse/donkey carrying;
- species-general carrying resolver;
- NPC physical encumbrance;
- NPC movement slowdown from cargo;
- replacement of `NPC_CARRY_MAX_WEIGHT`;
- NPC logistics/economy batch-size rebalance;
- body mass/build;
- Agility movement effects;
- changing item weights;
- changing backpack bonuses;
- changing encumbrance thresholds.

## Expected integration points

Focused recon identified these likely seams:

- shared SPEA/Strength code introduced by `npc-019`;
- `src/app/actions/groundActions.ts`;
- other explicit heavy Player action call sites confirmed during implementation recon;
- the existing BusyAction mechanism, which should remain generic;
- `src/ai/npcProfessionWork.ts`;
- `src/ai/NpcAgent.ts` only where Strength/profile data must be threaded into work context;
- `src/items/Inventory.ts`;
- `src/player/PlayerController.ts`;
- `src/player/playerEncumbrance.ts`;
- `src/app/gameLoop.ts` where current load/capacity is combined;
- `docs/state/player-systems.md`;
- `docs/state/npc.md`.

These are integration seams, not a mandate to modify every file.

Prefer the smallest changes that preserve existing ownership.

## Verification

Use current repository scripts from `package.json`.

Run focused tests for:

- Strength work resolver;
- relevant Player action integration;
- NPC profession-work integration;
- carry-capacity resolution;
- Inventory capacity/equipment composition;
- existing encumbrance behaviour.

Then run the normal repository typecheck/build/test gates applicable to the changes.

Do not run `pnpm docs:sync` manually; derived documentation is handled by the GitHub workflow.

Browser/manual verification is performed by the User.

Manual checks should include:

- Player with starting Strength `0.6` completes physical work slightly faster than legacy neutral timing;
- temporary Strength variation visibly changes physical work duration;
- NPC miners with different Strength take different times to perform the same mining task;
- fishing/patrol/non-physical work remains unchanged;
- Player starts with `21.2 kg` body-derived capacity before equipment bonuses;
- backpack/carry bonuses remain additive;
- overload slowdown/blocking behaves exactly as before;
- NPC hunting/logistics carry quantities do not change.

## Stop conditions

- If implementing Strength requires making every BusyAction attribute-aware, stop and keep the resolver at explicit physical call sites.
- If an action duration contains substantial waiting/process time rather than manual effort, do not blindly apply the full Strength work multiplier.
- If Player carry integration requires `Inventory` to know about SPEA, keep Strength resolution outside `Inventory` and pass/derive only the resulting capacity.
- If changing NPC `carried` capacity affects hunter/logistics/economy tuning, do not change it in this plan.
- If an NPC work action has no genuine physical world task, do not add artificial work solely to expose Strength.
- Do not use this plan to redesign BusyAction, Inventory, NPC professions or settlement logistics.

## Completion criteria

The plan is complete when:

- one shared physical-work Strength rule exists;
- Player physical work uses it at explicit appropriate actions;
- at least one real NPC physical-work action uses the same rule;
- `Strength = 0.5` preserves previous work timing;
- Player starting `Strength = 0.6` naturally receives its small work-speed advantage;
- Strength changes Player human base carry capacity through an explicit human resolver;
- `Strength = 0.5` resolves to the existing `20 kg` human baseline;
- Player starting `Strength = 0.6` resolves to exactly `21.2 kg` without simulation rounding;
- equipment carry bonuses remain separate and additive;
- explicit kg bonuses remain semantically distinct from attribute bonuses;
- existing encumbrance remains authoritative and unchanged;
- NPC `5 kg` temporary logistics carrier remains unchanged;
- no Endurance, generic modifier framework or logistics rebalance is introduced;
- tests and canonical docs reflect the resulting ownership.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
