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

/** Trimmed value of `?name=...`, or `null` if the param is absent or empty
 *  (e.g. bare `?houseTest`, distinct from `urlFlag`'s boolean-only reading). */
export function urlParamValue(name: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(name)) return null
    const raw = params.get(name)
    if (raw === null || raw.trim() === '') return null
    return raw.trim()
  } catch {
    return null
  }
}

/** True when the URL has `?debug` / `?debug=1` (not `?debug=0`). */
export function isBootMarkMode(): boolean {
  return urlFlag('bootMark')
}

/** True when the URL has `?debug` / `?debug=1` (not `?debug=0`). */
export function isDebugMode(): boolean {
  return urlFlag('debug')
}

/** True when the URL has `?admin` / `?admin=1` (not `?admin=0`). */
export function isAdminMode(): boolean {
  return urlFlag('admin')
}

/** `?modelTest` — ultra-minimal NPC/player model+animation test scene
 *  (renderer/camera/light/one model/one flat plane only), bypassing the
 *  normal world/save/UI bootstrap entirely. */
export function isModelTestMode(): boolean {
  return urlFlag('modelTest')
}

/** `?houseTest` — standalone `HouseDefinition`/`HouseBuilder` preview scene
 *  (renderer/camera/light/one `HouseAssembly` only), bypassing the normal
 *  world/save/UI bootstrap entirely. Takes precedence over `?modelTest`.
 *  Definition lookup lives in `./houseTestDefinition.ts`, not here —
 *  `debugMode.ts` is a low-level module widely imported by core runtime code
 *  (e.g. `settlement/livestock.ts`, `settlement/props.ts`), and pulling in
 *  `assets/houseDefinitionExample.ts`'s data here created a circular-import
 *  TDZ crash (`HOUSE_MODULE_M` in `houseBuilder.ts`) via
 *  assetIndex → livestock → debugMode → houseDefinitionExample. */
export function isHouseTestMode(): boolean {
  return urlFlag('houseTest')
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

/** `?debugColliders=1` — renders every nearby `Collider` (player/NPC/fauna
 *  circle-collision primitive, `world/collision.ts`) as a translucent orange
 *  cylinder in the world, so collision gaps (e.g. a doorway with no jamb
 *  collider) are visible instead of only discoverable by walking into them. */
export function isColliderDebugMode(): boolean {
  return urlFlag('debugColliders')
}

/** `?debug=1&debugNpcCombat=1` — console-logs every animal→NPC hit that
 *  actually lands (post-defense damage > 0), for diagnosing wolf-vs-NPC
 *  combat. Requires the `debug` master switch, same convention `?gui=1`
 *  follows elsewhere in this codebase — not a standalone flag like the
 *  other `isXDebugMode` functions above. */
export function isNpcCombatDebugMode(): boolean {
  return isDebugMode() && urlFlag('debugNpcCombat')
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
