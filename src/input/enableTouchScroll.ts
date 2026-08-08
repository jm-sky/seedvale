/**
 * Manual touch-drag scroll for a scrollable panel — a fallback that doesn't
 * depend on the browser correctly deriving a usable touch-action from
 * `overflow-y: auto` (the intersection-with-ancestors rule made this
 * unreliable in practice across mobile browsers here even after ancestors
 * were cleaned up — see index.html's touch-action comment). Sets `scrollTop`
 * directly from the drag delta; no momentum/inertia, but always works.
 * Single-finger only — a second finger (pinch) cancels the drag.
 */
export function enableTouchScroll(el: HTMLElement): () => void {
  let touchId: number | null = null
  let lastY = 0

  const onTouchStart = (event: TouchEvent): void => {
    if (touchId !== null || event.touches.length !== 1) return
    touchId = event.touches[0]!.identifier
    lastY = event.touches[0]!.clientY
  }

  const onTouchMove = (event: TouchEvent): void => {
    if (touchId === null) return
    if (event.touches.length !== 1) {
      touchId = null
      return
    }
    const touch = event.touches[0]!
    if (touch.identifier !== touchId) return
    const deltaY = lastY - touch.clientY
    lastY = touch.clientY
    if (el.scrollHeight <= el.clientHeight) return
    el.scrollTop += deltaY
    event.preventDefault()
  }

  const onTouchEnd = (event: TouchEvent): void => {
    for (const touch of Array.from(event.changedTouches)) {
      if (touch.identifier === touchId) touchId = null
    }
  }

  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd, { passive: true })
  el.addEventListener('touchcancel', onTouchEnd, { passive: true })

  return () => {
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('touchcancel', onTouchEnd)
  }
}
