# Implementation notes — Agent presentation render LOD

**Plan:** `world-terrain-041-agent-presentation-render-lod.md`  
**Status:** pre-implementation recon complete  
**Model:** Sonnet, Composer

## Current implementation seams

### NPC presentation

`src/ai/NpcAgent.ts` owns one live agent root and already separates simulation state from render presentation well enough to extend without creating another agent object.

Relevant current facts:

- NPC models are skinned GLB clones loaded through `loadGltfAnimated()` / `SkeletonUtils.clone()`.
- `NPC_SHADOW_DISTANCE = 36` already disables distant NPC shadow casting while leaving the main-pass model visible.
- The code comment next to that constant documents roughly **9 skinned submeshes per NPC** as a meaningful submit cost.
- NPC render layer is assigned through existing `AGENT_RENDER_LAYER` / `assignRenderLayer()`.
- Animation is owned by `createAgentAnimationSet()`; the animation owner must stay attached to the existing model/root lifecycle.

`src/ai/npcAppearance.ts` selects among:
- Modular Men/Women variants,
- UBC Peasant/Wizard/Ranger/Knight variants,
- baked hair/beard variants.

No separate low-poly or explicit LOD model family was found in the current repository.

### Fauna presentation

`src/fauna/AnimalAgent.ts` follows the same broad ownership shape:

- one stable agent root,
- GLB/procedural/capsule visual under that root,
- `createAgentAnimationSet()`,
- `FAUNA_SHADOW_DISTANCE`,
- `AGENT_RENDER_LAYER`.

Fauna already has `animalPresentationIntervalSec()` / `resolveAnimalUpdateImportance()` in `animalUpdateCadence.ts`. That mechanism throttles **CPU presentation updates**. It is not a render LOD and must not become the authority for main-pass visibility/detail.

Corpse handling also depends on the existing living visual hierarchy through `hideLivingVisual()` / `showLivingVisual()`, so any replacement/visibility mechanism must preserve that contract.

## Diagnostic first

The existing scene census only reports aggregate `npc` and `fauna` buckets. Before implementing a production LOD, add a bounded agent-specific census used by `settlement-heavy`.

Recommended location:

- extend `src/perf/sceneCensus.ts` with an optional agent-detail helper, or
- add `src/perf/agentRenderCensus.ts` if the data would otherwise distort the generic census API.

Do not add a normal-game per-frame traversal.

For NPC, livestock and wild fauna separately capture at least:

- agents present,
- visible agents,
- renderable meshes / skinned meshes,
- estimated draw calls,
- triangles,
- average and p95 renderables per agent,
- `castShadow=true` renderables,
- distance bands from player/observer, e.g. 0–15, 15–30, 30–60, 60+ m,
- source `assetUrl` where available.

If practical, report top model families by draw count so the implementation can distinguish:
- UBC NPCs,
- modular NPCs,
- livestock models,
- wild fauna models.

### Gate A — shadow vs main pass

Run `settlement-heavy` with the census and compare with the already-existing `no-shadows` and `hide-npc-fauna` isolation probes.

If most of the agent win is explained by shadow submissions, stop production work here and let `world-terrain-038` own the optimization.

Continue only when main-pass renderables/triangles remain a material cost after shadow filtering.

## Shared LOD policy

If Gate A passes, add a small pure shared policy module:

`src/render/agentPresentationLod.ts`

Suggested contract:

```ts
export type AgentPresentationLevel = 'near' | 'mid' | 'far'

export type AgentPresentationLodInput = {
  distance: number
  important: boolean
}

export function resolveAgentPresentationLevel(
  input: AgentPresentationLodInput,
): AgentPresentationLevel
```

The first implementation should intentionally keep the input narrow.

### Importance

`important=true` should force `near`.

Use only importance signals already available at the caller without creating cross-system lookups.

Initial eligible cases:

- direct interaction/dialogue target if the current caller already knows it,
- combat/flee participant if already locally known,
- mounted player-owned animal,
- actively led player-owned animal.

Do **not** add a global “important agents registry” in this plan.

If a signal is not locally available, omit it in v1 rather than importing quest/combat/dialogue managers into the render module.

### Distance policy

Do not reuse simulation cadence thresholds as the LOD thresholds.

Start with explicit render distances, benchmark-tuned later. Keep hysteresis if browser verification shows visible threshold oscillation.

The shared resolver should be pure and unit tested.

## Preferred implementation order

### R1 — census only

Implement the agent render census and run the benchmark.

This is a valid endpoint if Gate A fails or if no safe representation reduction is available.

### R2 — submesh visibility budget

Because the repo currently has no low-poly agent assets, the first production candidate should be **existing-hierarchy submesh reduction**, not model swapping.

For each representative model family, identify whether some child meshes are visually optional at mid/far distance, for example:

- hair/beard accessories,
- small equipment/details,
- outfit accessory meshes,
- other non-silhouette children.

Do not assume node names. Inspect the actual loaded hierarchy/census.

If a family has no safely removable children, leave it unchanged.

The agent owner should cache the relevant presentation nodes once after model construction. Do not traverse the whole model every frame.

Suggested adapter shape:

```ts
type AgentPresentationAdapter = {
  applyLevel(level: AgentPresentationLevel): void
  dispose(): void
}
```

NPC and fauna may build different adapters, but both consume the same `AgentPresentationLevel`.

The shared policy owns **when** detail changes; each model adapter owns **what** can safely be hidden.

### R3 — explicit model LOD only if assets exist

If future low-poly variants are added, extend the adapter to swap presentation children under the same stable agent root.

Do not implement runtime decimation.

Do not create a second `NpcAgent` / `AnimalAgent`.

A model swap must preserve:

- root world transform,
- agent identity,
- collider/interaction identity,
- health/life state,
- ownership,
- render layer,
- animation semantic state.

Because `AgentAnimationSet` owns an `AnimationMixer` bound to a model root, an actual skinned-model swap requires an explicit animation rebind contract. Do not silently replace the animated child while retaining a mixer bound to the old skeleton.

Unless a low-poly asset family with compatible skeleton/clip contract is verified, keep R3 out of the initial implementation.

## Integration points

### NPC

Primary seam: `src/ai/NpcAgent.ts`.

During/after visual construction:

1. retain the stable top-level `this.mesh`,
2. build a cached presentation adapter for its loaded hierarchy,
3. apply `AGENT_RENDER_LAYER` exactly as today,
4. keep current shadow-distance logic independent,
5. compute presentation level only when the existing presentation/update path already has observer distance available.

Do not introduce another scene traversal in `gameLoop.ts`.

### Fauna

Primary seam: `src/fauna/AnimalAgent.ts`.

Use the same shared resolver but a fauna-specific adapter.

Important guards:

- mounted horse → `near`,
- actively led owned animal → `near`,
- corpse state must not accidentally re-enable hidden living meshes,
- procedural/capsule fallback may simply keep one level if there is nothing useful to reduce.

Do not derive render level from `AnimalUpdateImportance`; both may use distance/importance inputs, but they remain separate policies.

## Transition behaviour

For visibility-only R2:

- level changes should toggle cached child `.visible` flags only when the resolved level changes,
- no material cloning,
- no geometry mutation,
- no per-frame allocation,
- no rebuild of the skeleton,
- no animation reset.

Track the last applied level per agent.

If browser verification shows obvious popping, add small hysteresis to the pure policy rather than temporal smoothing or per-frame fades across many meshes.

## Tests

Add:

### `src/render/agentPresentationLod.test.ts`

Cover:

- near/mid/far thresholds,
- important agent forced to near,
- boundary behaviour,
- hysteresis if introduced.

### Adapter tests where practical

For a synthetic Object3D hierarchy verify:

- near restores all intended presentation nodes,
- mid/far hide only configured optional nodes,
- root stays visible,
- render layer is untouched,
- repeated application of the same level is a no-op.

NPC/fauna behavioural tests should only be added where the integration seam can be tested without constructing the full game world.

## Performance verification

AI agent:

- `pnpm test` / targeted Vitest,
- type-check,
- lint,
- build,
- no browser verification.

User:

1. Run `?benchmark=settlement-heavy` before/after.
2. Compare:
   - NPC draws / triangles,
   - fauna draws / triangles,
   - total draw calls,
   - RENDER avg/p95,
   - FPS/p95 frame time.
3. Walk from far → mid → near through a populated settlement.
4. Check:
   - dialogue/interaction target,
   - guards/combat,
   - livestock,
   - wild fauna,
   - mounted horse,
   - led animal,
   - death/corpse transition.
5. Watch for:
   - model parts popping too close,
   - missing hair/equipment at near range,
   - animation reset,
   - living visual incorrectly restored on corpse,
   - render-layer/reflection regressions.

## Success gate

Keep production LOD only if it removes a meaningful number of **main-pass** agent submissions/triangles and improves `settlement-heavy` without visible near-range regressions.

If current agent assets do not expose enough optional submeshes to produce a meaningful win, stop after census and document an asset requirement for explicit low-poly variants. Do not compensate by building a proxy/impostor system in this plan.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
