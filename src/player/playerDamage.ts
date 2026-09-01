import type { ToolKind } from '../items/HeldTool'
import {
  defenseBlockRoll,
  type DefenseOutcome,
  isAttackFromDefensibleDirection,
  resolveDefense,
} from '../combat/defenseResolver'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { healHealth, type HealthState } from '../shared/HealthState'
import { recordBloodHit } from '../world/bloodTraces'
import { PLAYER_HEIGHT, type PlayerController } from './PlayerController'
import {
  DEHYDRATION_HP_PER_SEC,
  hungerSevereDurationSec,
  type PlayerNeeds,
  STARVATION_HP_PER_SEC,
  thirstSevereDurationSec,
} from './PlayerNeeds'
import { awardSkillXp, SKILL_XP_AWARD } from './PlayerSkills'

export const DOWNED_DURATION_SEC = 5
export const DOWNED_RECOVERY_HP_MIN = 1
export const DOWNED_RECOVERY_HP_MAX = 5

export function rollDownedRecoveryHp(): number {
  const span = DOWNED_RECOVERY_HP_MAX - DOWNED_RECOVERY_HP_MIN + 1
  return DOWNED_RECOVERY_HP_MIN + Math.floor(Math.random() * span)
}

/** Restores a small HP buffer when a downed player stands back up (plan 150). */
export function applyDownedRecovery(health: HealthState): number {
  const amount = rollDownedRecoveryHp()
  healHealth(health, amount)
  return amount
}

export type PlayerDamageResult = {
  finalDamage: number
  defenseOutcome: DefenseOutcome
  enteredDowned: boolean
}

export type ApplyPlayerDamageParams = {
  player: PlayerController
  amount: number
  /** Attacker position for directional defense; omit for environmental damage. */
  attackerX?: number
  attackerZ?: number
  attackerKey?: string
  heldTool: ToolKind | null
  defenseSkillValue: number
  playerYaw: number
  onCombatHit?: () => void
}

/** Single entry for player HP loss (plan 150 §8) — defense runs first, then
 *  HP is reduced; at 0 the player enters `downed` instead of `dead`. */
export function applyPlayerDamage(params: ApplyPlayerDamageParams): PlayerDamageResult {
  const {
    player,
    amount,
    attackerX,
    attackerZ,
    attackerKey = 'env',
    heldTool,
    defenseSkillValue,
    playerYaw,
    onCombatHit,
  } = params

  if (player.isDowned() || player.health.dead || amount <= 0) {
    return { finalDamage: 0, defenseOutcome: 'none', enteredDowned: false }
  }

  const defenseConfig = heldTool ? ITEM_CATALOG[heldTool].defense ?? null : null
  const inArc = attackerX != null && attackerZ != null
    ? isAttackFromDefensibleDirection(
        player.mesh.position.x,
        player.mesh.position.z,
        playerYaw,
        attackerX,
        attackerZ,
      )
    : false

  const attempt = player.nextDefenseAttempt()
  const resolved = resolveDefense(
    amount,
    defenseConfig,
    defenseSkillValue,
    'player',
    attackerKey,
    attempt,
    inArc,
  )

  if (resolved.attempted && resolved.outcome !== 'none') {
    awardSkillXp(player.skills, 'defense', SKILL_XP_AWARD.defenseBlock)
  }

  const finalDamage = resolved.finalDamage
  if (finalDamage > 0) {
    player.health.currentHp = Math.max(0, player.health.currentHp - finalDamage)
    onCombatHit?.()
    recordBloodHit(player.mesh.position.x, player.mesh.position.z, PLAYER_HEIGHT, finalDamage)
  }

  let enteredDowned = false
  if (player.health.currentHp <= 0 && !player.isDowned()) {
    player.enterDowned(DOWNED_DURATION_SEC)
    enteredDowned = true
  }

  return {
    finalDamage,
    defenseOutcome: resolved.outcome,
    enteredDowned,
  }
}

/** Test helper — exposes the roll used by `resolveDefense` for assertions. */
export { defenseBlockRoll }

/** Sustained hunger/thirst depletion damage (plan 165 — gated on how long
 *  each pool has stayed continuously critical, not on hitting the pool
 *  straight away), routed through the player downed lifecycle. */
export function tickPlayerStarvationDamage(
  player: PlayerController,
  needs: PlayerNeeds,
  dt: number,
  heldTool: ToolKind | null,
  playerYaw: number,
  dayLengthSec: number,
  onCombatHit?: () => void,
): void {
  let perSec = 0
  if (needs.starvationDuration >= hungerSevereDurationSec(dayLengthSec)) perSec += STARVATION_HP_PER_SEC
  if (needs.dehydrationDuration >= thirstSevereDurationSec(dayLengthSec)) perSec += DEHYDRATION_HP_PER_SEC
  if (perSec <= 0 || dt <= 0) return
  applyPlayerDamage({
    player,
    amount: perSec * dt,
    heldTool,
    defenseSkillValue: player.skills.defense.value,
    playerYaw,
    onCombatHit,
  })
}
