import { getMountedVueUi } from '../ui-vue/mount'

export type BusyOverlay = {
  show: (label: string, blurred?: boolean, progress?: number | null) => void
  hide: () => void
  dispose: () => void
}

/** Compatibility facade for the Vue busy/channel overlay
 *  (`ui-vue/screens/BusyOverlay.vue`). */
export function createBusyOverlay(_parent: HTMLElement): BusyOverlay {
  let disposed = false
  const getUi = () => getMountedVueUi()
  return {
    show: (label, blurred, progress) => {
      if (!disposed) getUi()?.showBusy(label, blurred, progress)
    },
    hide: () => { if (!disposed) getUi()?.hideBusy() },
    dispose: () => { if (!disposed) { disposed = true; getUi()?.hideBusy() } },
  }
}
