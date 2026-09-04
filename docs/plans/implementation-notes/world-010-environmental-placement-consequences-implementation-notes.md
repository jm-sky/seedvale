# Implementation Notes: Environmental Placement Consequences

**Plan:** world-010-environmental-placement-consequences.md
**Reviewed:** 2026-09-04
**Status:** planned

## 1. Current ownership

The hard ground-placement validation is currently owned by:

`src/items/tentPlacement.ts`

The central pure validator is:

```ts
evaluateGroundPlacement(input: GroundPlacementInput): GroundPlacementReason
```

It currently evaluates, in order:

1. water,
2. slope,
3. separation from same-family peers,
4. blockers/objects,
5. `ok`.

The validator is deliberately free of Three.js/runtime scene state.

`evaluateTentPlacement()` is a thin object-specific wrapper around the shared validator.

## 2. Current water restriction

`tentPlacement.ts` currently defines:

```ts
export const WATER_MARGIN = 0.8
```

and `evaluateGroundPlacement()` rejects the site when:

```ts
sampleHeight(x, z) <= waterLevel + WATER_MARGIN
```

This is a **water/terrain geometry restriction**, not weather wetness.

Do not reinterpret this condition as `SurfaceWeatherState.wetness`.

## 3. Important shared use of WATER_MARGIN

`src/terrain/terrainPreparation.ts` imports:

```ts
import { WATER_MARGIN } from '../items/tentPlacement'
```

and uses the same `WATER_MARGIN` when validating every affected terrain sample.

Therefore the existing `WATER_MARGIN = 0.8` currently has at least two consumers:

* player ground placement,
* terrain preparation.

The implementation must not simply reduce `WATER_MARGIN` globally.

The existing terrain-preparation behaviour must retain its current shoreline clearance.

The cleanest minimal direction is to preserve `WATER_MARGIN` for its existing terrain use and introduce a separate placement-specific value for `evaluateGroundPlacement()`.

## 4. Shared placement contract

`src/app/actions/placementActions.ts` already provides the shared placement seam:

```ts
GroundPlacementDefinition
evaluatePlacementSite()
previewGroundPlacement()
```

`previewGroundPlacement()` resolves the current aim and calls the supplied `evaluate()` function.

Final placement actions resolve and validate again at confirmation/completion rather than trusting preview state.

Do not create another placement-validation system.

The water-margin change belongs at the existing `evaluateGroundPlacement()` boundary so all callers using that validator receive the same rule.

## 5. Scope of shared ground placement

`evaluateGroundPlacement()` is shared by multiple placement families, including the currently implemented tent, trap, well, chest, garden/crop, standing torch, palisade, bedroll and platform paths through their existing wrappers/definitions.

The exact current call sites should be verified during implementation rather than copied into new architecture.

A single shared placement water margin is intentional for V1.

Do not introduce per-object water margins unless current code proves that an object bypasses the shared validator or has an explicit gameplay requirement that cannot use the common rule.

## 6. Critical footprint finding

The current validator does **not** perform a footprint-aware water test.

The current water check samples only:

```ts
sampleHeight(x, z)
```

at the placement centre.

The `footprintRadius` input is currently used for blocker clearance:

```ts
distance < blocker.radius + footprintRadius
```

but it is not used by the water check.

This is important for implementation:

> A smaller shoreline margin must not accidentally allow a large object to have its centre on land while part of its physical footprint enters water.

If the final implementation requires footprint-aware water protection, extend/reuse the existing placement geometry mechanism rather than introducing a second independent placement system.

Do not duplicate footprint semantics in a separate water validator.

The exact sampling/geometry method should be chosen from the existing terrain/placement abstractions after checking their available capabilities.

## 7. Slope remains independent

The current slope check is:

```ts
maxSlopeDelta(x, z, sampleHeight) > SLOPE_MAX_DELTA
```

with:

```ts
const SLOPE_SAMPLE = 1.6
const SLOPE_MAX_DELTA = 0.75
```

The shoreline change must not modify these values or their semantics.

Expected distinction:

```text
near shoreline + acceptable slope
    → potentially valid

near shoreline + excessive slope
    → slope

water / forbidden shoreline area
    → water
```

Water and slope are separate physical restrictions.

## 8. Blockers and separation remain unchanged

The existing validator separately checks:

* same-family peer separation,
* blockers,
* blocker radius,
* object footprint radius.

`placementActions.ts` supplies blockers such as nearby trees, settlement wells and houses for the relevant placement definitions.

Do not change these distances or blocker semantics as part of this fix.

## 9. Preview/final placement

The shared placement contract in `placementActions.ts` is already the correct integration point.

Preview:

```text
aim
 ↓
evaluatePlacementSite()
 ↓
evaluateGroundPlacement() / object wrapper
 ↓
PlacementPreviewResult
```

Final placement re-resolves the site and validates again.

The new placement water margin must therefore live in the shared evaluation path, not in preview-only code.

Do not cache preview environmental/terrain validation as authoritative state.

## 10. Current test coverage

`src/items/tentPlacement.test.ts` already tests the shared tent wrapper for:

* valid flat ground,
* water/shoreline rejection,
* steep slope rejection,
* road placement,
* tent separation,
* blocker collision.

The existing shoreline test uses:

```ts
sampleHeight: () => 0.2
waterLevel: 0
```

and expects `water`.

Extend this test area to cover the new boundary rather than creating a separate test suite for a parallel validator.

Tests should establish both sides of the new placement margin:

```text
inside placement water margin
    → water

outside placement water margin
    → potentially ok
```

with slope/blocker conditions controlled so the result is testing water semantics only.

Also add coverage for the footprint-water case if the implementation changes the validator to enforce it.

## 11. Minimal implementation direction

Recommended implementation order:

1. Confirm all current `WATER_MARGIN` consumers.
2. Preserve `WATER_MARGIN = 0.8` for existing terrain-preparation semantics.
3. Introduce a separate placement-specific water margin following existing project naming conventions.
4. Make `evaluateGroundPlacement()` use the placement-specific margin.
5. Verify every existing shared ground-placement caller automatically receives the new rule.
6. Address footprint-vs-water protection using the existing placement/terrain geometry mechanisms; do not create a second validator.
7. Leave slope, peer separation and blockers untouched.
8. Update/add focused unit tests around the new water boundary and footprint behaviour.
9. Verify preview and final placement remain driven by the same evaluation path.

## 12. Choosing the new value

Do not blindly choose a value only because it is numerically smaller than `0.8`.

The new margin should be a **small physical clearance above the water boundary**, not a broad shoreline exclusion zone.

Use existing world units and the actual placement footprint sizes when selecting it.

The implementation should make the constant easy to retune without changing validation structure.

## 13. Weather is not involved

`src/world/weather.ts` and `SurfaceWeatherState.wetness` are not part of this fix.

Do not:

* add weather checks to `evaluateGroundPlacement()`,
* add a per-object weather ticker,
* create a generic environmental-effects manager,
* introduce soil moisture simulation,
* turn rain wetness into a placement restriction.

The observed problem is the current `waterLevel + WATER_MARGIN` geometry check.

## 14. Architectural constraints

Do not introduce:

* a new placement manager,
* a second ground-placement validator,
* per-object water validation copies,
* per-object shoreline margins in V1,
* a weather-placement subsystem,
* duplicated footprint calculations.

Reuse the existing pure placement validator and the existing `GroundPlacementDefinition` / `evaluatePlacementSite()` contract.

## 15. Documentation

If the implementation changes the meaning or ownership of `WATER_MARGIN`, update its JSDoc.

The current JSDoc explicitly says that `WATER_MARGIN` is the shoreline clearance shared with terrain preparation, so it will become inaccurate if the constant's role changes.

Any new placement-specific constant should have concise JSDoc explaining that it is the physical water-clearance rule for player ground placement.

For important architectural/public functions changed or introduced by the implementation, add JSDoc when useful for preflight discovery and prefer `@domain` where appropriate.

## 16. Verification focus

The most important regression cases are:

```text
old 0.8 zone + outside new placement margin
    → placement can become valid

inside new placement margin
    → water

actual water / forbidden area
    → water

large footprint crossing water
    → rejected

near water + steep terrain
    → slope

near water + blocker
    → object

preview result
    ==
final placement validation
```

Also verify that terrain preparation still behaves exactly as before with its existing `WATER_MARGIN`.

## 17. Recon conclusion

The original plan was incorrectly framed around environmental wetness.

The current code shows that the concrete gameplay issue is a **shared geometric shoreline-clearance rule**.

The smallest coherent implementation is therefore:

```text
terrain WATER_MARGIN = existing 0.8
                 │
                 └── terrain preparation keeps current behaviour

player placement
                 │
                 └── new smaller shared placement water margin
                         │
                         ├── slope unchanged
                         ├── blockers unchanged
                         ├── separation unchanged
                         └── footprint must not enter forbidden water
```

No broader environmental-system work is justified by the current code.

**Zrób git commit i push do main, rebase jeżeli trzeba**
