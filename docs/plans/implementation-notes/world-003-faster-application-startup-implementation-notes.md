# Implementation notes — plan world-003: Faster Application Startup

**Implemented:** 2026-08-27 · **Plan:** [world-003-faster-application-startup.md](../world-003-faster-application-startup.md)

## 1. Core mechanism: `createWorldBundle()` returns before the world is fully built

`buildWorldSystems()` (`src/app/worldBundle.ts`) now splits into a **critical phase** (awaited, unchanged in spirit) and a **background phase** (kicked off but not awaited by `createWorldBundle`):

```text
critical phase (awaited)                          background phase (not awaited by createWorldBundle)
  waterMirror                                        fauna (needs only homeDef — runs concurrently
  buildChunkManager                                    with the home settlement's own build, not after it)
  waitForChunks(homeChunks())                        preloadItemGlbModels / preloadHeldToolModels
  createWorldContext / buildOcean                    ── await settlementsManager.homeReady ──
  buildResourceDeposits                              itemSpawners (needs home.landmarks)
  createPlayerGardens / createFoodSourceHooks        dryingRacks (needs home.landmarks.stockpile)
  createHuntingHooks                                 hives (needs home.landmarks.trees)
  buildSettlementsManager (now fast, see §2)
  droppedItems/placedFires/Tents/Traps/Containers/
    playerWells/terrainPreparations
  createLargeCaves (only needs homeDef.size)
```

`buildWorldSystems()` returns `{ bundle, backgroundReady }`. `bundle` is a fully valid `WorldBundle` from the moment it's returned — `fauna`/`itemSpawners`/`dryingRacks`/`hives` are inert stubs (`createEmptyFauna`/`createEmptyItemSpawners`/`createEmptyDryingRacks`/`createEmptyBeehives`, all in `worldBundle.ts`) until the background phase replaces them **in place** via `Object.assign(bundle, {...})` — the exact same "mutate fields on the stable object, never replace it" mechanism `rebuildWorldBundle()` already used for a full rebuild (see `ARCHITECTURE.md`'s rebuild/lifetime invariants), just applied to the tail of the *initial* build too.

`createApp.ts`'s own structure is otherwise untouched: it still does `await createWorldBundle(...)`, then proceeds through inventory/quest/action/HUD wiring exactly as before. Because that whole sequence is synchronous (no other `await` sits between it and `renderLoop.start()`/`loadingScreen.hide()` besides the pre-existing `PlayerController.create()` and `prewarmRenderPrograms()`, neither touched here), making `createWorldBundle()` itself resolve earlier is sufficient to make the player controllable earlier — no need to split `createApp.ts`'s control flow or move the loading-screen/game-loop start around.

## 2. `SettlementsManager.home` is now `Settlement | null`, built the same way a streamed-in neighbor is

`createSettlementsManager()` used to `await createSettlement(...)` for the home settlement (0,0) before it could return anything at all — the single largest piece of `createWorldBundle`'s critical path (~1.5s in the plan's baseline), even though nothing about the player's spawn/movement actually needs the *built* settlement (houses/NPCs/livestock), only its **site** (`SettlementDef.x/y/z`), **id** and **size** — all already resolved synchronously by `defFor({gx:0,gz:0})`.

The home settlement is now kicked off the same way `ensureLoaded()` already streams in a neighbor (fire-and-forget, tracked in the same `entries` map), just immediately instead of waiting for the player to wander into range:

- `SettlementsManager.home` is a **live getter** (`get home()`) returning `Settlement | null` — `null` until the background build resolves.
- `SettlementsManager.homeReady: Promise<Settlement>` is the explicit readiness signal for a caller that needs the *built* settlement (landmarks/NPCs/livestock) — used by `worldBundle.ts`'s deferred item spawners/drying racks/hives.
- `SettlementsManager.getHomeDef()` (already existed, unchanged) is the fast path — synchronous, available immediately, and what `buildFauna` and the player's own spawn-point calculation use instead of waiting on `home`.
- A `disposed` guard mirrors `ensureLoaded`'s existing "player wandered back out of range" cancellation: if `dispose()` runs before the home build resolves, the just-built `Settlement` is disposed instead of being added to a scene/entries map that's already gone.

`buildFauna()` (`worldBundle.ts`) was refactored to take `SettlementDef` instead of `Settlement` — its only real dependencies are `center`/`id`/`size`, all on the def. This decouples fauna from waiting on the home settlement's full build entirely: it now runs via `Promise.all` alongside `settlementsManager.homeReady`/preloads rather than serially after `settlementsManager` resolves (§4 of the plan).

## 3. Player spawn point no longer waits on the built settlement

`createSettlement.ts`'s `spawn` field was `new Vector3(site.x + 3.5, sampleHeight(...), site.z - 3)` — a pure function of `SettlementDef` + terrain height, computed near the *end* of `createSettlement()` even though it doesn't depend on anything built along the way (houses, NPCs, livestock). Extracted into `settlementSpawnPoint(def, sampleHeight)`, exported and reused by both `createSettlement.ts` (unchanged value) and `createApp.ts`'s own spawn-point calculation — so the two can never drift apart, and `createApp.ts` no longer needs `bundle.settlementsManager.home` to be ready to position the player on a fresh game. The landmark-quest anchor closure (`createApp.ts`, `buildLandmarkQuests`) was similarly switched from `.home.center.x/z` to `getHomeDef().x/z` (the same value, always available).

## 4. Staleness guard for the background phase

Since `createWorldBundle()`'s background phase isn't awaited by its caller, it's possible (if narrow) for it to still be in flight when the app either tears down or the user triggers a world rebuild ("New World" / a terrain-param change) within the first second or so of boot. `buildWorldSystems()` takes an `isStale: () => boolean` callback, checked right before the background phase's `Object.assign` — if stale, the freshly-built fauna/item spawners/drying racks/hives are disposed instead of kept (mirroring the same cancellation pattern `SettlementsManager`'s own `ensureLoaded`/home-build use). `createApp.ts` implements this with a single `worldGeneration` counter, bumped by the rebuild handler and by the app's own teardown, both captured/compared via a closure passed as `isStale`.

`rebuildWorldBundle()` reuses the same `buildWorldSystems()` internally but **fully awaits `backgroundReady` before returning** — its external contract and timing are unchanged; every system (including fauna/item spawners/drying racks/hives) is guaranteed ready by the time it resolves, exactly as before this plan. Deferred initialization was deliberately scoped to the *initial* boot only (plan's "Rebuild / persistence considerations" §): a rebuild is a rarer, deliberate user action where a brief loading state during the transition remains acceptable UX, and reusing the shared `buildWorldSystems()` body without also making rebuild's *own* return "early" avoids a second staleness-vs-staleness race (an in-flight rebuild being superseded by *another* rebuild) that the single-flag guard above doesn't cover and that isn't needed for the plan's actual goal (time to first playable on a fresh boot).

## 5. What was deliberately not changed

- **`waitForChunks(homeChunks())` (terrain wait) is unchanged** — still waits for the full pinned 3×3 home block before `buildSettlementsManager` runs. `ChunkManager.readField()` already has a raw-noise fallback for height sampling on a not-yet-ready chunk (used by `settlementDefFor`/spawn-point math regardless of streaming state), so shrinking this wait was technically possible, but doing so risks a visible hole/pop-in exactly where the player spawns and a small chance of the home settlement's site-search picking a placement based on the fallback noise instead of the finalized heightfield (terrain modifications/preparations included). Given the settlement-decoupling and fauna/preload changes already remove the two largest pieces of the critical path after the terrain wait, this was left as a follow-up rather than risking a subtly-wrong site placement — see `docs/plans/LOOSE-ENDS.md`.
- **`ItemSpawners`/`DryingRacks`/`Beehives` still wait for the full home settlement** (via `homeReady`) — they need `home.landmarks` (trees/campfire/garden/stockpile positions), which only exist once `buildSettlementProps` finishes; there's no cheaper source for these positions.
- **`LargeCaves` was moved onto the fast/critical path** (not deferred) — it only needs `homeDef.size` (sync), so there was no reason to defer it; §6 of the plan ("classify remaining systems") applies here as "safe to build immediately, once decoupled from `.home`."
- No IndexedDB terrain caching, no new Web Workers, no rewrite of terrain/settlement/fauna generation — all explicitly out of scope per the plan, untouched.

## 6. Boot-time instrumentation (plan §1)

Every previously-unattributed step inside `buildWorldSystems()` now has a `bootMark`/`bootMarkEnd` pair (`createWaterMirror`, `createWorldContext`, `buildOcean`, `buildResourceDeposits`, `createPlayerGardens`, `createFoodSourceHooks`, `createHuntingHooks`, `createLargeCaves`), plus one combined mark for the cluster of fast/cheap synchronous world-object constructors (dropped items, placed fires/tents/traps/containers, player wells, terrain preparations — grouped rather than seven near-zero-cost individual marks, to keep the trace readable) and three marks inside the background phase (`background:fauna+preloads`, `background:homeReady`, `background:itemSpawners+dryingRacks+hives`). `createWorldBundle`'s own `bootMark` in `createApp.ts` now measures only the critical phase — this is the new, intended meaning of "time to first playable" for that mark.

## 7. Verification

Technical checks, all passing:

- `npx tsc --noEmit`
- `pnpm run lint:fix` (only reformatted import ordering in `worldBundle.ts`, no logic changes)
- `pnpm run build`
- `pnpm run test` — full suite, 205 files / 1932 tests

**Browser/manual verification is not done by this session** (per `CLAUDE.md`, visual/gameplay Three.js behavior needs a human in the loop) — please verify:

1. Run `pnpm run dev`, open with `?bootMark=1` in the URL, check the console for the `[BootMark]` table. Compare `createWorldBundle` (now the fast/critical phase only) against the plan's baseline (`createWorldBundle` was 6474ms total) and note the new `background:*` marks' timing separately.
2. **Fresh new game**: confirm the player spawns at the expected home-settlement location and can move immediately; confirm the village (houses/NPCs), wild animals, item pickups, drying racks and beehives all "pop in" shortly after (not instantly) rather than being missing entirely.
3. **Existing save (Continue)**: confirm load still works and nothing regresses (this path doesn't touch player spawn, since `initialSave.player.x/z` is used either way).
4. **"New World" / terrain-param rebuild** shortly after boot (ideally within the first second, to actually exercise the staleness guard) — confirm no duplicate/leaked fauna or village, and that the world after rebuild matches the new seed/config (not stale data from the interrupted initial boot).
5. Watch the browser console for `[worldBundle] background world-system init failed` (would indicate the background phase threw) and for any unhandled-promise-rejection warnings.
6. Confirm quests that resolve a landmark near home (`buildLandmarkQuests`) and quests that scan `bundle.fauna`/settlement livestock still resolve correctly once the background phase has landed.
