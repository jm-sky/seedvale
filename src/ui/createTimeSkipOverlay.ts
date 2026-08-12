import { getMountedVueUi } from '../ui-vue/mount'

export type TimeSkipOverlay = {
  /** `fadeStrength` sets the grayscale/blur/darken filter opacity (`0` =
   *  label only, `0.5` = wait, `1` = rest — see `TimeSkipOverlay.vue`). */
  show: (label: string, fadeStrength: number) => void
  hide: () => void
  dispose: () => void
}

/** Compatibility facade. The actual overlay is rendered by Vue
 *  (`ui-vue/screens/TimeSkipOverlay.vue`). */
export function createTimeSkipOverlay(_parent: HTMLElement): TimeSkipOverlay {
  let disposed = false
  const getUi = () => getMountedVueUi()
  return {
    show: (label, fadeStrength) => {
      if (!disposed) getUi()?.showTimeSkip(label, fadeStrength)
    },
    hide: () => { if (!disposed) getUi()?.hideTimeSkip() },
    dispose: () => { if (!disposed) { disposed = true; getUi()?.hideTimeSkip() } },
  }
}
