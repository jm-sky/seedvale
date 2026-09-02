import type { PerfFilter, PerfLogEvent } from './types'
import { PERF_SEVERITY_RANK } from './types'

const LOG_CAP = 64
const CONSOLE_THROTTLE_MS = 2000

export type PerfLog = {
  setFilter: (filter: PerfFilter) => void
  getFilter: () => PerfFilter
  push: (event: PerfLogEvent) => void
  events: () => readonly PerfLogEvent[]
  clear: () => void
}

function matches(event: PerfLogEvent, filter: PerfFilter): boolean {
  const min = filter.minSeverity ?? 'debug'
  if (PERF_SEVERITY_RANK[event.severity] < PERF_SEVERITY_RANK[min]) return false
  if (filter.categories && filter.categories.length > 0) {
    return filter.categories.includes(event.category)
  }
  return true
}

function formatLine(event: PerfLogEvent): string {
  return `[PERF:${event.category}] ${event.severity}: ${event.message}`
}

/** In-memory ring. Console only for warning+ that pass the current filter. */
export function createPerfLog(): PerfLog {
  const lastConsoleLog = new Map<string, number>()
  const ring: PerfLogEvent[] = []
  let filter: PerfFilter = { minSeverity: 'warning' }

  return {
    setFilter(next) {
      filter = {
        categories: next.categories,
        minSeverity: next.minSeverity ?? filter.minSeverity,
      }
    },
    getFilter: () => filter,
    push(event) {
      if (ring.length >= LOG_CAP) ring.shift()
      ring.push(event)

      if (!matches(event, filter)) return
      if (PERF_SEVERITY_RANK[event.severity] < PERF_SEVERITY_RANK.warning) return

      const key = `${event.category}:${event.severity}`
      const now = performance.now()
      const last = lastConsoleLog.get(key) ?? -Infinity

      if (now - last < CONSOLE_THROTTLE_MS) return

      lastConsoleLog.set(key, now)
      console.warn(formatLine(event))
    },
    events: () => ring,
    clear() {
      ring.length = 0
      lastConsoleLog.clear()
    },
  }
}
