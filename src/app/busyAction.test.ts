import { describe, expect, it, vi } from 'vitest'
import { createBusyAction } from './busyAction'

describe('createBusyAction', () => {
  it('completes after the requested duration and runs onComplete once', () => {
    const busy = createBusyAction()
    const onComplete = vi.fn()
    busy.start(2, 'Kopanie…', onComplete)

    const mid = busy.tick(1)
    expect(mid).toEqual({
      label: 'Kopanie…',
      justFinished: false,
      blurred: false,
      progress: 0.5,
    })
    expect(onComplete).not.toHaveBeenCalled()
    expect(busy.isActive()).toBe(true)

    const done = busy.tick(1)
    expect(done).toEqual({
      label: 'Kopanie…',
      justFinished: true,
      blurred: false,
      progress: 1,
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(busy.isActive()).toBe(false)
    expect(busy.tick(1)).toBeNull()
  })

  it('cancel runs onCancel and never onComplete', () => {
    const busy = createBusyAction()
    const onComplete = vi.fn()
    const onCancel = vi.fn()
    busy.start(10, 'Wycinanie mięsa…', onComplete, { blurred: true, onCancel })
    busy.tick(1)
    busy.cancel()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
    expect(busy.isActive()).toBe(false)
    expect(busy.tick(1)).toBeNull()
  })

  it('ignores a second start while already busy', () => {
    const busy = createBusyAction()
    const first = vi.fn()
    const second = vi.fn()
    busy.start(1, 'A', first)
    busy.start(1, 'B', second)
    busy.tick(1)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })
})

describe('createBusyAction — physical effort (plan items-player-003 §2/§9)', () => {
  it('drains both Stamina and Vigor proportionally to elapsed time when both costs are set', () => {
    let stamina = 0
    let vigor = 0
    const busy = createBusyAction((a) => { stamina += a }, (a) => { vigor += a })
    busy.start(2, 'Kopanie…', () => {}, { staminaCostPerSec: 6, vigorCostPerSec: 3 })
    busy.tick(1)
    expect(stamina).toBeCloseTo(6, 6)
    expect(vigor).toBeCloseTo(3, 6)
  })

  it('is not physical when no cost is declared (a purely timed interaction)', () => {
    const busy = createBusyAction()
    busy.start(1, 'Gotowanie…', () => {})
    expect(busy.isPhysical()).toBe(false)
  })

  it('is physical while a Stamina or Vigor cost is declared, and stops being physical once idle', () => {
    const busy = createBusyAction()
    busy.start(1, 'Kopanie…', () => {}, { staminaCostPerSec: 6 })
    expect(busy.isPhysical()).toBe(true)
    busy.tick(1)
    expect(busy.isPhysical()).toBe(false)
  })

  it('a cancelled physical channel is no longer physical', () => {
    const busy = createBusyAction()
    busy.start(5, 'Wyrównywanie…', () => {}, { vigorCostPerSec: 2 })
    expect(busy.isPhysical()).toBe(true)
    busy.cancel()
    expect(busy.isPhysical()).toBe(false)
  })
})
