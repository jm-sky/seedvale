import { getMountedVueUi } from '../ui-vue/mount'

export type BusyOverlay = {
  show: (label: string, blurred?: boolean) => void
  hide: () => void
  dispose: () => void
}

/** Compatibility facade for the Vue busy/channel overlay
 *  (`ui-vue/screens/BusyOverlay.vue`). */
export function createBusyOverlay(_parent: HTMLElement): BusyOverlay {
  let disposed = false
  const getUi = () => getMountedVueUi()
  return {
    show: (label, blurred) => { if (!disposed) getUi()?.showBusy(label, blurred) },
    hide: () => { if (!disposed) getUi()?.hideBusy() },
    dispose: () => { if (!disposed) { disposed = true; getUi()?.hideBusy() } },
  }
}
