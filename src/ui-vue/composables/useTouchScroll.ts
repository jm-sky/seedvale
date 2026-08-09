import { onMounted, onUnmounted, type Ref } from 'vue'
import { enableTouchScroll } from '../../input/enableTouchScroll'
import { isTouchDevice } from '../../input/isTouchDevice'

/** Vue wrapper over `input/enableTouchScroll.ts` — same manual touch-drag
 *  scroll every vanilla `.seedvale-*__panel` used. */
export function useTouchScroll(panelRef: Ref<HTMLElement | null>): void {
  if (!isTouchDevice()) return
  let dispose: (() => void) | null = null
  onMounted(() => {
    if (panelRef.value) dispose = enableTouchScroll(panelRef.value)
  })
  onUnmounted(() => dispose?.())
}
