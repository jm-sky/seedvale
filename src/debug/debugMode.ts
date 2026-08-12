/** Lightweight debug switches — URL-driven, no world-config rebuild. */

/** True when the URL has `?debug` / `?debug=1` (not `?debug=0`). */
export function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('debug')) return false
    const raw = params.get('debug')
    if (raw === null || raw.trim() === '') return true
    const v = raw.trim().toLowerCase()
    return v !== '0' && v !== 'false' && v !== 'no'
  } catch {
    return false
  }
}
