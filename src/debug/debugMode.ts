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
