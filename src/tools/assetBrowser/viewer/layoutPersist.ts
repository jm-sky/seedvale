import type { BrowserState, ViewLayout } from '../state'
import { clampSplit } from './viewportLayout'

const STORAGE_KEY = 'seedvale.assetBrowser.layout.v1'

export type LayoutPersistPayload = {
  version: 1
  layout: ViewLayout
  activeView: number
  splitX: number
  splitY: number
}

function isLayout(v: unknown): v is ViewLayout {
  return v === 'quad' || v === 'single'
}

export function loadLayoutPersist(): LayoutPersistPayload | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LayoutPersistPayload
    if (parsed?.version !== 1 || !isLayout(parsed.layout)) return null
    if (!Number.isInteger(parsed.activeView) || parsed.activeView < 0 || parsed.activeView > 3) {
      return null
    }
    if (typeof parsed.splitX !== 'number' || typeof parsed.splitY !== 'number') return null
    if (!Number.isFinite(parsed.splitX) || !Number.isFinite(parsed.splitY)) return null
    return {
      version: 1,
      layout: parsed.layout,
      activeView: parsed.activeView,
      splitX: clampSplit(parsed.splitX),
      splitY: clampSplit(parsed.splitY),
    }
  } catch {
    return null
  }
}

export function saveLayoutPersist(state: Pick<BrowserState, 'layout' | 'activeView' | 'splitX' | 'splitY'>): void {
  if (typeof localStorage === 'undefined') return
  const payload: LayoutPersistPayload = {
    version: 1,
    layout: state.layout,
    activeView: state.activeView,
    splitX: clampSplit(state.splitX),
    splitY: clampSplit(state.splitY),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearLayoutPersist(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Apply stored layout when present. Does not touch asset/camera fields. */
export function applyLayoutPersist(state: BrowserState): boolean {
  const payload = loadLayoutPersist()
  if (!payload) return false
  state.layout = payload.layout
  state.activeView = payload.activeView
  state.splitX = payload.splitX
  state.splitY = payload.splitY
  return true
}

export function createLayoutPersistScheduler(
  getState: () => Pick<BrowserState, 'layout' | 'activeView' | 'splitX' | 'splitY'>,
  debounceMs = 200,
): { schedule: () => void, flush: () => void, dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    saveLayoutPersist(getState())
  }
  return {
    schedule: () => {
      if (timer != null) clearTimeout(timer)
      timer = setTimeout(flush, debounceMs)
    },
    flush,
    dispose: () => {
      if (timer != null) clearTimeout(timer)
      timer = null
    },
  }
}
