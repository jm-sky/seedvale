# Codebase domain audit 01: Runtime architecture & WorldBundle

**Date:** 2026-09-19  
**Area:** Runtime architecture & WorldBundle  
**Baseline:** current `main` during review; source paths below were re-read after the latest docs-only updates.  
**Result:** ⚠️ reviewed with unresolved high findings

## 1. Scope

Reviewed the application/world lifecycle boundary centered on:

- `src/app/createApp.ts`,
- `src/app/worldBundle.ts`,
- `src/app/gameLoop.ts`,
- `src/app/appRenderLoop.ts`,
- `src/app/actions/actionContext.ts`,
- `docs/architecture/ARCHITECTURE.md`,
- `docs/CODE_INDEX.md`,
- `docs/STATE.md` and persistence/lifecycle documentation,
- related implementation plans/reviews, especially `world-003`, archived plans 053/054 and review 002.

The traced lifecycle was:

```text
createApp
→ createWorldBundle / buildWorldSystems
→ critical WorldBundle + deferred background systems
→ runtime consumers / game loop
→ rebuildWorld
→ rebuildWorldBundle dispose → rebuild → publish
→ explicit dependency rebinding
→ app teardown / disposeWorldBundle
```

Persistence payload details, simulation time semantics and domain-specific off-screen behaviour are intentionally left to audit areas 02/03 except where they directly affect the WorldBundle lifecycle contract.

## 2. Entry points and state owners

### App/session owner — `createApp.ts`

`createApp()` is the composition root and owns the lifetime of the stable `WorldBundle` container plus long-lived systems that intentionally survive a world rebuild: PlayerController, QuestManager, inventory/player-facing state, map/location knowledge, render stack, audio, UI, save orchestration and several sparse authoritative registries.

World-rebuild carry state such as collected/renewable item state, planted crops/trees, terrain modifications, resource depletion, resource-site inventories and forage overrides is app-owned and passed back into the rebuilt world. This is deliberate; it is not a second live copy inside `WorldBundle`.

### World owner — `WorldBundle`

`WorldBundle` owns replaceable world-runtime systems: terrain/chunks, ocean, settlements, fauna, world items/buildables, caves, resources and the other world-side registries constructed/disposed together.

The important reference contract is sound in principle:

- the `bundle` object itself is stable,
- `rebuildWorldBundle()` replaces fields in place,
- long-lived consumers should read `bundle.X` lazily or use an explicit rebind API,
- a consumer must not retain a replaceable field across rebuild unless it is rebound.

### Background startup owner

Initial `createWorldBundle()` returns before all world systems are ready. `Fauna`, `ItemSpawners`, `DryingRacks` and `Beehives` start as inert stubs and are replaced through `backgroundReady`; the home settlement similarly has a separate `homeReady` boundary.

This mechanism was introduced by `world-003` and is only intended for initial boot. `rebuildWorldBundle()` awaits the background phase before returning.

## 3. Flows traced

### Initial boot

1. `createApp()` resolves config/save state and creates long-lived app/session owners.
2. `createWorldBundle()` enters `buildWorldSystems()`.
3. Critical world systems are created, including ChunkManager, ocean, settlements manager, caves, resources and world-side placement/state registries.
4. The returned bundle contains stubs for deferred systems.
5. Background work builds fauna/preloads concurrently, awaits `settlementsManager.homeReady`, then builds item spawners/drying racks/hives.
6. A generation predicate prevents the four deferred systems from being assigned when that background phase has become stale.
7. `createApp()` does **not** await `worldBundleBackgroundReady`; it continues composing quests/actions/player/UI and finally starts the render loop.

### Runtime

The game loop receives the stable bundle container and generally dereferences live fields per use. The previously established reference-safety pattern is visible in cave queries, world context, quest hooks, debug tooling, action context and graphics settings.

### Rebuild

1. `rebuildWorld()` guards duplicate rebuild requests with local `rebuilding`, cancels the current player intent and increments `worldGeneration`.
2. `rebuildWorldBundle()` snapshots carry-forward state.
3. It disposes the current world systems in place.
4. It builds a fresh set through `buildWorldSystems()`.
5. It awaits that build's `backgroundReady`.
6. It publishes the new fields with `Object.assign(bundle, fresh)`.
7. `createApp.ts` then refreshes projection/cache state and explicitly rebinds replaceable dependencies, including expedition dispatch, PlayerController ground samplers and related world-derived caches.

### Dispose

The returned app cleanup stops the render loop, disposes UI/audio/input/app owners, increments `worldGeneration`, disposes cache controllers, calls `disposeWorldBundle(bundle)`, then disposes player/render/worker resources.

The generation increment is intended to invalidate still-running world background work, but it does not currently make an in-flight rebuild cancellation-safe; see F3.

## 4. Findings

### F1 — high — initial composition snapshots deferred stubs/home-not-ready state

**Affected flow:** initial boot → background init → one-time quest/opportunity composition.

**Evidence:**

- `buildWorldSystems()` returns inert `Fauna`/item/rack/hive stubs and exposes `backgroundReady`.
- `createApp.ts` deliberately only attaches `worldBundleBackgroundReady.catch(() => {})` and proceeds.
- During that same one-time composition, `createApp.ts` calls `bundle.fauna.getSpawners()` while building:
  - `buildWorldDrivenSettlementQuests(...)`,
  - `buildHunterProfessionQuests(...)`,
  - Hunters Brotherhood investigation binding.
- It also derives home-only quest inputs from `bundle.settlementsManager.getLoaded()` (livestock, guard-evening torch/fire state), even though the home settlement has its own `homeReady` boundary.

The empty fauna stub returns an empty spawner list. If composition reaches these call sites before deferred fauna/home completion, the resulting `questDefs` / opportunity definitions are permanently materialized from incomplete inputs. Later in-place replacement of `bundle.fauna` does not rebuild those definitions.

**Why wrong:** startup scheduling can change gameplay content. The intended `world-003` contract says deferred scheduling must not change simulation semantics and callers needing built settlement state must use an explicit readiness boundary.

**Consumers:** world-driven settlement quests, Hunter profession chain, Hunters Brotherhood availability/binding, livestock-derived opportunities and guard-evening opportunity construction.

**Owner:** `world` composition/readiness contract, with quest consumers.

**Existing plan:** **yes — `world-003-faster-application-startup.md`**. It is still `verification needed` and explicitly requires consumer tracing, explicit readiness, no lost/inconsistent behaviour and correct background handling. Do not create a duplicate plan; this finding blocks successful verification of that plan.

**Next action:** fix/verify under `world-003`, preferably by making one-time consumers await the readiness they actually require or by changing them to live/deferred materialization without introducing a second quest/world owner.

### F2 — high — background initialization failure is intentionally swallowed and leaves a degraded world silently running

**Affected flow:** initial boot → deferred background initialization → runtime.

**Evidence:**

- `backgroundReady` rejects when fauna/preload/home-dependent item system initialization fails; `buildWorldSystems()` logs and disposes the deferred partial instances.
- `createApp.ts` immediately installs `worldBundleBackgroundReady.catch(() => {})` with no state transition, retry, user-visible failure or boot failure.
- Therefore the app can continue with the inert stubs for the rest of the session.

**Why wrong:** a failed deferred build can produce a playable-looking world missing fauna and/or item/rack/hive systems, while the failure is reduced to a console error. `world-003` explicitly requires background work to remain observable and failures to be handled correctly.

**Owner:** `world` startup/readiness.

**Existing plan:** **yes — `world-003-faster-application-startup.md`**. No duplicate plan created.

**Next action:** resolve under `world-003`; failure must have an explicit lifecycle outcome rather than silent catch-and-continue.

### F3 — high — an in-flight rebuild can publish a fresh world after app teardown

**Affected flow:** rebuild → teardown/cancellation → background completion → publish.

**Evidence:**

- app cleanup increments `worldGeneration` and calls `disposeWorldBundle(bundle)`;
- the rebuild passes `() => worldGeneration !== thisRebuildGeneration` into `rebuildWorldBundle()`;
- the stale check inside `buildWorldSystems()` only disposes the four deferred background instances and returns;
- after `await backgroundReady`, `rebuildWorldBundle()` unconditionally executes `Object.assign(bundle, fresh)`;
- `rebuildWorld()` then continues post-rebuild work (cache activation, prewarm, `player.setGround`, etc.) without an app-disposed guard.

So teardown can correctly mark the rebuild stale, but the fresh critical systems are still published onto the already-disposed stable bundle after teardown. The async caller can also continue using render/player resources that teardown has already disposed.

**Why wrong:** lifecycle cancellation does not own the whole rebuild transaction. This can resurrect live world references after disposal and leak newly created world/Three.js resources.

**Owner:** `world` / app lifecycle.

**Existing plan:** no active/planned plan found that owns this failure.

**Next action:** new `world-033-worldbundle-rebuild-transaction-and-lifecycle-safety.md`.

### F4 — medium — simulation continues while rebuild operates on disposed bundle fields

**Affected flow:** runtime tick → rebuild dispose/build window.

**Evidence:**

- `rebuildWorld()` has a local `rebuilding` flag, but that flag only rejects another rebuild and drives debug-GUI busy state.
- the render loop continues calling `gameLoop.tick()`;
- `rebuildWorldBundle()` disposes current bundle fields before awaiting creation/background readiness of the new world;
- no rebuild gate exists in `gameLoop.ts` or the render-loop callback.

This was already identified as Finding 6 in `docs/reviews/2026-08-08--002--app-performance-and-code-health.md`. Archived plan 053 explicitly called it separate follow-up work; current code still has the same gap.

**Why wrong:** runtime behaviour during the transition depends on disposed objects being benign. That is a fragile lifecycle contract and performs simulation/queries against an invalid world projection.

**Owner:** `world` / app lifecycle.

**Existing plan:** no dedicated active/planned plan found.

**Next action:** include in `world-033`; reuse one rebuild lifecycle gate rather than adding per-system guards.

### F5 — high — rebuild failure resumes the app with the old bundle already disposed

**Affected flow:** rebuild → destructive dispose → build/background rejection → `finally`.

**Evidence:**

- `rebuildWorldBundle()` disposes the current bundle before building the replacement.
- It has no transaction-level `try/catch` around fresh build/background readiness/publication.
- If `buildWorldSystems()` or its `backgroundReady` rejects, `Object.assign(bundle, fresh)` is never reached.
- `rebuildWorld()` has only `finally { gui.setBusy(false); rebuilding = false }`; it does not move the app into an explicit failed/reload state and does not stop the game loop.
- When background readiness rejects after `fresh` exists, only the deferred partial systems are cleaned inside the background phase; the already-created fresh critical systems are not owned by the old bundle and are not disposed by the caller.

**Why wrong:** a recoverable async initialization error becomes a broken mixed lifecycle: the stable container still points at disposed old systems, runtime resumes, and fresh critical resources may be orphaned.

**Owner:** `world` / app lifecycle.

**Existing plan:** no active/planned plan found.

**Next action:** include in `world-033` with explicit success/stale/failure outcomes and cleanup ownership.

## 5. Architecture observations

### Stable-container reference model is still the right mechanism

The central `WorldBundle` pattern remains coherent. Long-lived code mostly reads `bundle.X` at call time, and explicit one-time captures with replaceable terrain dependencies are rebound after rebuild. The archived 054 reference-safety work still matches current architecture.

Confirmed examples:

- cave ground/occupancy wrappers dereference `bundle.caves` live;
- `createWorldContext(() => bundle.chunkManager, ...)` resolves the current manager;
- `PlayerController.setGround(...)` is called after rebuild;
- `bindReadyExpeditionDispatch()` is deliberately called both at boot and after rebuild;
- map projection, world knowledge, guard knowledge and worldgen cache identities are refreshed after rebuild;
- stale wild-fauna quest targets are invalidated on same-world rebuild.

No second authoritative `WorldBundle` object or parallel world-state registry was found.

### App-owned carry state vs WorldBundle-owned runtime is intentional

Sparse/persistent app-owned state passed through rebuild is not accidental duplication. The current persistence architecture treats SaveData as serialization, while live state remains on the domain owner. Rebuild snapshots/carry inputs generally reuse the same domain snapshot/constructor seams as save/load.

### Documentation drift

The `WorldBundle` type comment still describes “the eleven world systems” even though the bundle now contains many more systems/registries/functions. This is a low-value wording mismatch, not a separate implementation plan; the useful invariant is “systems sharing the bundle rebuild/dispose boundary”, not the historical count.

## 6. Cross-domain dependencies / follow-ups

- **Quests/progression:** F1 manifests as missing/race-dependent quest opportunity definitions, but the root owner is startup readiness in `world-003`. Audit area 21 should treat the definitions as consumers, not create a second readiness mechanism.
- **Simulation/time:** F4 is a lifecycle gate finding. Area 02 should still independently review normal/time-skip simulation semantics, but should not duplicate the rebuild gate plan.
- **Persistence:** rebuild carry-forward looked structurally aligned with save/constructor seams at this level. Area 03 should verify field-by-field persistence continuity separately.
- **Rendering/Three.js lifecycle:** F3/F5 can leak or touch disposed render resources; area 06 may find domain-specific disposal issues, but publication/cancellation ownership belongs to `world-033`.

## 7. Existing plans that already cover findings

### `world-003-faster-application-startup.md` — `verification needed`

Covers F1 and F2. Its existing requirements already say:

- consumers of home settlement readiness must be traced;
- explicit readiness is preferable to exposing partial authoritative state;
- deferred work must not cause missing interactions/inconsistent simulation;
- background work must remain observable and handle failures correctly;
- startup scheduling must not change simulation semantics.

The current code does not yet satisfy those requirements for the findings above, so a new startup plan would be duplicate work.

### Archived 054 — WorldBundle reference safety

The stable-container/live-field-read rules from this completed refactor remain valid and should be preserved. No broad “replace WorldBundle” plan is warranted.

### Archived 053 / review 002

They document F4 historically, but there is no active implementation plan for it. The new plan below is therefore not a duplicate.

## 8. New plans required

Created:

- `docs/plans/world-033-worldbundle-rebuild-transaction-and-lifecycle-safety.md`

It owns F3–F5 as one coherent lifecycle boundary: suspend runtime while the world projection is invalid, make stale/teardown cancellation prevent publication/post-work, and make rebuild failure cleanup/outcome explicit.

No separate plan was created for F1/F2 because `world-003` already owns them.

## 9. Verification limits

This was a static code/architecture review on `main`.

Not performed:

- browser/gameplay verification,
- fault injection during asset/background initialization,
- teardown-during-rebuild reproduction,
- performance profiling,
- automated test execution (no production code was changed).

The findings above are based on explicit control flow and ownership/lifecycle paths. Browser verification remains the user's responsibility after implementation.

## 10. Master status update

Area 01 should be marked:

**⚠️ reviewed with unresolved high/critical findings**

Links:

- this review,
- existing `world-003` for startup readiness/failure handling,
- new `world-033` for rebuild transaction/lifecycle safety.
