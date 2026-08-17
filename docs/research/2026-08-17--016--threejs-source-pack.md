# Research 016: Three.js source pack — architecture & performance audit

**Status:** `reference`
**Date:** 2026-08-17
**Purpose:** Curated Three.js documentation, maintainer discussions and dependency sources for the planned Seedvale Three.js architecture/performance audit.

This is a source pack, not an implementation plan. The sources below should be used as primary references when auditing the current Seedvale implementation against Three.js recommendations.

---

## How to use this source pack

For each recommendation found during the audit:

1. Compare it against the actual Seedvale code.
2. Verify that it applies to the installed `three@0.185.1`, or explicitly note if it applies only to a newer release.
3. Distinguish the evidence level:
   - **Official recommendation** — Three.js documentation/manual.
   - **Maintainer guidance** — Three.js GitHub issue/discussion or maintainer comment.
   - **Community workaround** — community discussion without official endorsement.
   - **Own inference** — conclusion derived from Seedvale code and the sources.
4. Do not treat an issue or community workaround as an official best practice merely because it appears in a Three.js discussion.
5. Prefer small, evidence-based changes over broad refactors.

---

## 1. WebGLRenderer — shader compilation, debugging and renderer configuration

**Source:** Three.js official `WebGLRenderer` documentation

https://threejs.org/docs/pages/WebGLRenderer.html

Relevant topics:

- `compile()` and `compileAsync()`
- `KHR_parallel_shader_compile`
- `renderer.debug.checkShaderErrors`
- `renderer.info`
- `outputColorSpace`
- `toneMapping`
- renderer initialization and configuration

### Important guidance

`compileAsync()` is the asynchronous form of `compile()` and is intended to help avoid shader compilation stutter when programs are first used. It relies on `KHR_parallel_shader_compile` when available.

`renderer.debug.checkShaderErrors` controls shader compilation/link error checking. The documentation recommends keeping shader error checking enabled during development; disabling it may provide a performance benefit in production.

**Seedvale implication:** `checkShaderErrors=false` must not automatically be considered a permanent architectural fix for the streaming hitch. It should be treated as an explicit tradeoff and its actual effect on the current Three.js 0.185.1 call paths must be verified.

---

## 2. Color Management

**Source:** Three.js official Color Management manual

https://threejs.org/manual/en/color-management.html

Relevant topics:

- Linear-sRGB working space
- output color space
- texture color spaces
- render target color spaces
- tone mapping
- color conversion at the end of the rendering pipeline

### Important guidance

Three.js uses Linear-sRGB as the working color space for lighting/rendering and performs output conversion to the display color space at the end of the pipeline.

Render targets can participate in the color-management pipeline, so render-target state can affect rendering/program configuration.

**Seedvale implication:** the water mirror pass and main render using different render-target/output state must be audited carefully. In particular, verify the interaction between render targets, `colorSpace`, `toneMapping` and Three.js program cache keys rather than assuming that the same material necessarily maps to one program variant.

---

## 3. Post Processing

**Source:** Three.js official Post Processing manual

https://threejs.org/manual/en/post-processing.html

Relevant topics:

- `EffectComposer`
- render passes
- pass ordering
- final output processing
- `OutputPass`

### Important guidance

The official post-processing model is a chain of passes rendered through `EffectComposer`, with output conversion/tone mapping performed at the end of the chain.

**Seedvale implication:** audit `EffectComposer`, N8AO and the water mirror path together. Avoid assuming that a post-processing pass is only a fullscreen effect; some passes may render the scene themselves and therefore introduce additional scene draws/program use.

---

## 4. OutputPass

**Source:** Three.js official `OutputPass` documentation

https://threejs.org/docs/pages/OutputPass.html

Relevant topics:

- tone mapping
- color-space conversion
- final output pass in a post-processing pipeline

### Important guidance

`OutputPass` performs the final tone mapping and color-space conversion required when using post-processing.

**Seedvale implication:** verify whether Seedvale's current tone-mapping/color-space setup follows this model and whether any earlier pass is performing output conversion that should instead happen only at the final output stage.

---

## 5. Resource disposal and streaming lifecycle

**Source:** Three.js official cleanup/disposal manual

https://threejs.org/manual/en/how-to-dispose-of-objects.html

Relevant topics:

- geometry disposal
- material disposal
- texture disposal
- render-target disposal
- post-processing resource disposal
- `renderer.info`

### Important guidance

Three.js does not automatically know when application-owned GPU resources are no longer needed. Applications are responsible for disposing resources such as geometries, materials, textures and render targets.

`renderer.info` can be used to inspect renderer resource counts and diagnose resource growth.

**Seedvale implication:** chunk streaming must be audited for resource lifetime, especially when chunks, terrain materials, water textures, fauna and render-related resources are created and removed repeatedly.

---

## 6. KHR_parallel_shader_compile / shader compilation stalls

**Source:** Three.js GitHub issue #16321

https://github.com/mrdoob/three.js/issues/16321

Relevant topic:

- `KHR_parallel_shader_compile`
- asynchronous shader compilation
- `COMPLETION_STATUS_KHR`
- browser/driver synchronization behaviour

### Why this matters to Seedvale

The discussion documents the implementation and practical considerations around `KHR_parallel_shader_compile`. Historical browser/driver behaviour discussed there includes cases where querying completion status could itself interact with shader compilation and cause waiting.

**Seedvale implication:** the current streaming hitch trace naming `getProgramParameter()` must be broken down by call site. In particular, determine whether the expensive call is `COMPLETION_STATUS_KHR`, `LINK_STATUS`, `ACTIVE_ATTRIBUTES`, or another call before choosing a mitigation.

This source is maintainer-level technical evidence, not a blanket recommendation to use any particular workaround described in the issue.

---

## 7. N8AO documentation

**Source:** N8AO package documentation / npm

https://www.npmjs.com/package/n8ao

Relevant topics:

- WebGL2 requirement
- Three.js compatibility
- N8AO render pipeline
- render targets
- shader compilation/reconfiguration
- `halfRes`
- transparency-aware rendering

### Important guidance

N8AO is not merely a passive material effect. Its pass can render the scene and uses its own render targets and shaders.

Changing N8AO quality/configuration can trigger shader recompilation and should generally be treated as initialization/configuration work rather than something to change continuously during gameplay.

`halfRes` can significantly reduce AO cost, while transparency-aware modes can increase rendering work because relevant objects may be rendered more than once.

**Seedvale implication:** audit N8AO as part of the whole render pipeline. Its manually configured render targets and depth textures are particularly relevant to the current `GL_INVALID_OPERATION` sampler-mismatch investigation.

**Important:** do not assume that `n8ao@2.0.1` fixes Seedvale's sampler mismatch until the actual installed package/version and release contents are verified.

---

## 8. WebGL texture/sampler mismatch discussions

**Source:** Three.js Discourse — texture format/sampler mismatch

https://discourse.threejs.org/t/error-mismatch-between-texture-format-and-sampler-type/51445

**Source:** Three.js Discourse — DepthTexture / sampler2DShadow

https://discourse.threejs.org/t/depthtexture-is-not-binding-to-sampler2dshadow/40810

Relevant topics:

- texture internal format vs GLSL sampler type
- render-target attachments
- `DepthTexture`
- shadow samplers
- WebGL validation errors

### Why this matters to Seedvale

The current errors:

```text
GL_INVALID_OPERATION: glDrawElements: Mismatch between texture format and sampler type
GL_INVALID_OPERATION: glDrawElementsInstanced: Mismatch between texture format and sampler type
GL_INVALID_OPERATION: glDrawArrays: Mismatch between texture format and sampler type
```

are consistent with a real mismatch between the texture format/type bound to a sampler and the sampler category expected by the shader.

The current Seedvale hypothesis is N8AO's manually configured MRT/depth resources, but this remains a hypothesis until reproduced and isolated.

These are community/technical discussions, not official blanket recommendations.

---

## 9. Current Seedvale investigation context

The source pack is intended to be used together with:

- `docs/research/2026-08-17--015--streaming-hitch-gl-errors-handoff.md`
- `docs/research/2026-08-17--014--compileasync-prewarming-ab-experiment-results.md`

The current investigation has two separate problems:

### Streaming hitch

High-confidence mechanism:

```text
chunk streaming
  → new material/program variant enters the scene
  → water mirror render uses a program variant for the first time
  → synchronous WebGL program/shader-related work
  → very large frame hitch
```

The current trace showed `getProgramParameter()` as the dominant sampled function. The exact call site remains unresolved.

### GL_INVALID_OPERATION sampler mismatch

The errors are reproducible on current main without the reverted `compileAsync()` experiment code. N8AO remains the leading hypothesis, but the installed dependency version and lockfile state must be verified before drawing conclusions.

---

## 10. Audit checklist for Claude Code

When performing the Seedvale Three.js audit, inspect at minimum:

- [ ] Three.js version actually installed and resolved.
- [ ] `WebGLRenderer` initialization/configuration.
- [ ] `checkShaderErrors` usage and whether it is intentionally configured.
- [ ] `compile()` / `compileAsync()` usage or absence.
- [ ] `KHR_parallel_shader_compile` behaviour in the installed Three.js version.
- [ ] program cache variants caused by render-target/color-management state.
- [ ] water mirror render target configuration.
- [ ] post-processing / `EffectComposer` / `OutputPass` architecture.
- [ ] N8AO version, render targets, depth textures and compatibility.
- [ ] texture formats/types vs GLSL sampler declarations.
- [ ] resource disposal during chunk streaming.
- [ ] renderer resource counts during repeated streaming.
- [ ] unnecessary shader/material/program variants.
- [ ] render-target allocation/reuse.
- [ ] expensive per-frame state changes.
- [ ] whether recommendations apply specifically to Three.js 0.185.1 or only newer versions.

Do not turn this audit into a broad refactor. The goal is to identify concrete, evidence-backed deviations or opportunities and rank them by expected impact and implementation risk.
