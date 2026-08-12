export const ALIGNMENT_REPORT_VERSION = 1
export const ALIGNED_POSITION_EPSILON_M = 0.001
export const ALIGNED_ROTATION_EPSILON_DEG = 0.5
export const GROUND_CONTACT_EPSILON_M = 0.005

export type AlignmentStatus = 'ALIGNED' | 'MISALIGNED' | 'ANCHOR_MISSING_AFTER_RELOAD' | 'SINGLE_ASSET'

export type ReportAnchor = {
  name: string
  type: string | null
  source: string
  space: string
  node: string | null
  hasOrientation: boolean
  localPosition: [number, number, number]
  localRotationDeg: [number, number, number] | null
  worldPosition: [number, number, number]
  worldRotationDeg: [number, number, number] | null
}

export type AlignmentReport = {
  version: number
  mode: 'pair' | 'single'
  status: AlignmentStatus
  referenceAssetId: string | null
  targetAssetId: string | null
  referenceUrl: string | null
  targetUrl: string | null
  referenceAnchor: string | null
  targetAnchor: string | null
  pose: string
  rendering: {
    mode: string
    preset: string
    timeOfDay: number | null
    composerActive: boolean
  }
  referenceRoot: {
    position: [number, number, number]
    rotationDeg: [number, number, number]
    scale: [number, number, number]
  } | null
  targetRoot: {
    position: [number, number, number]
    rotationDeg: [number, number, number]
    scale: [number, number, number]
  } | null
  delta: {
    positionM: [number, number, number] | null
    positionDistanceM: number | null
    rotationDeg: number | null
    orientationKnown: boolean
  }
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
    size: [number, number, number]
    center: [number, number, number]
    minY: number
  } | null
  groundContact: {
    verdict: 'ok' | 'floating' | 'sunken'
    offsetM: number
  } | null
  anchors: ReportAnchor[]
  issues: string[]
  warnings: string[]
}

export type AlignmentReportInput = {
  mode: 'pair' | 'single'
  status: AlignmentStatus
  referenceAssetId?: string | null
  targetAssetId?: string | null
  referenceUrl?: string | null
  targetUrl?: string | null
  referenceAnchor?: string | null
  targetAnchor?: string | null
  pose?: string
  rendering?: AlignmentReport['rendering']
  referenceRoot?: AlignmentReport['referenceRoot']
  targetRoot?: AlignmentReport['targetRoot']
  delta?: AlignmentReport['delta']
  bounds?: AlignmentReport['bounds']
  groundContact?: AlignmentReport['groundContact']
  anchors?: ReportAnchor[]
  issues?: string[]
  warnings?: string[]
}

function fmt3(n: number): string {
  return n.toFixed(3)
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

function fmtPos(p: [number, number, number]): string {
  return `[${fmt3(p[0])}, ${fmt3(p[1])}, ${fmt3(p[2])}]`
}

function fmtRot(r: [number, number, number] | null): string {
  if (!r) return 'null'
  return `[${fmt1(r[0])}, ${fmt1(r[1])}, ${fmt1(r[2])}]`
}

export function buildAlignmentReport(input: AlignmentReportInput): AlignmentReport {
  return {
    version: ALIGNMENT_REPORT_VERSION,
    mode: input.mode,
    status: input.status,
    referenceAssetId: input.referenceAssetId ?? null,
    targetAssetId: input.targetAssetId ?? null,
    referenceUrl: input.referenceUrl ?? null,
    targetUrl: input.targetUrl ?? null,
    referenceAnchor: input.referenceAnchor ?? null,
    targetAnchor: input.targetAnchor ?? null,
    pose: input.pose ?? 'rest',
    rendering: input.rendering ?? {
      mode: 'diagnostic',
      preset: 'alignment',
      timeOfDay: null,
      composerActive: false,
    },
    referenceRoot: input.referenceRoot ?? null,
    targetRoot: input.targetRoot ?? null,
    delta: input.delta ?? {
      positionM: null,
      positionDistanceM: null,
      rotationDeg: null,
      orientationKnown: false,
    },
    bounds: input.bounds ?? null,
    groundContact: input.groundContact ?? null,
    anchors: input.anchors ?? [],
    issues: input.issues ?? [],
    warnings: input.warnings ?? [],
  }
}

export function formatAlignmentReport(report: AlignmentReport): string {
  const lines: string[] = []
  lines.push(`alignment_report_version: ${report.version}`)
  lines.push(`mode: ${report.mode}`)
  lines.push(`status: ${report.status}`)
  lines.push(`pose: ${report.pose}`)
  lines.push('')
  lines.push('rendering:')
  lines.push(`  mode: ${report.rendering.mode}`)
  lines.push(`  preset: ${report.rendering.preset}`)
  lines.push(`  time_of_day: ${report.rendering.timeOfDay ?? 'null'}`)
  lines.push(`  composer_active: ${report.rendering.composerActive}`)
  lines.push('')

  if (report.referenceAssetId) {
    lines.push(`reference_asset: ${report.referenceAssetId}`)
    lines.push(`reference_url: ${report.referenceUrl ?? 'null'}`)
    lines.push(`reference_anchor: ${report.referenceAnchor ?? 'null'}`)
  }
  if (report.targetAssetId) {
    lines.push(`target_asset: ${report.targetAssetId}`)
    lines.push(`target_url: ${report.targetUrl ?? 'null'}`)
    lines.push(`target_anchor: ${report.targetAnchor ?? 'null'}`)
  }
  lines.push('')

  if (report.referenceRoot) {
    lines.push('reference_root_transform:')
    lines.push(`  position_m: ${fmtPos(report.referenceRoot.position)}`)
    lines.push(`  rotation_deg: ${fmtRot(report.referenceRoot.rotationDeg)}`)
    lines.push(`  scale: ${fmtPos(report.referenceRoot.scale)}`)
    lines.push('')
  }

  if (report.targetRoot) {
    lines.push('target_root_transform:')
    lines.push(`  position_m: ${fmtPos(report.targetRoot.position)}`)
    lines.push(`  rotation_deg: ${fmtRot(report.targetRoot.rotationDeg)}`)
    lines.push(`  scale: ${fmtPos(report.targetRoot.scale)}`)
    lines.push('')
  }

  if (report.delta.positionM) {
    lines.push('anchor_delta:')
    lines.push(`  position_m: ${fmtPos(report.delta.positionM)}`)
    lines.push(`  position_distance_m: ${report.delta.positionDistanceM !== null ? fmt3(report.delta.positionDistanceM) : 'null'}`)
    if (report.delta.orientationKnown) {
      lines.push(`  rotation_deg: ${report.delta.rotationDeg !== null ? fmt1(report.delta.rotationDeg) : 'null'}`)
    } else {
      lines.push('  rotation_deg: ORIENTATION_UNKNOWN')
    }
    lines.push('')
  }

  if (report.bounds) {
    lines.push('bounds:')
    lines.push(`  min_m: ${fmtPos(report.bounds.min)}`)
    lines.push(`  max_m: ${fmtPos(report.bounds.max)}`)
    lines.push(`  size_m: ${fmtPos(report.bounds.size)}`)
    lines.push(`  center_m: ${fmtPos(report.bounds.center)}`)
    lines.push(`  min_y_m: ${fmt3(report.bounds.minY)}`)
    lines.push('')
  }

  if (report.groundContact) {
    lines.push('ground_contact:')
    lines.push(`  verdict: ${report.groundContact.verdict}`)
    lines.push(`  offset_m: ${fmt3(report.groundContact.offsetM)}`)
    lines.push('')
  }

  lines.push('available_anchors:')
  for (const a of report.anchors) {
    lines.push(`  - name: ${a.name}`)
    lines.push(`    type: ${a.type ?? 'null'}`)
    lines.push(`    source: ${a.source}`)
    lines.push(`    space: ${a.space}`)
    lines.push(`    node: ${a.node ?? 'null'}`)
    lines.push(`    has_orientation: ${a.hasOrientation}`)
    lines.push(`    local_position_m: ${fmtPos(a.localPosition)}`)
    lines.push(`    local_rotation_deg: ${fmtRot(a.localRotationDeg)}`)
    lines.push(`    world_position_m: ${fmtPos(a.worldPosition)}`)
    lines.push(`    world_rotation_deg: ${fmtRot(a.worldRotationDeg)}`)
  }
  lines.push('')

  if (report.issues.length) {
    lines.push('issues:')
    for (const i of report.issues) lines.push(`  - ${i}`)
    lines.push('')
  }

  if (report.warnings.length) {
    lines.push('warnings:')
    for (const w of report.warnings) lines.push(`  - ${w}`)
    lines.push('')
  }

  return lines.join('\n').replace(/\n+$/, '\n')
}

export function alignmentReportToJson(report: AlignmentReport): string {
  return JSON.stringify(report, null, 2)
}

export function computeAlignmentStatus(
  positionDistanceM: number | null,
  rotationDeg: number | null,
  orientationKnown: boolean,
): AlignmentStatus {
  if (positionDistanceM === null) return 'SINGLE_ASSET'
  const posOk = positionDistanceM <= ALIGNED_POSITION_EPSILON_M
  const rotOk = !orientationKnown || rotationDeg === null || rotationDeg <= ALIGNED_ROTATION_EPSILON_DEG
  return posOk && rotOk ? 'ALIGNED' : 'MISALIGNED'
}

export function groundContactVerdict(minY: number): {
  verdict: 'ok' | 'floating' | 'sunken'
  offsetM: number
} {
  if (Math.abs(minY) <= GROUND_CONTACT_EPSILON_M) {
    return { verdict: 'ok', offsetM: minY }
  }
  return minY > 0
    ? { verdict: 'floating', offsetM: minY }
    : { verdict: 'sunken', offsetM: minY }
}
