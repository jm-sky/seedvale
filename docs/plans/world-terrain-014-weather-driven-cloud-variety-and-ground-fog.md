# Plan: Weather-Driven Cloud Variety and Ground Fog

**Created:** 2026-09-05
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-terrain-001~~
**Domain:** `world-terrain`
**Subdomains:** `rendering`
**Tags:** `clouds` `fog` `weather`

## Goal

Extend Seedvale's existing lightweight atmospheric rendering so cloud appearance communicates the existing world weather more clearly and fog gains a cheap local ground layer.

The implementation should:

- support two configurable visual cloud categories,
- support one or more PNG textures per category,
- select the balance of those categories from the existing weather state,
- allow weather intensity and optionally season to influence the visual result,
- add a small fixed-budget ground-fog layer using the existing fog PNG asset,
- keep asset selection and visual tuning primarily configuration-driven,
- preserve the existing bounded, recycled rendering approach.

This is rendering polish. It must not create a second weather or atmosphere simulation.

## Current state

The repository already has the mechanisms this work should extend:

- `src/world/weather.ts` owns deterministic seasons and weather (`clear`, `cloudy`, `rain`, `fog`, `snow`) including weather intensity.
- `src/world/clouds.ts` owns the current cloud layer: a bounded pool of recycled `THREE.Sprite`s, shared textures/materials, weather coverage/tint and day/night tint.
- The current cloud budget is bounded (`CLOUD_COUNT = 28`) and should remain bounded rather than scaling with the number of cloud assets.
- `src/world/weatherVisuals.ts` and the scene fog already provide global distance/tint fog behaviour.
- `public/images/clouds/` contains the existing cloud assets plus additional candidate PNGs that will be classified/tuned manually after the mechanism exists.
- `public/images/fog/fog-01.png` is available as the first local fog texture.

The existing `world-terrain-001` Cloud System remains the foundation; extend it rather than replacing it.

## Design

### 1. Two visual cloud categories

Introduce two deliberately simple visual categories:

- `light` — lighter, thinner, wispy or more dispersed cloud assets,
- `dense` — fuller, broader or visually heavier cloud assets.

These are rendering categories, not meteorological simulation concepts. Do not introduce cirrus/cumulus/stratus state into the world model.

Each category must accept **1+ texture paths** so assets can later be added, removed or reclassified through configuration without changing the selection logic.

Category configuration should also own the visual ranges that differ between the families, such as height, scale/aspect and drift speed where useful.

Do not over-abstract the configuration; a small typed data structure near the cloud system is sufficient.

### 2. Separate cloud coverage from category selection

Keep two concepts distinct:

- **coverage** — how much of the bounded cloud pool is visible,
- **category weights** — which category a cloud should use when it is assigned/recycled.

The existing weather-driven coverage remains the basis for cloud quantity.

Weather should provide configurable `light` / `dense` selection weights. Initial tuning can follow this direction:

| Weather | Cloud character |
|---|---|
| `clear` | mostly `light` |
| `cloudy` | mixed, biased toward `dense` |
| `rain` | strongly `dense` |
| `snow` | mostly `dense`, but lighter than rain visually through existing tinting |
| `fog` | few clouds; category mix is secondary to ground fog |

Exact values are tuning parameters, not gameplay contracts.

Do not increase the total cloud sprite budget when more textures or categories are configured.

### 3. Natural category transitions

Do not immediately replace every existing sprite texture when weather changes.

Treat weather category weights primarily as the selection distribution when clouds are initially assigned or naturally recycled. As old clouds leave the cloud area and new ones enter, the visible population should progressively move toward the current weather profile.

This gives weather transitions a natural visual progression without allocating/destroying clouds or introducing a weather-front simulation.

If an implementation needs a bounded corrective mechanism so a long-lived population eventually reflects a new profile, keep it gradual and allocation-free rather than performing a one-frame global swap.

### 4. Weather intensity

`WeatherType` defines the target visual profile; `WeatherState.intensity` should control how strongly that profile is expressed where appropriate.

Avoid a low-intensity rain state instantly looking identical to maximum-intensity rain.

Keep the mapping simple and configurable. Do not add another atmospheric state machine.

### 5. Season and time of day

Weather remains the primary source of cloud category selection.

Season may provide a **small optional bias** to category weights if it can be added without complicating the mechanism. For example, summer clear weather may lean slightly toward `light`, while autumn/winter may lean slightly toward `dense`.

Do not create separate spring/summer/autumn/winter cloud systems or asset sets.

Time of day must not select cloud categories. Preserve the existing day/dusk/night cloud tint behaviour: time changes how a cloud is lit, not what type of cloud it is.

### 6. Preserve cheap cloud rendering

Continue to reuse the existing bounded sprite/recycling architecture.

Prefer variety from:

- texture selection,
- category-specific scale/aspect ranges,
- height/depth variation,
- drift speed,
- existing weather tint,
- existing day/night tint.

The current system shares materials. Do not add per-sprite opacity/rotation by multiplying materials or introducing a custom shader unless recon demonstrates a compelling reason. Large transparent sprites already have an overdraw cost; visual variety must not multiply that cost unnecessarily.

## Ground fog

### 7. Add local ground fog as a rendering supplement

Add a lightweight local fog layer that complements, but does **not replace**, the existing global `THREE.Fog` / weather fog behaviour.

Its purpose is to make fog weather visually read as low moving bands or patches near the terrain rather than only reduced view distance.

Use:

`public/images/fog/fog-01.png`

as the initial asset.

The texture configuration must accept **1+ PNG paths** so additional variants can be added later without changing the mechanism.

### 8. Fixed fog pool and configuration

Create a small fixed pool at initialization rather than allocating/removing fog objects when weather changes.

Start conservatively with only a few elements (roughly 4–6 maximum, subject to implementation recon/tuning).

Central configuration should make the important visual/performance parameters easy to tune, including at least:

- texture paths,
- maximum element count,
- visible amount/density,
- height range,
- scale/width range,
- opacity,
- drift speed,
- local area/radius,
- response to weather intensity.

Weather should normally change visibility/opacity and recycle behaviour, not object lifetime.

### 9. Fog weather integration

The first version of local ground fog is owned by `weather.type === 'fog'`.

`WeatherState.intensity` should progressively control the strength of the local effect, for example through opacity and/or the number of visible pooled elements.

Keep local ground fog disabled for `clear`, `cloudy`, `rain` and `snow` in this plan. Do not expand scope into rain mist, snow blowing effects or other atmospheric particles.

### 10. Ground-fog representation

Before implementation, inspect the actual camera/render setup and choose the cheapest representation that gives convincing low fog with the supplied alpha texture.

A small number of sprites/cards/planes are acceptable. Do not force a horizontal plane if it produces obvious terrain intersections, and do not force a camera-facing sprite if it reads as a vertical wall.

Requirements regardless of representation:

- transparent alpha texture,
- `depthWrite: false`,
- cheap unlit material where practical,
- shared texture/material resources,
- slow frame-rate-independent drift,
- recycling rather than runtime churn,
- no volumetrics,
- no raymarching,
- no CPU particle simulation.

Because this is camera/player-local rendering garnish rather than simulation state, it may follow the player similarly to the existing cloud layer. It does not need persistence or world-authoritative positions.

## Ownership and integration

Reuse the existing rendering and weather ownership boundaries.

- Extend the existing `CloudSystem` rather than introducing a parallel cloud manager.
- Add ground fog as a small rendering system with a lifecycle consistent with nearby systems (`addTo` / `update` / `dispose` or the current equivalent).
- Feed both systems from the already-computed weather state; never recompute or duplicate weather.
- Reuse existing texture-loading conventions and game-loop integration.
- Do not attach either effect to terrain chunks unless current code demonstrates a concrete need.

Add useful JSDoc to important architectural/public functions or classes where it improves AI preflight discovery; use `@domain world-terrain` where appropriate.

## Performance constraints

### Clouds

- Keep the total sprite budget bounded; do not scale it with texture count.
- Recycle existing sprites.
- Avoid normal-update allocations.
- Reuse texture/material resources.
- Avoid unnecessary transparent overlap and material proliferation.

### Ground fog

- Use a small fixed pool.
- Prefer a few large soft layers over many small particles.
- Avoid excessive overlapping transparent surfaces.
- No Web Worker: the work is trivial and rendering-bound.

### Assets

The mechanism may support arbitrary `1+` texture lists, but implementation must not require large numbers of high-resolution textures. Final PNG selection/resolution is a separate manual tuning concern.

## Configuration and manual tuning

The implementation should deliberately make the following easy to tune after coding:

- cloud texture membership (`light` / `dense`),
- cloud coverage per weather,
- cloud category weights per weather,
- category height/scale/aspect/speed ranges,
- optional seasonal bias,
- fog texture list,
- fog pool/count/density,
- fog height/scale,
- fog opacity,
- fog drift.

Do not build a runtime configuration UI for this plan.

## Out of scope

- volumetric clouds or fog,
- raymarching,
- procedural/noise cloud shaders,
- cloud shadows,
- physical cloud volumes,
- cloud-driven weather,
- localized weather fronts,
- wind simulation,
- meteorological cloud-type simulation,
- multiplayer synchronization of visual cloud/fog placement,
- persistence of cloud/fog sprite positions,
- replacing global `THREE.Fog`,
- changing precipitation systems,
- rain mist or blowing-snow effects.

## Implementation guidance

Before coding:

1. Read `CLAUDE.md` and `docs/STATE.md`.
2. Verify the current implementation in `src/world/clouds.ts`, `src/world/weather.ts` and `src/world/weatherVisuals.ts`.
3. Trace current cloud creation/update/disposal integration in the composition root/game loop.
4. Inspect the current camera/render setup before choosing the ground-fog primitive.
5. Reuse existing texture loading, material and weather mechanisms.
6. Follow current code over this plan if implementation details have changed.

Keep the implementation small and configuration-driven. Do not introduce an atmosphere framework for two lightweight visual effects.

There is no need to run `pnpm docs:sync` manually; documentation synchronization runs automatically in the GitHub workflow.

## Verification

### Technical

Run the relevant existing typecheck, lint, tests and build.

Add focused pure tests for category/profile selection only if the implementation naturally exposes deterministic pure logic worth testing. Do not test Three.js implementation details for their own sake.

### Browser/manual

Browser verification is performed by the user, not the AI agent.

Verify manually:

- `clear` is dominated by light clouds,
- `cloudy` produces a mixed population,
- `rain` progressively becomes dominated by dense clouds,
- low/high weather intensity produces sensible visual differences,
- weather changes do not cause a one-frame global texture swap,
- 1 texture per cloud category works,
- multiple textures per category work without logic changes,
- day/night tint remains correct,
- cloud count remains bounded,
- fog weather shows soft local ground bands/patches in addition to global distance fog,
- ground fog strength responds to intensity,
- local fog does not read as an obvious vertical wall or badly intersect terrain,
- no obvious popping or runtime object growth occurs,
- no noticeable frame-time/draw-call/transparent-overdraw regression is introduced.

## Expected result

Seedvale's existing weather state drives a richer but still inexpensive atmosphere.

Clouds remain one bounded recycled visual system, but their assets are split into configurable `light` and `dense` families. Weather controls coverage and target family weights, intensity controls how strongly the weather profile is expressed, and recycled clouds gradually move the visible population toward the new profile instead of changing every sprite instantly. Season can provide a small optional bias; time of day remains a tint-only concern.

Fog weather keeps the existing global fog and gains a second, cheap visual layer: a few pooled, slowly drifting ground-fog elements using `public/images/fog/fog-01.png`, with configuration ready for additional PNG variants.

The developer can later replace/classify cloud and fog assets and tune the visual parameters without redesigning the systems.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
