import { reactive } from 'vue'
import type { AssetIndexEntry } from '../../assets/assetIndex'
import { applyAssetBrowserUrlParams } from './urlParams'

export type ViewLayout = 'quad' | 'single'
export type RenderMode = 'diagnostic' | 'game-like'
export type LightingPreset = 'alignment' | 'daylight' | 'night' | 'torch'
export type BackgroundPreset = 'dark' | 'mid' | 'light' | 'checker'
export type PoseMode = 'rest' | 'idle'
/** `scene` = full asset bounds; `hand` = zoom on hand.right / selected reference anchor. */
export type FocusMode = 'scene' | 'hand'

export type BrowserState = {
  referenceId: string | null
  targetId: string | null
  freeUrl: string
  referenceFreeUrl: string
  referenceAnchor: string | null
  targetAnchor: string | null
  layout: ViewLayout
  activeView: number
  renderMode: RenderMode
  lightingPreset: LightingPreset
  background: BackgroundPreset
  showGrid: boolean
  showAxes: boolean
  showGround: boolean
  showBbox: boolean
  wireframe: boolean
  /** When false, hide the on-canvas report overlay (cleaner grip screenshots). */
  showOverlay: boolean
  focus: FocusMode
  /** Optional framing radius override in meters (mainly with focus=hand). */
  focusRadius: number | null
  timeOfDay: number
  torchFuelRatio: number
  pose: PoseMode
  resetTransformOnReload: boolean
  reportText: string
  statusMessage: string
  invalidSelection: string | null
}

export const browserState = reactive<BrowserState>({
  referenceId: 'character:player',
  targetId: null,
  freeUrl: '',
  referenceFreeUrl: '',
  referenceAnchor: 'hand.right',
  targetAnchor: null,
  layout: 'quad',
  activeView: 0,
  renderMode: 'diagnostic',
  lightingPreset: 'alignment',
  background: 'dark',
  showGrid: true,
  showAxes: true,
  showGround: true,
  showBbox: true,
  wireframe: false,
  showOverlay: true,
  focus: 'scene',
  focusRadius: null,
  timeOfDay: 0.5,
  torchFuelRatio: 1,
  pose: 'rest',
  resetTransformOnReload: false,
  reportText: '',
  statusMessage: 'Ready',
  invalidSelection: null,
})

if (applyAssetBrowserUrlParams(browserState)) {
  const parts = [
    browserState.referenceId ? `ref=${browserState.referenceId}` : null,
    browserState.targetId ? `target=${browserState.targetId}` : null,
    browserState.freeUrl.trim() ? `url=${browserState.freeUrl.trim()}` : null,
    browserState.referenceFreeUrl.trim() ? `refUrl=${browserState.referenceFreeUrl.trim()}` : null,
  ].filter(Boolean)
  browserState.statusMessage = parts.length
    ? `Loaded from URL (${parts.join(', ')})`
    : 'Loaded from URL'
}

export type SlotDiagnostics = {
  entry: AssetIndexEntry | null
  url: string | null
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
    size: [number, number, number]
    center: [number, number, number]
    minY: number
  } | null
  anchors: Array<{
    name: string
    type: string | null
    source: string
    issues: string[]
  }>
  transform: {
    position: [number, number, number]
    rotationDeg: [number, number, number]
    scale: [number, number, number]
  }
}

export const slotDiagnostics = reactive<{
  reference: SlotDiagnostics
  target: SlotDiagnostics
  delta: {
    positionM: [number, number, number] | null
    positionDistanceM: number | null
    rotationDeg: number | null
    orientationKnown: boolean
    status: string
  }
}>({
  reference: emptySlotDiagnostics(),
  target: emptySlotDiagnostics(),
  delta: {
    positionM: null,
    positionDistanceM: null,
    rotationDeg: null,
    orientationKnown: false,
    status: 'SINGLE_ASSET',
  },
})

function emptySlotDiagnostics(): SlotDiagnostics {
  return {
    entry: null,
    url: null,
    bounds: null,
    anchors: [],
    transform: {
      position: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      scale: [1, 1, 1],
    },
  }
}

export function resetSlotDiagnostics(which: 'reference' | 'target'): void {
  slotDiagnostics[which] = emptySlotDiagnostics()
}
