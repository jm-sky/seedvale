# Implementation Notes: NPC Death & Corpse Lifecycle

**Plan:** `npc-010-death-and-corpse-lifecycle.md`
**Status:** `planned`

## Current-code findings

- NPC life is already authoritative in `NpcAuthoritativeState.health`, owned by the `NpcStateRegistry` on `SettlementsManager`. It survives settlement unload/reload and `WorldBundle` rebuilds. `HealthState.dead` is therefore the correct life/death source of truth.
- The normal NPC damage path is already centralized in `NpcAgent.takeDamage()`: it calls `damageHealth()`, then invokes `die()` when the hit crosses into `dead`. `applyIncomingCombatDamage()` is the combat adapter and routes resolved damage into the same path.
- `NpcAgent.die()` currently only performs runtime/death presentation cleanup: releases conversation/queue state, clears combat/action state, stops animation, rotates the mesh and hides HP UI. It explicitly does **not** create a corpse or consume inventory.
- A dead authoritative NPC is passed through `die()` again when a new `NpcAgent` is constructed from an already-dead state. Therefore corpse creation must **not** simply be attached to `die()`; that would duplicate post-death processing on reconstruction.
- The existing animal corpse lifecycle is **not** a generic corpse system. It is implemented inside `AnimalAgent` using `timeSinceDeath`, `corpseHeld`, `meatHarvested`, `CorpsePhase`, `corpsePhaseFromElapsed()` and `readyToRemove()`. `harvestedRemains.ts` supplies reusable remains presentation, but there is no shared NPC/animal corpse manager.
- Animal decay is simulation-time driven and explicitly keeps lifecycle progression independent of FX distance/rendering. Reuse those semantics, but do not make NPCs depend on `AnimalAgent`.
- `Inventory` is reusable and supports stack counts plus instance-backed items, with independent weight/size checks. However `NpcAgent.carried` is deliberately documented as a **temporary work/resource carrier**, not a persistent personal inventory.
- `NpcAuthoritativeState` explicitly excludes `carried`. It resets when an `NpcAgent` is reconstructed. This is important: blindly moving all `carried` contents to corpse loot would turn transient ore/work resources into personal belongings and would also expose a lifecycle that currently is not authoritative.
- `npcLoadout.ts` seeds role weapons, knives and hunter arrows directly into `carried`. These are the strongest candidates for future personal belongings, but today they are still transient runtime state. Do not silently make them persistent by this plan.
- `Household.items` is the authoritative owner for household-level discrete goods (meat/hide/arrows/bandages etc.). `Household.stock` owns scalar economic resources. Do not move household/work resources into NPC corpse loot.
- `QuestManager.relations` is player↔NPC relationship/standing data. It is not an ownership/legal/reputation system and has no corpse-looting authorization concept.

## Architecture decisions / recommendations

### 1. Keep `NpcAgent.die()` as runtime cleanup, not corpse ownership

The post-death transition should be triggered only on the actual alive→dead edge, not whenever a dead NPC is reconstructed.

Prefer a small death hook/callback from the NPC lifecycle into the settlement/world owner, e.g. conceptually:

`takeDamage() -> dead transition -> onNpcDeath(id, position, ...)`

Keep `die()` responsible for stopping the agent. The callback/owner creates or registers the corpse exactly once.

Do not add a second HP/death state.

### 2. Corpse state must outlive `NpcAgent`

A corpse cannot be owned only by `NpcAgent`: settlement streaming destroys/recreates agents. Store the authoritative corpse record outside the agent, keyed by stable NPC id, in the settlement/world ownership layer.

The record should contain only what is needed to resolve the lifecycle and world representation, for example:

- stable NPC id,
- death position/yaw,
- death-time/lifecycle anchor,
- lifecycle state/flags,
- loot inventory (once ownership semantics are settled),
- burial handoff/held state needed by npc-011.

Do not keep a live `NpcAgent` reference from the corpse.

### 3. Do not force the animal implementation into an NPC abstraction prematurely

The current animal implementation is the best behavioural reference, not a ready-made shared service. If extracting a shared mechanism, extract only the pure lifecycle/state calculation that is genuinely common (phase + elapsed-time + held/processed/removal rules).

Keep species/NPC-specific presentation and harvesting rules outside that abstraction.

The existing `harvestedRemains.ts` can be reused for a bones/remains visual where semantically appropriate. Do not copy `animalHarvest.ts` into an NPC-specific variant.

### 4. Resolve the persistence boundary explicitly

Full save/load currently does **not** persist NPC runtime state. The authoritative NPC registry is only an in-session continuity mechanism.

Therefore npc-010 should not add partial corpse persistence unless the plan is deliberately expanded. Otherwise a save can contain:

`NPC alive/freshly regenerated after load`

while the pre-save corpse is gone, because NPC death/HP is not in `SaveData`.

This is an existing architectural boundary, not a corpse bug. Verification for npc-010 should distinguish:

- same-session stream-out/in / `WorldBundle` rebuild — must preserve death/corpse/loot without duplication;
- full save/load — NPC runtime/corpse persistence remains out of scope unless a persistence plan takes ownership.

Do not add a corpse-only save schema that creates a second inconsistent NPC persistence model.

### 5. World-independence means no render dependency, not off-screen NPC simulation

NPCs currently exist/tick as part of loaded settlements. There is no full off-screen NPC simulation that can currently produce a new NPC death while its settlement is unloaded.

The corpse record itself should nevertheless be simulation-owned and independent of camera/rendering. Once created, its decay must not require the corpse mesh to remain loaded.

For robust streaming, prefer an absolute simulation-time/death-time anchor or equivalent lazy resolution over a render-frame timer tied to a Three.js object. This also makes unload/reload and time-skip handling deterministic.

## Loot: important current limitation

The plan's distinction between personal belongings and transported resources is correct, but the current code does not yet have a persistent NPC personal-inventory ownership model.

Before implementing loot, trace every current use of `carried`:

- role weapon / knife loadout,
- hunter arrows,
- mined ore,
- harvested food/hide during hunting,
- dialogue assistance items,
- deposits/exchanges.

Only items with a defensible personal-ownership contract should enter corpse loot.

In particular:

- mined ore must remain a transport/work item;
- household goods must remain owned by `Household.items`;
- settlement/economy resources must never become personal loot;
- a temporary deposit payload must not be duplicated into a corpse;
- instance-backed weapons must preserve their instance id/state if they are eventually classified as personal.

If the implementation needs durable personal belongings, prefer extending the existing NPC authoritative state with the **minimal owned inventory state** rather than treating the transient `carried` inventory as authoritative. This is a meaningful architectural change and should not be hidden inside corpse code.

## Loot transfer

Reuse `Inventory.canAdd()`, `canAddInstance()`, `add()`, `addInstance()`, `remove()` and `removeInstance()`. Do not mutate the backing maps or invent corpse-specific item storage semantics.

For an atomic transfer:

1. determine exactly which item units/instances are eligible;
2. check receiver capacity before removing them from corpse;
3. transfer only the amount that fits;
4. leave the remainder in corpse.

For instance items, preserve the original `ItemInstance.id` and state. Never clone an instance into two owners.

Perishable food needs the existing food-batch semantics; do not collapse it into plain counts if it ever becomes eligible loot.

## Unauthorized looting / reputation is currently underspecified

There is no existing legal/ownership/reputation mechanism that can currently distinguish `authorized recovery` from `unauthorized looting`.

`QuestManager.getRelation()/getPlayerStanding()` is not a substitute.

Do **not** invent a new global reputation/legal system inside npc-010. The safest implementation boundary is to expose a minimal loot-consequence seam and leave it inert until an existing ownership/authority source can supply the decision, or explicitly narrow npc-010 to neutral transfer semantics.

This is a plan-level gap worth resolving before implementation; otherwise an agent will likely create an unjustified second reputation system.

## Burial handoff

The corpse record should expose enough stable state for npc-011 to claim/hold it later, but npc-010 should not decide burial.

Avoid locking the implementation to `canBeBuried()` / `bury()` before npc-011 defines the contract. A small internal lifecycle state such as `held/buried` is fine if it is needed to prevent natural cleanup, provided it does not become a burial decision system.

Natural decay must check the handoff/held state before cleanup.

## Lifecycle and cleanup

Use the existing animal lifecycle as the tuning/reference point:

- `fresh`
- `rotting`
- `bones/remains`
- removed

The current animal implementation has explicit 20s/40s phase thresholds and 60s unharvested lifetime; do not copy these values automatically to NPCs unless the design intends identical timing.

Most importantly, separate:

- authoritative lifecycle state/time,
- Three.js representation,
- loot ownership,
- cleanup/removal.

A corpse mesh disappearing must never be the event that advances or completes the lifecycle.

If the corpse is streamed out, keep only its authoritative record. When streamed back in, reconstruct presentation from that record instead of starting a new timer.

## Integration points

Likely ownership path:

`NpcAgent`
→ actual death transition
→ `createSettlement.ts` / settlement-owned death hook
→ settlement/world corpse registry
→ corpse presentation + interaction

Relevant existing seams to reuse:

- `HealthState` / `damageHealth` for life state;
- `NpcAuthoritativeState` / `NpcStateRegistry` for stable NPC identity and in-session continuity;
- `NpcAgent.die()` for stopping active behaviour;
- `Inventory` for item transfer and instance preservation;
- `Household.items` / `Household.stock` for non-personal ownership;
- `harvestedRemains.ts` for reusable remains presentation;
- existing animal corpse phase/timing logic as the lifecycle reference;
- existing NPC trace/inspection infrastructure for diagnostics.

Do not introduce a global God-object that owns health, NPC AI, inventory, relationships and corpse rendering.

## Important edge cases

- A dead NPC reconstructed from `NpcStateRegistry` must not create a second corpse.
- A lethal hit must end active combat/action state before corpse ownership is finalized.
- Death must release interaction queues/conversation exactly as current `die()` does.
- A corpse must not keep a reference to a disposed `NpcAgent`.
- Settlement stream-out must not turn a live corpse record into a fresh NPC or lose its loot.
- Loot transfer must be one-way and capacity-aware.
- Natural cleanup must never remove unclaimed loot silently. Define an explicit rule for what happens to loot when the corpse reaches the terminal phase; the current animal remains path does not solve this for item-bearing NPC corpses.
- Burial handoff must block natural cleanup after the burial system claims the corpse.
- Time skip must advance corpse lifecycle through simulation time, not by relying on render updates.
- If a corpse is represented by a cloned NPC mesh, dispose it through the normal Three.js disposal path and never leave the original agent/label references attached.

## Debug

Reuse the existing NPC inspection/trace style rather than creating a separate diagnostics framework.

Useful minimum data:

- NPC id + `health.dead`,
- corpse id / source NPC id,
- death position,
- lifecycle phase + elapsed/anchor time,
- held/burial state,
- eligible loot summary,
- actual corpse inventory contents,
- cleanup reason.

The debug surface should read authoritative state, not infer death from whether a mesh happens to exist.

## Suggested implementation order

1. Confirm all current NPC lethal-damage paths still converge on `NpcAgent.takeDamage()`.
2. Define the minimal corpse record/ownership boundary outside `NpcAgent`.
3. Add the one-time alive→dead hook without changing `HealthState`.
4. Separate corpse lifecycle state from NPC runtime/mesh lifetime.
5. Add corpse presentation and streaming reconstruction.
6. Resolve/classify NPC carried items before implementing loot transfer.
7. Add inventory transfer with instance/stack atomicity.
8. Add burial handoff guard.
9. Add cleanup and explicit unclaimed-loot rule.
10. Add focused tests for death idempotency, streaming/rebuild continuity, lifecycle timing and inventory atomicity.

The biggest implementation risk is treating today's transient `carried` inventory as a personal NPC inventory. The second is attaching corpse creation to `die()`, which is called again when an already-dead authoritative NPC is reconstructed.

## Verification scope note

The plan's full-save/reload verification cannot currently be satisfied without crossing the explicit NPC persistence boundary. Keep npc-010 verification focused on same-session streaming/rebuild and simulation lifecycle unless persistence ownership is intentionally moved to a separate plan.
