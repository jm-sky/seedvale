# Plan: Perception-driven observation and information levels

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** npc-019, fauna-017
**Domain:** `npc`
**Subdomains:** `behavior` `lifecycle`
**Tags:** `spea` `perception` `observation`
**Roadmap:** `physical-attributes-health-and-medicine`

## Goal

Introduce the first gameplay consumer of **Perception** through a reusable observation mechanism used by the Player when observing NPCs and animals.

Perception should determine how much useful information an observer can obtain about a target under the current observation context.

Conceptually:

```text
observer effective Perception
+ distance
+ target context
→ observation level
→ information available about the target
```

The first visible consumer is the existing floating NPC/fauna label and status presentation.

This must not become a UI-only distance bonus. The observation result should be a reusable simulation concept that future plans can use for NPC awareness, animal detection, hunting, medical assessment and other perception-driven decisions.

## Dependencies

Use the shared SPEA/effective-attribute foundation from `npc-019`; do not create Player-only Perception state.

`fauna-017` must be finalized and its accepted refactor completed before implementing the fauna side of this plan, or explicitly closed without production refactor if its review concludes `KEEP AS IS`.

After `fauna-017`, inspect the resulting `AnimalAgent` ownership and presentation seams and integrate with that architecture rather than assumptions from pre-refactor code.

## Design principles

### Perception describes observation capability

Perception does not directly mean:

```text
larger label distance
```

or:

```text
detectionRange *= perception
```

Instead, Perception contributes to resolving how successfully an observer can perceive useful information about a target.

Different future consumers may interpret observation differently, but they should share the same basic semantics rather than inventing unrelated Perception multipliers.

### `0.5` remains the neutral reference

As with other SPEA consumers:

- `Perception = 0.5` represents the normal healthy-adult reference,
- existing nearby-label usefulness around `0.5` should remain broadly familiar,
- Player starting `Perception = 0.6` should provide a modest visible advantage,
- low or high values should not create extreme or implausible information ranges.

### Observation is not knowledge

Keep separate:

```text
observation
→ what the observer can currently perceive

knowledge / relationship / memory
→ what the observer already knows about the target
```

High Perception must not magically reveal an unknown NPC's personal name.

Do not encode a rule such as:

```text
high Perception → know NPC name
```

Persistent acquaintance/recognition belongs to a separate knowledge/relationship mechanism.

### Observation and presentation are separate

For the first slice, keep the rule simple:

```text
Perception + distance
→ observation level

gaze
→ presentation emphasis / opacity
```

The existing gaze cone should continue to affect how strongly a label is presented, not make the observer suddenly gain or lose semantic knowledge when crossing a view-angle threshold.

A later observation-context plan may deliberately incorporate richer visibility inputs if justified.

## Observation levels

Introduce a small ordered observation result rather than arbitrary UI flags.

The exact representation should follow the implemented architecture, but conceptually:

```text
none
basic
assessed
detailed
```

### `none`

No observation-derived identity/status information is available.

The world model remains rendered and simulated normally. This level must not hide unrelated quest markers, interaction/debug markers or other presentation owned by separate systems.

### `basic`

Enough information to recognise the broad visible target category.

Examples:

- NPC: person / other already visually obvious broad category,
- fauna: species or broad animal identity where that information is visually justified.

Do not make personal NPC names part of the observation-level contract.

### `assessed`

The observer can make a useful **qualitative** assessment of physical state.

Initial scope:

Health:

```text
healthy
hurt
badly wounded
critical
```

Stamina:

```text
fresh
tired
exhausted
```

These are derived views over authoritative runtime values, not new persisted state.

Do not add qualitative Vigor, satiety or hydration assessment in this first plan unless current code after dependency implementation proves it is required for coherent existing presentation.

### `detailed`

The observer has enough information for the currently available detailed status presentation.

This may expose the existing relevant status bars for NPCs and animals.

Do not introduce new biological information solely because the level exists.

## Player observation vertical slice

The first implementation is deliberately:

```text
Player
  ↓ observes
NPC + Animal
```

Do not yet make NPCs or animals generic observers.

Use the Player's effective Perception and current target distance to resolve the observation level for each relevant NPC/fauna target.

Reuse the information already present in the agent presentation/update pipeline. Do not create a second global label-distance scan.

## NPC and animal presentation

Use the existing/post-`fauna-017` floating agent-status presentation seam.

Conceptually:

```text
none
→ no observation-owned identity/status information

basic
→ broad identity/species-level information

assessed
→ broad identity + qualitative health/stamina assessment

detailed
→ current detailed status presentation
```

Avoid implementing independent Perception rules inside `NpcAgent` and `AnimalAgent`.

The observation policy should be shared; target types may expose different observable data.

## Debug label information

Debugging must never be obstructed by gameplay Perception gating.

When debug mode is enabled, provide a dedicated **`Full label info`** debug control using the existing debug/lil-gui mechanism rather than creating a parallel debug UI.

Required semantics:

- available only in debug context,
- default **ON** in debug mode,
- when ON, NPC and animal labels show their full existing debug/status information regardless of Perception, observation level or normal information-distance gating,
- when OFF, labels use the same Perception/observation rules as normal gameplay so the feature can be tested without leaving debug mode,
- this bypass affects information gating only; it must not modify simulation state, SPEA values or target health/stamina,
- existing debug-only diagnostic lines remain available and must not accidentally become gated by Player Perception.

Prefer one focused toggle for this plan. Do not build a broader new label-debug settings section unless the current debug GUI architecture already has a natural grouping that makes this trivial and avoids duplicated controls.

## Qualitative physical-state assessment

Health/Stamina categories should derive from authoritative values through small shared pure helpers where useful.

Do not duplicate HP, Stamina or other physical state.

The exact thresholds should be shared where semantics are intended to be the same for Player-observed NPCs and animals.

## Threshold stability

Observation-level transitions must remain visually stable around boundaries.

Avoid visible rapid switching such as:

```text
assessed ↔ detailed ↔ assessed
```

when the Player or target moves slightly near a threshold.

Use a small hysteresis, quantization or an equivalent inexpensive stability mechanism where necessary. Keep the mechanism derived and non-persistent.

## Future observer reuse

Design the observation result so later plans can reuse the concept for:

```text
NPC → animal threat
NPC → wounded NPC
NPC → social target
animal → predator/prey
animal → human threat
hunter → prey
healer → patient
```

This plan does not implement those consumers.

A future simulation consumer should be able to call a small pure observation resolver without depending on CSS, DOM or Three.js label objects.

## Non-goals

Do not implement in this plan:

- NPC threat-awareness changes,
- animal threat/detection changes,
- predator/prey detection changes,
- hunting mechanics,
- ranged accuracy,
- resource or track discovery,
- hearing,
- smell,
- explicit sensory-channel modelling,
- line-of-sight raycasting or terrain/building occlusion,
- lighting/weather visibility penalties,
- persistent recognition or acquaintance memory,
- relationship-based identity knowledge,
- medical diagnosis,
- disease detection,
- condition-specific perception rules,
- generic world-object observation,
- exact numeric HP/Stamina text,
- a global `perceptionMultiplier`,
- a universal `detectionRange`,
- changes to fauna species sensory baselines,
- a new generic observation/perception manager,
- a new standalone debug-label UI system.

## Architecture constraints

- Reuse effective SPEA resolution from `npc-019`.
- Reuse the post-`fauna-017` NPC/fauna presentation architecture.
- Keep observation resolution independent of DOM/CSS presentation.
- Prefer a small pure resolver with explicit inputs and an ordered result.
- Do not create an `ObservationManager` or `PerceptionManager`.
- Do not persist observation levels; they are derived from current observer/target/context state.
- Do not duplicate HP, Stamina, Vigor or animal need state for presentation.
- Keep species-specific sensory capabilities separate from relative Perception.
- Reuse the existing debug/lil-gui mechanism for `Full label info`.
- Add JSDoc for important shared observation/public APIs; use `@domain npc` where useful for preflight discovery.

## Performance

Observation may be evaluated for agents already participating in the existing update/presentation pipeline, so keep the first implementation cheap.

Prefer:

- pure arithmetic,
- already-available distance values where appropriate,
- no new global per-frame scan of every NPC/animal,
- no per-frame allocations in agent hot paths,
- no raycast per target in this phase,
- DOM writes only when observation level or displayed derived state changes,
- cheap threshold-stability logic.

Do not introduce a worker. The first observation resolver should be far cheaper than worker communication overhead.

## Verification

Automated tests should cover at least:

- neutral `Perception = 0.5`,
- higher Perception improves observation capability,
- lower Perception reduces it,
- bounded behavior at `0.0` and `1.0`,
- Player `0.6` has a modest advantage over neutral `0.5`,
- distance reduces observation capability,
- observation levels are monotonic and deterministic,
- threshold stability avoids trivial oscillation where applicable,
- qualitative HP/Stamina categories derive correctly from authoritative values,
- NPC and animal targets use the same observation-level semantics,
- observation resolution contains no UI/DOM dependency,
- `Full label info = ON` bypasses observation gating in debug mode,
- `Full label info = OFF` restores normal observation gating while remaining in debug mode,
- existing debug diagnostic label information remains available,
- existing label, NPC and fauna tests remain green.

## Manual verification

Manual browser verification is performed by the User.

Check several NPCs and animals while:

- approaching from far away,
- moving through observation thresholds,
- looking directly toward them and then away to confirm gaze remains presentation emphasis rather than semantic observation gating,
- comparing the Player's normal `0.6` Perception with a neutral/debug `0.5` case if convenient,
- toggling debug `Full label info` ON/OFF.

Verify especially that:

- nearby labels remain readable and useful,
- status information appears progressively rather than all at once,
- detailed status bars are gated by sufficient observation in gameplay,
- Player `0.6` feels slightly better than neutral rather than dramatically stronger,
- NPC and fauna presentation feels coherent,
- label fade transitions remain visually smooth,
- observation thresholds do not visibly flicker,
- debug `Full label info = ON` always exposes the full label/debug information needed for diagnosis,
- switching the debug toggle OFF allows normal Perception behavior to be inspected immediately.

## Completion criteria

- Effective Player Perception has a real gameplay consumer.
- Player can observe both NPCs and animals through one shared observation-level concept.
- Observation level depends at least on effective Perception and distance.
- Gaze remains presentation emphasis in this first slice rather than semantic information gating.
- `Perception = 0.5` remains broadly neutral relative to existing nearby label usefulness.
- Player `Perception = 0.6` gains a modest observation advantage.
- Qualitative HP/Stamina assessment exists between basic identity and detailed status bars.
- Existing detailed status bars become gated by sufficient observation rather than distance alone.
- Observation and target knowledge remain conceptually separate.
- Debug mode provides a `Full label info` ON/OFF control, default ON, that bypasses observation gating without changing simulation state.
- The resolver is reusable by future NPC/fauna simulation consumers and does not depend on DOM/UI.
- No NPC/fauna threat detection, sensory-channel simulation or persistent knowledge system is introduced.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
