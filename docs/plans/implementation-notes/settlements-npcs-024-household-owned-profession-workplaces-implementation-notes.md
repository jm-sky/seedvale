# Implementation Notes: Household-Owned Profession Workplaces

## Current ownership and lifecycle

`src/settlement/createSettlement.ts` already preserves the required ownership alignment:

```text
def.families[familyIndex]
  ↔ homePlaces[familyIndex]
  ↔ households[familyIndex]
```

`homePlaceId(settlementId, index)` is the stable home identity used by both NPC/household logic and other house-owned systems. Avoid introducing a second family/home/workplace identity scheme.

Static settlement props are built before runtime `Household`/`NpcAgent` creation, but `buildSettlementProps()` already receives `def.plan` and the settlement definition contains `def.families`. Profession-driven static placement should therefore derive from family definitions / family indices, not from runtime agents.

## Relevant files and symbols

### `src/settlement/createSettlement.ts`

Important flow:

- `buildSettlementProps(...)` runs before runtime household/NPC creation;
- `homePlaces` are built from `landmarks.homes` using `homePlaceId(def.id, i)`;
- `households = def.families.map((family, familyIndex) => ...)` preserves family index alignment;
- `flatMembers` carries each member's `home` and `household` into NPC creation;
- `workplaceFor(def.id, member.character.role, landmarks, i)` currently resolves the workplace without household identity.

A blacksmith workplace should be resolvable from the same `home`/`household` already present in `flatMembers`; do not perform a new settlement-wide lookup from inside `NpcAgent`.

### `src/settlement/props.ts`

Current problematic block:

```ts
const { x: forgeX, z: forgeZ } = placeFromLandmark(
  site, undefined, -2, -5, sampleHeight, waterLevel, coreRandom,
)
```

Then `anvil` and `workbench-grind` are always materialized and `landmarks.blacksmith` is assigned to the resulting settlement-center-relative position.

The comment explicitly says this is built unconditionally whether or not families roll a blacksmith. This is the semantic bug to remove.

The same module already has the useful yard placement precedent:

- `houseYardPlacements()` computes deterministic positions from each `landmarks.houses` entry;
- household barrel/trough/storage are placed per house;
- `landmarks.householdStorages` intentionally preserves house/home ordering so `createSettlement.ts` can zip it with households.

Prefer reusing the same house-index ownership convention for profession equipment. A separate generic placement manager is unnecessary.

Do not blindly reuse `houseYardPlacements()` as-is if its radial slot conflicts with existing storage/barrel/trough slots; a blacksmith-specific compact yard arrangement helper is acceptable for Stage 1.

### `src/settlement/householdYard.ts`

Current shared geometry contract:

- `MAX_HOUSE_FOOTPRINT_RADIUS` derives from `HOUSE_CATALOG`;
- `HOUSEHOLD_YARD_PROP_OFFSETS` currently covers barrel/trough/storage;
- `householdYardRadius()` returns house footprint + outermost common yard offset.

Plan settlements-npcs-011 intentionally made this a pure geometry module with no household/runtime ownership. Keep that property.

For Stage 1, use the existing conservative reserved yard where possible.

For Stage 2, this is the likely ownership point for a pure profession-aware required-clearance helper, but avoid hard-coding rendered asset details into the planner. Input should be plain profession/yard requirements; output should be geometry only.

### `src/settlement/places.ts`

Current blacksmith mapping:

```ts
case 'blacksmith':
  return {
    id: `${settlementId}:workplace:blacksmith`,
    type: 'workplace',
    position: landmarks.blacksmith,
  }
```

This encodes a settlement-wide singleton workplace.

Other roles deliberately remain communal/world anchored (garden, dock, well, stockpile, market, trees). Keep that distinction; do not make every workplace household-owned.

The `Place` abstraction is already the NPC-facing API. Extend its resolver boundary rather than introducing another workplace representation visible to `NpcAgent`.

### `src/settlement/villagePlan.ts`

`VillagePlot` already carries `familyIndex` / family ownership for house plots. `VillagePlan` is the authoritative plain-data settlement layout.

There is currently no blacksmith landmark kind in the plan, which is appropriate if blacksmith equipment becomes a child of a household yard rather than an independent settlement landmark.

Do not add a global `blacksmith` landmark to `VillagePlan` merely to preserve the old singleton shape.

### `src/settlement/villagePlanner.ts`

Plan settlements-npcs-011 already established shared plot spacing/fallback logic and fixed the old unconstrained non-house fallback path.

Stage 2 profession-aware sizing should extend this existing plot/yard spacing mechanism. Do not add an occupancy grid or separate placement manager.

Before changing planner constants, inspect the current `HOUSE_PLOT_RADIUS`, plot scorer/spacing checks and tests to determine whether per-family radius can be threaded without broad global inflation.

### Tests

Relevant existing coverage likely includes:

- `src/settlement/places.test.ts` for role → workplace mappings;
- village planner / household yard tests added by settlements-npcs-011;
- props/settlement tests if present for landmark construction.

Add focused regression coverage near the owning module rather than a large end-to-end fixture if the behavior can be proved from pure geometry/data.

## Existing plans to preserve

### `settlements-npcs-002`

Introduced blacksmith as a real profession with an anvil + grind workbench workplace. Preserve the profession work behavior and sharpening logic; this plan changes workplace ownership/existence/placement, not the work mechanic itself.

### `settlements-npcs-011`

Established household yard clearance as a shared contract and explicitly avoided new `YardManager` / `SettlementAreaManager` style abstractions. Stage 2 should extend that contract instead of creating a parallel spatial system.

## Stage 1 implementation order

A useful order that minimizes churn:

1. Introduce a blacksmith workplace representation keyed by family/home/household identity rather than a single `landmarks.blacksmith` vector.
2. Make `buildSettlementProps()` know which family indices contain a blacksmith (thread only the minimum plain-data input needed).
3. Materialize anvil/workbench only for those indices, using the corresponding house/yard as parent spatial context.
4. Produce an NPC work/interaction anchor for each materialized workplace.
5. Update `workplaceFor()` (or a narrowly adjusted resolver) so the caller supplies the NPC's household/home identity for household-owned professions.
6. Update `createSettlement.ts` to pass that identity from the already-available `home`/`household` in `flatMembers`.
7. Add regression tests for no-blacksmith, correct family yard, and singleton-removal behavior.

Avoid first building a generic profession-equipment registry. Blacksmith is the only required case in Stage 1.

## Stage 2 implementation notes

Profession-aware yard sizing should be driven by family roles before house plot placement.

Trace where `SettlementDef.plan` / `VillagePlan` is generated relative to family generation. If family roles are currently generated after the village plan, do not duplicate or reroll roles inside `VillagePlanner`; instead adjust the generation boundary so the same deterministic family data informs both population and layout, or introduce the smallest plain-data requirements seam between the two owners.

This ordering is the main architectural question to verify before Stage 2 coding.

A likely target shape is conceptually:

```text
family roles
  → pure household yard requirements
  → required radius/clearance per familyIndex
  → VillagePlanner house plot spacing
  → props consume the reserved yard
```

Keep the planner unaware of Three.js objects and GLB assets.

## Spatial pitfalls

- Existing common yard props use outward radial placement from the settlement core. A blacksmith arrangement placed on the same ray may overlap household storage; assign separate deterministic local slots/sectors.
- The NPC work anchor should be in reachable free space beside the equipment, not at the anvil mesh center.
- If multiple members of the same household are blacksmiths, they should share one household workplace unless gameplay semantics explicitly require otherwise.
- If multiple households contain blacksmiths, each needs its own workplace identity/anchor.
- Do not solve the original campfire overlap with a one-off `avoid(campfire)` rule. The fix is that blacksmith equipment belongs inside an already-reserved household yard.
- Preserve deterministic random streams where practical; avoid inserting unrelated `coreRandom()` calls that shift all later settlement prop variation if a local deterministic seed can isolate blacksmith layout.

## Audit boundary

`props.ts` also creates market and notice board unconditionally. Record their classification while touching the code, but do not migrate them automatically:

- market can legitimately be communal settlement infrastructure;
- notice board is settlement infrastructure used by Work Contracts;
- blacksmith equipment is clearly profession/household-owned under this plan.

This distinction prevents the fix from turning into a broad unrelated settlement-prop rewrite.

## Documentation / preflight

If introducing an architectural helper for profession yard requirements or household-owned workplace resolution, add JSDoc describing ownership/lifecycle and use `@domain settlements-npcs` where useful for preflight discovery.

Do not run `pnpm docs:sync`; GitHub workflow handles documentation synchronization.
