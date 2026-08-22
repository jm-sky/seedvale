# Implementation notes — 198 — World Resource State Continuity

Closes plan 194's ore-deposit finding (confirmed by plan 193): `ResourceDeposits`' `remaining` lived only on the live `DepositInstance` and was recomputed from `hitsForRichness` on every `spawnSync()`, so ordinary walk-away/return within the module's own streaming radius (or any `rebuildWorldBundle()`, e.g. the World Config screen's flat-shading toggle) fully restored a partially- or fully-mined deposit — a farming exploit reachable through ordinary play, tracked in `LOOSE-ENDS.md`.

## 1–2. Ownership and identity (plan §1–2)

Reused the exact pattern the plan pointed at: `collectedItemIds`/`removedCropIds` are caller-owned, mutated in place, threaded through `createWorldBundle`/`rebuildWorldBundle`, reset only on a genuinely new world. Added `ResourceDepletionState = Map<string, number>` (`src/terrain/depositMining.ts`), keyed by the existing deterministic `NaturalResource.id` (`resource_{rx}_{rz}`) — no new identity system. No `EntityManager`/`StateManager`; the type is a plain sparse map with three small pure helper functions, the same shape as the file's existing `hitsForRichness`.

```text
createApp.ts (owns `resourceDepletion: Map<string, number>`)
    ↓ createWorldBundle / rebuildWorldBundle
buildResourceDeposits(scene, worldContext, seed, resourceDepletion)
    ↓
createResourceDeposits(..., depletionState)
```

## 3–4. Partial mining and full depletion (plan §3–4)

`depositMining.ts` gained:

- `resolveRemaining(state, id, richness)` — `state.get(id) ?? hitsForRichness(richness)`. No entry → deterministic initial value.
- `isDepleted(state, id)` — `state.get(id) === 0`. Distinguishes "no override" from "override is exactly 0".
- `recordMined(state, id, remaining)` — `state.set(id, remaining)`.

`resourceDeposits.ts`'s own session-only `depletedIds: Set<string>` was removed outright — `isDepleted(depletionState, id)` replaces every one of its read sites (`spawnSync`, `spawn`, `recheck`), and `mine()` no longer needs a separate "mark depleted" step: writing `remaining = 0` into `depletionState` already carries that meaning. This satisfies the plan's explicit instruction not to keep two independent sources of truth for depletion.

## 5. Single mutation path (plan §5)

Audited every caller of `ResourceDeposits.mine()`/`queryNearest()`: player mining (`app/actions/groundActions.ts` → `app/interactables.ts`) and NPC mining (`ai/NpcAgent.ts` → `settlement/createSettlement.ts` → `settlement/SettlementsManager.ts`) both go through the *same* `SettlementMiningHooks` object (`{ queryNearest: resourceDeposits.queryNearest, mine: resourceDeposits.mine }`), which closes over the one `ResourceDeposits` instance built alongside the settlement in `worldBundle.ts`. There was already only one `ResourceDeposits` instance per world — this plan's fix is entirely inside `mine()` itself: `recordMined(depletionState, id, instance.remaining)` now runs at the exact line that decrements `instance.remaining`, so the two can never drift. No new indirection needed; the instance-not-duplicated invariant already held.

## 6. `WorldBundle` rebuild (plan §6)

`createResourceDeposits(scene, env, seed, depletionState)` now takes the depletion map as a required parameter — the module never reads/writes its own copy. `buildResourceDeposits` and both `createWorldBundle`/`rebuildWorldBundle` thread a `resourceDepletion: ResourceDepletionState` parameter through to it, exactly mirroring `collectedItemIds`. `createApp.ts` owns the actual `let resourceDepletion = new Map()` binding: passed once to `createWorldBundle`, reassigned to a fresh `Map` only inside `rebuildWorld()`'s existing `if (resetCollectedItems)` block (same branch that resets `collectedItemIds`/`plantedTrees`/etc.), and passed to `rebuildWorldBundle()` either way. An in-session same-seed rebuild (terrain-param change) therefore carries depletion forward automatically — it's the same `Map` reference, not a snapshot — while a genuine new-world reset gets an empty one.

## 7. Resource streaming (plan §7)

No change to `LOAD_RADIUS`/`UNLOAD_RADIUS`/hysteresis/recheck cadence or pile placement determinism. `despawn()` still only tears down the runtime `Object3D`/`CSS2DObject`/label — it never touched `depletionState` even before this plan (the bug was entirely in `spawnSync()`'s initial-value computation and the separate `depletedIds` set), so no change was needed there beyond removing the redundant set.

## 8. Save/load boundary (plan §8)

Deliberately **not** added to `SaveData` in this plan — `resourceDepletion` is a plain in-memory `Map` owned by `createApp.ts`, never touched by `saveState.ts`/`persistence/saveData.ts`. This means a real save/reload (not just in-session streaming/rebuild) still resets ore deposits to full, same as before this plan for that specific boundary. Logged as an explicit follow-up to plan 200 in `LOOSE-ENDS.md` rather than expanding this plan's scope, per the plan's own §8 instruction.

## 9. Cleanup and state bounds (plan §9)

The map only ever gains an entry when `mine()` is called on a given deposit — no bulk population from `NaturalResource` generation. Considered pruning fully-regrown/never-touched entries but there's nothing to prune: ore deposits don't regenerate (no analogous "prune once fully grown again" case like `treeLifecycle`'s canopy regrowth), so every entry a player creates stays meaningful (partial remaining, or permanently `0`) for the rest of the session. No removal logic added — would only add complexity without a real state to reclaim.

## What was *not* done (explicit plan exclusions, confirmed still out of scope)

- No `SaveData` schema change (see §8) — full cross-session persistence is a separate, already-logged follow-up to plan 200.
- No change to resource streaming radii, pile visuals, or spawn determinism.
- No new identity system, no generic Entity/State Manager, no resource regeneration.

## Files changed

- `src/terrain/depositMining.ts` — new `ResourceDepletionState`, `resolveRemaining`, `isDepleted`, `recordMined`. Tests extended in `depositMining.test.ts` (5 new cases: initial/no-override, partial-mining survives a simulated despawn/respawn, full depletion distinguishable from "untouched", a fresh `Map` resets everything, player+NPC mutating the same map stay consistent).
- `src/terrain/resourceDeposits.ts` — `createResourceDeposits` takes a required `depletionState` param; removed the internal `depletedIds` set; `spawnSync`/`spawn`/`recheck` read `isDepleted`/`resolveRemaining`; `mine()` calls `recordMined` at the same line `remaining` is decremented; `dispose()` no longer clears `depletedIds` (there's nothing session-local left to clear — the authoritative map is the caller's).
- `src/app/worldBundle.ts` — `buildResourceDeposits`, `createWorldBundle`, `rebuildWorldBundle` gain a `resourceDepletion: ResourceDepletionState` parameter (defaulted to a fresh `Map` for callers with nothing to carry), threaded to `buildResourceDeposits`.
- `src/app/createApp.ts` — owns `let resourceDepletion: ResourceDepletionState = new Map()`; passed to the initial `createWorldBundle` call; reset alongside `collectedItemIds`/etc. inside `rebuildWorld()`'s `resetCollectedItems` branch; passed to every `rebuildWorldBundle()` call.
- `docs/plans/LOOSE-ENDS.md` — closed the ore-deposit continuity entry; logged the cross-session persistence gap as a follow-up to plan 200 in the same entry.

## Verification

- **Technical**: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (1633 tests, +5 new in `depositMining.test.ts`) all green.
- **Not browser-verified.** The full `ResourceDeposits` object touches `document.createElement`/GLTF loading and can't be unit-tested directly (matches this codebase's existing test-coverage boundary — see `depositMining.test.ts` vs. untested `resourceDeposits.ts`); the pure depletion-state logic is unit-tested instead. Suggested manual check (matches the plan's own steps):
  1. Find an ore deposit, mine it partway, walk beyond `UNLOAD_RADIUS` (220 m) and back — remaining hits should match what was left, not reset, and the label should show the same count.
  2. Fully deplete a deposit, repeat the same walk-away/return — it should stay gone, not respawn.
  3. Toggle a non-seed World Config setting (e.g. flat shading) after partially mining a deposit — remaining hits should survive the rebuild.
  4. Start a New Game (new seed) — deposits should start fresh, not carry over the previous world's depletion.
  5. Have an NPC mine the same deposit the player partially mined (or vice versa) — both should see and affect the same remaining count.
