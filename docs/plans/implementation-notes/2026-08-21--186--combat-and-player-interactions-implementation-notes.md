# Implementation notes — plan 186: Combat i interakcje gracza

**Reviewed:** 2026-08-21  
**Plan:** `2026-08-21--186--combat-and-player-interactions.md`  
**Dependencies reviewed:** current `main`, STATE, ranged combat 162, NPC combat 177/179, inventory/capacity 164, existing player action/busy systems

## 1. Review verdict

Plan 186 is implementable as an extension of existing systems, but the plan is **not a description of the current implementation** in two important areas:

1. ranged combat already exists and is substantially implemented by plans 162/177; the missing part is specifically the desktop draw/aim input model and persistent missed-arrow world outcome;
2. overload is **already implemented** for movement through `playerEncumbrance.ts` + `PlayerController.setEncumbrance()`/game-loop wiring. Do not build another overload system.

The largest architectural ambiguity is the backpack: current reconnaissance found no existing `backpack` item/slot/equipment mechanism. `Inventory.maxWeight` is currently a constructor-derived numeric value, while the player inventory is created with the base capacity. A backpack therefore cannot simply be added to the inventory and magically change `maxWeight` without a small capacity-provider change.

A second important correction concerns long activities: `BusyAction` is explicitly a real-time blocking timer and **does not advance world time**. If "2 hours świata" means actual game-time progression, `TimeSkip` is the existing mechanism that must be composed with the activity; do not make `BusyAction` itself simulate two hours of world time.

## 2. Existing ranged architecture — extend, don't replace

The current ranged pipeline is already:

```text
playerRanged lifecycle
→ release edge
→ ammo lookup/removal
→ resolveRangedDirection()
→ Projectile runtime record
→ swept collision
→ existing AnimalAgent damage/death consequences
```

Relevant current ownership:

- `src/player/playerRanged.ts` owns player-only stamina gating and the neutral `rangedLifecycle` wrapper.
- `src/combat/rangedLifecycle.ts` owns draw/release/recovery timing.
- `src/combat/rangedAttack.ts` owns accuracy/deviation and the actual fired direction.
- `src/combat/projectile.ts` is pure projectile stepping/collision math.
- `src/app/gameLoop.ts` owns ammo consumption, projectile runtime storage, collision candidates, damage, XP, audio/toasts and cleanup.
- `src/player/playerCombat.ts` owns combat mode/soft-lock identity and ranged acquisition range.

Do not create an `ArrowSystem`, `ProjectileManager`, `BowSystem` or a second combat loop.

## 3. Current ranged aim gap is narrower than the plan suggests

`gameLoop.ts` already has `attackYaw`, but today it is primarily the committed-yaw state for melee/touch combat. Ranged fire currently derives its final aim yaw from either:

```text
soft-locked target → yawToward(player,target)
otherwise          → mouseLook.state.yaw
```

and then passes that yaw into `resolveRangedDirection()`.

Therefore the implementation should **generalize the existing attack-direction concept**, not introduce `bowYaw`.

Recommended conceptual state:

```text
shared player attack/aim direction
        ├─ melee committed attack yaw
        └─ ranged draw aim yaw
```

The exact API can remain in `gameLoop.ts` if that is the smallest change. Avoid moving combat state into `MouseLook` merely to make the code look cleaner.

The important invariant is:

```text
one draw
→ one committed aim direction
→ same direction drives visual facing/held bow
→ same direction is passed to resolveRangedDirection()
```

Changing camera yaw after the attack direction has been committed must not silently change the projectile's already-selected direction.

## 4. Desktop mouse input

`src/input/MouseLook.ts` currently does two things on desktop:

- pointer movement changes `mouseLook.state.yaw/pitch`;
- LMB writes the shared `keys.interact` press/release signal.

Do not create a second pointer-lock or mouse-look implementation.

During a ranged draw, the useful mouse delta must update the **attack aim** while the draw is active. The implementation should decide explicitly whether camera yaw follows that aim or whether aim is temporarily decoupled from camera yaw. Either way, the projectile direction must come from the committed attack-aim state, not from a late read of `mouseLook.state.yaw`.

The touch path already has the separate `attackYaw` concept from mobile combat targeting. Preserve that behavior and converge desktop onto the same semantic "attack direction" rather than maintaining separate desktop/touch aim models.

Do not let LMB re-lock the pointer and fire simultaneously when the pointer is free; `MouseLook` already protects that case.

## 5. Soft-lock and ranged acquisition already exist

`PlayerCombat.collectLivingCombatTargets()` already accepts a range parameter and `gameLoop.ts` already uses the held bow's configured range for living-target acquisition.

Do not add another target collector for aiming.

The distinction remains:

```text
combat target acquisition / soft lock
→ aim direction
→ projectile trajectory
→ swept collision
```

A soft lock is not a guaranteed hit. `resolveRangedDirection()` still applies deterministic accuracy deviation, and projectile collision remains authoritative.

## 6. Visual bow direction / reticle

`PlayerController` already has ranged-draw and ranged-release animation hooks. Reuse those hooks.

The reticle should be an existing HUD/UI element if one already exists in the current UI path; do not create a second targeting overlay. The important behavior is visibility while `playerRanged.state() === 'draw'` and hiding on release/cancel/modal/downed state.

Reticle position/appearance is presentation only. It must never modify `rangedAccuracy()` or the deterministic deviation roll.

## 7. Missed-arrow persistence — use DroppedItems

Current projectile records are deliberately runtime-only. `src/combat/projectile.ts` has no world-item ownership and `gameLoop.ts` owns `activeProjectiles`.

`src/items/createDroppedItems.ts` already provides exactly the required world-persistence mechanism:

```text
bundle.droppedItems.drop(kind, x, z)
```

It creates a persistent `DroppedItem`, renders the normal item mesh and exposes it through the existing interaction/pickup path. Dropped items also round-trip through the existing save-world mechanism.

For plan 186:

```text
arrow fired
→ Inventory.remove(arrow, 1)
→ Projectile
→ hit: consumed permanently
→ max range / miss: bundle.droppedItems.drop(arrow, projectile.x, projectile.z)
→ projectile removed
```

Do not create an arrow pickup object or arrow recovery manager.

The current projectile has no Y coordinate and does not test terrain/obstacles. Its expiry is currently `maxDistance`; therefore a V1 missed arrow can be materialized at the projectile's final X/Z and `DroppedItems` will place it on terrain. Do not add 3D arrow physics as part of this plan.

Be careful about the mutation order: remove the projectile exactly once, then create one dropped arrow exactly once. A hit must never also drop an arrow.

## 8. Existing pickup path must remain authoritative

`buildInteractables()` already receives `bundle.droppedItems`, and the existing game-loop item interaction resolves collection through the generic item path.

The new arrow therefore needs no special `[E]` action. After `DroppedItems.drop('arrow', ...)`, it should naturally become the same interactable as any other dropped item.

Capacity must be checked before collection using the existing `Inventory.canAdd()`/`canAddInstance()` path, as existing gathering actions already do.

## 9. Long activities — BusyAction limitation

`src/app/busyAction.ts` is intentionally a **short real-time blocking channel**:

```text
start(durationSec)
→ tick(dt)
→ onComplete()
```

Its own comment explicitly says it does not advance day/night.

Therefore the plan's example "2 hours świata" must not be implemented by simply calling:

```ts
busy.start(2 * ..., ...)
```

if the intended result is two hours of game-time progression.

The existing `src/world/timeSkip.ts` is the authoritative mechanism for advancing game time. It temporarily changes `dayNight.timeMultiplier`, keeps the normal world simulation cadence safe, and on completion exposes `hours` + `startTimeOfDay` so settlement/NPC catch-up can run.

Recommended distinction:

- **ordinary short interaction:** `BusyAction` only;
- **activity that consumes/advances game hours:** compose the activity state with the existing `TimeSkip` mechanism;
- do not modify `BusyAction` into a second time-skip system.

The existing rest flow (`restCamp` + `TimeSkip`) is the best reference for this composition.

## 10. Cancellation and interruption of long activities

`BusyAction` only knows `cancel()`; it does not evaluate stamina, hunger, health or arbitrary predicates.

The implementation should therefore keep interruption policy in the activity owner/game-loop/action module:

```text
activity active
→ existing condition becomes invalid
→ cancel existing BusyAction / TimeSkip as appropriate
→ preserve already-applied progress/state
→ cleanup visual/input state
```

Use existing shared state:

- `player.needs.stamina`
- `player.needs.hunger`
- `player.health`
- `isActionBlocked()` / `isChannelBusy()` where appropriate
- existing downed/health logic
- existing movement/input modal gating

Do not create `LongActionState`, `ActivityManager` or a second cancellation framework.

Important: define the exact semantics before implementation for actions that combine real-time progress and world-time progress. A canceled time skip must restore the previous time multiplier through `TimeSkip.cancel()`; do not manually mutate `dayNight.timeMultiplier`.

## 11. Progress semantics

`BusyAction.progress` already runs from `0` to `1` and is rendered by `BusyOverlay`.

If a long activity needs partial progress to survive interruption, the activity should own the accumulated domain progress while still using `BusyAction` as the active channel. Do not add progress state to `BusyAction` beyond its existing timer semantics.

If the existing action already stores progress elsewhere, preserve that state and only change the number of times the action is started/completed.

## 12. Esc handling

Modal/input cancellation is already centralized in the game loop and action infrastructure. Reuse the existing escape/cancel route that reaches `BusyAction.cancel()` / `TimeSkip.cancel()` rather than adding a new key listener inside an action.

When canceling a ranged draw, the existing `playerRanged.reset()` + `player.endRangedDraw()` cleanup pattern should remain authoritative.

The same principle applies to long activities: one cancellation path must clean up overlay, player pose/input lock and the active timer.

## 13. Backpack — current code has no backpack system

Reconnaissance did not find an existing `backpack` `ItemKind`, backpack equipment slot, or capacity-provider implementation.

Current `Inventory` has:

```ts
readonly maxWeight: number
readonly maxSize: number
```

and the player's inventory is created with the player defaults. The current comments explicitly describe future backpacks as a reason the player's max weight may later vary.

This means plan 186 must make one small architectural decision rather than assuming it is already available.

### Recommended capacity design

Keep **one Inventory** and make its effective `maxWeight` derive from a base capacity plus catalog-defined capacity modifiers held by that same inventory.

Conceptually:

```text
base player capacity
+ capacity bonus from carried backpack item(s)
= inventory.maxWeight
```

The exact implementation can be a small extension to `Inventory`, for example a derived `maxWeight` getter backed by a base capacity plus an item/catalog capacity modifier. Do not introduce `BackpackInventory` or a second bag.

This has useful properties:

- backpack remains an ordinary existing item concept;
- `canAdd()` continues to enforce the one authoritative capacity;
- `totalWeight()` still includes the physical backpack weight;
- NPC/container inventories can retain fixed capacities;
- HUD code can continue calling `inventory.totalWeight()` and `inventory.maxWeight`.

If the project instead wants a single equipped backpack rather than multiple carried backpack items, that is a valid design, but it needs an explicit ownership field/equipment seam. Do not silently invent an equipment subsystem just for this plan.

### Avoid circular capacity logic

The backpack itself must fit under the current capacity before it grants its bonus. After acquisition, the bonus becomes active.

Do not implement `canAdd(backpack)` against the post-add capacity.

Also decide what happens if a backpack is removed while the player is overloaded. The existing overload system can naturally represent the resulting state; do not silently delete/spill items as a side effect unless the game design explicitly requires it.

## 14. Existing overload is already complete for movement

`src/player/playerEncumbrance.ts` already defines the authoritative overload calculation:

```text
0–10% over → full speed
10–30%      → smooth movement reduction
>=30%       → movement blocked
```

`PlayerController` stores the resulting speed multiplier/blocked state, and `gameLoop.ts` updates encumbrance from current carried weight plus carried-container weight once per frame.

Therefore plan 186 should **not** implement another movement penalty system.

The plan's phrase "if overload is not complete" is stale relative to the current code. Treat this part as an audit/integration task:

1. confirm backpack capacity changes feed the same `inventory.maxWeight`;
2. confirm the existing `computeEncumbrance()` sees the resulting load/capacity;
3. confirm existing stamina/movement behavior is preserved;
4. only modify stamina behavior if current code demonstrably lacks the intended overload effect.

Do not duplicate `computeEncumbrance()` or add a backpack-specific speed modifier.

## 15. Stamina and overload: do not assume a missing mechanic

Current overload explicitly owns movement speed and movement blocking. The plan additionally mentions stamina.

Before changing stamina, inspect the current `PlayerNeeds` movement/sprint drain path and determine whether encumbrance already affects it. If it does, reuse that value. If it does not, add the smallest pure modifier at the existing stamina drain seam.

Do not make stamina drain in `playerEncumbrance.ts`; that module is intentionally pure and only returns encumbrance.

Preferred ownership:

```text
Inventory load/capacity
→ computeEncumbrance()
→ PlayerController state
→ existing movement/sprint + stamina seams
```

## 16. Inventory HUD / UI synchronization

Many existing inventory mutations explicitly do:

```text
hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
ctx.onInventoryChanged()
```

Use the same synchronization after:

- picking up an arrow;
- dropping an arrow or backpack;
- acquiring/equipping the backpack if that changes capacity;
- selling/buying items.

Do not add a separate backpack-capacity HUD source. The existing HUD should display the authoritative `Inventory.maxWeight`.

## 17. Persistence implications

Current player inventory counts are persisted; `Inventory.maxWeight` is deliberately derived, not saved.

That is exactly what should happen with a backpack capacity bonus:

```text
save backpack item/count
→ load inventory
→ derive maxWeight again
```

Do not add `savedMaxWeight` or a duplicated capacity field to `SaveData`.

If the chosen backpack representation is an instance-backed item, follow the existing instance persistence machinery instead of adding backpack-specific save fields.

## 18. Ranged deterministic behavior must remain unchanged

Do not change:

- `rangedAccuracy()`;
- `rangedDeviationRoll()`;
- `resolveRangedDirection()`;
- `advanceProjectile()`;
- `sweptProjectileHit()`.

The reticle and mouse aim only choose `aimYaw`. Accuracy still decides the deterministic deviation, and projectile geometry decides hit/miss.

This is particularly important because current ranged combat already awards archery XP on successful animal hits and already uses deterministic critical rolls.

## 19. Arrow recovery and existing Plan 162 boundary

Plan 162's implementation notes described arrow recovery as out of scope, but plan 186 intentionally changes that decision. Treat plan 186 as the newer scope decision:

```text
miss/expiry → ordinary world dropped arrow
```

Do not resurrect any `ArrowRecoveryManager` concept from the older notes. The generic `DroppedItems` system is now the appropriate owner.

Do not turn arrows into `ItemInstance`s just to support recovery; stackable arrow counts remain sufficient.

## 20. Potential projectile edge cases

When adding missed-arrow persistence, explicitly handle:

- projectile reaches `maxDistance` without a hit → one dropped arrow;
- projectile hits an animal → no dropped arrow;
- projectile is still flying when player changes weapon → it continues, as it does now;
- projectile is still flying when a modal opens → current architecture keeps active projectiles outside the player draw state; do not accidentally clear them with draw cancellation;
- player becomes downed during draw → existing draw reset remains authoritative;
- no compatible arrow at release → no projectile and no inventory mutation;
- early release before `drawTime` → no arrow consumed;
- release with valid ammo → exactly one arrow removed.

## 21. Potential aim edge cases

Test specifically:

```text
start draw
→ move mouse
→ camera/aim changes
→ release
→ projectile follows the committed aim direction
```

and:

```text
start draw
→ stop/move camera
→ release
→ no late camera-yaw substitution
```

Also test:

- soft-locked moving target;
- no soft lock;
- touch attack yaw;
- early release;
- modal cancellation;
- downed player;
- switching away from bow after release while projectile is in flight.

## 22. Tests to add or extend

### Ranged

Prefer pure tests for:

- committed aim yaw passed to `resolveRangedDirection()`;
- deterministic deviation unchanged;
- one arrow consumed per valid shot;
- no ammo consumed on early release/no-ammo path;
- max-range projectile expiry produces exactly one dropped arrow at final X/Z;
- successful hit produces no dropped arrow.

### Busy/long activity

Extend `busyAction.test.ts` only for generic timer semantics if needed. Activity-specific tests should live with the activity owner.

Cover:

- one start runs to completion without requiring repeated input;
- `Esc` cancellation calls existing cancel path;
- interruption condition cancels cleanly;
- partial progress is not accidentally reset when the domain model says it should persist;
- time-consuming activity uses `TimeSkip` when it actually advances game hours.

### Inventory/backpack

Add focused tests for:

- base capacity unchanged without backpack;
- backpack bonus increases effective `maxWeight`;
- backpack itself must fit under the pre-bonus capacity;
- `canAdd()` uses the effective capacity;
- `maxSize` remains an independent constraint;
- persistence derives capacity from inventory contents after reload;
- existing encumbrance thresholds receive the modified capacity without a second overload calculation.

## 23. Recommended implementation order

1. Audit the exact current `attackYaw`/ranged input path and decide the smallest shared attack-direction representation.
2. Implement desktop draw-time aim using the existing `MouseLook` input seam; keep touch `attackYaw` semantics intact.
3. Wire visual facing/bow and `resolveRangedDirection()` to the same committed aim value.
4. Add/confirm the existing HUD reticle during draw.
5. On projectile expiry/miss, create one ordinary `DroppedItems` arrow and remove the projectile.
6. Audit the long-activity caller and determine whether it needs `BusyAction` only or `BusyAction + TimeSkip`; never extend `BusyAction` into a time-skip engine.
7. Implement interruption conditions at the activity owner using existing health/needs/blocking state.
8. Introduce the smallest backpack capacity-provider representation in the existing item/inventory model. Do not add a second inventory/equipment system.
9. Connect the resulting effective `inventory.maxWeight` to the already-existing `computeEncumbrance()` path.
10. Add focused tests and then perform browser verification for aim/reticle/missed-arrow/long-activity/backpack behavior.

## 24. Files/systems that should be reused

| Area | Existing owner to extend | Do not create |
|---|---|---|
| Ranged lifecycle | `src/combat/rangedLifecycle.ts` / `playerRanged.ts` | `BowSystem` |
| Aim direction | existing `attackYaw` / `PlayerCombat` semantics + `MouseLook` input | `bowYaw` |
| Projectile math | `src/combat/projectile.ts` | `ProjectileManager` |
| Missed arrows | `WorldBundle.droppedItems` / `createDroppedItems.ts` | `ArrowPickupSystem` |
| Pickup | existing dropped-item interaction | arrow-specific interaction |
| Long blocking action | `src/app/busyAction.ts` | `LongActionManager` |
| Game-time progression | `src/world/timeSkip.ts` | second time-skip system |
| Action gating | `actionContext.ts` | parallel action-block state |
| Inventory capacity | `src/items/Inventory.ts` | second inventory/capacity system |
| Overload | `src/player/playerEncumbrance.ts` | backpack-specific overload |
| Player movement | `PlayerController` | second movement modifier |
| HUD weight | existing `hud.setInventoryWeight()` | backpack HUD source |
| Persistence | existing Inventory/save serialization | saved max-weight field |

## 25. Verification checklist

### Automated

- [ ] focused ranged tests pass;
- [ ] dropped-item arrow persistence tests pass;
- [ ] BusyAction/activity tests pass;
- [ ] inventory/backpack capacity tests pass;
- [ ] encumbrance regression tests pass;
- [ ] `npx vue-tsc --noEmit`;
- [ ] `npx eslint .`;
- [ ] `npm run build`;
- [ ] `npx vitest run`.

### Browser/gameplay

- [ ] desktop draw allows changing aim direction;
- [ ] reticle appears only while aiming;
- [ ] visual bow direction and projectile direction agree;
- [ ] late camera movement cannot redirect an already committed shot;
- [ ] touch `attackYaw` behavior remains intact;
- [ ] missed arrow becomes a normal world pickup;
- [ ] hit arrow is not duplicated as a pickup;
- [ ] long activity completes once without repeated activation;
- [ ] `Esc` cancels through existing cancellation;
- [ ] important invalidating conditions interrupt it correctly;
- [ ] game-time activities actually advance game time through `TimeSkip`;
- [ ] backpack changes the existing inventory capacity only;
- [ ] existing overload movement behavior responds to the new capacity;
- [ ] no second inventory/equipment/overload system was introduced.

## 26. Final implementation rule

The correct implementation is mostly **integration**, not new architecture:

```text
existing ranged combat
        ↓
shared attack direction
        ↓
existing projectile
        ↓
existing DroppedItems on miss

existing BusyAction ─────┐
                         ├→ long activity owner
existing TimeSkip ──────┘

existing Inventory
        ↓
capacity modifier / backpack
        ↓
existing computeEncumbrance()
        ↓
existing PlayerController movement
```

Before coding, verify the exact current code at each seam. If implementation discovers a discrepancy with this note, current code remains the source of truth; update the implementation approach rather than forcing the code back toward the plan wording.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
