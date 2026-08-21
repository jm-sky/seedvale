# Seedvale — Combat

**Purpose:** current-state reference for how melee/ranged combat works — the state-machine/system layer, shared between player, NPCs and fauna.

**Not:** the per-item stat tables (damage/range/timings — that's [items/WEAPONS.md](../items/WEAPONS.md) and [items/CATALOG.md](../items/CATALOG.md)), NPC life/economy outside of combat (that's [SETTLEMENTS.md](../SETTLEMENTS.md)), or a plan. Combat spans the `items-player`, `settlements-npcs` and `fauna` plan domains at once, which is why it lives here rather than folded into one of them.

**Last verified:** 2026-08-21

When this file and the code disagree, the code wins — update this file.

---

## Shared architecture

Melee and ranged combat are each a single neutral state machine reused by every attacker:

- `src/combat/meleeAttack.ts` — windUp → hitWindow → recovery timer (hit resolves once, at the start of the hit window).
- `src/combat/rangedLifecycle.ts` — draw → release → recovery timer with a single `fireReady` edge.
- `player/playerMelee.ts` / `player/playerRanged.ts` wrap these for the player (add input, camera-facing, stamina gating); `NpcAgent`'s `combat` `Phase` (below) wraps them for NPCs. There is no second, parallel melee/ranged implementation for NPCs.
- `src/combat/combatIntent.ts`'s `CombatTargetHandle` (`getPosition`/`isAlive`/`applyDamage`) is the small data-only seam an attack resolves against — `fauna/faunaCombat.ts`'s `combatTargetForAnimal()` builds one for an `AnimalAgent`; the player and NPCs use the same shape.
- Damage entry points are unified: `HealthState` (`src/shared/HealthState.ts`) is shared by fauna, NPCs and the player; `NpcAgent.applyIncomingCombatDamage()` is the single path for animal→NPC, NPC→NPC and player→NPC damage.

## Melee

`ITEM_CATALOG[kind].melee` (`MeleeConfig`) is the single source of truth for damage/range/arcDot/windUp/hitWindow/recovery/staminaCost per weapon — see [WEAPONS.md](../items/WEAPONS.md) for the numbers. `player/playerMelee.ts` runs the windUp→hitWindow→recovery machine plus a deterministic range+facing-arc hit test (no raycasting) against active `AnimalAgent`s, independent of the gaze-pick target. Target acquisition (`pickCombatTarget()`, reached through `buildCombatTarget()` in `app/interactables.ts`) is a fallback after gaze-pick/dig-target; on touch it uses a wider acquisition cone and the started attack commits to the yaw pointing at the acquired target, so a swing at a target outside the weapon's own `arcDot` can still connect.

Weapon condition (durability/sharpness) is a separate, orthogonal system — `items/weaponMaintenance.ts` — documented in [CATALOG.md](../items/CATALOG.md); sharpness reduces melee damage before the critical roll, wear applies once per resolved hit.

## Ranged

`ITEM_CATALOG[kind].ranged` (`RangedConfig`) is the ranged counterpart of `MeleeConfig`, on the three bows. `player/playerRanged.ts` is the draw→release→recovery machine; on `fireReady` a lightweight `combat/projectile.ts` `Projectile` is spawned (no `Object3D`, no visual arrow mesh) consuming one compatible ammo unit. `combat/rangedAttack.ts`'s `resolveRangedDirection()` turns bow accuracy + the `archery` skill into an aim-deviation cone (not a separate hit-roll); the projectile is ticked every frame via swept segment-to-point collision (`sweptProjectileHit`, no per-arrow `Raycaster`).

Aim commitment (plan 186): `player/playerCombat.ts`'s `resolveRangedAimYaw()` is the single source for a player draw's committed direction (soft-locked target → live `yawToward()` recomputed every frame; otherwise live mouse-look yaw), read by both the player's visual facing and the fired shot, so they can never diverge. A minimal reticle shows only while drawing.

A shot that reaches `maxDistance` without a hit becomes an ordinary dropped-item pickup of its ammo kind (`bundle.droppedItems.drop`) rather than disappearing; a hit still consumes the arrow permanently. There is no arrow-recovery-from-corpse mechanic and no 3D projectile visual — both are deliberately out of scope.

`archery` is a `PlayerSkills` id, awarded once per confirmed projectile hit (never per shot). NPCs have no skill equivalent — ranged accuracy uses the bow's own base value.

## Critical hits & defense

`combat/criticalHit.ts`'s `resolveCriticalHit()` is a small shared deterministic modifier, evaluated after hit resolution and before defense, used by both ranged (`RangedConfig.criticalChance`/`criticalMultiplier`) and melee (a flat baseline chance/multiplier — melee weapons don't carry their own critical config). `combat/defenseResolver.ts` (plan 150) resolves block chance/partial damage reduction; see [WEAPONS.md](../items/WEAPONS.md) for per-weapon block numbers.

## NPC combat (plan 177)

`NpcAgent` gained a `combat` `Phase`, driven from its own `update()` cadence — there is no second `NpcCombatManager`/loop. `beginCombat(intent: CombatIntent)`/`cancelCombat()` starts/stops it; `NpcAgent` never picks its own target, reason to fight, or weapon mode — `CombatIntent { target, mode: 'melee' | 'ranged' }` is always supplied by an external decision system (below). `src/ai/npcCombat.ts` resolves the attacking/defending item and ammo straight from `NpcAgent.carried` — there is no separate NPC equipment system. Each `NpcAgent` owns at most one in-flight `Projectile` on itself for ranged attacks (mirrors `combatAttack` already being a per-agent field), so it needs no camera/player/gameLoop involvement and no shared world projectile registry.

NPC role-based carried weapons (plan 185): `src/ai/npcLoadout.ts`'s `defaultWeaponForRole()` seeds `carried` once at `NpcAgent` construction — `woodcutter → axe`, `guard → long_sword`, `farmer → knife`; `trader`/`miner`/`fisher` stay unarmed (no existing item justifies a default for them). Before this plan, nothing ever put a weapon into `carried`, so the combat resolution above was reachable but never actually armed.

## Animal attack & NPC defense (plan 179)

`AnimalAgent` gained runtime-only `frenzied`/`strategicVillage` state (`setFrenzied()`, debug-only trigger — no new species/FSM/save field). Frenzy feeds the existing predator-human decision as `provoked: provokedTimer > 0 || frenzied`, reusing the same retaliation branch a player-provoked wolf already uses; a frenzied predator can also target a nearby NPC through the same scoring function.

On the NPC side, `src/ai/npcAnimalThreat.ts` (`senseImmediateAnimalThreat()`/`decideAnimalThreatResponse()`) is a small threat→`defend`/`flee` decision from carried-weapon capability + health, wired ahead of `NpcAgent.update()`'s phase switch so an NPC reacts *before* taking damage. `defend` calls `beginCombat()` with `fauna/faunaCombat.ts`'s `combatTargetForAnimal()`; `flee` reuses the existing wander/movement pipeline. This animal-defense path is the first live caller of `beginCombat()` — Hunter/bandit AI remain future callers with no decision framework yet.

## Combat interruption (plan 186)

Taking damage (combat or starvation/dehydration) interrupts an active `rest`/`wait`/`busy` channel — `app/actions/restActions.ts`'s `interruptRestForDamage()` bypasses the Esc-only cancel gate (being hurt should wake the player at any point, not just near the end of a skip), called from the single player-damage entry point alongside the existing `abortBusy()`. Any partial progress (e.g. a player well's `workProgress`) is credited exactly as an Esc-cancel would credit it.

## Not implemented / deliberately out of scope

- Full combat system for the player: player-vs-NPC melee damage is not wired (a player can soft-lock/Tab-cycle an NPC as a target, but the melee hit resolution only ever applies damage to `animal` candidates).
- `ArcherAI`/any attack-decision framework for Hunter or bandit NPCs — ranged/melee execution exists, nothing decides to trigger it outside animal-defense.
- Weapon repair/broken lifecycle, general tool durability (`shovel`/`pickaxe`), bow durability/sharpness, arrow recovery from a corpse/ground, 3D projectile visuals.

## Entry points

```text
src/combat/meleeAttack.ts
src/combat/rangedLifecycle.ts
src/combat/combatIntent.ts
src/combat/criticalHit.ts
src/combat/projectile.ts
src/combat/rangedAttack.ts
src/combat/defenseResolver.ts
src/player/playerMelee.ts
src/player/playerRanged.ts
src/player/playerCombat.ts
src/ai/npcCombat.ts
src/ai/npcAnimalThreat.ts
src/ai/npcLoadout.ts
src/fauna/faunaCombat.ts
src/fauna/predatorHumanDecision.ts
src/shared/HealthState.ts
src/items/weaponMaintenance.ts
```
