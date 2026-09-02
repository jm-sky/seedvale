import { describe, expect, it, vi } from 'vitest'
import { createHouseLoadGuard } from './houseLoadGuard'

describe('createHouseLoadGuard', () => {
  it('disposes a stale assembly and keeps only the latest selection attached', async () => {
    const guard = createHouseLoadGuard()
    const disposeA = vi.fn()
    const disposeB = vi.fn()

    let resolveA!: (value: { dispose: () => void }) => void
    let resolveB!: (value: { dispose: () => void }) => void
    const pendingA = new Promise<{ dispose: () => void }>((resolve) => { resolveA = resolve })
    const pendingB = new Promise<{ dispose: () => void }>((resolve) => { resolveB = resolve })

    const tokenA = guard.next()
    const resultAPromise = guard.resolve(tokenA, () => pendingA)

    const tokenB = guard.next()
    const resultBPromise = guard.resolve(tokenB, () => pendingB)

    // Newer selection (B) resolves first — must attach normally.
    resolveB({ dispose: disposeB })
    const resultB = await resultBPromise
    expect(resultB?.dispose).toBe(disposeB)
    expect(disposeB).not.toHaveBeenCalled()

    // Older selection (A) resolves after B — must be discarded and disposed.
    resolveA({ dispose: disposeA })
    const resultA = await resultAPromise
    expect(resultA).toBeNull()
    expect(disposeA).toHaveBeenCalledTimes(1)
  })

  it('attaches a single in-order selection normally', async () => {
    const guard = createHouseLoadGuard()
    const dispose = vi.fn()

    const token = guard.next()
    const result = await guard.resolve(token, async () => ({ dispose }))

    expect(result?.dispose).toBe(dispose)
    expect(dispose).not.toHaveBeenCalled()
  })
})
