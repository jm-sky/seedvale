# Adversarial Living World Audit

**Date:** 2026-09-12
**Branch audited:** current `main` (source of truth: code, not plans)
**Method:** independent recon of `docs/STATE.md`, domain state docs, `docs/plans/README.md` / `PLANNING.md`, then focused reads of owner modules. Prior living-world reviews were **not** read before the findings below were written.
**Recent window:** living-world landings of the last ~7 days on `main` (transport off-screen, livestock stray/return, structure repair, agriculture catch-up, NPC accompany, player→NPC / household transfers, storms/scare, lossless corpse loot, attraction, animal deeds).

This is not an architecture tour. The question is whether **realistic combinations of already-implemented systems** can produce impossible, load-dependent, or non-atomic world state.

---

## 1. Confirmed findings

### F1 — In-transit transport cargo has no death path; delivery becomes load-state-dependent

- **Severity:** critical
- **Confidence:** high
- **Affected systems:** transport orders, NPC death/corpse, settlement streaming, time skip, household/settlement food

**Scenario.** A Trader has already picked up household surplus (`TransportOrder.state === 'in-transit'`, goods on `NpcAuthoritativeState.transportCargo`). A predator or other lethal hit kills the carrier.

**Files / symbols.**

- `src/settlement/npcPostDeath.ts` — `commitNpcDeath()`
- `src/settlement/npcPostDeath.test.ts` — explicitly asserts cargo is *not* folded into corpse loot
- `src/ai/NpcAgent.ts` — `takeDamage()` → `commitNpcDeath()` + `die()`; `die()` releases work contracts and accompany, not transport
- `src/world/transportOrder.ts` — `cancelTransportOrder()` / `failTransportOrder()` reject `in-transit`
- `src/settlement/SettlementsManager.ts` — `beginOffscreenTransportHandoff()`, `unload()`
- `src/world/transportOffscreen.ts` — `resolveOffscreenTransportArrivals()`

**Expected state.** One unit of food has exactly one live owner. Carrier death has a deterministic termination: loot the cargo, refund the source, or complete/fail the order. A dead NPC does not keep executing world logistics.

**Actual state (from code).**

1. `commitNpcDeath()` moves only `personalInventory` into `postDeath.loot`. The comment on the function states carrier death is a **known unresolved gap**: cargo stays on the dead NPC; the order stays `in-transit`.
2. `die()` no-ops `update()` from the next tick (`health.dead` early-return). Detailed pickup/unload in `npcProfessionWork.planTransportOrderExecution()` never runs again while the settlement stays loaded.
3. `cancelTransportOrder()` cannot retire an `in-transit` order, so there is no recovery API.
4. If the player then walks away and the (non-home) settlement unloads, `beginOffscreenTransportHandoff()` iterates **all** `settlement.npcs`, including corpses, and arms `execution.mode === 'off-screen'`. Later `resolveOffscreenTransportArrivals()` unloads `transportCargo` into the destination through `executeTransportUnload`.

**Systemic consequence.** Same death, two semantic worlds:

- stay in the village → cargo is locked on a corpse that is not lootable for those items, pantry/economy missing that food forever (or until some future handoff);
- leave the village / time-skip after unload → goods teleport to destination from a dead carrier.

That is duplication-or-loss depending on streaming, not a single ownership rule.

**Minimal architectural direction.** Treat carrier death as a first-class `TransportOrder` termination on the same seam as pickup/unload (`executeTransportUnload` / fail / refund). `commitNpcDeath()` must not be allowed to leave `in-transit` cargo on a `health.dead` state. Off-screen handoff must skip dead carriers.

---

### F2 — Time skip does not replay live resource semantics for NPC needs

- **Severity:** high
- **Confidence:** high
- **Affected systems:** time skip, NPC needs, household food/water/wood, agriculture, work contracts, transport (loaded)

**Scenario.** Player rests/waits N hours in or near a loaded settlement (home is always loaded). NPCs are frozen for the skip (`gameLoop.ts` gates ticks on `!timeSkip.isActive()`), then `NpcAgent.resolveTimeSkip()` replays the period in `TIME_SKIP_SAMPLE_HOURS = 0.5` steps.

**Files / symbols.**

- `src/world/timeSkip.ts` — clock-only; documents freeze-and-catch-up
- `src/app/gameLoop.ts` — freeze NPC/fauna during skip; `justFinished` → `settlementsManager.resolveTimeSkip` + `resolveOffscreenTransportArrivals` + `fauna.resolveTimeSkip`
- `src/ai/NpcAgent.ts` — `resolveTimeSkip()` (~3189)

**Expected state.** Skipped world time has the same resource consequences as unskipped play: hunger consumes household/personal food; water duty requires a well trip; wood duty requires a harvest; in-flight logistics continue or fail deterministically.

**Actual state (from code).** Per 0.5 h step, while not sleeping:

```text
need === 'water'      → household.water.remove(1), relieve thirst
need === 'waterDuty'  → relieve duty AND household.water.add(2)   // no well
need === 'food'       → relieveNeed('food') only                  // no takeFood
need === 'wood'       → relieveNeed('wood') if any tree landmark  // no chop/deposit
```

Live `beginNeed()` for food goes through `household.takeFood()` / gather / hunt (`NpcAgent.ts` ~3922–3961). Time skip never calls those. Water duty live path is well queue → `WATER_FETCH_AMOUNT` deposit (`~3908`); skip mints the same amount in place, clamped by `WaterReserve.capacity` (7).

The same function then **teleports** the NPC to the last schedule place and clears `pendingAction` without `resetInFlightAction()`. Combat intent, sanitation reservation, work-contract walk, and in-transit *detailed* delivery are not advanced.

**Systemic consequence.** An 8 h skip is up to 16 satisfy-cycles of free meals. The pantry does not shrink; thirst can still drain water; water duty can fill the barrel from nothing. Loaded Traders carrying `transportCargo` do not walk; only already-off-screen orders catch up (`gameLoop.ts` ~922–935). World time and household ledgers diverge.

**Minimal architectural direction.** Drive skip catch-up through the same mutation functions as `beginNeed` onComplete (or a shared “apply need satisfaction” primitive), and either progress or explicitly fail in-flight commitments instead of teleport + drop `pendingAction`.

---

### F3 — Unvisited settlements are not one simulation: agriculture catch-up runs, almost everything else freezes

- **Severity:** high
- **Confidence:** high
- **Affected systems:** settlement streaming, agriculture, NPC needs, rats, livestock hunger/corpses, time skip

**Scenario.** Player never visits a non-home settlement for many days, or time-skips at home (distant settlements unloaded). Later the player arrives.

**Files / symbols.**

- `src/settlement/SettlementsManager.ts` — home never unloads (`entry.def.isHome` skipped); `resolveTimeSkip()` only iterates **loaded** `entry.settlement`; `unload()` stamps agriculture
- `src/settlement/settlementAgriculture.ts` — `resolveUnloadedHouseholdAgriculture()` / `resolveSettlementAgricultureCatchUp()`
- `src/settlement/createSettlement.ts` — catch-up at stream-in
- `src/settlement/rats.ts` — `maybeEatFood()` only from `Settlement.update`
- `src/ai/NpcAgent.ts` — needs tick only while a live agent exists
- `src/shared/injuryRecovery.ts` — lazy `injuryRecoveryUpdatedAtDays` (does catch up on first live tick)

**Expected state.** If the game already simulates “days passed while you were away” for household farming, the same elapsed days should apply to the other settlement-owned living processes that those farms feed: eating, pests, livestock metabolism, corpse clocks. Stream-in should not mint a pantry that nobody consumed.

**Actual state (from code).**

| Process | Away / unloaded |
|---|---|
| Non-home crop catch-up | **runs** on stream-in from `agricultureLastResolvedAtDays` |
| NPC hunger/thirst/duties | **frozen** (no lazy clock) |
| Rat food drain | **frozen** (needs live agents) |
| Livestock hunger/thirst | **frozen** in snapshot |
| Livestock milk/eggs/wool | **advances** (day-anchor) |
| NPC injury | **advances** on first live `resolveInjuryRecovery` |
| NPC corpse decay | **advances** (`deathAtDays`) |
| Livestock corpse decay | **frozen** (`timeSinceDeath` seconds) |

Home is the opposite: always loaded, so F2’s magic skip applies there instead of freeze.

**Systemic consequence.** Unvisited villages accumulate catch-up food with no eaters and no rats. Livestock can be ready to produce on arrival while still having the hunger they had at last unload. Arrival is not a reconstruction of the missed days; it is a patchwork of different time models.

**Minimal architectural direction.** Pick one off-screen contract per settlement-owned process (lazy day-anchor **or** explicit “frozen, documented”), and apply it uniformly. Agriculture catch-up should not be the only “days passed” writer against household food.

---

### F4 — Visiting + time-skipping a non-home settlement zeroes the farming that staying away would have produced

- **Severity:** high
- **Confidence:** high
- **Affected systems:** agriculture catch-up, time skip, settlement streaming

**Scenario.** Non-home field village is loaded (player is there). Player time-skips 8 h. Farmer NPCs are frozen, then `resolveTimeSkip()` teleports them; it never harvests. `SettlementsManager.resolveTimeSkip()` calls `stampSettlementAgriculture()` which only `markAgricultureResolved(nowDays)`.

**Files / symbols.**

- `src/settlement/SettlementsManager.ts` — `stampSettlementAgriculture()`, `resolveTimeSkip()`, `snapshotHouseholds()` (stamps on save too)
- `src/settlement/settlementAgriculture.ts` — catch-up is skipped while `isHome` or `elapsedDays <= 0`

**Expected state.** Presence vs absence of the player should not change how many crop-days elapsed, only whether they were simulated in detail or in aggregate.

**Actual state.** Away: stream-in catch-up consumes seeds and `depositFood`s. Present + skip: clock is stamped forward with **zero** production. Save while visiting also stamps (`snapshotHouseholds`), so a save/load in the village similarly burns the catch-up window.

**Systemic consequence.** Load-state-dependent food. The v1 agriculture design (detailed Farmer at home, aggregate away) plus skip/save stamping makes “I slept in the next village” strictly worse for that village’s pantry than “I never came”.

**Minimal architectural direction.** Time skip / save stamp must either run the same aggregate resolver for non-home loaded households or keep `lastResolvedAtDays` unmoved until a real farmer tick or explicit catch-up.

---

### F5 — Injury treatment items sit in inventories the heal path never reads

- **Severity:** high
- **Confidence:** high
- **Affected systems:** NPC healing, household medicine, player→NPC transfer, `carried` vs `personalInventory`

**Scenario.** Hunter household starts with bandages in `Household.items` (`household.ts` hunter bootstrap). Player additionally gives a bandage via `giveItemCountToNpc` into `personalInventory` (items-player-027, last ~7 days). NPC has outstanding `physicalInjury`.

**Files / symbols.**

- `src/ai/NpcAgent.ts` — `choose()` uses `this.carried.findInjuryTreatment(injurySeverity)` (~2786); `beginHeal()` onComplete consumes from `this.carried` (~5181)
- `src/ai/NpcAgent.ts` — `giveBandageForDebug()` adds to **`carried`** (~3377)
- `src/app/actions/npcItemTransfer.ts` — player gifts → `personalInventory`
- `src/settlement/household.ts` — hunter starter bandages → `items`
- Combat contrast: `beginCombat()` / `resolveNpcAmmo([this.personalInventory, this.carried], …)` already dual-reads inventories

**Expected state.** If a catalog `injuryTreatment` item is owned by that NPC or by the household the heal action walks home to, healing pressure can fire and consume it. Player gift of a bandage is usable, matching items-player-027’s “normal NPC decisions / actions” claim.

**Actual state.** Autonomous heal is gated on **transient work `carried`**, which is not persisted and is not where household production or player gifts put bandages. Debug is the working path. Combat was updated for personal belongings; healing was not.

**Systemic consequence.** Injury, SPEA penalties, and household/player medicine exist, but they do not close. Injured NPCs keep working with a treatment item in the house or on their belt. After reconstruction, even a debug bandage on `carried` vanishes.

**Minimal architectural direction.** Resolve treatment the same way ammo now does: ordered search over `personalInventory`, then household items (with a real fetch), never a third debug-only bag. Revalidation before consume stays.

---

### F6 — Burial claims are recovered against the wrong NPC’s plan

- **Severity:** high
- **Confidence:** high
- **Affected systems:** NPC burial, corpse lifecycle, household death

**Scenario A.** NPC A `claimNpcCorpseForBurial`s a family corpse and is walking there. NPC B (same household) runs `choose()` → `resolveBurialPressure`.

**Scenario B.** A is the last living claimant, dies mid-burial. Nobody else evaluates, or later a new evaluator does.

**Files / symbols.**

- `src/ai/burialPressure.ts` — `resolveBurialPressure()` calls `recoverStaleNpcBurialClaim(post, claimantHasMatchingPlan(input.activePlan, deceasedId))` using **the evaluator’s** `activePlan`
- `src/settlement/npcPostDeath.ts` — `recoverStaleNpcBurialClaim()`, `npcCorpseReadyToRemove()` (only `status === 'active'`)
- `src/ai/NpcAgent.ts` — `die()` does not release burial claims this NPC holds on others; dead NPC `activePlan` is left in place as “moot”

**Expected state.** A claim is released only if *that claimant* has no resumable burial plan, is dead, or finished/cancelled. Other family members must not drop A’s claim by existing.

**Actual state.** Every other household member’s pressure tick passes `claimantHasMatchingPlan === false` for A’s corpse and **releases A’s in-flight claim**. B can then claim. `executeBurial` / `ensureNpcBurialGrave` are mostly idempotent, so this is thrash rather than double graves — but A’s walk is invalidated from under them.

If A dies as last claimant and no other living NPC runs that loop, the corpse stays `claimed` forever: natural decay (`npcCorpseReadyToRemove`) refuses non-`active` status, loot is not dropped, burial is blocked.

**Systemic consequence.** Commitment to a corpse is not a stable lock. Death of the claimant has no owner-side cleanup.

**Minimal architectural direction.** `recoverStaleNpcBurialClaim` must look up the **claim owner’s** `NpcAuthoritativeState.activePlan` (and `health.dead`). `die()` should release claims this NPC owns on other corpses.

---

### F7 — Household livestock (including a player-led stray) is destroyed with a non-home settlement unload

- **Severity:** high
- **Confidence:** high
- **Affected systems:** livestock streaming, stray/lead, persistence capture, player lead

**Scenario.** Player visits a neighboring village, a cow is naturally strayed or quest-strayed, player leads it away. At `unloadRadius` 420 m the settlement unloads.

**Files / symbols.**

- `src/settlement/SettlementsManager.ts` — `unload()` → `livestock.capture()` then `settlement.dispose()`; home is exempt; `detachedLivestock` is only filled by `restoreDetachedPlayerOwnedLivestock` / player-ownership transfer
- `src/settlement/livestock.ts` — `isPlayerOwnedLivestockRecord`; household records stay settlement-scoped
- `src/app/actions/leadActions.ts` — `update()` **detaches** if `resolveAnimal(ledId)` is null
- `src/fauna/animalStray.ts` / `AnimalAgent.tickNaturalStrayClassification()` — household owner unchanged while displaced

**Expected state.** A live animal the player is standing next to (or leading) is not a function of whether its origin settlement is streamed. Player-owned horses already survive as detached agents; a household stray being led is the same physical object.

**Actual state.** Capture + dispose removes the `AnimalAgent`. Lead resolver returns null → silent `detach()`. The snapshot keeps position/owner/stray, but the body is gone until the player returns inside load radius and the village rebuilds the agent hundreds of metres away.

**Systemic consequence.** Ownership (`AnimalOwner.household`) and physical presence split across the stream boundary. Lost-livestock quests can report `lost-alive` for an animal that is not in the world. This is the stray/lead feature colliding with a livestock lifecycle that still assumes “animal lives inside the settlement object”.

**Minimal architectural direction.** Detach (or keep ticking) any household livestock that is player-led, stray-active, or outside the settlement unload bubble — same live-object rule as player-owned mounts — then reattach on stream-in.

---

### F8 — Livestock corpse clocks are tick-seconds, so stream-out / away time-skip freezes decay and stray-corpse retention

- **Severity:** medium
- **Confidence:** high
- **Affected systems:** fauna corpses, stray death, time skip, livestock persistence

**Scenario.** Household sheep dies as a stray 80 m from a non-home yard. Player leaves; settlement unloads. Two days of world time pass (play elsewhere or skip at home). Player returns.

**Files / symbols.**

- `src/fauna/AnimalAgent.ts` — `snapshot().corpse.timeSinceDeath`; `resolveTimeSkip()` adds elapsed **only for currently live agents**; `readyToRemove()` / `shouldRetainStrayedCorpse(..., timeSinceDeath)`
- `src/fauna/animalStray.ts` — `STRAY_CORPSE_RETENTION_SECONDS = 960` (comment: two default world days, includes skip catch-up)
- NPC contrast: `npcPostDeath.ts` uses `deathAtDays` vs `nowDays`; `shouldSkipNpcCorpsePresentation()` on stream-in (`createSettlement.ts` ~890)

**Expected state.** Same elapsed world time cannot be applied twice, but it must be applied once. A stray corpse’s two-day inspect window is world time, not “seconds this JS object was ticked”.

**Actual state.** Unloaded livestock do not run `resolveTimeSkip`. `timeSinceDeath` is frozen in the snapshot. On reload the corpse is as fresh as at unload. NPC corpses in the same village will already have decayed/been skipped.

**Systemic consequence.** Lost-livestock `corpse-uninspected` can outlive its documented cap if the player is away. Conversely, a loaded skip correctly advances `timeSinceDeath` (F2’s fauna path), so skip-while-present vs skip-while-away disagree.

**Minimal architectural direction.** Persist a world-days death anchor for animals that already snapshot (livestock / persistent occupants / rats), matching NPC `deathAtDays`, and derive phase/TTL from `nowDays`.

---

### F9 — Thunder scare can latch a natural stray even though storm work treats stray as out of scope

- **Severity:** medium
- **Confidence:** medium
- **Affected systems:** storms/scare, livestock stray, clamp/roam, lost-livestock quests

**Scenario.** Storm lightning scares a chicken/sheep at the yard edge. `scare-flee` skips `clampBounds()` (`AnimalAgent.ts` ~4672–4674). `scareFleeDurationSec` is 3.2–6.6 s per event; a storm can refresh `scareRemainingSec`. `STRAY_CLASSIFICATION_GRACE_SECONDS = 12` and `STRAY_MIN_DISTANCE = 36`. `tickNaturalStrayClassification` latches `beginStrayState` at the current position (no teleport).

**Files / symbols.**

- `src/fauna/animalScare.ts` — `scareFleeDurationSec`, `shouldScare`
- `src/fauna/AnimalAgent.ts` — scare branch, `clampBounds()`, `tickNaturalStrayClassification()`
- `src/fauna/animalStray.ts` — grace window comment: “latches within one chase/scare episode”
- `docs/plans/README.md` verification for `world-026`: “Burza nie tworzy questa ani stray”

**Expected state.** Either storms cannot create stray (world-026 verification), or they can, and lost-livestock / household ownership must accept storm as a producer. Both features landed in the same week; they do not share a gate.

**Actual state.** Dogs are excluded from natural stray; ordinary livestock are not. Scare explicitly unclamps roam. fauna-025’s grace is sized to fire inside one scare/chase. world-026’s verification assumes the opposite.

**Systemic consequence.** A weather impulse can start a durable ownership/quest episode. Not a missing feature — two implemented producers disagree.

**Minimal architectural direction.** One predicate: `tickNaturalStrayClassification` should ignore displacement while `scareRemainingSec > 0` (and maybe while fleeing a non-predator), **or** world-026 verification/docs must accept storm-origin strays.

---

### F10 — Time skip drops execution without the shared interrupt cleanup

- **Severity:** medium
- **Confidence:** high
- **Affected systems:** time skip, animal sanitation claims, combat, work contracts, accompany, structure repair

**Scenario.** NPC is mid `cleanAnimalCorpse` (fauna-owned `cleanupClaimantNpcId`), or mid combat, or walking a work-contract bout / structure-repair session. Player time-skips.

**Files / symbols.**

- `src/ai/NpcAgent.ts` — `resolveTimeSkip()` clears `pendingAction` in place (~3244–3257), does **not** call `resetInFlightAction()` / `cancelCombat()` / `releaseSanitationCleanupReservation()`
- `resetInFlightAction()` (~3748) is the path that releases sanitation and conversation
- `die()` uses that path; skip does not

**Expected state.** An interrupt that destroys the concrete action uses the same cleanup as critical-need interrupt, so reservations and combat cannot outlive the action.

**Actual state.** Sanitation reservation can remain on a live corpse with no NPC walking to it until something else releases it (reconstruction wipes it because it is not persisted — another load-state fork). `combatIntent` can remain while `phase` is forced to `choose`/`sleep`. Work-contract assignment stays `travelling`/`working` but the NPC is teleported to home/work/garden. Structure-repair materials already consumed at `beginStructureRepair` remain consumed (episode persists — that part is OK) while the walk is forgotten.

**Systemic consequence.** Skip is not “the same simulation, coarsened”; it is a third interrupt implementation with a weaker cleanup set.

**Minimal architectural direction.** `resolveTimeSkip` should start by `resetInFlightAction({ lifecycle: 'fail', ... })` + `cancelCombat()`, then apply catch-up.

---

## 2. Suspicious areas requiring deeper recon

These are not confirmed findings; the code suggests risk but a second pass (or a test) is needed.

1. **Loaded in-transit transport vs skip (related to F2/F10).** `planTraderCollection` *can* resume an existing order after skip, so cargo is not always lost — only delayed and position-teleported. Confirm whether `choose()`/`work` block actually re-enters that planner the same day.
2. **Food freshness during skip.** Batches are day-anchored; skip advancing `elapsedDays` may age pantry food even though NPCs did not eat (F2). Could look like “food spoiled while nobody was hungry”.
3. **`Math.random()` in NPC player-pause** (`NpcAgent.update` ~2694) vs hashed scare/rat-eat rolls. Social pause is frame-order and FPS dependent. Probably presentation-only; confirm it never gates a persisted relation.
4. **Scare vs committed `AnimalTrip`.** Scare does not clear `this.trip`; `continueTrip` resumes after flee. For `home-return` that is likely correct; for a cave bear water/settlement trip it can resume a stale destination from a displaced cave-interior position. `snapY()` still contains horizontally — needs a cave+scare walk-through.
5. **Attraction (fauna-023) vs scare vs hunger.** Priority table puts scare above prey-normal (where attraction sits). Unlikely double-consume; more likely bait abandoned mid-approach. Confirm `DroppedItems` is not claimed.
6. **Helper delivery vs player household transfer.** Both mutate `Household` through real inventories. Probably last-writer-wins and atomic per call; worth a two-actor test (player dump food while NPC `takeFood` onComplete).
7. **Hunter yield on `carried`.** Documented loss on reconstruction; combined with unpersisted wild fauna it can look like meat vanishing *and* the deer respawning. Persistence docs call wild non-persistence deliberate — listed under asymmetries, not F-findings.
8. **Work-contract target disappearance.** `npc-037` is queued because live discovery is already stale-prone; skip teleport (F10) makes a worker “working” far from the site. Not fully traced here.
9. **WorldBundle rebuild of a player lead.** `createLeadActions` closes over `resolveMountAnimal`. Rebuild swaps `SettlementsManager`; if the resolver reads the current bundle it is fine, if it captured the old one the lead silently dies (same symptom as F7).

---

## 3. Intentional asymmetries

Do not “fix” these as bugs unless a later plan changes the contract. They are visible in code and domain docs.

- **`NpcAgent.carried` is runtime-only.** Interrupted claim/delivery after pickup genuinely loses goods. Personal belongings and `transportCargo` persist. Accepted tradeoff in `npc.md` / `persistence.md`.
- **Ordinary wild individuals are not persisted.** Population reconstructs; mid-chase rabies/juvenile/position do not. Persistent habitat occupants and livestock/rats are the exceptions.
- **Player HP is not persisted** (documented gap with no stated rationale — maintainer decision, not an integration hole).
- **Fauna outgoing damage** uses a flat table, not the shared crit/defense pipeline.
- **Need-driven actions are not pre-empted by a different need or by weather**; only vigor collapse / critical-need / severe weather on *idle* (schedule) actions. Schedule hour changes never interrupt. Deliberate interrupt≠arbitration table.
- **Home settlement never unloads.** Distant settlements do. That is a streaming policy, not a bug by itself (F3 is the *inconsistent catch-up* on top of it).
- **Livestock production** is lazy day-anchor; hunger is per-tick. Documented; F3/F8 are the problem when other systems *also* grow day-anchors beside them.
- **Cart hitch is runtime-only** because livestock can unload while carts persist.
- **Player cannot damage NPCs.** Combat.md: melee candidates are animals only.

---

## 4. Useful invariants (verified or proposed)

Verified as *intended* by current owners, not all enforced:

1. **A concrete item stack has one inventory owner at a time** inside a single `transferInventoryItems` / `executeTransportPickup|Unload` / `executeProduction` call. Those seams revalidate live state. Death+transport (F1) and heal+inventory (F5) violate the *spirit* across systems.
2. **Detailed XOR off-screen execution** for `TransportOrder` (`beginOffscreenTransportExecution` no-ops if `execution` exists; stream-in `clearExecution`). Holds for live carriers; F1’s dead carrier still gets a later off-screen arm.
3. **The same skip hours must not be live-ticked and catch-up-ticked.** `gameLoop` enforces freeze-then-once for loaded NPC/fauna. Unloaded entities get neither (F3/F8) or a different aggregate (agriculture).
4. **Stream-in/out must not change semantic results** — currently false for F1, F4, F7, F8.
5. **Dead entities must not start new world actions.** NPC `update()` early-returns when dead (good). Off-screen transport still acts on dead carriers (F1). Fauna `takeDamage` no-ops when dead (good).
6. **A commitment to a deleted/dead target needs a deterministic release.** Work contracts: `die()` → `release(..., 'death')`. Transport: missing. Burial: missing on claimant death; wrong-NPC recover (F6). Accompany: `die()` ends it.
7. **Sanitation `cleanupClaimantNpcId` and predator `claimedBy` are mutually exclusive, transient, not persisted.** Reconstruction drops them; skip currently may not (F10).
8. **`WorldBundle` rebuild and save use the same snapshot functions** (`persistence.md`). That does **not** cover execution state (`phase`/`carried`/`trip`), so rebuild ≠ continue-as-was.

Proposed additions if the living world is meant to stay coherent:

- `health.dead` ⇒ `transportCargo` empty XOR order terminal.
- Burial `burialClaimantId` is either a living NPC with matching plan, or the claim is `active`.
- Livestock with `stray.active` or `leadAttached` is not tied to settlement stream lifetime.
- Animal corpses that persist use a world-days death anchor.

---

## 5. Regression risks from queued plans

Plans are not implementations. Only plans that, given *this* recon, would amplify a found hole, assume a stale contract, or add a parallel mechanism:

| Plan | Risk vs this recon |
|---|---|
| `settlements-npcs-020` economy-driven transport demand | More `in-transit` orders. F1 (carrier death) becomes common, not a Trader-edge case. Status note still talks as if 018/019 were design contracts — they are now code; recon before planning. |
| `settlements-npcs-021` / `028` remote logistics & long-distance NPC travel | Off-screen carriers + death/skip. Needs F1 + a real off-screen NPC physiology contract (F3) *before* more distance. |
| `npc-032` expedition needs and survival | Draft still says 019/029/028 may be “planned dependencies”; 019/029 have landed. Building expedition eating on `resolveTimeSkip`’s magic `relieveNeed('food')` (F2) would bake the pantry bug into companions. Healing-from-`carried` (F5) would make gifted trail medicine inert. |
| `npc-030` / `npc-031` paid escort / voluntary join | More accompany + travel checkpoints. `resolveTimeSkip` teleport (F10) fights off-screen travel (`npcTravel.ts`). |
| `npc-037` stale work-contract targets | Addresses a real hole (F10 teleport + missing targets). Must reuse contract-owned state, not invent a second assignment. Safe if it stays a resolver. |
| `items-player-028` NPC/player storage policies | Another inventory owner. If heal/combat/food keep splitting `carried` vs `personalInventory` vs household, policies will not be enforceable. Fix F5’s read-set first. |
| `npc-027` NPC cave traversal | Fauna cave trips already skip roam clamp; NPC cave + combat/death/corpse would hit F1/F6-style commitments in a second spatial domain. |
| `settlements-npcs-016` / `017` production chains | More household item recipes. Production executor already revalidates (good). Do not add a parallel production tick. Combined with F4, skip-in-village would skip whole chains. |
| `fauna-023` attraction (verification still open) | Landed. Watch scare/trip/attraction abandonment (suspicious #4–5), not a new lure manager. |
| `quests-progression-016` / lost-livestock opportunities | Natural stray (F9) + unload vanish (F7) + frozen stray corpses (F8) can fail or complete quests without the player seeing the animal. |

Plans that do **not** look like they should wait on these invariants: pure presentation (`world-terrain-023` roads), tools (`tools-013` decision verification — actually helpful to *catch* F2/F5), treasure/cave content (`quests-progression-008`) as long as they do not mint a second occupant persistence.

---

## 6. What this audit explicitly did not treat as findings

- Missing inter-settlement trade, taming, mounted combat, player-vs-NPC damage, Social Places beyond campfire.
- Documented `carried` loss and wild-fauna non-persistence, except where they **combine with a persisted ledger** in a way the current code already contradicts (F1 cargo, F5 heal).
- Structure-repair material consume-on-begin: resume-from-episode is designed; skip only forgets the walk (F10), it does not double-charge.

---

## Independent-review comparison

Read only after §1–§5 were written. Sources:

- `docs/reviews/2026-09-12--living-world-consistency-audit.md` (hereafter **Consistency**)
- `docs/reviews/2026-09-12--independent-simulation-architecture-review.md` (hereafter **Architecture**)

This section does **not** rewrite the findings above. It only maps overlap, uniqueness, and disagreements. No synthesis / priority merge.

### Independently confirmed by multiple audits

Same underlying code path, found without sharing notes:

| This audit | Consistency | Architecture | Notes |
|---|---|---|---|
| F1 carrier death + posthumous off-screen unload | A9 (death as economic dead-end, including cargo) | F4 (same scenario, high) | All three read `commitNpcDeath` + `beginOffscreenTransportHandoff` + no `health.dead` check. This audit rates **critical** because stream timing inverts conservation (loss vs ghost delivery). Architecture rates high. |
| F2 skip relieves food/wood without live mutations; waterDuty mints | A7 | F6 | All three cite `NpcAgent.resolveTimeSkip` vs `beginNeed` onComplete. Architecture also notes skip-stamp of agriculture in the same finding; this audit split that into F4. |
| F3 presence selects a different time model (loaded skip vs unloaded freeze vs day-anchor catch-up) | A2 (livestock/rats omitted from skip catch-up) | F1 (loaded presence changes whether World Time is applied) | Shared core. This audit’s emphasis is the **patchwork**: agriculture/injury/NPC corpses do catch up, needs/rats/livestock hunger do not. |
| F4 skip/save stamp burns non-home agriculture catch-up | (implied in A7 / not a named finding) | F6 + F9 | Architecture states the stamp/catch-up fork explicitly. This audit isolated it as its own load-state food bug. |
| F6 burial recover uses scanner’s plan | A4 | — | Same call site (`burialPressure.ts` line calling `recoverStaleNpcBurialClaim` before the owner guard). Architecture did not list it. This audit additionally flags last-claimant-death deadlock. |
| F8 livestock corpse `timeSinceDeath` vs NPC `deathAtDays` | A10 | (inside F1) | Consistency wants a day-anchor migration. This audit stresses **unload freeze** of stray-corpse TTL, not only skip-while-loaded. |
| F9 storm scare can latch natural stray | B2 (suspicious) | — | Consistency left it as deeper recon. This audit promoted it to confirmed/medium because fauna-025’s grace comment and world-026’s verification text already contradict in-tree. |

Two large findings appear in **both other audits** and were **not** independently confirmed here (not because they were rejected — the `others[]` pool split was outside this pass’s traced call chains):

- Wild predators and household livestock never share an encounter set (Consistency A1, Architecture F5).
- Rat `lastReconcileDay = -Infinity` on every `createRats()` → stream-frequency food drain (Consistency A3, Architecture F8).

Those should be treated as independently confirmed *by the other two*, pending a third-pass re-read of `createFauna.ts` / `tickSettlementLivestock` / `rats.ts`. They are not silently adopted into §1.

### Unique to this adversarial audit

| Finding | Why the other two did not (or did not isolate) it |
|---|---|
| **F5** heal path reads only `carried`; household starter bandages and player gifts go elsewhere | Architecture F16 is the sibling inventory split (hunter arrows / `personalInventory`) but does not mention `findInjuryTreatment`. Consistency does not discuss healing inventories. items-player-027 landed in the same window as this recon. |
| **F7** household/stray/led livestock disposed with non-home settlement unload; only player-owned animals detach | Architecture F2 is NPC home-teleport on stream-out, not livestock object lifetime. Consistency A8 is quest-slot consumption, not the lead+unload vanish. |
| **F10** skip bypasses `resetInFlightAction` (sanitation reservation leak, leftover `combatIntent`, teleported contract workers) | Others describe skip teleport and dropped `pendingAction`; they do not contrast it with the shared interrupt cleanup path. |

Adversarial framing also treated **carried loss** as a documented asymmetry (§3) except where it collides with a *second* persisted ledger (F1 transport, F5 heal). That is a scoping choice, not a claim that hunter meat cannot vanish.

### Disagreements requiring synthesis

Do not resolve these here.

1. **Is `carried` an accepted tradeoff or a conservation bug?** Architecture F3: high — work cargo already holds ore/meat/claimed food, reconstruction mints hunter arrows, death drops nothing. This audit: listed as intentional in `npc.md`/`persistence.md`, and only promoted combinations that already have an authoritative sibling (`transportCargo`, `personalInventory`, household bandages). Consistency A9 bundles death-of-carried into a broader “death is a dead end”.
2. **Severity of F1 / Architecture F4.** Critical vs high. Same facts. The disagreement is whether load-dependent delivery of dead-carrier cargo is an identity/conservation invert (this audit) or a high seam leak (Architecture).
3. **WaterDuty during skip.** Architecture F6: minting is an acceptable approximation because wells are infinite. This audit F2: it is still a magic create, and it is inconsistent with food (which does not even approximate `takeFood`).
4. **Natural stray vs lost-livestock quest authorship.** Architecture F7: quest layer *teleports* eligible animals when offering. This audit did not confirm that write path (did not read `syncLostLivestockQuests`). Consistency A8: natural stray *consumes* the one-shot quest slot. Three different quest×stray bugs; they may all be true and need one ownership rule.
5. **Wood `EconomicStock` vs `branch`/`beam` (Consistency A5) and repair livelock (A6).** Not in this audit. Not rejected. Out of this pass’s adversarial combinations.
6. **Off-screen agriculture physics (Architecture F9)** — seed batches × `FamilyDef` farmer-days vs live Farmer crop lifecycle — is a deeper production-model split than this audit’s F4 stamp bug. Both can be true.
7. **Home always loaded.** All three treat it as the reason home avoids some stream bugs and concentrates skip bugs. Not a disagreement.

No attempt is made here to pick a single ranked backlog. That is a later synthesis step.
