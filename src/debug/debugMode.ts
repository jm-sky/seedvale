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

/** `?debugNoShadows=1` — disable shadow map rendering entirely, to rule
 *  shadows in/out as a source of a rendering artifact or to gauge their perf
 *  cost. */
export function isNoShadowsDebugMode(): boolean {
  return urlFlag('debugNoShadows')
}

/** `?debugCameraMesh=1` — raycast from the camera each frame and log the
 *  first mesh it hits, to identify what's rendering in front of the camera. */
export function isCameraMeshDebugMode(): boolean {
  return urlFlag('debugCameraMesh')
}

/** `?debugRenderState=1` — adds low-level render-call diagnostics
 *  (viewport/scissor/visible-mesh-count/anomaly detection) to the `camdebug`
 *  overlay, sampled immediately before `renderer.render(scene, camera)`.
 *  Requires `?camdebug=1` to actually be visible. */
export function isRenderStateDebugMode(): boolean {
  return urlFlag('debugRenderState')
}

/** Major rendered subsystems that can be independently switched off for
 *  perf/mobile/isolation testing (issue 032 diagnostic follow-up) — visual
 *  only, simulation state keeps running underneath. One name added here per
 *  future need, not a new query param per system. */
export type DebugSystemName = 'grass' | 'trees' | 'animals' | 'npcs' | 'playerModel' | 'weather'

/** `?debugDisableSystems=grass,trees` — central, comma-separated switch for
 *  the systems above. Absent (or a name not listed) means "enabled" — normal
 *  play is unaffected unless this flag is present. Kept as one shared param
 *  instead of a `debugNoX` flag per system. */
export function isSystemEnabled(name: DebugSystemName): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = new URLSearchParams(window.location.search).get('debugDisableSystems')
    if (!raw) return true
    return !raw.split(',').map((s) => s.trim()).includes(name)
  } catch {
    return true
  }
}
