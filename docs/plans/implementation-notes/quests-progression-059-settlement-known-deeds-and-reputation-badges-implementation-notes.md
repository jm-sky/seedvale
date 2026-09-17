# Implementation Notes: quests-progression-059 — Settlement Known Deeds & Reputation Badges

Recon baseline: `main` on 2026-09-17. Current code is authoritative if it changes before implementation.

## Current ownership and seams

- `src/badges/badges.ts` is the only badge owner. `BadgeManager` currently owns global `BadgeId = 'treasure_hunter' | 'relic_seeker'`, one `hiddenFindsFound` counter, `reset()`, event-driven unlocks, `listEarned()` and `exportState()`. Extend this class; do not introduce another achievement/known-deed manager.
- `src/reputation/ReputationManager.ts` remains the only owner of per-settlement reputation dimensions and renown. `SocialConsequence` + `applySocialConsequence()` are already the canonical boundary for applying a resolved social effect.
- `src/app/createApp.ts` creates one stable `BadgeManager(initialSave?.badges)` and one `ReputationManager(initialSave?.reputation)` for the app/session lifetime. New Game resets managers rather than replacing their references.
- `src/persistence/saveData.ts` owns the persisted shape. Current save baseline is `CURRENT_SAVE_VERSION = 48`; re-check before implementation and, if still current, add exactly one `48 -> 49` migration because adding per-settlement badge progress changes persisted representation.
- `src/app/saveState.ts::buildSaveData()` is the save assembly point and already serializes `badges` through `BadgeManager.exportState()`.

## Badge model decision

Keep global and settlement badge IDs separate at the type level.

Recommended shape inside `src/badges/badges.ts`:

```ts
export type SettlementBadgeId = 'caretaker' | 'healer' | 'grave_robber'

export type SettlementBadgeDef = {
  id: SettlementBadgeId
  icon: string
  label: string
  description: string
  unlockConsequence?: {
    reputation?: Partial<Record<ReputationDimension, number>>
    renown?: number
  }
}

export type SettlementBadgeProgress = {
  earned: readonly SettlementBadgeId[]
  animalCorpsesBuried: number
  entitiesHealed: number
  exposedGraveDisturbances: number
}
```

`BadgeManager` should keep a sparse `Map<string, SettlementBadgeProgress>` keyed by `settlementId`. An absent entry means zero progress and no earned local badges; reads should not need to materialize entries.

Do not merge `BadgeId` and `SettlementBadgeId` into one union used everywhere. Global badges and local social identity have different scope and consumers.

Useful public seams:

```ts
recordSettlementDeed(settlementId, deed)
listSettlementEarned(settlementId)
exportState()
reset()
```

A typed method per deed is also acceptable if it yields simpler call-sites. Whichever API is chosen, return enough information for the caller to distinguish:

- progress only,
- a newly earned settlement badge,
- the optional one-shot unlock consequence for that newly earned badge.

`BadgeManager` must not import or own `ReputationManager`. Static consequence data may live next to badge definitions, but applying it remains outside the manager.

## Thresholds and authored consequences

Use named constants in `badges.ts`, not numbers at call-sites:

- `caretaker`: threshold `5`.
- `healer`: threshold `5`.
- `grave_robber`: use threshold `1` for v1. Existing exposed grave disturbance is already a strong, explicit event (`integrity -8`, `trust -4`, `renown +2`), so the local badge should record that the settlement knows this fact rather than require repeated grave robbery before identity appears.

Keep per-action effects and threshold effects separate. Recommended first balance:

- ordinary corpse burial: no per-action reputation delta in v1; threshold unlock gives small `benevolence` + renown.
- successful healing: no mandatory per-action reputation delta in v1; threshold unlock gives `benevolence`, `competence`, small renown.
- exposed grave disturbance: preserve the existing `GRAVE_DISTURBANCE_EXPOSURE` consequence unchanged; `grave_robber` unlock should be a separate one-shot additional penalty only if deliberately balanced. Prefer **no additional reputation penalty in v1** and let the badge itself be the persistent social fact. This avoids double-punishing the exact same first exposure.

If tuning differs during implementation, keep values in badge/deed definitions, not in the three producer call-sites.

## Producer 1: player animal-corpse burial

Actual player completion is in `src/app/actions/survivalActions.ts::startBuryCorpse()`.

Current success edge:

```text
busy completion
→ revalidate animal dead / not readyToRemove
→ animal.bury()
→ toast
```

This is the correct place to emit a player deed. Do not instrument `fauna/animalCorpse.ts::buryCorpse()` or `AnimalAgent.bury()` because those are actor-neutral fauna seams also reused by NPC sanitation (`settlements-npcs-029`). Instrumenting there would count NPC cleanup as player progress.

Add a narrow optional hook to `PlayerActionContext`, analogous to the existing `onPlayerAnimalHarvested`, e.g. `onPlayerAnimalCorpseBuried`. Fire it only after `animal.bury()` succeeds on busy completion.

The hook should pass stable facts needed by app-level attribution, minimally:

```ts
{
  animalId: string
  animalKind: AnimalKind
  x: number
  z: number
}
```

Do not make `survivalActions.ts` own settlement scanning or reputation logic.

### Settlement attribution for burial

There is no settlement id on a generic corpse. Resolve attribution at the composition/world boundary, not inside `BadgeManager` or fauna.

Use the existing settlement spatial/world data available through `bundle.settlementsManager` / loaded settlement definitions to resolve the settlement whose local area contains the corpse position. Prefer an existing spatial helper if one exists at implementation time; otherwise add the narrowest read-only resolver near settlements/world wiring.

Do not:

- infer from player home settlement,
- use a mutable global `currentSettlement`,
- parse an id that the corpse does not own,
- count a burial outside settlement-local space.

Exactly-once for one corpse is already protected by the corpse state: after `animal.bury()`, it becomes ready for disposal and the player action cannot successfully complete again. Do not add a second per-corpse dedupe ledger unless code at implementation time proves this insufficient.

## Producer 2: successful Medicine treatment

Actual successful mutation is `src/app/actions/medicalTreatmentActions.ts::completeMedicalTreatment()`.

The only valid deed edge is after:

```ts
const actualRestored = target.applyTreatment(...)
if (actualRestored <= 0) return
```

and before/after XP/material feedback as convenient. Failed/no-op attempts never count.

`TreatableTarget` in `src/player/medicalTreatment.ts` currently contains target id/kind/label and treatment functions, but not settlement identity. Extend the adapter with an optional resolved social scope rather than re-discovering target identity later, e.g.:

```ts
settlementId?: string
```

Rules:

- `treatableFromPlayer()` => no settlement id; self-treatment never records `healer`.
- `treatableFromNpc(npc)` => use the NPC's authoritative household/settlement membership already supplied to the agent/settlement runtime. Do not derive from NPC display name or physical proximity.
- `treatableFromLivestock(animal)` => only household-owned livestock can qualify. `AnimalOwner` stores `{ kind: 'household', houseId }`, so resolve `houseId -> Household -> settlementId` through the existing household/settlement owner, not by parsing the string unless the repository already exposes a canonical parser/lookup.
- player-owned livestock is treatable today, but has no settlement social owner and should not count toward a settlement `healer` deed in v1.

If `medicalTreatment.ts` cannot access the household lookup without creating a bad dependency, keep `TreatableTarget` neutral and inject the settlement id when building/selecting the target at the app interaction boundary. Prefer a narrow resolver callback over importing `SettlementsManager` into the player domain.

Add an optional `PlayerActionContext` hook such as `onPlayerMedicalTreatmentCompleted({ targetId, targetKind, settlementId, actualRestored })`. Emit only for `npc` / household `livestock` with a resolved settlement id.

## Producer 3: exposed grave disturbance

Use the existing social-exposure seam in `src/app/actions/groundActions.ts::applyGraveDisturbanceIfExposed()`.

Current canonical flow:

```text
cemetery id
→ servedSettlementIdsForCemeteryId()
→ first served settlement id
→ resolveSocialExposure(...)
→ if exposed
   → applySocialConsequence(GRAVE_DISTURBANCE_EXPOSURE)
```

Record the settlement deed **inside the same `if (exposed)` branch** and use the exact same `consequenceSettlementId`. This guarantees secret digging does not create progress and avoids a second cemetery-to-settlement resolution path.

Both generic Hidden Finds and authored/explicit grave placements already pass through `applyGraveDisturbanceIfExposed()`, so instrument that function once. Do not add separate grave-badge calls in `checkExplicitBuriedDig()` and `checkHiddenFindDig()`.

Authorized grave disturbance returns before exposure resolution and therefore must not record `grave_robber`.

## Applying unlock consequences

Create one app-level helper in/near `createApp.ts` that receives the result of `BadgeManager.recordSettlementDeed(...)` and:

1. announces any newly earned badge through the existing toast pattern;
2. applies its optional `SocialConsequence` via the existing `applySocialConsequence(reputation, consequence)` seam;
3. refreshes Character Screen reputation if a consequence was applied;
4. refreshes local badge projection if the currently selected settlement is affected.

Do not repeat this fan-out separately in burial, medicine and grave modules.

Exactly-once comes from `earned`: only the transition from not-earned to earned returns an unlock consequence. Do not persist a separate `bonusApplied` flag.

## UI projection

Current Character Screen already combines local reputation and global badges in the same `Reputacja` section:

- `src/ui-vue/store.ts::CharacterScreenState` owns `reputation` and `badges`.
- `src/ui-vue/screens/CharacterScreen.vue` uses `CharacterSettlementSelect` and renders global `ui.characterScreen.badges` under `Znany z`.
- `src/ui/createHud.ts` exposes `setPlayerBadges()` and `setCharacterReputation()`.

Do not overload existing `badges` with the local list; global badges must remain independent of selected settlement.

Add a separate local field to the Character Screen view, e.g. `settlementBadges: readonly SettlementBadgeDef[]`, and a setter/facade method. The projection must update:

- when Character Screen opens,
- when settlement selection changes,
- after a deed unlocks a badge in the currently selected settlement,
- after load/New Game initialization.

Render local badges inside the selected settlement block, near reputation/renown, under a label such as `Znany tutaj z`. Keep the existing global badge presentation separate (or relabel it clearly as global achievements if needed).

Do not reveal locked badge definitions or thresholds.

## Persistence and migration

Current persisted badge shape is:

```ts
export type SaveBadges = {
  earned: readonly BadgeId[]
  hiddenFindsFound: number
}
```

Extend it with an optional/sparse per-settlement record matching `BadgeManagerInitial`, for example:

```ts
settlements?: Record<string, {
  earned: readonly SettlementBadgeId[]
  animalCorpsesBuried: number
  entitiesHealed: number
  exposedGraveDisturbances: number
}>
```

Even if the field could technically default when absent, this is a persisted representation change and the repository uses explicit versioned migrations. Re-check `CURRENT_SAVE_VERSION` at implementation time, bump by one, add exactly one next migration step, and update validation/tests.

Migration from the current version should initialize no local progress. Do **not** resurrect the removed v24 global `grave_robber` / `desecrator` data; that migration intentionally discarded those semantics.

`BadgeManager` constructor should defensively ignore unknown badge ids in both global and settlement scopes, matching the current global behavior.

`reset()` must clear the settlement map as well as global earned/counters.

## Tests with highest value

### `src/badges/badges.test.ts`

Cover the domain without app/world setup:

- current global badge tests unchanged;
- independent counters/earned state for settlement A vs B;
- caretaker at exactly 5;
- healer at exactly 5;
- grave robber at first exposed-deed record;
- post-threshold events do not return the unlock consequence again;
- `listSettlementEarned(id)` returns only that settlement;
- export -> construct round-trip preserves local counters/earned;
- `reset()` clears local state.

### `src/app/actions/groundActions.test.ts`

Extend existing grave-exposure tests instead of creating another exposure harness:

- hidden/failed exposure => no deed hook;
- exposed => one deed for the same settlement id used by `GRAVE_DISTURBANCE_EXPOSURE`;
- authorized grave => no deed;
- explicit buried grave and generic grave both reuse the single helper path.

### Survival action tests

Test that the player burial hook fires only on successful busy completion and not on cancellation, dead-state revalidation failure or NPC cleanup paths. Do not unit-test `animalCorpse.buryCorpse()` for social behavior.

### Medicine action tests

At `medicalTreatmentActions` level:

- successful NPC treatment => deed/hook once;
- successful household livestock treatment => deed/hook once;
- self treatment => no settlement deed;
- no-op / target dead / treatment revalidation failure => no deed.

### Persistence/UI

- `saveData.test.ts`: current -> next migration adds empty local badge state/default; validator accepts valid sparse state and rejects malformed counters/ids according to existing validation style.
- Character Screen/store tests: changing selected settlement changes the local badge list; global badges do not change with selection.

## Files likely to change

Primary:

- `src/badges/badges.ts`
- `src/badges/badges.test.ts`
- `src/app/createApp.ts`
- `src/app/actions/actionContext.ts`
- `src/app/actions/survivalActions.ts`
- `src/app/actions/medicalTreatmentActions.ts`
- `src/player/medicalTreatment.ts`
- `src/app/actions/groundActions.ts`
- relevant action tests
- `src/persistence/saveData.ts`
- `src/persistence/saveData.test.ts`
- `src/app/saveState.ts` only if serialization typing/assembly requires adjustment
- `src/ui/createHud.ts`
- `src/ui-vue/store.ts`
- `src/ui-vue/screens/CharacterScreen.vue`

Possible narrow settlement lookup work, only if no suitable current seam exists:

- settlements manager / household registry code that already owns `Household.settlementId` and spatial settlement membership.

Avoid unrelated refactors of `NpcAgent`, fauna corpse lifecycle, quest availability, or settlement generation.

## Implementation order

1. Extend badge domain types/state/API + unit tests.
2. Extend save schema/migration/validation and round-trip tests.
3. Add the single app-level deed-result fan-out (toast + optional social consequence + UI refresh).
4. Wire grave exposure first because it already has authoritative settlement/social knowledge.
5. Wire medicine completion with explicit target settlement attribution.
6. Wire player corpse burial with app-level spatial settlement attribution.
7. Add local Character Screen projection and selection refresh.
8. Run focused tests, then typecheck/lint/build required by repo workflow.

Do not run browser verification; the User does it manually. Do not run `pnpm docs:sync` manually.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
