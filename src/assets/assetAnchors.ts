export type AnchorType = 'origin' | 'attachment' | 'grip' | 'mount' | 'interaction'
export type AnchorSpace = 'assetLocal' | 'node'

export type AssetPrepare =
  | { mode: 'height', value: number }
  | { mode: 'fitMax', value: number }
  | { mode: 'none' }

export type AssetAnchorDef = {
  /** Stable, unique per asset. Never a generated runtime id. */
  name: string
  type?: AnchorType
  /** Node/bone name, or an alias list (e.g. Quaternius + Mixamo wrist names). */
  node?: string | readonly string[]
  /** Defaults to 'node' when `node` is set, else 'assetLocal'. */
  space?: AnchorSpace
  /** Meters in `space`. Default [0, 0, 0]. */
  position?: readonly [number, number, number]
  /** Euler XYZ radians in `space`. Absent = inherit the node frame / identity. */
  rotation?: readonly [number, number, number]
  /** For `assetLocal` defs: the normalization the numbers were authored against. */
  authoredFor?: AssetPrepare
  note?: string
}

export const ANCHOR_ORIENTATION_REQUIRED: readonly AnchorType[] = ['attachment', 'grip', 'mount']

export type AnchorIssueKind =
  | 'invalid-name'
  | 'duplicate-name'
  | 'missing-node'
  | 'ambiguous-node'
  | 'missing-orientation'
  | 'non-uniform-node-scale'
  | 'prepare-mismatch'
  | 'override-shadowed'
  | 'selection-invalid'

export type AnchorIssue = {
  kind: AnchorIssueKind
  anchorName?: string
  message: string
}

const ANCHOR_NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/

export function isValidAnchorName(name: string): boolean {
  return ANCHOR_NAME_RE.test(name)
}

/** `SV_Grip.001` → `grip`; returns null when the node is not an anchor. */
export function normalizeGlbAnchorName(nodeName: string): string | null {
  const trimmed = nodeName.trim()
  if (!/^sv_/i.test(trimmed)) return null
  const withoutPrefix = trimmed.slice(3)
  const withoutSuffix = withoutPrefix.replace(/\.\d+$/, '')
  const normalized = withoutSuffix.toLowerCase()
  return isValidAnchorName(normalized) ? normalized : null
}

export function defaultAnchorSpace(def: AssetAnchorDef): AnchorSpace {
  if (def.space) return def.space
  return def.node ? 'node' : 'assetLocal'
}

export function prepareMatches(
  authored: AssetPrepare | undefined,
  active: AssetPrepare,
): boolean {
  if (!authored) return true
  if (authored.mode !== active.mode) return false
  if (authored.mode === 'none' || active.mode === 'none') return authored.mode === active.mode
  return Math.abs(authored.value - active.value) < 1e-6
}

export function mergeAnchorDefs(
  discovered: readonly AssetAnchorDef[],
  metadata: readonly AssetAnchorDef[],
): { defs: AssetAnchorDef[], issues: AnchorIssue[] } {
  const issues: AnchorIssue[] = []
  const byName = new Map<string, AssetAnchorDef>()

  for (const def of discovered) {
    byName.set(def.name, def)
  }

  for (const def of metadata) {
    if (byName.has(def.name)) {
      issues.push({
        kind: 'override-shadowed',
        anchorName: def.name,
        message: `Metadata anchor "${def.name}" overrides a GLB SV_ node of the same name.`,
      })
    }
    byName.set(def.name, def)
  }

  return { defs: [...byName.values()], issues }
}

export function validateAnchorDefs(
  defs: readonly AssetAnchorDef[],
  prepare: AssetPrepare,
): AnchorIssue[] {
  const issues: AnchorIssue[] = []
  const seen = new Set<string>()

  for (const def of defs) {
    if (!isValidAnchorName(def.name)) {
      issues.push({
        kind: 'invalid-name',
        anchorName: def.name,
        message: `Anchor name "${def.name}" does not match the required pattern.`,
      })
      continue
    }
    if (seen.has(def.name)) {
      issues.push({
        kind: 'duplicate-name',
        anchorName: def.name,
        message: `Duplicate anchor name "${def.name}".`,
      })
    } else {
      seen.add(def.name)
    }

    const type = def.type ?? (def.name === 'origin' ? 'origin' : undefined)
    if (type && ANCHOR_ORIENTATION_REQUIRED.includes(type) && !def.rotation) {
      issues.push({
        kind: 'missing-orientation',
        anchorName: def.name,
        message: `Anchor "${def.name}" (${type}) requires an authored orientation.`,
      })
    }

    if (def.authoredFor && defaultAnchorSpace(def) === 'assetLocal' && !prepareMatches(def.authoredFor, prepare)) {
      issues.push({
        kind: 'prepare-mismatch',
        anchorName: def.name,
        message: `Anchor "${def.name}" was authored for a different prepare value than the active one.`,
      })
    }
  }

  return issues
}

/** Synthetic origin anchor — always present for diagnostics. */
export const ORIGIN_ANCHOR_DEF: AssetAnchorDef = {
  name: 'origin',
  type: 'origin',
  space: 'assetLocal',
  position: [0, 0, 0],
}
