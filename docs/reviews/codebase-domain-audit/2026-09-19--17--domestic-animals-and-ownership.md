# Codebase domain audit 17 — Domestic animals & ownership

**Date:** 2026-09-19  
**Area:** 17 — Domestic animals & ownership  
**Scope:** code correctness, architecture, lifecycle/persistence, performance  
**Baseline:** current `main`  
**Result:** ⚠️ reviewed with unresolved high findings

## 1. Scope

Traced:

```text
creation / acquisition
→ persistent identity
→ ownership / assignment
→ runtime materialization
→ follow / stay / merchant follow / mount
→ feeding / water / home/pasture/paddock
→ injury / death / corpse
→ unload / detached lifecycle / rebuild
→ save/load
→ restoration of the same identity and ownership
```

The review focused only on correctness, architecture, lifecycle/persistence and recurring runtime cost. Missing domestic-animal features or Vision/roadmap differences were not treated as findings.

Primary code inspected:

- `src/settlement/livestock.ts`
- `src/settlement/SettlementsManager.ts`
- `src/settlement/horseAcquisition.ts`
- `src/fauna/AnimalAgent.ts`
- `src/fauna/ownedAnimalControl.ts`
- `src/fauna/animalUpdateCadence.ts`
- `src/app/actions/mountActions.ts`
- `src/app/createApp.ts`
- merchant-journey / transport seams where they own pack-animal assignment and off-screen continuity.

Existing horse, livestock, player-owned-animal and merchant pack-animal plans were checked before deciding whether new plans were needed.

## 2. Entry points and state owners

### Settlement / household livestock

A loaded settlement owns its live `Settlement.livestock: AnimalAgent[]`. Household ownership is represented by `AnimalOwner { kind: 'household', houseId }`; while normally materialized in its settlement, an agent also receives runtime household/pasture/trough bindings.

`LivestockRegistry` owns durable per-individual snapshots and removal tombstones. Its persisted key is correctly namespaced by:

```text
(settlementId, animalId)
```

where `settlementId` remains the animal's origin namespace after transfer.

### Player-owned animals

Player acquisition reuses the same live `AnimalAgent`: `transferAnimalOwnership()` mutates the authoritative owner to `player`, removes the animal from the settlement roster and moves the same object into the manager-owned detached collection.

Follow/Stay is authoritative on the animal and persisted through `AnimalSaveState.control`. Stay anchors are persisted. A player-owned detached animal is restored from `LivestockRegistry` on manager creation.

### Riding

`mountActions.ts` owns the transient riding relation. The mount remains an `AnimalAgent`; the save only stores `SaveData.player.mountedAnimalId`. Boot restore resolves that id through the persistent livestock resolver and retries until the animal is available.

### Vendor/paddock horses

`horseAcquisition.ts` and settlements-013 reuse real livestock agents. Vendor horse identity, training and `paddockStay` are persisted on the same individual; purchase transfers the same agent instead of spawning a replacement.

### Merchant pack animals

`MerchantJourneyState.packAnimalId` is the assignment authority. Assignment removes a household-owned animal from its settlement roster and places the same agent in the shared detached collection. `SettlementsManager` then supplies a temporary merchant-follow target while the merchant has a live `NpcAgent`.

## 3. Flows traced

### Creation and acquisition

Deterministic livestock slots materialize into `AnimalAgent` instances and hydrate an existing compatible persisted record. Player horse purchase and ownership transfer preserve object identity. Vendor paddock horses use the same transfer path.

### Ownership and control

Household/player ownership is stored once in `AnimalAgent._owner` and included in snapshots. Follow/Stay does not create a second ownership flag. Temporary lead, mount and merchant-follow relations are runtime control relations rather than alternative owners.

### Feeding, water and home areas

Ordinary household livestock receives runtime `Household`, pasture roam, pasture trough and related bindings at settlement spawn. Needs use the shared fauna foraging/water path. Vendor paddock state persists independently through `paddockStay`.

### Injury, death and removal

Health/injury/corpse state lives on the same agent and is included in livestock snapshots. `readyToRemove()` drives removal; persistence records a tombstone so an unloaded/reloaded settlement cannot seed the dead individual again. Detached removal resolves the origin settlement before tombstoning.

### Settlement unload/rebuild

Before disposal, loaded settlement livestock is captured into `LivestockRegistry`. Player-owned and travelling merchant pack animals are deliberately detached from settlement streaming. Household merchant pack animals are reclaimed into the origin settlement when their assignment ends and the home settlement is available again.

### Save/load and mount restore

Player-owned animals restore as detached agents. Active merchant journeys restore their `packAnimalId` from the origin settlement's saved record. Mount restore is deferred against the same persistent-animal lookup.

## 4. Findings

### F17-1 — High — runtime persistent-animal identity is keyed by bare `animalId` although persisted identity is namespaced

**Category:** correctness / architecture / lifecycle / identity

The persistence layer correctly treats livestock identity as `(originSettlementId, animalId)`, and current code explicitly documents that deterministic household ids can collide between settlements.

The runtime persistent-livestock boundary does not preserve that identity:

- `PersistentLivestockContext.detachedById` is `Map<string, AnimalAgent>`;
- `detachedOriginById` is separately keyed by the same bare id;
- `resolveLivePersistentAnimal(ctx, animalId)` resolves detached state by bare id, then scans loaded settlements and returns the first matching bare id;
- `transferAnimalOwnership(animalId, ...)`, `setOwnedAnimalControl(animalId, ...)` and the public persistent-animal resolver inherit that ambiguity;
- mount restoration ultimately resolves through the same bare-id API.

The merchant implementation acknowledges the collision but works around it by rejecting a candidate if the shared detached map already contains the same bare id from another origin. `isPackAnimalReserved(animalId)` likewise treats an assignment in one settlement as reserving the same bare id globally.

Consequences are concrete:

- a legitimate horse/donkey in settlement B can become unavailable for merchant assignment solely because an unrelated same-id animal from settlement A is detached;
- player ownership transfer in settlement B can resolve the already-detached same-id animal from A first and fail instead of acquiring B;
- APIs that claim to resolve a persistent individual cannot express the full persisted identity.

This is not a theoretical namespace concern: the code comments and settlements-npcs-048 implementation notes already call out collisions such as two settlements producing the same household slot id.

**Required direction:** make the shared persistent-livestock runtime key canonical on origin + animal id and thread that identity through lookup/transfer/assignment boundaries. Do not add merchant-only or player-only registries.

**Existing plan:** covered by `settlements-npcs-048-merchant-pack-animal-assignment-and-journey-continuity.md` and especially its implementation notes, which explicitly require generalizing `PersistentLivestockContext` to an origin/id key. The current implementation substituted collision rejection instead, so the plan's verification is not complete for this contract.

### F17-2 — High — merchant pack-animal save/load reconstruction loses household/home/pasture runtime bindings

**Category:** correctness / lifecycle / persistence / disappearance risk

`restoreDetachedMerchantPackAnimals()` uses the generic `spawnAnimalFromRecord()` path.

That path constructs the agent from saved `x/z` and owner id, but does not restore the origin settlement's runtime domestic bindings:

- no `Household` object;
- no pasture roam;
- no pasture trough / trough household;
- no reconstructed household home anchor.

`AnimalAgent` sets `home` from constructor `x/z`. Therefore, for a save taken mid-journey, the restored household-owned pack animal's `home` becomes its in-transit saved position rather than its household home.

When the journey later ends, `reclaimDetachedHouseholdLivestock()` simply pushes this same agent back into `settlement.livestock`; it does not rebind its household/pasture/home context.

The persisted owner can therefore say “this household owns the animal” while the runtime domestic context after save/load says something else. After return this can produce exactly the “animal disappeared” class requested by the audit: normal autonomous movement may be anchored around a stale journey position, and household-backed feeding/water/pasture behaviour no longer has the same runtime inputs as an ordinarily spawned animal.

Without save/load, the detached journey keeps the original live object and therefore retains its original bindings; the defect is specifically reconstruction-dependent.

**Required direction:** merchant pack restoration/reclaim must reconstruct or rebind the same domestic runtime context the origin household slot would provide, while preserving the saved current position during travel. Home/pasture ownership context must not be inferred from the in-transit position.

**Existing plan:** `settlements-npcs-048` already requires save/load to preserve household ownership and a genuine home return to restore the normal livestock lifecycle. This finding should be closed in that plan rather than by a parallel plan.

### F17-3 — High — off-screen merchant journeys keep the pack animal as an autonomous detailed agent instead of sharing merchant spatial continuity

**Category:** correctness / lifecycle / performance

While an assigned merchant has a live `NpcAgent`, `SettlementsManager.update()` sets `AnimalAgent.setMerchantFollowTarget(liveMerchantPosition)`.

When the merchant is off-screen/unmaterialized, current code deliberately supplies no target:

```text
merchant not currently a live NpcAgent
→ merchant follow target = null
→ detached pack animal falls back to normal fauna autonomy
```

The animal remains a live detached `AnimalAgent` and continues to be ticked through `tickSettlementLivestock()`. Its physical/logical position is therefore allowed to diverge from the merchant's authoritative journey/checkpoint while the merchant is represented only by off-screen journey state.

On destination/home rematerialization there is no observed reconciliation that first moves the same animal to the merchant's logical journey position. The detailed animal can consequently be far behind, have independently wandered toward needs, or remain near an earlier world location even though its assignment says it travelled with the merchant.

This also performs unnecessary detailed runtime work for an off-screen travelling companion whose coarse spatial authority already exists in `MerchantJourneyState`.

**Required direction:** while the merchant is off-screen, derive the pack animal's coarse/current journey position from the merchant journey/checkpoint and reify the same individual near the merchant when detailed simulation resumes. Do not create a second travel clock or a second animal.

**Existing plan:** explicitly covered by `settlements-npcs-048`, whose implementation notes state that merchant travel is the shared semantic journey clock and that the animal may be approximated from merchant checkpoints off-screen. Current production code has not completed that part.

## 5. Architecture observations

The domestic-animal architecture is otherwise mostly coherent:

- ownership is a typed `AnimalOwner`, not duplicated player/household booleans;
- player acquisition transfers the same live object;
- Follow/Stay, mount, lead and merchant-follow are control/relationship layers, not competing ownership state;
- `LivestockRegistry` correctly preserves origin settlement provenance and tombstones;
- corpse/removal state is captured with the same individual;
- vendor horse training and paddock state reuse livestock persistence;
- mounting keeps the animal authoritative for HP/stamina/position.

No always-`true` / always-`false` ownership predicate was found in the traced paths.

Performance-wise, detached animals still use the shared fauna cadence rather than a second update loop. One intentional pressure point remains: `playerCoupled` treats every player-owned Follow/Stay animal as immediate importance even when far away. That can make a large remote owned herd expensive, but this review does not classify it as a confirmed defect because fauna-028 explicitly chose that policy and there is no current evidence of a problematic owned-animal population size. Area 24 can benchmark it if domestic ownership scales up.

## 6. Cross-domain dependencies / follow-ups

- Area 03 (Persistence & lifecycle continuity) should include the generic consequences of bare-id entity references across save schemas and runtime registries.
- Area 19 (Player systems) can consume F17-1 when reviewing `mountedAnimalId`; the mount mechanism itself was coherent in this pass.
- Area 24 (Performance & workers) may benchmark detached/player-owned cadence cost at scale; no separate performance plan is justified from this static review alone.
- Area 11 already owns merchant transport/cargo conservation. This review only followed it far enough to establish pack-animal assignment/lifecycle.

## 7. Existing plans that already cover findings

Checked before creating new work:

- `fauna-020-player-owned-animals-and-follow-stay-behaviour.md` — player ownership transfer, detached lifetime and Follow/Stay persistence.
- `fauna-030-player-owned-animal-stay-safety-and-recovery.md` — Stay safety/recovery.
- `fauna-035-dismount-follow-stay-anchor-semantics.md` — mount/control anchor semantics.
- `fauna-039-animal-saddlebags-and-persistent-pack-inventory.md` — persistent pack state and origin-namespaced death handoff.
- `settlements-013-horse-training-progression-vendor-and-paddock.md` — live vendor horses, paddock/training state and same-entity purchase.
- `tools-014-player-owned-horse-debug-controls.md` — recovery/debug tooling; useful operationally but not an authority fix.
- `settlements-npcs-048-merchant-pack-animal-assignment-and-journey-continuity.md` — still `verification needed`; its implementation notes already specify the canonical origin/id key, off-screen merchant spatial authority, one-live-animal invariant and normal home lifecycle after return.

All three confirmed findings are within the shared lifecycle work already required by settlements-npcs-048. Creating another livestock/horse plan would duplicate that ownership boundary.

## 8. New plans required

None.

The required next action is to treat F17-1/F17-2/F17-3 as verification failures / incomplete implementation of `settlements-npcs-048`, not to create a parallel plan.

## 9. Verification limits

Review only. No production code was changed and no browser verification was performed.

The findings are static state-ownership/control-flow findings confirmed against current `main`. The user should perform gameplay verification after settlements-npcs-048 is corrected, especially:

- two settlements containing colliding deterministic livestock ids;
- save/load during outbound/visiting/returning;
- destination unload/reload;
- genuine home return after save/load;
- mounted/player-owned animal resolution when another settlement contains the same bare id.

## 10. Master status update

Area 17 should be marked:

**⚠️ reviewed with unresolved high/critical findings**

because persistent identity is ambiguous at the runtime boundary and merchant pack-animal save/load/off-screen continuity can restore the correct ownership record while losing the correct spatial/domestic runtime continuity.
