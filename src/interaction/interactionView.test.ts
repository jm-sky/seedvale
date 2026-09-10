import { describe, expect, it } from 'vitest'
import type { Interactable } from './Interactable'
import {
  alternateActionState,
  buildInteractionView,
  interactionActionFromSkillPrompt,
  isInteractableActionable,
  primaryActionState,
} from './interactionView'

function tentTarget(promptLabel: string): Interactable {
  return {
    kind: 'tent',
    position: { x: 0, z: 0 },
    promptLabel,
    id: 'tent-1',
  }
}

describe('buildInteractionView (plan ui-input-015)', () => {
  it('maps primary-only legacy prompts', () => {
    const view = buildInteractionView(tentTarget('Rozmawiaj z Jan'), { hasInspect: false })
    expect(view.actions).toEqual([{
      slot: 'primary',
      label: 'Rozmawiaj z Jan',
      enabled: true,
      reasonLabel: '',
    }])
  })

  it('maps primary and alternate bracket prompts', () => {
    const view = buildInteractionView(tentTarget('[E] Odpocznij · [R] Zbadaj'), { hasInspect: false })
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
    expect(view.actions.filter((a) => a.slot === 'primary' || a.slot === 'alternate')).toHaveLength(1)
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
    const target = tentTarget('[E] Odpocznij')
    const before = JSON.stringify(target)
    buildInteractionView(target, { hasInspect: false })
    expect(JSON.stringify(target)).toBe(before)
  })
})

describe('touch availability helpers', () => {
  it('hides alternate when only primary exists', () => {
    const view = buildInteractionView(tentTarget('[E] Odpocznij'), { hasInspect: false })
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
