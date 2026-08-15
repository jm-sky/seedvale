import { describe, expect, it } from 'vitest'
import { AO_MIN_STABLE_MS, AO_RESTORE_MS, AO_SUPPRESS_MS, shouldSuppressAo } from './aoBudget'

describe('shouldSuppressAo', () => {
  it('suppresses once renderMs crosses the heavy-frame threshold', () => {
    expect(shouldSuppressAo(false, AO_SUPPRESS_MS, AO_MIN_STABLE_MS)).toBe(true)
    expect(shouldSuppressAo(false, AO_SUPPRESS_MS + 4, AO_MIN_STABLE_MS)).toBe(true)
  })

  it('restores once renderMs drops to the light-frame threshold', () => {
    expect(shouldSuppressAo(true, AO_RESTORE_MS, AO_MIN_STABLE_MS)).toBe(false)
    expect(shouldSuppressAo(true, AO_RESTORE_MS - 2, AO_MIN_STABLE_MS)).toBe(false)
  })

  it('holds the previous state inside the hysteresis band', () => {
    const mid = (AO_SUPPRESS_MS + AO_RESTORE_MS) / 2
    expect(shouldSuppressAo(true, mid, AO_MIN_STABLE_MS)).toBe(true)
    expect(shouldSuppressAo(false, mid, AO_MIN_STABLE_MS)).toBe(false)
  })

  it('holds the previous state when the min-stable-time floor has not elapsed, even past threshold', () => {
    expect(shouldSuppressAo(false, AO_SUPPRESS_MS + 10, AO_MIN_STABLE_MS - 1)).toBe(false)
    expect(shouldSuppressAo(true, AO_RESTORE_MS - 10, AO_MIN_STABLE_MS - 1)).toBe(true)
  })

  it('does not oscillate frame-to-frame when toggling AO itself swings renderMs across both thresholds', () => {
    // Simulates the real regression (review 017): AO-on frames cost more
    // than AO_SUPPRESS_MS, AO-off frames cost less than AO_RESTORE_MS, so a
    // bare threshold check flips every single frame forever. Each call's
    // msSinceLastChange only grows when the state doesn't change, mirroring
    // the real caller (createPostProcessing.ts's applyFrameBudget).
    let suppressed = false
    let msSinceLastChange = AO_MIN_STABLE_MS
    let elapsedSinceLastFlip = AO_MIN_STABLE_MS
    let flips = 0
    const totalFrames = 200 // ~3.2s at 16ms/frame
    for (let frame = 0; frame < totalFrames; frame++) {
      const renderMs = suppressed ? AO_RESTORE_MS - 5 : AO_SUPPRESS_MS + 5
      const next = shouldSuppressAo(suppressed, renderMs, msSinceLastChange)
      if (next !== suppressed) {
        // A flip is only legal once the floor has actually elapsed — this
        // is the real assertion: no flip may be more frequent than the
        // configured minimum stable time.
        expect(elapsedSinceLastFlip).toBeGreaterThanOrEqual(AO_MIN_STABLE_MS)
        flips++
        msSinceLastChange = 0
        elapsedSinceLastFlip = 0
      } else {
        msSinceLastChange += 16
      }
      elapsedSinceLastFlip += 16
      suppressed = next
    }
    // Without the floor, bare threshold-crossing would flip all 200 frames.
    // With a 250ms floor, at most one flip per ~16 frames is possible.
    expect(flips).toBeLessThan(totalFrames / 4)
  })
})
