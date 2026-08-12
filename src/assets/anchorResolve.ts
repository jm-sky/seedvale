import {
  Bone,
  Euler,
  Matrix4,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three'
import {
  type AnchorIssue,
  type AssetAnchorDef,
  type AssetPrepare,
  defaultAnchorSpace,
  normalizeGlbAnchorName,
  ORIGIN_ANCHOR_DEF,
  validateAnchorDefs,
} from './assetAnchors'

export type ResolvedAnchor = {
  def: AssetAnchorDef
  /** Asset root, or the matched node/bone. */
  parent: Object3D
  /** Anchor frame relative to the asset root (normalization included). */
  localMatrix: Matrix4
  /** Anchor frame in world space (nested nodes, bones, pose, instance TRS). */
  worldMatrix: Matrix4
  hasOrientation: boolean
  source: 'glb' | 'metadata' | 'synthetic'
}

const _pos = new Vector3()
const _quat = new Quaternion()
const _scale = new Vector3()
const _euler = new Euler()
const _offset = new Vector3()
const _nodeScale = new Vector3()
const _local = new Matrix4()
const _rootInv = new Matrix4()
const _tmp = new Matrix4()

export function findAnchorNode(root: Object3D, names: string | readonly string[]): {
  node: Object3D | null
  matches: number
} {
  const aliases = typeof names === 'string' ? [names] : [...names]
  let bone: Object3D | null = null
  let any: Object3D | null = null
  let matches = 0
  root.traverse((obj) => {
    if (!aliases.includes(obj.name)) return
    matches++
    if (!any) any = obj
    if (obj instanceof Bone && !bone) bone = obj
  })
  return { node: bone ?? any, matches }
}

export function discoverGlbAnchors(root: Object3D): { defs: AssetAnchorDef[], issues: AnchorIssue[] } {
  const issues: AnchorIssue[] = []
  const byName = new Map<string, AssetAnchorDef>()

  root.traverse((obj) => {
    const normalized = normalizeGlbAnchorName(obj.name)
    if (!normalized) return
    if (byName.has(normalized)) {
      issues.push({
        kind: 'duplicate-name',
        anchorName: normalized,
        message: `Multiple GLB nodes normalize to anchor name "${normalized}".`,
      })
      return
    }
    byName.set(normalized, {
      name: normalized,
      node: obj.name,
      space: 'node',
    })
  })

  return { defs: [...byName.values()], issues }
}

function composeAnchorMatrix(
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] | undefined,
  inheritMatrix: Matrix4 | null,
): { matrix: Matrix4, hasOrientation: boolean } {
  const matrix = new Matrix4()
  if (inheritMatrix) {
    matrix.copy(inheritMatrix)
  }
  _pos.set(position[0], position[1], position[2])
  matrix.setPosition(_pos)
  let hasOrientation = false
  if (rotation) {
    _euler.set(rotation[0], rotation[1], rotation[2])
    _quat.setFromEuler(_euler)
    _tmp.makeRotationFromQuaternion(_quat)
    matrix.multiply(_tmp)
    hasOrientation = true
  } else if (inheritMatrix) {
    inheritMatrix.decompose(_pos, _quat, _scale)
    hasOrientation = !(_quat.x === 0 && _quat.y === 0 && _quat.z === 0 && _quat.w === 1)
  }
  return { matrix, hasOrientation }
}

function resolveOneAnchor(
  root: Object3D,
  def: AssetAnchorDef,
  source: ResolvedAnchor['source'],
): { anchor: ResolvedAnchor | null, issues: AnchorIssue[] } {
  const issues: AnchorIssue[] = []
  const space = defaultAnchorSpace(def)
  const position = def.position ?? [0, 0, 0] as const
  const rotation = def.rotation

  root.updateMatrixWorld(true)

  if (space === 'node') {
    const nodeNames = def.node
    if (!nodeNames) {
      issues.push({
        kind: 'missing-node',
        anchorName: def.name,
        message: `Anchor "${def.name}" requires a node but none was specified.`,
      })
      return { anchor: null, issues }
    }
    const { node, matches } = findAnchorNode(root, nodeNames)
    if (!node) {
      issues.push({
        kind: 'missing-node',
        anchorName: def.name,
        message: `Anchor "${def.name}" node not found in asset.`,
      })
      return { anchor: null, issues }
    }
    if (matches > 1) {
      issues.push({
        kind: 'ambiguous-node',
        anchorName: def.name,
        message: `Anchor "${def.name}" matched ${matches} nodes.`,
      })
    }

    node.updateWorldMatrix(true, false)
    node.getWorldScale(_nodeScale)
    const sx = Math.max(_nodeScale.x, 1e-6)
    const sy = Math.max(_nodeScale.y, 1e-6)
    const sz = Math.max(_nodeScale.z, 1e-6)
    const uniform =
      Math.abs(sx - sy) < 1e-3 && Math.abs(sy - sz) < 1e-3
    if (!uniform) {
      issues.push({
        kind: 'non-uniform-node-scale',
        anchorName: def.name,
        message: `Anchor "${def.name}" node has non-uniform world scale — meter offset is approximate.`,
      })
    }

    _local.identity()
    _offset.set(position[0] / sx, position[1] / sy, position[2] / sz)
    _local.setPosition(_offset)
    if (rotation) {
      _euler.set(rotation[0], rotation[1], rotation[2])
      _quat.setFromEuler(_euler)
      _tmp.makeRotationFromQuaternion(_quat)
      _local.multiply(_tmp)
    } else {
      _tmp.extractRotation(node.matrixWorld)
      _local.multiply(_tmp)
    }

    const worldMatrix = _local.clone()
    worldMatrix.premultiply(node.matrixWorld)

    _rootInv.copy(root.matrixWorld).invert()
    const localMatrix = worldMatrix.clone().premultiply(_rootInv)

    const hasOrient = !!rotation || (def.type ? def.type !== 'origin' && def.type !== 'interaction' : false)
    return {
      anchor: {
        def,
        parent: node,
        localMatrix,
        worldMatrix,
        hasOrientation: hasOrient,
        source,
      },
      issues,
    }
  }

  const { matrix: localMatrix, hasOrientation } = composeAnchorMatrix(position, rotation, null)
  const worldMatrix = localMatrix.clone().premultiply(root.matrixWorld)
  return {
    anchor: {
      def,
      parent: root,
      localMatrix,
      worldMatrix,
      hasOrientation: !!rotation || hasOrientation,
      source,
    },
    issues,
  }
}

export function resolveAssetAnchors(
  root: Object3D,
  defs: readonly AssetAnchorDef[],
  opts: {
    prepare?: AssetPrepare
    glbNames?: ReadonlySet<string>
    metadataNames?: ReadonlySet<string>
  } = {},
): { anchors: ResolvedAnchor[], issues: AnchorIssue[] } {
  const issues: AnchorIssue[] = []
  if (opts.prepare) {
    issues.push(...validateAnchorDefs(defs, opts.prepare))
  }

  const anchors: ResolvedAnchor[] = []
  const hasOrigin = defs.some((d) => d.name === 'origin')
  const allDefs = hasOrigin ? defs : [ORIGIN_ANCHOR_DEF, ...defs]

  for (const def of allDefs) {
    let source: ResolvedAnchor['source'] = 'metadata'
    if (def.name === 'origin' && def === ORIGIN_ANCHOR_DEF) source = 'synthetic'
    else if (opts.metadataNames?.has(def.name)) source = 'metadata'
    else if (opts.glbNames?.has(def.name)) source = 'glb'

    const result = resolveOneAnchor(root, def, source)
    issues.push(...result.issues)
    if (result.anchor) anchors.push(result.anchor)
  }

  return { anchors, issues }
}

export function refreshResolvedAnchors(root: Object3D, anchors: ResolvedAnchor[]): void {
  root.updateMatrixWorld(true)
  _rootInv.copy(root.matrixWorld).invert()
  for (const anchor of anchors) {
    if (defaultAnchorSpace(anchor.def) === 'node' && anchor.parent !== root) {
      anchor.parent.updateWorldMatrix(true, false)
      const space = defaultAnchorSpace(anchor.def)
      const position = anchor.def.position ?? [0, 0, 0] as const
      const rotation = anchor.def.rotation
      if (space === 'node') {
        anchor.parent.getWorldScale(_nodeScale)
        const sx = Math.max(_nodeScale.x, 1e-6)
        const sy = Math.max(_nodeScale.y, 1e-6)
        const sz = Math.max(_nodeScale.z, 1e-6)
        _local.identity()
        _offset.set(position[0] / sx, position[1] / sy, position[2] / sz)
        _local.setPosition(_offset)
        if (rotation) {
          _euler.set(rotation[0], rotation[1], rotation[2])
          _quat.setFromEuler(_euler)
          _tmp.makeRotationFromQuaternion(_quat)
          _local.multiply(_tmp)
        } else {
          _tmp.extractRotation(anchor.parent.matrixWorld)
          _local.multiply(_tmp)
        }
        anchor.worldMatrix.copy(_local).premultiply(anchor.parent.matrixWorld)
      }
    } else {
      anchor.worldMatrix.copy(anchor.localMatrix).premultiply(root.matrixWorld)
    }
    anchor.localMatrix.copy(anchor.worldMatrix).premultiply(_rootInv)
  }
}
