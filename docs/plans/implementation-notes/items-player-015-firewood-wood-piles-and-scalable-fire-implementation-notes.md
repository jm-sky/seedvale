# Implementation Notes: Firewood, Wood Piles and Scalable Fire

## Current codebase findings

- **Fire lifecycle already exists and should remain authoritative:** `src/settlement/VillageFire.ts` owns lit/unlit state, fuel countdown, ignition ramp and refuelling. `FIRE_FUEL_KINDS = ['branch', 'beam']` already exists, so do not introduce a separate firewood/fuel abstraction or duplicate beam-vs-branch logic.
- **The scalable-fire part is partly implemented already.** `VillageFire.update()` already maps remaining fuel to `CampfireFlame.setSize()`; ignition intensity is separate and already drives the shared flame/light ramp. However, `src/shared/getFireParticles.ts` clamps visual size to `FIRE_SIZE_CLAMP = [0.55, 1.8]`. The plan's required maximum `scale = 3` therefore is **not currently achievable**. Also, the current `VillageFire` path scales the flame/light, not the physical campfire body group. Decide explicitly whether "fire size" means the existing flame visual or the whole fire model before changing the rendering seam.
- **Do not casually change the shared clamp without checking all consumers.** `CampfireFlame` is also used by settlement/player-built fires; increasing the shared maximum changes all of them. If the intended 1→3 range is only for the new pile/bonfire, keep the domain curve separate and pass the resulting factor through the existing visual seam instead of creating another fuel system.
- **Existing player-built fires already reuse `VillageFire`:** `src/settlement/PlacedFires.ts` creates the fire, persists only `id/x/z/kind/grate`, and deliberately does **not** persist lit/fuel state. Reuse this lifecycle pattern for a player-placed pile if that is what the plan intends. Do not silently make fire fuel persistence global.
- **Existing fire interaction is generic:** `src/app/interactables.ts` exposes `kind: 'campfire'`, and `src/app/gameLoop.ts` handles ignite/refuel/cook. Refuelling already chooses the first available `FIRE_FUEL_KINDS` item and calls `VillageFire.addFuel()`. A new pile should ideally plug into this same interaction contract rather than add a parallel key/action path.
- **Existing item pickup flow is generic:** `WorldItemRef` + `collectItem()` route world/spawner/dropped items to their owning registry; pickup capacity is checked by `Inventory.canAdd()`. `beam` is already a normal `ItemKind`, with a procedural ground mesh in `src/items/items.ts`. Use this rather than inventing a second "firewood object" item type.
- **Important discrepancy in the plan:** there is currently no deterministic world-generated **beam** pickup pool. `src/terrain/chunkItems.ts` generates branches and other flora, but not beams. `fallenLog` in `src/terrain/chunkEnvironment.ts` is decorative and explicitly has no item/interactable identity. Therefore "existing randomly spawning beams" cannot currently be wired by merely adding an interaction; the implementation must add/define the missing beam source or reinterpret the requirement. Do not make decorative `fallenLog` objects directly collectible without deciding ownership/persistence semantics.
- **Existing settlement wood piles are a different system:** `src/settlement/storageVisuals.ts`'s `createWoodPileVisual()` is a bounded visual projection of authoritative household + settlement wood quantity. `src/app/interactables.ts` exposes the primary stockpile as read-only `woodStorage`. This pile must not become burnable fuel unless the plan explicitly changes the storage/economy contract; otherwise burning it would conflate presentation/storage state with fire state.
- **Existing fire body visuals are reusable:** `src/settlement/campfireProps.ts` has `createCampfireBody('pit'|'simple')`, `createLitCampfireVisual()` and procedural fallbacks. Reuse existing geometry/material conventions for a new pile visual. Do not create another flame implementation.
- **Persistence boundary is clear:** `src/app/saveState.ts` serializes `bundle.placedFires.nodes()` into `SaveData.placedFires`; `src/persistence/saveData.ts` validates that shape. Any player-chosen wood-pile placement/state must follow the same explicit runtime-record → SaveData → WorldBundle rebuild path rather than living only on a Three.js object.
- **WorldBundle is the rebuild boundary:** `src/app/worldBundle.ts` carries player-created dropped items/fires/etc. across same-session rebuilds and resets them only for a genuinely new world. A new persistent pile system must follow this pattern, including disposal and snapshot-before-dispose during rebuild.

## Recommended implementation decisions

1. **Keep `VillageFire` as the only fuel state machine.** A wood pile should own/reuse one `VillageFire` instance, not its own timer, intensity or fuel counter.
2. **Represent a pile as a bounded static visual + fire state**, not as individual physical beams. Reuse `createItemMesh('beam')` for a small fixed arrangement if no dedicated asset is required. No per-beam physics or one-object-per-fuel-unit representation.
3. **Do not repurpose the settlement stockpile.** It is an economy/storage projection and already has its own quantity ownership. If the new pile is player-placed, give it its own stable record and lifecycle analogous to `PlacedFires`.
4. **Reuse the existing `campfire` interactable shape** where possible. The target should expose the same `VillageFire` and use the existing ignite/refuel path. Only add a distinct target kind if the visual/action semantics genuinely cannot fit the current contract.
5. **Resolve the plan's beam-source ambiguity before implementing loose-wood interaction.** Current `beam` is an inventory item, but current procedural world item generation does not spawn it. Decorative `fallenLog` is not a pickup. The smallest coherent solution is to define a real beam placement/source using the existing item-pickup infrastructure, with deterministic identity if seed-generated and persisted identity if player-generated.
6. **Quality states should stay out of scope unless they can reuse an existing item-instance/condition mechanism.** There is no generic condition model for ordinary `beam`/branch stack items today. Do not introduce a one-off rotten/damaged state just to satisfy the optional wording in the plan.

## Persistence and lifecycle traps

- Current placed-fire save/load restores the fire **unlit**; lit/fuel is intentionally transient. Preserve this unless the plan is explicitly changed to require persisted pile fire state.
- A new pile that is player-positioned must be included in `WorldBundle`, `saveState.ts`, `SaveData`, validation/migration, and same-session rebuild. If it is deterministic world content instead, prefer seed-derived identity and avoid save duplication.
- Never store the pile's fuel amount separately from `VillageFire`. If fuel needs to be exposed for rendering/tests, add a read-only accessor to the existing fire domain rather than another counter.
- Re-resolve inventory/target state at action execution, as current interaction code already does; per-frame interactable data is only a UI snapshot.
- Keep point-light registration consistent with `PlacedFires` if the pile has a flame light.

## Implementation order

1. Clarify/implement the missing **beam world-source** and its ownership semantics.
2. Add the pile record/runtime/visual using the existing player-placed-world-object pattern if it is player-created.
3. Reuse `VillageFire` and the existing `campfire` interaction/ignite/refuel flow.
4. Adjust the existing fire-size mapping to satisfy the 1→3 requirement, after deciding whether the 3× scale applies to flame only or the whole visual. Keep the change localized enough not to regress torches/other fire users.
5. Wire persistence/rebuild only if the pile is player-positioned/non-deterministic.
6. Add focused tests for fuel→size mapping, clamping, repeated ignition and pile lifecycle; leave visual correctness to browser verification.

## Key files

- `src/settlement/VillageFire.ts` — authoritative fire/fuel lifecycle.
- `src/settlement/PlacedFires.ts` — closest reusable player-placed fire lifecycle/persistence pattern.
- `src/settlement/campfireProps.ts` — campfire body + shared flame/light visual.
- `src/shared/getFireParticles.ts` — shared flame-size clamp and particle scaling.
- `src/app/interactables.ts` — world interaction candidate/target contract.
- `src/app/gameLoop.ts` — existing ignite/refuel/cook dispatch.
- `src/items/items.ts` / `src/items/itemModels.ts` — existing `beam` item definition and ground visual.
- `src/terrain/chunkItems.ts` — deterministic world-item generation; currently no beam generation.
- `src/terrain/chunkEnvironment.ts` — `fallenLog` is decorative, not an item.
- `src/settlement/storageVisuals.ts` — existing settlement stockpile visual; do not conflate it with burnable piles.
- `src/app/worldBundle.ts` — runtime lifetime/rebuild boundary.
- `src/app/saveState.ts` / `src/persistence/saveData.ts` — persistence boundary/schema.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
