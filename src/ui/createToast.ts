import { getMountedVueUi } from '../ui-vue/mount'

export type ToastVariant = 'info' | 'pickup' | 'error'

export type Toast = {
  /** Adds a toast that fades out and removes itself after a few seconds.
   *  Never blocks input — doesn't participate in `app/createApp.ts`'s modal
   *  gating (no `isOpen()`/Escape handling), unlike NPC dialogs. */
  show: (text: string, variant?: ToastVariant) => void
  dispose: () => void
}

/** Compatibility facade. Toast stack is rendered by Vue (`ToastStack.vue`). */
export function createToast(_parent: HTMLElement): Toast {
  let disposed = false
  const getUi = () => getMountedVueUi()
  return {
    show: (text, variant = 'info') => { if (!disposed) getUi()?.showToast(text, variant) },
    dispose: () => {
      if (disposed) return
      disposed = true
      getUi()?.clearToasts()
    },
  }
}
