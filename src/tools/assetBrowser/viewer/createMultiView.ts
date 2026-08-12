import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { WebGLRenderer } from 'three'

export type ViewId = 'front' | 'side' | 'top' | 'perspective'

export type ViewportDef = {
  id: ViewId
  label: string
  camera: OrthographicCamera | PerspectiveCamera
  controls: OrbitControls
  overlay: HTMLDivElement
  x: number
  y: number
  w: number
  h: number
}

const _target = new Vector3()

export function createMultiView(
  container: HTMLElement,
  _renderer: WebGLRenderer,
  aspect: number,
): {
  views: ViewportDef[]
  resize: (w: number, h: number) => void
  frameTargets: (bounds: { center: Vector3, radius: number } | null) => void
  dispose: () => void
} {
  const views: ViewportDef[] = [
    makeOrthoView('front', 'Front', container, 0, 0, 0, -1),
    makeOrthoView('side', 'Side', container, 1, 0, 0, 0),
    makeOrthoView('top', 'Top', container, 0, 1, 0, 0),
    makePerspectiveView('perspective', 'Perspective', container, aspect),
  ]

  for (const view of views) {
    if (view.camera instanceof OrthographicCamera) {
      view.controls.enableRotate = false
    }
    view.controls.addEventListener('change', () => {
      container.dispatchEvent(new CustomEvent('viewer-dirty'))
    })
  }

  const resize = (w: number, h: number) => {
    const halfW = Math.floor(w / 2)
    const halfH = Math.floor(h / 2)
    views[0]!.x = 0; views[0]!.y = halfH; views[0]!.w = halfW; views[0]!.h = halfH
    views[1]!.x = halfW; views[1]!.y = halfH; views[1]!.w = halfW; views[1]!.h = halfH
    views[2]!.x = 0; views[2]!.y = 0; views[2]!.w = halfW; views[2]!.h = halfH
    views[3]!.x = halfW; views[3]!.y = 0; views[3]!.w = halfW; views[3]!.h = halfH

    for (const view of views) {
      view.overlay.style.left = `${view.x}px`
      view.overlay.style.top = `${(h - view.y - view.h)}px`
      view.overlay.style.width = `${view.w}px`
      view.overlay.style.height = `${view.h}px`
      const cam = view.camera
      if (cam instanceof OrthographicCamera) {
        const frustum = 3
        cam.left = -frustum * (view.w / view.h)
        cam.right = frustum * (view.w / view.h)
        cam.top = frustum
        cam.bottom = -frustum
        cam.updateProjectionMatrix()
      } else {
        cam.aspect = view.w / view.h
        cam.updateProjectionMatrix()
      }
      view.controls.update()
    }
  }

  const frameTargets = (bounds: { center: Vector3, radius: number } | null) => {
    if (!bounds) return
    _target.copy(bounds.center)
    const dist = Math.max(bounds.radius * 2.5, 1.5)
    for (const view of views) {
      view.controls.target.copy(_target)
      if (view.id === 'front') view.camera.position.set(_target.x, _target.y, _target.z + dist)
      else if (view.id === 'side') view.camera.position.set(_target.x + dist, _target.y, _target.z)
      else if (view.id === 'top') view.camera.position.set(_target.x, _target.y + dist, _target.z)
      else view.camera.position.set(_target.x + dist * 0.7, _target.y + dist * 0.5, _target.z + dist * 0.7)
      view.camera.lookAt(_target)
      view.controls.update()
    }
  }

  return {
    views,
    resize,
    frameTargets,
    dispose() {
      for (const view of views) {
        view.controls.dispose()
        view.overlay.remove()
      }
    },
  }
}

function makeOverlay(container: HTMLElement, label: string): HTMLDivElement {
  const overlay = document.createElement('div')
  overlay.style.position = 'absolute'
  overlay.style.touchAction = 'none'
  overlay.style.zIndex = '2'
  overlay.title = label
  container.appendChild(overlay)
  return overlay
}

function makeOrthoView(
  id: ViewId,
  label: string,
  container: HTMLElement,
  dirX: number,
  dirY: number,
  dirZ: number,
  upY: number,
): ViewportDef {
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 200)
  camera.position.set(dirX * 5, dirY * 5 + (upY ? 0 : 2), dirZ * 5)
  camera.up.set(0, upY || 1, 0)
  camera.lookAt(0, 0.8, 0)
  const overlay = makeOverlay(container, label)
  const controls = new OrbitControls(camera, overlay)
  controls.enableDamping = true
  return { id, label, camera, controls, overlay, x: 0, y: 0, w: 1, h: 1 }
}

function makePerspectiveView(
  id: ViewId,
  label: string,
  container: HTMLElement,
  aspect: number,
): ViewportDef {
  const camera = new PerspectiveCamera(60, aspect, 0.1, 200)
  camera.position.set(3, 2, 4)
  const overlay = makeOverlay(container, label)
  const controls = new OrbitControls(camera, overlay)
  controls.enableDamping = true
  controls.target.set(0, 0.8, 0)
  return { id, label, camera, controls, overlay, x: 0, y: 0, w: 1, h: 1 }
}

export function createConnectionLine(
  a: Matrix4,
  b: Matrix4,
): LineSegments {
  const pa = new Vector3()
  const pb = new Vector3()
  a.decompose(pa, new Quaternion(), new Vector3())
  b.decompose(pb, new Quaternion(), new Vector3())
  const positions = new Float32Array([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z])
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  return new LineSegments(geo, new LineBasicMaterial({ color: 0xffcc66 }))
}
