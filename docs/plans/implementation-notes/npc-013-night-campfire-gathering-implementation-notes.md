# Implementation Notes: NPC night campfire gathering

**Plan:** `npc-013-night-campfire-gathering.md`
**Reviewed:** 2026-09-02

## Current-state review

Dependency plan 151 is already implemented. The current code already has the complete Social Place/campfire path:

- `places.ts::socialPlaceFor()` wraps the settlement's existing `landmarks.campfire`; it does not own the fire.
- `NpcAgent.socialPlace` is injected at construction and `effectiveScheduleFor(..., { hasSocialPlace })` turns the `sociable` trait's evening `home` block into a short `social` block.
- `NpcAgent.beginIdle()` already routes scheduled `social` to the Social Place and then uses `wanderNear()`; no campfire-specific FSM is needed.
- `createSettlement.ts` calls `advanceSocialPairing()` after all NPC updates, using the settlement's existing NPC array.
- `socialBehaviour.ts::advanceSocialPairing()` already handles same-place pairing, reservation, shared conversation duration/outcome and NPC↔NPC relationship updates.
- `VillageFire.isLit()` is the authoritative runtime fire state. The current `Place` type contains only id/type/position, so the Social Place currently represents existence, not availability/lit state.

The important gap is therefore **decision-time opportunity selection**. Today, a non-`sociable` NPC whose schedule is `home` never gets a campfire option; and even a `sociable` NPC can be routed to the campfire solely because its schedule says `social`, without checking `VillageFire.isLit()`.

## Recommended implementation

### 1. Keep `NeedId` and schedule unchanged

Do not add a `campfire` Need or a new `ScheduleActivity`.

The existing `generateNeedPressures()` → `scoreNeedCandidates()` → `pickActionKind()` arbitration already gives the required pressure gate: when a meaningful need wins, campfire leisure is not considered.

When the selected need is `idle`, add a small, explicit **night opportunity check** before `beginIdle(scheduledActivity)`. The result should only choose the existing `social` route; it must not modify the pressure list or create a parallel arbitration layer.

Prefer a small pure helper for the testable part, e.g. a function answering whether the current time is in the intended night-leisure window. Keep the actual fire/place lookup in `NpcAgent`, where the existing `socialPlace` is already owned.

### 2. Campfire availability must be live

Do not treat `socialPlace != null` as equivalent to an active campfire. `socialPlaceFor()` is constructed once, while `VillageFire.isLit()` changes during play.

The cleanest integration is to expose availability on the existing Social Place rather than passing `VillageFire` through the whole NPC stack. If extending `Place`, keep the field optional/generic (for example an `isAvailable` predicate) and use it only where dynamic availability matters. Alternatively, add a narrowly scoped NPC callback if that fits the current constructor seams better. Do **not** add a campfire registry or manager.

The availability check must happen when the NPC decides and when a scheduled social action starts. A fire may go out after the NPC has arrived; the next normal decision should then leave the place.

### 3. Do not make `sociable` a prerequisite

The existing schedule overlay is intentionally trait-driven, but npc-013 requires the campfire to be an opportunity for any NPC.

Keep `sociable` as an influence on existing social behaviour/schedule, not as a hard eligibility test. A non-sociable NPC can receive the night campfire opportunity when idle; a sociable NPC may reach it through the existing scheduled `social` activity.

Avoid adding another personality scoring system. If a personality influence is desired, reuse the existing social/sociable semantics rather than introducing a new trait or pressure.

### 4. Resolve “reasonable travel” locally

There is currently no generic Social Place proximity API. Do not create one just for this plan.

Use the NPC's current position and the campfire position with a small bounded distance gate at decision time. Keep the threshold as a named tuning constant and document why it is a **maximum willingness-to-travel for leisure**, not a pathfinding distance.

Actual movement must still use the existing `startAction()` → `goTo`/navigation path. Do not replace navigation with straight-line teleporting or a second proximity system.

If the existing code already exposes a suitable local-radius helper while implementing, reuse it instead of adding another distance function.

### 5. Reuse the existing social action path

The resulting choice should call the same `beginIdle('social')` path already used by scheduled social activity.

This gives:

`social` → `startAction(kind: 'social')` → campfire Place → `wanderNear()` → `socialCandidate()` → `advanceSocialPairing()`

Do not create a new action id, FSM phase, gathering manager, group state or campfire-specific conversation system.

### 6. Leaving / interruption

There is already a useful lifecycle boundary: `choose` runs again after a completed action, while `tickCriticalInterrupt()` can interrupt in-flight `goTo`/`execute` actions for genuinely critical needs.

Do not add a campfire-specific interrupt loop.

For the new idle opportunity, make sure the next `choose` reevaluates the current schedule and fire availability. The existing `settledIdleActivity` handling already clears a previous `social` state when the scheduled activity changes, so preserve that mechanism rather than adding another timer.

Note that ordinary schedule changes currently **do not interrupt an action already in flight**. This is existing architecture and should not be changed as part of npc-013.

### 7. Night definition needs an explicit decision

The plan says “night” but does not define exact hours. Do not infer it from `NIGHT_FIRE_THRESHOLD` in `createSettlement.ts`: that threshold controls the settlement fire's dusk ignition logic and is not an NPC leisure-window API.

Likewise, do not use the sleep schedule itself as the definition of night.

Choose a bounded night/evening window appropriate to the current schedule and make it a named constant/helper. The implementation should allow campfire leisure before normal sleep, while avoiding daytime campfire routing. Keep this independent of the fire's ignition threshold.

### 8. Weather dependency

`npc-012-weather-reaction-and-shelter.md` is still planned; it is not current functionality. Do not add shelter/weather behaviour to npc-013.

The intended future integration is already naturally supported: if npc-012 adds a stronger pressure/interrupt path, that pressure should win before the idle campfire opportunity is considered.

### 9. Performance / simulation

`advanceSocialPairing()` currently receives the settlement's existing NPC array and calls `socialCandidate()` every settlement update, but the candidate method itself is throttled by `nextSocialAttemptSim`. Preserve this.

The new campfire decision must be evaluated only from the existing NPC decision cadence, not every frame. Do not scan all NPCs near the fire; pairing already operates on the settlement-local list.

No worker, global registry, per-frame campfire search or render-distance condition is appropriate.

## Important pitfalls

- **Fire state is dynamic:** `socialPlaceFor()` currently only proves that a campfire prop exists. It does not prove `isLit()`.
- **Do not change `effectiveScheduleFor()` to make every NPC social at night.** That would turn an opportunity into a schedule rule and would unnecessarily alter existing daily routines.
- **Do not put campfire preference into `Needs.ts`.** Campfire is explicitly not a Need.
- **Do not use the player/camera position** for eligibility. NPC simulation must remain independent of the observer.
- **Do not add a second social pairing pass.** The existing post-NPC-update `advanceSocialPairing()` is the correct owner.
- **Do not overfit to plan 151's current `social` schedule.** npc-013 is specifically about making the existing Social Place available as a night opportunity beyond the sociable-only schedule overlay.
- The current `CurrentActivityKind` already treats `social` as idle and `conversation` as talking; no diagnostic category is required unless the implementation introduces genuinely new state.

## Useful verification focus

Unit-test the new pure night/opportunity gating around:
- daytime → unavailable,
- night + no fire → unavailable,
- night + unlit fire → unavailable,
- night + lit fire + within travel threshold → available,
- night + lit fire + too far → unavailable.

Then verify that an active hunger/thirst/duty pressure still selects its existing action instead of campfire, while an idle NPC can use the existing Social Place and eventually pair through `advanceSocialPairing()`.

