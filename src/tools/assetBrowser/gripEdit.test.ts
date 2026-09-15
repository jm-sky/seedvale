import { describe, expect, it } from 'vitest'
import { UBC_TORCH_HAND_OFFSET } from '../../assets/assetAnchorData'
import { gripEditToAttach, loadGripEditor } from './gripEdit'

describe('gripEditToAttach', () => {
  it('keeps wooden_torch UBC extra on the grip-editor override', () => {
    loadGripEditor('held:wooden_torch')
    expect(gripEditToAttach().ubcPosition).toEqual(UBC_TORCH_HAND_OFFSET)
  })

  it('does not invent ubcPosition for tools without one', () => {
    loadGripEditor('held:axe')
    expect(gripEditToAttach().ubcPosition).toBeUndefined()
  })
})
