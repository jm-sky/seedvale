// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createAgentStatusLabelController } from './agentStatusLabel'

describe('createAgentStatusLabelController observation presentation', () => {
  it('hides observation-owned content at none while keeping the label element', () => {
    const controller = createAgentStatusLabelController('Jan', null, ['hp', 'stamina'], 2)
    controller.sync(
      { hp: { current: 50, max: 100 }, stamina: { current: 80, max: 100 } },
      controller.label,
      40,
      80,
      1,
      {
        level: 'none',
        broadIdentity: 'Osoba',
        knownName: 'Jan',
        questMarker: null,
        healthRatio: 0.5,
        staminaRatio: 0.8,
      },
    )
    expect(controller.el.querySelector('.npc-label__name')?.textContent).toBe('Jan')
    expect((controller.el.querySelector('.npc-label__name') as HTMLElement).style.display).toBe('none')
    expect((controller.el.querySelector('.npc-label__bars') as HTMLElement).style.display).toBe('none')
  })

  it('shows broad identity and qualitative assessment without bars at assessed', () => {
    const controller = createAgentStatusLabelController('Jan', null, ['hp', 'stamina'], 2)
    controller.sync(
      { hp: { current: 30, max: 100 }, stamina: { current: 10, max: 100 } },
      controller.label,
      24,
      80,
      1,
      {
        level: 'assessed',
        broadIdentity: 'Osoba',
        knownName: 'Jan',
        questMarker: null,
        healthRatio: 0.45,
        staminaRatio: 0.1,
      },
    )
    expect(controller.el.querySelector('.npc-label__name')?.textContent).toBe('Osoba')
    expect(controller.el.querySelector('.npc-label__assessment')?.textContent).toBe('Ranny · Wyczerpany')
    expect((controller.el.querySelector('.npc-label__bars') as HTMLElement).style.display).toBe('none')
  })

  it('shows detailed name and bars at detailed', () => {
    const controller = createAgentStatusLabelController('Jan', null, ['hp', 'stamina'], 2)
    controller.sync(
      { hp: { current: 100, max: 100 }, stamina: { current: 100, max: 100 } },
      controller.label,
      5,
      80,
      1,
      {
        level: 'detailed',
        broadIdentity: 'Osoba',
        knownName: 'Jan',
        questMarker: null,
        healthRatio: 1,
        staminaRatio: 1,
      },
    )
    expect(controller.el.querySelector('.npc-label__name')?.textContent).toBe('Jan')
    expect((controller.el.querySelector('.npc-label__bars') as HTMLElement).style.display).not.toBe('none')
  })

  it('bypasses observation gating when fullLabelInfo is set', () => {
    const controller = createAgentStatusLabelController('Jan', null, ['hp', 'stamina'], 2)
    controller.sync(
      { hp: { current: 100, max: 100 }, stamina: { current: 100, max: 100 } },
      controller.label,
      100,
      80,
      1,
      {
        level: 'none',
        broadIdentity: 'Osoba',
        knownName: 'Jan',
        questMarker: null,
        healthRatio: 1,
        staminaRatio: 1,
        fullLabelInfo: true,
      },
    )
    expect(controller.el.querySelector('.npc-label__name')?.textContent).toBe('Jan')
    expect((controller.el.querySelector('.npc-label__bars') as HTMLElement).style.display).not.toBe('none')
  })
})
