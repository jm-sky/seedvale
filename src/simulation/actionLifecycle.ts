import type { ActionLifecycle, ActionLifecycleStatus } from './types'

const TERMINAL: ReadonlySet<ActionLifecycleStatus> = new Set([
  'cancelled',
  'complete',
  'failed',
])

export function createActionLifecycle(): ActionLifecycle {
  return { status: 'idle' }
}

export function isActionTerminal(life: ActionLifecycle): boolean {
  return TERMINAL.has(life.status)
}

export function isActionActive(life: ActionLifecycle): boolean {
  return life.status === 'active'
}

/**
 * `idle` or any terminal status → `active`.
 * Returns false if already `active` (idempotent no-op for callers that
 * restart a chain without resetting).
 */
export function startActionLifecycle(life: ActionLifecycle): boolean {
  if (life.status === 'active') return false
  life.status = 'active'
  return true
}

/** `active` → `complete`. */
export function completeActionLifecycle(life: ActionLifecycle): boolean {
  if (life.status !== 'active') return false
  life.status = 'complete'
  return true
}

/** `active` → `failed`. */
export function failActionLifecycle(life: ActionLifecycle): boolean {
  if (life.status !== 'active') return false
  life.status = 'failed'
  return true
}

/** `active` → `cancelled`. */
export function cancelActionLifecycle(life: ActionLifecycle): boolean {
  if (life.status !== 'active') return false
  life.status = 'cancelled'
  return true
}

/** Reset to `idle` from any status (including mid-action). */
export function resetActionLifecycle(life: ActionLifecycle): void {
  life.status = 'idle'
}
