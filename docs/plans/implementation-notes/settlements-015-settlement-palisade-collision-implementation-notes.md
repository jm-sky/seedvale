# Implementation Notes: Settlement palisade collision

**Plan:** `settlements-015-settlement-palisade-collision.md`

## Recon / architectural decisions

### 1. Current bug is exactly at the presentation → runtime-collision boundary

`src/settlement/settlementPalisade.ts::plantEntrancePalisade()` currently owns the complete final segment selection for the settlement entrance palisade:

- derives the perimeter radius from `VillagePlan.boundary.radius` (fallback: `villageSizeConfig(size).footprintRadius * 0.72`),
- selects the first inland road entrance, then first inland entrance as fallback,
- rejects a fully coastal entrance,
- widens the gate from the maximum road/path corridor width,
- rejects individual coastal segment candidates,
- rejects candidates that hit `RoadCorridorSegment`s through `pointHitsCorridor()`,
- computes `rotationY`,
- accumulates the final `PropPlacement[]`,
- immediately consumes that array in `buildInstancedProps()`.

There is no second geometry source elsewhere. The missing collider is therefore not a movement-system defect; the final placement data currently die inside `plantEntrancePalisade()` instead of being exposed to `createSettlement()`.

### 2. Extract final placement resolution; do not reconstruct geometry in `createSettlement`

The safest small fix is to split `plantEntrancePalisade()` into:

1. a pure/plain-data resolver that produces the **final** placements after all existing coastal/gate/corridor filtering;
2. materialization that loads the wall template and passes those exact placements to `buildInstancedProps()`.

Recommended contract shape:

```ts
export type SettlementPalisadePlacement = PropPlacement

export function resolveEntrancePalisadePlacements(...): SettlementPalisadePlacement[]

export async function plantEntrancePalisade(
  group: THREE.Group,
  placements: readonly SettlementPalisadePlacement[],
): Promise<void>
```

Exact naming/signature may adapt to keep call-site churn small, but preserve this ownership rule:

```text
resolve final placement data once
          ├─ presentation
          └─ collision projection
```

Do **not** have `createSettlement.ts` recalculate radius, entrance, tangent, segment count or corridor rejection. That would create two geometry authorities and will drift when `settlements-010` later changes the palisade layout.

### 3. `props.ts` is the correct bridge for exposing placements to settlement runtime

`buildSettlementProps()` already owns settlement prop construction and returns runtime-facing presentation/landmark data consumed by `createSettlement.ts`. Keep `settlementPalisade.ts` free of registry ownership.

Recommended integration:

- resolve final palisade placements inside the existing `buildSettlementProps()` flow at the same point where `plantEntrancePalisade()` runs today;
- render from those placements;
- return the placements in the existing `buildSettlementProps()` result (focused field, e.g. `palisadePlacements`), or store them on `SettlementLandmarks` only if that remains the established shape for other physical prop geometry after inspecting the exact return type;
- `createSettlement()` reads that returned plain data and projects it to `Collider[]`.

Prefer a focused `buildSettlementProps` result field over adding semantic meaning to `SettlementLandmarks` if the placements are not actual gameplay landmarks. Do not use `Object3D`, `InstancedMesh`, instance matrices or scene traversal as the data seam.

### 4. Reuse the settlement's existing collider owner and lifecycle

`src/settlement/createSettlement.ts` already registers one aggregate collider list under `def.id`:

```ts
registerColliders(def.id, [
  ...wellColliders,
  ...settlementHouseColliders(...),
  ...settlementPropColliders(landmarks),
])
```

and `Settlement.dispose()` already calls:

```ts
clearColliders(def.id)
```

Append palisade colliders to that same aggregate registration. Do not add:

- a second registry,
- a palisade-specific owner key,
- one owner key per segment,
- registration from `settlementPalisade.ts`.

This preserves stream-out/stream-in cleanup automatically and avoids orphaned or duplicated colliders.

### 5. Use OBBs, but verify the long-axis mapping from the placement convention

`src/world/collision.ts::ObbCollider` uses:

```ts
{
  type: 'obb',
  x,
  z,
  halfWidth,
  halfDepth,
  rotationY,
}
```

with the same rotate-then-translate yaw convention used by house geometry.

`PropPlacement.rotationY` is applied directly by `buildInstancedProps()` to the template root. `settlementPalisade.ts` computes it from the tangent using `yawToward(...)`.

Important implementation detail: do not guess whether the wall's long side belongs in `halfWidth` or `halfDepth`. `WALL_HALF_LENGTH = 2.2` is documented as the approximate world half-width of a prepared wall segment, while `ObbCollider` names its local axes explicitly. Before fixing the projection constant mapping, verify the prepared wall template's local long axis / existing yaw convention once. Then encode that mapping in one helper and cover it by a test that samples a point near each expected long-end/short-side boundary.

The collider should have no `minY`/`maxY` unless there is a demonstrated gameplay requirement; ordinary settlement obstacles are currently XZ blockers at every Y.

### 6. Keep collision thickness a dedicated physical constant

The existing `WALL_HALF_LENGTH` is suitable as the canonical half-length if its axis mapping is confirmed. There is no verified settlement-wall collision-thickness constant today.

Add one small named constant beside the palisade geometry (not in `PlayerController`/`AnimalAgent`), based on the prepared wall footprint rather than reusing player-built `PALISADE_FOOTPRINT_RADIUS` by coincidence.

Keep it narrow enough that:

- adjacent visible wall segments form an effective barrier,
- the intentionally open gate/corridor remains open,
- the collider does not noticeably protrude beyond the mesh.

Do not compensate for pathfinding behavior by inflating collider thickness.

### 7. `settlementPropColliders.ts` is not the natural geometry owner

`src/settlement/settlementPropColliders.ts` currently handles simple landmark-derived disks for stockpiles, merchant wagon and campfire. It has no oriented segment geometry and intentionally consumes only a small landmark DTO.

Prefer one of these:

- `settlementPalisadeColliders()` in `settlementPalisade.ts` if the projection remains tiny; or
- `settlementPalisadeColliders.ts` if separating plain placement resolution from collision projection keeps `settlementPalisade.ts` clearer.

Do not force oriented wall placements into `SettlementPropColliderLandmarks` just to reuse that file.

### 8. Player/NPC/fauna require no palisade-specific code

The common collision pipeline is already correct:

- `PlayerController` queries shared colliders and resolves position;
- `NpcAgent` consumes the shared collider source for movement/walkability;
- `AnimalAgent` calls `collidersNear(x, z)`, filters with `colliderActiveAtY`, and uses the common movement collision path.

If implementation starts modifying any of these classes to recognize a settlement palisade, stop and re-check the registration seam. The purpose of this plan is to make the existing shared mechanism see the missing obstacle.

### 9. Compatibility with `settlements-010`

`settlements-010` plans to replace the current short-wing generator with a more explicit pure perimeter-placement policy. Its implementation notes deliberately excluded colliders.

This fix should land first and establish a stable seam:

```text
final SettlementPalisadePlacement[]
          ├─ render
          └─ collider projection
```

When `settlements-010` changes *how* the placement array is generated, collision should require no architectural rewrite. Avoid names/contracts tied specifically to "first entrance wings" where a generic settlement-palisade placement name is equally clear.

## Files / symbols to touch

### `src/settlement/settlementPalisade.ts`

- extract/expose final placement resolution from `plantEntrancePalisade()`;
- keep all existing gate/coast/corridor filtering in that one resolver;
- add the pure placement → OBB projection here or in a focused sibling file;
- add JSDoc / `@domain settlements` to the new public geometry contract because it becomes the shared presentation/collision seam.

### `src/settlement/props.ts`

- resolve once and render the same placement array;
- expose that array through the `buildSettlementProps()` result without turning mesh state into authority.

### `src/settlement/createSettlement.ts`

- project returned palisade placements to colliders;
- append them to the existing `registerColliders(def.id, [...])` call;
- leave `dispose()` / `clearColliders(def.id)` unchanged.

### Tests

Prefer a focused new `settlementPalisade.test.ts` / existing palisade test location plus a small `createSettlement` integration test if an existing fixture can observe `registerColliders` without booting a full world.

Do not add browser automation; manual verification remains with the user.

## Tests that provide real value

1. **Resolver ↔ collision cardinality:** final placements count equals generated palisade OBB count.
2. **Transform projection:** each collider copies `x`, `z`, `rotationY` from its source placement exactly.
3. **Axis/extent geometry:** test one unrotated and one rotated segment so `WALL_HALF_LENGTH` is assigned to the actual long axis, not just count-tested.
4. **Filtering authority:** a corridor/coastal candidate rejected by the resolver never appears in either render placements or collision projection; do not create a second rejection test path in the collider helper.
5. **Gate remains empty:** resolver output contains no segment across the existing gate gap, therefore projection produces no invisible gate blocker.
6. **Runtime registration:** settlement registration includes palisade OBBs under the same `def.id` owner as well/house/prop colliders.
7. **Lifecycle:** existing `dispose()` clears `def.id`; no separate palisade cleanup call is introduced.

A full Player/NPC/AnimalAgent unit test is not necessary: those systems already exercise shared `Collider` behavior and changing them is outside this fix.

## Pitfalls

- Returning colliders directly from `plantEntrancePalisade()` while leaving placement generation private would still couple collision to presentation materialization and make `settlements-010` harder.
- Reading matrices back from `InstancedMesh` makes renderer state authoritative and introduces unnecessary Three.js coupling.
- Recomputing palisade positions in `createSettlement()` will eventually diverge from coastal/corridor/character-aware filtering.
- A continuous ring collider would close valid road/path/coastal gaps that are intentionally visible.
- Oversized circles or overly thick OBBs can make the gate visually open but physically blocked.
- Registering segment owner keys separately defeats the settlement's existing symmetric lifecycle and increases registry churn.
- Do not run `pnpm docs:sync` manually; repository workflow handles derived documentation according to current project rules.

## Suggested implementation order

1. Extract final plain-data placement resolver without behavior change.
2. Make existing rendering consume its result; add resolver regression tests.
3. Add pure placement → OBB projection and geometry tests.
4. Expose placements from `buildSettlementProps()`.
5. Append projected colliders in `createSettlement()`'s existing `registerColliders(def.id, ...)` aggregation.
6. Run targeted tests, then normal typecheck/test/build required by repository instructions.
7. Leave browser verification to the user.
