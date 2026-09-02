# Plan: Player-Built Sleeping Utilities

**Created:** 2026-09-02
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** `items-player-009` `items-player-010`
**Domain:** `items-player`
**Roadmap:** `docs/roadmap/player-construction.md`

## Goal

Add player-built sleeping utilities that improve rest and sleep quality while extending the existing camp rest and construction systems.

The plan covers:

- Leather Bedroll
- Raised Sleeping Platform
- environmental degradation of exposed sleeping utilities

A player-built drying rack is intentionally outside this plan because the existing drying-rack processing mechanism should be addressed separately.

## Recon findings

The current codebase already provides the mechanisms needed as integration points:

- camp rest uses `CampRestContext`, `campRestQuality()` and `restoreNeedsFromSleep()`,
- tents and fires are persistent world objects,
- player-built objects are owned by the world bundle rather than `PlayerController`,
- construction material requirements already integrate with inventory and dropped items,
- the existing fire system already has a persistent grate construction, so a new roasting-rack system is unnecessary,
- settlement drying racks and `TimedProcess` already implement meat/fish drying,
- blood traces already use elapsed-world-time and rain exposure for weather-driven fading,
- there is no general-purpose condition/durability/environmental-decay system that should be duplicated solely for these objects.

## Bedroll

Add a player-placeable bedroll as a sleeping utility.

### Initial variant

The initial implementation uses `leather`.

The representation should keep the material/variant explicit enough to support future alternatives without redesigning the object:

- linen,
- straw/moss,
- fur,
- other suitable materials.

Those variants are out of scope for this plan.

### Behaviour

A bedroll:

- is a persistent world object,
- can be placed as a normal player-built utility,
- can be used as a sleeping/resting surface,
- improves camp rest/sleep quality through the existing camp-rest mechanism,
- remains in the world when the tent is packed,
- is not stored as player-only state.

Do not create a separate sleep-quality or recovery system.

## Raised Sleeping Platform

Add a simple player-built platform that raises the sleeping surface above the ground.

### Initial material

The initial implementation uses `branches`.

Future stronger variants may use materials such as `beams`, but those are out of scope.

### Behaviour

The platform:

- is a persistent world object,
- can be placed independently of the tent,
- can support a bedroll,
- improves the sleeping setup when combined with a bedroll,
- remains in the world when the tent is packed.

The platform itself should not become a separate full sleeping/recovery system. Its effect should be represented through the existing camp-rest model.

## Camp rest integration

Extend the existing:

```
CampRestContext
    ↓
campRestQuality()
    ↓
restoreNeedsFromSleep()
```

rather than introducing a new player-specific sleep mechanism.

The intended progression is:

```
tent
  → basic rest

tent + fire
  → improved camp rest

tent + bedroll
  → improved sleeping surface

tent + fire + bedroll
  → high quality camp rest

tent + fire + platform + bedroll
  → further improved camp rest
```

Exact quality values should be chosen against the existing `campRestQuality()` model during implementation rather than hard-coded by this plan.

A bedroll/platform may exist outside a tent, but their benefits should reflect whether the sleeping setup has actual shelter and warmth. Do not make a platform by itself equivalent to lodging.

## Independence from tent

Treat these as separate world objects:

```
Tent
Bedroll
Raised Sleeping Platform
Campfire
```

Packing/removing the tent must not remove or reset the bedroll or platform.

This allows the player to leave a prepared campsite, move the tent, and later reuse the prepared sleeping area.

## Environmental degradation

Sleeping utilities left exposed in the world should deteriorate over time.

Use the existing weather/time patterns as the integration point rather than introducing per-frame durability updates.

At minimum account for:

- rain,
- snow.

Fog should not cause degradation unless an existing weather model later provides an explicit reason.

### Exposure

A sleeping utility under a deployed tent should receive reduced or no direct weather exposure according to the actual shelter representation.

When left without a tent:

```
no shelter
    ↓
weather exposure
    ↓
faster deterioration
```

The exact rates should be balanced during implementation.

### Existing blood-trace mechanism

The implementation must first inspect and reuse the existing rain-exposure calculation used by blood traces where technically appropriate.

Do not create a second, parallel weather-decay framework merely for bedrolls and platforms.

There is currently no confirmed general `Condition`/`EnvironmentalDecay` abstraction. If the existing blood-trace exposure mechanism is too specialized to reuse cleanly, keep the new degradation logic local and avoid premature global abstraction.

## Persistence

Use the existing world-owned persistence architecture.

Persist all state required to reconstruct the objects and their behaviour, including as applicable:

- position,
- orientation,
- material/variant,
- condition/degradation state.

Do not store the objects in `PlayerController` state.

## Scope

### In scope

- Leather Bedroll
- Raised Sleeping Platform using branches
- player placement
- construction materials
- persistence
- camp-rest integration
- weather exposure/degradation
- tent/shelter interaction

### Out of scope

- linen/straw/moss/fur variants
- new materials
- new weather types
- pillows or other bedding
- a new sleep simulation system
- a general durability framework
- roasting rack/grill
- drying rack
- smokehouse or advanced preservation

## Verification

Manually verify:

1. Bedroll can be constructed and placed.
2. Raised sleeping platform can be constructed and placed.
3. Bedroll affects the existing camp-rest/sleep recovery calculation.
4. Platform affects the sleeping setup only through the existing camp-rest model.
5. Bedroll works on a raised platform.
6. Tent, fire and sleeping utilities combine correctly.
7. Packing the tent leaves the bedroll and platform in the world.
8. Bedroll/platform can remain as a prepared campsite without the tent.
9. Exposed utilities deteriorate over world time.
10. Rain and snow affect deterioration as intended.
11. Shelter reduces exposure.
12. Degradation state survives save/load.
13. Utilities remain world-owned and do not depend on the player being present.
14. Existing tent, fire and camp-rest behaviour remains intact.

## Future extensions

Potential follow-up work:

- linen, straw/moss and fur bedroll variants,
- stronger platform variants using beams,
- additional sleeping furniture,
- broader reuse of environmental degradation if more world objects require it.

## Relevant systems/files

Implementation should inspect and extend the current implementations rather than creating parallel systems, particularly:

- `src/app/campRest.ts`
- `src/world/weather.ts`
- blood-trace lifecycle/exposure implementation
- world-bundle persistence for placed world objects
- existing player construction/placement and construction-material helpers
- existing tent and fire implementations

> **Zrób git commit i push do main, rebase jeżeli trzeba**
