import { type Object3D, Quaternion, Vector3 } from 'three'
import type { InteractionQueueConfig } from '../simulation/interactionQueue'
import {
  type AssetAnchorDef,
  type AssetPrepare,
  mergeAnchorDefs,
} from './assetAnchors'
import { discoverGlbAnchors, resolveAssetAnchors } from './anchorResolve'

export type ResolvedInteractionPoint = {
  anchor: Vector3
  /** Unit facing on the XZ plane from anchor +Z; defaults to +Z world. */
  lineDir: { x: number, z: number }
  source: 'anchor' | 'fallback'
}

const _forward = new Vector3()
const _pos = new Vector3()

/**
 * Resolve an `interaction` anchor on a prop, or fall back to the supplied
 * queue config anchor / lineDir.
 */
export function resolveInteractionPoint(
  root: Object3D,
  anchorDefs: readonly AssetAnchorDef[],
  fallback: Pick<InteractionQueueConfig, 'anchor' | 'lineDir'>,
  opts: { prepare?: AssetPrepare, anchorName?: string } = {},
): ResolvedInteractionPoint {
  const name = opts.anchorName ?? 'interaction'
  const glb = discoverGlbAnchors(root)
  const merged = mergeAnchorDefs(glb.defs, anchorDefs)
  const def = merged.defs.find((d) => d.name === name)
  if (!def) {
    return {
      anchor: new Vector3(fallback.anchor.x, fallback.anchor.y, fallback.anchor.z),
      lineDir: { ...fallback.lineDir },
      source: 'fallback',
    }
  }

  const { anchors } = resolveAssetAnchors(root, [def], {
    prepare: opts.prepare,
    glbNames: new Set(glb.defs.map((d) => d.name)),
    metadataNames: new Set(anchorDefs.map((d) => d.name)),
  })
  const resolved = anchors.find((a) => a.def.name === name)
  if (!resolved) {
    return {
      anchor: new Vector3(fallback.anchor.x, fallback.anchor.y, fallback.anchor.z),
      lineDir: { ...fallback.lineDir },
      source: 'fallback',
    }
  }

  resolved.worldMatrix.decompose(_pos, new Quaternion(), new Vector3())
  _forward.set(0, 0, 1).applyMatrix4(resolved.worldMatrix)
  _forward.y = 0
  const len = Math.hypot(_forward.x, _forward.z)
  const lineDir = len > 1e-6
    ? { x: _forward.x / len, z: _forward.z / len }
    : { ...fallback.lineDir }

  return { anchor: _pos.clone(), lineDir, source: 'anchor' }
}

/** Build queue config fields from a resolved interaction point. */
export function interactionQueueAnchorFromResolved(
  point: ResolvedInteractionPoint,
  overrides: Omit<InteractionQueueConfig, 'anchor' | 'lineDir'>,
): Pick<InteractionQueueConfig, 'anchor' | 'lineDir'> & typeof overrides {
  return {
    anchor: { x: point.anchor.x, y: point.anchor.y, z: point.anchor.z },
    lineDir: point.lineDir,
    ...overrides,
  }
}
