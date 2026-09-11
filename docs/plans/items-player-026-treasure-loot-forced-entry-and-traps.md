# Plan: Treasure loot, forced entry and traps

**Created:** 2026-09-11  
**Status:** `verification needed` 🔍  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** world-024  
**Domain:** `items-player`  
**Subdomains:** `items` `interaction` `tools` `player-needs`  
**Tags:** `treasure` `loot` `gems` `containers` `forced-entry` `traps`  
**Roadmap:** -

## Goal

Complete the systemic treasure gameplay loop introduced by `world-024` with valuable deterministic loot and a meaningful alternative to finding the matching key.

```text
systemic treasure chest
→ unlock safely with matching key
   OR
→ attempt forced entry
→ mechanical result + optional trap
→ persistent physical consequences
→ surviving loot
```

Treasure should provide meaningful rewards such as coins, rubies and diamonds, while forced entry introduces persistent risk through mechanical damage and optional traps.

The feature extends existing items, containers, player damage, interaction and action mechanisms. It must not introduce a parallel treasure inventory, damage pipeline or treasure-only player status system.

## 1. Core invariants

Treasure loot belongs to the physical chest/container, not quest reward state.

A treasure chest may be found, forced open, damaged and emptied without any quest being active. Future quests observe those consequences rather than regenerating expected rewards.

Forced-entry attempts must be deterministic and persistent. Save/reload must not allow the player to reroll the same committed attempt.

Mechanical forced-entry outcome and trap outcome are separate concepts. A difficult lock does not imply a trap, and a trap does not define how mechanically difficult the chest is to force.

Coins and gemstones are physically resilient treasure and must not disappear merely because a damage/fire outcome destroys fragile contents.

Do not introduce a global item-condition/durability system solely for treasure damage.

## 2. Dependencies and ownership

`world-024` owns systemic treasure-site identity, stable chest/container identity, matching key, key placement, safe lock/unlock state and world placement/persistence foundation.

This plan owns:

- treasure loot composition;
- gemstone item variants;
- forced-entry interaction;
- deterministic attempt sequencing;
- mechanical force-entry resolution;
- trap configuration/resolution;
- resulting player damage;
- resulting loot/container damage semantics.

Existing systems remain authoritative for:

```text
container Inventory → chest contents
player damage       → HP / downed lifecycle
items               → physical loot
BusyAction/action   → timed player work, where applicable
save data           → persistent mutations
```

Do not duplicate these owners inside a treasure subsystem.

## 3. Treasure loot generation

Populate systemic treasure chests with deterministic physical loot.

Initial target:

```text
50–200 coins
+ gemstone reward
+ optional ordinary valuable items where existing catalog semantics make sense
```

Exact balance should remain configurable through small constants/tables rather than scattered literals.

Loot derives from stable treasure/chest identity and world seed or another existing deterministic RNG seam. Same unopened chest in the same world produces the same initial loot regardless of chunk load order, camera/player position, save/reload or interaction order.

Once the container inventory has been materialized/mutated, normal container inventory state is authoritative. Do not regenerate missing loot from seed after player interaction.

## 4. Coins

Reuse existing `coin`.

Initial systemic treasure target is 50–200 coins, with exact deterministic distribution tuned during implementation.

Do not create treasure-specific currency.

Coins are resilient contents: ordinary forced-entry damage and fire do not destroy them.

If a chest becomes destroyed, surviving coins remain recoverable through the smallest existing/reusable world-item, container-remains or equivalent physical mechanism available after implementation recon. Do not silently delete them or move them into an abstract reward ledger.

## 5. Gemstones

The current catalog already contains `ruby`.

Extend systemic gemstone treasure to support:

```text
ruby_small
ruby_medium
ruby_large

diamond_small
diamond_medium
diamond_large
```

Prefer ordinary `ItemKind`s. Do not introduce per-gem `ItemInstance` state merely to encode type and size unless current item architecture already provides a better reusable variant mechanism.

Gemstones do not require unique identity for treasure gameplay.

### Existing `ruby`

Preserve compatibility with current `ruby` and existing saves/authored content. Do not perform an aggressive save migration solely for this feature.

Prefer retaining `ruby` as a legacy/catalog item while systemic treasure uses sized variants, or map its economic meaning to a sensible default/medium ruby only where current call-sites and persistence make that safe.

Implementation recon must inspect current `ruby` usage before choosing.

## 6. Gemstone value

Gem value derives coherently from type × size:

```text
diamond > ruby
large > medium > small
```

Exact prices follow existing item/economy value conventions. Do not introduce treasure-only monetary value.

Gemstones remain ordinary physical world items that can later participate in trade, crafting, gifts, quests or settlement/household wealth through shared systems. This plan need not implement all those consumers.

## 7. Loot composition

Keep composition data-driven and small.

Conceptually:

```ts
type TreasureLootProfile = {
  coinRange: ...
  gemstoneRolls: ...
  ordinaryValuables?: ...
}
```

Prefer an existing deterministic loot/reward-selection mechanism if current code has one suitable for physical container items.

Treasure loot must not directly grant XP, reputation, quest completion or abstract money balances.

## 8. Forced entry as an alternative strategy

A locked systemic treasure chest can be opened without its matching key by attempting forced entry:

```text
find key → safe unlock

OR

force entry → direct path → mechanical risk + possible trap
```

Forced entry must reuse existing player capability/tool/action concepts where practical.

Before implementation, recon current tools, skills/capabilities, interaction action semantics, BusyAction/work mechanisms and stamina/vigor costs.

Do not introduce `TreasureBreakingSkill`, chest-specific progress resources or an isolated interaction loop.

## 9. Forced-entry requirements

Forced entry should require a plausible existing physical capability.

Prefer an existing suitable heavy/prying/striking tool or capability if represented in the item/tool system. Do not add a new tool solely because treasure needs a button unless that tool has broader reusable world utility.

If multiple existing tools are suitable, their existing properties/skills may influence mechanical success/risk rather than hard-coding treasure-only tool tiers.

Exact mapping is deferred to implementation recon because current code is authoritative.

## 10. Forced-entry action

Forced entry should be a real player action rather than an instant UI dice roll.

Where current action architecture supports it, reuse timed/BusyAction behavior and normal interruption, stamina/vigor, movement restrictions and feedback.

Conceptual flow:

```text
locked chest
→ [Force open]
→ validate tool/capability
→ begin normal timed action
→ commit/complete attempt
→ increment/commit attempt sequence atomically with resolution
→ resolve mechanical result
→ resolve optional trap
```

If interrupted before the existing action's commit/resolution point, do not consume an attempt. Once committed, attempt identity/result must not be rerollable through cancellation or reload.

## 11. Deterministic attempt sequence

Do not preassign one immutable force outcome to the chest independent of player capability.

Use a deterministic attempt sequence so real tool/skill/capability differences can matter while preventing save-scumming.

Conceptually:

```text
chestId
+ attemptIndex
+ stable relevant capability snapshot
→ deterministic mechanical result
→ deterministic trap resolution where applicable
```

`attemptIndex` is persistent chest/world mutation state.

At the resolution/commit boundary, increment/record the attempt atomically with its resolved consequences so a save/reload cannot repeat the same committed attempt with different inputs or RNG.

Do not use ambient/global mutable RNG whose result depends on unrelated world actions.

Capability snapshot must contain only gameplay inputs that legitimately affect forced entry; do not include frame timing or incidental runtime state.

## 12. Mechanical result and trap are separate

Model forced entry as two related but distinct dimensions.

### Mechanical result

V1 may use a small result set such as:

```text
opened_clean
opened_damaged
failed
```

Mechanical result answers whether/how the lock/chest yielded to force.

### Trap

A chest may independently have:

```text
none
fire
blade
```

Trap presence/type should be deterministic site/chest configuration. Trap triggering may depend on the committed force attempt/mechanical interaction, but must resolve deterministically and at most according to its intended one-shot semantics.

This separation must allow combinations such as:

```text
difficult untrapped chest
easy trapped chest
opened cleanly but trap triggered
opened with mechanical damage and no trap
```

Do not encode `success / damaged / fire / blade` as one mutually exclusive outcome enum.

## 13. Failed attempts

A mechanical `failed` attempt leaves the chest locked unless existing mechanics justify partial persistent progress.

The attempt is still committed and advances `attemptIndex`.

A failed attempt may still trigger a trap if the deterministic trap semantics say that manipulating/striking the lock triggered it.

Do not add chest-specific progress accumulation unless a reusable existing work/damage mechanism naturally supports it.

Repeated attempts are allowed when the chest remains physically forceable, but each uses the next deterministic attempt index rather than rerolling the previous attempt.

## 14. Successful forced opening

When the mechanical result opens the chest:

- chest becomes accessible without matching key;
- normal container UI/lifecycle takes over;
- contents are modified only by separately resolved damage/trap consequences.

The matching physical key elsewhere is not magically deleted. If later discovered, it remains an ordinary physical consequence of the generated world.

Future quests observe that the chest was already forced open.

## 15. Mechanical contents/chest damage

`opened_damaged` may damage the chest and destroy a deterministic subset of vulnerable loot.

Do not introduce universal item condition/durability solely for this feature.

Prefer simple deterministic survival/destruction based on reusable item physical properties/categories.

At minimum:

```text
coins       → resilient
gemstones   → resilient
fragile/flammable ordinary loot → eligible for loss
```

If current metadata lacks a reusable classification, add the smallest general property seam justified by the physical concept rather than hard-coded treasure item names.

Destroyed contents are persistent mutations to existing container inventory.

## 16. Fire trap

Fire is a trap consequence, not synonymous with automatic total chest destruction.

Resolve a deterministic severity appropriate to the existing physical state model. Conceptually it may produce:

```text
contents scorched/damaged
chest damaged
chest destroyed
```

V1 does not need a universal multi-level durability system. If existing state only supports a smaller useful distinction, implement the smallest coherent persistent consequence while preserving the conceptual separation between fire and chest destruction.

Fire should destroy eligible flammable/fragile contents while preserving resilient valuables such as coins and gemstones.

Do not build a full dynamic fire simulation solely for treasure. If Seedvale already has a reusable fire/damage mechanism at implementation time, integrate with it; otherwise represent the immediate persistent consequence without a parallel environmental fire system.

### Surviving valuables

If the chest becomes destroyed, surviving coins/gems must remain physically recoverable exactly once.

Prefer, in order:

1. existing destroyed-container/remains inventory behavior;
2. existing physical world-item drop mechanism;
3. smallest reusable container-remains representation.

Do not create a treasure-only invisible reward ledger.

## 17. Blade trap

A blade trap causes immediate physical player damage.

Route it through normal player damage and existing defense/downed/death semantics:

```text
blade trap
→ player damage API
→ existing HP / defense / downed lifecycle
```

Do not mutate player HP directly from treasure code if the existing damage pipeline owns it.

Damage amount should be balanceable and should not require a treasure-specific damage type unless a reusable damage-type concept already exists.

## 18. Poison / illness

Poisoned blades remain part of the desired final design, but V1 must not introduce isolated treasure poison state.

Current recon found player damage/needs infrastructure but no suitable shared generic illness/poison/status-effect system.

Therefore V1 is:

```text
blade trap
→ immediate normal damage
```

When a shared ailment/status mechanism exists:

```text
poisoned blade
→ immediate normal damage
→ shared poison/illness effect
```

If implementation recon still confirms no reusable ailment mechanism, poison remains deferred.

Do not add `treasurePoisonTimer`, chest-owned sickness state or a second player-needs/status pipeline.

If poison is required before a shared mechanism exists, create a separate reusable `items-player` ailment/status plan rather than expanding this plan opportunistically.

## 19. Noise / disturbance consequence

Forced entry is physically noisy and should connect to shared world perception when such a seam exists.

During implementation recon, check for an existing reusable world noise/disturbance/perception event used by NPCs or fauna.

If one exists, emit an appropriate disturbance from force-entry actions so nearby systems can react through their normal behavior.

If no shared seam exists, do **not** create treasure-specific NPC/fauna alert logic or expand this plan into a new perception system. Leave that integration deferred for a dedicated shared mechanism.

Noise must not make treasure dependent on the player/camera for world-state correctness.

## 20. Chest damage/destruction state

Forced-entry mechanics or fire may require a systemic treasure chest to become permanently damaged or destroyed.

Extend the smallest appropriate existing world/container state seam.

A destroyed chest must:

- not return intact after streaming;
- not regenerate original inventory;
- not be restored by its matching key;
- preserve recoverable resilient contents;
- remain consistent after save/load.

Do not add generic durability/destruction semantics to every player container unless implementation recon demonstrates a genuinely reusable generic concept.

As with lock state in `world-024`, treasure-specific mutation may remain thin world-side state keyed by stable `containerId`.

## 21. Persistence and anti-reroll

Persist physical mutations and committed attempt state, not rerollable intentions.

Relevant state may include:

```text
attemptIndex
committed/resolved attempt outcome when required for atomic recovery
trap resolved/triggered state
forced-open state
chest damaged/destroyed state
resulting container inventory
surviving dropped/remains items
```

Do not persist deterministic loot/trap definitions when safely reconstructable.

Persistence must make the commit boundary crash/save safe: after reload, a committed attempt must neither disappear nor resolve differently, and consequences must not apply twice.

After save/load:

- initial treasure loot does not regenerate;
- destroyed contents remain destroyed;
- resolved one-shot trap does not trigger again incorrectly;
- damaged/destroyed chest remains so;
- surviving valuables remain available exactly once;
- forced-open chest remains accessible;
- failed committed attempt remains consumed;
- next attempt uses the next deterministic attempt index.

Use current save schema/versioning conventions and migrations/defaults only where required for compatibility.

## 22. Interaction and feedback

Reuse existing interaction/action feedback.

A locked systemic chest should expose contextually valid actions such as safe key opening and forced opening only when actually available.

Feedback should communicate meaningful requirements/outcomes: missing tool/capability, force progress, failed attempt, broken lock, damaged contents, trap trigger, player injury or destroyed chest.

Do not create a dedicated treasure screen. Normal chest inventory continues through existing container UI.

## 23. Quest independence

No quest logic belongs in this plan.

Future quests observe physical outcomes such as safely unlocked, forced open, damaged/destroyed, already looted, key acquired or key still present.

A quest must never restore loot or chest state because its expected path was invalidated by earlier player action.

## 24. Performance

Forced-entry/trap systems are event-driven.

Do not introduce per-frame treasure updates, trap scans, global chest polling or a worker for deterministic rolls.

Loot generation occurs at deterministic site/container materialization or another existing low-frequency lifecycle seam. Force/trap resolution occurs only on committed interaction actions.

Persisted attempt/trap state should remain compact.

## 25. Likely implementation surfaces

Current known relevant areas include:

```text
src/items/items.ts
src/items/itemCatalog.ts
src/items/itemInstances.ts
src/items/container.ts
src/world/createPlacedContainers.ts
src/player/PlayerNeeds.ts
src/player/playerDamage.ts
src/persistence/saveData.ts
```

Also recon current player skills/capabilities, tool definitions, BusyAction/player work actions, container interaction, physical world-item/drop lifecycle, item value/economy metadata and shared noise/disturbance/perception seams before choosing exact integration points.

`world-024` is authoritative for systemic treasure-site/chest/key ownership.

Do not create `TreasureLootManager` or `TreasureTrapManager` unless actual active runtime responsibilities justify one.

## 26. Automated verification

Add focused deterministic/domain tests.

### Loot

- same treasure identity → same initial loot;
- coins remain within configured range;
- gemstone selection is deterministic;
- initial loot is not regenerated after container mutation;
- generation does not depend on chunk/interact order.

### Gems

- six new size/type variants have expected catalog metadata;
- values preserve intended type/size ordering;
- existing legacy `ruby` remains compatible;
- gems behave as ordinary inventory/container items.

### Key opening regression

- correct key opens safely without forced-entry risk;
- safe key opening does not trigger/consume forced-entry trap resolution;
- wrong key does not unlock.

### Attempt sequence

- same chest + attempt index + relevant capability snapshot → same result;
- changed legitimate capability can affect deterministic resolution;
- committed attempt increments/records exactly once;
- interruption before commit does not consume an attempt;
- reload cannot replay a committed attempt with different inputs/outcome;
- failed attempt advances sequence.

### Mechanical/trap separation

- untrapped chest can fail mechanically;
- trapped chest can open cleanly mechanically while triggering its trap;
- mechanical damage and trap consequences compose without double-applying inventory mutation;
- trap one-shot semantics persist.

### Contents damage

- deterministic vulnerable subset is removed;
- coins survive;
- gemstones survive;
- resulting inventory persists.

### Fire

- fire severity is deterministic;
- fire is not inherently equivalent to chest destruction;
- eligible vulnerable contents are affected;
- coins/gems survive;
- if destroyed, chest remains destroyed and survivors remain recoverable exactly once.

### Blade

- player damage uses normal damage pipeline;
- existing downed/death behavior remains authoritative;
- trap does not apply repeatedly after resolution.

### Noise

- if a shared disturbance seam exists and is integrated, force action emits through it rather than treasure-specific NPC/fauna calls.

### Persistence

For every relevant mechanical/trap combination:

```text
commit attempt
→ save
→ reload
```

reconstructs the same physical consequences without duplication or reroll.

## 27. Manual browser verification

Performed by the User.

Verify:

1. treasure chest contains meaningful physical loot;
2. coin amount is in expected range;
3. ruby/diamond size variants appear;
4. matching key safely opens without trap risk;
5. force-open requires appropriate existing capability/tool;
6. force-open behaves as a real action;
7. failed attempt can be retried but does not reroll the same attempt after reload;
8. better/different legitimate capability affects risk where implemented;
9. mechanical damage leaves resilient valuables;
10. trapped and untrapped chests can have independent mechanical outcomes;
11. fire consequences persist and do not automatically imply total destruction unless that severity was resolved;
12. destroyed chest leaves resilient valuables recoverable exactly once;
13. blade trap damages through normal health behavior;
14. resolved one-shot trap does not fire again;
15. save/reload cannot reroll committed outcomes;
16. looted/destroyed chest does not regenerate after leaving and returning;
17. forced entry produces shared disturbance reactions if such integration exists;
18. normal non-treasure/player-placed containers behave as before.

AI agents do not perform browser verification.

## Non-goals

This plan does not implement:

- systemic treasure-site generation;
- treasure key placement;
- treasure quests/maps/dialogue/procedural clues;
- lockpicking minigame or dedicated treasure skill;
- treasure-only tools;
- generic item durability/condition;
- full environmental fire simulation;
- treasure-specific poison/status system;
- a new NPC/fauna perception/noise system;
- treasure-specific inventory/UI;
- treasure respawn;
- per-frame trap simulation.

## Implementation guardrails

- Read and verify current `world-024` implementation before coding.
- Reuse normal container `Inventory`; loot is physical world state.
- Reuse normal player damage pipeline.
- Reuse existing tools/skills/action mechanisms before adding concepts.
- Keep mechanical force-entry result separate from trap type/resolution.
- Use a persistent deterministic attempt sequence rather than one chest-wide outcome.
- Commit attempt index and consequences atomically enough to prevent reload/cancel rerolls.
- Safe key opening must not trigger forced-entry risk.
- Do not create treasure-specific player status effects.
- Coins and gemstones survive ordinary contents damage and fire.
- Do not create global item durability solely for treasure.
- Fire does not automatically mean total chest destruction.
- Do not silently delete resilient loot when a chest is destroyed.
- Preserve existing `ruby` compatibility.
- Emit shared noise/disturbance only through an existing reusable seam; otherwise defer it.
- Keep treasure independent of quests.
- Do not introduce per-frame managers or unnecessary workers.
- Avoid unrelated refactors.
- Current code is source of truth if it differs from this plan.
- User performs manual browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
