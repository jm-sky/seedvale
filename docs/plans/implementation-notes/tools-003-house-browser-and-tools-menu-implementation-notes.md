# Implementation Notes: House Browser and Tools Menu

## Current codebase findings

- Plan `settlements-002-house-browser.md` is already implemented and technically verified. The current `?houseTest` flow is therefore the feature being replaced, not missing groundwork.
- `src/debug/createHouseTestScene.ts` already contains the minimal standalone scene and currently creates the same `ConstructionCatalog → loadHousePartTemplates → HouseBuildContext → buildHouse` pipeline. Reuse these responsibilities rather than designing another house renderer.
- `src/debug/houseTestDefinition.ts` owns the existing URL lookup/normalisation. Matching is case-insensitive and the missing value selects the first available definition. Reuse this logic or move its pure lookup without duplicating matching rules.
- `src/settlement/houseBuilder.ts` is authoritative. `HouseAssembly` exposes `definition`, `definitionId`, `root`, `doors`, `interactionPoints`, `census`, `update()` and `dispose()`.
- Important discrepancy with the plan: `HouseAssembly` does not expose a `colliders` field. The authoritative read-only API already exists as `buildAssemblyCollidersWorld(assembly)`. Use it instead of recreating collider geometry. If a stable assembly-level accessor is useful, prefer a minimal builder API extension over browser-specific collider state.
- Existing collider construction is already split into pure helpers: `buildHouseWallCollidersLocal()`, `buildHouseDoorCollidersLocal()`, `transformHouseCollidersToWorld()`. Do not duplicate their wall/door geometry math.
- `HouseAssembly.census` already supplies all counts needed by House Info: static meshes/instances, interactive meshes and total renderables.
- `HouseDefinition` already contains `id`, optional `label`, `footprint`, optional `sizeClass` and other metadata. `HOME_HOUSE_DEFINITIONS` is the current complete source.
- `ConstructionCatalog` is browser-safe/data-driven: it uses generated audit JSON and `mergeParkedManifest`, with no runtime filesystem dependency.
- `createRenderer()` is already suitable for a standalone tool. Reuse it instead of creating another renderer setup.
- `src/tools/assetBrowser/main.ts` is the existing standalone Vue-tool entrypoint. It mounts a Vue app and creates its Three.js viewer after the viewport exists. Follow this lifecycle style where useful, but keep House Browser scene ownership explicit.
- The Vite alias ``@ points to `src/ui-vue`. Standalone browser code should avoid accidentally importing gameplay `store.ts` / `App.vue`.

## Tools menu integration

- The current in-game main/pause UI is Vue-based: `PauseMenu.vue` switches between main, Actions, Settings and Saves; `PauseMenuEntriesMain.vue` is the actual top-level entry list.
- There is currently no central tool registry. A small data-only registry under `src/tools` is appropriate (for example `src/tools/toolRegistry.ts`). Keep it free of Three.js and browser implementations.
- Add `Tools` as a pause-menu screen/submenu using the existing screen/event pattern. Do not instantiate either browser from the menu.
- Navigation should be plain URL navigation to `/house-browser` and `/asset-browser`. There is no app router, and these are separate applications.
- The existing Asset Browser is `asset-browser.html` + `src/tools/assetBrowser/main.ts`. The registry should point at its public route without importing it.
- Keep the registry dependency-light so future tools do not enter the gameplay bundle.

## House Browser scene

- Prefer a small scene controller owning renderer, Scene, camera, OrbitControls, ground/grid/lights, current assembly and collider preview. Vue owns selection/config only.
- Selection must come from `HOME_HOUSE_DEFINITIONS`. Do not create a second definition registry.
- `setHouse()` must use a monotonically increasing generation/token. If an older async load finishes after a newer selection, dispose the newly built stale assembly and never attach it.
- `loadHousePartTemplates()` already loads unique asset ids concurrently; no worker or new cache is justified for this standalone tool.
- Use `HouseAssembly.dispose()`. Do not manually dispose shared catalog/audit resources.
- For v1, doors are initially closed and there is no gameplay interaction. A continuous `assembly.update()` call is not needed unless door animation is intentionally exposed.
- Camera fitting can reuse the existing `Box3().setFromObject(assembly.root)` approach from `createHouseTestScene.ts`, but expose it through reset/fit methods.
- `HouseBuilder` already applies `HouseDefinition.transform` to `assembly.root`. Do not apply it again in camera or collider code.
- Browser assemblies are local to their own origin; use `buildAssemblyCollidersWorld(assembly)` for the preview rather than deriving collider positions from mesh bounds.

## Collider preview

- `src/debug/colliderDebugView.ts` currently renders nearby gameplay colliders via two fixed-capacity `InstancedMesh` objects and is tied to the world query callback. Its visual primitive is reusable, but its current per-frame/query API is not a good House Browser contract.
- Refactor/extract only enough to share the circle/OBB rendering. Preserve `createColliderDebugView()` compatibility for `?debugColliders=1`.
- The House Browser preview consumes readonly authoritative `Collider[]` and never writes to the gameplay collision registry.
- Padding is visual-only. Apply it when building preview matrices or through a pure `inflateCollider()` value helper; never mutate the source collider.
- Support both circle and OBB even though current house wall/door colliders are OBBs.
- Padding changes should update instance matrices/counts, not recreate geometries, and should not run every frame.
- The existing gameplay preview uses height 2.4m only as a visualization volume; collider data itself has no Y extent. Keep this distinction.
- `buildAssemblyCollidersWorld()` reflects current door state. Since the browser has no door interaction, its initial closed-door state is the relevant v1 state.

## Styling and entrypoint

- `asset-browser.html` uses its own root and imports the existing shared `src/ui-vue/tailwind.css` from its Vue entrypoint. Prefer the same Tailwind setup for House Browser instead of duplicating the project's Tailwind theme/plugin/font configuration.
- A local `src/house-browser/style.css` can contain only browser-specific full-viewport rules.
- Do not import `App.vue`, gameplay `store.ts`, `createApp.ts`, world bundle or save systems into the browser.

## Removing the old flow

- Remove the hand-generated selector panel from `createHouseTestScene.ts`; it currently injects CSS and links to `?houseTest=...`.
- Remove the `isHouseTestMode()` boot branch from `src/main.ts` only after checking all references. Keep `modelTest` and unrelated debug flags unchanged.
- Remove `isHouseTestMode()` / `houseDefinitionFromUrl()` only if no other code uses them; do not delete shared debug infrastructure.
- Keep the gameplay `?debugColliders=1` overlay working through any collider preview refactor.
- Do not change normal `createApp()` boot ordering or make gameplay load browser-specific Vue modules.

## Tests and pitfalls

- Existing `src/settlement/houseBuilder.test.ts` is the natural place for pure house/collider builder tests; browser-only helpers can have focused tests in `src/house-browser`.
- Current real definition ids are kebab-case (for example `house-8x6-a`), while the old plan's sample `HOUSE_8X6_A` is stale. Test against actual current ids and preserve existing normalisation semantics where compatibility matters.
- Test stale async loads with deferred promises: select A, then B, resolve A last, and assert A was never attached and was disposed.
- Test `inflateCollider` for circle, OBB, zero padding and source immutability.
- `HouseAssembly.dispose()` disposes the assembled object tree; do not add per-selection global asset disposal that could invalidate loader/cache resources.
- Prefer explicit Vue mount/unmount lifecycle over a MutationObserver unless the component structure genuinely requires it.
- `vite.config.ts` needs the new HTML input. Verify that dev and production both serve the requested `/house-browser` route; the source file is `house-browser.html` and the existing Asset Browser provides the closest routing precedent.
- Let `HouseBuilder`'s existing catalog validation errors surface as browser errors. Never fall back to another house or registry.

## Suggested implementation order

1. Add the standalone HTML/Vue entry and scene controller by extracting the working `createHouseTestScene` pipeline.
2. Move selection to reactive Vue state while retaining the existing definition source/lookup semantics.
3. Add house info plus scene/camera controls.
4. Add read-only collider preview using `buildAssemblyCollidersWorld()` and a minimal shared/refactored visual helper.
5. Add pure padding, lookup and async-generation tests.
6. Add the lightweight Tools registry and pause-menu submenu with URL-only navigation.
7. Remove the old `?houseTest` boot path after reference checks.
8. Extend Vite input and verify both standalone tool routes.
9. Run type-check, lint, test and build; browser verification remains necessary for Three.js correctness.

