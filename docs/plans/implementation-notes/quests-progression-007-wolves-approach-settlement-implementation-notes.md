# Implementation notes: quests-progression-007 wolves approach settlement

## Verified current-code facts

- `src/fauna/AnimalSpawner.ts` owns the generic habitat-spawner lifecycle. `SpawnerType` includes `wolfDen`; `PreySpawner` owns stable `id`, `kind`, `respawnIntervalDays`, `maxPreyCount`, `state`, `deathsThisCycle` and `disabledAtDay`. `WOLF_DEN_ID = 'wolf-den'` is the single current den identity.
- `wolfDen` currently opts out of `updateSpawners()` respawn by using `respawnIntervalDays: Infinity`. Its pack still carries `spawnPointId`, contributes deaths to depletion, and can be destroyed through the generic depleted-spawner interaction.
- `SavedSpawnPointState` in `src/fauna/AnimalSpawner.ts` currently persists only `state`, `deathsThisCycle` and `disabledAtDay`; `src/app/saveState.ts` snapshots it and `src/persistence/saveData.ts` owns the serialized shape/validation.
- Generic habitat recovery is `disabled → recovering → active`: after `RECOVERY_DAYS = 21`, recovery waits for `MIN_RECOVERY_POPULATION = 2` nearby same-kind animals. A permanently destroyed problem den therefore needs a source-owned way to opt out of this existing recovery path without changing cave/thicket semantics globally.
- Wild-fauna individuals are not persisted. Do not make `pressure` / `humanTaste` authoritative on individual wolves. The authoritative durable state must be den/spawner-owned and re-applied to freshly reconstructed wolves after save/load/rebuild.
- `src/fauna/predatorHumanDecision.ts` is the pure human-response seam. `PredatorHumanDecisionInput` already includes hunger, distance, notice/panic range, fire, nearby-human count, species, HP ratio, provocation and an injected aggression roll. `scorePredatorHumanIntents()` computes competing flee/attack scores; close/retaliation branches are shared by wolf/bear.
- Runtime `frenzied` is distinct from rabies and already feeds existing human/NPC aggression, but it is runtime-only. Reuse its integration lessons, not its state ownership, for `humanTaste`.
- `src/fauna/faunaDecision.ts` contains the fixed top-level behaviour priority table. It already has `npc-attack-frenzied`, regular NPC response branches, `frenzy-beeline`, and normal predator fallback. Avoid adding a quest-only parallel behaviour pipeline.
- Current village exclusion for non-frenzied predator NPC target acquisition is applied only when acquiring a target. Once `npcTarget` exists, the predator can continue the pursuit into the settlement. This is recorded in `docs/plans/LOOSE-ENDS.md`; the new scenario may rely on this current behaviour, but should not accidentally broaden normal acquisition inside settlements unless explicitly intended by `humanTaste`.
- `docs/state/combat.md` confirms NPC animal defense is already live: `senseImmediateAnimalThreat()` / `decideAnimalThreatResponse()` choose defend/flee; defend uses `NpcAgent.beginCombat()` with the existing fauna combat target adapter. No new NPC combat path is needed.
- fauna-016 is implemented and technically verified. It added species-specific roaming and a persistent-in-runtime trip/destination seam. If increased population plus `humanTaste` does not produce enough settlement encounters, extend that existing trip mechanism rather than increasing all wander ranges or spawning wolves beside the village.
- `src/quests/quests.ts` already defines `QuestObjective { type: 'clear_wolf_den'; denId }` and existing wolf quests `grozny-wilk` and `wilcza-jama`. The current comment defines `clear_wolf_den` as the whole initial pack being dead, reported by `Fauna.isWolfDenCleared()`; that is weaker than the new scenario's required permanent destruction condition.
- Existing `wilcza-jama` deliberately binds directly to `WOLF_DEN_ID`, not an individual wild animal. Preserve that stable world-entity binding pattern.
- `QuestManager` is not fauna authority. It consumes injected/resolved world references/events and must remain an observer of the den's real state.

## Ownership decisions for this plan

### Den-owned durable problem state

`pressure` and `humanTaste` belong to the real wolf-den/spawner state, not to quest progress and not to `AnimalAgent` persistence.

The persisted source must be sufficient to reconstruct after save/load:

```text
wolfDen source state
→ effective population cap / respawn interval
→ newly created wolves inherit source behavioural modifier
→ quest observes destruction state
```

Prefer extending the existing spawn-point snapshot contract over introducing a separate `WolfProblemState` registry unless current code at implementation time proves that `PreySpawner` cannot coherently own these fields.

### `pressure`

Keep the generic spawner's configured baseline values distinct from effective pressure-adjusted values. Avoid mutating `maxPreyCount`/`respawnIntervalDays` destructively if that would make restoration/removal of pressure ambiguous.

A small pure helper around the spawner config is preferable, e.g. conceptually:

```text
baseline config + pressure → effective cap / interval
```

Exact numeric tuning remains a plan-finalization decision.

### `humanTaste`

Do not model it as rabies or as a second `frenzied` boolean.

Thread a bounded numeric modifier into the existing predator-human decision input/scoring seam so `0` preserves current behaviour. It should separately affect fear and human-oriented attack/appetite pressure, making its semantics visible and testable instead of hiding both effects behind one arbitrary attack-score bonus.

The source-to-individual propagation should happen at the existing wolf creation/spawn integration point in `createFauna.ts` or the nearest current constructor/config seam. Do not make `QuestManager` iterate animals and mark them.

### Permanent destruction

The new quest's source resolution is stronger than existing `depleted` and stronger than existing `clear_wolf_den` pack-dead semantics.

Reuse the generic destroy interaction, but persist an explicit source-owned non-recoverable outcome or equivalent existing state if the code has evolved by implementation time. Do not globally remove `disabled → recovering` from ordinary habitat spawners.

Live wolves remaining after destruction stay real fauna and are not despawned by quest cleanup.

## Quest integration

The new quest should use a world-state objective/ref whose success condition is the real den destruction state.

Do not silently redefine existing `clear_wolf_den` if doing so would change `wilcza-jama`. Before implementation choose one of these based on current call sites:

1. keep `clear_wolf_den` as pack-cleared compatibility and add a generic/den-specific destruction objective/ref, or
2. evolve `clear_wolf_den` only if every existing consumer can safely adopt the stronger semantics and the existing quest content remains correct.

The NPC hint stage is ordinary quest/dialogue progression. No tracking, footprints or investigation subsystem is required for V1.

## Persistence integration points to verify immediately before coding

Inspect the then-current versions of:

```text
src/fauna/AnimalSpawner.ts
src/fauna/createFauna.ts
src/app/saveState.ts
src/persistence/saveData.ts
src/app/createApp.ts
```

Determine whether adding optional/defaulted fields to the existing saved spawn-point entry is semantically compatible with the current migration policy. If persisted meaning changes require a save-version bump under the current `CURRENT_SAVE_VERSION` rules, add the real migration rather than relying on parser defaults accidentally.

Do not persist individual wild wolves.

## Behaviour/combat integration points to verify immediately before coding

Inspect:

```text
src/fauna/predatorHumanDecision.ts
src/fauna/faunaDecision.ts
src/fauna/AnimalAgent.ts
src/fauna/createFauna.ts
src/ai/npcAnimalThreat.ts
src/fauna/faunaCombat.ts
```

Confirm where the existing human intent is refreshed/throttled and where NPC candidates are supplied. `humanTaste` should reuse those same refresh periods and bounded candidate lists — no extra per-frame settlement/NPC scan.

## Movement escalation rule

Implement population + `humanTaste` first.

Only add settlement-directed trips if manual verification shows that real encounters remain too rare. If needed, extend fauna-016's existing trip reason/destination ownership with a wolf-compatible destination reason and bounded opportunity/cooldown. Do not make this mandatory architecture before evidence shows it is needed.

## Existing content compatibility

Before coding, inspect the current definitions and tests for:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/QuestManager.test.ts
```

Pin behaviour of `grozny-wilk` and `wilcza-jama` with focused regression tests before changing wolf-den objective semantics.

The new quest's exact `QuestDef.id`, giver, reward and relation/prerequisite sequencing remain intentionally unresolved while the plan is `draft`.

## Implementation order

1. Extend/pin generic den source state and persistence (`pressure`, `humanTaste`, permanent-destruction semantics).
2. Add pure effective-population tuning from `pressure`; convert `wolfDen` away from unconditional `Infinity` only when source state requires ongoing population.
3. Thread source `humanTaste` into newly spawned den wolves and the existing predator-human/NPC decision seam.
4. Add permanent destroy handling while preserving ordinary habitat recovery.
5. Add/adjust quest world-state objective/ref for real destruction.
6. Add NPC hint/content stages and completion/report flow.
7. Evaluate encounter frequency; only then add a settlement-directed trip extension if required.

## Pitfalls

- Do not use active quest state to enable/disable pressure; the world problem must be capable of existing independently of the player accepting the quest.
- Do not use `frenzied` as persisted authority.
- Do not persist wild wolves just to preserve the scenario.
- Do not turn normal wolves globally into settlement attackers.
- Do not broaden generic habitat destruction to permanent destruction.
- Do not complete on kill count or `depleted` alone.
- Do not despawn surviving wolves on quest completion.
- Do not introduce a `WolfManager`, quest spawn registry or second population system.
- Do not add disease/rabies semantics to explain `humanTaste`.

## Verification focus

Automated tests should pin pure pressure scaling, neutral `humanTaste = 0`, monotonic fear/attack effects, persistence round-trip, non-recovery after permanent destruction, and existing wolf-quest compatibility.

Manual browser verification remains the user's responsibility; no AI browser verification.
