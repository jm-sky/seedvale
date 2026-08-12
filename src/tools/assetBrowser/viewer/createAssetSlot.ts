import {
  AnimationMixer,
  Box3,
  Box3Helper,
  Color,
  Group,
  type Material,
  type Mesh,
  type Object3D,
  Vector3,
} from 'three'
import type { AssetIndexEntry, AssetPrepare } from '../../../assets/assetIndex'
import { discoverGlbAnchors, refreshResolvedAnchors, resolveAssetAnchors, type ResolvedAnchor } from '../../../assets/anchorResolve'
import { mergeAnchorDefs } from '../../../assets/assetAnchors'
import {
  disposeObject3D,
  invalidateGltf,
  loadGltf,
  loadGltfAsset,
  prepareProp,
  preparePropFitMax,
} from '../../../assets/loadGltf'
import { type AnchorGizmoGroup, createAnchorGizmos } from './createAnchorGizmos'

export type AssetSlot = {
  role: 'reference' | 'target'
  group: Group
  model: Object3D | null
  entry: AssetIndexEntry | null
  url: string | null
  reloadCounter: number
  anchors: ResolvedAnchor[]
  anchorIssues: string[]
  gizmos: AnchorGizmoGroup | null
  bboxHelper: Box3Helper | null
  mixer: AnimationMixer | null
  load: (entry: AssetIndexEntry | null, url?: string) => Promise<void>
  reload: () => Promise<void>
  unload: () => void
  setPose: (pose: 'rest' | 'idle') => void
  getBounds: () => Box3 | null
  refreshAnchors: () => void
  dispose: () => void
}

const _box = new Box3()
const _size = new Vector3()
const _center = new Vector3()

function applyPrepare(object: Object3D, prepare: AssetPrepare): void {
  if (prepare.mode === 'height') prepareProp(object, prepare.value)
  else if (prepare.mode === 'fitMax') preparePropFitMax(object, prepare.value)
}

export function createAssetSlot(role: 'reference' | 'target', scene: Group): AssetSlot {
  const group = new Group()
  group.name = `${role}-slot`
  scene.add(group)

  let model: Object3D | null = null
  let entry: AssetIndexEntry | null = null
  let url: string | null = null
  let reloadCounter = 0
  let anchors: ResolvedAnchor[] = []
  let anchorIssues: string[] = []
  let gizmos: AnchorGizmoGroup | null = null
  let bboxHelper: Box3Helper | null = null
  let mixer: AnimationMixer | null = null
  let clips: import('three').AnimationClip[] = []

  const refreshBbox = () => {
    if (bboxHelper) {
      group.remove(bboxHelper)
      bboxHelper.geometry.dispose()
      ;(bboxHelper.material as Material).dispose()
      bboxHelper = null
    }
    if (!model) return
    _box.setFromObject(group)
    bboxHelper = new Box3Helper(_box, new Color(role === 'reference' ? 0x4a9fd8 : 0xe0a040))
    group.add(bboxHelper)
  }

  const refreshGizmos = () => {
    gizmos?.dispose()
    gizmos = createAnchorGizmos(anchors, role)
    if (gizmos) group.add(gizmos.group)
  }

  const resolveAnchors = () => {
    if (!model || !entry) {
      anchors = []
      anchorIssues = []
      return
    }
    const glb = discoverGlbAnchors(model)
    const merged = mergeAnchorDefs(glb.defs, entry.anchors)
    const glbNames = new Set(glb.defs.map((d) => d.name))
    const metadataNames = new Set(entry.anchors.map((d) => d.name))
    const result = resolveAssetAnchors(model, merged.defs, {
      prepare: entry.prepare,
      glbNames,
      metadataNames,
    })
    anchors = result.anchors
    anchorIssues = [
      ...glb.issues.map((i) => i.message),
      ...merged.issues.map((i) => i.message),
      ...result.issues.map((i) => i.message),
    ]
    refreshGizmos()
  }

  const slot: AssetSlot = {
    role,
    group,
    get model() { return model },
    get entry() { return entry },
    get url() { return url },
    get reloadCounter() { return reloadCounter },
    get anchors() { return anchors },
    get anchorIssues() { return anchorIssues },
    get gizmos() { return gizmos },
    get bboxHelper() { return bboxHelper },
    get mixer() { return mixer },
    async load(nextEntry, customUrl) {
      slot.unload()
      entry = nextEntry
      url = customUrl ?? nextEntry?.url ?? null
      if (!url || !nextEntry) return

      const fetchUrl = reloadCounter > 0 ? `${url}?r=${reloadCounter}` : url
      const loaded = nextEntry.skinned
        ? await loadGltfAsset(fetchUrl)
        : { root: await loadGltf(fetchUrl), animations: [] as import('three').AnimationClip[] }

      model = loaded.root
      clips = loaded.animations
      applyPrepare(model, nextEntry.prepare)
      if (nextEntry.id === 'held:wooden_torch') model.rotation.x = Math.PI / 2

      group.add(model)
      resolveAnchors()
      refreshBbox()
      mixer = clips.length ? new AnimationMixer(model) : null
    },
    async reload() {
      if (!url) return
      invalidateGltf(url)
      reloadCounter++
      const saved = entry
      const savedUrl = url
      slot.unload()
      await slot.load(saved, savedUrl)
    },
    unload() {
      if (mixer) {
        mixer.stopAllAction()
        mixer = null
      }
      gizmos?.dispose()
      gizmos = null
      if (bboxHelper) {
        group.remove(bboxHelper)
        bboxHelper.geometry.dispose()
        ;(bboxHelper.material as Material).dispose()
        bboxHelper = null
      }
      if (model) {
        group.remove(model)
        disposeObject3D(model)
        model = null
      }
      anchors = []
      anchorIssues = []
      clips = []
    },
    setPose(pose) {
      if (!model || !mixer || !clips.length) return
      mixer.stopAllAction()
      if (pose === 'rest') return
      const idle = clips.find((c) => /idle/i.test(c.name)) ?? clips[0]
      if (!idle) return
      const action = mixer.clipAction(idle)
      action.play()
      mixer.setTime(0)
      mixer.update(0)
      slot.refreshAnchors()
    },
    getBounds() {
      if (!model) return null
      return _box.setFromObject(group)
    },
    refreshAnchors() {
      if (!model) return
      model.updateMatrixWorld(true)
      refreshResolvedAnchors(model, anchors)
      gizmos?.update(anchors)
    },
    dispose() {
      slot.unload()
      group.removeFromParent()
    },
  }

  return slot
}

export function boundsData(box: Box3): {
  min: [number, number, number]
  max: [number, number, number]
  size: [number, number, number]
  center: [number, number, number]
  minY: number
} {
  box.getSize(_size)
  box.getCenter(_center)
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
    size: [_size.x, _size.y, _size.z],
    center: [_center.x, _center.y, _center.z],
    minY: box.min.y,
  }
}

export function setWireframe(root: Object3D | null, enabled: boolean): void {
  if (!root) return
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      if ('wireframe' in mat) (mat as Material & { wireframe: boolean }).wireframe = enabled
    }
  })
}
