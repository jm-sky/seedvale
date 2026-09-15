import type { ViewLayout } from '../state'

export const SPLIT_MIN = 0.15
export const SPLIT_MAX = 0.85
export const DEFAULT_SPLIT = 0.5

export type ViewRect = {
  x: number
  y: number
  w: number
  h: number
}

/** Clamp a 0–1 split so no pane collapses. */
export function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPLIT
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value))
}

/**
 * WebGL viewport rects for Front, Side, Top, Perspective (bottom-left origin).
 * `splitX` is the left-column width fraction; `splitY` is the bottom-row height fraction.
 */
export function computeViewRects(
  canvasW: number,
  canvasH: number,
  layout: ViewLayout,
  activeView: number,
  splitX: number,
  splitY: number,
): ViewRect[] {
  const empty: ViewRect = { x: 0, y: 0, w: 0, h: 0 }
  const rects: ViewRect[] = [
    { ...empty },
    { ...empty },
    { ...empty },
    { ...empty },
  ]
  if (canvasW <= 0 || canvasH <= 0) return rects

  if (layout === 'single') {
    const i = Math.min(3, Math.max(0, Math.trunc(activeView)))
    rects[i] = { x: 0, y: 0, w: canvasW, h: canvasH }
    return rects
  }

  const leftW = Math.floor(canvasW * clampSplit(splitX))
  const rightW = canvasW - leftW
  const bottomH = Math.floor(canvasH * clampSplit(splitY))
  const topH = canvasH - bottomH

  rects[0] = { x: 0, y: bottomH, w: leftW, h: topH }
  rects[1] = { x: leftW, y: bottomH, w: rightW, h: topH }
  rects[2] = { x: 0, y: 0, w: leftW, h: bottomH }
  rects[3] = { x: leftW, y: 0, w: rightW, h: bottomH }
  return rects
}
