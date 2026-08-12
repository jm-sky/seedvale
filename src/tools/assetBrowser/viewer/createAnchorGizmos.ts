import {
  AxesHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import type { ResolvedAnchor } from '../../../assets/anchorResolve'

export type AnchorGizmoGroup = {
  group: Group
  update: (anchors: ResolvedAnchor[]) => void
  dispose: () => void
}

const REF_COLOR = 0x4a9fd8
const TGT_COLOR = 0xe0a040

export function createAnchorGizmos(
  anchors: ResolvedAnchor[],
  role: 'reference' | 'target',
): AnchorGizmoGroup | null {
  if (!anchors.length) return null
  const group = new Group()
  group.name = `${role}-anchor-gizmos`
  const markerGeo = new SphereGeometry(1, 8, 8)
  const baseColor = role === 'reference' ? REF_COLOR : TGT_COLOR
  const parts: Object3D[] = []
  const _pos = new Vector3()
  const _quat = new Quaternion()
  const _scale = new Vector3()

  for (const anchor of anchors) {
    const color = anchor.def.name === 'origin' ? 0x888888 : baseColor
    const mat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
    const marker = new Mesh(markerGeo, mat)
    marker.scale.setScalar(0.04)
    group.add(marker)
    parts.push(marker)

    const axes = new AxesHelper(0.12)
    axes.visible = anchor.hasOrientation
    group.add(axes)
    parts.push(axes)
  }

  const update = (next: ResolvedAnchor[]) => {
    let i = 0
    for (const anchor of next) {
      const marker = parts[i++] as Mesh
      const axes = parts[i++] as AxesHelper
      if (!marker || !axes) break
      anchor.worldMatrix.decompose(_pos, _quat, _scale)
      marker.position.copy(_pos)
      marker.quaternion.copy(_quat)
      axes.position.copy(_pos)
      axes.quaternion.copy(_quat)
      axes.visible = anchor.hasOrientation
    }
  }

  update(anchors)

  return {
    group,
    update,
    dispose() {
      markerGeo.dispose()
      group.traverse((obj) => {
        const mesh = obj as Mesh
        if (mesh.isMesh) {
          const mat = mesh.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat?.dispose()
        }
      })
      group.removeFromParent()
    },
  }
}
