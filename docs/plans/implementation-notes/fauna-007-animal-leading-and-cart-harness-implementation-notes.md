# Implementation Notes: Animal leading and cart harness

**Plan:** `fauna-007-animal-leading-and-cart-harness.md`
**Status:** `planned` 📋
**Created:** 2026-09-02
**Purpose:** implementation guide based on current `main` recon.

## 1. Current code facts

- `AnimalAgent` is the authoritative runtime fauna entity. `horse` and `donkey` already exist and both expose riding capability through `AnimalDef.mount`.
- The closest existing relationship pattern is `src/app/actions/mountActions.ts`, but its semantics must **not** be copied for leading: riding calls `driveMounted()` and then `AnimalAgent.update()` early-returns. Leading must keep normal animal AI/update active.
- Animal movement is currently `stepWithSlopeAndCollision()` plus `steerToward()`. Shared A* in `src/navigation/navigation.ts` is a watchdog/repath mechanism, not a generic follow controller.
- Animal needs/decisions live in `AnimalLife.ts` and `AnimalAgent.update()`/fauna decision code. Existing food/water target selection and threat/flee behaviour already provide the priority model the plan wants.
- `PlayerActionContext` in `src/app/actions/actionContext.ts` is the existing ownership seam for player interaction actions; `gameLoop.ts` centralizes interaction dispatch/gating.
- **There is currently no cart runtime and no rope/harness runtime.** The plan's wording about reusing an existing rope/cart representation does not match current `main`.
- `src/items/createDroppedItems.ts`, `WorldBundle`, and existing player-placed object modules are useful lifecycle/ownership patterns for a new physical cart; do not make the cart an unowned scene-only object.

## 2. Capabilities

- Keep the existing data-driven `AnimalDef` capability pattern. Do not scatter `kind === 'horse'` / `kind === 'donkey'` checks through the transport code.
- `mount` and draft/leading capability are semantically different. Add a separate config only if the existing type cannot express draft semantics cleanly.
- Cart compatibility should be data-driven too; do not assume every cart can be pulled by every transporter.

## 3. Leading architecture

Recommended ownership:

- The player action layer owns the current player↔animal lead relationship and attach/detach lifecycle.
- `AnimalAgent` owns the animal-side relationship/reference and exposes only the operations needed by movement/decision code.
- Store the relation by stable `animalId`, not by UI/camera state or raw scene references.
- Detach must be idempotent. Animal death/removal/unresolvable references must clear the relation.
- Do not create `HorseManager`, `AnimalFollowManager`, `HorseAI` or another global per-frame manager.

**Lead is a relationship, not a second AI.** It should provide a player-derived movement target to the normal animal decision/movement path.

## 4. Do not copy mounted behaviour

Current riding is:

`mountActions.update()` → `driveMounted()` → `AnimalAgent.update()` early return.

That is correct for riding and wrong for leading. For leading:

- `AnimalAgent.update()` continues to tick needs, stamina, lifecycle, animation and decisions.
- `PlayerController.update()` remains the sole player movement path.
- When lead is active and no higher-priority autonomous action has won, use a trailing target near the player's current world position and existing `steerToward()`/collision movement.
- Never teleport/snap the animal to the player.
- Do not create a second follow state machine.

A good v1 seam is to let lead supply the movement target only when ordinary autonomous movement has not selected a stronger action. This keeps food/water and threat responses authoritative.

## 5. Follow target

Do not target the player's exact position. Use a small trailing distance/radius so the animal does not constantly collide with or overshoot the player.

The target should be derived from the player's live world position (optionally movement direction) and calculated only for the active relation. No global target registry is needed.

Do not reuse `pickFollowTarget()` as the implementation: that is existing animal→animal herd/mother cohesion with different ownership and priority semantics.

## 6. Autonomy / interruption

Do not implement a `forceFollowPlayer`-style bypass.

The existing animal decision system already distinguishes food/water seeking, threat/flee and ordinary wander. Lead should be lower priority than survival reactions:

- moderate hunger should not necessarily cancel leading;
- when the existing decision system actually chooses a food/water source, the animal may leave the player's path;
- threat/flee keeps its existing priority;
- when that autonomous action ceases to be active, the still-attached lead relation becomes usable again.

Avoid introducing lead-specific hunger thresholds unless recon proves the existing arbitration cannot express this.

## 7. Pathfinding

`src/navigation/navigation.ts` is not a generic follow system. Normal `steerToward()` is still straight-line steering with local obstacle handling; A* is invoked by the movement watchdog when genuinely blocked.

Therefore start with normal steering and let the existing watchdog trigger A* when needed. Do not call A* every frame, add path caching, or introduce a worker for this feature.

## 8. Harness/cart

There is no cart implementation to extend. Implement only the minimal physical cart required by fauna-007:

- world-owned cart record/runtime with stable identity;
- explicit animal↔cart attachment point/constraint;
- no cart AI and no direct player→cart steering;
- cart follows the animal's resolved movement/transform;
- detach leaves the cart at its current world position.

A deterministic attachment constraint plus optional simple rope visual is sufficient. Do not build realistic rope physics.

Prefer an explicit logical attachment over Three.js reparenting if reparenting complicates world-space ownership, rebuild or persistence.

## 9. Chained transport

For `Player → lead → Horse → pull → Cart`:

1. Player movement remains authoritative.
2. Lead supplies the horse's follow target.
3. Horse remains an ordinary `AnimalAgent`.
4. Cart derives movement from the horse attachment.
5. No direct PlayerCart relationship is created.

Do not put cart-follow logic into `PlayerController` or the player movement loop.

## 10. Interaction integration

Use the existing interaction/prompt/dispatch path in `src/app/interactables.ts` + `src/app/gameLoop.ts` and the `PlayerActionContext` seam.

The current riding implementation is a good pattern for resolving an `AnimalAgent` by target/id and for minimal HUD state, but do not copy its mounted-state shortcut that disables interaction/animal AI.

Before adding a new input, inspect current keyboard bindings and existing `E`/`R` semantics. Keep interaction context-driven rather than registering a second global key handler.

## 11. Physical-object/lifecycle patterns

Inspect and reuse as appropriate:

- `src/items/createDroppedItems.ts` — record/mesh ownership and disposal;
- `src/app/worldBundle.ts` — WorldBundle ownership/rebuild lifecycle;
- existing placed containers/fires/traps — stable IDs and world-object lifecycle.

A cart should have a clear owner and disposal/rebuild path. If persistence is implemented, persist stable records/IDs, never Three.js references.

## 12. Physics pitfalls

Current animal movement is terrain-aware, not rigid-body physics. Keep the cart equally simple.

Watch for:

- cart spawning inside the animal;
- attachment jitter/drift;
- cart grounding fighting the attachment transform;
- steep terrain/water causing the cart to diverge from the animal;
- cart collision feeding back into animal movement and causing a watchdog loop.

Keep the dependency one-way: animal movement is authoritative; cart follows.

## 13. Useful implementation order

1. Reconfirm current interaction/input APIs and `mountActions` ownership.
2. Add only the required data-driven lead/draft capabilities.
3. Add minimal lead relation ownership/lifecycle.
4. Integrate lead target selection into `AnimalAgent` without bypassing `update()`.
5. Reuse steering + existing watchdog pathfinding.
6. Add minimal cart record/runtime and explicit animal↔cart attachment.
7. Propagate animal movement to cart; verify detach/death/removal cleanup.
8. Add minimal HUD state only if the existing HUD facade has a natural transport seam.
9. Add focused tests for relation/compatibility invariants where useful.
10. Run typecheck/lint/build/tests; browser verification remains manual.

## 14. Important discrepancy

The plan mentions existing rope/cart/physics mechanisms. **Current `main` has neither.** Treat those statements as architectural guidance, not dependencies.

Likewise, `mountActions.ts` proves the species-agnostic capability pattern for horse/donkey, but there is currently no generic player-follow behaviour for fauna. Adding such behaviour must be integrated into the existing decision/movement lifecycle rather than assumed to exist.

**Zrób git commit i push do main, rebase jeżeli trzeba**
