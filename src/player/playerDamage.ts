import type { ToolKind } from '../items/HeldTool'
import { ITEM_CATALOG } from '../items/itemCatalog'
import {
  defenseBlockRoll,
  isAttackFromDefensibleDirection,
  resolveDefense,
  type DefenseOutcome,
} from '../combat/defenseResolver'
import type { PlayerController } from './PlayerController'
import { awardSkillXp, SKILL_XP_AWARD } from './PlayerSkills'
import type { PlayerNeeds } from './PlayerNeeds'
import { isStarving } from '../shared/HungerState'
import { isDehydrated } from '../shared/ThirstState'

export const DOWNED_DURATION_SEC = 5

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

const STARVATION_HP_PER_SEC = 0.5
const DEHYDRATION_HP_PER_SEC = 0.5

/** Hunger/thirst depletion damage routed through the player downed lifecycle. */
export function tickPlayerStarvationDamage(
  player: PlayerController,
  needs: PlayerNeeds,
  dt: number,
  heldTool: ToolKind | null,
  playerYaw: number,
): void {
  let perSec = 0
  if (isStarving(needs.hunger)) perSec += STARVATION_HP_PER_SEC
  if (isDehydrated(needs.thirst)) perSec += DEHYDRATION_HP_PER_SEC
  if (perSec <= 0 || dt <= 0) return
  applyPlayerDamage({
    player,
    amount: perSec * dt,
    heldTool,
    defenseSkillValue: player.skills.defense.value,
    playerYaw,
  })
}
