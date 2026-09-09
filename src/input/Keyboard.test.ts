// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createKeyboard } from './Keyboard'

function press(code: string, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, cancelable: true }))
}

function release(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, cancelable: true }))
}

describe('Keyboard inspect (plan ui-input-014)', () => {
  let keyboard: ReturnType<typeof createKeyboard>

  beforeEach(() => {
    keyboard = createKeyboard()
  })

  afterEach(() => {
    keyboard.dispose()
  })

  it('latches inspect on KeyV and consumeInspect clears the edge', () => {
    press('KeyV')
    expect(keyboard.state.inspect).toBe(true)
    expect(keyboard.consumeInspect()).toBe(true)
    expect(keyboard.state.inspect).toBe(false)
    expect(keyboard.consumeInspect()).toBe(false)
  })

  it('does not retrigger inspect on key repeat', () => {
    press('KeyV')
    expect(keyboard.consumeInspect()).toBe(true)
    press('KeyV', true)
    expect(keyboard.consumeInspect()).toBe(false)
    release('KeyV')
    press('KeyV')
    expect(keyboard.consumeInspect()).toBe(true)
  })

  it('keeps T as dismount and E/R as interact / altInteract', () => {
    press('KeyT')
    press('KeyE')
    press('KeyR')
    expect(keyboard.consumeDismount()).toBe(true)
    expect(keyboard.consumeInteract()).toBe(true)
    expect(keyboard.consumeAltInteract()).toBe(true)
    expect(keyboard.consumeInspect()).toBe(false)
  })
})
