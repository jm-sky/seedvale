import { watch } from 'vue'
import { registerOverlay, syncOverlayStack } from '../store'

/** Registers a screen's `close()` for Escape-priority (`store.ts`'s
 *  `openStack`) and keeps its stack membership in sync with `isOpen()`. */
export function useOverlayScreen(id: string, isOpen: () => boolean, close: () => void): void {
  registerOverlay(id, close)
  watch(isOpen, (open) => syncOverlayStack(id, open), { immediate: true })
}
