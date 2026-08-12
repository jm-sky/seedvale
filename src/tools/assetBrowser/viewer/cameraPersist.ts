import type { ViewId, ViewportDef } from './createMultiView'
import type { OrthographicCamera, PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const STORAGE_KEY = 'seedvale.assetBrowser.cameras.v1'

export type CameraSnapshot = {
  id: ViewId
  position: [number, number, number]
  target: [number, number, number]
  zoom: number
}

export type CameraPersistPayload = {
  version: 1
  views: CameraSnapshot[]
}

function isFiniteVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v)
    && v.length === 3
    && v.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

export function loadCameraPersist(): CameraPersistPayload | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CameraPersistPayload
    if (parsed?.version !== 1 || !Array.isArray(parsed.views) || parsed.views.length === 0) {
      return null
    }
    for (const view of parsed.views) {
      if (!view?.id || !isFiniteVec3(view.position) || !isFiniteVec3(view.target)) return null
      if (typeof view.zoom !== 'number' || !Number.isFinite(view.zoom)) return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveCameraPersist(views: readonly ViewportDef[]): void {
  if (typeof localStorage === 'undefined') return
  const payload: CameraPersistPayload = {
    version: 1,
    views: views.map((view) => ({
      id: view.id,
      position: [view.camera.position.x, view.camera.position.y, view.camera.position.z],
      target: [view.controls.target.x, view.controls.target.y, view.controls.target.z],
      zoom: view.camera.zoom,
    })),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearCameraPersist(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function applyCameraSnapshot(
  view: ViewportDef,
  snap: CameraSnapshot,
): void {
  const cam = view.camera as OrthographicCamera | PerspectiveCamera
  const controls = view.controls as OrbitControls
  cam.position.set(snap.position[0], snap.position[1], snap.position[2])
  controls.target.set(snap.target[0], snap.target[1], snap.target[2])
  cam.zoom = snap.zoom
  cam.updateProjectionMatrix()
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.update()
  controls.enableDamping = damping
}

export function restoreCamerasFromPersist(views: readonly ViewportDef[]): boolean {
  const payload = loadCameraPersist()
  if (!payload) return false
  const byId = new Map(payload.views.map((v) => [v.id, v]))
  let applied = 0
  for (const view of views) {
    const snap = byId.get(view.id)
    if (!snap) continue
    applyCameraSnapshot(view, snap)
    applied++
  }
  return applied > 0
}

/** Debounced save helper for OrbitControls `change` events. */
export function createCameraPersistScheduler(
  getViews: () => readonly ViewportDef[],
  debounceMs = 200,
): { schedule: () => void, flush: () => void, dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    saveCameraPersist(getViews())
  }
  return {
    schedule: () => {
      if (timer != null) clearTimeout(timer)
      timer = setTimeout(flush, debounceMs)
    },
    flush,
    dispose: () => {
      if (timer != null) clearTimeout(timer)
      timer = null
    },
  }
}
