import { Vector3, Vector4 } from 'three'
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'

/** `?debugRenderState=1` diagnostics — sampled immediately before
 *  `renderer.render(scene, camera)` (issue 032: sporadic mobile
 *  black/flying-poly flicker). Pure state capture: never mutates the
 *  renderer, camera, or scene. Module-level singleton because the sample
 *  site (`createPostProcessing.ts`) and the display site (`camdebug`
 *  overlay, via `createApp.ts`) run in different frames of the same tick and
 *  have no other shared context. */

export type CameraMeshHit = {
  name: string
  uuid: string
  parentName: string
  distance: number
} | null

let lastCameraMeshHit: CameraMeshHit = null

/** Fed by the existing `?debugCameraMesh=1` raycast in gameLoop.ts — this
 *  module does not run a second independent raycast. */
export function setCameraMeshHit(hit: CameraMeshHit): void {
  lastCameraMeshHit = hit
}

type PrevState = {
  posX: number
  posY: number
  posZ: number
  rotX: number
  rotY: number
  rotZ: number
  viewportX: number
  viewportY: number
  viewportW: number
  viewportH: number
  scissorX: number
  scissorY: number
  scissorW: number
  scissorH: number
  scissorTest: boolean
  visibleMeshes: number
}

let prev: PrevState | null = null
let lastAnomaly = '(none)'
let displayText = ''

const POSITION_JUMP_METERS = 1
const ROTATION_JUMP_RADIANS = 0.5
/** Visible-mesh-count change ratio counted as "drastic". */
const MESH_COUNT_DRASTIC_RATIO = 0.5
const SUSPICIOUSLY_CLOSE_METERS = 0.3

const worldDirection = new Vector3()
const viewport = new Vector4()
const scissor = new Vector4()

function countVisibleMeshes(scene: Scene): number {
  let n = 0
  // `traverseVisible` skips descending into invisible subtrees, matching
  // what the renderer actually walks — a plain `traverse` would overcount.
  scene.traverseVisible((obj) => {
    if ((obj as { isMesh?: boolean }).isMesh) n++
  })
  return n
}

function renderTargetLabel(renderer: WebGLRenderer): string {
  const rt = renderer.getRenderTarget()
  if (!rt) return 'default framebuffer'
  return `${rt.width}x${rt.height}${rt.texture.name ? ` (${rt.texture.name})` : ''}`
}

const fmt = (n: number): string => n.toFixed(2)

/** Called once per frame, directly before `renderer.render(scene, camera)`,
 *  when `?debugRenderState=1` is set. Cheap (a handful of getters + a
 *  visible-only scene traversal) but the *display* text is only rebuilt on
 *  an anomaly — the overlay must not spam/flicker every frame. */
export function sampleRenderState(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): void {
  camera.getWorldDirection(worldDirection)
  renderer.getViewport(viewport)
  renderer.getScissor(scissor)
  const scissorTest = renderer.getScissorTest()
  const visibleMeshes = countVisibleMeshes(scene)
  const pos = camera.position
  const rot = camera.rotation

  let anomaly: string | null = null
  if (prev) {
    const dx = pos.x - prev.posX
    const dy = pos.y - prev.posY
    const dz = pos.z - prev.posZ
    const posJump = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (posJump > POSITION_JUMP_METERS) {
      anomaly = `camera jump ${fmt(posJump)}m`
    }
    const rotJump = Math.max(
      Math.abs(rot.x - prev.rotX),
      Math.abs(rot.y - prev.rotY),
      Math.abs(rot.z - prev.rotZ),
    )
    if (!anomaly && rotJump > ROTATION_JUMP_RADIANS) {
      anomaly = `camera rotation jump ${fmt(rotJump)}rad`
    }
    if (
      !anomaly &&
      (viewport.x !== prev.viewportX ||
        viewport.y !== prev.viewportY ||
        viewport.z !== prev.viewportW ||
        viewport.w !== prev.viewportH)
    ) {
      anomaly = `viewport changed -> ${viewport.z}x${viewport.w} @(${viewport.x},${viewport.y})`
    }
    if (
      !anomaly &&
      (scissorTest !== prev.scissorTest ||
        (scissorTest &&
          (scissor.x !== prev.scissorX ||
            scissor.y !== prev.scissorY ||
            scissor.z !== prev.scissorW ||
            scissor.w !== prev.scissorH)))
    ) {
      anomaly = `scissor changed -> test=${scissorTest} ${scissor.z}x${scissor.w} @(${scissor.x},${scissor.y})`
    }
    if (!anomaly && prev.visibleMeshes > 0) {
      const ratio = Math.abs(visibleMeshes - prev.visibleMeshes) / prev.visibleMeshes
      if (ratio > MESH_COUNT_DRASTIC_RATIO) {
        anomaly = `visibleMeshes ${prev.visibleMeshes} -> ${visibleMeshes}`
      }
    }
  }
  if (!anomaly && lastCameraMeshHit && lastCameraMeshHit.distance < SUSPICIOUSLY_CLOSE_METERS) {
    anomaly = `camera very close to mesh "${lastCameraMeshHit.name}" (${fmt(lastCameraMeshHit.distance)}m)`
  }

  prev = {
    posX: pos.x,
    posY: pos.y,
    posZ: pos.z,
    rotX: rot.x,
    rotY: rot.y,
    rotZ: rot.z,
    viewportX: viewport.x,
    viewportY: viewport.y,
    viewportW: viewport.z,
    viewportH: viewport.w,
    scissorX: scissor.x,
    scissorY: scissor.y,
    scissorW: scissor.z,
    scissorH: scissor.w,
    scissorTest,
    visibleMeshes,
  }

  if (anomaly) lastAnomaly = anomaly
  if (!anomaly && displayText !== '') return

  const lines = [
    '[RenderState]',
    `camera ${fmt(pos.x)}, ${fmt(pos.y)}, ${fmt(pos.z)}`,
    `rotation ${fmt(rot.x)}, ${fmt(rot.y)}, ${fmt(rot.z)}`,
    `direction ${fmt(worldDirection.x)}, ${fmt(worldDirection.y)}, ${fmt(worldDirection.z)}`,
    `near/far ${camera.near}/${camera.far}`,
    `viewport ${viewport.z}x${viewport.w} @(${viewport.x},${viewport.y})`,
    `scissor ${scissorTest ? `${scissor.z}x${scissor.w} @(${scissor.x},${scissor.y})` : 'OFF'}`,
    `scene.visible ${scene.visible}`,
    `visibleMeshes ${visibleMeshes}`,
    `renderTarget ${renderTargetLabel(renderer)}`,
  ]
  if (lastCameraMeshHit) {
    lines.push(
      `cameraMesh "${lastCameraMeshHit.name}" uuid=${lastCameraMeshHit.uuid} parent=${lastCameraMeshHit.parentName} dist=${fmt(lastCameraMeshHit.distance)}`,
    )
  }
  lines.push('', 'last anomaly:', lastAnomaly)
  displayText = lines.join('\n')
}

/** Returns the last-rebuilt diagnostic block, or `''` before the first
 *  sample. Sticky between anomalies by design — see `sampleRenderState`. */
export function getRenderStateDebugText(): string {
  return displayText
}
