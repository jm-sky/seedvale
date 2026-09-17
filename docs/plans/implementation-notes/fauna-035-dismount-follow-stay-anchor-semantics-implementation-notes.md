# Implementation Notes: fauna-035 Dismount Follow/Stay anchor semantics

## Current code path

`src/app/actions/mountActions.ts` owns riding lifecycle. `createMountActions(...)` keeps the current `AnimalAgent` in local `mount` state. `enter(...)` calls `animal.setMounted(true)`. `exit(reason)` captures `last = mount`, calls `last.setMounted(false)`, clears riding state, repositions the player beside the horse and emits the dismount/fall/death toast.

There is currently no owned-animal control integration in `exit(...)`; therefore `OwnedAnimalControlState.mode` and `stayAnchor` survive a ride unchanged.

`src/fauna/AnimalAgent.ts` already exposes the needed read/write API:

- `getOwnedControlMode(): OwnedAnimalControlMode` returns `_control.mode`.
- `setOwnedControlMode('stay')` sets Stay through `setOwnedAnimalControlMode(...)` using the animal's **current** `mesh.position.x/z` as the anchor.
- `isPlayerOwned()` gates player-owned semantics.

Do not expose `_control`, `stayAnchor` or mutable control state to the action layer.

## Persistence/domain seam

The authoritative persisted path for contextual Follow/Stay commands is:

```text
SettlementsManager.setOwnedAnimalControl(animalId, mode)
→ settlement/livestock.ts setOwnedAnimalControl(...)
→ resolve live persistent animal
→ AnimalAgent.setOwnedControlMode(mode)
→ registry.upsert(originSettlementId, animal)
```

This matters for dismount: calling only `AnimalAgent.setOwnedControlMode('stay')` would fix runtime movement but would bypass the immediate livestock-registry upsert used by the existing public domain operation.

Prefer injecting a narrow callback into `createMountActions(...)`, composed in `src/app/createApp.ts`, rather than importing `SettlementsManager` or livestock internals into `mountActions.ts`.

Suggested semantic shape (exact naming may differ):

```ts
type OwnedMountHooks = {
  refreshStayOnPlayerDismount: (animal: AnimalAgent) => void
}
```

or equivalently a callback keyed by `animalId`. The implementation should remain narrow: mount actions report the lifecycle event; fauna/livestock ownership code performs the control mutation and persistence upsert.

`createApp.ts` already creates `mount` after `bundle` exists and already passes `ForeignPropertyMountHooks`, so this is the natural composition point. The callback can use `bundle.settlementsManager.setOwnedAnimalControl(animal.animalId, 'stay')` after validating the current mode/player ownership either in the callback or immediately before invoking it.

## Exact behaviour

Only a normal player-requested dismount should refresh the anchor:

```text
exit('player')
→ horse leaves mounted state
→ if player-owned && getOwnedControlMode() === 'stay'
   → execute existing domain Stay operation
   → Stay operation snapshots current horse X/Z as new anchor
→ player is placed beside horse
```

The anchor source must be the horse position, not the player's post-dismount offset position.

`Follow` is a strict no-op for owned-control state. Do not call `setOwnedAnimalControl(..., 'follow')` on every dismount; the mode has already survived the ride and rewriting it provides no value.

Do not refresh Stay for:

- `fall`,
- `death`,
- `unavailable`,
- `downed`.

Those are forced lifecycle exits, not the player's semantic command "leave the horse here". In particular, a fall must not silently redefine where a previously parked horse belongs.

## Ordering detail

`AnimalAgent.setMounted(false)` does not itself alter Follow/Stay. The Stay refresh may occur immediately after `last.setMounted(false)` while `last` still refers to the same live agent.

Keep the current `exit(...)` teardown otherwise unchanged. Do not restructure player positioning, foreign-property incident closure, HUD state, toast behaviour or riding stamina for this fix.

Because `setOwnedControlMode('stay')` reads `mesh.position`, it must run only after the final ridden position is already authoritative. `exit(...)` already executes after the last mounted movement tick, so no extra position synchronization is required.

## Existing mechanisms to reuse

- `AnimalAgent.getOwnedControlMode()` — current mode read; already used by contextual animal actions in `gameLoop.ts`.
- `AnimalAgent.setOwnedControlMode(...)` — canonical rule that entering/re-entering Stay captures the current animal position.
- `SettlementsManager.setOwnedAnimalControl(...)` — public persistent-animal control seam.
- `settlement/livestock.ts setOwnedAnimalControl(...)` — validates live persistent/player-owned/non-dead animal and upserts the registry.
- `ownedAnimalControl.ts` — no changes expected; Stay hysteresis and return-to-anchor are already correct.

Do not add:

- pre-mount control snapshots,
- a second Stay anchor,
- riding-owned Follow/Stay state,
- direct registry writes from `mountActions.ts`,
- horse-specific persistence fields.

## Tests

First look for an existing `mountActions` test file. If none exists, add a focused unit test beside the action module rather than forcing this into broad browser/integration coverage.

Useful seams:

1. Construct a player-owned horse, set `Stay` at A, mount it, move its mesh/drive it to B, then call player dismount. Assert the injected/domain callback is invoked once and resulting control state snapshots B.
2. Same with `Follow`: callback/control mutation must not occur.
3. Call `dismount('fall')` (or trigger the fall branch through the smallest practical seam): no Stay refresh.
4. Ensure non-player-owned mount does not attempt owned-control persistence.
5. If testing through `SettlementsManager.setOwnedAnimalControl(...)`, assert registry snapshot after refresh contains the updated `stayAnchor`, not only the live agent state.

Do not make tests depend on Stay return hysteresis itself; that is already owned by `ownedAnimalControl` / `AnimalAgent` tests. This plan only needs to prove lifecycle integration and persistence path.

## Files expected to change

Primary:

- `src/app/actions/mountActions.ts` — dismount lifecycle hook and `reason === 'player'` gating.
- `src/app/createApp.ts` — inject the narrow owned-control callback using `bundle.settlementsManager.setOwnedAnimalControl(...)`.
- relevant action test file (existing or new).

Likely unchanged unless implementation reveals a missing seam:

- `src/fauna/AnimalAgent.ts` — existing getter/setter are sufficient.
- `src/fauna/ownedAnimalControl.ts` — no policy change.
- `src/settlement/livestock.ts` — existing domain operation already performs validation + registry upsert.
- `src/settlement/SettlementsManager.ts` — existing public API is sufficient.
- save schema — no changes.

## Landed (2026-09-17)

Implemented as designed:

- `OwnedMountHooks.refreshStayOnPlayerDismount` injected into `createMountActions`.
- `exit('player')` gates on `isPlayerOwned()` + `getOwnedControlMode() === 'stay'`, then calls the hook after `setMounted(false)` and before player offset placement.
- `createApp.ts` wires the hook to `bundle.settlementsManager.setOwnedAnimalControl(animalId, 'stay')`.
- Unit coverage in `src/app/actions/mountActions.test.ts` (Stay→B, Follow no-op, fall no-op, non-owned no-op).

No changes were required in `AnimalAgent`, `ownedAnimalControl`, livestock, or the save schema.

## Guardrails

- Current code wins if signatures have changed since these notes.
- Keep the fix generic to player-owned mountable animals; do not branch on `kind === 'horse'` unless current API forces it.
- Preserve `fauna-020` invariant that mounted movement suspends rather than replaces autonomous owned control.
- Preserve `fauna-030` Stay safety/return behaviour; only move the anchor on conscious dismount.
- Add JSDoc with `@domain fauna` only if a new public architectural callback/type is introduced and it improves preflight discovery.

## Verification handoff

Automated implementation verification should cover the focused lifecycle tests plus normal typecheck/test/build commands appropriate to the touched files.

Browser verification remains User-owned: park in A, ride to B, dismount, verify Stay remains around B; repeat Follow; then save/load after Stay dismount.

> **Zrób git commit i push do main, rebase jeżeli trzeba**