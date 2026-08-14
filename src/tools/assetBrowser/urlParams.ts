import type {
  BrowserState,
  FocusMode,
  LightingPreset,
  PoseMode,
  ViewLayout,
} from './state'

/**
 * Deep-link / test helpers for the asset alignment browser.
 *
 * Examples:
 *   ?reference=character:player&target=held:axe
 *   ?ref=house:hut_d&target=settlement:lantern&refAnchor=lamp_mount&targetAnchor=origin
 *   ?url=/models/items/axe.glb
 *   ?target=held:knife&focus=hand&layout=quad&pose=idle&bbox=0&overlay=0
 */
export type AssetBrowserUrlParams = {
  /** Absent → leave state default. `null` → clear selection. */
  referenceId?: string | null
  targetId?: string | null
  freeUrl?: string
  referenceFreeUrl?: string
  referenceAnchor?: string | null
  targetAnchor?: string | null
  focus?: FocusMode
  focusRadius?: number | null
  layout?: ViewLayout
  /** View id or index: front|side|top|perspective | 0..3 */
  activeView?: number
  pose?: PoseMode
  lightingPreset?: LightingPreset
  showBbox?: boolean
  showGrid?: boolean
  showAxes?: boolean
  showGround?: boolean
  showOverlay?: boolean
}

const VIEW_ALIASES: Record<string, number> = {
  front: 0,
  side: 1,
  top: 2,
  perspective: 3,
  persp: 3,
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
}

function firstPresent(params: URLSearchParams, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    if (params.has(key)) return params.get(key) ?? ''
  }
  return undefined
}

function normalizeId(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeOptionalString(raw: string | undefined): string | null | undefined {
  return normalizeId(raw)
}

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined
  const v = raw.trim().toLowerCase()
  if (v === '' || v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return undefined
}

function parseFocus(raw: string | undefined): FocusMode | undefined {
  if (raw === undefined) return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'hand' || v === 'grip' || v === 'anchor') return 'hand'
  if (v === 'scene' || v === 'full' || v === 'asset') return 'scene'
  return undefined
}

function parseLayout(raw: string | undefined): ViewLayout | undefined {
  if (raw === undefined) return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'quad' || v === '4' || v === 'multi') return 'quad'
  if (v === 'single' || v === '1') return 'single'
  return undefined
}

function parsePose(raw: string | undefined): PoseMode | undefined {
  if (raw === undefined) return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'rest' || v === 'bind') return 'rest'
  if (v === 'idle') return 'idle'
  return undefined
}

function parseLighting(raw: string | undefined): LightingPreset | undefined {
  if (raw === undefined) return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'alignment' || v === 'align') return 'alignment'
  if (v === 'daylight' || v === 'day') return 'daylight'
  if (v === 'night') return 'night'
  if (v === 'torch') return 'torch'
  return undefined
}

function parseView(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const key = raw.trim().toLowerCase()
  if (key in VIEW_ALIASES) return VIEW_ALIASES[key]
  const n = Number(key)
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : undefined
}

function parseRadius(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Parse asset / camera / display query params from the URL. */
export function parseAssetBrowserUrlParams(
  search = typeof window !== 'undefined' ? window.location.search : '',
): AssetBrowserUrlParams {
  const params = new URLSearchParams(search)
  const out: AssetBrowserUrlParams = {}

  const reference = normalizeId(firstPresent(params, ['reference', 'ref']))
  if (reference !== undefined) out.referenceId = reference

  const target = normalizeId(firstPresent(params, ['target']))
  if (target !== undefined) out.targetId = target

  const url = firstPresent(params, ['url', 'targetUrl', 'freeUrl'])
  if (url !== undefined) out.freeUrl = url.trim()

  const refUrl = firstPresent(params, ['referenceUrl', 'refUrl'])
  if (refUrl !== undefined) out.referenceFreeUrl = refUrl.trim()

  const refAnchor = normalizeOptionalString(
    firstPresent(params, ['referenceAnchor', 'refAnchor']),
  )
  if (refAnchor !== undefined) out.referenceAnchor = refAnchor

  const tgtAnchor = normalizeOptionalString(firstPresent(params, ['targetAnchor']))
  if (tgtAnchor !== undefined) out.targetAnchor = tgtAnchor

  const focus = parseFocus(firstPresent(params, ['focus']))
  if (focus !== undefined) out.focus = focus

  const focusRadius = parseRadius(firstPresent(params, ['focusRadius', 'radius', 'zoom']))
  if (focusRadius !== undefined) out.focusRadius = focusRadius

  const layout = parseLayout(firstPresent(params, ['layout']))
  if (layout !== undefined) out.layout = layout

  const activeView = parseView(firstPresent(params, ['view', 'activeView']))
  if (activeView !== undefined) out.activeView = activeView

  const pose = parsePose(firstPresent(params, ['pose']))
  if (pose !== undefined) out.pose = pose

  const lighting = parseLighting(firstPresent(params, ['lighting', 'light', 'preset']))
  if (lighting !== undefined) out.lightingPreset = lighting

  const bbox = parseBool(firstPresent(params, ['bbox', 'showBbox']))
  if (bbox !== undefined) out.showBbox = bbox

  const grid = parseBool(firstPresent(params, ['grid', 'showGrid']))
  if (grid !== undefined) out.showGrid = grid

  const axes = parseBool(firstPresent(params, ['axes', 'showAxes']))
  if (axes !== undefined) out.showAxes = axes

  const ground = parseBool(firstPresent(params, ['ground', 'showGround']))
  if (ground !== undefined) out.showGround = ground

  const overlay = parseBool(firstPresent(params, ['overlay', 'report']))
  if (overlay !== undefined) out.showOverlay = overlay

  return out
}

export function hasAssetBrowserUrlParams(parsed: AssetBrowserUrlParams): boolean {
  return Object.keys(parsed).length > 0
}

/** Apply parsed query params onto browser state (only fields present in the query). */
export function applyAssetBrowserUrlParams(
  state: BrowserState,
  parsed: AssetBrowserUrlParams = parseAssetBrowserUrlParams(),
): boolean {
  if (!hasAssetBrowserUrlParams(parsed)) return false

  if (parsed.referenceId !== undefined) state.referenceId = parsed.referenceId
  if (parsed.targetId !== undefined) {
    state.targetId = parsed.targetId
    // Explicit target id wins over a leftover free URL unless url= is also set.
    if (parsed.freeUrl === undefined) state.freeUrl = ''
  }
  if (parsed.freeUrl !== undefined) {
    state.freeUrl = parsed.freeUrl
    if (parsed.freeUrl && parsed.targetId === undefined) state.targetId = null
  }
  if (parsed.referenceFreeUrl !== undefined) {
    state.referenceFreeUrl = parsed.referenceFreeUrl
    if (parsed.referenceFreeUrl && parsed.referenceId === undefined) state.referenceId = null
  }
  if (parsed.referenceAnchor !== undefined) state.referenceAnchor = parsed.referenceAnchor
  if (parsed.targetAnchor !== undefined) state.targetAnchor = parsed.targetAnchor
  if (parsed.focus !== undefined) state.focus = parsed.focus
  if (parsed.focusRadius !== undefined) state.focusRadius = parsed.focusRadius
  if (parsed.layout !== undefined) state.layout = parsed.layout
  if (parsed.activeView !== undefined) state.activeView = parsed.activeView
  if (parsed.pose !== undefined) state.pose = parsed.pose
  if (parsed.lightingPreset !== undefined) state.lightingPreset = parsed.lightingPreset
  if (parsed.showBbox !== undefined) state.showBbox = parsed.showBbox
  if (parsed.showGrid !== undefined) state.showGrid = parsed.showGrid
  if (parsed.showAxes !== undefined) state.showAxes = parsed.showAxes
  if (parsed.showGround !== undefined) state.showGround = parsed.showGround
  if (parsed.showOverlay !== undefined) state.showOverlay = parsed.showOverlay

  return true
}

function setOrDelete(url: URL, key: string, value: string | null | undefined): void {
  if (value == null || value === '') url.searchParams.delete(key)
  else url.searchParams.set(key, value)
}

function setBoolFlag(url: URL, key: string, value: boolean, defaultValue: boolean): void {
  if (value === defaultValue) url.searchParams.delete(key)
  else url.searchParams.set(key, value ? '1' : '0')
}

const VIEW_NAMES = ['front', 'side', 'top', 'perspective'] as const

/** Keep the address bar in sync so the current pair is shareable / refreshable. */
export function syncAssetBrowserUrlParams(state: BrowserState): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)

  // Canonical names only (drop aliases so the bar stays short).
  for (const alias of [
    'ref', 'targetUrl', 'freeUrl', 'refUrl', 'refAnchor', 'radius', 'zoom', 'activeView',
    'light', 'preset', 'showBbox', 'showGrid', 'showAxes', 'showGround', 'report',
  ] as const) {
    url.searchParams.delete(alias)
  }

  setOrDelete(url, 'reference', state.referenceId)
  setOrDelete(url, 'target', state.targetId)
  setOrDelete(url, 'url', state.freeUrl.trim() || null)
  setOrDelete(url, 'referenceUrl', state.referenceFreeUrl.trim() || null)
  setOrDelete(url, 'referenceAnchor', state.referenceAnchor)
  setOrDelete(url, 'targetAnchor', state.targetAnchor)

  if (state.focus === 'scene') url.searchParams.delete('focus')
  else url.searchParams.set('focus', state.focus)

  if (state.focusRadius == null) url.searchParams.delete('focusRadius')
  else url.searchParams.set('focusRadius', String(state.focusRadius))

  if (state.layout === 'quad') url.searchParams.delete('layout')
  else url.searchParams.set('layout', state.layout)

  if (state.activeView === 0) url.searchParams.delete('view')
  else url.searchParams.set('view', VIEW_NAMES[state.activeView] ?? String(state.activeView))

  if (state.pose === 'rest') url.searchParams.delete('pose')
  else url.searchParams.set('pose', state.pose)

  if (state.lightingPreset === 'alignment') url.searchParams.delete('lighting')
  else url.searchParams.set('lighting', state.lightingPreset)

  setBoolFlag(url, 'bbox', state.showBbox, true)
  setBoolFlag(url, 'grid', state.showGrid, true)
  setBoolFlag(url, 'axes', state.showAxes, true)
  setBoolFlag(url, 'ground', state.showGround, true)
  setBoolFlag(url, 'overlay', state.showOverlay, true)

  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) window.history.replaceState({}, '', next)
}
