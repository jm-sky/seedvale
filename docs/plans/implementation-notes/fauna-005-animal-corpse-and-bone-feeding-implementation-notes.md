# Implementation Notes: Animal Corpse and Bone Feeding

## Current code reality

The plan is an extension of an already existing corpse-feeding path; it is not greenfield scavenging.

- src/fauna/AnimalAgent.ts already owns the food-source pipeline: pursueNeeds() → findFoodTarget() → findCarcassTarget() → pursueSourceTarget() → performSourceAction().
- Corpse targeting currently scans the others list, considers only dead prey, uses a bounded FOOD_SEARCH_RADIUS = 14, picks the nearest valid corpse, then claims it with claimAsFood().
- isCarcassEdible() currently rejects dead=false, expired, foodConsumed, and harvested corpses. isSourceTargetValid() additionally rejects anything whose corpsePhase() !== 'fresh'.
- Consumption currently calls consumeFood() and then markFoodConsumed(). This is a single binary consumed flag, not a quantity/remaining-edible-content model.
- Natural corpse decay is already implemented in AnimalAgent: fresh → rotting → bones at 20/40 seconds, with a 60-second unharvested corpse lifetime. harvestedRemains.ts supplies both harvested and natural bones visuals.
- naturalRemains is presentation/state attached to the corpse agent; it is not currently an independent food target. There is no separate bone entity/resource.
- Player knife harvest is centralized in src/fauna/animalHarvest.ts::harvestAnimalIntoInventory() and guarded by AnimalAgent.canHarvestMeat() / harvestMeat(). Harvested and predator-consumed state are intentionally separate today.

Therefore the main architectural gap is not target movement/interaction; it is representing edible corpse/bone contents and selecting among their quality states without breaking the existing corpse lifecycle.

## Recommended architecture

### 1. Extend AnimalDef, not predator branches

ANIMAL_DEFS currently has no food/scavenging capability fields. Add the smallest data-driven capability needed for this plan, e.g. corpse/bone edible + preference/value information.

Keep the default absent/false so only wolf is enabled initially. Do not add if-kind-is-wolf checks in targeting or consumption.

Do not introduce a second food system.

### 2. Keep SourceTarget as the movement/interaction abstraction

SourceTarget already cleanly separates discovery from movement and consumption. Extend its corpse representation rather than introducing ScavengingTarget, ScavengingManager, or a second action lifecycle.

The target needs enough information to distinguish at least fresh corpse, rotting corpse and bones.

The corpse itself should remain authoritative; do not copy a food quantity into the predator.

### 3. Fix the corpse state model before adding scoring

The current foodConsumed: boolean cannot express the plan's intended behaviour: predator eats remaining edible corpse content, corpse can subsequently become bones, bones can still be consumed, and player harvest/animal feeding can interact without duplicate resources.

Define one authoritative representation of remaining edible value/content on the corpse. Prefer a small state/quantity extension of AnimalAgent over a new world resource.

Important invariant: a successful animal feeding operation must atomically revalidate the corpse and mutate that authoritative state. The existing foodClaimedBy claim should remain the concurrency guard while the animal is approaching/eating.

Do not let foodConsumed become a second source of truth.

### 4. Keep natural bones inside the corpse abstraction

At corpsePhase === 'bones', naturalRemains is currently only a visual group. Feeding bones should use the corpse's state/position, not raycast/query the visual mesh and not create a separate BoneEntity.

When the last edible bone value is consumed, mark the corpse unavailable to feeding while preserving the existing normal cleanup/linger lifecycle.

### 5. Target scoring must be explicit but small

Current findCarcassTarget() is nearest-valid selection, not utility scoring. The fresh/rotting/bones preference therefore cannot be achieved by merely widening isCarcassEdible().

Introduce a small pure scoring/evaluation function rather than embedding many conditionals in AnimalAgent. It should combine existing hunger/food need with food quality/value, corpse phase, distance, species capability/preferences and a future risk/disease penalty seam.

Keep the current bounded FOOD_SEARCH_RADIUS; do not scan a global corpse registry.

Fresh should normally win. Rotting/bones should only win when hunger/available alternatives justify their lower value. Avoid inventing a second general-purpose utility framework for this one feature.

### 6. Player harvesting interaction

Current harvestMeat() deliberately allows only fresh corpses. Preserve that rule unless implementation discovers an explicit plan conflict.

Animal feeding must not call harvestAnimalIntoInventory() or otherwise reuse the player yield path: feeding is consumption, not item acquisition.

Player harvest must observe the same authoritative edible corpse content that animal feeding mutates. The existing separate meatHarvested flag is useful for the player-harvest visual/lifetime path, but must not become the animal-food quantity.

Be careful about ordering: a claimed wolf may be eating while the player starts harvesting; the final mutation must revalidate the live corpse state; a failed mutation must not relieve hunger.

### 7. Disease boundary

There is already disease-related fauna code (rabies), but there is no generic corpse-food disease API. Do not build one as part of this plan.

Expose a small evaluation seam such as a risk/penalty value in the food candidate data/function. Keep it inert unless an existing generic API is found during implementation.

Do not couple corpse feeding to rabies corpse exposure; that is a different mechanic already handled by corpse decay.

## Important existing symbols to reuse

- AnimalAgent.pursueNeeds()
- AnimalAgent.findFoodTarget()
- AnimalAgent.findCarcassTarget()
- AnimalAgent.isSourceTargetValid()
- AnimalAgent.pursueSourceTarget()
- AnimalAgent.performSourceAction()
- AnimalAgent.claimAsFood() / releaseFoodClaim() / markFoodConsumed()
- AnimalAgent.corpsePhase()
- AnimalAgent.canHarvestMeat() / harvestMeat()
- AnimalAgent.advanceCorpseDecay()
- AnimalAgent.readyToRemove()
- src/fauna/animalHarvest.ts::harvestAnimalIntoInventory()
- src/fauna/harvestedRemains.ts::createNaturalRemainsAsync()
- src/fauna/AnimalLife.ts::consumeFood()

The existing tests in src/fauna/foodWaterTargeting.test.ts already cover carcass eligibility and claim semantics; extend this style with pure tests for candidate quality/scoring and consumption-state transitions. src/fauna/corpseDecay.test.ts already covers the phase lifecycle and natural remains.

## Performance / locality

Do not add a world-wide corpse registry or per-corpse scan.

The current food search is bounded by the others collection and FOOD_SEARCH_RADIUS. Preserve that architecture and verify what Fauna supplies as others before changing it; if the list is already the loaded/local animal set, no new discovery mechanism is needed.

Do not increase animal update frequency and do not add a worker.

## Likely pitfalls

- Simply changing isCarcassEdible() to accept rotting/bones would make all three phases effectively equal because current selection is nearest-first.
- Reusing foodConsumed for partial feeding will lose the distinction between remaining corpse value and completed feeding.
- Treating naturalRemains as a new entity/resource would duplicate corpse ownership.
- Letting bones become a separate dropped item would break the plan's shared corpse state and cleanup lifecycle.
- findCarcassTarget() currently considers only o.def.role === 'prey'; keep the initial scope aligned with actual killable prey/corpse semantics rather than broadening to arbitrary dead agents.
- performSourceAction() currently applies hunger relief before/alongside the corpse mutation. Reverse this ordering so a failed final revalidation cannot grant free food.
- Preserve cancelSourceTarget() claim release on threat/invalidation/timeouts.
- The 60-second corpse lifecycle and 90-second harvested-remains lifecycle are deliberately different; do not change them merely to support feeding.

## Suggested implementation order

1. Trace the actual Fauna caller supplying others and confirm its locality/bounds.
2. Add the minimal species capability/value data to AnimalDef and enable only wolf.
3. Replace binary corpse food state with a minimal authoritative remaining-content model compatible with fresh/rotting/bones.
4. Add pure candidate evaluation/scoring and extend findCarcassTarget() to use it.
5. Extend source-target validation/claiming for the selected phase.
6. Make consumption atomically reduce corpse content and only then relieve hunger.
7. Integrate player-harvest gating against the same remaining-content state.
8. Add focused unit tests for fresh/rotting/bones preference, starvation fallback, claims, player-vs-animal races, and depletion.
9. Run existing fauna tests/build; browser verification remains manual.

No new corpse lifecycle, scavenging manager, scent system, bone entity, disease system or broad AnimalAgent rewrite is justified by the current architecture.
