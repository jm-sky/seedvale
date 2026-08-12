import { Euler } from 'three'
import type { ResolvedAnchor } from '../../../assets/anchorResolve'
import type { BrowserState } from '../state'
import type { AssetSlot } from './createAssetSlot'
import {
  matrixToEulerDeg,
  matrixToPosition,
  positionDelta,
  positionDistance,
  rotationDeltaDeg,
} from '../../../assets/alignAnchors'
import {
  buildAlignmentReport,
  computeAlignmentStatus,
  formatAlignmentReport,
  groundContactVerdict,
  type ReportAnchor,
} from '../../../assets/alignmentReport'
import { boundsData } from './createAssetSlot'
import { computeHeldPreviewState } from './mountHeldPreview'

function rootTransform(group: import('three').Group): {
  position: [number, number, number]
  rotationDeg: [number, number, number]
  scale: [number, number, number]
} {
  const e = new Euler().setFromQuaternion(group.quaternion, 'XYZ')
  return {
    position: [group.position.x, group.position.y, group.position.z],
    rotationDeg: [
      e.x * 180 / Math.PI,
      e.y * 180 / Math.PI,
      e.z * 180 / Math.PI,
    ],
    scale: [group.scale.x, group.scale.y, group.scale.z],
  }
}

function anchorToReport(anchor: ResolvedAnchor): ReportAnchor {
  return {
    name: anchor.def.name,
    type: anchor.def.type ?? null,
    source: anchor.source,
    space: anchor.def.space ?? (anchor.def.node ? 'node' : 'assetLocal'),
    node: typeof anchor.def.node === 'string' ? anchor.def.node : anchor.def.node?.[0] ?? null,
    hasOrientation: anchor.hasOrientation,
    localPosition: matrixToPosition(anchor.localMatrix),
    localRotationDeg: anchor.hasOrientation ? matrixToEulerDeg(anchor.localMatrix) : null,
    worldPosition: matrixToPosition(anchor.worldMatrix),
    worldRotationDeg: anchor.hasOrientation ? matrixToEulerDeg(anchor.worldMatrix) : null,
  }
}

export function buildReportFromScene(input: {
  state: BrowserState
  reference: AssetSlot
  target: AssetSlot
  composerActive: boolean
  invalidSelection?: string | null
}): string {
  const { state, reference, target, composerActive, invalidSelection } = input
  const refAnchor = reference.anchors.find((a) => a.def.name === state.referenceAnchor)
  const tgtAnchor = target.anchors.find((a) => a.def.name === state.targetAnchor)
    ?? reference.anchors.find((a) => a.def.name === state.targetAnchor)

  const hasPair = !!(refAnchor && tgtAnchor && target.model)
  const bounds = target.getBounds() ?? reference.getBounds()
  const boundsReport = bounds ? boundsData(bounds) : null
  const ground = boundsReport ? groundContactVerdict(boundsReport.minY) : null

  let delta = {
    positionM: null as [number, number, number] | null,
    positionDistanceM: null as number | null,
    rotationDeg: null as number | null,
    orientationKnown: false,
  }

  if (refAnchor && tgtAnchor) {
    const orientationKnown = refAnchor.hasOrientation && tgtAnchor.hasOrientation
    delta = {
      positionM: positionDelta(refAnchor.worldMatrix, tgtAnchor.worldMatrix),
      positionDistanceM: positionDistance(refAnchor.worldMatrix, tgtAnchor.worldMatrix),
      rotationDeg: orientationKnown ? rotationDeltaDeg(refAnchor.worldMatrix, tgtAnchor.worldMatrix) : null,
      orientationKnown,
    }
  }

  const status = invalidSelection
    ? 'ANCHOR_MISSING_AFTER_RELOAD' as const
    : hasPair
      ? computeAlignmentStatus(delta.positionDistanceM, delta.rotationDeg, delta.orientationKnown)
      : 'SINGLE_ASSET' as const

  const allAnchors = [...reference.anchors, ...target.anchors.filter((a) =>
    !reference.anchors.some((r) => r.def.name === a.def.name),
  )]

  const heldPreview = computeHeldPreviewState(reference, target)
  const previewWarnings: string[] = []
  if (heldPreview.mode === 'in-hand') {
    previewWarnings.push('in-hand-preview: mounted via game HELD_ATTACH / mountHeldToolOnSocket')
  } else if (heldPreview.reason) {
    previewWarnings.push(heldPreview.reason)
  }

  const report = buildAlignmentReport({
    mode: hasPair ? 'pair' : 'single',
    status,
    referenceAssetId: reference.entry?.id ?? null,
    targetAssetId: target.entry?.id ?? null,
    referenceUrl: reference.url,
    targetUrl: target.url,
    referenceAnchor: state.referenceAnchor,
    targetAnchor: state.targetAnchor,
    pose: state.pose === 'idle' ? 'clip:Idle@t=0' : 'rest',
    rendering: {
      mode: state.renderMode,
      preset: state.lightingPreset,
      timeOfDay: state.renderMode === 'game-like' ? state.timeOfDay : null,
      composerActive,
    },
    referenceRoot: reference.model ? rootTransform(reference.group) : null,
    targetRoot: target.model ? rootTransform(target.group) : null,
    delta,
    bounds: boundsReport,
    groundContact: ground,
    anchors: allAnchors.map(anchorToReport),
    issues: [
      ...reference.anchorIssues,
      ...target.anchorIssues,
      ...(invalidSelection ? [`selection-invalid: ${invalidSelection}`] : []),
    ],
    warnings: previewWarnings,
  })

  return formatAlignmentReport(report)
}

export function findAnchorByName(slot: AssetSlot, name: string | null): ResolvedAnchor | undefined {
  if (!name) return undefined
  return slot.anchors.find((a) => a.def.name === name)
}
