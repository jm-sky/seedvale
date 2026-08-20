import { isDebugMode } from './debugMode'

/**
 * Ctrl+click → open the NPC Simulation Inspector (plan 170 §5). Seedvale is a
 * pointer-lock FPS controller: `MouseLook`'s own `click` handler only
 * re-acquires pointer lock, there is no cursor-position raycast to hit-test
 * against, and gaze target resolution already happens once per frame in
 * `gameLoop.ts` (`pickInGaze`). So this only latches "Ctrl held during a
 * mousedown on the game canvas" for the frame loop to consume against
 * whatever NPC is currently gazed — the faithful equivalent of "click the
 * NPC you're looking at" under this input model.
 *
 * No listener is registered at all outside `?debug` — zero cost when disabled.
 */
export type NpcInspectTrigger = {
  /** Reads and clears the pending press. Returns true at most once per Ctrl+mousedown. */
  consume: () => boolean
  dispose: () => void
}

export function createNpcInspectTrigger(target: HTMLElement): NpcInspectTrigger {
  if (!isDebugMode()) return { consume: () => false, dispose: () => {} }
  let pending = false
  const onMouseDown = (event: MouseEvent) => {
    if (event.ctrlKey) pending = true
  }
  target.addEventListener('mousedown', onMouseDown)
  return {
    consume: () => {
      if (!pending) return false
      pending = false
      return true
    },
    dispose: () => target.removeEventListener('mousedown', onMouseDown),
  }
}
