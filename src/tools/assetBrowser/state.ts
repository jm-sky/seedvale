import { reactive } from 'vue'
import type { AssetIndexEntry } from '../../assets/assetIndex'
import { DEFAULT_HAIR_COLOR, type HairColorId } from './hairTint'
import { applyAssetBrowserUrlParams } from './urlParams'
import { applyLayoutPersist } from './viewer/layoutPersist'
import { DEFAULT_SPLIT } from './viewer/viewportLayout'

export type { HairColorId } from './hairTint'

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
  /** Left-column width fraction in quad layout (WebGL X). */
  splitX: number
  /** Bottom-row height fraction in quad layout (WebGL Y). */
  splitY: number
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
  /** Named clip @ t=0. `null` with pose idle → first `/idle/i` clip. */
  clip: string | null
  /** UBC `MI_Hair_*` color multiply; no-op on non-UBC meshes. */
  hairColor: HairColorId
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
  splitX: DEFAULT_SPLIT,
  splitY: DEFAULT_SPLIT,
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
  clip: null,
  hairColor: DEFAULT_HAIR_COLOR,
  resetTransformOnReload: false,
  reportText: '',
  statusMessage: 'Ready',
  invalidSelection: null,
})

applyLayoutPersist(browserState)
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
  clipNames: string[]
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
    clipNames: [],
  }
}

export function resetSlotDiagnostics(which: 'reference' | 'target'): void {
  slotDiagnostics[which] = emptySlotDiagnostics()
}
