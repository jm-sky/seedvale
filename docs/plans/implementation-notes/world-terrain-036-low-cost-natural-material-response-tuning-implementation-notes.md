# Implementation notes: world-terrain-036 low-cost natural material response tuning

**Reviewed:** 2026-09-16  
**Plan:** `docs/plans/world-terrain-036-low-cost-natural-material-response-tuning.md`

## Current code facts

- `src/assets/loadGltf.ts`
  - `loadCached(url)` owns one cache entry per URL.
  - The cache root's geometries/materials are marked `userData.sharedGpu = true`.
  - `loadGltf()` / `loadGltfAsset()` clone object hierarchies but reuse cached GPU resources; this is why a material correction must not clone per visible instance.
  - `disposeObject3D()` deliberately skips shared GPU resources.
- `src/settlement/propUtils.ts`
  - `loadPropOrFallback()` / `loadPropTemplates()` are generic loading seams.
  - `tintPropMaterials()` is the wrong mechanism here: it intentionally clones every material so a tint can be instance-owned.
- `src/settlement/propSpecs.ts`
  - `ROCK_SPECS`: `rock_a.glb` … `rock_e.glb`.
  - `ROCK_CLUSTER_SPECS`: `rock_cluster_a.glb`.
  - `TREE_SPECS`: living deciduous, birch/maple, pine and dead-tree variants.
  - `FALLEN_LOG_SPECS`: two normal logs + moss variant.
- `src/world/foliageWind.ts`
  - foliage matching is `/leaves|green|flowers/i`;
  - bark names (`Wood`, `*Bark`) are intentionally excluded from foliage handling.
  - do not couple material response tuning to foliage wind timing or alpha hardening.
- `docs/architecture/GRAPHICS.md`
  - GLB materials are shared by URL (G15).
  - performance is an architectural constraint (G2).
  - no new pass/texture mechanism is justified for this plan.

## Recommended ownership

Use an **opt-in shared-material policy**, not a post-clone instance mutation.

The implementation should have one small helper/module whose input is an already loaded shared template/root plus an explicit profile (`rock` or `wood`). The caller that loads the known nature template applies the profile once before the template is used for placement.

Do not make `loadGltf.ts` infer material classes for every asset in the project. If integrating at loader/cache level is cleaner, the mapping must still be an explicit URL/profile allow-list owned by the nature/rendering domain, not a generic name regex over all GLBs.

Because exact authored material names/roughness values live inside binary GLBs, do a **bounded preflight only for the explicit URLs above** before choosing bark material-name matches. Do not turn this into a repository-wide asset audit. The resulting matcher/list should be explicit and testable.

## Scalar correction contract

Keep the policy deliberately conservative:

- only operate on `MeshStandardMaterial`-compatible materials with numeric `roughness` / `metalness`;
- never replace `map`, `normalMap`, `roughnessMap`, `metalnessMap`, alpha properties, colors or vertex-color flags;
- rock: cap `metalness` near zero and enforce only a moderate roughness floor;
- wood/bark: same pattern, with a higher roughness floor if browser tuning supports it;
- use clamps/minimums rather than assigning one canonical value to all authored materials;
- mark policy application on the shared material (`userData`) or make the math naturally idempotent so repeated loads cannot drift values.

Do not add uniforms, `onBeforeCompile`, `customProgramCacheKey`, shader defines or material type replacement. Any of those would invalidate the low-risk premise.

## Important call sites

Inspect only the current nature-template loading paths before wiring:

- `src/terrain/chunkManager.ts` — rock/tree/log templates used by streamed chunks;
- settlement forest/tree code that consumes `TREE_SPECS`;
- any cave/interior rock path that reuses these same GLBs versus procedural/shared instanced templates.

The objective is to ensure the same URL receives one consistent profile regardless of which consumer loads it first. Do not duplicate tuning calls with different constants in multiple domains.

## Tests

Prefer a focused pure/material unit suite for the new helper.

Cover:

- preserves material object identity;
- preserves texture/map references and color;
- scalar clamping for an intentionally glossy/metallic synthetic rock material;
- already-valid authored values do not get overcorrected;
- repeated application is idempotent;
- foliage material name/sample is rejected by wood policy;
- non-`MeshStandardMaterial` materials are ignored safely.

If integration is URL-driven, add a small test proving only the explicit natural asset set maps to profiles; a random settlement/NPC URL must return no profile.

## Browser verification handed to User

Compare before/after at fixed time/weather where possible:

1. `rock_a`/another rock in direct sun and shade;
2. living tree trunk with foliage visible in the same shot;
3. dead tree;
4. fallen log, including moss variant if present nearby.

Watch specifically for:

- textured materials becoming visually flattened,
- bark foliage accidentally losing transparency/wind,
- rocks becoming uniformly chalky,
- a material change appearing only after another consumer happens to load the same URL (ownership/order bug).

Performance expectation: no measurable steady-state CPU/GPU change. A program-count increase or extra material count attributable to this plan is a regression, not an acceptable trade-off.

> **Zrób git commit i push do main, rebase jeżeli trzeba**