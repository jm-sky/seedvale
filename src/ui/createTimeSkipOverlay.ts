import { getMountedVueUi } from '../ui-vue/mount'

export type TimeSkipOverlay = {
  /** `fade` toggles a full black screen (used for "rest" — sleeping through
   *  the skip) vs. just the floating label alone (used for "wait" — the
   *  player watches the sky/clock race ahead). */
  show: (label: string, fade: boolean) => void
  hide: () => void
  dispose: () => void
}

/** Compatibility facade. The actual overlay is rendered by Vue
 *  (`ui-vue/screens/TimeSkipOverlay.vue`). */
export function createTimeSkipOverlay(_parent: HTMLElement): TimeSkipOverlay {
  let disposed = false
  const getUi = () => getMountedVueUi()
  return {
    show: (label, fade) => { if (!disposed) getUi()?.showTimeSkip(label, fade) },
    hide: () => { if (!disposed) getUi()?.hideTimeSkip() },
    dispose: () => { if (!disposed) { disposed = true; getUi()?.hideTimeSkip() } },
  }
}
