# Implementation Notes: quests-progression-058 — Injured dog discovery thread

**Prepared:** 2026-09-17  
**Plan:** `quests-progression-058-injured-dog-discovery-thread.md`

## 1. Build on plan 057; do not add a second Medicine bridge

Plan 057 should provide the reusable committed-treatment report:

```text
completed Medicine action
→ actual positive restore
→ narrow animal-treatment report
→ quest/progression consumer keyed by exact animalId
```

058 must consume that seam unchanged. No dog-specific callback should be added to `medicalTreatmentActions.ts`.

The only additional dog-specific work should concern:

- deterministic encounter binding;
- authored stable injury policy;
- temporary injured/resting + post-treatment return behaviour;
- owner dialogue / durable future-story prerequisite.

## 2. Use a real household dog

`src/settlement/livestock.ts` already treats `dog` as ordinary household livestock with deterministic `animalId`, owner and `AnimalSaveState` persistence.

Select one existing dog deterministically from an eligible settlement/household. Bind:

```text
settlementId
householdId
ownerNpcId
dogAnimalId
```

Do not spawn a detached quest dog and do not create a separate health record.

If no eligible dog exists, V1 should produce no encounter rather than silently manufacture one unless current settlement-generation APIs already have a safe deterministic reserved-slot extension.

## 3. This should not be a visible QuestDef before discovery

The opening is intentionally not an accepted/visible quest and must not produce an owner `?` marker.

The 016 opportunity layer is useful for deterministic source selection, but a normal offered/active `QuestDef` would leak the encounter into quest UI/markers too early.

Recommended ownership split:

```text
real dog state                  → livestock / AnimalAgent
encounter binding + phase       → quests-progression compact persisted state
owner dialogue after return     → existing NPC dialogue integration
future story prerequisite       → existing quest outcome/prerequisite machinery where possible
```

Do not overload `QuestState = active` merely to persist the hidden encounter.

A small quests-progression-owned encounter record is justified here because the states are narrative/discovery state, not animal simulation state.

Suggested minimal phase:

```ts
type InjuredDogEncounterPhase =
  | 'injured'
  | 'treated_returning'
  | 'returned_waiting_for_owner_dialogue'
  | 'discovery_revealed'
```

Persist only binding + phase. Dog HP/injury/position/owner continue to come from normal livestock persistence.

## 4. Stable authored injury must extend the existing injury model, not fight it

The encounter dog must neither naturally heal before the Player acts nor die from time alone.

Current physical injury uses lazy recovery (`resolveInjuryRecovery...`) and Medicine explicitly invokes recovery before revalidating treatment. Therefore repeatedly re-damaging the dog from quest code would be brittle and would race with normal Medicine completion.

Prefer the smallest fauna-owned recovery-policy extension that lets a specific persisted animal suppress natural injury recovery while the encounter is in the untreated phase.

Good contract shape is conceptually:

```text
physicalInjury remains authoritative
+ optional recovery policy / recovery lock metadata
```

Requirements:

- suppress only passive/natural recovery;
- do not add periodic damage;
- do not make the dog immortal;
- external combat/drowning/etc. still changes HP normally;
- Medicine `applyPhysicalInjuryTreatment` still reduces the real injury and restores HP;
- the lock clears permanently after successful treatment or encounter terminal handling;
- persistence round-trips it or reconstructs it deterministically from encounter phase before any lazy recovery can erase the wound.

Where possible keep this metadata on `AnimalSaveState`/`AnimalAgent`, because injury recovery is fauna-owned. The encounter phase should decide whether the policy is active; quest code should not implement recovery math.

Do not globally change recovery behaviour for other animals.

## 5. Initial injury should be applied once and be idempotent

The encounter requires a meaningful initial wound. Apply it only when the binding is first materialized/initialized and only if the encounter is still in the initial state.

Do not reapply injury on every settlement stream-in or game boot.

The persisted phase plus normal livestock injury snapshot must make this sequence safe:

```text
fresh encounter → authored injury established once
save/load untreated → same injury remains
Medicine succeeds → phase leaves injured + recovery lock clears
save/load after treatment → injury is not reintroduced
```

Use the existing damage/injury registration helpers if an initial injury can be established without pretending a combat attacker existed. If no suitable public helper exists, add a narrow fauna-owned authored-injury initializer that writes the same authoritative fields as normal injury registration; do not directly patch several fields from quest composition.

## 6. Injured/resting behaviour belongs to fauna

While phase is `injured`, the dog should remain near a deterministic plausible local anchor and avoid normal guard/wander activity.

Do not move the mesh from quest code.

Prefer one small high-priority authored condition/behaviour input in `AnimalAgent`/fauna decision arbitration:

```text
encounter-bound + untreated + injured
→ injured-rest intent
```

This should suppress ordinary dog guarding/wandering but leave critical survival/threat semantics explicit. If ordinary external threat should still trigger flee/defend, keep those above the rest behaviour in arbitration.

The encounter layer should provide only the fact that this dog is in authored injured-rest state; fauna chooses movement/idle behaviour.

## 7. Post-treatment return should reuse existing domestic navigation/home concepts

After the exact dog treatment report is received:

```text
phase = treated_returning
```

Then clear the injured-rest/recovery lock and hand the dog a bounded return intent toward its household anchor/owner vicinity.

Existing fauna already owns:

- household ownership;
- home/wander anchors;
- stray return concepts/navigation;
- normal dog household/guard behaviour.

Reuse those movement primitives rather than adding a quest tick that steers position.

A dedicated tiny return reason/state is acceptable if existing stray-return semantics would incorrectly mark the dog as lost. The important boundary is:

```text
quest/encounter requests "return home"
fauna owns pathing, movement and arrival
```

Arrival should use a bounded distance to the owning household/owner anchor, not exact coordinate equality.

On arrival:

```text
phase = returned_waiting_for_owner_dialogue
```

and ordinary dog behaviour resumes.

If the dog dies while returning, define a terminal encounter handling path rather than teleporting/resurrecting it.

## 8. Owner reaction should be an ordinary dialogue topic, not a marker

Before `returned_waiting_for_owner_dialogue`, do not expose the authored discovery line.

After return, the next relevant interaction with the bound owner can expose one authored dialogue action/topic. Reuse current NPC dialogue grouping/quest-topic infrastructure in `createApp.ts` and existing dialogue helpers; do not add a separate interaction UI.

Selecting the acknowledgement/reveal should:

1. verify current encounter phase and owner id;
2. deliver the authored line;
3. apply the small social consequence once;
4. set `phase = discovery_revealed`;
5. persist a durable future-story prerequisite.

Repeated dialogue after reveal may have ordinary follow-up text, but must not reapply relation/reputation or re-trigger the future hook.

## 9. Future hook: prefer an existing quest outcome prerequisite adapter

Existing `QuestPrerequisite` already supports:

```ts
{ type: 'quest_outcome', questId, outcomeIds }
```

But 058 intentionally has no visible quest. Do not create a fake visible completed quest solely to gain this prerequisite.

Preferred implementation order:

1. Check whether current authored/generated quest infrastructure already supports hidden/story-only definitions that never surface in log/markers but can own an outcome.
2. If yes, use that minimal mechanism and a stable outcome id such as a discovery-revealed result.
3. If not, add one narrow quests-progression story-fact prerequisite adapter rather than a generic global flag framework.

A small contract like:

```text
story fact id: injured-dog-discovery:<binding-id>
value: revealed
```

is acceptable only if it is scoped to quests-progression, persisted, validated and exposed through one prerequisite type. Do not introduce an untyped `Record<string, boolean>` shared across the whole game.

The later quest should depend on this durable fact, not on current dog HP or proximity.

## 10. Save/load ordering matters

The critical restore hazard is lazy injury recovery.

On load, the implementation must ensure the encounter's untreated recovery lock/policy is restored or reconstructable before a code path calls `resolveInjuryRecoveryAt(...)` and silently removes the authored wound.

Verify ordering among:

- saved encounter state hydration;
- livestock `AnimalSaveState` hydration in `src/settlement/livestock.ts`;
- `AnimalAgent` creation;
- any inspection/update/Medicine call that resolves lazy recovery.

If the encounter state is owned outside livestock persistence, composition must be able to tell `spawnLivestock`/`AnimalAgent` that this exact `animalId` has an active authored recovery lock before first meaningful simulation tick.

Do not repair this by resetting injury after load.

## 11. Death handling

The dog is not immortal.

If ordinary external damage kills it while:

- `injured`: encounter can enter a terminal unavailable/failed state and never reveal the future hook;
- `treated_returning`: likewise, do not resurrect/teleport;
- `returned_waiting_for_owner_dialogue`: owner dialogue should reflect death only if authored in scope; otherwise conservatively make discovery reveal unavailable rather than claiming the dog returned safely.

Keep this small in V1; no need for a grief subplot.

## 12. Suggested implementation order

1. Reuse/land plan 057 treatment report first.
2. Add compact encounter binding + persisted phase.
3. Add fauna-owned authored recovery lock/policy and one-time injury initialization.
4. Add injured-rest behaviour.
5. Consume exact dog treatment report → `treated_returning`.
6. Add fauna-owned return-home request/arrival callback or lookup.
7. Add owner dialogue and durable future hook.
8. Add restore/rebuild tests for every phase.

## 13. Focused tests

### Injury policy tests

- untreated authored injury does not recover with elapsed days;
- it does not deal passive damage;
- ordinary external damage can still kill;
- successful Medicine works through normal treatment resolver;
- recovery lock clears after treatment;
- reload does not reapply injury after treatment.

### Encounter tests

- deterministic exact dog/owner binding;
- no dog → no encounter;
- no owner `?` before/after treatment;
- another animal treatment does nothing;
- exact positive dog treatment advances once;
- returning phase survives save/load;
- arrival transitions to waiting-for-dialogue once.

### Dialogue/future-hook tests

- reveal unavailable before return;
- bound owner exposes it after return;
- first reveal applies social consequence and durable hook once;
- repeat dialogue is idempotent;
- save/load after reveal preserves the future prerequisite.

### Regression tests

- ordinary household dogs still guard/wander normally;
- unrelated injured livestock still uses standard natural recovery;
- existing stray-return behaviour is unchanged unless explicitly reused.

## 14. Files to inspect/change first

- plan 057 treatment-report implementation
- `src/settlement/livestock.ts`
- `src/fauna/AnimalAgent.ts`
- `src/fauna/animalStray.ts` / existing return-navigation helpers where reusable
- dog guard/decision modules used by `AnimalAgent`
- `src/shared/injuryRecovery.ts`
- `src/player/medicalTreatment.ts`
- `src/quests/quests.ts`
- `src/quests/QuestManager.ts`
- current 016 opportunity/materialization modules
- `src/app/createApp.ts`
- `src/persistence/saveData.ts` only if the compact encounter phase cannot live in an existing quests-progression save container

Add JSDoc with `@domain quests-progression` or `@domain fauna` on new public seams according to state ownership.

> **Zrób git commit i push do main, rebase jeżeli trzeba**