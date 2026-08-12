import { Group, Matrix4, type Object3D, Quaternion, Vector3 } from 'three'
import { type AnchorAlignMode, solveAnchorAlignment } from './alignAnchors'
import {
  discoverGlbAnchors,
  resolveAssetAnchors,
} from './anchorResolve'
import {
  type AssetAnchorDef,
  type AssetPrepare,
  mergeAnchorDefs,
} from './assetAnchors'

export type MountByAnchorPairInput = {
  characterRoot: Object3D
  tool: Object3D
  socket: Object3D
  referenceAnchorName: string
  targetAnchorName: string
  characterAnchorDefs: readonly AssetAnchorDef[]
  toolAnchorDefs: readonly AssetAnchorDef[]
  characterPrepare?: AssetPrepare
  toolPrepare?: AssetPrepare
  mode?: AnchorAlignMode
  /** Uniform scale applied on top of the solved mount (HELD_ATTACH.scale equivalent). */
  extraScale?: number
}

const _socketInv = new Matrix4()
const _world = new Matrix4()

/**
 * Parent `tool` under `socket` so `targetAnchorName` on the tool aligns to
 * `referenceAnchorName` on the character. Returns the mount group, or `null`
 * when either anchor is missing.
 */
export function mountByAnchorPair(input: MountByAnchorPairInput): Object3D | null {
  const {
    characterRoot,
    tool,
    socket,
    referenceAnchorName,
    targetAnchorName,
    characterAnchorDefs,
    toolAnchorDefs,
    characterPrepare,
    toolPrepare,
    mode = 'frame',
    extraScale = 1,
  } = input

  characterRoot.updateMatrixWorld(true)
  tool.updateMatrixWorld(true)

  const charGlb = discoverGlbAnchors(characterRoot)
  const charMerged = mergeAnchorDefs(charGlb.defs, characterAnchorDefs)
  const charResolved = resolveAssetAnchors(characterRoot, charMerged.defs, {
    prepare: characterPrepare,
    glbNames: new Set(charGlb.defs.map((d) => d.name)),
    metadataNames: new Set(characterAnchorDefs.map((d) => d.name)),
  })

  const toolGlb = discoverGlbAnchors(tool)
  const toolMerged = mergeAnchorDefs(toolGlb.defs, toolAnchorDefs)
  const toolResolved = resolveAssetAnchors(tool, toolMerged.defs, {
    prepare: toolPrepare,
    glbNames: new Set(toolGlb.defs.map((d) => d.name)),
    metadataNames: new Set(toolAnchorDefs.map((d) => d.name)),
  })

  const refAnchor = charResolved.anchors.find((a) => a.def.name === referenceAnchorName)
  const tgtAnchor = toolResolved.anchors.find((a) => a.def.name === targetAnchorName)
  if (!refAnchor || !tgtAnchor) return null

  const mount = new Group()
  mount.add(tool)

  const solved = solveAnchorAlignment({
    referenceAnchorWorld: refAnchor.worldMatrix,
    targetAnchorLocal: tgtAnchor.localMatrix,
    targetRoot: {
      position: new Vector3(),
      quaternion: new Quaternion(),
      scale: new Vector3(1, 1, 1),
    },
    mode,
  })

  if (extraScale !== 1) {
    mount.scale.setScalar(extraScale)
  }

  _world.compose(solved.position, solved.quaternion, mount.scale)
  socket.updateWorldMatrix(true, false)
  _socketInv.copy(socket.matrixWorld).invert()
  _world.premultiply(_socketInv)
  _world.decompose(mount.position, mount.quaternion, mount.scale)

  socket.add(mount)
  return mount
}
