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

## §What was actually built (2026-09-02)

Recon confirmed every `NPC_MODEL_URLS` GLB exports `Sword_Slash`/`Gun_Shoot`/`HitRecieve`(`_2`)/`Death`; wolf/fox export `Attack`/`Idle_HitReact1`/`Death`, deer/stag/horse/donkey export `Attack_Headbutt`/`Idle_HitReact1|_Left`/`Death`, cow only `Death`, sheep/chicken/bear have no combat clips at all (capsule/manual fallback). All mappings below use `findAction`'s existing name-list + `Armature|`-prefix fallback — no hard-coded names reached combat logic.

**Animation** — both `NpcAgent` and `AnimalAgent` gained a small one-shot helper (`playCombatOneShot`/`playOneShotAnim`: `LoopOnce` + `clampWhenFinished`, fades out every other known action) reusing the existing per-agent `AnimationMixer`/`findAction`/crossfade machinery — no second animation state machine.
- NPC: `tickMeleeCombat`'s `combatAttack.start()` and `tickRangedCombat`'s `combatRangedAttack.start()` trigger the melee/ranged attack one-shot; `takeDamage()` triggers `hurtAction` (only when not dying); `die()` triggers `deathAction`. `syncAnimation()` now skips its normal idle/walk/interact crossfade while `hurtAnimTimer > 0` or `phase === 'combat' && !isCombatCycleIdle()` — hurt checked first, so a hit landing mid-swing still reads as a flinch.
- Animal: `attack()`/`attackHuman()`/`attackNpc()` (all three bite call sites — including biting the player, since it's the animal's own presentation and touches no player code) trigger `attackAction`; `takeDamage()` triggers `hurtAction` when the animal survives; `collapse()` plays `deathAction` when present, otherwise keeps the pre-existing manual tip-over fallback unchanged (sheep/chicken/bear/capsule). `updateAnim()` skips while `hurtAnimTimer`/`attackAnimTimer > 0`.
- Death-clip mixer cost is bounded, not perpetual: `NpcAgent.update()`/`AnimalAgent.update()`'s `dead` branch only calls `mixer.update(dt)` until the clip's own duration elapses (`deathAnimSettleAtSimClock` / `deathAnimDurationSec`, `null` when there's no clip to play), so a permanently-dead agent costs nothing per frame afterward.
- Reconstruction-from-already-dead (`NpcAgent`'s constructor hydration path) does **not** replay the collapse: `die(alreadySettled = true)` stops every other action immediately (no fade) and jumps `deathAction` straight to its clamped final frame via `action.time = duration; mixer.update(0)` before any render happens. Fauna has no equivalent case — animal HP/death isn't persisted, so a loaded animal is never already dead (confirmed against `docs/STATE.md`).

**Audio** — new semantic helpers in `src/audio/actionSounds.ts`: `playCombatBowDraw`/`playCombatHit`/`playNpcCombatDeath`/`playAnimalCombatDeath`, all reusing existing wired clips (no new assets). `playNpcCombatDeath` reuses the human moan+fall kill clip (safe — NPCs are human); `playAnimalCombatDeath` deliberately reuses the vocal-free impact clip instead (asset gap, documented as `docs/assets/SOUNDS.md` S26 alongside the missing melee-swing sound).
- NPC-attacker sound is played from `NpcAgent` itself (already owns `playAt`), at the exact point each combat tick resolves synchronously: ranged draw start / release (reusing `playActionBowRelease`), and melee/ranged hit resolution (`playCombatImpactSound`, branching on `CombatTargetHandle.ref.kind` so an animal target never gets the human death clip).
- Animal→NPC sound (`AnimalAgent.attackNpc()`'s `onNpcHit` callback) is played from `gameLoop.ts`'s existing callback wiring instead of threading a new callback through `AnimalAgent`/`createFauna.ts`/`livestock.ts` — `worldAudio.playAt` and the target `NpcAgent` (for `.health.dead`) are already in scope there, mirroring the pre-existing `killed ? playActionMeleeKill : playActionMeleeHit` idiom used for player→animal a few lines above.
- Deliberately **not** wired: animal→player attack sound (`attackHuman()`'s `onHumanHit` → `applyPlayerDamage`) and animal↔animal predation sound (`attack()`) — both outside the plan's explicit NPC↔animal / animal↔NPC / NPC↔NPC scope, and the latter has no existing `playAt` seam without the callback-threading this note's previous paragraph avoided. Both still get the attack/hurt/death **animation** (self-contained, no plumbing needed).

**Debug** — extended the existing `NpcAgent.combatDebugSnapshot()` and `AnimalAgent.getDebugInfo()` (no new debug UI) with a `presentation` field: which one-shot is currently active (`'attack' | 'hurt' | null`), `dead` (NPC only — animal death is already in `dead`), and which semantic clips actually resolved per agent (`false` marks an expected missing-clip fallback, not a bug).

**Technically verified**: `tsc --noEmit`, `vue-tsc --noEmit` (build), `eslint --fix`, full `vitest run` (238 files / 2423 tests, all green, no new failures). Browser/gameplay verification (actual GLB playback, audible sound, NPC↔animal/NPC↔NPC/animal↔NPC encounters, dead-NPC reload) not performed by the implementer — see the Verification section above.

**Zrób git commit i push do main, rebase jeżeli trzeba**