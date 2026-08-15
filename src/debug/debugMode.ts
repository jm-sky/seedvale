/** Lightweight debug switches — URL-driven, no world-config rebuild. */

function urlFlag(name: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(name)) return false
    const raw = params.get(name)
    if (raw === null || raw.trim() === '') return true
    const v = raw.trim().toLowerCase()
    return v !== '0' && v !== 'false' && v !== 'no'
  } catch {
    return false
  }
}

/** True when the URL has `?debug` / `?debug=1` (not `?debug=0`). */
export function isDebugMode(): boolean {
  return urlFlag('debug')
}

/** `?camdebug=1` — camera/renderer overlay for the mobile black-world diagnosis.
 *  Off in production; not wired into the normal HUD. */
export function isCameraDebugMode(): boolean {
  return urlFlag('camdebug')
}

/** `?debugNoShadows=1` — TEMP: isolation test — disable shadow map rendering
 *  entirely, to help rule shadows in/out as a source of the mobile
 *  black-poly flicker (issue 032 follow-up). */
export function isNoShadowsDebugMode(): boolean {
  return urlFlag('debugNoShadows')
}

/** `?debugCameraMesh=1` — TEMP: isolation test — raycast from the camera each
 *  frame and log the first mesh it hits, to identify what's rendering in
 *  front of the camera during the mobile black-poly flicker. */
export function isCameraMeshDebugMode(): boolean {
  return urlFlag('debugCameraMesh')
}

/** `?debugRenderState=1` — TEMP: adds low-level render-call diagnostics
 *  (viewport/scissor/visible-mesh-count/anomaly detection) to the `camdebug`
 *  overlay, sampled immediately before `renderer.render(scene, camera)`.
 *  Requires `?camdebug=1` to actually be visible (issue 032 follow-up). */
export function isRenderStateDebugMode(): boolean {
  return urlFlag('debugRenderState')
}

/** `?debugMinimalScene=1` — TEMP: isolation test — hide every rendered
 *  object except the terrain chunk meshes and lights (camera, renderer and
 *  normal terrain rendering are left untouched), to see whether the mobile
 *  black/flying-poly artifacts persist with everything else stripped out
 *  (issue 032 follow-up). */
export function isMinimalSceneDebugMode(): boolean {
  return urlFlag('debugMinimalScene')
}
