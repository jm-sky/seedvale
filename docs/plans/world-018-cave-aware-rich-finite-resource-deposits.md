# Plan: Cave-aware rich finite resource deposits

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** world-terrain-008, world-terrain-017
**Domain:** `world`
**Subdomains:** `resources` `places` `simulation`
**Tags:** `caves` `mining` `gold` `depletion`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Extend the existing world resource/deposit system so finite mineable resources can exist correctly in Cave V2 and use that capability to populate the abandoned mountain mine from `world-terrain-017` with rich, finite gold deposits.

The intended flow is:

```text
stable abandoned-mine landmark
→ world-resource-owned deterministic deposit definitions
→ ordinary ResourceDeposit mining semantics
→ authoritative cave-aware 3D positions
→ finite explicit reserves
→ shared Player / NPC extraction
→ persistent depletion
```

The solution must extend ordinary resource mechanisms rather than create a gold-mine-specific mining system.

## Core invariants

> **No cave deposit derives its authoritative Y from surface `sampleHeight(x, z)`.**

> **No mine-specific extraction or depletion system is introduced.**

> **Player and NPC miners mutate the same authoritative deposit state through the shared mining mechanism.**

> **`richness` and finite extractable reserve are separate concepts.**

> **Ordinary surface deposits retain their current small reserve behaviour unless explicitly configured otherwise.**

> **Landmark selection owns where the mine is; world resources own what mineable deposits it contains.**

> **Resource queries filter spatial validity, but do not become general pathfinding.**

> **Persisted remaining quantity always overrides reconstructed initial reserve for an existing deposit ID.**

> **The resource plan consumes the mine landmark from `world-terrain-017`; it does not rescan terrain or independently select a mountain/cave.**

## Scope

This plan covers:

- extending ordinary mineable resource/deposit definitions with cave-aware placement;
- authoritative world-space deposit positions;
- enough spatial context to distinguish surface and cave deposits;
- bounded mining-target filtering that avoids false surface/cave proximity;
- explicit finite reserve/capacity independent from `richness`;
- backward-compatible initial reserve for existing procedural deposits;
- deterministic world-resource-owned gold placement for the abandoned mine;
- target of five gold deposits:
  - 1–2 exterior;
  - 2–3 interior;
- deterministic total mine reserve of 500–1000 gold, typically around 750;
- deterministic distribution of that total across deposits;
- Player extraction through existing mining mechanics;
- NPC miner extraction through the same mechanics once generic NPC cave/surface movement support exists;
- reuse of existing resource depletion persistence;
- streaming/rebuild/save-load continuity;
- focused tests and documentation.

Generic resource-model work may be implemented independently of `world-terrain-017`, but this plan is not complete until it consumes the `world-terrain-017` landmark contract.

## Non-goals

Do not implement:

- mountain generation;
- massif selection;
- cave generation or cave siting;
- mine landmark selection;
- a second mine registry;
- quest discovery;
- old map;
- quest stages/dialogue;
- sponsor NPC;
- expedition;
- mining colony;
- mine ownership;
- profit sharing;
- generic settlement remote mining;
- generic NPC surface/cave movement or pathfinding;
- new generic geology simulation;
- resource regeneration.

Generic NPC movement across surface/cave spatial contexts is a separate prerequisite plan and must not be absorbed into this one.

## Existing architecture to reuse

### Natural resources

Current deterministic world resources are represented through the existing natural-resource pipeline around:

```text
src/terrain/naturalResources.ts
```

`NaturalResource` already provides stable resource identity, type, world position data and `richness`.

Do not assume that every new mining property belongs directly on `NaturalResource`; first preserve its current semantic role.

### Runtime deposits

Current runtime deposit ownership is around:

```text
src/terrain/resourceDeposits.ts
```

Reuse the existing deposit lifecycle, queries and mining hooks.

Do not introduce:

```text
CaveResourceManager
GoldMineResourceManager
MineDepositRegistry
```

### Mining / depletion

Current mining/depletion behaviour is owned around:

```text
src/terrain/depositMining.ts
```

The existing system already supports finite depletion and sparse persisted remaining values.

Extend this ownership rather than adding another reserve store.

### NPC miner

Current miner work in:

```text
src/ai/npcProfessionWork.ts
```

already queries the shared mining hooks and calls the same deposit mining mutation used by the Player-facing system.

Preserve that shared path. This plan may adapt mining target consumption, but generic NPC cave/surface movement ownership remains outside this plan.

### Persistence

Reuse:

```text
ResourceDepletionState
SaveData.resourceDeposits
```

or their current equivalents.

The intended model remains:

```text
deterministic initial deposit definition
+
sparse persisted remaining override
```

## Ownership boundaries

| Concern | Owner |
|---|---|
| mine landmark / `mineId` | `world-terrain-017` / canonical world-place mechanism |
| cave topology / cave spatial semantics | Cave V2 |
| generic natural-resource occurrence | world resources |
| abandoned-mine deposit definitions | world resources consuming the mine landmark |
| deposit runtime lifecycle | existing `ResourceDeposits` |
| deposit world-space mining position | canonical deposit definition/target |
| deposit spatial context | shared resource/mining target contract |
| `richness` | world-resource quality/significance |
| initial extractable reserve | canonical mineable deposit definition |
| remaining reserve | `ResourceDepletionState` |
| mining mutation | existing deposit mining mechanism |
| Player mining | existing Player action consumer |
| NPC mining | existing profession-work consumer |
| NPC surface/cave travel | separate generic NPC movement plan |
| extracted NPC gold/economy flow | existing inventory/economy mechanisms |

Do not place deposit-generation logic inside the world-location/landmark module merely because the landmark identifies the mine.

## Stage A — Reconfirm post-dependency contracts

Before implementation, reconfirm current `main` after:

- `world-terrain-008`;
- `world-terrain-017`;
- the separate generic NPC surface/cave movement plan, if NPC cave mining is required for completion.

Identify the production contracts for:

- resolving the abandoned mine landmark;
- stable `mineId`;
- associated `caveId`;
- mine entrance/representative position;
- Cave V2 semantic interior queries;
- Cave V2 floor/world-position resolution;
- cave containment;
- cave connectivity/spatial-domain identity;
- cave activation/streaming lifecycle;
- current `NaturalResource` ownership;
- current `ResourceDeposits` definition/runtime boundary;
- current mining-target query shape;
- current NPC movement contract for surface/cave transitions.

Do not implement against superseded Cave V1/spike compatibility APIs.

## Stage B — Define a generic cave-aware deposit contract

Extend the existing resource/deposit representation so mineable deposits are not inherently surface-only.

A deposit used for mining must expose an authoritative world-space position:

```text
x
y
z
```

The exact owner/type should follow the current resource architecture.

Do not prescribe a new parallel deposit hierarchy if extending the existing definition is sufficient.

### Surface deposits

Existing surface resources should continue deriving/receiving their placement through the current surface terrain mechanism.

Their behaviour should remain unchanged from the Player/NPC perspective.

### Cave deposits

Cave deposits must receive their authoritative position from Cave V2 semantic spatial data.

Do not reconstruct their Y using:

```text
sampleHeight(x, z)
```

and do not use the surface terrain as the authoritative ground.

## Cave spatial context

World-space XYZ alone is insufficient because surface and underground locations may overlap horizontally.

The shared deposit/mining-target contract must expose enough context to distinguish spatial domains.

Conceptually:

```text
surface
```

or:

```text
cave:<caveId>
```

The exact representation should reuse Cave V2/world spatial concepts where they already exist.

Do not invent a resource-specific duplicate cave-space identity if Cave V2 already exposes an appropriate identifier/context.

## Resource query responsibility

Resource queries must remain bounded resource queries, not become a pathfinding system.

Preferred flow:

```text
bounded spatial candidate query
→ spatial-context filtering
→ optional Cave V2 connectivity validation
→ return valid mining candidates
→ NPC movement/pathing owns actual travel
```

At minimum:

- surface agents must not receive inaccessible underground deposits as ordinary nearby targets;
- cave agents must not receive surface deposits through the ceiling;
- deposits in unrelated/disconnected cave space must not be treated as trivially reachable where Cave V2 exposes connectivity semantics.

The separate NPC movement plan owns entering/leaving caves and physically traversing between valid contexts.

## Query contract

Preserve a narrow shared mining-query API.

The exact TypeScript shape is implementation-defined, but consumers must be able to obtain:

```text
stable deposit identity
resource type
authoritative world-space mining position
spatial context
```

Optional connectivity metadata may be exposed only where it is already canonical and useful.

Do not force consumers to rediscover deposit Y or cave identity independently.

## Stage C — Separate richness from finite reserve

Current `richness` participates in resource significance/quality semantics and also influences the small initial mining amount.

These concepts must become separable.

Required semantics:

```text
richness
= resource quality / significance / attractiveness

reserve
= total finite extractable quantity
```

Do not redefine `richness` as a raw quantity.

## Reserve ownership

Do not assume in advance that explicit reserve belongs directly on `NaturalResource`.

During implementation, determine the canonical mineable deposit definition and place reserve/capacity there unless current code proves `NaturalResource` already owns that concept.

Invariant:

> **Mining-only capacity should not leak into a broader environmental descriptor unless that descriptor is already the canonical deposit definition.**

Use the smallest extension compatible with current ownership.

## Backward compatibility

Existing ordinary procedural deposits must retain their current initial amounts.

Required behaviour:

```text
explicit reserve/capacity present
→ use explicit finite amount

explicit reserve/capacity absent
→ preserve current richness-derived initial amount
```

Do not globally enlarge the existing richness-to-hit/reserve curve.

A normal surface gold deposit must not become a 100–200-unit node merely because rich mine deposits require larger reserves.

### Existing saves

Persisted depletion is authoritative for an existing stable deposit ID.

If an old save contains:

```text
resourceDeposits[depositId] = remaining
```

that exact remaining value wins over any newly reconstructed initial reserve.

Do not:

- rescale persisted remaining proportionally to a new capacity;
- reset it to the reconstructed reserve;
- treat `0` as absence;
- replenish deposits merely because an explicit reserve field was introduced later.

## Finite semantics

Explicit reserve is an initial deterministic capacity, not a respawn target.

Mining decrements the existing authoritative remaining value.

At zero:

- the deposit is depleted;
- it is excluded from valid mining targets;
- its runtime presentation follows normal depleted-resource behaviour;
- it does not regenerate.

## Stage D — Resolve abandoned-mine landmark content

Consume the canonical abandoned-mine landmark produced by `world-terrain-017`.

The world-resource layer must receive or resolve:

```text
stable mine identity
stable cave identity
representative entrance/location
canonical lookup
```

Do not:

- rescan terrain;
- rerank mountain candidates;
- select another cave;
- infer the mine from nearest cave;
- depend on quest state.

The mine landmark is authoritative for where the mine is. World resources are authoritative for what mineable deposits it contains.

## Stage E — Landmark-owned resource content

The abandoned mine's deposits use ordinary resource/deposit mechanics but are not generated by generic surface-resource scatter.

Conceptually:

```text
mine landmark
→ world-resource deposit-definition source/factory
→ deterministic mine deposit definitions
→ ordinary ResourceDeposits lifecycle/mining
```

Do not place this content-generation responsibility inside the landmark/location owner unless current architecture already establishes the location object itself as the canonical content-definition owner.

This pattern should remain conceptually reusable for future landmark-owned resource content such as:

```text
iron mine
salt mine
quarry
resource-rich ruin
```

Do not build those features in this plan.

## Stage F — Gold deposit layout

Target exactly:

```text
5 gold deposits
```

Preferred distribution:

```text
1–2 exterior
2–3 interior
```

Required minimum:

```text
exterior >= 1
interior >= 2
```

Allow four total only when the actual Cave V2 topology cannot safely provide five valid placements without creating inaccessible, overlapping or traversal-blocking nodes.

Four must be an exceptional deterministic fallback, not the normal target.

## Semantic deposit slots

Define stable semantic placement roles before binding them to concrete spatial candidates.

Conceptually:

```text
exterior-primary
exterior-secondary
interior-shallow
interior-mid
interior-deep
```

The literal names are implementation-defined.

The important invariant is that stable deposit identity and reserve weighting derive from semantic slot identity, not from incidental candidate enumeration order.

This lets candidate ranking change internally without silently swapping persisted deposit identities between locations.

## Exterior placement

Exterior deposits should:

- remain clearly associated with the mine entrance;
- use valid surface terrain;
- remain outside Cave V2 interior space;
- avoid blocking the entrance or required approach;
- use ordinary surface grounding/spatial context;
- remain reachable through normal surface movement.

Use the stable mine/entrance definition rather than searching arbitrary nearby gold noise.

## Interior placement

Interior deposits should be selected from semantic Cave V2 space.

They must:

- be inside the associated `caveId`;
- use authoritative Cave V2 floor/world position;
- occupy valid connected cave space;
- avoid blocking narrow critical traversal;
- prefer chambers/wider usable areas where the Cave V2 representation supports this;
- remain deterministic without cave render geometry;
- survive cave activation/deactivation without changing position.

Do not make authoritative placement depend on:

- render-mesh triangles;
- Three.js object UUIDs;
- transient raycasts;
- mesh activation order.

## Interior placement candidate selection

Prefer a bounded deterministic candidate/scoring process over arbitrary first-valid placement.

Useful factors may include:

- semantic depth from entrance;
- usable local width/clearance;
- Cave V2 connectivity to entrance;
- distance from other mine deposits;
- avoidance of critical narrow passages.

Do not introduce expensive full cave-mesh analysis.

Use Cave V2 semantic topology/spatial data.

## Stable deposit identity

Mine deposit IDs must be stable and independent of runtime generation order.

Derive identity from stable inputs such as:

```text
mineId
+ semantic deposit slot
```

or the equivalent canonical resource-ID mechanism.

Do not derive IDs from:

- transient candidate-array order;
- runtime array ordering shared with unrelated resources;
- mesh identity;
- activation sequence.

A deposit must retain the same identity after streaming, rebuild and save/load.

## Stage G — Determine total mine reserve

Choose the mine's total gold reserve first.

Required range:

```text
500–1000 gold
```

Representative target:

```text
~750 gold
```

The deterministic distribution should be biased toward the middle rather than uniformly making extreme 500 and 1000 totals as common as central values.

The exact curve is an implementation/balance constant covered by tests.

A simple bounded multi-sample/triangular-like deterministic distribution is sufficient; do not add a statistics dependency for this.

## Reserve distribution across deposits

After determining `totalReserve`, deterministically distribute it across the actual deposit slots.

Conceptually:

```text
totalReserve
→ deterministic semantic-slot weights
→ normalize weights
→ integer reserve allocation
```

Required properties:

- resulting sum equals the selected total reserve;
- every deposit has a meaningful reserve;
- distribution is stable for the same seed/mine;
- it does not depend on runtime mining order;
- it does not depend on unrelated RNG calls.

Interior/deeper semantic slots may receive a moderate positive weighting if this improves mine progression, but exterior deposits must remain materially useful.

Do not hard-code five identical 150-unit deposits.

If topology forces the exceptional four-deposit layout, retain the selected mine total and redistribute it across the surviving semantic slots. Do not reduce total mine wealth merely because one placement slot could not be safely created.

## Deterministic RNG

Use purpose-specific deterministic random streams derived from stable inputs such as:

```text
world seed
mineId
semantic salt
```

Keep logically separate operations isolated.

Example semantic salts:

```text
mine-gold-total
mine-gold-placement
mine-gold-reserve-weights
```

Do not use a shared mutable global RNG whose output depends on unrelated generation call order.

## Stage H — Runtime ResourceDeposits integration

Feed landmark-owned world-resource definitions into the ordinary runtime deposit system.

The abandoned mine should not need a permanent dedicated runtime manager.

Reuse existing:

- deposit creation/lifecycle;
- query mechanisms;
- mining mutation;
- depletion handling;
- runtime visual lifecycle where applicable.

Ensure both surface and cave deposits can participate through the same canonical system.

## Streaming / interest

Review existing resource interest/streaming behaviour.

Cave deposits must remain available when relevant to:

- a nearby Player;
- an NPC miner operating at the mine once generic cave movement is supported;
- later off-screen settlement simulation where existing architecture already supports it.

Do not make cave deposit existence depend on camera visibility.

This plan does not need to implement future aggregated remote colony mining, but must not create an API that inherently requires Player proximity.

## Stage I — Shared mining consumers

Player and NPC consumers must use the same authoritative mining target/depletion system.

### Player

Player mining should continue through the existing shared deposit mining mechanism.

The Player should be able to mine:

- exterior mine deposits;
- interior Cave V2 deposits;

without a gold-mine-specific interaction path.

Both must mutate the same `ResourceDepletionState` ownership as existing deposits.

Do not introduce:

```text
mineGold()
mineCaveDeposit()
```

when ordinary `mine(depositId)` semantics can be extended.

### NPC

Current NPC miners already consume shared mining hooks. Preserve that architecture.

The NPC mining consumer must receive the deposit's authoritative target position/context rather than reconstructing Y from surface terrain.

Conceptually:

```text
shared mining query
→ spatially valid deposit target
→ authoritative position/context
→ generic NPC movement owns travel
→ shared mine()
→ carried gold
→ existing settlement economy flow
```

Remove the assumption that:

```text
destination.y = sampleHeight(target.x, target.z)
```

is valid for every mining target.

This plan does not implement the generic movement logic needed to enter or traverse caves. That is owned by the separate NPC movement plan.

## Shared authority

A deposit has exactly one authoritative remaining quantity regardless of who extracts it.

Required behaviour:

```text
Player mines deposit A
→ remaining decreases

NPC later mines deposit A
→ observes reduced remaining

NPC depletes deposit B
→ Player later cannot mine fresh copy of B
```

There must not be:

- Player reserve;
- NPC reserve;
- visual reserve;
- quest reserve.

Only the shared deposit/depletion state is authoritative.

## Stage J — Persistent depletion

Reuse the existing sparse depletion model.

Conceptually:

```text
deterministic initial reserve
+
persisted remaining override
```

The initial reserve should remain reconstructible from stable mine/deposit definitions.

Only changed remaining state needs persistence unless current persistence architecture requires otherwise.

## Persistence requirements

Verify:

- partial depletion survives resource streaming;
- partial depletion survives cave activation/deactivation;
- partial depletion survives `WorldBundle` rebuild;
- partial depletion survives save/load;
- zero reserve survives save/load;
- zero is not confused with absent override;
- persisted remaining overrides reconstructed initial reserve;
- depleted deposits do not respawn;
- deposit IDs remain stable;
- loading does not create duplicate mine deposits.

Do not introduce:

```text
SaveData.abandonedMineGold
```

when existing `SaveData.resourceDeposits` can own the state.

If schema changes become necessary, use normal save migration/versioning mechanisms.

## Performance

Cave-aware resources must preserve bounded resource-query costs.

Avoid:

- scanning every cave deposit globally for each NPC;
- making resource queries perform general route/path searches;
- activating cave render meshes for resource queries;
- per-frame regeneration of deterministic mine content;
- mesh raycasts as the normal semantic placement/query path;
- excessive temporary allocations in frequent mining queries.

Reuse existing spatial/interest filtering before applying spatial-context/connectivity checks.

If more expensive Cave V2 connectivity evaluation is required, perform it only on the bounded candidate set.

## Implementation phases

### Phase 1 — Reconfirm dependencies and resource ownership

After the relevant dependencies land:

- inspect the mine landmark output contract;
- inspect production Cave V2 spatial/connectivity APIs;
- confirm current `NaturalResource` semantics;
- confirm resource definition/runtime ownership;
- confirm shared mining hooks;
- confirm Player/NPC consumers;
- confirm depletion persistence;
- confirm the generic NPC surface/cave movement contract without reimplementing it here.

### Phase 2 — Cave-aware deposit position/context

Extend the canonical mineable deposit/target representation with:

- authoritative XYZ;
- surface/cave spatial context;
- enough metadata for bounded context/connectivity filtering.

Preserve current surface behaviour.

### Phase 3 — Explicit finite reserve

Add optional explicit reserve/capacity to the correct canonical mining definition.

Preserve existing richness-derived initial amounts when absent.

Keep `richness` semantically separate and preserve persisted remaining values exactly.

### Phase 4 — World-resource-owned mine content

Consume the stable abandoned-mine landmark and deterministically generate its gold deposit definitions from the world-resource layer.

Do not repeat terrain/cave selection and do not place deposit-generation ownership in the landmark module without current-code justification.

### Phase 5 — Semantic slots and placement

Define stable semantic deposit slots and bind them to deterministic surface/Cave V2 candidates.

Target:

```text
5 deposits
1–2 exterior
2–3 interior
```

with the documented four-node exceptional fallback.

### Phase 6 — Reserve generation

Generate deterministic total reserve in 500–1000, biased around ~750, then distribute that exact total across the actual semantic deposit slots.

### Phase 7 — Shared target queries

Update mining target selection so spatial context and bounded Cave V2 connectivity checks prevent false surface/cave proximity.

Do not turn resource queries into pathfinding.

### Phase 8 — Shared mining consumers

Ensure Player and NPC consumers use authoritative target positions and the existing shared mining mutation.

Adapt NPC mining target consumption to the generic NPC movement contract; do not implement movement itself here.

### Phase 9 — Persistence and lifecycle

Verify depletion across resource/cave streaming, rebuild and save/load.

Do not add mine-specific persisted reserve state.

### Phase 10 — Documentation

Update relevant current-state documentation and implementation notes.

Do not describe later quest/colony stages as implemented.

`pnpm docs:sync` does not need to be run manually when repository workflow already performs it.

Add JSDoc for important architectural/public functions and classes introduced by the implementation where it improves preflight discovery. Use `@domain world` where appropriate.

## Likely implementation areas

Reconfirm exact files against current `main` after dependencies land.

Current likely integration points include:

```text
src/terrain/naturalResources.ts
src/terrain/resourceDeposits.ts
src/terrain/depositMining.ts
src/ai/npcProfessionWork.ts
src/app/actions/groundActions.ts
src/app/saveState.ts
src/app/createApp.ts
src/world/locations/*
src/world/caves/*
```

Potential resource/world-bundle wiring may also be involved.

Do not mechanically modify every listed file. Avoid unrelated refactors.

## Verification

### Surface compatibility

Verify:

- existing procedural surface deposits keep stable positions;
- existing deposits keep their current small initial quantities when no explicit reserve is defined;
- surface Player mining still works;
- surface NPC mining still works;
- existing depletion saves remain compatible.

### Cave-aware position

Verify:

- cave deposits have authoritative XYZ;
- their Y comes from Cave V2 semantics rather than surface terrain;
- positions remain stable without active cave render mesh;
- activation/deactivation does not move deposits.

### Spatial context

Verify:

- surface deposit context remains surface;
- mine interior deposits reference the correct cave context;
- bounded resource queries exclude invalid surface/cave overlap;
- disconnected cave targets are rejected where Cave V2 connectivity allows that distinction;
- resource queries do not perform general pathfinding.

### Mine landmark consumption

Verify:

- the world-resource layer resolves the existing `mineId`;
- it consumes the associated `caveId`;
- it does not rescan mountain terrain;
- it does not select another cave;
- deposit generation is independent of quest state;
- deposit-generation logic is not duplicated in the landmark owner.

### Deposit layout and semantic identity

Verify representative seeds:

- target count is five;
- at least one exterior node exists;
- at least two interior nodes exist;
- interior nodes are inside valid Cave V2 space;
- entrance traversal is not blocked;
- critical narrow passages are not blocked;
- exceptional four-node fallback occurs only when five valid placements cannot be produced;
- semantic slot identities remain stable even if candidate enumeration order changes.

### Stable IDs

Verify:

- same mine produces same deposit IDs;
- IDs derive from stable mine/semantic-slot identity rather than transient candidate order;
- IDs survive rebuild/save-load reconstruction;
- unrelated resource-generation order does not change them.

### Reserve

Verify:

- selected total is always 500–1000;
- representative seed distribution is centred around ~750;
- per-deposit reserves sum exactly to selected total;
- every node has meaningful positive reserve;
- four-node fallback preserves the same selected total;
- reserve is independent from `richness`;
- normal surface nodes without explicit reserve retain old behaviour.

### Existing-save authority

Verify for an existing stable deposit ID:

```text
persisted remaining = 2
reconstructed initial reserve = 180
→ remaining after load = 2
```

Also verify:

```text
persisted remaining = 0
→ remains depleted
```

No proportional rescaling or replenishment is allowed.

### Player mining

Verify:

- Player can mine exterior nodes;
- Player can mine interior nodes;
- both use the shared mining mutation;
- remaining reserve decrements exactly once;
- depletion removes the node as a valid mining target.

### NPC mining integration

Once the separate NPC surface/cave movement dependency is complete, verify:

- miner receives authoritative target position/context;
- miner no longer reconstructs cave target Y from surface height;
- resource query returns only spatially valid candidates;
- generic NPC movement physically reaches the target;
- miner calls the shared mining mutation;
- mined gold continues through existing carried-item/economy flow.

Do not accept teleportation, remote extraction or mine-specific travel as a workaround.

### Shared authority

Test cross-consumer behaviour:

```text
Player mines → NPC observes reduced reserve
NPC mines → Player observes reduced reserve
NPC depletes → Player sees depleted node
```

### Persistence

Verify:

- partial mine reserve survives resource streaming;
- partial mine reserve survives cave streaming;
- partial mine reserve survives world rebuild;
- partial mine reserve survives save/load;
- zero survives save/load;
- depleted nodes do not respawn;
- no duplicate mine deposits appear.

### Determinism

Verify:

- same world/mine produces identical semantic slots and deposit positions;
- same world/mine produces identical total reserve;
- same world/mine produces identical reserve allocation;
- unrelated RNG activity does not change results;
- different seeds produce bounded meaningful variation.

### Performance

Verify mining queries remain bounded and do not require:

- global cave scans;
- general pathfinding;
- cave mesh activation;
- repeated mine-content generation;
- render-mesh raycasting.

## Technical verification

Run the smallest relevant automated verification set, including:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Add focused tests for:

- explicit reserve fallback semantics;
- persisted remaining precedence;
- reserve total/distribution;
- semantic-slot/stable mine deposit IDs;
- cave-aware positions;
- spatial-context target filtering;
- shared Player/NPC depletion;
- persistence continuity.

Browser/gameplay verification is performed manually by the User.

## Dependencies / blockers

### `world-terrain-008-underground-caves-v2.md`

Hard dependency for production:

- cave identity;
- semantic interior space;
- floor/world-position queries;
- containment;
- connectivity/spatial context;
- traversal/collision semantics;
- streaming/rebuild lifecycle.

Do not implement cave deposits against transitional V1/spike geometry.

### `world-terrain-017-abandoned-mountain-mine-landmark.md`

Hard dependency for mine-specific content:

- stable `mineId`;
- associated `caveId`;
- representative entrance/location;
- canonical mine lookup.

Do not duplicate its regional search or cave selection logic.

### Generic NPC surface/cave movement

NPC cave mining requires a separate generic NPC movement plan that establishes how NPC movement represents and traverses surface/cave spatial contexts.

This plan may consume that contract but must not implement it.

Until that dependency is complete, cave deposits, Player mining, reserve/depletion and resource-query semantics may be implemented, but the NPC cave-mining success criterion remains blocked.

## Success criteria

For the abandoned mountain mine produced by `world-terrain-017`:

```text
stable mine landmark
→ world-resource-owned deterministic gold content
→ target 5 semantic deposit slots
   → 1–2 exterior
   → 2–3 Cave V2 interior
→ authoritative surface/cave world positions
→ bounded spatially valid mining targets
→ finite total reserve 500–1000, typically ~750
→ ordinary shared ResourceDeposit mining
→ persisted remaining overrides reconstructed initial reserve
→ Player and NPC observe the same remaining reserve
→ depletion persists through streaming/rebuild/save-load
→ no respawn
```

Existing ordinary surface deposits retain their current behaviour unless they explicitly opt into a larger finite reserve.

The abandoned mine's resource content exists independently of the questline.

Removing or disabling the future quest must not create, remove, relocate, replenish or otherwise change these deposits.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
