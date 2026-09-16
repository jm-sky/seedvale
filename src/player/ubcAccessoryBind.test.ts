import { describe, expect, it } from 'vitest'
import { mapBonesByName } from './ubcAccessoryBind'

describe('mapBonesByName', () => {
  it('maps accessory joints onto matching destination names in source order', () => {
    const dest = new Set(['hand_r', 'root', 'upperarm_l', 'upperarm_r'])
    expect(
      mapBonesByName(
        [{ name: 'upperarm_l' }, { name: 'upperarm_r' }],
        dest,
      ),
    ).toEqual(['upperarm_l', 'upperarm_r'])
  })

  it('rejects a missing destination bone instead of a partial bind', () => {
    expect(
      mapBonesByName(
        [{ name: 'upperarm_l' }, { name: 'missing_joint' }],
        new Set(['upperarm_l', 'upperarm_r']),
      ),
    ).toBeNull()
  })

  it('returns an empty list when the accessory declares no joints', () => {
    expect(mapBonesByName([], new Set(['root']))).toEqual([])
  })
})
