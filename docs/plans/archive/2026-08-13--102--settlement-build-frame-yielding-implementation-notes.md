# Implementation Notes: Settlement Build Frame Yielding

**Plan:** [2026-08-13--102--settlement-build-frame-yielding.md](./2026-08-13--102--settlement-build-frame-yielding.md)
**Issue:** [027 — settlement streaming main-thread freeze](../issues/2026-08-13--027--settlement-streaming-main-thread-freeze.md)

## Status (2026-08-13)

Implemented as planned, no deviations.

- **New:** `src/settlement/frameYield.ts` — `createPropYieldGate()`, a per-build counter that
  `await`s a real `requestAnimationFrame` yield every `PROPS_PER_YIELD` (4) calls.
- **`src/settlement/props.ts`:**
  - `buildSettlementProps` creates one `yieldProp` gate at the top and calls `await yieldProp()`
    after each per-item placement: the `clearings.houses` loop, the barrel-spot loop, the hay
    loop, both `placeTorchAt` call sites (plaza ring + gate flanks), the plaza-tree loop, and
    after each of the four `plantTreeCluster` calls (near/mid/far/fill belts).
  - `plantEntrancePalisade` gets its own independent gate (`yieldStake`) — it's a separate
    async function with its own side×segment loop over cached wall-stake clones.
  - Single-shot props (well, stockpile, garden(s), market stall, campfire, second stockpile)
    were left unwrapped per the plan — they ride along under the surrounding loops' shared
    counter and aren't worth the extra call sites on their own.
- **Also fixed while auditing review 005 follow-ups (small, unrelated to the main fix):**
  - `src/ui-vue/mount.ts` — `./store` was dynamically imported alongside `vue`/`App.vue` even
    though ~20 other modules already import it statically, so Vite had to bundle it eagerly
    regardless (dead code-splitting intent, review 005 AS3). Switched to a static import; build's
    "dynamically imported but also statically imported" warning is gone.
  - `docs/STATE.md` — stale reference to `render/filmGradeShader.ts`, which review 005 §A3.1
    removed (merged into `render/gradedOutputPass.ts`). Updated to point at the current file.

## Why no explicit before/after profiling number

Per CLAUDE.md, browser-only verification (GUI Performance panel `Simulate (ms)` while walking a
non-home settlement into `loadRadius`) needs a live dev server and is left to the user — see
"Verification" below. The fix's safety doesn't depend on the measurement: it only inserts
`await` points into an existing `async` function without touching call order, RNG consumption,
or any placement math (verified by re-reading every touched loop after editing — same seeded
`random()`/`coreRandom()` calls in the same order, same conditionals).

## Verification

- ✅ `npx tsc --noEmit`, `npm run lint`, `npm run build` (1,237 kB main chunk warning persists —
  expected, that's `AS3`'s sibling finding about `createSky.js`, not touched by this plan),
  `npm run test` (75 files / 517 tests) — all clean.
- ⬜ **Not browser-verified.** Manual check needed: walk toward a non-home settlement until it
  streams in (crosses `loadRadius`), watch the debug GUI's Performance → `Simulate (ms)` — should
  stay in the low-to-mid single digits per frame (a small bump is expected/fine) instead of a
  single ~89 ms spike, and houses/props should visibly pop in over a handful of frames rather
  than all at once. Final layout should look identical to before (same props, same positions) —
  only the timing of when each appears changes.
