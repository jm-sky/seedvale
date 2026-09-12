# Implementation Notes: Guard Rewards and Evening Settlement Duty

**Plan:** `quests-progression-021-guard-rewards-and-evening-settlement-duty.md`  
**Reviewed:** 2026-09-12 against current `main`

## Recon findings that matter

- `src/items/guardSword.ts` is still the legacy entitlement resolver: `woda-dla-marka complete OR relation >= 1 -> long_sword`. `src/app/inventoryWiring.ts` and `src/ui-vue/NpcDialogueMenu.vue` still expose the sword-specific `getCanAskSword` / `onAskSword` / `askSword` topic. Replace this responsibility; do not layer the new rules on top of the legacy helper.
- `fauna-022` is implemented in code: `AnimalAgent.variant` is public and immutable, with `AnimalVariant = 'normal' | 'alpha'`. `quests-progression-019` also has the player-caused animal-deed pipeline. Both source plans are still `verification needed`, so treat their code as available but keep their focused tests in the verification set.
- `PlayerAnimalKillContext` in `src/reputation/animalDeeds.ts` currently carries `animalKind`, `dangerSignificance` and position, but **not** `variant`. `gameLoop.ts` already captures that context at the player-caused death point. Extend this existing snapshot with `variant`; do not infer alpha from `dangerSignificance` and do not add another fauna death callback.
- `VillageTorch` in `src/settlement/houseLighting.ts` is a reusable visual/light controller, not a settlement identity type: the same factory is also used by player-built standing torches and cave props. Add `isLit()` there, but keep stable settlement `torchId` on a settlement-owned wrapper/record rather than forcing identity into every `VillageTorch` consumer.
- `Settlement` exposes `fire?: VillageFire` but does not expose canonical village torches. `buildSettlementProps()` currently returns a bare `VillageTorch[]`; `createSettlementNightCycle()` receives that array and auto-lights every entry at dusk.
- `createSettlementNightCycle()` also auto-lights `VillageFire` at dusk. The plan only explicitly suppresses required torches, but the gameplay requires the player to light the campfire too. While the evening-duty objective is active, suppress **both** target torch auto-light and target settlement fire auto-light; otherwise the quest can partially/fully complete without the intended manual action.
- Existing campfire interaction already uses `startIgniteFire()` and therefore the canonical `fire_starting` capability + fuel/busy-channel path. Reuse it unchanged. Player-built `standingTorch` is the correct precedent for an instant torch ignition action, not for ownership/persistence.

## Guard identity and content materialization

Follow the current profession-content pattern in `src/quests/opportunities/hunterProfessionQuests.ts`:

- add a small Guard profession/content module beside it;
- select with `adultOpportunityNpcs(...).find(npc => npc.role === 'guard')` (or one shared equivalent), using stable `NpcId` as identity;
- make quest ids include `settlementId + giverNpcId`;
- wire it in `createApp.ts` where the existing opportunity/contextual defs are assembled before `new QuestManager(...)`.

V1 should bind the deterministic home-settlement Guard, matching the existing UI restriction to home Guard and avoiding accidental reward claims from every loaded guard. Use the **same selector** for reward recognition and the evening quest so two different guards cannot own the two halves of this feature.

The evening quest must be materialized from actual settlement light capability, not from village size assumptions. Require a real `VillageFire` and at least one canonical settlement torch record. If the composition point cannot see that read model yet, expose it from `Settlement` first; do not independently re-run prop/worldgen logic in quest code.

## Guard reward state and migration

Keep this as small persisted progression data, not a manager. `SaveWorldFlags` is already optional/backward-compatible, initialized in `createApp.ts`, shallow-copied by `saveState.ts`, reset on New Game and validated in `saveData.ts`.

Recommended shape:

```ts
type SaveGuardClaimState = {
  torchGiftClaimed?: boolean
  swordRewardConsumed?: boolean
  renownRouteClaimed?: boolean
  alphaRouteClaimed?: boolean
}

// SaveWorldFlags additions
alphaWolfDeedEarned?: boolean
guardClaims?: Record<NpcId, SaveGuardClaimState>
```

Keep the deed fact separate from per-Guard claims. Initialize missing records lazily. Update `isWorldFlagsField`, save/load tests and New Game reset; clone/recreate the nested record rather than carrying a stale object across reset.

Legacy migration needs special care because `guardSwordGifted` has no NPC identity. After the deterministic V1 Guard is resolved, `guardSwordGifted === true` must make that guard's `swordRewardConsumed` true, but must leave `renownRouteClaimed`, `alphaRouteClaimed` and `torchGiftClaimed` false. Until a guard can be resolved, preserve the legacy boolean as a consumed-sword guardrail; never let a temporarily missing guard turn an old save into a fresh sword entitlement. New claims should use the new state rather than continuing to overload `guardSwordGifted`.

## Reward resolver and dialogue

Replace the sword-specific resolver with a pure semantic Guard reward resolver (for example `src/quests/guardRewards.ts`). It should receive already-resolved facts only:

- relation tier (`QuestManager.getRelationLevel(guardId)`; use `friendly`, not literal `3`),
- settlement renown from `ReputationManager.getRenown(settlementId)`,
- `alphaWolfDeedEarned`,
- `inventory.has('long_sword')`,
- the selected guard's claim state.

It returns the available claim/reward decision; it must not own Inventory, QuestManager, ReputationManager or save state. App/UI wiring performs the mutation and reward grant.

For sword substitution use `tradeValue('long_sword')` from `src/items/tradeCatalog.ts` and grant that many `coin`; never call merchant `sellPrice()`.

`NpcDialogueMenu.vue` currently hardcodes `askSword` and label `Poproś o miecz`. Rename the callback/topic to Guard recognition/reward semantics rather than preserving misleading sword-only names. Re-evaluate availability after every claim so, when renown and alpha routes are both available, claiming one leaves the other claimable and routes cannot overwrite each other. The small torch gift is independently one-shot.

## Alpha deed seam

Extend `PlayerAnimalKillContext` with the fauna-owned `AnimalVariant` and populate it in the existing melee/ranged player-kill finalization in `gameLoop.ts`. In the existing `createApp.ts` `onPlayerAnimalKill` integration, set:

```text
alphaWolfDeedEarned = true
iff animalKind === 'wolf' && variant === 'alpha'
```

This callback is already player-caused, so NPC/fauna/environment deaths remain excluded automatically. Leave `resolveAnimalDeedConsequences()` significance-based; variant identity is for Guard recognition, not a replacement for plan 019's reputation math.

## Canonical settlement torch contract

Introduce a settlement-owned record, e.g.:

```ts
type SettlementVillageTorch = {
  id: string
  position: THREE.Vector3
  torch: VillageTorch
}
```

Expose a readonly list on `Settlement` (or an equivalent narrow lookup on `SettlementsManager`). `VillageTorch` itself only needs the new `isLit(): boolean` read API.

Generate IDs from `settlementId + semantic placement slot`. `props.ts` currently places torches through `placeTorchAt(...)` from plaza/gate placement loops; pass an explicit stable slot key from those call sites. Do **not** derive persistence/quest identity from `Object3D.uuid`, the successful-placement ordinal or the final array index, because filtering/placement changes can shift those.

The wrapper should provide the world position needed by `buildInteractables()` without making quest code inspect meshes.

## Player interaction

Add a separate canonical settlement-torch `Interactable` carrying only stable `settlementId`, `torchId`, position and current `lit` display state. Discover it in `src/app/interactables.ts` from loaded settlement torch records.

Dispatch in `gameLoop.ts` through a small app action that:

1. re-resolves settlement + torch by stable ids;
2. no-ops if missing/already lit;
3. checks the existing `fire_starting` capability;
4. calls settlement-owned `torch.setLit(true)`;
5. asks `QuestManager` to re-check the settlement-light objective.

Do not route canonical torches through `StandingTorches`; that registry owns player-placed construction/persistence semantics which settlement infrastructure does not have.

Campfire stays on the existing `campfire -> startIgniteFire(VillageFire)` path. Re-check the quest objective when ignition actually commits, not when the busy action merely starts.

## Evening availability

Keep `QuestManager.meetsAvailability(def)` as the single canonical offer predicate. Extend `QuestAvailability` with the smallest reusable world-time condition plus a read-only time/seed lookup injected into `QuestManager`; do not add a second UI/game-loop gate.

The evaluator must read current `DayNightState.timeOfDay` and `elapsedDays` on every availability query. Compute the daily one-hour window in a pure helper from:

```text
world seed + giver NpcId + floor(elapsedDays)
```

using the project's seeded-random/FNV-1a convention. Never store the day's start time in quest progress. Once state leaves `not_offered`/`offered` for `active`, the window must no longer expire/fail the quest.

Tests should pin deterministic same-input output, different-day variation and wrap-safe `timeOfDay` membership if the chosen late-evening range can cross midnight.

## Objective and lighting lookup

Add a world-state objective containing `settlementId`, stable `torchIds` and `requireCampfire`. `QuestManager` should receive a narrow read-only settlement-light lookup; it must not import `Settlement`, `VillageTorch` or `VillageFire`.

The lookup should distinguish at least:

```text
satisfied | pending | unavailable
```

`unavailable` is useful when a restored/generated definition references settlement infrastructure that can no longer be materialized; invalidate rather than leaving an impossible active quest forever. For an unloaded but valid non-home settlement, do not treat temporary streaming absence as failure. V1 home settlement is always loaded, but keep the lookup semantics correct.

Re-check after successful manual torch/campfire ignition and during restore/catch-up. There is no need for a per-frame scan once the relevant mutations report completion.

## Dusk suppression policy

Keep settlement lighting quest-agnostic. Extend `createSettlementNightCycle()` with a policy/read callback over canonical ids, with defaults preserving current behaviour, e.g. conceptually:

```ts
shouldAutoLightTorch(torchId): boolean
shouldAutoLightFire(): boolean
```

At dusk, apply the policy only to auto-light. At dawn, extinguish exactly as today regardless of policy. Manual `setLit(true)` / `VillageFire.light('player')` bypasses it.

The policy must be derived from current active quest state, not persisted. Avoid capturing a one-time boolean when the settlement is created: `WorldBundle`/settlements are constructed before the final `QuestManager`, and suppression must also react to accept/complete/invalidate/save-load. Use a live callback/provider or an updatable policy seam at the composition boundary; never import `QuestManager` into settlement code.

## Implementation order

1. Replace Guard legacy reward state/resolver + persistence migration; extend the existing player-kill snapshot with variant and wire alpha deed.
2. Add settlement torch wrapper/id/read state and expose the readonly settlement-light view.
3. Add canonical torch interaction and re-use existing campfire ignition.
4. Add quest-neutral dusk suppression for both required torches and settlement fire.
5. Add world-time availability seam + deterministic window helper.
6. Materialize the Guard evening quest and add the read-only lighting objective lookup/polling.
7. Update Guard dialogue callbacks/UI names and focused tests.

## Focused verification

Automated coverage should include at least:

- no sword entitlement from `woda-dla-marka` or `acquainted` relation;
- torch gift: `friendly OR renown >= 6`, once per selected `NpcId`;
- renown and alpha routes claim independently, but second route substitutes `tradeValue('long_sword')`; existing carried sword also forces substitute;
- only a player-caused `wolf + variant === 'alpha'` records the deed; quest `dangerous` normal wolf does not;
- legacy `guardSwordGifted=true` consumes sword reward only and does not mark either new route/gift;
- deterministic daily offer window and no deadline after acceptance;
- stable torch ids survive settlement reconstruction;
- canonical torch requires `fire_starting` and can be lit outside the quest;
- active duty suppresses dusk auto-light for required torches **and the target campfire**, while other settlements and dawn extinction remain unchanged;
- all required lights lit -> `ready_to_report`, explicit Guard report -> complete;
- save/load of an active duty reconstructs suppression from quest state without a persisted lighting flag.

Do not run browser verification; leave visual/gameplay verification to the user.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
