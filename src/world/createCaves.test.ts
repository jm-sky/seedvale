import { describe, expect, it } from 'vitest'
import { resolveCaveRenderVariants } from './createCaves'

describe('resolveCaveRenderVariants', () => {
  const caveIds = ['cave:a', 'cave:b', 'cave:c']

  it('resolves every cave to sdf when the param is absent (default sdf)', () => {
    const variants = resolveCaveRenderVariants(caveIds, 'sdf')
    for (const id of caveIds) expect(variants.get(id)).toBe('sdf')
  })

  it('resolves every cave to sdf for an explicit ?caveSpike=sdf', () => {
    const variants = resolveCaveRenderVariants(caveIds, 'sdf')
    for (const id of caveIds) expect(variants.get(id)).toBe('sdf')
  })

  it('makes only the first cave the sweep comparison target for ?caveSpike=sweep, the rest stay sdf', () => {
    const variants = resolveCaveRenderVariants(caveIds, 'sweep')
    expect(variants.get('cave:a')).toBe('sweep')
    expect(variants.get('cave:b')).toBe('sdf')
    expect(variants.get('cave:c')).toBe('sdf')
  })

  it('never leaves a cave unresolved', () => {
    const variants = resolveCaveRenderVariants(caveIds, 'sweep')
    expect(variants.size).toBe(caveIds.length)
  })

  it('handles no accepted caves without throwing', () => {
    expect(() => resolveCaveRenderVariants([], 'sweep')).not.toThrow()
    expect(resolveCaveRenderVariants([], 'sweep').size).toBe(0)
  })
})
