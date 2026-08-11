import {
  type MinimapSettlement,
  updateRegisteredMinimap,
} from '../ui-vue/lib/drawMinimap'
import { getMountedVueUi } from '../ui-vue/mount'
import type { Vector3 } from 'three'

export type { MinimapSettlement }

export type Minimap = {
  update: (playerPos: Vector3, settlements: readonly MinimapSettlement[]) => void
  toggle: () => void
  dispose: () => void
}

/** Compatibility facade. Shell + canvas live in Vue (`MinimapScreen.vue`);
 *  `update` paints imperatively through the registered drawer (no reactive
 *  per-frame settlement/NPC arrays). */
export function createMinimap(_parent: HTMLElement): Minimap {
  let disposed = false
  const getUi = () => getMountedVueUi()
  return {
    update(playerPos, settlements) {
      if (disposed) return
      updateRegisteredMinimap(playerPos, settlements)
    },
    toggle: () => { if (!disposed) getUi()?.toggleMinimap() },
    dispose: () => {
      if (disposed) return
      disposed = true
      getUi()?.setMinimapCollapsed(false)
    },
  }
}
