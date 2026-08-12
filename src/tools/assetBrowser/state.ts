import { reactive } from 'vue'
import type { AssetIndexEntry } from '../../assets/assetIndex'

export type ViewLayout = 'quad' | 'single'
export type RenderMode = 'diagnostic' | 'game-like'
export type LightingPreset = 'alignment' | 'daylight' | 'night' | 'torch'
export type BackgroundPreset = 'dark' | 'mid' | 'light' | 'checker'
export type PoseMode = 'rest' | 'idle'

export type BrowserState = {
  referenceId: string | null
  targetId: string | null
  freeUrl: string
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
  timeOfDay: 0.5,
  torchFuelRatio: 1,
  pose: 'rest',
  resetTransformOnReload: false,
  reportText: '',
  statusMessage: 'Ready',
  invalidSelection: null,
})

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
