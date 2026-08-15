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
