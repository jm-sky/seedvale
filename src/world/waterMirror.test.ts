import { describe, expect, it } from 'vitest'
import { shouldRenderMirror } from './waterMirror'

/** 30 Hz cap — the mirror's minimum spacing between two rendered passes. */
const INTERVAL = 1 / 30

describe('shouldRenderMirror', () => {
  it('renders the first call', () => {
    expect(shouldRenderMirror({
      nowSec: 0,
      lastCallSec: -Infinity,
      lastRenderSec: -Infinity,
      renderedLastCall: false,
    })).toBe(true)
  })

  it('holds to 30 Hz at 60 FPS', () => {
    const frame = 1 / 60
    // 16.7 ms after the last pass — inside the interval, so skipped.
    expect(shouldRenderMirror({
      nowSec: frame,
      lastCallSec: 0,
      lastRenderSec: 0,
      renderedLastCall: true,
    })).toBe(false)
    // 33.3 ms after — due again, and the previous call did not render, so the
    // frame-count rule does not apply either.
    expect(shouldRenderMirror({
      nowSec: frame * 2,
      lastCallSec: frame,
      lastRenderSec: 0,
      renderedLastCall: false,
    })).toBe(true)
  })

  it('falls back to every other frame below 30 FPS', () => {
    const frame = 0.043 // the 23 FPS measured in research 018
    // Without the frame-count rule this would render: the wall-clock gate is
    // already satisfied by the frame time alone.
    expect(shouldRenderMirror({
      nowSec: frame,
      lastCallSec: 0,
      lastRenderSec: 0,
      renderedLastCall: true,
    })).toBe(false)
    // Next frame the previous call was a skip, so the pass runs.
    expect(shouldRenderMirror({
      nowSec: frame * 2,
      lastCallSec: frame,
      lastRenderSec: 0,
      renderedLastCall: false,
    })).toBe(true)
  })

  it('never renders two frames in a row while over budget', () => {
    let lastCallSec = 0
    let lastRenderSec = 0
    let renderedLastCall = true
    const frame = 0.05
    const decisions: boolean[] = []
    for (let i = 1; i <= 6; i++) {
      const nowSec = frame * i
      const wanted = shouldRenderMirror({ nowSec, lastCallSec, lastRenderSec, renderedLastCall })
      decisions.push(wanted)
      lastCallSec = nowSec
      renderedLastCall = wanted
      if (wanted) lastRenderSec = nowSec
    }
    expect(decisions).toEqual([false, true, false, true, false, true])
  })

  it('still respects the 30 Hz cap when frames are short', () => {
    // 120 FPS: the frame-count rule is inactive, so the cap alone decides and
    // the cadence stays at 30 Hz rather than rising to 60.
    const frame = 1 / 120
    expect(shouldRenderMirror({
      nowSec: frame,
      lastCallSec: 0,
      lastRenderSec: 0,
      renderedLastCall: true,
    })).toBe(false)
    expect(shouldRenderMirror({
      nowSec: INTERVAL,
      lastCallSec: INTERVAL - frame,
      lastRenderSec: 0,
      renderedLastCall: false,
    })).toBe(true)
  })
})
