import { describe, expect, it } from 'vitest'
import { spawnerDestroyBusyLabel, spawnerDestroyPromptLabel } from './createFauna'

describe('spawner destroy copy', () => {
  it('names the habitat, not a generic siedlisko', () => {
    expect(spawnerDestroyPromptLabel('rockDen')).toBe('[E] Zniszcz jaskinię')
    expect(spawnerDestroyBusyLabel('rockDen')).toBe('Niszczenie jaskini…')
    expect(spawnerDestroyPromptLabel('thicket')).toBe('[E] Zniszcz zagajnik')
    expect(spawnerDestroyBusyLabel('thicket')).toBe('Niszczenie zagajnika…')
    expect(spawnerDestroyPromptLabel('wolfDen')).toBe('[E] Zniszcz wilczą jamę')
    expect(spawnerDestroyBusyLabel('wolfDen')).toBe('Niszczenie wilczej jamy…')
  })
})
