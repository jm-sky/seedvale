import type { PlayerController } from '../player/PlayerController'
import { createCampBlanketProp, disposeCampBlanketProp } from '../items/campBlanketProp'
import type { Object3D, Scene } from 'three'

const SETUP_CROUCH_SEC = 0.7
const TEARDOWN_CROUCH_SEC = 0.7

type Phase =
  | 'idle'
  | 'setupCrouch'
  | 'placeBlanket'
  | 'lie'
  | 'sleeping'
  | 'teardownCrouch'
  | 'removeBlanket'
  | 'stand'

export type RestCampSequenceTickResult = {
  label: string
  /** True on the frame setup/teardown busy overlay should hide (sleep /
   *  complete hand off elsewhere). */
  justFinishedBusy: boolean
}

export type RestCampSequence = {
  isActive: () => boolean
  /** True while setup/teardown should show the busy overlay (not during
   *  the mid-sequence time skip). */
  isBusy: () => boolean
  start: (opts: {
    onSleepStart: () => void
    onComplete: () => void
    variant?: 'camp' | 'tent'
  }) => void
  /** Call when the 8h time skip finishes — begins teardown. */
  notifySleepFinished: () => void
  tick: (dt: number) => RestCampSequenceTickResult | null
  cancel: () => void
  dispose: () => void
}

/**
 * Visual camp-rest ritual: crouch → place blanket → lie → (caller runs
 * time skip) → crouch → remove blanket → stand. Own timers so dig's
 * `busyAction` is never shared mid-sleep.
 */
export function createRestCampSequence(
  scene: Scene,
  player: PlayerController,
  sampleHeight: (x: number, z: number) => number,
): RestCampSequence {
  let phase: Phase = 'idle'
  let remainingSec = 0
  let onSleepStart: (() => void) | null = null
  let onComplete: (() => void) | null = null
  let blanket: Object3D | null = null
  let busyLabel = ''
  let variant: 'camp' | 'tent' = 'camp'

  const clearBlanket = (): void => {
    if (!blanket) return
    disposeCampBlanketProp(blanket)
    blanket = null
  }

  const placeBlanket = (): void => {
    clearBlanket()
    const prop = createCampBlanketProp()
    const { x, z } = player.mesh.position
    const yaw = player.mesh.rotation.y
    // `lieDown` tips the model −90° around X, so the spine runs along mesh-local
    // −Z from the feet. Center the bedroll under mid-torso, not under the feet.
    const alongSpine = 0.85
    const bx = x - alongSpine * Math.sin(yaw)
    const bz = z - alongSpine * Math.cos(yaw)
    prop.position.set(bx, sampleHeight(bx, bz) + 0.04, bz)
    prop.rotation.y = yaw
    scene.add(prop)
    blanket = prop
  }

  const reset = (): void => {
    phase = 'idle'
    remainingSec = 0
    onSleepStart = null
    onComplete = null
    busyLabel = ''
    clearBlanket()
  }

  return {
    isActive: () => phase !== 'idle',
    isBusy: () => phase === 'setupCrouch' || phase === 'teardownCrouch',
    start(opts) {
      if (phase !== 'idle') return
      onSleepStart = opts.onSleepStart
      onComplete = opts.onComplete
      variant = opts.variant ?? 'camp'
      player.crouch()
      phase = 'setupCrouch'
      remainingSec = SETUP_CROUCH_SEC
      busyLabel = variant === 'tent' ? 'Kładziesz się w namiocie…' : 'Rozbijasz obóz…'
    },
    notifySleepFinished() {
      if (phase !== 'sleeping') return
      player.crouch()
      phase = 'teardownCrouch'
      remainingSec = TEARDOWN_CROUCH_SEC
      busyLabel = variant === 'tent' ? 'Wstajesz…' : 'Zwijasz obóz…'
    },
    tick(dt) {
      if (phase === 'idle' || phase === 'sleeping') return null

      if (phase === 'setupCrouch' || phase === 'teardownCrouch') {
        remainingSec -= dt
        if (remainingSec > 0) {
          return { label: busyLabel, justFinishedBusy: false }
        }
        if (phase === 'setupCrouch') {
          phase = 'placeBlanket'
        } else {
          phase = 'removeBlanket'
        }
      }

      if (phase === 'placeBlanket') {
        if (variant === 'camp') placeBlanket()
        phase = 'lie'
      }

      if (phase === 'lie') {
        player.lieDown()
        phase = 'sleeping'
        const start = onSleepStart
        onSleepStart = null
        start?.()
        return { label: busyLabel, justFinishedBusy: true }
      }

      if (phase === 'removeBlanket') {
        clearBlanket()
        phase = 'stand'
      }

      if (phase === 'stand') {
        const label = busyLabel
        player.standUp()
        const done = onComplete
        reset()
        done?.()
        return { label, justFinishedBusy: true }
      }

      return null
    },
    cancel() {
      if (phase === 'idle') return
      player.standUp()
      reset()
    },
    dispose() {
      this.cancel()
    },
  }
}
