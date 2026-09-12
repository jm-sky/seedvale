# Implementation Notes: fauna-024 — Lost livestock stray displacement

**Prepared:** 2026-09-12  
**Plan:** `fauna-024-lost-livestock-stray-displacement.md`

## 1. Current architecture to preserve

Livestock is not a separate runtime type. `src/settlement/livestock.ts` spawns the same `AnimalAgent` used by fauna and persists each deterministic livestock individual through `LivestockSaveRecord` / `LivestockRegistry`.

Important current invariants:

- `animalId` is stable for settlement livestock,
- `AnimalOwner` in `src/fauna/animalOwnership.ts` is the authoritative ownership value,
- `ownerHouseId` is derived compatibility data,
- `AnimalSaveState` already persists position, health, needs, corpse progress, ownership, control, affinity, name and rabies,
- `LivestockRegistry` keeps origin `settlementId` provenance and snapshots loaded livestock on settlement unload/save,
- dead livestock remains the same `AnimalAgent` until corpse cleanup completes.

Lost livestock must extend these paths, not introduce `QuestAnimal`, another manager or another save collection.

## 2. Relevant files / symbols

### Fauna state and behaviour

`src/fauna/AnimalAgent.ts`

- `AnimalSaveState`
- `AnimalAgentDeps`
- `AnimalUpdateContext`
- `AnimalAgent.snapshot()` / `hydrate()`
- `readyToRemove()`
- `isDead()`
- home / wander / trip locomotion integration

`src/fauna/animalOwnership.ts`

- `AnimalOwner`
- `deriveOwnerHouseId()`
- `isHouseholdOwned()`

`src/fauna/animalRoaming.ts`

- `AnimalTrip`
- existing bounded destination/probe helpers
- existing pattern where a trip may intentionally go beyond ordinary `wanderRadius`

`src/fauna/faunaDecision.ts` and threat/flee helpers reached from `AnimalAgent`

- survival assist should patch a narrow flee/threat parameter seam only after tracing the existing threat path,
- do not create a second `FaunaBehaviourKind` unless current code makes that strictly necessary.

### Livestock persistence

`src/settlement/livestock.ts`

- `LivestockSaveRecord`
- `LivestockPersistence`
- `LivestockRegistry`
- `createLivestockRegistry()`
- `spawnAnimalFromRecord()`
- deterministic household-slot reconstruction

The save record already combines provenance (`settlementId`, `animalId`, `kind`) with `AnimalSaveState`. Add stray state through `AnimalSaveState` unless current implementation has since introduced a more specific per-animal persisted extension seam.

### Corpse lifecycle

`src/fauna/animalCorpse.ts`

- `AnimalCorpseState`
- `corpseReadyToRemove()`
- `createAnimalCorpseState()`
- `advanceAnimalCorpse()`

Current natural unharvested corpse lifetime is 60 realtime seconds. `AnimalAgent.readyToRemove()` delegates to `corpseReadyToRemove()`.

Do not use runtime-only `held` as persisted lost-livestock protection: `held` currently means a short-lived player interaction/harvest hold and is not the correct durable semantic.

Prefer to let the cleanup gate inspect durable stray state supplied by the host/caller, or add one narrow durable corpse-retention predicate tied to unresolved stray state. Avoid duplicating corpse timers.

### Follow / lead reference

`src/fauna/ownedAnimalControl.ts`

- `OwnedAnimalControlMode`
- `resolveOwnedControlMovement()`
- `resolveFollowHysteresis()` through `followHysteresis.ts`

Current Follow/Stay explicitly gates on `isPlayerOwned`; do not temporarily transfer household livestock to the player.

If implementing lead needs the same distance hysteresis, reuse/extract the actor-agnostic helper rather than copying thresholds/state logic.

### Quest opportunities

`src/quests/opportunities/worldQuestOpportunityTypes.ts`

Current implemented `WorldQuestOpportunityKind` contains `wolf-den-pressure`; `SettlementQuestOpportunity` is a discriminated union.

Add a typed lost-livestock opportunity, likely carrying stable refs equivalent to:

```text
settlementId
houseId
animalId
```

Do not add `Record<string,string>` source bags.

`src/quests/opportunities/settlementQuestOpportunities.ts`
`src/quests/opportunities/settlementQuestSelection.ts`
`src/quests/opportunities/worldQuestMaterialization.ts`
`src/quests/QuestManager.ts`
`src/app/createApp.ts`

Trace the already-implemented `wolf-den-pressure` vertical slice and reuse its direction of dependencies:

```text
domain-owned source state
→ lightweight opportunity
→ materialized normal QuestDef
→ narrow lookup into world state
```

Do not import `SettlementsManager` or fauna managers directly into `QuestManager`.

## 3. Important discrepancy from quests-progression-016 notes

The implementation notes for `quests-progression-016` explicitly state that existing `find_animal` is an objective mechanism, not a lost-livestock detector.

Its current behaviour binds a quest objective to an animal target and treats death as failure. That is insufficient for fauna-024 because the desired dead branch is:

```text
animal dies
→ corpse remains discoverable
→ player inspects corpse
→ quest gets a different terminal outcome
```

Therefore do not force fauna-024 through unchanged `find_animal` semantics if it would immediately fail on death.

Prefer either:

- a narrowly extended objective/outcome contract that can observe the lost-livestock source snapshot, or
- a lost-livestock-specific world objective using the existing injected lookup pattern.

Keep the change typed and scenario-specific rather than introducing a generic expression engine.

## 4. Stray state ownership

Recommended V1 state belongs to the animal/fauna domain.

It only needs data required for durable world semantics, for example:

```text
active
origin x/z or resolvable home anchor
survivalAssist
corpseInspected
```

Avoid storing:

```text
questId
questStage
questAccepted
questCompleted
```

inside fauna state.

If the quest starts the episode in V1, idempotence belongs at the domain operation boundary:

```text
startStray(already active same animal)
→ no second displacement
```

This matters for restore/materialization.

## 5. Selecting the animal

The selection API should operate over existing loaded/persisted livestock views and return an existing stable `animalId`.

At minimum reject:

- dead animals,
- player-owned animals,
- already-strayed animals,
- mounted animals,
- wrong household,
- unsupported species.

Prefer deterministic ordering + seeded selection keyed by stable settlement/house/occurrence inputs.

If the quest materialization system persists/reconstructs enough source identity already, bind the resulting opportunity to the selected `animalId` rather than reselecting after load.

## 6. Displacement destination

Do not implement pathfinding.

Use bounded candidate probes from the animal's home/origin. Reuse existing terrain/water validity helpers and the same general probe style used by fauna roaming/water trips.

Recommended algorithm shape:

```text
sample N directions/distances
→ reject invalid terrain/water/collision points
→ score remaining points
   distance from home: enough to be genuinely lost
   predator pressure: penalty, not hard exclusion
→ deterministic tie-break
```

Predator avoidance should be based on a bounded/local currently available threat query. Do not scan every fauna entity over a large region every frame. This work occurs once when starting the episode.

If no semi-safe candidate is found, fall back to the best valid terrain candidate rather than blocking the quest forever.

## 7. Movement vs direct reposition

Preferred order:

1. reuse existing trip/movement machinery if it can accept a one-off displacement destination without large changes,
2. otherwise use one domain-owned validated reposition operation as a V1 fallback.

Do not let quest code mutate `mesh.position` directly.

If travel is simulated, displacement target reaching should end only the travel step, not the stray episode. Once away from home the animal resumes normal needs/threat/roaming behaviour while `stray.active` remains true.

## 8. Survival assist

Do not change max HP/current HP for V1.

Find the narrowest existing threat/flee tuning seam. Candidate effects:

- slightly larger threat detection distance for the active strayed animal,
- stronger/earlier flee commitment,
- modest stamina drain reduction or flee speed modifier while actually fleeing.

Required gate everywhere:

```text
stray.active && stray.survivalAssist
```

Do not store this on `AnimalDef`, because definitions are species-wide shared config.

Do not propagate a generic `survivalMode` through unrelated animal code.

Prefer one small derived modifier object/function from the animal's current stray state.

## 9. Corpse retention

Current `animalCorpse.ts` removes natural corpses after 60 seconds.

Needed invariant:

```text
stray.active && dead && !corpseInspected
→ ordinary readyToRemove must remain false until a long world-time cap
```

Use existing corpse `timeSinceDeath` for decay presentation if possible; do not stop visual decay simply because cleanup is deferred.

A corpse can therefore progress fresh → rotting → bones while still being retained as the same dead animal identity.

The long cap should use a world-time measure if available at the cleanup integration point. If corpse state only advances in realtime seconds today, document the smallest additional persisted timestamp/elapsed measure needed rather than encoding a many-hour realtime constant blindly.

After `corpseInspected = true`, ordinary cleanup may resume. Decide whether to reset any remaining TTL only if required for usability; do not create another corpse lifecycle.

## 10. Corpse inspection interaction

Search existing player interaction routing for dead `AnimalAgent` actions (`harvest`, `bury`, interaction target labels).

Add inspection at that boundary rather than in quest UI.

Domain operation:

```text
inspectStrayedCorpse(animalId)
→ validate same animal is dead + stray.active
→ set corpseInspected
```

The quest observes the changed source snapshot.

Do not remove/harvest the corpse as part of inspection.

## 11. Temporary leading

Current player-owned Follow cannot be used as-is because it checks ownership.

Keep V1 small:

- one runtime-only temporary lead target / actor reference for eligible strayed livestock,
- movement reuse through existing follow hysteresis/locomotion where possible,
- threats and strong needs may interrupt/override lead according to existing behaviour priority,
- no ownership mutation,
- no persistence requirement for the runtime lead target itself.

On save/load the animal can remain lost but no longer actively following until the player interacts again.

Do not build generic rope/path systems in this plan.

## 12. Return detection

Use a pure helper so it is easy to test:

```text
isStrayedAnimalReturned(state, position, home/origin, radius)
```

Call it from a low-cost existing livestock/animal update path; do not introduce a settlement-wide per-frame search.

When true:

```text
clear stray state
clear lead state
survival assist becomes inactive
```

The owner remains unchanged throughout.

## 13. Quest status contract

Current `WorldQuestSourceStatus` is only:

```text
untracked | present | resolved | absent
```

That is enough for binary external resolution but not for the desired living/dead outcomes.

Do not overload `absent` to mean inspected corpse.

Prefer a typed lost-livestock lookup/snapshot, e.g. conceptually:

```text
{ status: 'lost-alive' }
{ status: 'returned' }
{ status: 'corpse-uninspected' }
{ status: 'corpse-inspected' }
{ status: 'unavailable' }
```

`QuestManager` should receive this through a narrow injected callback/type, following the existing rat/world lookup pattern.

If existing consequence/outcome resolution already supports branching by world lookup, reuse it. Otherwise add the smallest lost-livestock-specific evaluation branch.

## 14. Start timing / V1 compromise

The intended architecture normally says the world problem should precede the quest opportunity. For fauna-024 V1, the agreed simplification is that quest opportunity/materialization may initiate the stray episode.

Keep this compromise isolated:

```text
materialization/start hook
→ fauna.startStray(animalId)
```

After this call, world state is authoritative.

This must be idempotent across:

```text
save/load
QuestManager reconstruction
opportunity re-collection
```

Future predator/storm/fence triggers should be able to call the same fauna operation without involving quests.

## 15. Persistence cases to test explicitly

`AnimalAgent.snapshot()` / `hydrate()` plus `LivestockRegistry` should round-trip:

1. alive + active stray + displaced position,
2. alive + active stray after temporary lead was used,
3. dead + active stray + corpse uninspected,
4. dead + active stray + corpse inspected,
5. returned animal with no active stray state.

Also verify deterministic livestock reconstruction does not replace/reset an active stray record merely because its saved position is far from the house.

## 16. Suggested implementation order

1. Add stray state module/type and `AnimalSaveState` serialization.
2. Add pure eligibility + start/clear/return helpers.
3. Add bounded destination selection and domain integration.
4. Add narrow survival modifier to existing threat/flee path.
5. Extend corpse cleanup gate and add inspection action.
6. Add temporary lead runtime state by reusing follow hysteresis.
7. Add source resolver/snapshot from settlements/fauna composition boundary.
8. Add typed opportunity + materialization + quest outcome handling.
9. Add tests close to each helper/module and integration regression tests.
10. Update `docs/state/fauna.md`, `docs/state/quests.md` and persistence docs if the save contract changes materially.

## 17. Guardrails for implementation agent

- Current code wins if it differs from these notes.
- Do not perform unrelated `AnimalAgent` refactors.
- Do not create a generic status-effect framework for one survival modifier.
- Do not create a generic household problem engine in this plan.
- Do not change all animals' predator behaviour.
- Do not transfer ownership to the player for leading.
- Do not spawn a replacement animal for the quest.
- Do not run browser verification; user performs it manually.
- Add JSDoc with `@domain fauna` to important public state/operations used across modules.

> **Zrób git commit i push do main, rebase jeżeli trzeba**