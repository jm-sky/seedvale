import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginActivePath,
  endActivePath,
  getNavigationStats,
  recordPathRequest,
  recordRepath,
  resetNavigationStats,
} from './navigationStats'

describe('navigationStats', () => {
  beforeEach(() => resetNavigationStats())

  it('tallies successful and failed path requests separately', () => {
    recordPathRequest({ waypoints: [{ x: 1, z: 1 }, { x: 2, z: 2 }], visitedNodes: 5 }, 1.2)
    recordPathRequest(null, 0.4)
    const stats = getNavigationStats()
    expect(stats.pathRequests).toBe(2)
    expect(stats.pathSuccesses).toBe(1)
    expect(stats.pathFailures).toBe(1)
    expect(stats.totalVisitedNodes).toBe(5)
    expect(stats.totalWaypoints).toBe(2)
    expect(stats.totalSearchMs).toBeCloseTo(1.6)
  })

  it('tracks repaths independently of total requests', () => {
    recordPathRequest({ waypoints: [], visitedNodes: 0 }, 0)
    recordRepath()
    expect(getNavigationStats().repaths).toBe(1)
    expect(getNavigationStats().pathRequests).toBe(1)
  })

  it('never lets activePaths go negative', () => {
    endActivePath()
    expect(getNavigationStats().activePaths).toBe(0)
    beginActivePath()
    beginActivePath()
    endActivePath()
    expect(getNavigationStats().activePaths).toBe(1)
  })
})
