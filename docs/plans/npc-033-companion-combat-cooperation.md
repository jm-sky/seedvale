# Plan: Companion combat cooperation

**Created:** 2026-09-11
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** ~~npc-029~~, npc-032, ~~items-player-027~~, ~~npc-025~~
**Domain:** `npc`
**Type:** `feature`
**Subdomains:** `combat` `behavior` `decision-making` `relationships`
**Tags:** `companions` `expedition` `combat` `mutual-defense` `threats` `equipment`
**Roadmap:** `companions.md`
**Model:** Sonnet, Composer

## Goal

Pozwolić zwykłemu NPC z aktywnym `accompanyCommitment` współpracować bojowo z graczem bez tworzenia Companion AI.

Docelowy model:

```text
ordinary NPC combat capability
+ ordinary bounded threat perception
+ relationship / social context
+ active accompany commitment
+ health / injury / personality / equipment
→ contextual cooperation
→ existing CombatIntent / flee execution
→ ordinary damage / injury / death
→ normal re-arbitration
→ resume accompany
   OR final npc-032 continuation/abandonment lifecycle
```

Towarzyszenie zwiększa skłonność do ochrony gracza, ale nie jest rozkazem walki i nigdy nie daje suicidal loyalty.

Nie tworzyć:

- `CompanionCombatAI`;
- `PartyCombatManager`;
- companion damage pipeline;
- companion weapon/ammo slots;
- persistent party target / aggro table;
- permanent bodyguard mode;
- magic aggro na każdego przeciwnika gracza;
- osobnego combat tickera ani off-screen battle simulatora.

## Dependency state verified on main

### `npc-029` — satisfied

Status `verification needed`. Implemented source-neutral `NpcAuthoritativeState.accompanyCommitment`, public lifecycle oraz transient follow/stay execution.

Combat/flee może przerwać bieżące wykonanie follow, ale nie może kasować commitmentu bez jawnej lifecycle decision.

### `items-player-027` — satisfied

Status `verification needed`. Player → NPC transfer przenosi real ownership do `NpcAuthoritativeState.personalInventory`.

Player-given weapon/ammo jest od tej chwili zwykłą własnością NPC; nie powstaje assigned/companion equipment state.

### `npc-025` — satisfied

Istnieją authoritative `physicalInjury`, derived injury severity oraz normalny recovery/healing contract.

### `npc-032` — hard blocker for implementation

Status `planned`, nie implemented. Jest jedynym planowanym ownerem expedition survival continuation/abandonment i return-home semantics.

`npc-033` może być implementowalnym planem, ale implementacja nie może rozpocząć combat-specific abandonment zanim finalny `npc-032` contract nie znajdzie się na `main`. Nie zakładać nazwy typu `AccompanyContinuationEvaluation`, dopóki kod jej nie definiuje.

## Current authoritative ownership

| Concern | Owner |
|---|---|
| accompany intent | `NpcAuthoritativeState.accompanyCommitment` |
| health | existing NPC `HealthState` |
| physical wound | `NpcAuthoritativeState.physicalInjury` |
| personal gear/ammo | `NpcAuthoritativeState.personalInventory` |
| work/logistics transient supply | `NpcAgent.carried` |
| NPC weapon/ammo/armor resolution | `src/ai/npcCombat.ts` |
| attack execution | `NpcAgent` `combat` phase + `src/combat/*` |
| target damage/death consequence | target owner |
| corpse loot | `NpcAuthoritativeState.postDeath` / `commitNpcDeath()` |
| relationship/social read | existing Player↔NPC social lookup |
| detailed follow execution | `npcAccompanyExecution.ts` |
| travel/off-screen survival | existing `NpcTravelContinuity` / `npcOffscreenSurvival.ts` |
| expedition abandonment | final implementation of `npc-032` |

No new persistent combat/cooperation state is required.

## Recon: actual combat matrix

Do not assume symmetry.

| Direction | Current main | npc-033 |
|---|---|---|
| NPC → fauna | implemented | primary cooperative attack path |
| fauna → NPC | implemented | reuse unchanged |
| player → fauna | implemented | reuse unchanged |
| fauna → player | implemented | authoritative V1 protection signal source |
| NPC → hostile NPC | execution abstraction exists, but no generic hostile-NPC producer/target wiring | do not implement bandit AI here |
| player → NPC | ordinary player damage delivery is not wired | no companion workaround |
| NPC → player | no generic hostile-NPC producer/player combat-target builder is wired | no companion workaround |

Additional asymmetry: fauna outgoing attacks remain the older fauna-owned flat damage/callback path, while player/NPC attacks use shared melee/ranged/critical primitives. This plan does not unify them.

## Existing threat model to extend

`src/ai/npcAnimalThreat.ts` already has two useful bounded seams:

```text
senseImmediateAnimalThreat()
→ self danger

senseLocalThreatAssistance()
→ local danger to a human / committed livestock
```

Both consume caller-built `ThreateningAnimalCandidate[]`; they do not scan the world themselves.

Current flow is already bounded:

```text
gameLoop/app owner builds active animal threat candidates
→ SettlementsManager.update()
→ Settlement.update()
→ NpcAgent.update()
→ npcAnimalThreat perception/arbitration
```

`decideAnimalThreatResponse()` / `arbitrateAnimalThreat()` already own the ordinary `defend | flee` rule family from:

- melee/ranged capability;
- health ratio;
- neuroticism;
- guard responsibility.

### Architectural decision: “defend player”

Do **not** create a new top-level pressure/opportunity.

Implement it as an extension of the existing **bounded threat perception + target-selection context + ordinary defend/flee arbitration**:

```text
existing real hostile animal fact
+ threatened actor identity
+ accompanying NPC local eligibility
+ relationship/accompany willingness modifier
→ same self-preservation arbitration
→ CombatIntent or flee
```

Guard local assistance is the precedent. Companion cooperation adds another contextual reason why a normal NPC may assist; it does not become another AI subsystem.

## Threat semantics

### Authoritative hostility first

Protection requires a real hostile state already owned by the attacker domain.

V1 must not infer hostility from:

- proximity;
- player target lock;
- player attacking a neutral animal;
- an animal merely existing near the party.

For fauna, use the existing active human/NPC attack state exposed when the candidate list is built. Extend candidate/context data only enough to preserve **who is actually threatened**.

A minimal evolution may add threatened actor identity to the existing caller-built candidate/context, rather than create a new global threat type. Exact TypeScript shape should follow current call-sites after `npc-032` lands.

### Protected actors

V1 required:

1. self;
2. player targeted by a real hostile animal.

Optional in the same implementation only if the current bounded candidate flow can expose it without a party registry:

3. another loaded NPC with an active compatible accompany context that is the animal's actual `npcAttackTarget`.

Do not scan all expedition members to discover this.

### Target selection

For the already-bounded local candidate set, deterministic priority:

1. direct threat to self;
2. direct attacker of protected participant;
3. immediacy / distance;
4. alive/valid target;
5. stable id tie-break.

No party focus-fire target and no global threat score.

### Friendly fire / wrong hostility

Current NPC projectile execution is target-handle specific rather than a general projectile-vs-every-actor collision scan. V1 therefore does not need a party-friendly-fire subsystem.

The important guardrail is target provenance: only a candidate backed by an authoritative hostile relation can become the `CombatTargetHandle`. Never turn “near player” into hostile.

## Response / willingness semantics

Use ordinary self-preservation first.

Inputs should reuse existing facts:

- usable combat capability;
- health ratio;
- injury severity;
- stamina/vigor collapse state where already readable;
- neuroticism;
- bounded immediate threat count;
- accompany context;
- Player↔NPC social relationship.

Relationship/accompany may add a **modest defend/protect bias**. They may not override hard inability or severe survival risk.

Do not add:

- loyalty meter;
- morale meter;
- combat trust;
- escort-specific courage stat.

“Overwhelmed” must remain cheap: derive it only from the already-bounded active threat candidate set plus own condition. Do not predict combat outcomes.

## Weapon and ammunition semantics

### Ownership

Use current general contracts:

```text
player gives weapon/ammo
→ npcItemTransfer
→ NpcAuthoritativeState.personalInventory
→ ordinary NPC resolver
```

### Weapon selection

`src/ai/npcCombat.ts` already has profession-aware deterministic:

- `resolveNpcMeleeWeapon(inventory, role)`;
- `resolveNpcRangedWeapon(inventory, role)`.

Do not replace or duplicate this scoring.

### Ammo

`NpcAgent.resolveRangedAmmo()` already calls:

```text
resolveNpcAmmo([personalInventory, carried], ranged)
```

and returns the actual owning inventory. Personal ammo is checked first, transient work supply second. A shot removes from that owner.

Therefore gifted arrows already need no copy to `carried`.

### Combat mode selection gap

The remaining general gap is **mode suitability**, not weapon ranking.

Today threat response can prefer ranged whenever ranged capability exists. Add the smallest general NPC combat-mode resolver in/near `npcCombat.ts`, reused by ordinary animal self-defense and companion protection.

Inputs should be limited to:

- resolved melee weapon;
- resolved ranged weapon;
- real ammo availability;
- target distance;
- weapon effective ranges.

Expected V1:

- very close threat + usable melee → prefer melee;
- outside sensible melee distance + usable ranged+ammo → ranged;
- no ammo → ranged unavailable;
- only one viable mode → use it;
- deterministic tie/result.

No tactical loadout planner and no weapon switching state.

## Execution and chase

After decision:

```text
target + selected mode
→ CombatIntent
→ NpcAgent.beginCombat()
→ existing melee/ranged lifecycle
→ target.applyDamage()
```

Do not change shared hit/critical/projectile/defense/HealthState logic for companion reasons.

### Bounded cooperative pursuit

Current NPC combat can keep approaching a live target while the intent remains active. Cooperative combat therefore needs a transient reason/context sufficient to revalidate **why this fight still matters**.

Revalidate on the existing threat reaction cadence or meaningful combat/threat events, not a new per-frame scorer.

Cancel/disengage when:

- target is no longer a real threat to self/protected actor;
- protected actor is no longer threatened;
- target has left bounded expedition locality and no longer threatens anyone relevant;
- own injury/self-preservation now selects flee;
- target becomes invalid/dead (existing combat lifecycle already covers this).

Do not use one magic `distanceFromPlayer > X` cutoff. A short chase is allowed while the threat remains local and real.

Any cooperation/pursuit metadata is transient and must not enter `NpcAuthoritativeState` or save data.

## Flee, interruption and resume

Reuse existing `NpcAgent.fleeFromThreat()` and emergency run locomotion.

Combat/flee interrupts the current accompany **execution**, not the commitment:

```text
accompany
→ combat or flee
→ threat resolves / movement ends
→ choose()
→ normal continuation check
→ same commitment resumes
```

Tactical flee is not expedition abandonment.

After flee:

- if the final `npc-032` continuation contract says viable → resume the same accompany commitment;
- if it says abandon because the combat outcome made survival/continuation non-viable → use that single lifecycle and its generic return-home flow.

`npc-033` must not create a `CombatContinuationEvaluator` or call `endNpcAccompanyCommitment()` directly from the flee helper.

## Injury, player downed state and death

### NPC injury

Accepted NPC damage already flows:

```text
applyIncomingCombatDamage()
→ resolveIncomingNpcDamage()
→ takeDamage()
→ HealthState
→ registerPhysicalInjuryFromDamage()
→ vigor impact
→ optional death
```

Read the existing injury severity; do not duplicate thresholds.

No combat medicine. After disengage/flee, normal healing autonomy owns treatment.

### Player downed

The player uses `downed`, not NPC permanent death.

A downed player may remain a protected participant while a previously-authoritative local hostile threat is still active. Do not add revive/rescue mechanics here. Once the real threat ends, protection intent ends.

### NPC death and loot

NPC death remains:

```text
commitNpcDeath()
→ complete personalInventory transfer to postDeath.loot
→ ordinary corpse lifecycle
```

Player-given items are ordinary belongings and follow the same handoff.

Death clears/invalidates accompaniment through the existing NPC lifecycle. No companion death/respawn state.

### Target death

Existing `endCombat('complete')` owns target-death completion. Do not add revenge aggro. A different hostile target must be perceived as a new/current threat.

## Persistence and off-screen semantics

Persist **none** of:

- combat target;
- protect-player flag;
- threat context;
- current response;
- attack lifecycle;
- projectile;
- chase path/budget;
- party combat state.

Persist/reuse existing:

- health/injury;
- personalInventory;
- postDeath;
- accompany commitment;
- travel/off-screen survival state.

No off-screen cooperative battle simulation in V1.

When an accompanying NPC is streamed out, detailed combat ends with the runtime. Existing travel/survival continuity remains authoritative. After reification, live bounded threat perception may establish a new combat intent from current authoritative world state.

“Works outside camera” therefore means world/companion survival, inventory, injury/death and commitment continuity do not depend on rendering — not that unseen battles are simulated.

## Performance

Must reuse:

- caller-built bounded `ThreateningAnimalCandidate[]`;
- existing NPC update/threat reaction cadence;
- existing `CombatIntent` execution;
- existing pathfinding/movement;
- existing travel/off-screen checkpoints.

Must not add:

- companions × all enemies scans;
- global threat graph/registry;
- global party lookup every frame;
- extra combat ticker;
- continuous pathfinding to player during combat;
- off-screen encounter loop.

If threatened participant identity is needed, attach/resolve it where the existing producer already knows attacker state, once per bounded candidate, not per companion scan.

## Observability

Extend existing NPC trace/inspection only enough to explain:

- threat source id/type;
- threatened actor: self/player/NPC;
- response: protect/defend/flee/disengage;
- selected mode;
- health/injury context;
- relationship/accompany bias when applied;
- disengage reason;
- whether ordinary accompany later resumed or final continuation abandoned.

No companion combat debug UI.

## Integration points

### `src/ai/npcAnimalThreat.ts`

Primary decision/perception seam.

- preserve current self-defense;
- reuse/generalize `senseLocalThreatAssistance()`;
- extend bounded candidate/context with actual threatened actor when needed;
- keep `defend | flee` arbitration as the ordinary policy family.

### `src/ai/NpcAgent.ts`

Existing owners to reuse:

- threat reaction cadence;
- `reactToAnimalThreat()`;
- `beginCombat()` / `cancelCombat()` / `endCombat()`;
- `fleeFromThreat()`;
- combat phase;
- `applyIncomingCombatDamage()`;
- trace/inspection;
- accompany idle-duty resume.

Add only narrow orchestration/context required by cooperative perception and transient combat revalidation.

### `src/ai/npcCombat.ts`

Reuse profession-aware weapon/armor/ammo resolvers. Add only the missing general mode-suitability helper if current code still lacks one at implementation time.

### `src/combat/combatIntent.ts`

Reuse unchanged unless a tiny **transient, actor-neutral** cancellation/revalidation hook proves strictly necessary. Prefer keeping cooperation context outside the generic intent type.

### `src/fauna/faunaCombat.ts` + fauna/app candidate producer

Reuse `combatTargetForAnimal()` and fauna-owned real aggression facts. Do not duplicate hostility.

### `src/app/gameLoop.ts` / settlement update forwarding

Extend the existing bounded threat candidate construction/forwarding only as needed to retain threatened participant identity. No new scan.

### `src/ai/npcAccompanyCommitment.ts` / `npcAccompanyExecution.ts`

Read commitment as context. Do not store combat state there.

### final `npc-032` implementation

Consume its single continuation/abandonment/return-home seam after combat/flee outcomes. Adapt exact call-site/type to the code that lands; this dependency is not implemented yet.

### inventory/death

- `src/app/actions/npcItemTransfer.ts`;
- `src/settlement/npcPostDeath.ts`;
- `NpcAuthoritativeState.personalInventory`.

Reuse unchanged.

## Scope

- real fauna threat → protection of player by an accompanying NPC;
- self-defense and protection using one ordinary policy family;
- relationship/accompany context as bounded willingness modifier;
- normal profession-aware weapon selection;
- general close-vs-ranged mode selection;
- real ammo ownership/consumption;
- bounded pursuit and disengagement;
- normal flee;
- combat interruption/resume of accompany;
- final npc-032 abandonment integration;
- ordinary injury/death/corpse semantics;
- bounded diagnostics;
- optional NPC→NPC protection only where real attacker-target identity is already available without a party manager.

## Non-goals

- player → NPC combat wiring;
- generic NPC → NPC hostility/bandit AI;
- NPC → player hostile AI;
- crime/faction/morality;
- tactical commands/formations/focus fire;
- companion-specific equipment UI/state;
- shields/armor redesign;
- revive/resurrection;
- combat medicine;
- relationship consequences/reputation from shared combat (npc-035);
- general fauna outgoing combat rewrite;
- off-screen battles/encounters;
- LLM combat decisions.

## Implementation order

1. Verify `npc-032` is implemented on current `main`; read its final continuation/return contract. If not, stop — hard blocker.
2. Reconfirm the seven-direction combat matrix and current threat-candidate producer.
3. Preserve regression tests for ordinary non-accompanying animal self-defense.
4. Extend bounded fauna candidate/context so it can identify the actual threatened participant without new scans.
5. Reuse/generalize `senseLocalThreatAssistance()` for accompany-based local protection.
6. Add modest relationship/accompany willingness input to the ordinary defend/flee arbitration; preserve hard self-preservation gates.
7. Add/reuse a general distance/ammo-aware combat-mode resolver in `npcCombat.ts`.
8. Wire fauna→player threat → accompanying NPC → existing `CombatIntent` → `beginCombat()`.
9. Add transient bounded cooperative-combat revalidation/disengage; reuse current cadence.
10. Add NPC→NPC participant protection only if the existing bounded facts support it without a party registry.
11. Route post-flee/severe-combat continuation through final `npc-032` only.
12. Extend trace/inspection and run focused automated checks.
13. Update current-state docs only for behavior actually implemented.

Important new public/shared helpers should receive concise JSDoc and `@domain npc` where useful for preflight discovery.

## Automated verification

Focused tests must cover:

- ordinary non-accompanying NPC self-defense remains unchanged;
- neutral nearby fauna never becomes hostile by proximity;
- real animal→player threat can be perceived by a nearby accompanying NPC;
- healthy/capable NPC may protect through existing `beginCombat()`;
- unarmed NPC flees/does not manufacture combat;
- bow without compatible ammo is not ranged-capable;
- gifted weapon/ammo in `personalInventory` is used through ordinary resolver and ammo is removed from the actual owner;
- close threat with melee+bow prefers sensible close mode; distant threat with ammo can use ranged;
- relationship/accompany bias cannot override hard inability or severe self-preservation;
- target threat ending causes bounded disengagement rather than indefinite pursuit;
- combat/flee does not delete `accompanyCommitment`;
- temporary flee → ordinary re-arbitration → same commitment resumes;
- severe combat outcome can feed final `npc-032` abandonment/return flow;
- accepted NPC hit updates ordinary `physicalInjury`;
- NPC death uses existing `commitNpcDeath()` and player-given belongings reach ordinary corpse loot;
- player downed does not invent revive/companion-death semantics;
- no new persistent combat fields are added;
- no per-NPC global fauna/NPC scan or new update loop is introduced.

AI does not perform browser verification.

## Completion criteria

An ordinary accompanying NPC can respond to a **real local hostile threat** to the player using:

```text
existing bounded threat facts
→ ordinary self-preservation + contextual willingness
→ ordinary NPC weapon/ammo resolution
→ existing CombatIntent / NpcAgent combat
→ ordinary injury/death
→ bounded disengage
→ normal accompany resume
   OR final npc-032 abandonment
```

No companion-specific combat AI, damage, inventory, equipment, party target, loyalty meter, global threat graph or off-screen battle system exists.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
