import { computed, onMounted, onUnmounted, ref } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'

/** M1 short-landscape threshold (plan ui-input-003) — desktop C1 needs real
 *  vertical room for 3 columns; below this height (regardless of device)
 *  the merchant screen switches to the single-context + drawer layout. Kept
 *  device-agnostic on purpose: a touch device in a tall window still fits
 *  C1, and a short desktop browser window should still get M1. */
const COMPACT_HEIGHT_PX = 560

/** Whether the merchant screen should render M1 (single context + drawer)
 *  instead of C1 (3-column). Combines `isTouchDevice()` with an actual
 *  viewport height check rather than a `max-md` breakpoint alone — a tablet
 *  or a resized desktop window in landscape has plenty of width but not
 *  height, which is the case C1's grid can't shrink into 1:1 (plan notes). */
export function useCompactMerchantLayout() {
  const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : COMPACT_HEIGHT_PX + 1)

  function onResize(): void {
    viewportHeight.value = window.innerHeight
  }

  onMounted(() => window.addEventListener('resize', onResize))
  onUnmounted(() => window.removeEventListener('resize', onResize))

  const isCompact = computed(() => viewportHeight.value <= COMPACT_HEIGHT_PX || isTouchDevice())

  return { isCompact }
}
