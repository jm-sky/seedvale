# Implementation Notes: Rope-pullable resource transport

**Plan:** items-player-014-rope-pullable-resource-transport.md
**Last reviewed:** 2026-09-02

## Current-code findings

- Item instances are already implemented in src/items/itemInstances.ts and owned by Inventory. ItemInstance.id survives inventory ↔ world transitions; toSaveItemInstance() is the existing serialization boundary. Do not create another identity model.
- Physical dropped items live in src/items/createDroppedItems.ts. DroppedItem currently stores id/kind/x/z plus optional saved instance. Its mesh is recreated with createItemMesh() and grounded from sampleHeight. There is no mutable move/attach API yet; extend this API minimally so record and mesh cannot diverge.
- The current collision system in src/world/collision.ts is deliberately not a physics engine. Use kinematic cargo movement and existing terrain/collider resolution; do not add a rope/rigid-body library.
- ItemKind already contains the main cargoes: beam is 3 kg / LG and stone is 1 kg / SM. Weight comes from ITEM_DEFS; ItemSize is inventory gabarite, not physical dimensions or mass.
- There is currently no rope ItemKind and no ropePullable ItemCapability in the inspected code. This is the main plan/code discrepancy. Verify the intended rope asset/representation before adding anything; do not assume an existing rope system.
- itemCatalog.ts is the central capability registry. If ropePullable is introduced, add it there rather than scattering kind checks.
- Inventory.canAdd() already performs atomic weight + size validation. Normal pickup must continue using it; never split an overflowing stack between inventory and rope transport.
- buildInteractables() in src/app/interactables.ts already gathers terrain items, renewable spawner items and DroppedItems into the generic item interactable. Extend this path instead of creating another target query.
- Interactable in src/interaction/Interactable.ts has WorldItemRef with source world/spawner/dropped. An alternate rope action can be represented by a minimal extension of this existing adapter.
- Keyboard.ts already exposes edge-triggered altInteract / consumeAltInteract() for R. Reuse it; R is already a context-dependent secondary action.
- PlayerActionContext is the shared seam for player actions and already owns bundle, player, inventory, busy, input and sync callbacks. Do not introduce a global PlayerTransportManager unless the existing lifecycle genuinely cannot represent the state.
- PlayerController owns movement. gameLoop.ts calls setEncumbrance() before update(); pulled cargo must NOT be added to inventory load because it remains outside inventory.
- Player Stamina is PlayerNeeds.stamina. tickPlayerStamina() handles sprint/regen and StaminaState provides drainStamina(). Rope pulling is continuous player-controlled locomotion, not a long BusyAction, so it needs an active-pull effort signal that drains stamina and suppresses normal regen while pulling.
- world/collision.ts already provides circle/OBB resolution. Cargo should use the smallest applicable part of this existing mechanism.
- WorldBundle owns dropped-item lifetime through bundle.droppedItems. Keep transport state within the existing player-action/item boundary; do not turn WorldBundle into a transport manager.

## Architecture decisions

1. Cargo stays world-owned for the entire pull. Starting/ending a pull must never add/remove it from Inventory.
2. Reuse the existing dropped-item record and, where present, its ItemInstance identity. Do not mint an instance merely because a stackable item is being pulled.
3. Treat the rope as a gameplay constraint, not a simulated rope. A player anchor + cargo anchor + maximum distance/drag rule is sufficient.
4. One owner must update cargo position. Extend DroppedItems with the minimum attach/move/detach operations so record and mesh remain synchronized.
5. Weight may affect movement/Stamina tuning via ITEM_DEFS[kind].weight, but must not affect Inventory load while pulling. Do not use ItemSize as physical mass.
6. Pulling must not occupy BusyAction: the player needs normal WASD/look control. Add a locomotion modifier and effort drain to the existing movement loop.
7. Detach only clears the active attachment. The same world item remains at its current position; do not implement detach as drop() or inventory transfer.
8. Keep active pull runtime-only unless the existing save contract requires otherwise. A reload should not retain a reference to a disposed Three.js object.

## Suggested implementation order

1. Confirm rope representation/asset and add rope capability centrally if needed.
2. Extend createDroppedItems.ts with minimal attach/move/detach support and tests for record/mesh synchronization.
3. Extend item interactable/prompt generation. Offer R only when normal atomic pickup fails, the item is rope-pullable and the player owns the rope. Revalidate all three conditions at input handling time.
4. Add one active-pull state through PlayerActionContext/player action lifecycle; reject a second attachment.
5. Add pull speed limiting and continuous Stamina drain while preserving ordinary movement, grounding and collision.
6. Add minimal cargo grounding and static-collider handling only as needed for stable play. Do not build general physics.
7. Add minimal HUD state and detach action using the existing input path.
8. Run tsc/tests/build, then manual browser verification.

## Dependencies and pitfalls

- Plan 155 is the direct architectural dependency: current ItemInstance/Inventory APIs are already substantially ahead of its historical plan text. Follow current code.
- Plan 122 is not a rope implementation dependency. It established resource → Inventory → storage flows, but no rope system exists there.
- Beam/stone already have real weights and sizes; do not special-case beams.
- DroppedItem has X/Z but no persistent Y. Existing createDroppedItems derives ground Y. Keep transport primarily X/Z and re-ground through sampleHeight unless a concrete requirement proves Y state necessary.
- Do not use inventory encumbrance for the cargo.
- Do not model the whole pull as BusyAction.
- Disable/bypass sprint acceleration while pulling; otherwise sprint can defeat the intended ~50% speed target.
- R is edge-triggered. Consume it exactly once for attach/detach and ensure it cannot remain latched into another secondary action.
- Revalidate item existence/ownership/capability at mutation time. A per-frame prompt is only a snapshot.
- Clarify what constitutes the physical cargo before implementation. Current droppedItems.drop() creates one record per requested unit, while terrain/spawner sources have their own representations; do not accidentally attach an arbitrary stack without understanding its source semantics.
- Terrain modification can invalidate the old ground height; re-ground cargo using the same sampleHeight mechanism as dropped items.
- Construction is deliberately not coupled to transport. Leaving the cargo at the construction site is enough for this plan.
- No new economy/storage mechanism is needed.

## Verification focus

In addition to the plan's checklist, verify:

- attach → move → detach preserves the exact same dropped-item record;
- failed E pickup leaves the item untouched;
- R never pulls an inventory-fitting item;
- no rope or no capability means no pull action;
- inventory count/weight/size never changes during pulling;
- repeated attach/detach cannot duplicate or delete the cargo;
- cargo remains grounded on uneven terrain;
- cargo does not pass through static settlement/house colliders if collider handling is enabled;
- Stamina decreases during pulling and normal regeneration resumes after detach;
- sprint cannot bypass the pull speed limit;
- world rebuild/reload cannot retain a stale active attachment.

## Useful symbols

- src/items/Inventory.ts — capacity, atomic canAdd(), instances and weight/size.
- src/items/itemInstances.ts — stable ItemInstance identity and serialization helpers.
- src/items/itemCatalog.ts — item capabilities.
- src/items/items.ts — ItemKind, ITEM_DEFS, weight and size.
- src/items/createDroppedItems.ts — physical dropped-item records/meshes/lifecycle.
- src/app/interactables.ts — per-frame item candidates and prompts.
- src/interaction/Interactable.ts — generic item interaction adapter.
- src/app/actions/actionContext.ts — shared player-action dependencies.
- src/app/gameLoop.ts — interaction resolution and player update.
- src/player/PlayerController.ts — movement/speed/collision integration.
- src/player/PlayerNeeds.ts — Stamina and physical-effort helpers.
- src/shared/StaminaState.ts — Stamina mutation primitives.
- src/world/collision.ts — circle/OBB collision primitives.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
