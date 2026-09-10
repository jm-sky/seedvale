import { describe, expect, it } from 'vitest'
import type { Interactable } from './Interactable'
import {
  alternateActionState,
  buildInteractionView,
  interactionActionFromSkillPrompt,
  isInteractableActionable,
  primaryActionState,
} from './interactionView'

function houseTarget(promptLabel: string): Interactable {
  return {
    kind: 'house',
    position: { x: 0, z: 0 },
    promptLabel,
    houseId: 'h1',
    modelUrl: null,
    label: '',
    examine: '',
    lampMount: null,
    lampMountSource: null,
  }
}

describe('buildInteractionView (plan ui-input-015)', () => {
  it('maps primary-only legacy prompts', () => {
    const view = buildInteractionView(houseTarget('Rozmawiaj z Jan'), { hasInspect: false })
    expect(view.actions).toEqual([{
      slot: 'primary',
      label: 'Rozmawiaj z Jan',
      enabled: true,
      reasonLabel: '',
    }])
  })

  it('maps primary and alternate bracket prompts', () => {
    const view = buildInteractionView(houseTarget('[E] Odpocznij · [R] Zbadaj'), { hasInspect: false })
    expect(view.actions.map((a) => a.slot)).toEqual(['primary', 'alternate'])
    expect(view.actions[0]?.label).toBe('Odpocznij')
    expect(view.actions[1]?.label).toBe('Zbadaj')
  })

  it('adds inspect without faking E/R slots', () => {
    const view = buildInteractionView({
      kind: 'palisade',
      position: { x: 0, z: 0 },
      promptLabel: '[E] Kontynuuj budowę',
      id: 'p1',
      complete: false,
    }, { hasInspect: true })
    expect(view.actions.some((a) => a.slot === 'inspect')).toBe(true)
    expect(view.actions.filter((a) => a.slot === 'primary' || a.slot === 'alternate')).toHaveLength(2)
  })

  it('marks flavor-only status prompts as disabled primary', () => {
    const view = buildInteractionView({
      kind: 'dryingRack',
      position: { x: 0, z: 0 },
      promptLabel: 'Suszy się…',
      id: 'rack',
    }, { hasInspect: false })
    expect(view.actions[0]).toMatchObject({ slot: 'primary', enabled: false })
    expect(isInteractableActionable({
      kind: 'dryingRack',
      position: { x: 0, z: 0 },
      promptLabel: 'Suszy się…',
      id: 'rack',
    })).toBe(false)
  })

  it('applies well work blocked reasons from context', () => {
    const view = buildInteractionView({
      kind: 'playerWell',
      position: { x: 0, z: 0 },
      promptLabel: '[E] Pracuj nad studnią',
      id: 'well',
      stage: 'pit',
      waterSource: null,
      complete: false,
    }, {
      hasInspect: false,
      describeWellWork: () => ({ canWork: false, reasonLabel: 'Brak kilofa.' }),
    })
    expect(view.actions[0]).toMatchObject({ enabled: false, reasonLabel: 'Brak kilofa.' })
  })

  it('does not mutate the interactable', () => {
    const target = houseTarget('[E] Odpocznij')
    const before = JSON.stringify(target)
    buildInteractionView(target, { hasInspect: false })
    expect(JSON.stringify(target)).toBe(before)
  })
})

describe('touch availability helpers', () => {
  it('hides alternate when only primary exists', () => {
    const view = buildInteractionView(houseTarget('[E] Odpocznij'), { hasInspect: false })
    expect(alternateActionState(view)).toBeNull()
    expect(primaryActionState(view)?.enabled).toBe(true)
  })

  it('exposes blocked alternate actions', () => {
    const view = buildInteractionView({
      kind: 'cart',
      position: { x: 0, z: 0 },
      promptLabel: 'Wózek',
      id: 'cart',
    }, { hasInspect: false })
    expect(alternateActionState(view)).toBeNull()
    expect(primaryActionState(view)?.enabled).toBe(false)
  })
})

describe('targeted skill override', () => {
  it('strips legacy bracket prefixes for structured primary', () => {
    const action = interactionActionFromSkillPrompt('[E] Napraw: namiot')
    expect(action).toMatchObject({ slot: 'primary', label: 'Napraw: namiot', enabled: true })
  })
})

describe('construction InteractionView (plan ui-input-016)', () => {
  it('does not use [R] inspect on camp or tent', () => {
    const camp = buildInteractionView({
      kind: 'camp',
      position: { x: 0, z: 0 },
      promptLabel: '[E] Odpocznij · [R] Zbadaj',
      tentId: 't1',
      bedrollId: null,
      platformId: null,
    }, { hasInspect: true })
    expect(camp.actions.find((action) => action.slot === 'primary')?.label).toBe('Odpocznij')
    expect(camp.actions.some((action) => action.slot === 'alternate')).toBe(false)
    expect(camp.actions.some((action) => action.slot === 'inspect')).toBe(true)
  })

  it('shows disabled palisade work with the live reason', () => {
    const view = buildInteractionView({
      kind: 'palisade',
      position: { x: 0, z: 0 },
      promptLabel: '',
      id: 'p1',
      complete: false,
    }, {
      hasInspect: false,
      describePalisadeWork: () => ({ canWork: false, reasonLabel: 'Jesteś zbyt wyczerpany, by kontynuować.' }),
    })
    expect(view.actions.find((action) => action.slot === 'primary')).toMatchObject({
      enabled: false,
      reasonLabel: 'Jesteś zbyt wyczerpany, by kontynuować.',
    })
    expect(view.actions.find((action) => action.slot === 'alternate')?.label).toBe('Usuń')
  })

  it('shows trough fill as disabled when water is missing', () => {
    const view = buildInteractionView({
      kind: 'playerTrough',
      position: { x: 0, z: 0 },
      promptLabel: '',
      id: 'tr1',
      complete: true,
      canFill: true,
    }, {
      hasInspect: true,
      describePlayerTroughFill: () => ({ canWork: false, reasonLabel: 'Potrzebujesz pojemnika z wodą.' }),
    })
    expect(view.actions.find((action) => action.slot === 'primary')).toMatchObject({
      label: 'Napełnij',
      enabled: false,
      reasonLabel: 'Potrzebujesz pojemnika z wodą.',
    })
  })
})

