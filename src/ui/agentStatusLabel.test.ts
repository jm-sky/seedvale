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

describe('vendor marker observation gating (plan settlements-npcs-042)', () => {
  function vendorEl(controller: ReturnType<typeof createAgentStatusLabelController>): HTMLElement {
    return controller.el.querySelector('.npc-label__vendor-marker') as HTMLElement
  }

  it('stays hidden at none, basic and assessed even when the NPC is a vendor', () => {
    for (const level of ['none', 'basic', 'assessed'] as const) {
      const controller = createAgentStatusLabelController('Jan', '?', ['hp'], 2)
      controller.sync(
        { hp: { current: 100, max: 100 } },
        controller.label,
        10,
        80,
        1,
        {
          level,
          broadIdentity: 'Osoba',
          knownName: 'Jan',
          questMarker: '?',
          vendorMarker: '◈',
          healthRatio: 1,
          staminaRatio: 1,
        },
      )
      expect(vendorEl(controller).style.display).toBe('none')
      expect(vendorEl(controller).textContent).toBe('')
    }
  })

  it('shows at detailed and stays visible with empty stock because it is not offer-derived', () => {
    const controller = createAgentStatusLabelController('Kasia', null, ['hp'], 2)
    controller.sync(
      { hp: { current: 100, max: 100 } },
      controller.label,
      5,
      80,
      1,
      {
        level: 'detailed',
        broadIdentity: 'Osoba',
        knownName: 'Kasia',
        questMarker: null,
        vendorMarker: '◈',
        healthRatio: 1,
        staminaRatio: 1,
      },
    )
    expect(vendorEl(controller).style.display).not.toBe('none')
    expect(vendorEl(controller).textContent).toBe('◈')
  })

  it('shows under fullLabelInfo even when observation level is none', () => {
    const controller = createAgentStatusLabelController('Marek', null, ['hp'], 2)
    controller.sync(
      { hp: { current: 100, max: 100 } },
      controller.label,
      100,
      80,
      1,
      {
        level: 'none',
        broadIdentity: 'Osoba',
        knownName: 'Marek',
        questMarker: null,
        vendorMarker: '◈',
        healthRatio: 1,
        staminaRatio: 1,
        fullLabelInfo: true,
      },
    )
    expect(vendorEl(controller).style.display).not.toBe('none')
  })

  it('does not appear for fauna / non-vendor presentation', () => {
    const controller = createAgentStatusLabelController('Wilk', null, ['hp'], 2)
    controller.sync(
      { hp: { current: 100, max: 100 } },
      controller.label,
      5,
      80,
      1,
      {
        level: 'detailed',
        broadIdentity: 'Wilk',
        knownName: 'Wilk',
        questMarker: null,
        healthRatio: 1,
        staminaRatio: 1,
      },
    )
    expect(vendorEl(controller).style.display).toBe('none')
  })
})
