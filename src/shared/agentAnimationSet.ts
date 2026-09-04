import * as THREE from 'three'

/**
 * Shared clip-resolve/crossfade/one-shot/settle animation owner (review
 * 2026-09-03 §5 E6) — three agents (`NpcAgent`, `AnimalAgent`, `PlayerController`)
 * each hand-roll a version of this today; `NpcAgent`'s variant is the worst
 * of the three (a hard-coded clip array re-enumerated by hand on every
 * transition — `AnimalAgent`/`PlayerController` at least keep a single
 * `currentAction` pointer). This module is the consolidated owner. Wired
 * into `NpcAgent` only in this refactor — `AnimalAgent`/`PlayerController`
 * adoption is tracked in `docs/plans/LOOSE-ENDS.md`.
 *
 * Generic over `K` (the caller's own clip-key union, e.g. NpcAgent's
 * `'idle' | 'walk' | 'interact' | 'attackMelee' | 'attackRanged' | 'hurt' | 'death'`)
 * so a caller never has to enumerate every other agent's keys.
 */
export type AgentAnimationSet<K extends string> = {
  /** Resolves each key to the first matching clip name found on `root`'s
   *  clips (checked in order), or `null` when none match — same "first
   *  name wins" contract the pre-extraction `findAction()` used. Call once
   *  at construction time. */
  resolve: (names: Partial<Record<K, readonly string[]>>) => void
  /** Starts `key` at full weight immediately, no fade — for the very first
   *  clip an agent plays at construction, before anything else is running
   *  (a `play()`/crossfade here would visibly fade in from a blank pose
   *  instead of snapping to it, unlike every subsequent transition). No-op
   *  if `key` didn't resolve to a clip. */
  playImmediate: (key: K) => void
  /** Crossfades to `key` — a no-op if it's already running at (near) full
   *  weight, otherwise fades every other resolved clip out over 0.2s while
   *  fading `key` in over the same window. The normal idle/walk/interact
   *  transition. */
  play: (key: K) => void
  /** Plays `key` once (`LoopOnce`, clamped on its last frame) and fades
   *  every other resolved clip out — attack/hurt/death one-shots. Returns
   *  the clip's duration (`0` for a missing clip, a safe no-op) so a caller
   *  that needs to gate normal `play()` calls for the clip's length can do
   *  so without a second lookup. */
  playOnce: (key: K) => number
  /** Stops every other resolved clip outright (no fade) and jumps `key` to
   *  its last frame at full weight — the settled end pose a reconstructed-
   *  already-dead entity presents immediately, with no blend against
   *  whatever a fresh-alive setup already started playing. No-op if `key`
   *  didn't resolve to a clip. */
  settleAtEnd: (key: K) => void
  /** Whether `key` resolved to a real clip (`resolve()` found a match). */
  has: (key: K) => boolean
  /** Advances the underlying `AnimationMixer` — call once per tick. */
  update: (dt: number) => void
  /** Stops every resolved clip outright (no fade) — the manual "give up on
   *  animation" fallback for an entity with no matching clips at all. */
  stopAll: () => void
}

export function createAgentAnimationSet<K extends string>(
  root: THREE.Object3D,
  clips: readonly THREE.AnimationClip[],
): AgentAnimationSet<K> {
  const mixer = new THREE.AnimationMixer(root)
  const actions = new Map<K, THREE.AnimationAction | null>()

  function allActions(): THREE.AnimationAction[] {
    const out: THREE.AnimationAction[] = []
    for (const action of actions.values()) if (action) out.push(action)
    return out
  }

  return {
    resolve: (names) => {
      for (const key of Object.keys(names) as K[]) {
        const candidates = names[key] ?? []
        let found: THREE.AnimationAction | null = null
        for (const name of candidates) {
          const clip = clips.find((c) => c.name === name)
          if (clip) {
            found = mixer.clipAction(clip)
            break
          }
        }
        actions.set(key, found)
      }
    },
    playImmediate: (key) => {
      actions.get(key)?.play()
    },
    play: (key) => {
      const next = actions.get(key)
      if (!next) return
      if (next.isRunning() && next.getEffectiveWeight() > 0.9) return
      next.reset().fadeIn(0.2).play()
      for (const action of allActions()) {
        if (action !== next) action.fadeOut(0.2)
      }
    },
    playOnce: (key) => {
      const action = actions.get(key)
      if (!action) return 0
      action.reset()
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      for (const other of allActions()) {
        if (other !== action) other.fadeOut(0.15)
      }
      action.setEffectiveWeight(1).fadeIn(0.1).play()
      return action.getClip().duration
    },
    settleAtEnd: (key) => {
      const action = actions.get(key)
      if (!action) return
      for (const other of allActions()) {
        if (other !== action) other.stop()
      }
      action.reset()
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.setEffectiveWeight(1)
      action.play()
      action.time = action.getClip().duration
      mixer.update(0)
    },
    has: (key) => actions.get(key) != null,
    update: (dt) => {
      mixer.update(dt)
    },
    stopAll: () => {
      mixer.stopAllAction()
    },
  }
}
