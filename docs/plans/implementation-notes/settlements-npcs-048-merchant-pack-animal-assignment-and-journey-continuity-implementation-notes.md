# Implementation Notes: Merchant pack-animal assignment and journey continuity

**Plan:** `settlements-npcs-048-merchant-pack-animal-assignment-and-journey-continuity.md`  
**Reviewed against:** current `main`, 2026-09-19

## Recon conclusion

The plan direction is valid, but current code materially changes the implementation:

- `settlements-npcs-038` is already implemented: `MerchantJourneyState`, outbound/visiting/returning transitions, foreign merchant materialization and bounded journey checkpoints exist. Extend those seams; do not build another journey/off-screen system.
- `settlements-npcs-047` code is present: transport baseline is 10 kg, `resolveNpcTransportCargoCapacity()` exists, and `Inventory.setBaseMaxWeight()` is the intended mutable-capacity seam.
- `fauna-039` now owns real equipped saddlebags through persistent `AnimalPackState` on `AnimalAgent`, including attachment presentation and death handoff. The source plan's synthetic "merchant inventory item => bags visual, but no animal equipment state" design is stale and must not be implemented.
- Livestock `animalId` is not globally unique across settlements. A travelling pack animal must be addressed by origin namespace + id, not by bare `animalId`.

## Ownership model

Keep the existing owners:

```text
MerchantJourneyState
  owns merchant↔pack-animal semantic assignment (packAnimalId)

NpcAuthoritativeState.transportCargo
  owns transported goods

AnimalDef.pack
  owns capacity capability/tuning

AnimalAgent + LivestockRegistry
  own animal state/persistence

NpcTravelContinuity / merchantJourney checkpoints
  own merchant spatial/off-screen lifecycle
```

Do not move transport goods into `AnimalPackState.contents`. Equipped saddlebags inventory and merchant transport cargo are separate systems.

## Journey state and persistence

Add only:

```ts
packAnimalId?: string
```

to `MerchantJourneyState`. `homeSettlementId` is the origin namespace for that id, so a second persisted settlement-id field is unnecessary.

Update all current reconstructing transitions, not only the type:

- `cloneMerchantJourney()`;
- `advanceMerchantJourneyToVisiting()`;
- `tryBeginMerchantReturn()`;
- journey creation in `NpcAgent`;
- `saveData.ts::isMerchantJourneyState()`;
- existing merchant-journey round-trip tests.

Both phase-transition helpers currently rebuild object literals, so failing to explicitly copy `packAnimalId` will silently drop the assignment.

No save migration/top-level registry is needed: optional absence means an ordinary no-pack journey.

## Assignment seam

Selection should happen at the existing journey-start boundary used by `planTraderInterSettlementExport()`, not later at stream-out.

Do not put livestock scans in `npcProfessionWork.ts`. Give the journey-start path the narrowest manager-owned resolver needed to select/reserve a candidate from the merchant's own `Household.homeId`.

Candidate requirements:

- household-owned by that merchant household;
- alive;
- `def.pack` present;
- not player-owned;
- not already reserved by another active `MerchantJourneyState.packAnimalId`;
- not in an incompatible live state such as mounted/player-led/hitched if current runtime APIs expose it.

Keep selection deterministic. Prefer capability data, not species branches; a sensible order is higher `def.pack.cargoCapacityKg`, then stable origin/id tie-break.

Active journeys are the assignment authority. Derive "reserved by another merchant" from current merchant journey states rather than adding a second persisted reservation registry.

### Important capacity-ordering trap

`transportCargo.canAdd(...)` already participates in transport quantity planning. Therefore the pack assignment/capacity reconciliation must occur **before** the relevant outbound quantity is finalized. Merely setting capacity after the `TransportOrder` has already been sized will leave the first pack-animal trip using the 10 kg baseline.

Refactor the existing start seam only as far as necessary so:

```text
resolve pack candidate
→ set journey.packAnimalId
→ reconcile transportCargo capacity
→ size/commit outbound cargo/order
```

If no candidate exists, keep the same flow at 10 kg.

## Transport capacity reconciliation

Use:

```ts
state.transportCargo.setBaseMaxWeight(
  resolveNpcTransportCargoCapacity(packAnimal?.def.pack),
)
```

Do not persist the derived capacity.

Reconcile at least on:

- journey creation/assignment;
- restore/rebuild before transport work resumes;
- pack-animal death/loss detection;
- successful home return when the relation is cleared.

If the animal becomes invalid, remove only the capacity contribution. Existing `Inventory.setBaseMaxWeight()` deliberately preserves overweight contents and blocks further additions; do not drop or delete cargo.

## Persistent animal identity and detached lifecycle

Current `PersistentLivestockContext` uses bare-id maps:

- `detachedById`;
- `detachedOriginById`;
- `resolveLivePersistentAnimal(animalId)`.

That is insufficient for 048 because livestock ids can collide between settlements. Generalize the persistent-livestock lookup/index to support a canonical key equivalent to:

```text
(originSettlementId, animalId)
```

and use that path for merchant pack animals. Avoid adding a parallel merchant-only animal registry.

The detached collection itself can remain the shared runtime collection, but its reason must no longer mean "player-owned". A small runtime-only discriminator such as:

```ts
'player-owned' | 'merchant-journey'
```

is enough if needed for reconciliation. Do not persist the reason separately: player ownership comes from `AnimalOwner`, merchant detachment is derivable from active `MerchantJourneyState`.

### Home reconstruction suppression

`shouldSpawnDeterministicLivestockSlot()` currently suppresses tombstones and player-owned records only. A household-owned pack animal on a merchant journey would therefore be recreated at home unless this gate is extended.

Suppress the deterministic home slot when the origin/id is actively assigned to a merchant journey. Do not fake player ownership, change `AnimalOwner`, remove household membership or tombstone the slot.

On successful return, clear journey assignment and let the normal household slot/materialization path resume with the same saved animal state.

## Detailed follow

Reuse the existing fauna movement seam, not player Follow state.

Current tight lead band is already defined in `src/fauna/animalLead.ts`:

```text
LEAD_START_DISTANCE = 4.5
LEAD_STOP_DISTANCE  = 2.2
```

Use the same values/helpers (`leadStartDistance`, `leadStopDistance`, `resolveFollowHysteresis`) for V1 pack-animal trailing unless browser tuning later proves otherwise.

Do not reuse `AnimalUpdateContext.playerControlPos` or `OwnedAnimalControlState`; both are player semantics. Add an actor-neutral, narrow temporary follow target for the merchant position and keep its hysteresis runtime-only on the animal.

Preserve current fauna arbitration: threat/flee, urgent needs and other higher-priority survival behavior may interrupt following; once clear, the pack animal resumes following. Do not teleport or parent it under the NPC.

## Off-screen continuity and reification

Do not add `AnimalTravelState` for V1.

While `merchantJourney.packAnimalId` is valid:

- the merchant journey is the shared semantic journey clock/context;
- pack-animal position may be approximated from the merchant's current travel checkpoint while off-screen;
- when destination/home becomes detailed, materialize one `AnimalAgent` near the same merchant using the existing `spawnAnimalFromRecord()` / livestock hydrate path;
- preserve health, needs, owner, stray/training state and any existing `AnimalPackState`.

The one-live-animal invariant must cover simultaneous home + destination streaming. A travelling assignment wins over normal origin-settlement materialization until return cleanup.

## Death/loss semantics

A dead pack animal must not block the merchant lifecycle.

On death:

- keep the same animal identity/corpse state;
- immediately reconcile merchant transport capacity to baseline 10 kg;
- keep merchant `transportCargo` on the NPC;
- do not auto-select a replacement during that journey;
- return/visit timing continues through existing merchant journey code.

If the animal has a real `AnimalPackState`, reuse the existing fauna-039 pack death-handoff; do not create a merchant-specific saddlebags drop path.

## Saddlebags: source-plan correction

Do **not** implement plan §§23-24 as written.

Current authority is:

```text
AnimalPackState present
→ saddlebags equipment exists
→ existing animalPackPresentation attaches the visual

AnimalPackState absent
→ no saddlebags visual
```

Merchant `personalInventory.count('saddlebags')` must not directly drive presentation, and 048 should not auto-equip/consume that item merely to obtain a visual. Pack-animal transport capacity comes from the assigned animal's `AnimalDef.pack`, independently of whether an equipment pack is currently fitted.

If merchant preparation later requires real saddlebags, implement it as an actual equipment transaction reusing `AnimalPackState`, not a second cosmetic flag.

## Existing systems to reuse

- `src/settlement/merchantJourney.ts` — lifecycle state/transitions.
- `src/settlement/SettlementsManager.ts::resolveMerchantJourneyCheckpoints()` — bounded visit/return checkpoint.
- `src/world/transportTravelArrival.ts` — successful outbound arrival/unload seam.
- `src/world/transportCapacity.ts` — baseline + pack capacity resolver.
- `src/items/Inventory.ts::setBaseMaxWeight()`.
- `src/settlement/livestock.ts` — registry, spawn/hydrate, shared detached tick.
- `src/shared/followHysteresis.ts` and `src/fauna/animalLead.ts`.
- `src/fauna/animalPack.ts` / `animalPackPresentation.ts` — real saddlebags authority/presentation.
- existing fauna-039 death handoff for a genuinely equipped pack.

## Focused tests

Highest-value regressions:

- `packAnimalId` survives outbound → visiting → returning and save/restore;
- phase helpers do not drop it while rebuilding journey objects;
- two settlements with the same bare `animalId` resolve the correct origin animal;
- active journey suppresses the home deterministic slot without changing ownership;
- one live animal across home/destination streaming;
- pack assignment happens early enough that the first outbound order can use 40/50 kg capacity;
- death/loss drops effective transport capacity to 10 kg without deleting existing cargo;
- no automatic replacement mid-journey;
- return clears assignment exactly once and restores normal home lifecycle;
- detailed follow uses 4.5/2.2 hysteresis and yields to threat/urgent needs;
- merchant inventory containing `saddlebags` alone does not create a second/synthetic bag visual;
- real existing `AnimalPackState` still survives travel and uses the normal fauna-039 death handoff.

Browser verification remains User-owned.
