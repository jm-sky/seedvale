import { ANIMAL_LABELS, type AnimalAgent } from '../../fauna/AnimalAgent'
import { applyPlayerDamage } from '../../player/playerDamage'
import { tickRidingStamina } from '../../player/PlayerNeeds'
import { accumulateRidingUse } from '../../player/PlayerSkills'
import { fallDamage, rollFall } from '../../player/ridingStability'
import { getStaminaRatio } from '../../shared/StaminaState'
import { sampleSlope, SLOPE_MAX_WALKABLE_DEG } from '../../terrain/slopeConstraint'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/** How far (world units) beside the mount the player lands on dismount/fall
 *  — clear of the animal's own collision footprint without being a jarring
 *  teleport. */
const DISMOUNT_OFFSET = 1.3
/** Stability isn't rolled every frame — a coarse, predictable cadence keeps a
 *  single bad tick from being the whole story (plan fauna-003 §11). */
const STABILITY_CHECK_INTERVAL_SEC = 1

export type DismountReason = 'player' | 'death' | 'unavailable' | 'fall' | 'downed'

export type MountActions = {
  isMounted: () => boolean
  mountedAnimalId: () => string | null
  /** Validates and attempts to mount `animal` — no-ops (returns `false`)
   *  while already mounted, blocked by another activity, downed, or if the
   *  target isn't `mountable`/alive. */
  tryMount: (animal: AnimalAgent) => boolean
  /** Safe to call while not mounted (no-op). */
  dismount: (reason?: DismountReason) => void
  /** Per-frame drive: reads input, moves the mount, syncs the player's seat
   *  transform/stamina, and rolls riding stability. No-op while not mounted
   *  (beyond resolving a pending save restore). Must run before
   *  `player.update()` each frame. */
  update: (dt: number) => void
  /** Defers reattaching to a persisted `mountedAnimalId` until `resolveAnimal`
   *  can find it (livestock loads asynchronously) — retried every `update()`
   *  tick while pending. */
  restoreMountedAnimalId: (animalId: string | null) => void
}

export function createMountActions(
  ctx: PlayerActionContext,
  /** Looks up a live `AnimalAgent` by its stable `animalId` across every
   *  currently loaded settlement's livestock plus wild fauna — the mount
   *  system never scans the world itself beyond this one indirection. */
  resolveAnimal: (animalId: string) => AnimalAgent | null,
): MountActions {
  const { player, toast, bundle, keyboard, mouseLook } = ctx

  let mount: AnimalAgent | null = null
  let pendingRestoreId: string | null = null
  let stabilityTimer = 0
  let ridingUseDistance = 0
  let lastMountX = 0
  let lastMountZ = 0

  function enter(animal: AnimalAgent): void {
    mount = animal
    animal.setMounted(true)
    stabilityTimer = 0
    ridingUseDistance = 0
    lastMountX = animal.mesh.position.x
    lastMountZ = animal.mesh.position.z
    const seat = animal.mountSeatTransform()
    player.setMounted(true)
    if (seat) player.setMountedTransform(seat.x, seat.y, seat.z, seat.yaw)
    ctx.hud.setMounted(true, ANIMAL_LABELS[animal.def.kind], () => exit('player'))
  }

  function exit(reason: DismountReason): void {
    if (!mount) return
    const last = mount
    last.setMounted(false)
    mount = null
    player.setMounted(false)
    const yaw = last.mesh.rotation.y
    player.setPosition(
      last.mesh.position.x + Math.sin(yaw + Math.PI / 2) * DISMOUNT_OFFSET,
      last.mesh.position.z + Math.cos(yaw + Math.PI / 2) * DISMOUNT_OFFSET,
    )
    ctx.hud.setMounted(false, '', null)
    if (reason === 'player') toast.show(`Zsiadasz: ${ANIMAL_LABELS[last.def.kind]}`)
    else if (reason === 'death') toast.show('Wierzchowiec padł — zostałeś zrzucony.', 'error')
    else if (reason === 'unavailable') toast.show('Wierzchowiec zniknął.', 'error')
    else if (reason === 'fall') toast.show('Spadłeś z wierzchowca!', 'error')
  }

  function tryMount(animal: AnimalAgent): boolean {
    if (mount || isActionBlocked(ctx) || player.isDowned()) return false
    if (!animal.isMountable()) return false
    enter(animal)
    toast.show(`Dosiadasz: ${ANIMAL_LABELS[animal.def.kind]}`)
    return true
  }

  function driveInput(): { wishX: number, wishZ: number, sprintRequested: boolean } {
    const yaw = mouseLook.state.yaw
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const rx = -fz
    const rz = fx
    let wishX = 0
    let wishZ = 0
    const k = keyboard.state
    if (k.forward) { wishX += fx; wishZ += fz }
    if (k.backward) { wishX -= fx; wishZ -= fz }
    if (k.left) { wishX -= rx; wishZ -= rz }
    if (k.right) { wishX += rx; wishZ += rz }
    return { wishX, wishZ, sprintRequested: k.sprint }
  }

  function checkStability(dt: number, animal: AnimalAgent, moving: boolean, sprinting: boolean): void {
    stabilityTimer -= dt
    if (stabilityTimer > 0) return
    stabilityTimer = STABILITY_CHECK_INTERVAL_SEC
    if (!moving) return
    const slope = sampleSlope(animal.mesh.position.x, animal.mesh.position.z, bundle.chunkManager.sampleHeight)
    const slopeRatio = Math.min(1, slope.angleRad / ((SLOPE_MAX_WALKABLE_DEG * Math.PI) / 180))
    const staminaRatio = getStaminaRatio(animal.life.stamina)
    const conditionRatio = animal.health.maxHp > 0 ? animal.health.currentHp / animal.health.maxHp : 0
    const ridingSkill = player.skills.riding.value
    const fell = rollFall(
      { staminaRatio, sprinting, slopeRatio, conditionRatio, ridingSkill },
      STABILITY_CHECK_INTERVAL_SEC,
    )
    if (!fell) return
    const speedRatio = sprinting ? 1 : 0.4
    const damage = fallDamage(speedRatio, slopeRatio, ridingSkill, Math.random())
    exit('fall')
    applyPlayerDamage({
      player,
      amount: damage,
      heldTool: ctx.heldTool.held(),
      defenseSkillValue: player.skills.defense.value,
      playerYaw: mouseLook.state.yaw,
    })
  }

  function update(dt: number): void {
    // Drained every frame regardless of mounted state so a `T` press while
    // unmounted can't linger as a stale edge-triggered flag and fire the
    // instant the player next mounts.
    const dismountPressed = keyboard.consumeDismount()
    if (pendingRestoreId && !mount) {
      const resolved = resolveAnimal(pendingRestoreId)
      // Found-but-dead gives up immediately (a dead animal never becomes
      // rideable again); found-but-alive reattaches; not-found-yet keeps
      // retrying next tick (livestock streams in asynchronously).
      if (resolved) {
        pendingRestoreId = null
        if (resolved.isMountable()) enter(resolved)
      }
    }
    if (!mount) return
    if (mount.isDead()) { exit('death'); return }
    if (player.isDowned()) { exit('downed'); return }
    if (dismountPressed) { exit('player'); return }
    // A busy channel/time-skip/rest sequence can only start while not
    // mounted (`tryMount` checks `isActionBlocked`), but nothing currently
    // stops one from starting through an unrelated route (e.g. Quick
    // Actions) while already mounted — freeze the mount in place rather than
    // moving it under a frozen world.
    if (isActionBlocked(ctx)) return

    const { wishX, wishZ, sprintRequested } = driveInput()
    mount.driveMounted(dt, wishX, wishZ, sprintRequested)

    const dx = mount.mesh.position.x - lastMountX
    const dz = mount.mesh.position.z - lastMountZ
    lastMountX = mount.mesh.position.x
    lastMountZ = mount.mesh.position.z
    const moved = Math.hypot(dx, dz)
    if (moved > 0) ridingUseDistance = accumulateRidingUse(player.skills, ridingUseDistance, moved)

    const seat = mount.mountSeatTransform()
    if (seat) player.setMountedTransform(seat.x, seat.y, seat.z, seat.yaw)

    const moving = moved > 1e-5
    tickRidingStamina(player.needs.stamina, dt, moving)

    checkStability(dt, mount, moving, mount.isSprinting())
  }

  function restoreMountedAnimalId(animalId: string | null): void {
    pendingRestoreId = animalId
  }

  return {
    isMounted: () => mount !== null,
    mountedAnimalId: () => mount?.animalId ?? null,
    tryMount,
    dismount: (reason = 'player') => exit(reason),
    update,
    restoreMountedAnimalId,
  }
}
