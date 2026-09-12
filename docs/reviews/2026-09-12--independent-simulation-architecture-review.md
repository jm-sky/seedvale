# Independent Simulation Architecture Review

**Date:** 2026-09-12
**Head:** `1c0b88a8` (`origin/main`)
**Scope:** NPC + households + settlements + fauna as one interconnected simulation
**Status:** `done` (recon only — no implementation, no new plans, no browser verification)
**Independence:** this review did **not** read `docs/reviews/2026-09-12--living-world-consistency-audit.md` or any other living-world audit before recon. Findings come from current source, state/planning docs used only as routing, then verified against code.

## Method

Navigation followed `CLAUDE.md`: `CODE_INDEX` → `STATE.md` / `docs/state/{npc,settlements,fauna,persistence}.md` → `docs/architecture/ARCHITECTURE.md` → `docs/plans/README.md` → source.

Recent context is approximately the last 7 days of `main` (fauna-019/022/024/025, settlements-007, settlements-npcs-030, npc-036, items-player-027/029, world-026, household resource transfer). Queued plans were read only after the corresponding owners were located in code.

A finding is recorded only when it follows from:

- an existing system,
- an existing contract (comment, plan invariant, or architectural rule in code),
- an inconsistency between two live paths,
- a lost consequence,
- or a queued plan that would collide with the current owner.

Missing gameplay that would merely be interesting is out of scope.

Severity:

| Level | Meaning |
| ----- | ------- |
| **critical** | simulation identity or conservation can invert under ordinary play (save/stream/skip/death) |
| **high** | two live systems disagree about the same fact; consequence is lost or invented |
| **medium** | bounded leak or stale contract; world remains playable but the seam will not scale |
| **low** | local inconsistency, documented gap, or narrow timing window |

---

## Current owner map (verified)

This is the architecture that actually exists, not a target.

```text
World Time          DayNightState.elapsedDays / timeOfDay / dayLengthSec
                    tickDayNight() is the only clock advance

Simulation dt       gameLoop.tick → SettlementsManager.update / Fauna.update
                    gated off entirely while timeSkip.isActive()

Catch-up            skip.justFinished →
                      SettlementsManager.resolveTimeSkip  (loaded NPCs only)
                      resolveOffscreenTransportArrivals
                      Fauna.resolveTimeSkip               (wild agents only)

NPC identity        deterministic (families / npcIdentity / physical profile)
NPC authority       NpcAuthoritativeState on SettlementsManager.NpcStateRegistry
NPC execution       NpcAgent: phase, pendingAction, path, combatIntent, carried
Household           HouseholdRegistry (stock / water / items / agriculture stamps)
Settlement economy  EconomyRegistry
Transport           world-owned TransportOrder + NPC transportCargo
Livestock           AnimalAgent + LivestockRegistry (capture-on-unload/save)
Wild fauna          AnimalAgent population, unpersisted individuals
Rats                AnimalAgent + rat persistence + infestation record
Death               NPC: postDeath on authoritative state
                    Animal: corpse on the same AnimalAgent
```

The ownership split is sound. The defects below sit on **boundaries** between these owners, not inside any one of them.

---

## Findings

### F1 — Loaded presence changes whether World Time is applied

**Severity:** high
**Confidence:** high
**Domains:** time, streaming, NPC, livestock, rats, fauna, schedules

**Evidence**

- `src/app/gameLoop.ts` `tick()`: NPC/fauna/trap updates are skipped while `timeSkip.isActive()`; on `skip.justFinished` it calls `settlementsManager.resolveTimeSkip`, then `resolveOffscreenTransportArrivals`, then `fauna.resolveTimeSkip`.
- `src/settlement/SettlementsManager.ts` `resolveTimeSkip()` walks only live `entries` with a built `settlement` and calls `npc.resolveTimeSkip(...)`. No livestock, no rats, no detached player-owned animals, no unloaded snapshot catch-up.
- `unload()` snapshots livestock/rats and `dispose()`s the settlement. Unloaded NPCs therefore have no agent to replay.
- `src/fauna/createFauna.ts` `resolveTimeSkip()` iterates wild `agents` only.
- `src/ai/NpcAgent.ts` `resolveTimeSkip()` replays half-hour schedule steps (needs, vigor, stamina, household water, teleport to schedule place).
- `src/fauna/AnimalAgent.ts` `resolveTimeSkip()` is a one-shot `tickAnimalLife` + `advanceAge` / corpse timer. Settlement animals never receive it.
- Detached livestock is ticked in `SettlementsManager.update()` but omitted from `resolveTimeSkip()`.

**Scenario**

Player rests 12 hours in the home village. Loaded NPCs replay a day: they drink household water, teleport to work/home, and drain needs. Loaded sheep, the player's horse, and settlement rats keep yesterday's hunger/age/corpse timers. A settlement 500 m away has already streamed out — its NPCs, livestock and rats do not move in World Time at all. After the skip, wild deer have metabolized; the home flock has not.

**Systemic consequence**

The same `elapsedDays` is not a uniform simulation input. Presence (stream radius / which manager currently holds the live object) selects a different temporal semantics. This violates the stated invariant that time-skip follows the same rules as normal progression, and that the world must not depend on the player/camera being nearby.

**Minimal architectural direction**

Keep NPC stepped replay (schedules need it). Add a manager-level animal catch-up over loaded livestock, detached animals, and persisted unloaded records, using the existing one-shot `AnimalAgent.resolveTimeSkip` math. For unloaded NPCs, either persist a last-resolved World Time on `NpcAuthoritativeState` and apply the same stepped catch-up on stream-in, or accept a documented coarse unloaded NPC model and apply it at the same checkpoints as off-screen transport (stream transition + skip completion) — never leave them frozen.

---

### F2 — Stream-out resets NPC execution and invents a home teleport

**Severity:** high
**Confidence:** high
**Domains:** streaming, NPC, reconstruction, logistics, combat

**Evidence**

- `NpcAuthoritativeState` (`src/settlement/npcState.ts`) explicitly excludes `phase` / `pendingAction` / pathfinding / `combatIntent` / `carried`. Position is not a field.
- `SettlementsManager.unload()` disposes the live `NpcAgent`. `createSettlement.ts` rebuilds each agent at `homePlaces[familyIndex]` via `NpcAgent.create({ home, ... })`.
- `NpcAgent.dispose()` does not snapshot `carried` or position.
- `gameLoop` / `ARCHITECTURE.md` treat this as the same reconstruction used by save/load and `WorldBundle` rebuild.

**Scenario**

A miner finishes extracting ore and is walking to the stockpile. The player jogs past unload radius. On return, the miner is at home, `carried` is empty, the deposit is gone, and the ore is already gone from the world deposit. A hunter mid-combat similarly resumes at the house with a fresh `choose` phase.

**Systemic consequence**

Unload is not a fidelity change. It is a world mutation: position, in-flight action, and combat commitment are replaced by a home spawn. Two players (or one player, two routes) who differ only in whether they approached the village produce different NPC locations and lost work.

**Minimal architectural direction**

Persist a coarse continuity checkpoint on `NpcAuthoritativeState`: last committed world position and, if a conserved payload exists, that payload (see F3). Do not persist pathfinding. On materialization, spawn at the checkpoint, not always at `home`. In-flight `PlannedAction` may still reset; the conserved facts must not.

---

### F3 — `carried` is treated as a brief hold, but it already holds conserved resources

**Severity:** high
**Confidence:** high
**Domains:** NPC, economy, hunting, mining, persistence, death

**Evidence**

- `NpcAgent` constructs private `carried = new Inventory(..., NPC_CARRY_MAX_WEIGHT)` per instance (`NpcAgent.ts`).
- `npcState.ts` documents `carried` as transient work payload, excluded from `SaveData.npcStates`.
- Consumers that put real goods there: `npcProfessionWork.ts` (ore, fish, wool, herbs), `npcLogistics.ts` (food claims via `carryFoodClaim`), `NpcAgent.onHuntKill()` (`hunting.harvest(..., this.carried)`), hunter arrow resupply from `household.items` into `carried`.
- Wood/economy surplus still uses a **closure** `claimed` (`npcLogistics.ts` `claimEconomySurplus` / `claimHouseholdSurplus`) that is not even on `carried`.
- `commitNpcDeath()` (`npcPostDeath.ts`) moves only `personalInventory`. Comment records that `carried` and `transportCargo` are out of scope.
- `seedHunterStartingArrows(this.carried)` runs on every living reconstruction (`NpcAgent.create` path).

**Scenario A — destruction.** Hunter harvests a deer into `carried`, then the settlement unloads or the hunter dies. Meat/hide vanish. The carcass is already harvested (`meatHarvested`).

**Scenario B — minting.** Hunter spends all arrows. Stream-out/in reseeds starting arrows onto empty `carried`. Household arrows pulled into `carried` just before unload are destroyed, then a default stack is minted.

**Scenario C — wood leak.** Trader `onPickup` calls `claimEconomySurplus` into a local `claimed`. Dispose before `onDeposit` removes settlement wood with no receiver.

**Systemic consequence**

The inventory triad (`personalInventory` / `transportCargo` / `carried`) is the right shape, but only two of three are authoritative. Food logistics comments claim interruption no longer drops goods because they sit in `carried` — true only for the lifetime of this JS object. Reconstruction and death are silent resource sinks and, for hunter ammo, a source.

**Minimal architectural direction**

Promote work cargo onto `NpcAuthoritativeState` as a fourth, distinct inventory (or widen `carried` into that object), with an explicit death disposition: deposit to household, drop at corpse, or fail the originating claim. Wood/economy claims must use the same inventory, not a closure. Hunter starting arrows seed only on genuine first creation (`needsInitialPersonalLoadout`), never on reconstruct. Combat already reads ammo from `[personalInventory, carried]` (`resolveNpcAmmo`, items-player-027) — keep that, stop reminting.

---

### F4 — Carrier death does not terminate transport; streaming can complete it posthumously

**Severity:** high
**Confidence:** high
**Domains:** NPC death, transport, economy, off-screen simulation

**Evidence**

- `commitNpcDeath()` (`npcPostDeath.ts`) documents the gap: order stays `in-transit`, cargo stays on the dead NPC.
- `NpcAgent.die()` releases work contracts (`release(..., 'death')` / `markUncollectable`) but does not notify `TransportOrders`.
- `resolveOffscreenTransportArrivals()` (`transportOffscreen.ts`) checks `in-transit`, `execution.mode === 'off-screen'`, `arrivesAtDays`, and `getNpcState`, then `executeTransportUnload`. It does **not** check `carrierState.health.dead`.
- `beginOffscreenTransportHandoff()` (`SettlementsManager.unload`) will attach off-screen execution to any live `in-transit` carrier at unload time, including a corpse if the agent is still in `settlement.npcs`.

**Scenario**

Trader picks up household food (`in-transit`, cargo on `transportCargo`) and dies. If the settlement stays loaded, the order hangs forever: destination never receives goods, source cannot reclaim them, corpse loot does not include cargo. If the settlement then streams out, handoff writes `execution.arrivesAtDays`; the next stream/skip checkpoint delivers the food from a dead carrier.

**Systemic consequence**

Death is not a single economic transaction. The same death yields stranded cargo or a ghost delivery depending on stream timing. This is the opposite of the transport contract ("exactly one of detailed or off-screen execution; delivery once").

**Minimal architectural direction**

Add an idempotent `carrierDied` path on the transport owner: fail or reassign the order, and drop / refund / bury cargo exactly once. `resolveOffscreenTransportArrivals` must refuse dead carriers. Do not fold this into corpse loot as a silent default — pick one disposition and apply it at the alive→dead edge, the same way work contracts already do.

---

### F5 — Wild predators and settlement livestock do not share an encounter set

**Severity:** high
**Confidence:** high
**Domains:** fauna, livestock, predators, settlement defense, ownership

**Evidence**

- `createFauna.ts` `update()`: wild agents get `others: agents` (wild array only).
- `livestock.ts` `tickSettlementLivestock()`: livestock get `others: livestock` (settlement array only). `nearbyPredators` is forwarded separately.
- `AnimalAgent.resolvePreyTarget(others)` / `attack()` / `updatePredator()` hunt only inside `others`.
- `updatePrey()` flees immediate predators from `others`, then uses `nearbyPredators` only for **alert** flee (`resolveAlertThreat`).
- `gameLoop.ts` builds `threateningAnimals` from `fauna.getAgents().huntingPrey()` / `isThreateningHuman()`, and `nearbyWolves` from wild fauna, then passes both into settlements. Settlement animals are never passed into `Fauna.update`.
- `shepherdFlock.ts` `senseOwnedFlockThreat()` requires `preyOwnerHouseId` on a committed hunt. That field is only set when a predator's prey is household-owned, which wild wolves cannot select.
- `dogGuard.ts` resolves wolves attacking **NPC** targets, not livestock targets.

**Scenario**

A wolf walks into a sheep yard. Sheep can alert-flee (nearby wolf list). The wolf cannot lock, chase, or bite the sheep, because they are not in `others`. `huntingPrey()` never exposes `preyOwnerHouseId`, so the shepherd's flock-defense branch cannot fire. A dog reacts only if that wolf has committed to an NPC.

**Systemic consequence**

Predator ecology, prey response, dog guard, and shepherd defense disagree about the same physical encounter. Household ownership of livestock is real for water/food/production/stray, but it does not participate in predation. "Wolves approach settlement" content and shepherd work are structurally unable to meet.

This is not "missing wolf AI". The composition root already builds bounded candidate lists; the lists are the wrong union.

**Minimal architectural direction**

At `gameLoop` / settlement tick, build a bounded local encounter set containing wild fauna **and** nearby livestock/rats (same radius discipline as `nearbyWolves`). Feed that set into predator prey acquisition **and** immediate prey threat. Keep dog/shepherd hooks as they are — they will start seeing real commitments instead of requiring a new AI.

---

### F6 — Time-skip need satisfaction does not use live resource transactions

**Severity:** high
**Confidence:** high
**Domains:** time skip, NPC needs, household, economy

**Evidence**

Live `beginNeed` food paths call `household.takeFood(...)` then `relieveNeed(..., 'food')` (`NpcAgent.ts`).

`NpcAgent.resolveTimeSkip()` documents that it satisfies needs "the same way `beginNeed`'s `onComplete` does", but:

- `food` → `relieveNeed` only (no `takeFood`, no garden harvest, no hunt).
- `water` → `household.water.remove(WATER_DRINK_FROM_STOCK_AMOUNT)` (partially real).
- `waterDuty` → `household.water.add(WATER_FETCH_AMOUNT)` (mints well water without a well trip; well is infinite, so this is an approximation).
- `wood` → `relieveNeed` if `landmarks.trees.length > 0` (no chop, no deposit).
- No profession work, no crop harvest, no transport, no burial.

Agriculture is separately **stamped** as resolved on skip (`stampSettlementAgriculture`) without running catch-up for loaded settlements, so a loaded farm skips crop work that an unloaded farm will later alchemy on stream-in (F9).

**Scenario**

Home village, full household larder, 8-hour rest. NPCs wake not hungry; the larder is untouched. Wood duty is cleared without producing wood. A remote village that was unloaded will, on the player's later arrival, convert seeds to food for those same hours (F9). Household water may have been drunk and refilled from a virtual well.

**Systemic consequence**

Skip and live tick are two economies. Skip is cheaper for food and wood (needs relieved without consuming/producing). Combined with F1, the player-proximate settlement is the one whose needs are faked, while a distant settlement may still run aggregate agriculture. Resource graphs diverge by camera.

**Minimal architectural direction**

Either (a) replay the same `onComplete` resource mutations inside each skip step (take food, deposit wood only after a real harvest model), or (b) document skip as a needs/physiology catch-up that **must not** touch household/economy, and stop minting/removing household water there. Do not stamp agriculture as resolved across a skip unless the corresponding production actually ran.

---

### F7 — Lost-livestock quests write the world condition they claim to observe

**Severity:** high
**Confidence:** high
**Domains:** quests, stray, fauna, ownership

**Evidence**

- `QuestManager` world-driven opportunities are documented as read-only source lookups.
- `collectLostLivestockOpportunities()` (`settlementQuestOpportunities.ts`) prefers an active stray, **otherwise** `selectLostLivestock()` on ordinary eligible household animals.
- `createApp.ts` `getSnapshot` maps `lostLivestockStatus() === 'unavailable'` + alive household-owned + not mounted → `'lost-alive'`.
- `syncLostLivestockQuests()` (called from `gameLoop` each settlements pass): for every `offered` or `active` lost-livestock quest, calls `animal.startLivestockStray({ predators })`.
- `AnimalAgent.startLivestockStray()` `beginStrayState` then **teleports** to `selectStrayDisplacementTarget`.

Fauna-025's natural classification (`classifyNaturalStray` / home-return trip) is a separate, animal-owned path that does not teleport.

**Scenario**

A healthy sheep in the yard is selected as an opportunity. The quest is offered. The next settlements tick teleports that sheep 36–90 m away and latches a durable stray episode. The player never accepted the quest. Fauna-025 may later try to walk it home, racing the quest that created the displacement.

**Systemic consequence**

The observation layer is a world author. That collides with fauna-024/025, which already own stray as an animal-state machine, and with the quest invariant that `QuestManager` does not import fauna to mutate it. Offering a quest is enough to change simulation.

**Minimal architectural direction**

Generate opportunities only from `isStrayEpisodeActive`. If authored displacement is still desired, make it an explicit one-shot fauna transaction at a defined lifecycle edge (e.g. quest `active`, not `offered`), never from a per-frame poll that reinterprets `unavailable` as `lost-alive`.

---

### F8 — Rat reconcile clock resets on every construction

**Severity:** high
**Confidence:** high
**Domains:** rats, household food, economy, streaming, time skip

**Evidence**

- `createSettlementRats()` (`rats.ts`) sets `lastReconcileDay = -Infinity` every call.
- Persistence (`ratPersistence.ts`) stores animals + tombstones, not the last processed bucket.
- `update()`: when `nowDays - lastReconcileDay >= RAT_RECONCILE_INTERVAL_DAYS`, it reconciles (maybe spawn) and `maybeEatFood` with a hashed per-rat, per-`dayBucket` roll.
- Unload disposes rats and recaptures snapshots; stream-in constructs a new module.

**Scenario**

During one half-day, walk in and out of a village three times. Each load sees `lastReconcileDay = -Infinity`, so the current bucket runs again. Eligible rats eat again; below-target populations can spawn again. Conversely, a long skip over an unloaded village processes only the first tick after reload — one bucket, not N elapsed buckets.

**Systemic consequence**

Player movement can drain household/settlement food without bound and inflate rat counts. Long absence under-consumes. The hashed roll is deterministic **per bucket**, but the bucket is applied once per construction rather than once per elapsed interval.

**Minimal architectural direction**

Persist a settlement-level `lastRatReconcileDay` (or last processed `dayBucket`) next to infestation state. On materialization, walk elapsed buckets once with a bounded cap. Do not run the current bucket as a construction side effect.

---

### F9 — Off-screen agriculture uses `FamilyDef` labour and a different physics than loaded Farmers

**Severity:** medium
**Confidence:** high
**Domains:** agriculture, NPC death, household, streaming, time skip

**Evidence**

- `householdAgriculturalCapacity(family)` (`settlementAgriculture.ts`) counts adult `farmer` roles on static `FamilyDef`.
- `resolveSettlementAgricultureCatchUp()` runs on non-home stream-in (`createSettlement.ts`); home only stamps.
- `SettlementsManager.unload` / `resolveTimeSkip` / `snapshotHouseholds` call `markAgricultureResolved(nowDays)` on loaded households, zeroing elapsed without producing.
- Seed removal + `depositFood(harvestItem, batches * yieldCount)` is an alchemy over `CROP_DEFS`, not `CropPlacement` / `planFarmWork()`.
- Death lives on `NpcAuthoritativeState.health.dead`, not on `FamilyDef`.

**Scenario**

Remote village, sole farmer dies. Settlement unloads. Days pass. Player returns: catch-up still treats that family as having a living farmer and converts remaining seeds to food. Home village during a time skip stamps agriculture resolved and produces nothing, even with living farmers standing in the field.

**Systemic consequence**

Death stops detailed work but not aggregate labour. Loaded skip under-produces; unloaded catch-up over-produces relative to living workforce. `settlements-npcs-031` / `world-023` cannot share one seed/yield semantic with this until capacity is derived from living NPC ids.

**Minimal architectural direction**

Derive capacity from stable NPC ids ∩ living `NpcAuthoritativeState`. Do not stamp agriculture across a skip unless production ran. Keep `CROP_DEFS` as the shared yield table, but count only real workers.

---

### F10 — Egg production is gated by a runtime-only `onCollected` callback

**Severity:** medium
**Confidence:** high
**Domains:** livestock production, persistence, dropped items, streaming

**Evidence**

- `tickSettlementLivestock()` drops an egg with `onCollected: () => animal.notifyEggCollected(getNowDays())`, then `markEggLaid()` (`eggPending = true`).
- `createDroppedItems.drop` documents `onCollected` as never persisted.
- `AnimalAgent.snapshot()` / `hydrate()` persist `eggPending`.
- `readyToLayEgg()` requires `!eggPending` and `livestockProductionReady(...)`.
- Unload captures `eggPending=true` after dispose; the dropped item's callback still points at the old agent (or is gone after save).

**Scenario**

Chicken lays. Save/reload, rebuild, or stream the village before pickup. Egg still exists as a world item. Chicken restores `eggPending=true`. Collecting the egg does not clear the flag. The chicken never lays again.

**Systemic consequence**

A production cycle that was designed as "lazy absolute-day anchor, correct across unload/skip" is actually coupled to a JS closure. The clock model is fine; the producer↔product link is not.

**Minimal architectural direction**

Persist `producerAnimalId` on the dropped egg (or a pending-product id on the animal that is reconciled on materialization). Collection resolves against the current persistent animal. Keep the day-anchor math.

---

### F11 — NPC burial terminals corpse loot without an ownership transfer

**Severity:** medium
**Confidence:** high
**Domains:** NPC death, burial, inventory

**Evidence**

- `finalizeNpcCorpseBurial()` calls `dropNpcCorpseLoot(postDeath, null)` then `markNpcPostDeathTerminal(..., 'buried')`.
- `dropNpcCorpseLoot` returns immediately when `droppedItems` is null — loot snapshot is left as-is, then terminal status blocks later `transferCorpse*` (`status === 'terminal' return false`).
- `npcGraves.ts` stores identity/position, not inventory.
- Natural expiry (`finalizeExpiredNpcCorpse`) does drop remaining loot into the world.

**Scenario**

Family buries a dead NPC who still had personal belongings (npc-036 lossless handoff). The grave appears. Items are neither on the ground, nor in the grave, nor lootable. They remain serialized on a terminal `postDeath.loot` that no gameplay path can reach.

**Systemic consequence**

Burial is an inaccessible resource sink. Decay is not. Two completion paths of the same corpse lifecycle disagree about conservation. npc-036 made the handoff lossless and then burial throws the result away.

**Minimal architectural direction**

Burial must be a transaction: drop at the grave, transfer into a grave inventory, or explicitly consume as "buried with the body" (clear loot). Pick one; do not leave terminal-but-full snapshots.

---

### F12 — Carcass meat is two independent ledgers; scavenger state does not persist

**Severity:** medium
**Confidence:** high
**Domains:** fauna, hunting, corpses, persistence

**Evidence**

- `animalCorpse.ts`: `meatHarvested` and `consumedPhase` are documented as independent.
- Harvest eligibility (`canHarvestMeatFrom` / `animalHarvest.ts`) ignores `consumedPhase`.
- Snapshot persists `timeSinceDeath` and `meatHarvested` only (`AnimalAgent.snapshot`).
- Scavengers `markFoodConsumed(phase)` per decay phase.

**Scenario**

Wolf eats a fresh carcass. Player or hunter still receives the full species meat+hide. After save/load of livestock/habitat-occupant corpses, `consumedPhase` is forgotten, so a scavenger can eat the same phase again.

**Systemic consequence**

A carcass is not a finite resource shared by predators, NPCs, and the player. Reconstruction can restore already-eaten food.

**Minimal architectural direction**

One remaining-meat (or remaining-food-value) field on corpse state, persisted, decremented by both scavenge and harvest. Independent booleans cannot be audited.

---

### F13 — `commitRoleWork` still mints settlement stock beside real profession recipes

**Severity:** medium
**Confidence:** high
**Domains:** economy, production, NPC work

**Evidence**

- `planProfessionWork()` returning null falls back to a workplace stand whose `onComplete` calls `commitRoleWork(economy, role, simClock)` (`NpcAgent.ts`).
- `commitRoleWork` (`npcWork.ts`) runs `economy.produce(productionForRole(role))` for stock recipes (farmer still has a stock food recipe in that table; woodcutter is excluded).
- Real farmer work harvests `CropPlacement` into household items. Real hunter/textile paths use `executeProduction` on `Household.items`.
- Unloaded agriculture (F9) is a third completion model.

**Scenario**

Farmer has no mature crop and no seeds. Scheduled `work` still stands at the workplace and `commitRoleWork` can mint settlement food from the old role hook. Loaded harvest, workplace mint, and unloaded seed alchemy can all create food for the same hours of World Time.

**Systemic consequence**

`executeProduction` was introduced as the single all-or-nothing commit. The older stock hook remains a parallel mint. Queued `settlements-npcs-016/017` will extend production pressure on top of an ambiguous "what counts as having produced".

**Minimal architectural direction**

Make `commitRoleWork` a no-op (or delete the fallback stand's produce call) now that professions have real planners. Empty planner → idle stand, not stock mint. One completion seam: `executeProduction` or a real world harvest.

---

### F14 — `dayLengthSec` default 600 vs live clock 480

**Severity:** low
**Confidence:** high
**Domains:** time, NPC, work contracts

**Evidence**

- `createDayNightState()` default `dayLengthSec: 480` (`dayNight.ts`).
- `NpcAgent` field `private dayLengthSec = 600`, updated from `update()`'s parameter.
- Work-contract travel scoring and some idle-dispatch helpers read `this.dayLengthSec` rather than a required constructor argument (`NpcAgent.ts` comment: stashed because not called from `update()`).

**Scenario**

Anything that scores travel time / conversation duration on an agent that has not yet received a tick (fresh reconstruct, test, first decision before `update`) uses 600 s/day. Live needs ticking uses 480. Off-screen transport estimates use the `dayLengthSec` passed into `unload` (live clock).

**Systemic consequence**

Two clocks for the same ratio. Unlikely to dominate gameplay, but it is exactly the class of bug plan 192 tried to close. Contract evaluation vs off-screen travel duration can disagree.

**Minimal architectural direction**

Initialize `NpcAgent.dayLengthSec` from the same `DayNightState` the manager already holds. Ban numeric defaults other than the shared `DEFAULT_DAY_LENGTH_SEC`.

---

### F15 — Resource-deposit async completion validates only the player anchor

**Severity:** low
**Confidence:** high
**Domains:** settlements, mining, world independence

**Evidence**

- `resourceDeposits.update(player, loadedSettlementCenters)` — interest anchors include loaded settlements (`gameLoop.ts`).
- `recheck` wants deposits near any anchor.
- Deferred `getTemplates().then`: spawn is aborted if `dist(resource, lastCheckX/Z) > UNLOAD_RADIUS`, and `lastCheck*` is the **player**.

**Scenario**

Eager-loaded settlement beyond player unload radius requests deposits while GLB templates load. Completion drops them because the player is far. If the player stands still and the settlement set is unchanged, `update()` does not recheck.

**Systemic consequence**

A loaded, supposedly player-independent miner can lack the `ResourceDeposits` instance `planOreGathering()` queries. Temporary or sticky.

**Minimal architectural direction**

Validate deferred spawn against the union of current anchors (or keep `wanted` ids), not player-only `lastCheck`.

---

### F16 — Hunter hunt-resupply ignores arrows already in `personalInventory`

**Severity:** low
**Confidence:** high
**Domains:** items, NPC, hunting (items-player-027 seam)

**Evidence**

- Combat ammo: `resolveNpcAmmo([this.personalInventory, this.carried], ranged)` — gifts work.
- Hunt resupply: if `this.carried.count('arrow') < TARGET`, pull from `household.items` into `carried` (`attemptHuntKill`).
- Player gifts land in `personalInventory` (`giveItemCountToNpc`).

**Scenario**

Player gives a hunter 20 arrows (personal). Hunt starts: `carried` is low, so the hunter also drains household arrow stock into `carried`. After reconstruction, household arrows that were in `carried` are gone and starting arrows remint (F3).

**Systemic consequence**

items-player-027 closed combat consumption and left the hunt-prep path on `carried` + household. Two ammo owners for one action.

**Minimal architectural direction**

Resupply and combat should share `resolveNpcAmmo([personal, carried, household?])`. Do not pull household stock if personal already covers the target.

---

## Recent ~7 days (simulation-relevant)

| Commit area | Architectural reading |
| ----------- | --------------------- |
| **fauna-019** cave habitats | Narrow cave contract (`Caves.resolveHabitat` / `AnimalHabitatBinding`) is a good seam. Production occupant declarations are still empty — dormant, not broken. |
| **fauna-022** wolf-den alpha | Per-individual variants composing by max-per-field with `markDangerous()` — do not replace with a new kind. |
| **fauna-024/025** stray | State machine, persistence, and self-return are coherent. Defects are external: no skip/unload catch-up (F1) and quest teleport (F7). |
| **world-026** thunder scare | Deterministic `(eventId, animalId)` scare is a good generic stimulus. Settlement animals receive it only while their runtime tick exists (F1). NPC weather remains a sustained `seekShelter` pressure — different contract, not a bug. |
| **settlements-007** structure repair | Sparse manager-lifetime registry + shared quote/begin/contribute between player and NPC. Stream/save continuity is the right pattern. Not a defect. |
| **settlements-npcs-030** non-home agriculture | Introduces the FamilyDef/alchemy vs loaded Farmer split (F9). Stamps on skip/unload make loaded skip under-produce. |
| **npc-036** lossless corpse inventory | Personal handoff is correct. Burial (F11) and `carried`/transport (F3/F4) remain the unfinished edges of the same conservation contract. |
| **items-player-027** player→NPC gifts | Correct owner: `personalInventory`. Combat ammo union is correct. Hunt resupply (F16) and `carried` remint (F3) were not updated. |
| **items-player-029** wearable armor | Player-only equipment; NPC combat still derives from inventory at action time. No parallel NPC armor system — leave it. |
| **NpcAgent garden RNG** | Persistent garden `care` now uses a seeded roll — correct determinism fix; not a new parallel system. |
| **household food/wood transfer** | Player→household uses the same `Household` owner NPCs already mutate. Good. |

---

## TOP 10 findings

1. **F1** — Loaded presence selects whether World Time applies (NPC skip vs frozen livestock/unloaded settlements).
2. **F5** — Wild/livestock encounter graphs are disjoint; shepherd/dog/wolf disagree about the same yard.
3. **F3** — `carried` (and wood `claimed` closures) destroy or mint conserved goods on reconstruct/death.
4. **F4** — Transport cargo has no death transaction; off-screen arrival can deliver from a corpse.
5. **F7** — Lost-livestock quests teleport animals they claim to observe.
6. **F6** — Time-skip need relief does not run live household/economy transactions (and stamps agriculture).
7. **F8** — Rat eat/reproduce clock resets every stream-in.
8. **F2** — Stream-out teleports NPCs home and drops execution state.
9. **F9** — Off-screen agriculture counts dead `FamilyDef` farmers; loaded skip produces nothing.
10. **F10 / F11** — Egg callback and burial loot: production/death consequences that do not survive their own completion paths.

(F10 and F11 are bundled at #10 as the same class: a completion path that drops the conserved object.)

---

## TOP 5 cross-system risks

1. **Fidelity = player proximity.** Stream radius and skip gating are not a LOD of the same simulation; they are different rules (F1, F2, F6, F8, F9). Every new system copied from "only tick loaded agents" will inherit this.
2. **Conserved goods without an authoritative in-transit owner.** `personalInventory` and `transportCargo` show the correct pattern. `carried`, wood `claimed`, egg `onCollected`, burial loot, and scavenged meat do not (F3, F10, F11, F12).
3. **Death is not a world transaction.** Work contracts release. Transport does not. Agriculture still counts the corpse. Household membership and livestock ownership do not rebind. Corpse loot is lossless until burial (F4, F9, F11).
4. **Quest/observation layers that mutate fauna.** Lost-livestock offering is the concrete case (F7). The same pattern will break fauna-023 lures and any future "world-driven" opportunity if source lookups keep writing state.
5. **Queued expedition/economy plans assume a generic off-screen NPC, a living workforce, and one production commit.** Current code has transport-order-specific off-screen execution, FamilyDef labour, and `commitRoleWork` + `executeProduction` + aggregate alchemy (F9, F13, plans below). Implementing those plans on the assumed API will create parallel paths.

---

## TOP 5 things that are well designed and should **not** be refactored

1. **`SaveData` is a serialization boundary; domains own runtime state.** Restore is construction. In-session `WorldBundle` rebuild uses the same `snapshot*` methods as save (`saveState.ts` / `worldBundle.ts` / manager registries). Do not introduce a second hydrate pass or a central blob.

2. **`NpcAuthoritativeState` on a manager-lifetime registry, with `NpcAgent` holding direct references.** Identity survives unload/rebuild/save. Execution state is allowed to reset. Extend this object (position checkpoint, work cargo, death dispositions) rather than creating `NpcRuntimeStore` / `CompanionState`.

3. **`TransportOrder` is an obligation, not a cargo owner.** Goods live in source → `transportCargo` → destination. Off-screen progression is a bounded checkpoint (`resolveOffscreenTransportArrivals`), not a per-frame tick. Add death/failure to this owner; do not replace it with a `TradeSystem`.

4. **NPC decision pipeline: independent pressure producers → one arbitration → sequencing table → strategy → `PlannedAction`.** Weather, heal, burial, sanitation, structure repair already plug in as candidates. New duties (accompany, production pressure, expedition) belong here, not in a second AI. Fauna's fixed-priority table is a different, valid shape — do not unify the two into one mega-arbitrator.

5. **`executeProduction` all-or-nothing commits, `AnimalOwner` as one discriminated union, lazy absolute-day livestock production anchors, shared `HealthState` / `harvestAnimalIntoInventory`, and settlements-007 shared repair.** These are the correct "one owner, many actors" seams. Fix egg linkage and `commitRoleWork`; do not rewrite production, ownership, or repair.

Honourable mentions (also do not rip out): injury lazy clock (`injuryRecoveryUpdatedAtDays`); claim-at-pickup revalidation (`localExchange.ts`); deterministic lightning/scare identity; persistent habitat occupant slots/tombstones; detached player-owned livestock lifecycle.

---

## Queued plans that need recon before implementation

Do not implement these against their own "current state" sections without a fresh pass against `main`. Several already contain that warning; some do not.

| Plan | Why recon is required |
| ---- | --------------------- |
| **npc-029** accompany/follow | Assumes `settlements-npcs-019` exposed a **generic** persistent/off-screen NPC travel primitive. 019 implemented transport-order execution + `transportCargo` only. Position is still runtime-on-mesh (F2). Recon must decide whether to extract a tiny travel-commitment type from 019 or keep accompany loaded-only until that exists. Do not build `CompanionOffscreenEngine`. |
| **settlements-npcs-028** long-distance travel | Draft already says this. 019 is still cargo-specific. Same shared travel contract as 029 — one recon for both. |
| **npc-030 / npc-031 / npc-032 / npc-033 / npc-034 / npc-035** | Depend on 029 + continuous autonomy + `personalInventory` provisions. F1/F2/F3/F6 mean an accompanying NPC freeze/teleports/loses cargo on stream/skip. 032's off-screen survival cannot be a third needs model. |
| **settlements-npcs-027** expedition assignment | Must rank **living** `NpcAuthoritativeState`, not `FamilyDef` roles (same trap as F9). Dead/unloaded labour is currently easy to count by mistake. |
| **settlements-npcs-020** economy-driven transport | Status note still says 018/019 are unimplemented; they are on `main`. Recon against real `TransportOrder` / Trader flow / death gap (F4) before adding demand→order. Do not add `TransportDemandRegistry`. |
| **settlements-npcs-021** remote site logistics | Draft depends on 020 and planned 018–019 APIs. Remote sources + off-screen carriers will hit F3/F4 immediately. |
| **settlements-npcs-016 / 017** processing + economic pressures | Must extend `executeProduction` and living workforce. `commitRoleWork` (F13) and FamilyDef agriculture (F9) will otherwise remain parallel mints. 017 must be a pressure producer in the existing NPC pipeline, not `ProductionAI`. |
| **world-023 + settlements-npcs-031** seed/yield | Both require one `CropDefinition` harvest/recovery used by player, loaded Farmer, **and** aggregate catch-up. Current catch-up is seed→food alchemy with `yieldCount`. Implementing 031 on 030 as-is hard-codes the wrong labour and yield. |
| **fauna-023** attraction / lures | Must reuse `AnimalAgent` lure/diet seams. F5 means settlement livestock and wild predators still cannot interact; food-on-ground near a village will not create the intended predator–flock gameplay until encounter sets are unified. |
| **npc-037** stale work contracts | Correct direction (discover staleness in the world, don't globally poll-delete). Recon against loaded-only NPC execution: an unloaded worker will never walk to a missing well. Define what off-screen assignments do. |
| **npc-038** capability gating | Already aimed at `personalInventory` + catalog capabilities. Recon must not accidentally gate on `carried`. Deep-well `capabilities: null` is the stated first slice. |
| **items-player-028** storage policies | Depends on 027 (done). Recon should treat helper delivery / `personalInventory` / household items as existing sinks, and must not invent companion inventory. |
| **quests-progression-019** dangerous-animal deeds | Reads `AnimalAgent.dangerSignificance` / variants (fauna-022). Keep that; do not branch on `kind === alpha`. Ordinary wild individuals still do not persist — deeds against non-occupant wildlife will not survive Continue. |

Plans that should **not** wait on a large architecture rewrite: settlements-007 follow-ups (already the right repair owner), items-player-029 NPC armor (player-only is correct until a later equipment slot exists), tools-013 decision verification (would help F6/F7/F9 if it can assert skip vs live resource equality).

---

## Out of scope (not findings)

- Ordinary wild-fauna individuals are unpersisted by contract.
- Player HP is a documented persistence limitation, not a simulation-boundary contradiction.
- Fauna outgoing damage bypassing the shared critical/defense pipeline is a known combat asymmetry.
- Inter-settlement trade, Social Places beyond campfire, taming, mounted combat, disease beyond rabies — absent, not inconsistent.
- Hitch not surviving save is an explicit livestock-unload constraint.
- NPC weather (`seekShelter`) vs animal thunder scare are different stimuli by design.
- Blacksmith remaining dormant without whetstones is a missing input, not a broken owner.

---

## Suggested order if this review later becomes work

Not a plan — a dependency order that follows the owners above:

1. Unify encounter candidate sets (F5) — small composition-root change, unblocks shepherd/dog/wolf and fauna-023.
2. Death as a transport/work-cargo transaction (F4, F3 death edge).
3. Authoritative work cargo + stop hunter remint (F3).
4. Manager-level time-skip/unloaded catch-up for animals + rat bucket (F1, F8); then NPC position checkpoint (F2).
5. Make skip either resource-accurate or resource-inert (F6); stop agriculture stamp without production (F9).
6. Quest stray read-only (F7); egg producer id (F10); burial loot policy (F11).
7. Delete `commitRoleWork` mint (F13) before 016/017.

Until (4) and the shared travel extraction exist, treat npc-029/028/expedition chain as blocked on recon, not on more companion design.
