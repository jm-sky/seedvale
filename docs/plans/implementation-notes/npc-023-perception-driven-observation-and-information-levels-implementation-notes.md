# Implementation Notes: npc-023 — Perception-driven observation and information levels

These notes reflect the current `main` codebase and are intended to remove implementation-time recon.

## Current-state findings

- `npc-019` is implemented: `src/shared/PhysicalAttributes.ts` owns the shared SPEA shape and `PlayerController.attributes` uses it. Perception is still data-only.
- There is currently **no generic effective-Perception resolver**. The plan wording about reusing “effective Perception” is ahead of the implementation. For this slice, Player observation should read `player.attributes.perception` directly unless another attribute-modifier plan lands first. Do not introduce a generic modifier stack only for npc-023.
- `fauna-017-animal-agent-refactor.md` is still `draft` and its required `docs/reviews/2026-09-03--AnimalAgent-refactor-review.md` does not exist on current `main`. Treat fauna-side integration as blocked by that dependency unless fauna-017 is explicitly closed/finished first. Do not implement against a guessed future AnimalAgent API.
- NPC/fauna floating labels already share `src/ui/agentStatusLabel.ts::createAgentStatusLabelController()`. It owns guarded DOM updates, bars, debug line, distance opacity and shadow-distance state. This is the presentation seam to extend after observation has been resolved.
- `src/ui/labelDistance.ts` owns only presentation-distance rules (`20` fully readable/bars visible, fade to `0` at `32`) plus NPC gaze opacity. Keep it presentation-only; do not turn it into the semantic observation resolver.
- `NpcAgent` already imports `createAgentStatusLabelController()` and `gazeOpacityFactor()`. Preserve gaze as an opacity multiplier only.

## Observation ownership

Add a small pure module, preferably `src/simulation/observation.ts`, because the result is intended for later NPC/fauna simulation consumers and must not depend on DOM, Three.js or label code.

Suggested public surface:

```ts
export type ObservationLevel = 'none' | 'basic' | 'assessed' | 'detailed'

export type ObservationInput = {
  perception: number
  distance: number
}

export function resolveObservationLevel(input: ObservationInput): ObservationLevel
```

Do not create `ObservationManager`, observer registries, target wrappers or persistent observation state.

Keep target-specific observable data outside the resolver. The resolver answers only *how well* the observer can currently observe; NPC/fauna presentation decides which already-authoritative fields correspond to that level.

## Initial distance/perception mapping

Preserve the existing neutral label feel around `Perception = 0.5` by anchoring the semantic ranges to the current label distances:

- detailed baseline: `20`
- assessed baseline: `26`
- basic baseline: `32`

Use one bounded, deliberately mild Perception range scale rather than separate arbitrary bonuses per level. A practical v1 mapping is:

```ts
rangeScale = 0.8 + clamp01(perception) * 0.4
```

This gives:

- `0.0 → 0.80×`
- `0.5 → 1.00×`
- `0.6 → 1.04×`
- `1.0 → 1.20×`

Then compare distance against `baseline * rangeScale`. This keeps `0.5` neutral, makes the Player's `0.6` only modestly better, and prevents extreme ranges.

Keep these numbers together in the observation module so later consumers can replace/tune the policy without touching UI code.

## Threshold stability

Do not persist hysteresis state globally. The cheapest integration is caller-local derived state per visible agent:

- retain the previous `ObservationLevel` next to other label presentation cache state;
- when moving to a *worse* level, require roughly `0.75 m` beyond that level's boundary;
- allow promotion immediately when entering the better range.

If implementing this cleanly would require mutable state inside the pure resolver, instead expose a second pure helper accepting `previousLevel`. Keep all stability state runtime-only.

## Qualitative assessment

Add pure shared helpers close to observation/presentation semantics; do not duplicate thresholds in NPC and fauna code.

Recommended initial categories:

```text
Health ratio
>= 0.75  healthy
>= 0.40  hurt
>= 0.15  badly wounded
<  0.15  critical

Stamina ratio
>= 0.60  fresh
>= 0.25  tired
<  0.25  exhausted
```

Read ratios from authoritative `HealthState` / `StaminaState`; never store the qualitative result.

Do not add Vigor, hunger, hydration, satiety or exact numeric text in this plan.

## `AgentStatusLabelController` integration

Do not let the controller calculate Perception or distance thresholds itself. Extend its sync/presentation input with already-resolved information, e.g. an `informationLevel`/presentation descriptor.

Important behavior:

- `none`: hide observation-owned name/status content, but do not affect mesh, quest/interaction/debug markers or shadow logic.
- `basic`: show broad target identity only.
- `assessed`: show broad identity plus qualitative health/stamina text; hide detailed bars.
- `detailed`: preserve the current detailed bars.

The controller already guards DOM writes. Extend that cache pattern so level changes and qualitative-text changes are write-if-changed; avoid rebuilding label DOM or allocating new descriptor objects every frame.

Do not reuse `barsVisibleForDistance()` as the semantic gate after this plan. Its current `20` rule should either become presentation-only for legacy/non-observation users or be bypassed for NPC/fauna bars once `ObservationLevel` owns that decision.

## Identity / names

The current label controller accepts a concrete name string, but observation must not imply personal knowledge.

For NPCs, npc-023 should not attempt to solve acquaintance/recognition. Use a non-personal broad label for `basic`/`assessed` unless an existing caller already provides independently-authorized identity knowledge; reserve the current personal/display name for the existing knowledge path or `detailed` only if that does not accidentally redefine knowledge semantics.

For fauna, species/common animal identity is acceptable where already visually represented by current presentation data.

Do not add relationship-state reads to the observation resolver.

## Debug `Full label info`

`src/ui/createDebugGui.ts` is the existing lil-gui owner. Add the toggle there rather than a new debug UI.

Constraints from current GUI behavior:

- the debug panel can also be exposed by `?gui=1`, so the `Full label info` controller itself must be gated by `isDebugMode()`, not merely by GUI visibility;
- default it to `true` when debug mode is active;
- store it as runtime-only presentation state in the app/composition layer and pass/read it through the existing agent update/presentation path;
- when true, bypass only observation information gating. Continue rendering existing debug diagnostic lines regardless of observation level;
- do not mutate Player attributes or agent physical state.

Avoid putting this flag in persisted `WorldConfig` unless current config ownership changes before implementation; it is explicitly a session-local debug control.

## NPC/fauna integration boundary

For NPCs, integrate where the existing update path already has Player-relative distance and calls the shared label controller. Do not add another world scan.

For fauna, wait for `fauna-017`'s accepted final architecture. If that dependency remains unresolved, implement/test the pure resolver + NPC side and leave fauna-side work blocked rather than editing `AnimalAgent` based on stale assumptions.

The observation API itself must already be target-agnostic so completing fauna later requires only presentation wiring, not a second policy.

## Tests worth adding

Prefer focused pure tests over constructing whole agents:

- observation resolver: exact neutral anchors at `0.5`, monotonicity with distance/perception, `0`/`1` bounds, and `0.6` modestly better than `0.5`;
- hysteresis helper: no immediate downgrade/upgrade chatter around each boundary;
- health/stamina qualitative helpers at every threshold edge;
- label-controller tests only for presentation mapping and debug bypass if the existing DOM test setup makes this cheap.

Keep gaze tests in `labelDistance` behavior; observation-level tests should prove gaze is absent from resolver inputs.

## Implementation order

1. Add pure observation level + qualitative assessment helpers and tests.
2. Extend shared label presentation to consume a resolved information level without owning Perception.
3. Wire Player `attributes.perception` through the existing NPC presentation update path and preserve gaze as opacity-only.
4. Add session-local debug `Full label info` control through `createDebugGui.ts`/composition wiring.
5. Integrate fauna only after `fauna-017` is finalized/closed and re-check its resulting presentation seam.
6. Update canonical state docs after implementation; do not run `pnpm docs:sync` manually.

## Pitfalls / stop conditions

- Do not build a second NPC/fauna label-distance scan.
- Do not add Perception to `labelDistance.ts` or `PhysicalAttributes.ts` consumer logic.
- Do not invent a generic “effective attributes” framework just to satisfy outdated plan wording.
- Do not let label visibility become NPC/animal simulation awareness.
- Do not use gaze/view cone as semantic observation gating in this slice.
- Do not persist observation level, qualitative assessments, hysteresis state or the debug toggle.
- Do not expose exact HP/Stamina values through `assessed`.
- Do not let `none` disable unrelated quest/interaction/debug markers.
- Do not implement fauna-side changes before resolving the current `fauna-017` dependency.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
