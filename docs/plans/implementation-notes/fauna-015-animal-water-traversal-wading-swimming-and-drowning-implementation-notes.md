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

## What was actually implemented

Followed the "Expected implementation order" above closely; no deviation from the physical model, ownership boundaries or non-goals.

### 1–2. Local water sample (terrain/world ownership)

`src/terrain/waterSample.ts` — pure `sampleLocalWater(clampedHeight, floorHeight, waterLevel, riverSegments, x, z): LocalWaterSample` (`{ present: false } | { present: true, waterSurfaceHeight, floorHeight, depth }`). River channel data wins whenever `(x, z)` sits inside it (so a mountain stream whose bed sits above the global `waterLevel` still reports as water); otherwise falls back to the existing lake/ocean `heights <= waterLevel` / `floorHeights` signal. `riverNetwork.ts` gained `riverWaterSampleAt()` (interpolated `waterH`/`bedH` at the nearest segment, alongside the existing edge-distance); `nearestRiverBankDistance()` now delegates to it instead of duplicating the projection loop — same tested output, one caller-facing behaviour change: none.

Wired into `ChunkManager.sampleLocalWater(worldX, worldZ)` — one `chunks.get(chunkKey(...))` lookup for the point's own owning chunk (same cost class as `sampleHeight`/`sampleFloor`'s `readField`), then `riverChannelSegmentsNear()` only on that chunk's own cached `riverChains` (empty array short-circuits for the common no-river-here case) — deliberately *not* the `riverShoreDistance`/`riverShorePoint` pattern above it, which scans every loaded chunk and is only ever called once per player interaction, not from a per-animal hot path.

### 3–4. Species capability + pure classifier

`src/fauna/waterTraversal.ts` (no Three.js/`AnimalAgent` import): `AnimalWaterCapability` (`{ canSwim?: boolean, waterAdapted?: boolean }`, both optional — absent means default land animal), `classifyWaterTraversal(depth, scale, capability): 'dry' | 'wading' | 'swimming' | null`, `wadeDepthFor(scale)`, `swimStaminaExertion(capability)`, `shouldApplyDrowningDamage(mode, staminaExhausted)`. Wading depth deliberately derives from the species' existing `AnimalDef.scale` (`wadeDepthFor`) instead of a new per-species `wadeDepth` field — the plan explicitly calls out not adding one. `AnimalDef` gained one optional field, `water?: AnimalWaterCapability`, following the existing `mount?`/`production?`/`scavenging?`/`diet?` "presence of field is the capability" convention. Only `duck` sets it (`{ waterAdapted: true }`); every other species relies on the default (can wade, can also swim at the generic exertion cost) — a `canSwim: false` species is exercised only in unit tests, not wired onto any current `AnimalKind`, since no species in the game today needed the restriction and the plan's requirement was that the contract support it, not that it be exercised by real content.

### 5. `AnimalAgent` integration — single ownership seam

`AnimalAgent`'s constructor gained one new required dependency, `sampleLocalWater`, threaded the same way as the pre-existing `sampleHeight`/`waterLevel` (positionally, from `createFauna.ts`/`settlement/livestock.ts`, ultimately `ChunkManager.sampleLocalWater`). `isWalkable(x, z)` replaced the old hard `sampleHeight(x, z) <= waterLevel + WATER_MARGIN` rejection with `classifyWaterTraversal(...) === null` — water physically too deep for the species is rejected exactly like a collider; wading/swimming water is walkable. This one method is shared by autonomous steering (`steerToward`), nav rescue/repath (`attemptNavRepath`'s `NavigationQuery.isWalkable`), and `driveMounted()`'s `stepWithSlopeAndCollision` call — mounted/autonomous parity (plan §8) falls out of there being exactly one `isWalkable()` implementation, not a separate integration test. `NavigationQuery`/shared A* were **not** touched — physically-traversable water reaching `findPath()` "for free" through the shared `isWalkable` callback was exactly the plan's §9 expectation.

A new per-tick private state `waterMode: WaterTraversalMode` (default `'dry'`) is resolved once per tick, from the animal's actual post-movement position, by `resolveWaterTraversal()` — called from both `update()`'s tail and `driveMounted()` (not from `isWalkable()`, which re-derives ability fresh per candidate point and never reads/writes `waterMode`).

### 6. Swimming stamina

`AnimalLife.ts`'s `tickAnimalLife()` gained one new optional trailing parameter, `swimExertion?: number` — when set, stamina drains at `staminaDrainRate * swimExertion` regardless of the `sprinting` flag; when omitted (every pre-existing call site except the two `AnimalAgent` tails below), behaviour is byte-for-byte unchanged (verified by the existing `AnimalLife.test.ts` suite passing untouched). `AnimalAgent.swimExertionNow()` returns `swimStaminaExertion(this.def.water)` while `waterMode === 'swimming'`, `undefined` otherwise. No `swimEnergy`/second stamina pool; `AnimalLife.ts` still knows nothing about water/traversal, only "how much to drain this tick."

### 7. Drowning

`AnimalAgent.tickDrowning(dt)`: `shouldApplyDrowningDamage(this.waterMode, isExhausted(this.life.stamina))` gates a flat `DROWNING_DAMAGE_PER_SEC = 5` HP/sec applied through the existing `damageHealth()` + `collapse()` (the same death lifecycle `takeDamage()` uses), without `takeDamage()`'s combat-only blood-splat/provocation side effects — the source is environmental. Called from both `update()`'s tail and `driveMounted()`, right before `tickAnimalLife()`, so mounted and autonomous animals drown under identical rules. The dry/wading/swimming × exhausted invariant matrix is covered directly by `waterTraversal.test.ts` against the pure predicate rather than by instantiating a full `AnimalAgent` — no existing fauna test instantiates one (see below).

### 8. Mounted parity

No changes to `mountActions.ts`. `driveMounted()` calls the same `this.isWalkable`, `resolveWaterTraversal()`, `tickDrowning()`, `swimExertionNow()` as the autonomous tail — structurally one implementation, so parity can't drift by construction rather than by a maintained invariant test.

### 12. Performance

`sampleLocalWater` avoids the one real trap called out in the plan (`riverShoreDistance`-style global `chunks.values()` scan) by keying off the point's own owning chunk only. It does allocate a small discriminated-union return object and, on a river-carrying chunk, a `RiverChannelSegment[]` per call (`riverChannelSegmentsNear`'s existing contract) — not allocation-free, but bounded to loaded-chunk-local data and gated by an empty-array short-circuit for the (vast majority) of chunks with no river, consistent with the plan's "smallest coherent change" framing over a zero-allocation guarantee.

### Tests

`src/fauna/waterTraversal.test.ts` and `src/terrain/waterSample.test.ts` cover the pure classifier/predicate/sample logic directly (dry/wading/swimming/blocked classification, scale-scaled wading depth, `canSwim: false` rejection, `waterAdapted` swim behaviour, the full drowning invariant matrix, river-vs-global-waterLevel precedence). `AnimalLife.test.ts` gained `swimExertion` coverage. Mounted/autonomous parity and the duck "no `kind === 'duck'` branch" requirement are satisfied structurally (single shared `isWalkable()`/`AnimalDef.water` data path) rather than by a dedicated integration test — no existing fauna test constructs a full `AnimalAgent` (they all test extracted pure modules, e.g. `faunaDecision.ts`/`preyAlertPerception.ts`), and this plan follows that established convention rather than introducing the first one.

### Verification

`npx tsc --noEmit`, `npx eslint src/`, full `npx vitest run` (3111 tests) and `npm run build` all pass. Browser/manual verification (the plan's 13-item checklist) is the user's own next step, not performed here.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
