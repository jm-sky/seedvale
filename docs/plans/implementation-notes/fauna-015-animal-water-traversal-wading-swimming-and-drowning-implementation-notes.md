# Implementation notes: fauna-015 animal water traversal, wading, swimming and drowning

## Current movement ownership

`src/fauna/AnimalAgent.ts` remains the authoritative fauna locomotion owner.

Important current flow:

```text
decision / wander / chase / flee / mounted input
→ steerToward() or driveMounted()
→ stepWithSlopeAndCollision()
→ AnimalAgent walkability/collision checks
→ mesh movement
```

Do not create a second swimming controller or mounted-only movement path.

`driveMounted()` is already implemented directly on `AnimalAgent`; `src/app/actions/mountActions.ts` only reads player input, calls `mount.driveMounted(...)`, synchronizes the player seat transform, handles player riding stamina/skill/stability and dismount lifecycle.

Therefore water capability should be solved inside the same animal traversal/movement path so mounted and autonomous physical behaviour cannot diverge.

## Existing hard water block

`AnimalAgent.ts` currently defines:

```ts
const WATER_MARGIN = 0.3
```

and rejects candidate positions based on the terrain height sampler relative to `waterLevel`.

This makes water a hard wall for:

- direct steering,
- mounted steering,
- navigation queries supplied by the animal.

Changing only `WATER_MARGIN` is not a sufficient solution; it keeps the same binary model and still cannot represent wading/swimming.

NPC movement currently has a similar binary water restriction. NPC swimming is outside fauna-015, but this is a reason to keep physical water sampling under terrain/world ownership rather than embedding lake/river-depth logic directly in `AnimalAgent`.

## Final movement resolver

`src/terrain/slopeConstraint.ts` provides `stepWithSlopeAndCollision()`.

It is a useful shared movement primitive and should remain responsible for final slope/collision resolution where applicable. Its current walkability callback is boolean, so it cannot itself express movement mode or cost.

Do not turn `stepWithSlopeAndCollision()` into a general water-behaviour owner unless implementation proves that a small reusable terrain-step extension is actually required.

## Navigation boundary

`src/navigation/navigation.ts` is shared bounded local-grid A* for NPCs and animals.

Current contract:

```ts
export type NavigationQuery = {
  isWalkable: (x: number, z: number) => boolean
  sampleHeight: HeightSampler
}
```

Navigation deliberately treats caller `isWalkable` as authoritative and only produces waypoints. It does not own locomotion.

Current A* cost is geometric only (`cellSize` or diagonal `cellSize * sqrt(2)`). There is no terrain/water traversal multiplier.

For fauna-015:

- make physically valid animal water traversable to navigation with the smallest coherent change,
- do not redesign the whole shared A* solely for route preference,
- keep fauna traversal classification structured enough that future `passable + traversal cost` can consume the same result.

Ability and preference must stay conceptually separate:

```text
ability = can this animal physically traverse this point?
preference = should autonomous planning choose this route?
```

The second problem may become a later plan.

## Water and terrain data

Do not infer all water from global `terrain.waterLevel`.

### Lakes / ocean

Current terrain architecture distinguishes rendered/cover height from actual floor height. `floorHeights` represent the true terrain floor used by water depth/swimming-related logic.

For standing water, useful gameplay depth is conceptually:

```text
water surface - true floor
```

Use the existing chunk/terrain sampling ownership rather than duplicating raw height generation in fauna.

### Rivers

Modern river channels carry canonical water/bed geometry independent of global water level.

`src/terrain/riverNetwork.ts` includes:

- `canonicalWaterHeight()`,
- `depthFromAccumulation()`,
- `riverChannelSegmentsNear()`,
- `nearestRiverBankDistance()`,
- `isInsideRiverChannel()`.

`RiverChannelSegment` in `src/terrain/chunkHeightmap.ts` carries interpolatable per-endpoint values including:

```text
bedH
waterH
waterHalfWidth
channelHalfWidth
```

`riverChannelSegmentsNear()` constructs the invariant:

```text
bedY < waterY < bankTopY
```

Gameplay water-depth sampling should reuse these canonical channel values rather than re-deriving river water from rendered terrain or global water level.

Important performance constraint: do not scan the global river network per animal per frame. Use existing chunk/tile-local access or add a bounded local query at the terrain/world boundary.

## Recommended ownership seam

Prefer a cheap world/terrain query conceptually equivalent to:

```text
water present?
water surface height
floor / bed height
depth
```

Exact type/name should follow the current terrain API after preflight.

The query should describe physical world state only. It should not know whether a horse, duck or NPC likes/can traverse it.

Then fauna maps the sample plus species configuration into:

```text
dry
wading
swimming
not physically traversable
```

`not physically traversable` should be a traversal result, not a persistent movement mode.

## AnimalDef / species configuration

`AnimalDef` already owns species movement/behaviour data and, since fauna-010, species physiology through `AnimalMetabolismConfig`.

Do not immediately add a wide set of water parameters.

First check whether existing body/movement/metabolism data can safely derive parts of the behaviour. Add only truly independent water capability information.

A minimal declarative species distinction is nevertheless required because ducks are a first-class counterexample to a land-animal-only model:

- a horse can wade and may be able to swim, but deep water is costly/risky,
- a duck should treat surface swimming as ordinary locomotion,
- some species may not be safe swimmers.

Do not implement `kind === 'duck'` branches in movement runtime. Encode the biological distinction in the species definition/capability contract.

## Animal stamina

`src/fauna/AnimalLife.ts` currently defines:

```ts
export type AnimalMetabolismConfig = {
  hungerRate: number
  thirstRate: number
  staminaCapacity: number
  staminaDrainRate: number
  staminaRegenRate: number
}
```

`AnimalLifeState` already contains shared `StaminaState`.

`tickAnimalLife()` currently:

- drains stamina when `sprinting === true`,
- restores stamina otherwise.

This means swimming cannot simply leave `sprinting === false`, because active swimming would be interpreted as rest.

Prefer extending/reusing the existing stamina lifecycle rather than adding `swimEnergy` or a second stamina ticker.

Keep locomotion context ownership in `AnimalAgent`/traversal. `AnimalLife` should not become a general movement-mode manager merely to learn whether the animal is in water.

Species adapted to swimming (duck) should use the same stamina resource but may have a much lower effective swimming exertion cost through the minimal capability/config chosen during implementation.

## Drowning invariant

Stamina exhaustion by itself is not damage.

Required invariant:

```text
stamina == 0 && dry
→ no drowning damage

stamina == 0 && wading
→ no drowning damage

stamina == 0 && swimming
→ drowning damage
```

Drowning must stop immediately once traversal state is no longer `swimming`.

Reuse existing shared health/death mechanisms:

- `src/shared/HealthState.ts`,
- `damageHealth()` already imported by `AnimalAgent`,
- current animal death/corpse lifecycle.

Do not create a second drowning-health store or drowning-specific death path.

## Mounted parity

`src/app/actions/mountActions.ts` currently calls:

```ts
mount.driveMounted(...)
```

and reads the animal's existing stamina/health for riding stability.

Do not add `canSwim`, water-depth tests or drowning logic to `mountActions.ts`.

The same `AnimalAgent` traversal result must determine physical movement for autonomous and mounted animals.

Useful regression invariant:

> Same animal + same position + same health/stamina = same physical water traversability, whether mounted or autonomous.

Player riding stamina (`tickRidingStamina`) is a separate player resource and must not replace or mask the mount's own swimming stamina/exhaustion.

## Player reference boundary

`src/player/PlayerController.ts` already uses water/floor information for player swimming and is useful as a reference for existing terrain sampling seams.

Do not make `PlayerController` the owner of fauna water sampling. If useful logic is physically generic, move/reuse it from terrain/world rather than calling player-specific movement code from animals.

## Expected implementation order

A likely low-risk order is:

1. Reconfirm current chunk-manager/floor sampling and how river channel segments are available near a point.
2. Add/consolidate the physical local water sample under terrain/world ownership.
3. Add minimal declarative water capability to `AnimalDef` if required.
4. Add a pure fauna traversal classifier returning dry/wading/swimming/passability from water sample + species capability.
5. Replace the current hard water rejection in `AnimalAgent` with that classifier.
6. Integrate wading speed/grounded movement.
7. Integrate swimming positioning/speed into existing locomotion.
8. Integrate swimming exertion with existing animal stamina.
9. Apply drowning damage only for exhausted `swimming` state through existing health/death path.
10. Ensure navigation sees physically traversable water without introducing full traversal costs.
11. Verify mounted parity without moving water rules into `mountActions`.
12. Add pure/unit tests for classifier, stamina/drowning rules and river-vs-global-water correctness where practical.

## Pitfalls

Avoid:

- lowering `WATER_MARGIN` and calling the feature complete,
- using only global `waterLevel`, which would mis-handle canonical rivers,
- reading clamped/rendered height instead of true floor/bed when calculating depth,
- duplicating river and lake water logic inside fauna,
- allowing `tickAnimalLife()` to regenerate stamina during active swimming by accident,
- applying damage whenever animal stamina reaches zero,
- maintaining separate mounted and autonomous water rules,
- adding duck-specific runtime conditionals,
- widening `NavigationQuery` into a speculative general terrain-cost framework unless implementation demonstrates it is required,
- allocating new sample objects in the per-frame movement hot path if a reusable/out-param or scalar representation fits existing conventions,
- running global river searches per animal tick.

## Debugging / observability

If current fauna debug tooling can be extended cheaply, useful values are:

```text
water depth
water surface
floor/bed height
traversal mode: dry/wading/swimming
physically passable?
stamina
currently drowning?
```

This should answer:

> Why did this animal stop at the shore, wade, start swimming or begin drowning?

Do not build a new debug framework solely for this feature.

## Documentation follow-up

After implementation, update the current-state water/fauna documentation through the normal generated/manual documentation flow as appropriate. Do not manually edit generated plan indexes; use the repository's `pnpm plans:sync` / docs sync workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
