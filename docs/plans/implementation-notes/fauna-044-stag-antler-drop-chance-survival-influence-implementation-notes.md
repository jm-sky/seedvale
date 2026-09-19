# Implementation Notes: fauna-044 — stag antler drop chance / Survival influence

## Verified current ownership

- `src/fauna/animalTrophyLoot.ts::trophyLootKindsForHarvest(animal)` is the single trophy-roll owner. It currently:
  - rejects non-`stag`,
  - rejects juveniles,
  - derives a deterministic roll from `antler:${animal.animalId}`,
  - uses a fixed `0.5` threshold.
- `src/fauna/animalHarvest.ts::harvestAnimalIntoInventory(animal, inventory, acquiredAtDays)` owns the shared corpse-consumption/yield transaction:
  - validates `canHarvestMeat()`,
  - adds meat,
  - attempts hide,
  - asks `trophyLootKindsForHarvest()` for trophy kinds,
  - returns `AnimalHarvestResult`.
- Player harvest enters through `src/app/actions/survivalActions.ts::createSurvivalActions()` → `startHarvestMeat()`. The authoritative skill value is directly available there as `player.skills.survival.value`.
- NPC hunter harvest does **not** call the shared function from `NpcAgent.ts`. The actual seam is `src/fauna/huntingHooks.ts::createHuntingHooks().harvest()`, which resolves the live animal and calls `harvestAnimalIntoInventory(...)`.
- `src/player/PlayerSkills.ts` owns `survival.value`. Current skill floor is `SKILL_MIN_VALUE = 0.2`; do not renormalize it for this feature.

## Recommended contract change

Keep player state out of fauna ownership. Thread only the resolved scalar needed by harvesting.

A low-risk shape is to extend the shared harvest call with an optional options object rather than another positional primitive, e.g. conceptually:

```ts
type AnimalHarvestOptions = {
  survivalValue?: number
}
```

Then:

- player path supplies `{ survivalValue: player.skills.survival.value }`,
- NPC/world path omits it,
- `animalHarvest.ts` forwards the value to trophy resolution,
- `animalTrophyLoot.ts` maps missing input to the 75% baseline.

This preserves one harvest transaction and leaves room for future actor-specific harvest inputs without growing positional parameters.

## Probability ownership

Put the balance mapping in `animalTrophyLoot.ts`, next to the deterministic antler roll.

Recommended pure helper contract:

```ts
stagAntlerDropChance(survivalValue?: number): number
```

Semantics:

- missing / non-finite input → `0.75`,
- finite input clamped to `[0, 1]`,
- result = `0.75 + 0.15 * clamped`,
- final result remains bounded to `[0.75, 0.90]`.

Do **not** use `SKILL_MIN_VALUE` inside fauna. Fauna should know only a generic `[0,1]` coefficient; the player skill floor remains player-domain knowledge.

Expected values:
- omitted → 0.75,
- 0 → 0.75,
- 0.2 → 0.78,
- 0.5 → 0.825,
- 1 → 0.90.

## Determinism details

Keep the existing seed and roll identity unchanged:

```ts
createSeededRandom(hashId(`antler:${animal.animalId}`))()
```

Only the threshold changes.

This matters because changing the salt/hash/roll generation would reshuffle which already-known corpse IDs succeed, turning a balance adjustment into an RNG identity change.

The deterministic resolver may be called more than once during tests, but authoritative gameplay still consumes a corpse once because `harvestAnimalIntoInventory()` calls `animal.harvestMeat()` on the first successful transaction and subsequent harvest attempts fail.

## Player integration

In `src/app/actions/survivalActions.ts::startHarvestMeat()`:

- use the existing `player` captured from `PlayerActionContext`,
- at busy-channel completion, pass `player.skills.survival.value` to the shared harvest call,
- do not snapshot Survival at channel start unless there is a specific gameplay reason; current code performs the actual harvest/yield resolution on completion, so reading it there matches the authoritative mutation point.

No new dependency needs to be added to `PlayerActionContext`; `player.skills` is already used in the same module for campfire duration and food benefit.

## NPC integration

In `src/fauna/huntingHooks.ts::createHuntingHooks().harvest()`:

- keep calling the same `harvestAnimalIntoInventory()`,
- omit the Survival option (or explicitly use baseline only if the chosen API requires it),
- do not inspect player state,
- do not add Survival/proficiency to `SettlementHuntingHooks` for this plan.

This gives NPC-harvested adult stags the actor-neutral 75% chance.

`NpcAgent.ts` should not need modification unless type fallout reveals a direct compile-time contract change; the hunting hook boundary already hides `AnimalAgent` and harvest details from NPC behavior.

## Tests

Primary file remains `src/fauna/animalHarvest.test.ts`. It already has useful helpers:
- `deadStag()`,
- deterministic ID search,
- juvenile assertion,
- no-reroll assertion.

Prefer testing the pure chance helper directly for exact balance values, and keep integration tests focused on deterministic trophy behavior.

Suggested coverage:

1. chance helper exact values for omitted, 0, 0.2, 0.5, 1;
2. non-finite values fall back safely; below/above range clamp;
3. juvenile stag always returns no antler even at 1.0;
4. same adult corpse + same coefficient returns same result;
5. choose/find an ID whose seeded roll lies between 0.75 and 0.90, then prove baseline fails while mastery succeeds; this demonstrates monotonic Survival influence without statistical tests;
6. `harvestAnimalIntoInventory()` with omitted options uses baseline;
7. player-style explicit coefficient is forwarded and affects trophy result;
8. second harvest remains `null`.

Avoid probabilistic sample-size assertions such as “roughly 90 of 100”; the system is deterministic and boundary-based tests are stronger.

## Important discrepancy corrected from the original plan

The plan initially named `src/ai/NpcAgent.ts` as the NPC harvest call site. Current `main` shows that this is stale: NPC harvesting is delegated through `src/fauna/huntingHooks.ts::createHuntingHooks().harvest()`.

Implementation should follow the current code and modify `huntingHooks.ts` only if needed for the new harvest-options contract.

## Files expected to change

Likely:
- `src/fauna/animalTrophyLoot.ts`
- `src/fauna/animalHarvest.ts`
- `src/fauna/animalHarvest.test.ts`
- `src/app/actions/survivalActions.ts`

Possibly, only for explicit/default option threading:
- `src/fauna/huntingHooks.ts`

Not expected:
- `src/ai/NpcAgent.ts`
- `src/player/PlayerSkills.ts`

## Guardrails

- no second RNG path,
- no player-state import inside fauna modules,
- no new persisted state,
- no Survival XP award from harvesting,
- no change to meat/hide quantities,
- no change to inventory-full semantics,
- no change to antler item definition or quest logic,
- no unrelated hunter/NPC refactor.

## Model assessment

**Composer** is the best fit: small cross-file contract change, deterministic tests, and one stale call-site assumption already resolved by recon.

**Sonnet** is the cheaper low-risk fallback; the implementation is local and architecture is now explicit.
