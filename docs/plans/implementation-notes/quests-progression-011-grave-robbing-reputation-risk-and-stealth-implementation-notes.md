# Implementation Notes: quests-progression-011 — Grave Robbing Reputation Risk & Stealth

## As implemented (2026-09-08)

- Pure resolver: `src/reputation/socialExposure.ts` (`socialExposureRisk`, `socialExposureEventRoll`, `resolveSocialExposure`). No cemetery/fauna/`groundActions` imports. Night is `phaseName(dayNight.timeOfDay) === 'noc'` at the call site (`src/world/dayNight.ts`); dawn/dusk are not night.
- Formula: day `0.50`, night subtracts `0.30` → `0.20`, active Sneak multiplies remaining risk by `(1 - clamp01(sneakValue))`, then `max(0.02, …)`. Inactive Sneak ignores `sneak.value`. `PlayerSkills.sneak` is read from `ctx.player.skills` at resolution; runtime floor is still `SKILL_MIN_VALUE = 0.2`, but the helper accepts full `0..1`.
- Roll: local FNV-1a of `` `${spotId}:social-exposure` `` → `createSeededRandom` first sample. `HiddenFindMatch.spotId` (`${landmark.id}:${graveIndex}`) is the stable identity. Night/Sneak change only the threshold.
- Hook: `src/app/actions/groundActions.ts::checkHiddenFindDig()`. After `resolvedHiddenFindSpotIds.add(match.spotId)`, cemetery-only: one exposure roll. No `BadgeManager.recordGraveDisturbed()` / `grave_robber` / `gravesDisturbed`. `servedSettlementIdsForCemeteryId` supplies loot `size` and `settlementId`. Missing settlement → loot still resolves, no reputation write, no global fallback, no grave badge.
- Consequence: `applySocialConsequence` dep on `GroundActionsDeps`, wired in `createApp.ts` to `ReputationManager` + `refreshCharacterReputation()`. Deltas: `integrity -8`, `trust -4`, `renown +2` (`GRAVE_DISTURBANCE_EXPOSURE`). One-shot is `resolvedHiddenFindSpotIds`; standing persists via existing `SaveData.reputation`.
- Not reused: `src/fauna/playerAwareness.ts::sneakDetectionMultiplier()` (movement + 0.9 cap, fauna perception).

## Tests

- `src/reputation/socialExposure.test.ts` — risk table, 2% floor, inactive Sneak, input clamp, roll identity vs threshold.
- `src/app/actions/groundActions.test.ts` — cemetery exposed / not exposed / empty grave / resolved spot / non-cemetery / no settlement / ReputationManager round-trip.
