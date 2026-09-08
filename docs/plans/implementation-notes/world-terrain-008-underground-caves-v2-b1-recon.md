# Implementation Notes: Underground Caves V2 — B1 Recon

> Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`
> Recon date: **2026-09-07**
> Scope: **Milestone B1 only — production topology + SDF spatial representation + geometry**
>
> **Superseded as current-runtime truth.** B1 landed 2026-09-08. §1 below describes the *pre-B1* `generateCaveDefinitions` + spike wiring. For what the production pipeline actually is now, see the "Milestone B1 — Implementation Summary" in `world-terrain-008-underground-caves-v2-implementation-notes.md`. For B2 gameplay queries, see `world-terrain-008-underground-caves-v2-b2-recon.md` — do not treat this file's §1 as the live `createCaves.ts` flow.

This is a focused addendum to the original Milestone-A implementation notes. Do not reread the whole repository before B1; start from the files and constraints below.

---

## 1. Current runtime truth

`src/world/createCaves.ts` currently does this:

```text
generateCaveDefinitions(...)              // V1 siting + V1 layout + V1 overburden acceptance
    ↓
definitions[]
    ↓ for every definition
buildSpikeTestTopology(seed, def.entrance)
    ↓
topologyToCaveDefinition(topology)         // compatibility gameplay/collision proxy
    ↓
createCaveVolume(...)

activate(def):
    variant = resolveCaveRenderVariants(...)
    buildSdfCaveMesh(v2.topology)           // default for every cave
    or buildSweepCaveMesh(...)              // first cave only when ?caveSpike=sweep
```

Important current facts:

- every normal cave renders SDF V2 now;
- V1 `createCaveInteriorMesh()` is no longer the normal runtime renderer;
- meshes are still built lazily on activation and disposed on deactivation — keep this;
- topologies/proxies are cheap and precomputed at world build — keep this unless profiling says otherwise;
- `ColliderRegistry`, `WorldBundle` ownership and world-location identity stay reused.

---

## 2. Main B1 architectural debt

### A. V1 still decides whether a cave exists

`generateCaveDefinitions()` in `src/world/caveGenerator.ts` does more than siting:

- calls `pickLargeCaveSites()`;
- builds the V1 tunnel/chamber graph;
- validates overburden against that V1 shape;
- returns `CaveDefinition` or rejects the site.

B1 then discards nearly all of that layout and uses only the accepted entrance/identity as the anchor for a different Cave V2 topology.

This means current V2 acceptance is still indirectly based on a geometry that is no longer rendered.

**B1 target:** reuse world-scale siting, but production topology generation and overburden acceptance must be owned by Cave V2.

Do not duplicate `pickLargeCaveSites()`.

### B. `makeCaveId()` is private inside V1 generation

`makeCaveId(seed, site)` is stable and currently suitable, but lives inside `caveGenerator.ts`.

If B1 bypasses `generateCaveDefinitions()`, preserve the exact identity algorithm/result. Move/extract it only if necessary; do not silently change discovered-location ids.

---

## 3. Production topology problems in `spikeTestCave.ts`

`src/world/caves/spikeTestCave.ts` is a Milestone-A test topology, not a production generator.

### Hard-coded shape

It always builds:

```text
entrance
→ wide-transition
→ descending-passage
→ widening-bend
→ main-chamber
→ shelf|overhang
```

That shape remains a good L1 archetype, but production code should not expose spike/test naming or require those exact node ids downstream.

### All caves share the same structural RNG pattern

This is an important current bug/debt.

`buildSpikeTestTopology(seed, entrance)` derives its RNG streams only from the **world seed** plus fixed salts:

```text
seed ^ FEATURE_SEED_OFFSET
seed ^ CENTERLINE_SEED_OFFSET
```

`createCaves.ts` calls it for every cave with the same world seed.

Result: caves at different entrances receive the same feature roll and the same local wobble sequence, transformed by orientation/position. They are deterministic, but structurally clone-like.

**B1 target:** derive purpose-specific RNG streams from:

```text
world seed + stable cave identity or site coordinates + salt
```

Keep streams separate by purpose so adding detail does not change structure.

### Uniform terrain sink is spike-only

`sinkUnderTerrain()` computes one deficit and lowers the whole interior except the entrance.

This fixed the Milestone-A breakout repro, but on steep terrain the entire additional descent lands in the entrance transition. The results doc already records 2/12 surveyed seeds with very large sink values.

**B1 target:** topology-aware/local descent adaptation with full-footprint overburden validation. If a viable route cannot fit, reject the site rather than forcing an extreme first ramp.

---

## 4. SDF builder is not yet a spatial-representation layer

`src/world/caves/sdfCaveMesh.ts` currently owns all of these at once:

```text
CaveTopology interpretation
→ primitive placement
→ SDF evaluation
→ bounds
→ grid sampling
→ Surface Nets extraction
→ THREE.BufferGeometry
→ spike metrics/detail toggles
```

That violates the intended split:

```text
CaveTopology
→ CaveSpatialRepresentation
→ CavePresentation
```

### B1 split

Introduce a pure representation boundary conceptually equivalent to:

```text
CaveSdfSpatialRepresentation
  bounds
  sample(x, y, z) -> signed distance / solid-vs-void field
  structural primitive data if useful
```

Exact naming/modules should follow the code after implementation, not the plan wording.

Requirements:

- no Three.js import in the spatial representation;
- no `DebugSystemName` or presentation metrics dependency;
- SDF params remain representation-local, not fields on `CaveTopology`;
- mesh extraction consumes the representation;
- presentation clipping/material stays presentation/integration-side.

Do not introduce a generic framework for every possible implicit surface. A cave-specific pure SDF representation is enough.

---

## 5. Hard-coded `MAIN_CHAIN` blocks future topology

`sdfCaveMesh.ts` contains:

```ts
const MAIN_CHAIN = ['entrance', 'wide-transition', 'descending-passage', 'widening-bend', 'main-chamber']
```

`buildKeyframes()` then reconstructs that particular path by ids.

This means `CaveTopology` is nominally graph-based, but the winning renderer is still coupled to the exact Milestone-A fixture.

**B1 must remove this dependency.**

Use `topology.segments` / graph connectivity directly. For L1, graph traversal can remain simple and deterministic; do not build a general graph library unless required.

A short branch should be consumable without adding another hard-coded chain.

---

## 6. SDF representation details worth preserving

Current useful building blocks in `sdfCaveMesh.ts`:

- ellipsoid void primitives;
- `smin` smooth union;
- feature subtraction;
- bounded local field;
- `cellSize = 0.4` baseline;
- `smoothK = 0.9` baseline;
- `primitiveSpacing = 0.8` baseline;
- Naive Surface Nets with corrected winding;
- structural-vs-detail toggle concept;
- analytic-surface clipping after extraction.

Do not replace all of this merely because the file has spike naming.

### Known field constraint

Smooth union is spatial-only. The Milestone-A stress test proved disconnected void clusters can bridge when physically close enough.

B1 topology generation therefore needs a minimum separation/influence rule for sections not connected by topology.

Do not solve this by making `smoothK` nearly zero globally; that would damage the transition quality that made SDF win.

---

## 7. Cross-section direction for production L1

The requested size change is mainly **width/height/volume**, not route length.

Good starting ranges:

```text
passage          width 3.5–4.5 m   height 4.5–5.5 m
widening/bend    width 5–6 m       height 5.5–6.5 m
main chamber     width 9–10 m      height 9–11 m
```

Prefer gaining extra room downward where overburden is constrained rather than moving the ceiling upward symmetrically.

Keep route length around 20–30 m for L1 unless topology/terrain needs a modest adjustment.

---

## 8. Compatibility boundary during B1

Do **not** combine B1 with the complete gameplay/collision rewrite.

The existing path:

```text
topologyToCaveDefinition(topology)
→ createCaveVolume(...)
→ buildCaveWallColliders(...)
```

may remain as a temporary derived adapter through B1 so player movement and colliders do not become additional variables.

But document it as transitional:

- it is not authoritative cave space;
- it does not exactly match the SDF surface;
- Y-independent floor/ceiling collapse remains for B2;
- collider fidelity remains B3.

B1 should not make new production APIs depend on `CaveDefinition` radius/tunnel geometry.

---

## 9. Runtime/lifecycle boundary

Keep `createCaves.ts` as runtime owner.

Good existing behavior:

```text
world build:
  cheap definitions/topology/spatial metadata

activation:
  expensive BufferGeometry extraction

 deactivation:
  disposeObject3D + clearColliders
```

Do not generate all meshes at boot.

Do not add a cave chunk manager or second lifecycle owner.

Current activation threshold (`55 m`) means the Milestone-A ~112 ms SDF extraction can produce a visible main-thread hitch. Record/benchmark it during B1, but do not prematurely move to a worker before B4 profiling.

---

## 10. Files to start with

Primary B1:

- `src/world/createCaves.ts`
- `src/world/caveGenerator.ts`
- `src/world/largeCaves.ts`
- `src/world/caves/caveTopology.ts`
- `src/world/caves/spikeTestCave.ts`
- `src/world/caves/sdfCaveMesh.ts`
- `src/world/caves/clipBelowSurface.ts`
- related cave tests

Compatibility-only during B1:

- `src/world/caves/topologyAdapter.ts`
- `src/world/caveVolume.ts`
- `src/world/caveColliders.ts`

Do not touch the unrelated fauna habitat `type: 'cave'` / decorative cave-mouth spawner.

---

## 11. Suggested B1 implementation order

1. Extract stable cave identity / siting inputs needed by V2 without changing ids.
2. Introduce production topology builder with per-cave deterministic RNG.
3. Move overburden/terrain adaptation to production topology and stop using V1 layout as the acceptance authority.
4. Extract pure SDF spatial representation from `sdfCaveMesh.ts`.
5. Make the SDF representation consume topology graph/segments generically, removing `MAIN_CHAIN` coupling.
6. Make presentation extraction consume the SDF representation.
7. Rewire `createCaves.ts` to store production Cave V2 data directly.
8. Keep compatibility `topologyToCaveDefinition` only for current gameplay/collision until B2/B3.
9. Technically verify multiple caves/seeds, not only one comparison target.
10. After production SDF path is stable, remove Sweep/comparison runtime code if doing so remains a focused B1 cleanup.

---

## 12. Tests with highest value

Prioritise tests that catch architecture regressions, not visual tuning:

- same world seed + same cave identity => identical topology;
- same world seed + different cave identities => structural RNG is not identical clone data;
- topology generation independent of iteration order;
- full-footprint overburden maintained;
- steep terrain either adapts smoothly or rejects instead of creating an extreme entrance ramp;
- SDF field deterministic;
- SDF graph consumption works without Milestone-A node ids;
- a branch can be represented without a second hard-coded chain;
- disconnected sections respect the topology separation rule;
- extracted geometry has valid winding/no NaNs/bounds;
- activation/deactivation still rebuilds/disposes safely.

Browser verification is done by the Player, not the implementation agent.
