import type { PerfMonitor } from './monitor'
import { createPerfMonitor } from './monitor'

const NOOP = createPerfMonitor()

let active: PerfMonitor = NOOP

export function setActiveMonitor(monitor: PerfMonitor | null): void {
  active = monitor ?? NOOP
}

export function getMonitor(): PerfMonitor {
  return active
}
