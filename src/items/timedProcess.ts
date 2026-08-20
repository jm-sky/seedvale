import type { ItemKind } from './items'

/** Plan 159 §7 — a small generic model for a background process (drying,
 *  ...). Deliberately not a global manager/ticker: `completedAtDays` and
 *  progress are always *derived* from `startedAtDays + durationDays`, so the
 *  owning record (e.g. `DryingRackRecord`) just needs to persist this value
 *  and re-read it whenever it's next looked at (stream-in, reload, an
 *  interaction) — no per-frame work while unobserved. */
export type TimedProcessKind = 'drying'

export type ItemStackInput = { kind: ItemKind, count: number }
export type ItemStackOutput = { kind: ItemKind, count: number }

export type TimedProcess = {
  id: string
  kind: TimedProcessKind
  startedAtDays: number
  durationDays: number
  input: readonly ItemStackInput[]
  output: readonly ItemStackOutput[]
}

export function processCompletedAtDays(process: TimedProcess): number {
  return process.startedAtDays + process.durationDays
}

export function isProcessComplete(process: TimedProcess, nowDays: number): boolean {
  return nowDays >= processCompletedAtDays(process)
}

/** `[0, 1]` — for UI progress bars only, never persisted itself. */
export function processProgress(process: TimedProcess, nowDays: number): number {
  if (process.durationDays <= 0) return 1
  const elapsed = nowDays - process.startedAtDays
  return Math.max(0, Math.min(1, elapsed / process.durationDays))
}
