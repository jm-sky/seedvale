# Implementation Notes: settlements-013 — Horse training progression, vendor and paddock

**Plan:** `docs/plans/settlements-013-horse-training-progression-vendor-and-paddock.md`  
**Reviewed:** 2026-09-15  
**Status:** `planned` 📋  
**Source of truth:** current `main` code + docs.

## Current code reality

### Dependencies are not implemented yet

`settlements-012` is still `planned`. Its notes define Merchant specialization/profile and finite Merchant stock, but none of those contracts exist on `main` yet. Do not invent a temporary horse-vendor specialization API inside this plan; implement against the final `settlements-012` contract after it lands.

`settlements-009` is also still `planned`. The current `VillagePlan` has only `zones`, `plots`, `buildings`, `landmarks`, `paths` and `entrances`; there is no pasture/satellite-area or generic planned fence contract yet. The paddock section should reuse/extract the generic satellite-footprint/fence helpers introduced by `settlements-009`, not create a parallel planner/occupancy path.

This makes `settlements-009` a practical implementation prerequisite for the paddock half even though the original metadata listed only `settlements-012`.

## Horse training state

`src/fauna/AnimalAgent.ts::AnimalSaveState` is already the authoritative persisted individual-animal state used by livestock. It contains health, life (`hunger`, `thirst`, `stamina`), ownership, control, affinity, name, rabies and stray state. `src/settlement/livestock.ts::LivestockSaveRecord` extends that snapshot and `LivestockRegistry.capture()/upsert()/serialize()` persists the same individual across streaming/save-load.

**Decision:** add optional `training?: HorseTrainingState` to `AnimalSaveState` and make `AnimalAgent.snapshot()/hydrate()` round-trip it. Keep the field optional for old saves and non-horses; normalize/clamp it at the `AnimalAgent` mutation boundary. Do not add a settlement-side training registry.

Keep a focused fauna module (for example `horseTraining.ts`) for:

- `HorseTrainingState`;
- progress clamp/range;
- derived `HorseTrainingTier`;
- pure effective modifiers;
- one mutation function/method used by future training events.

`ordinary/trained/warhorse` must remain derived and never be persisted.

Initial vendor-horse progress should be generated once from stable horse identity / settlement seed and then persisted with that concrete animal. Do not rederive mutable progress from seed after the individual has entered persisted livestock state.

## Mount integration

Riding is already implemented through `src/app/actions/mountActions.ts` + `AnimalAgent.driveMounted()` and the existing Riding skill. `AnimalDef.mount` is capability/config data in `src/fauna/animalDefs.ts`; horse and donkey share the same riding path.

Do not mutate global `ANIMAL_DEFS.horse` or add tier-specific `AnimalDef`s. Resolve training modifiers per concrete horse at the narrow existing integration points.

Prefer modifiers that map cleanly to current mechanics:

- mounted speed/stamina cost/capacity through `AnimalAgent.driveMounted()` / existing life stamina calculations;
- fall/throw resistance through the existing `ridingStability.ts` inputs used by `mountActions`;
- health only if `AnimalAgent` can apply a per-individual max-health modifier without rewriting persisted current/max semantics.

Do not invent a new panic/throw subsystem merely to give `trained`/`warhorse` another bonus. Current riding already has a stability/fall seam; use it. Keep ordinary training at exact current baseline.

Player Riding skill and horse training are independent inputs to one effective result; neither should overwrite the other.

## Vendor horses must stay livestock individuals

`src/settlement/livestock.ts` is already the correct lifecycle/persistence mechanism for settlement horses:

- stable `animalId`;
- `AnimalAgent` runtime entity;
- capture before stream-out/save;
- removed tombstones;
- player-owned records are not respawned into household slots;
- `spawnAnimalFromRecord()` can reconstruct a persisted individual.

Extend this mechanism for vendor-paddock origin slots rather than creating `HorseVendorInventory` or UI-only horses. Vendor horses need stable ids derived from settlement+paddock slot, plus a stable origin association sufficient to restore them to the same paddock while unsold.

A sold horse must remain the same `AnimalAgent`; ownership transfer must not change id, training, health, stamina or name.

Be careful with deterministic respawn rules: absence from a slot cannot mean "seed a new horse" because a sold/dead horse would return. Reuse the livestock removed/saved-state pattern or add an explicit initialized/origin-slot state so sold-out slots stay empty.

## Acquisition / transaction path

`src/settlement/horseAcquisition.ts` already models availability as a derived view over a live horse. `src/app/inventoryWiring.ts` already exposes the live merchant horse and `src/items/trade.ts::settlePricedPurchase()` / `previewPricedPurchaseNetCoins()` provide the atomic world-entity purchase seam.

Generalize that path from `merchantHorseAnimalId(settlementId)` to a vendor-specific list of concrete animal ids; do not create a second transaction flow.

Preview and commit must both resolve the live `AnimalAgent`. Commit must re-check live/dead/ownership/vendor eligibility before charging and transferring ownership.

Keep the existing quest-reserved wagon horse separate unless `settlements-012` explicitly makes that NPC the horse-specialized vendor. Do not accidentally expose the authored quest target as a normal paddock offer.

Pricing should remain a horse-acquisition price resolver feeding the shared priced-purchase transaction. Training may alter the base horse price there; relationship/social pricing should only be reused if the existing horse transaction actually supports it after `settlements-012`. Do not create a second social-pricing formula.

## Merchant/operator assignment

After `settlements-012`, horse vendor should be one deterministic specialization of an existing `role === 'trader'` Merchant. Reuse its settlement-level ordered Merchant profile resolver; add `horses` to that specialization contract rather than storing a new role/profession on the NPC.

Resolve at most one horse-specialized operator per settlement in V1. The paddock and horse origin slots belong to settlement plan/state, not to the NPC lifecycle; operator death/reassignment must not delete them.

The `SM/MD/LG/XL` probability is a single settlement-level setup outcome with its own deterministic salt. First resolve eligibility/setup, then choose an existing eligible Trader. Do not roll per NPC.

## Paddock planning

After `settlements-009`, reuse its satellite-area placement geometry, dry-path/river/slope checks and planned fence representation. The vendor paddock is semantically different from the open pasture, but should share geometry utilities and stable plan-data conventions.

Add a dedicated optional paddock contract to `VillagePlan`; do not overload `zone-livestock` or a `market` landmark. It should carry only gameplay-relevant planned data: stable id, footprint, entrance corridor/gap, fence segments, trough anchor, food-haystack anchor, operator/work anchor and deterministic horse slot/home anchors.

Capacity must be a pure function of accepted footprint/slot geometry. Spawn count is bounded by those slots.

Planner acceptance must validate the whole paddock package together. A candidate whose entrance, trough, haystack or fence collides with core plots/paths/water is rejected; materialization must not "fix" gameplay anchors afterwards.

Do not create a full gate-door simulation. The gap/corridor is plan data and must also be the route used when a horse transitions out of paddock containment.

## Paddock containment / leaving after purchase

Current livestock roaming is household/home-radius based; there is no generic paddock containment system on `main`. Do not approximate a functional fence with visuals while allowing autonomous vendor horses to walk through it.

Implement the smallest reusable fauna boundary seam: vendor-origin horses use the paddock footprint as their normal roam/need leash and the planned entrance corridor as the only boundary transition route. Keep it data-driven, not horse-kind branching, so future fenced livestock areas can reuse it.

After purchase, change ownership immediately but preserve the paddock/origin association temporarily. Clear that association when the player actually leads/rides the horse through/outside the planned entrance/footprint. Do not teleport it on purchase and do not clear the association merely because owner became `player`.

Avoid putting this state into Merchant NPC data; it belongs to the horse/origin relationship.

## Water

Settlement trough water is not an independent reservoir. `src/settlement/household.ts` owns the authoritative `Household.water`, and `src/fauna/animalForaging.ts` already consumes that reserve through the stored-water source path. `settlements-009` notes already identify this coupling.

For a vendor paddock, do not add an infinite-water or paddock-only water store. Prefer the generalized stored-water provider/target seam from `settlements-009`; bind the paddock trough to a real settlement/household water owner selected by the final implementation. Consumption must still go through the existing atomic relief/source path, and an empty reserve must fall back to normal water seeking.

If `settlements-009` lands with only household-specific adapters, extend that adapter once; do not fork a second trough FSM.

## Food-only paddock haystack

Current code does not expose a ready-made generic food-source haystack contract. Treat this as a new explicit capability/source, not as the existing sleeping haystack/bed semantics.

Recommended shape: a narrow `AnimalFoodSource`/target entry consumed by the existing `animalForaging.ts` hunger search/relief path, with `kind: 'paddock-hay'` (or equivalent), fixed planned position and infinite V1 availability. Gate it through existing diet acceptance so only animals that accept hay can use it.

Do not mint `hay` items, touch `Household.items` or settlement economy, and do not add any sleep/interactable capability to this prop. Add the finite-stock replacement to `docs/plans/LOOSE-ENDS.md` during implementation as required by the plan.

## Initial population and distribution

Generate horse-vendor setup, slot count and initial training using dedicated deterministic salts so adding this feature does not consume existing livestock RNG sequences.

The setup probability is settlement-level. Training distribution is per generated slot/horse after setup; derive tier from progress only. Persist the resulting concrete horses immediately through the existing livestock registry lifecycle so stream/reload cannot reroll them.

Do not replenish sold/dead slots in V1.

## Persistence pitfalls

- `AnimalSaveState.training` should be optional/backward-compatible; do not bump save format solely for this field unless the current validator requires it.
- A player-owned horse can exist while its origin settlement is unloaded; `LivestockRegistry` already supports player-owned persisted records. Keep origin namespace stable enough for save/load lookup.
- Do not infer sale eligibility from `owner !== player` alone. Use origin slot + live/dead + reservation/transfer state so quest horses and unrelated household horses are never offered.
- Do not store derived tier, offer rows, vendor UI state or cached prices.
- Horse name is already persisted on the animal; transfer code must preserve it.

## Recommended implementation order

1. Land `settlements-009` and `settlements-012`; recon their final public contracts before coding this plan.
2. Add `HorseTrainingState`, derived tier/modifiers and `AnimalSaveState` snapshot/hydrate support with focused tests.
3. Thread effective modifiers through current riding/stability seams only.
4. Add `VillagePlan` paddock data + deterministic placement/capacity using the shared satellite/fence helpers.
5. Add persisted vendor-origin horse slots via the existing livestock registry/spawn path.
6. Add paddock containment/entrance transition and bind normal fauna needs.
7. Add stored-water trough target and food-only infinite paddock-hay target through existing foraging source handling.
8. Extend `settlements-012` Merchant specialization/operator assignment and generalize `horseAcquisition.ts`/`inventoryWiring.ts` to concrete live paddock horses.
9. Add the loose-end entry for finite hay and run repository-standard automated checks. Browser verification remains the user's responsibility.

## Primary files to recon/edit after dependencies land

- `src/fauna/AnimalAgent.ts`
- `src/fauna/animalDefs.ts`
- `src/fauna/animalForaging.ts`
- `src/app/actions/mountActions.ts`
- `src/player/ridingStability.ts`
- `src/settlement/livestock.ts`
- `src/settlement/horseAcquisition.ts`
- `src/app/inventoryWiring.ts`
- `src/settlement/villagePlan.ts`
- `src/settlement/villagePlanner.ts`
- settlement props/materialization files used by the final `settlements-009` fence/satellite contract
- Merchant profile/specialization files introduced by `settlements-012`
- `docs/plans/LOOSE-ENDS.md`

## Highest-risk pitfalls

- Implementing against planned `settlements-012`/`009` APIs instead of their final code.
- Adding training outside `AnimalSaveState`, causing ownership/streaming/save divergence.
- Mutating global `AnimalDef` for a per-horse tier.
- Reseeding an empty vendor slot after sale/death and resurrecting stock.
- Treating a visual fence gap as containment/pathing.
- Clearing paddock association immediately on ownership transfer and making the horse snap to another home behaviour.
- Giving paddock trough its own water reserve.
- Reusing a sleeping haystack and accidentally inheriting sleep capability.
- Rolling setup/premium chance per Merchant/horse instead of once per settlement.
- Rebuilding a second purchase/pricing/UI path instead of extending `horseAcquisition.ts` + shared trade transaction.

Do not run browser verification; manual browser verification remains the user's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**