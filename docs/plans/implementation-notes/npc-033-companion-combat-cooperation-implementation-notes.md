# Implementation Notes: Companion combat cooperation

**Plan:** `docs/plans/npc-033-companion-combat-cooperation.md`
**Reviewed:** 2026-09-19
**Codebase:** `main`

## Recon outcome

The implementation should be a small extension of existing NPC animal-threat assistance, not a companion combat subsystem.

The most important post-draft changes on `main` are:

- `npc-048` already added `senseLocalThreatAssistance()` to `npcAnimalThreat.ts`; this is the closest existing “help another actor under local threat” seam.
- `npc-053` already made NPC weapon choice profession-aware and deterministic. Do not design a new weapon-ranking system in npc-033.
- `items-player-027` already made `personalInventory` the owner of gifted weapons/ammo and `resolveNpcAmmo()` preserves the actual ammo owner.
- `npc-032` is still only `planned`. Its future continuation/abandonment contract is a real implementation blocker; do not invent its final API in advance.

## Exact combat call chains

### NPC → fauna

```text
NpcAgent threat/hunt caller
→ CombatIntent { target: combatTargetForAnimal(animal), mode }
→ NpcAgent.beginCombat()
→ NpcAgent combat phase
→ applyNpcMeleeHit() / applyNpcRangedHit()
→ CombatTargetHandle.applyDamage()
→ AnimalAgent.takeDamage(amount, 'npc')
→ fauna-owned HP/collapse/corpse lifecycle
```

NPC attack execution is target-handle based and already re-reads target position/liveness.

### fauna → NPC

```text
AnimalAgent/fauna attack decision
→ fauna outgoing damage (faunaCombat.ts)
→ fauna update onNpcHit callback
→ app/gameLoop.ts resolves loaded NpcAgent
→ NpcAgent.applyIncomingCombatDamage()
→ resolveIncomingNpcDamage()
→ held defense + derived armor mitigation
→ NpcAgent.takeDamage()
→ HealthState + physicalInjury + vigor
→ commitNpcDeath() if dead
```

Fauna outgoing damage is a separate older mechanism; do not normalize it in this plan.

### player → fauna

```text
player input
→ playerMelee / playerRanged lifecycle
→ gameLoop hit resolution
→ critical resolution
→ AnimalAgent.takeDamage(..., 'player')
```

This player path does not use `CombatTargetHandle`.

### fauna → player

```text
fauna attack
→ damageVsHuman()
→ onHumanHit callback
→ applyPlayerDamage()
→ active block
→ armor mitigation
→ HP + physical injury
→ player downed lifecycle
```

This is the concrete V1 signal whose **attacker/target fact** companion protection may observe at the existing candidate-production boundary.

### NPC → hostile NPC

No gameplay producer currently drives this direction. Generic NPC combat execution could consume a future NPC `CombatTargetHandle`, but current main has no general hostile-NPC decision/target producer. Keep out of scope.

### player → NPC

`NpcAgent.applyIncomingCombatDamage()` can receive a future caller, but ordinary player melee/ranged hit delivery against NPCs is not wired. Current player hit candidate loops apply damage to animals. Do not solve this from companion code.

### NPC → player

No generic hostile-NPC producer/player `CombatTargetHandle` builder is wired. Do not add one for npc-033.

## Threat perception and decision seams

### `src/ai/npcAnimalThreat.ts`

Current data:

```ts
ThreateningAnimalCandidate {
  animalId
  kind
  x
  z
  target: CombatTargetHandle
  threateningHuman?
  preyAnimalId?
  preyOwnerHouseId?
}
```

Existing perception:

- `senseImmediateAnimalThreat()`: nearest active human threat within 10.
- `senseLocalThreatAssistance()`: bounded local assistance (30) for active human danger or predator committed to livestock.
- `arbitrateAnimalThreat()`: scores `defend | flee` from usable capability, HP ratio, neuroticism and optional guard responsibility.

Do not create a parallel “companion threat evaluator”. Extend this module/rule family so the caller-built candidate can preserve who is threatened and so accompany/relationship can contribute a modest context bias.

The attacker domain remains authoritative for hostility.

### Candidate construction / forwarding

Keep the existing ownership pattern:

```text
app/fauna owner knows active attacker state
→ build small ThreateningAnimalCandidate[]
→ SettlementsManager.update()
→ Settlement.update()
→ NpcAgent.update()
```

If player-vs-NPC threatened identity must be added, add it once to this bounded data flow. Do not have every NpcAgent inspect all fauna/NPCs.

## NPC combat execution and mode selection

### `src/ai/npcCombat.ts`

Already implemented:

- `resolveNpcMeleeWeapon(inventory, role)` — profession-aware deterministic score.
- `resolveNpcRangedWeapon(inventory, role)` — same for ranged.
- `resolveNpcAmmo(inventories, ranged)` — returns `{ kind, inventory }`.
- `resolveIncomingNpcDamage()` — NPC combat defense/armor seam.
- `applyNpcMeleeHit()` / `applyNpcRangedHit()`.

Do not change weapon ranking for companion reasons.

The useful missing seam is a small **general mode resolver**. Before adding one, verify main still lacks it. It should choose between the already-resolved melee/ranged capabilities from target distance and actual ammo availability. Reuse it in ordinary animal self-defense as well as cooperation so companion logic cannot drift.

### Ammo ownership

`NpcAgent.resolveRangedAmmo()` currently uses:

```text
resolveNpcAmmo([personalInventory, carried], ranged)
```

This means:

1. gifted arrows in `personalInventory` already work;
2. transient work arrows in `carried` remain a fallback;
3. the returned inventory is the one mutated on fire.

Never move/copy gifted ammo into `carried`.

## `NpcAgent` seams

Relevant existing responsibilities:

- threat reaction/reaction throttle;
- `reactToAnimalThreat()`;
- `beginCombat()` / `cancelCombat()` / `endCombat()`;
- melee/ranged combat ticks;
- `fleeFromThreat()`;
- `applyIncomingCombatDamage()`;
- trace + inspection;
- ordinary choose/idle-duty flow that resumes accompany.

Combat cooperation should add only transient context sufficient to answer:

- why was this target selected?
- who was being protected?
- is that reason still valid?

Do not persist it.

### Chase/disengage trap

The combat phase will continue following a live target. Without a cooperative revalidation seam, a protector can be dragged indefinitely away from the player.

Revalidate at the existing animal-threat reaction cadence or on meaningful threat/injury transitions. Do not add a second ticker.

Cancellation should happen when the hostile relation that justified protection is gone, not merely because a raw player-distance threshold was crossed.

## Accompany interaction

### `src/ai/npcAccompanyCommitment.ts`

Persistent/source-neutral. Holds no combat state.

### `src/ai/npcAccompanyExecution.ts`

Transient follow/stay hysteresis. Current follow distances are 12 start / 6 stop, retarget 2. Combat/flee should supersede this execution temporarily.

Expected lifecycle:

```text
accompany action
→ local threat
→ combat/flee
→ phase ends
→ ordinary choose()
→ same accompanyCommitment is still present
→ follow resumes
```

Do not “resume” by reconstructing a saved follow action; the semantic commitment is already the resume owner.

## npc-032 dependency boundary

Current `npc-032` plan intends to own:

- travel-aware survival;
- continuation vs abandonment;
- generic return-home travel after abandonment.

It is **not code yet** and is blocked by `items-player-028` / `items-player-032`.

When implementing npc-033:

1. read the landed npc-032 code and notes;
2. use its actual public continuation/abandonment seam;
3. feed combat outcome facts into it only after tactical combat/flee resolves;
4. do not add a second combat-only continuation enum/evaluator.

Temporary flee must be resumable. Severe injury/danger may only end accompany via npc-032's final generic lifecycle.

## Relationship context

`NpcAgent` already has Player↔NPC social lookup used by other decisions.

Use that read model as a bounded willingness modifier. Do not add a combat relationship store.

For NPC→NPC protection, only implement V1 if the existing animal target fact plus loaded NPC lookup can establish that the threatened NPC shares the relevant accompany context without creating a party registry/global scan.

## Injury / death / corpse

NPC accepted damage:

```text
applyIncomingCombatDamage
→ takeDamage
→ registerPhysicalInjuryFromDamage
→ derived injury severity
```

Use the existing severity in self-preservation. Do not add combat wound thresholds.

Death:

```text
commitNpcDeath()
→ transferAllInventoryContents(personalInventory, corpse inventory)
→ NpcPostDeathState.loot
```

This is already lossless after npc-036. Player-given equipment needs no special handoff.

`carried` work/logistics payload is deliberately outside corpse loot; do not accidentally broaden npc-033 into that separate known ownership issue.

## Player downed asymmetry

Player HP uses `applyPlayerDamage()` and enters a temporary `downed` state rather than NPC permanent death.

npc-033 should not add revive. A downed player may still be the protected participant only while the same real local hostile attacker remains an active threat.

## Friendly fire

Current NPC ranged combat resolves against its intended target handle/live target, not a general all-actor collision collection. Do not add a party/friendly-fire subsystem.

The real correctness issue is **hostility provenance**: only attacker-owned hostile state can produce a protection target. Player aggression against a neutral actor is not enough.

## Off-screen semantics

Existing `npcOffscreenSurvival.ts::resolveNpcOffscreenTravelInterval()` handles elapsed travel hunger/thirst, personal provisions and injury recovery. It deliberately does not simulate combat.

npc-033 adds no off-screen encounters.

Stream-out/reconstruction rules:

- health/injury/inventory/accompany/travel persist;
- combat intent/projectile/chase/protection reason do not;
- reified NPC perceives current live threats again.

## Performance guardrails

Keep work proportional to the existing bounded threat candidate set.

Do not introduce:

- per-companion fauna scans;
- companion×enemy graphs;
- party registries for combat;
- new pathfinding loops;
- new combat update loop.

If multiple companions are present, each independently consumes the same already-bounded candidate facts on its ordinary NPC update/reaction cadence.

## Minimal implementation sequence

1. Confirm npc-032 landed; otherwise stop.
2. Reconfirm combat matrix/candidate producer.
3. Lock regression tests for ordinary `npcAnimalThreat`.
4. Add threatened-actor identity/context to the existing bounded candidate flow.
5. Generalize local threat assistance for accompany context.
6. Add modest relationship/accompany bias to ordinary arbitration.
7. Add/reuse general melee-vs-ranged mode resolver.
8. Wire real fauna→player threat to existing NPC→fauna combat.
9. Add transient cooperative revalidation/disengage.
10. Integrate post-combat/flee continuation with landed npc-032.
11. Add diagnostics and focused tests.

## High-risk pitfalls

- Treating `npc-032`'s planned API names as implemented contracts.
- Reimplementing weapon ranking that npc-053 already owns.
- Treating a bow as ranged capability without real ammo.
- Moving gifted ammo into `carried`.
- Inferring hostility from proximity or player aggression.
- Adding companion-only player→NPC/NPC→NPC/NPC→player combat wiring.
- Persisting target/protection/chase state.
- Ending accompany directly from `fleeFromThreat()`.
- Letting protection combat chase forever because `CombatIntent` stays live.
- Adding an off-screen battle simulation.
- Re-scanning fauna per companion instead of extending existing candidate forwarding.

## Verification focus

Highest-value targeted tests:

- self-defense regression;
- hostile animal→player candidate → companion protect;
- neutral animal ignored;
- gifted melee weapon/ammo visible immediately through ordinary ownership;
- no-ammo bow unavailable;
- deterministic close melee / distant ranged mode;
- relationship bias cannot beat hard self-preservation;
- threat ends → combat disengages;
- flee → same accompany resumes;
- severe outcome → landed npc-032 abandonment;
- NPC death → ordinary corpse loot;
- no persisted cooperation state / no global scan.

AI does not perform browser verification.
