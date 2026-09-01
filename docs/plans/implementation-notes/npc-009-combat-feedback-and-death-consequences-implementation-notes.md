# NPC-009 — Implementation Notes

## Current-code findings

- **NPC presentation is currently only Idle/Walk/Interact.** `src/ai/NpcAgent.ts` creates one `AnimationMixer` over the loaded GLB root and maps `Idle`/`Idle_Neutral`, `Walk`/`Run`, `Interact`/`Wave`. `syncAnimation()`/`crossfade()` own the normal presentation loop. There is no combat/death animation mapping yet.
- **Animal presentation is currently only Idle/Walk/Gallop.** `src/fauna/AnimalAgent.ts` uses one mixer and maps `Idle`/`Idle_2`, `Walk`, `Gallop`; `updateAnim()` owns the normal loop.
- Therefore the plan's assumption that attack/hit/death clips are already integrated is **not true in the current code**. First inspect the actual clips returned by `loadGltfAnimated()` for the active NPC/fauna GLBs. Do not assume clip names or add combat-specific hard-coded names without a semantic mapping seam.
- `docs/assets/MODELS.md` lists the NPC/fauna model families as wired, but does not document combat clips. `docs/assets/SOUNDS.md` has player melee hit/kill audio wired, but no dedicated NPC/animal combat SFX backlog entries yet.
- NPC death is currently `NpcAgent.die()`: clears combat/action state, stops the mixer, rotates the mesh by 90°, hides HP/label bars and records `combat.died`. Animal death is `AnimalAgent.collapse()`: calls the existing `onDeath`, stops the mixer, rotates the corpse, adjusts Y, hides bars and starts the existing blood-splat FX. These are current death presentation paths and must not be duplicated by a second death system.
- NPC authoritative HP/dead state is shared through `NpcAuthoritativeState`/`HealthState`. `NpcAgent` immediately calls `die()` when `damageHealth()` crosses zero and also calls `die()` when a reconstructed agent is already dead. Do not move death ownership into combat feedback.
- `HealthState.damageHealth()` is deliberately combat-agnostic: it only mutates HP/dead. Keep it that way.
- NPC combat damage flows through `NpcAgent.applyIncomingCombatDamage()` → `resolveIncomingNpcDamage()` → `takeDamage()` → `damageHealth()` → `die()`. NPC outgoing melee/ranged hits resolve at the shared lifecycle's `hitReady`/`fireReady` edge in `NpcAgent`, not from render animation state.
- `AnimalAgent.takeDamage()` is the animal damage/death seam. It calls `damageHealth()` and `collapse()` on the same call when HP reaches zero. `source: 'npc' | 'player'` already exists and is useful if combat-only feedback needs to distinguish combat damage from other future damage sources.
- `CombatTargetHandle` intentionally exposes only `isAlive()`, position and `applyDamage()`. Keep this narrow; do not turn it into a general combat presentation object.
- `src/combat/meleeAttack.ts` already has `reset()` specifically for interruption/death/rebuild safety. `NpcAgent.die()` already resets both melee/ranged lifecycles. Reuse these existing cancellation paths rather than making animation state authoritative.
- World audio is already centralized in `src/audio/createWorldAudio.ts`. Use `WorldAudio.playAt`/the injected `PlayAt` callback for world combat SFX; do not create another audio context/bus. `playAt` already provides distance attenuation.
- `src/audio/actionSounds.ts` contains `playActionMeleeHit` and `playActionMeleeKill`, but those are currently player-oriented helpers. Do not blindly reuse `playActionMeleeKill` as universal NPC/animal death audio; add semantic combat feedback helpers/mappings if the existing assets are appropriate, otherwise record the asset gap.
- Animal death already has a token-guarded asynchronous blood-splat path. Any new death animation/FX must preserve the same stale-load/dispose safety pattern.
- `AnimalAgent` has a substantial existing corpse presentation/lifecycle (`timeSinceDeath`, rot/bones phases, harvested remains, corpse hold, blood splat). npc-009 must not alter those lifecycle rules or add another corpse state.

## Recommended integration

### Animation

Extend the existing per-agent animation presentation, rather than introducing a combat animation FSM.

Use a small semantic layer such as:
- `idle`
- `walk`
- `interact`
- `attack`
- `hurt`
- `death`

with per-model clip lookup/fallback. The normal `syncAnimation()`/`updateAnim()` remains the owner of locomotion; combat/death presentation temporarily overrides it.

Important ordering:
1. simulation starts/resolves the attack,
2. presentation receives the semantic event,
3. attack animation/audio is started,
4. actual damage remains resolved by the existing combat lifecycle,
5. `hurt` is triggered only after real damage is applied,
6. `death` is triggered only after `HealthState.dead` becomes true.

Do **not** make animation timing decide when damage happens. The current `hitReady`/`fireReady` edges remain authoritative.

For attacks, trigger presentation when the existing attack lifecycle actually starts, not every combat tick. For NPC melee this is the `combatAttack.start()` transition; ranged should use the existing draw/release lifecycle edges. If a semantic animation clip is absent, keep the existing Idle/Walk behaviour and continue combat normally.

### Death / interruption

Death must pre-empt attack/hurt immediately.

For NPCs, the existing `die()` is the correct owner. It should stop/reset combat lifecycles and then start the death presentation instead of simply stopping the mixer. Do not let `syncAnimation()` subsequently crossfade back to Idle/Walk while dead.

For animals, `collapse()` is the existing owner and must continue to invoke `onDeath`, blood splat and corpse state setup. Replace only the presentation part needed for death animation; do not move corpse lifecycle logic into npc-009.

A one-shot death action should either hold its final pose or otherwise prevent normal locomotion actions from taking over. Avoid relying on `AnimationMixer` events as simulation events.

Multiple hit events after `dead` are already rejected by `takeDamage()`/`HealthState`; presentation should also have a one-shot death guard so one death cannot retrigger audio/animation.

### Hurt feedback

A useful seam is immediately after **actual damage** has been resolved, inside the target owner's damage path. Avoid firing hurt feedback from `resolveDefense()` or from attack intent, because blocked/missed attacks must not produce a hit/hurt presentation.

If the implementation needs to distinguish combat from other damage, preserve/use the existing animal `source` parameter and add equivalent explicit information only where justified. Do not introduce a generic event bus just for npc-009.

### Audio

Use semantic helpers in `src/audio/` and the existing `PlayAt` mechanism. Suggested categories:
- attack
- impact/hit
- hurt
- death

Prefer one centralized mapping/helper over scattered URLs in `NpcAgent` and `AnimalAgent`.

The current SFX inventory has player melee hit/kill and bow draw/release. Verify whether those assets are semantically safe for NPCs/animals before reusing them. Human-specific vocal/fall content must not become an animal death sound.

If no suitable asset exists, use a no-op/fallback and document the gap in `docs/assets/SOUNDS.md` only if the implementation actually leaves a persistent asset requirement. Do not expand this plan into asset production.

## Streaming / reconstruction

NPC and fauna are presentation objects reconstructed by the existing world/settlement lifecycle. Simulation truth must remain independent of the mixer.

For an agent reconstructed from an already-dead authoritative state:
- do not resurrect it,
- do not enter normal locomotion animation,
- present the dead state immediately/consistently.

For an agent unloaded during an in-flight combat animation, there is no requirement to preserve the animation frame. On reload, derive presentation from current simulation state (`alive`/`dead`), not from stale animation state.

The existing `NpcAgent` constructor already calls `die()` when hydrated state is dead; preserve this behaviour.

## Important architectural boundary

Keep this ownership:
- `HealthState` — HP/dead truth.
- combat lifecycle/resolvers — attack timing, hit resolution and damage calculation.
- `NpcAgent` / `AnimalAgent` — entity-specific damage/death lifecycle and presentation integration.
- npc-009 — semantic combat/death presentation only.
- npc-010 — NPC corpse/death lifecycle and loot.
- npc-011 — social death response, burial and graves.

Do not add corpse creation/removal, inventory transfer, household death awareness or burial hooks here.

## Plan/repo discrepancies to keep in mind

- The plan metadata currently says `Depends on: 177`, while `docs/plans/README.md` lists npc-009 as depending on `177`, `179` and `007`. This is a planning inconsistency worth resolving before implementation; the current code already contains the relevant animal-defense and navigation/approach work.
- The plan title says **“combat feedback and death consequences”**, but its actual scope deliberately excludes death/corpse consequences and delegates them to npc-010/011. Implementation should follow the explicit scope, not the broader title.
- The plan asks for “existing” combat/death clips, but current agent code has no semantic combat/death clip mapping. Treat asset/clip availability as a recon result, not as a guaranteed dependency.

## Useful verification focus

The highest-risk regressions are not damage calculations; they are presentation/state races:
- attack starts → death before the attack finishes,
- hurt arrives during another attack,
- multiple hits on the same target,
- death followed by `syncAnimation()` in the same/next update,
- dead NPC reconstruction,
- animal death followed by corpse decay/harvest,
- streaming/unload during combat,
- missing clips/assets.

Automated tests should favour pure semantic mapping/state-transition helpers where possible. Browser verification should confirm actual GLB clips and audible/visible feedback for NPC↔NPC, NPC↔animal and animal↔NPC encounters.

**Zrób git commit i push do main, rebase jeżeli trzeba**