# Plan 188 — Implementation Notes

**Reviewed:** 2026-08-22  
**Plan:** `2026-08-21--188--fauna-and-dead-animal-lifecycle.md`  
**Status:** implementation notes  
**Source of truth:** current `main` code, tests and current architecture. The plan was treated as intended work, not as evidence that any described feature already exists.

## 1. Review verdict

Plan 188 fits the current fauna architecture, but it should be implemented as a **small extension of `AnimalAgent`'s existing death/corpse lifecycle plus data-driven bear registration**. Do not introduce a second corpse system, disease system, bear agent, bear AI, bear combat pipeline, or global FX manager.

The current code already has:

- live/dead `AnimalAgent` instances and corpse interaction;
- a 60 s unharvested corpse linger;
- a separate 90 s lifetime for knife-harvested remains;
- carcass consumption/claim state used by animal feeding;
- `harvestedRemains.ts` with cached GLB templates and procedural fallback;
- generic habitat spawners (`cave`, `thicket`, `wolfDen`) with persisted lifecycle;
- shared animal needs/stamina and the existing fauna update cadence;
- shared health/combat infrastructure and NPC animal-defense integration;
- a generic animal sound pipeline.

Therefore most of plan 188 is integration work, not new infrastructure.

`docs/STATE.md` explicitly identifies `AnimalAgent`, `AnimalLife`, `AnimalSpawner`, `HealthState`, the simulation contracts and `harvestedRemains` as the relevant shared seams. fileciteturn0file0L2-L2

## 2. Important discrepancy: the plan's reconnaissance is partly stale

The plan already correctly notes that corpses and harvested remains exist, but implementation must verify their exact current behaviour before editing. Current `AnimalAgent.ts` still defines:

```ts
const CORPSE_LINGER_SECONDS = 60
export const HARVESTED_REMAINS_LINGER_SECONDS = 90

export function corpseLingerSeconds(meatHarvested: boolean): number {
  return meatHarvested ? HARVESTED_REMAINS_LINGER_SECONDS : CORPSE_LINGER_SECONDS
}
```

The important consequence is that **the new decay lifecycle must not simply replace `corpseLingerSeconds()` with another generic TTL**. Harvested corpses already have a distinct gameplay lifecycle and the 90 s timer must remain separate. fileciteturn16file0L2-L2

The current remains implementation is explicitly for the harvested case: `createHarvestedRemainsAsync()` composes bones, hide and meat scraps, while `disposeHarvestedRemains()` owns cleanup. It is not currently a generic unharvested-corpse-to-bones system. fileciteturn5file0L2-L6

## 3. Recommended corpse state model

Keep the authoritative lifecycle state on `AnimalAgent`. Avoid introducing a second `CorpseManager` or world registry.

A minimal model is preferable:

```text
alive
  ↓ death
corpse / fresh
  ↓ corpse decay threshold
rotting
  ↓ decay duration
bones/remains
  ↓ remains lifetime
expired / removed
```

The existing boolean/terminal state used by `AnimalAgent` can be extended only if that is cleaner at the actual edit point. A small explicit enum is preferable to several booleans if the existing state shape would otherwise become ambiguous.

Do **not** use render visibility, mesh existence or particle state as lifecycle state.

Recommended invariant:

```text
lifecycle state = simulation truth
mesh / FX = presentation derived from lifecycle + observation distance
```

## 4. Timing: use the existing fauna simulation clock

The new timers must advance from the same `dt`/simulation update already driving `AnimalAgent`.

Do not use:

- `setTimeout`;
- `setInterval`;
- particle-frame counts;
- wall-clock timestamps as the authoritative lifecycle clock;
- a new global corpse timer loop.

This is especially important because `createFauna.ts` already owns the fauna update entry point and the world has time-skip/game-day based systems. The current habitat spawner uses game-days for respawn/recovery, while per-agent life uses simulation `dt`. Corpse decay should use the same per-agent simulation time basis as the existing corpse linger unless there is a concrete reason to move the whole corpse lifecycle to game-days.

If time skip can advance fauna through a large `dt`, clamp/step transitions so a single update cannot accidentally execute the wrong intermediate presentation state. The final state after a large delta should still be deterministic.

## 5. Do not conflate harvested and naturally decaying corpses

This is the most important gameplay distinction.

Current behaviour is:

```text
animal dies
    ↓
corpse
    ↓ knife harvest
harvested remains
    ↓ 90 s
removed
```

Plan 188 adds:

```text
animal dies
    ↓
fresh corpse
    ↓
rotting corpse
    ↓
existing bones/remains representation
    ↓
removed
```

The two paths should remain explicit.

If a corpse is harvested before decay, its lifecycle should leave the natural decay path and enter the existing harvested-remains path. It must not later become a second bones pile through the decay timer.

Likewise, burying a corpse should terminate/remove it through the existing bury interaction and cancel any pending decay/FX state.

Animal scavenging must continue to see only valid edible carcasses. `isCarcassEdible()` currently rejects expired, consumed and harvested corpses; the new `rotting` phase should be considered deliberately in this contract rather than accidentally becoming edible or inedible because of a renamed boolean. fileciteturn16file0L2-L2

## 6. Reuse `harvestedRemains` without changing its meaning

`src/fauna/harvestedRemains.ts` is already a reusable asset-composition module with:

- cached GLB templates;
- `bones_pile.glb`;
- `large_bone.glb`;
- `animal_hide.glb`;
- procedural fallback;
- deterministic species-dependent large-bone count;
- disposal through `disposeObject3D()`.

Do not rename it to something broader just to make the new feature fit.

Instead, add the smallest reusable function needed for the **unharvested natural-decomposition representation**, ideally reusing the existing cached pile template and disposal code internally. If the current function's inclusion of hide/meat scraps is semantically wrong for a naturally decomposed corpse, do not call `createHarvestedRemainsAsync()` unchanged and accept the wrong visual/gameplay meaning.

A clean direction is:

```text
harvestedRemains.ts
  ├─ harvested remains composition
  └─ natural bone/remains composition
```

Both can share the same template cache and disposal helper.

Do not create `corpseBones.ts` unless the existing module genuinely cannot be extended without becoming incoherent.

## 7. Natural bones should not become pickups accidentally

The current harvested-remains comments explicitly describe the output as **not a world pickup**. Preserve that property for the natural bones representation unless a later plan deliberately adds a bone resource interaction.

Plan 188 is about lifecycle and ecosystem presentation, not another item-economy path.

## 8. Rotting visual state

The visual state should be a lightweight transformation of the existing corpse object.

Prefer, in order:

1. reuse the existing corpse mesh/material structure;
2. apply a small material tint/opacity/roughness change at the transition to `rotting`;
3. add a lightweight local FX object only while the corpse is near/observed;
4. dispose the FX immediately when the corpse leaves the relevant observation range or lifecycle state.

Do not duplicate the animal model or load another GLB for the rotting state.

The current fauna renderer already has distance-based shadow/label decisions, and `FAUNA_SHADOW_DISTANCE` is exported specifically to keep distant fauna cheaper. The same general philosophy should be used for corpse FX: presentation cost must fall off with distance. fileciteturn16file0L2-L2

## 9. Particles/fog: local, cheap, and lifecycle-owned

Plan 188 explicitly rejects a new global particle framework. Keep that decision.

A suitable V1 implementation can be a small `THREE.Group` attached to the corpse containing a few billboard/sprite-like particles and one translucent fog/smoke mesh, provided it is cheap and pooled/reused where practical.

Important constraints:

- no emitter update for every corpse in the world;
- no global scan just to animate FX;
- no permanent animation loop for off-screen corpses;
- no high-count transparent particles;
- no shadow casting from the FX;
- dispose geometries/materials/textures if the local implementation owns them.

If the renderer already exposes a suitable reusable particle primitive at the final edit point, use it instead of creating another one. Otherwise a small fauna-local helper is acceptable.

## 10. Observation gating must not affect simulation

Separate:

```text
rotting state/timers       → always updated
rotting visual FX          → only while relevant/nearby
```

Do not pause decay because a corpse is far away.

Do not make the lifecycle depend on `scene.visible` or whether the corpse currently has an attached mesh.

A robust pattern is:

```ts
update(dt, observerPos, ...):
  advanceLifecycle(dt)
  updatePresentation(observerPos)
```

The actual method names can follow the current `AnimalAgent` structure.

## 11. Negative proximity effect: keep it as a hook, not disease

The plan correctly says not to create a disease system.

The V1 hook should be a small deterministic proximity query over **nearby living entities**, using existing bounded candidates where possible.

Avoid a new global:

```text
DiseaseManager
StatusEffectManager
CorpseInfluenceSystem
```

A good V1 seam is a pure/data-level signal such as:

```ts
rottingCorpseInfluence = {
  corpseId,
  kind,
  distance,
}
```

or a tiny callback/decision input consumed by existing needs/AI later.

Do not directly subtract HP every frame. The plan asks for a temporary negative effect/debuff hook, not actual disease damage.

Also avoid applying the effect to the corpse itself or dead entities.

## 12. Performance of proximity effects

This feature must not reintroduce the known fauna proximity-scan problem.

Do not implement:

```text
for every corpse
  for every NPC
  for every animal
```

on every frame.

Prefer bounded/local candidates already passed through the fauna/world update path. If the final integration point has no suitable local candidate list, use a small-radius check at the same throttled cadence already used for animal decisions.

The existing fauna architecture already uses bounded NPC candidates for predator interactions rather than allowing every animal to scan the whole settlement/world. Preserve that architecture.

## 13. Bear should be data, not behaviour

The current `createFauna.ts` has a single species configuration path:

```text
SPAWNS
SPAWNER_SPECS
FAUNA_URLS
PROCEDURAL_FALLBACKS
AnimalAgent
```

`SPAWNER_SPECS` currently has a cave → wolf entry and comments explicitly describe caves as predator habitat. This is the correct seam for bear integration. fileciteturn6file0L2-L2

Add `bear` to the existing `AnimalKind` and species definition, then register its model and habitat through existing configuration.

Do not create:

- `BearAgent`;
- `BearAI`;
- `BearCombat`;
- `BearSpawner`;
- `BearDenManager`.

## 14. Bear stats should live in existing species definitions

Use the existing animal-definition/stat model in `AnimalAgent.ts` / fauna combat rather than scattering bear-specific constants through movement/combat code.

The bear should express:

- large model scale;
- high HP;
- high attack damage;
- appropriate movement speed;
- predator/omnivore behaviour through existing category/data fields where supported.

If the current model has no explicit omnivore category, do not invent a new ecosystem classification just for this plan. Use the closest existing food/prey capability and keep the change data-driven.

Species-specific behaviour should only be introduced where the shared system genuinely needs a parameter that cannot be represented by current definitions.

## 15. Bear model integration

`FAUNA_URLS` currently maps wild GLBs such as wolf/fox/deer/stag, while rabbit/duck/boar use procedural fallbacks. Add:

```text
bear: '/models/fauna/bear.glb'
```

through the same map and the same GLTF preparation/cache pipeline. `createFauna.ts` imports `loadGltfAsset`, `prepareProp` and the existing procedural fallback path; there is no reason for a bear-specific loader. fileciteturn6file0L2-L2

The plan's asset path should be treated as a new asset requirement. Current code does not establish that `bear.glb` already exists.

Before browser verification, confirm the actual file exists under `public/models/fauna/` and that its origin/scale/animation setup matches the other fauna models.

## 16. Cave → bear integration: current model limitation

Current `SPAWNER_SPECS` represents a spawner as one concrete `kind`:

```ts
{ type: 'cave', kind: 'wolf', ... }
```

and `PreySpawner` stores the same `kind`. Therefore simply adding a second `cave` row for bear would likely create **two cave spawners**, not make one cave choose between species.

This is an important architectural point.

Preferred V1 solution:

```text
existing cave habitat
    ↓
existing spawner configuration
    ↓
bear cave entry / bear-compatible spawn configuration
```

But first inspect the actual cave placement/build loop and whether multiple spawners of the same `type` can coexist safely. If one settlement currently creates exactly one cave, do not silently create a second physical cave.

If the intended result is that a cave can spawn either wolf or bear, the smallest clean extension is to make the existing spawner configuration support a species list/weighted choice while keeping one `PreySpawner` identity and one lifecycle state. Do not create a second habitat system.

This decision matters because `PreySpawner.kind` is also used for population caps, recovery and save restoration. A multi-kind cave requires those semantics to be defined explicitly; otherwise the safer V1 choice is a dedicated existing cave spawner configured for bear in worlds/settlements where that is intended.

## 17. Habitat lifecycle implications for bear

`AnimalSpawner.ts` already owns generic states:

```text
active → depleted → disabled → recovering → active
```

with `RECOVERY_DAYS = 21`, `MIN_RECOVERY_POPULATION = 2`, a per-kind nearby population check and persisted state fields. fileciteturn7file0L2-L2

Do not modify this lifecycle specifically for bears.

If bear becomes a cave `kind`, it automatically participates in the existing spawn-point lifecycle. Make sure depletion/recovery semantics still make sense with the configured bear population cap.

One subtlety: recovery currently requires the minimum number of same-kind animals within `SPAWNER_RADIUS`. A cave whose only species is bear therefore requires enough living bears nearby to recover. That is consistent with the generic contract and should not be bypassed with a bear-specific rule.

## 18. Combat integration is already available

Plan 179's implementation notes confirm that plan 177's NPC combat infrastructure is already implemented and that 179 connects existing combat rather than creating a new combat system. fileciteturn19file0L2-L2

For plan 188, the bear therefore only needs valid species combat data. It should automatically use the existing animal damage/health and NPC/player target paths.

Do not add bear branches to the combat pipeline such as:

```ts
if (kind === 'bear') { ... }
```

unless the branch is purely data lookup that cannot be expressed by the existing species definition.

## 19. Bear audio: current pipeline is very small

`src/audio/animalSounds.ts` already provides the generic species-to-URL map and `playAnimalSound(kind, playAt, position)`. Current configured kinds include chicken, cow and wolf. fileciteturn11file0L2-L6

Therefore bear audio should be added there:

```ts
bear: '/sounds/bear-growl.ogg'
```

and, if appropriate, a species-specific volume entry. Do not create a bear audio manager.

However, current `playAnimalSound()` is an **interaction sound helper** and not by itself proof that growls are already triggered by attack/alert states. The plan's requirement "aggression/attack/alert" therefore needs a small reconnaissance of actual call sites before implementation. Extend the existing call path at the appropriate event seam instead of adding an independent bear-only sound trigger.

The current game loop imports `playAnimalSound`, confirming that audio is already integrated at application level. fileciteturn13file0L2-L2

## 20. Asset documentation

Update `docs/assets/MODELS.md` and `docs/assets/SOUNDS.md` only if the repository's current asset workflow expects newly added local assets to be registered there. The plan explicitly requests those docs to be checked.

Do not invent licensing/source metadata. Use the real source information associated with the supplied asset.

## 21. Tests: focus on pure lifecycle transitions

Prefer pure functions for timing/state transitions so tests do not require a full Three.js scene.

Useful seams:

```text
corpse phase from elapsed time
natural decay transition
remains lifetime transition
harvest/bury interruption
rotating FX eligibility by distance
bear definition validity
cave/spawner configuration validity
```

Existing `harvestedRemains.test.ts` should remain green and can be extended if shared remains helpers are changed. The repository already has tests specifically for the remains module. fileciteturn17file7L36-L40

Do not try to unit-test particle visual quality.

## 22. Regression cases that matter

At minimum preserve:

1. wolf/fox/deer/stag/boar existing behaviour;
2. carcass scavenging before harvest/decay;
3. knife harvest → harvested remains → 90 s cleanup;
4. shovel bury → corpse removed without later decay;
5. existing bones/remains asset fallback;
6. habitat depletion/recovery;
7. NPC animal-defense combat;
8. animal health/death shared `HealthState`;
9. animal audio for existing species;
10. no expensive corpse FX when the observer is far away.

## 23. Potential save/persistence issue

The plan does not explicitly request a save-schema change, and current `docs/STATE.md` says fauna agents are not a full per-agent persistent simulation snapshot. fileciteturn0file0L2-L2

Do not add per-corpse save serialization in V1 merely because the new lifecycle has more phases.

If the current fauna rebuild destroys/recreates animals on save/load, the implementation should follow the existing persistence contract rather than inventing persistent corpse identity/timestamps. If a code path already persists a specific corpse or spawn-point state, preserve that contract, but do not broaden it to every individual animal without an explicit plan.

## 24. Main architectural recommendation

The implementation should roughly follow:

```text
AnimalAgent
  ├─ existing alive behaviour
  ├─ existing death detection
  ├─ natural corpse lifecycle
  │    ├─ fresh
  │    ├─ rotting
  │    ├─ natural bones
  │    └─ removal
  ├─ existing harvested lifecycle
  ├─ existing bury lifecycle
  └─ existing animal AI/combat

harvestedRemains.ts
  ├─ shared remains asset/template cache
  ├─ harvested remains composition
  └─ natural bones composition

createFauna.ts
  ├─ bear species registration
  ├─ bear model registration
  └─ existing cave/spawner integration

animalSounds.ts
  └─ bear sound registration + existing event trigger
```

No new top-level manager should be required.

## 25. Suggested implementation order

1. Inspect the exact `AnimalAgent` death/harvest/bury update branches and identify the smallest lifecycle state seam.
2. Extract/test pure corpse phase timing.
3. Implement natural corpse → rotting → bones → removal while preserving harvested/buried paths.
4. Extend `harvestedRemains.ts` only where shared asset composition is genuinely reusable.
5. Add distance-gated rotting FX.
6. Add the minimal negative-effect/proximity hook without implementing disease.
7. Add `bear` to `AnimalKind` and the existing animal definition/stat tables.
8. Add `bear.glb` through `FAUNA_URLS`/existing GLTF cache/preparation.
9. Resolve the cave-spawner configuration carefully; do not accidentally create duplicate physical cave habitats.
10. Add `bear-growl.ogg` to `animalSounds.ts` and connect it to the existing relevant animal event path.
11. Add focused unit/regression tests.
12. Run typecheck/lint/tests/build.
13. Browser-verify lifecycle, bear spawn/model/audio/combat and distance-gated FX.

## 26. Things the implementing agent should not do

Do not:

- create `BearAgent`/`BearAI`/`BearCombat`;
- create `CorpseManager` or a global corpse update loop;
- create a generic disease/status-effect framework;
- replace `harvestedRemains` with a new remains system;
- make natural bones contain meat/hide unless explicitly intended by current gameplay semantics;
- use wall-clock timers for simulation lifecycle;
- scan all NPCs/animals for corpse effects every frame;
- create a worker for corpse lifecycle or particles;
- make bear behaviour depend on a large `if (kind === 'bear')` branch;
- silently add a second cave just to get a bear spawn;
- add individual animal/corpse persistence without confirming the current save contract;
- make off-screen lifecycle pause because the corpse is not rendered.

## 27. Verification checklist

### Technical

- [ ] `npx tsc --noEmit`
- [ ] `pnpm run lint:fix`
- [ ] `pnpm run test`
- [ ] `pnpm run build`

### Lifecycle

- [ ] fresh corpse remains distinct from live animal
- [ ] fresh corpse transitions to rotting at configured threshold
- [ ] rotting state survives observer/render distance changes
- [ ] rotting transitions to natural bones/remains
- [ ] natural bones are removed after their own configured lifetime
- [ ] harvested corpse uses the existing 90 s harvested-remains path
- [ ] buried corpse never later produces natural bones
- [ ] scavenging cannot repeatedly consume a decomposing/consumed/harvested corpse

### Effects

- [ ] rotting corpse has a clear but subtle visual distinction
- [ ] green particles are present only while presentation is relevant
- [ ] subtle vapour/fog is present only while presentation is relevant
- [ ] no expensive FX remain active for remote/off-screen corpses
- [ ] proximity negative-effect hook is bounded and temporary

### Bear

- [ ] `bear` is a valid `AnimalKind`
- [ ] bear uses `AnimalAgent`
- [ ] bear uses existing health/combat/AI
- [ ] bear model loads through the existing fauna asset pipeline
- [ ] cave integration does not create an unintended duplicate habitat
- [ ] bear participates in existing spawner lifecycle
- [ ] bear growl uses `animalSounds.ts`
- [ ] bear growl triggers from the intended existing animal event path
- [ ] bear interacts correctly with NPC/player combat

### Off-screen

- [ ] corpse timers continue while remote/unobserved
- [ ] lifecycle does not depend on rendered frames
- [ ] no per-corpse expensive FX loop exists for remote corpses

> **Zrób git commit i push do main, rebase jeżeli trzeba**
