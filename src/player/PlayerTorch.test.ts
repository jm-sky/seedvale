import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { createPlayerTorch } from './PlayerTorch'

function makeTorch() {
  const hand = new Group()
  const belt = new Group()
  const root = new Group()
  root.add(hand, belt)
  const torch = createPlayerTorch({
    torchHandSocket: () => hand,
    torchBeltSocket: () => belt,
  })
  return { torch, hand, belt }
}

describe('PlayerTorch carry mode (items-player-048)', () => {
  it('setCarryMode reparents a lit wooden torch without resetting fuel', async () => {
    const { torch } = makeTorch()
    await torch.light('wooden_torch', { fuelRemaining: 120 })
    const fuelBefore = torch.fuelRemaining()

    torch.setCarryMode('belt')
    expect(torch.isLit()).toBe(true)
    expect(torch.carryMode()).toBe('belt')
    expect(torch.fuelRemaining()).toBe(fuelBefore)

    torch.setCarryMode('hand')
    expect(torch.carryMode()).toBe('hand')
    expect(torch.fuelRemaining()).toBe(fuelBefore)
  })

  it('ignores belt carry for a lit branch', async () => {
    const { torch } = makeTorch()
    await torch.light('branch')
    torch.setCarryMode('belt')
    expect(torch.carryMode()).toBe('hand')
  })

  it('restored light starts in hand carry', async () => {
    const { torch } = makeTorch()
    await torch.light('wooden_torch', { silent: true })
    expect(torch.carryMode()).toBe('hand')
  })
})
