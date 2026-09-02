# Plan: Animal Corpse and Bone Feeding

**Created:** 2026-09-01  
**Status:** `verification needed` 🔍 — implemented and tested; browser/gameplay verification pending.  
**Priority:** medium · **Effort:** M  
**Depends on:** none  
**Domain:** `fauna`  
**Tags:** `predator` `scavenging` `corpse` `food`

## Goal

Extend existing animal food/target behaviour so eligible animals can use existing corpses and bones as additional food sources.

The initial consumer is the wolf, but eligibility and preference should be represented through existing species/animal configuration rather than wolf-specific branching.

The work should extend the existing `AnimalAgent` food/target mechanism rather than introduce a parallel scavenging AI.

## 1. Existing corpse lifecycle

Reuse the existing corpse lifecycle:

    fresh corpse → decaying corpse → bones → cleanup

Do not create a second corpse lifecycle.

Animal feeding must operate on the existing corpse/remains representation and respect its current lifecycle.

Natural decay remains the fallback lifecycle; consumption may change the available contents/state through the existing corpse mechanism.

## 2. Corpse as a food candidate

Make eligible corpses discoverable through the existing animal food/target mechanism.

Fresh corpses should be attractive food sources: high relative food value and attractiveness.

Do not create a separate corpse-targeting AI if the existing food-target pipeline can represent corpses as candidates.

## 3. Decaying corpse

Decaying corpses should be less attractive than fresh food and should not be automatically selected merely because they exist.

They should remain a possible fallback when the animal is sufficiently hungry or safer food is unavailable.

The plan must not introduce a new disease system. Instead, preserve a decision seam where the existing/future disease model can apply a meaningful penalty or consequence to consuming decaying food.

The current behaviour should not depend on a disease implementation that does not yet exist.

## 4. Bones

Wolves should be able to consume bones.

Bones should be represented as an edible but lower-value food source than a fresh corpse.

Expected relationship:

    fresh corpse → high attractiveness
    decaying corpse → lower attractiveness; possible fallback when hungry
    bones → low attractiveness; possible fallback when hungry

Do not treat bones as purely decorative terminal remains.

## 5. AnimalAgent integration

Use the existing `AnimalAgent` food/target selection architecture.

Preferred model:

    AnimalAgent
      → evaluate nearby food candidates
      → existing food / prey / fresh corpse / decaying corpse / bones

Preserve existing separation between target discovery, target evaluation/selection, movement/pathfinding, interaction and consumption.

Do not perform a broad `AnimalAgent` rewrite as part of this plan.

If `AnimalAgent.ts` is undergoing a separate architectural refactor, integrate with the resulting target/decision seam instead of creating competing abstractions.

## 6. Species capabilities

Initially enable corpse/bone feeding for wolves.

Use existing species/animal configuration mechanisms where available to describe whether corpses and bones are edible and their relative food preferences.

Do not hard-code wolf-specific branches throughout food selection.

Do not add additional predator species in this plan.

## 7. Target discovery and distance

Corpses must be discovered through the existing animal target/sensing mechanism where possible.

Do not make every corpse in the world a candidate for every wolf.

Respect existing locality, chunk and sensing boundaries.

If no suitable corpse discovery mechanism exists, implement the smallest local integration compatible with the current `AnimalAgent` architecture rather than introducing a global corpse scan or a new scent system.

A future scent system may improve corpse discovery but is out of scope here.

## 8. Target evaluation

If the existing system uses target scoring/utility, corpse candidates should participate in the same mechanism.

Relevant factors may include hunger, food value, distance, corpse state, species preference and an existing/future food-risk penalty.

Do not introduce arbitrary hard-coded thresholds when an existing utility/decision mechanism can express the same behaviour.

Fresh corpse should normally outrank decaying corpse and bones.

Decaying corpse should become viable primarily when hunger/food availability makes the lower-quality option worthwhile.

Bones should remain a low-priority fallback.

## 9. Consumption

Animal consumption must modify the existing corpse/remains state rather than create a duplicate AI-only food resource.

Respect the existing corpse/harvesting lifecycle.

During implementation, establish from the current code:
- how available edible contents are reduced,
- when corpse transitions to bones,
- whether and how bones can subsequently be consumed,
- how animal consumption interacts with player harvesting,
- how simultaneous consumers are handled.

Reuse existing world interaction/state ownership instead of introducing parallel corpse state.

## 10. Player interaction

Corpses are shared world resources and should not receive player priority.

Examples: a wolf may consume a corpse before the player, or the player may harvest it first and leave remaining edible material for the predator.

Player harvesting and animal consumption must converge on the same underlying corpse state.

## 11. Simulation and performance

Scavenging must use the existing animal simulation/update lifecycle.

Do not create a separate off-screen scavenging simulation or increase global animal simulation frequency solely to support corpse feeding.

Avoid global corpse scans. Prefer existing locality, chunk and sensing mechanisms.

## 12. Disease integration boundary

This plan does not implement disease mechanics.

Decaying corpse should be modelled as a lower-quality/riskier food candidate, leaving room for the existing or future disease system to apply an actual consequence.

If no disease API exists, do not invent a complete disease model as part of this work. Document the integration point in implementation notes.

## 13. Debugging

Where existing animal diagnostics support it, expose enough information to understand food target selection: target type, corpse state, food value, risk/penalty and selection score.

Useful cases include: decaying corpse rejected because safer food is preferred; decaying corpse selected because of hunger/lack of alternatives; bones rejected because value is insufficient; bones selected because alternatives are unavailable.

Do not create a dedicated debug UI.

## Ownership

    Corpse system → corpse state and available remains
    AnimalAgent → food candidate discovery/evaluation and target selection
    Animal movement/pathfinding → approach target
    Animal interaction/consumption → consume food
    Species data → edible corpse/bone capabilities and preferences
    World time → existing corpse lifecycle

Do not create a global `ScavengingManager`.

## Out of scope

- Blood Traces (`world-009`)
- new corpse lifecycle
- new corpse/bone models
- disease system
- new predator species
- new hunting mechanics
- new animal needs
- new pathfinding
- broad `AnimalAgent` rewrite
- global corpse/scent system
- dedicated off-screen scavenging simulation
- quest/dialogue consequences

## Verification

### Fresh corpse

1. A wolf can discover a fresh corpse within existing sensing/locality rules.
2. A fresh corpse can be selected as a food target.
3. The wolf approaches using existing movement/pathfinding.
4. The wolf consumes the corpse using existing interaction/consumption mechanisms.
5. Consumption changes the actual corpse state/contents.
6. Multiple animals cannot corrupt or duplicate corpse state.

### Decaying corpse

1. A wolf does not automatically prefer a decaying corpse when safer food is available.
2. Decaying corpse has lower target attractiveness than fresh food.
3. A sufficiently hungry wolf can select a decaying corpse when alternatives are insufficient.
4. The implementation leaves a clear boundary for future disease consequences.
5. No new disease system is introduced.

### Bones

1. A wolf can discover bones.
2. Bones are substantially less attractive than fresh corpse.
3. A hungry wolf can consume bones.
4. Bone consumption completes/advances their lifecycle according to the existing remains model.
5. Bones can remain after corpse consumption and be consumed later.

### Player

1. A wolf can consume a corpse before the player.
2. The player can harvest a corpse before the wolf.
3. Neither side receives artificial priority.
4. Animal consumption and player harvesting operate on the same underlying state.

### Simulation

1. Behaviour works without the player/camera being present.
2. Scavenging uses the existing AnimalAgent simulation/update lifecycle.
3. No global corpse scan is introduced.
4. No unnecessary increase in animal simulation frequency occurs.

### Performance

1. Corpse discovery remains local/bounded.
2. Adding corpses does not create per-corpse global scans for every animal.
3. No unnecessary persistent/render-only state is created for off-screen feeding.

### Regression

Run existing tests and build.

Verify existing animal food, hunting, movement/pathfinding and corpse lifecycle behaviour.

Do not perform unrelated refactors.

Important architectural/public functions and classes should receive concise JSDoc where needed for preflight discovery, using the project `@domain` convention.

**Zrób git commit i push do main, rebase jeżeli trzeba**