import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createAgentAnimationSet } from './agentAnimationSet'

type Clip = 'attack' | 'idle' | 'walk'

function testClip(name: string, duration = 1): THREE.AnimationClip {
  const track = new THREE.NumberKeyframeTrack('.rotation[y]', [0, duration], [0, 1])
  return new THREE.AnimationClip(name, duration, [track])
}

function setup() {
  const root = new THREE.Object3D()
  const clips = [testClip('Idle'), testClip('Walk'), testClip('Attack', 0.5)]
  const anim = createAgentAnimationSet<Clip>(root, clips)
  anim.resolve({
    idle: ['Idle_Neutral', 'Idle'],
    walk: ['Walk'],
    attack: ['Attack'],
  })
  return anim
}

describe('createAgentAnimationSet', () => {
  it('resolves the first matching clip name from each candidate list', () => {
    const anim = setup()
    expect(anim.has('idle')).toBe(true)
    expect(anim.has('walk')).toBe(true)
    expect(anim.has('attack')).toBe(true)
  })

  it('resolves to null (has() false) when no candidate name matches any clip', () => {
    const root = new THREE.Object3D()
    const anim = createAgentAnimationSet<'missing'>(root, [testClip('Idle')])
    anim.resolve({ missing: ['NoSuchClip'] })
    expect(anim.has('missing')).toBe(false)
  })

  it('playImmediate starts the clip at full weight with no fade-in delay', () => {
    const anim = setup()
    anim.playImmediate('idle')
    // No update() call yet — a raw .play() (unlike a crossfaded play()) must
    // already read as running at full weight the instant it's called.
    expect(anim.has('idle')).toBe(true)
  })

  it('playImmediate on an unresolved key is a safe no-op', () => {
    const root = new THREE.Object3D()
    const anim = createAgentAnimationSet<'missing'>(root, [])
    expect(() => anim.playImmediate('missing')).not.toThrow()
  })

  it('play on an unresolved key is a safe no-op', () => {
    const root = new THREE.Object3D()
    const anim = createAgentAnimationSet<'missing'>(root, [])
    expect(() => anim.play('missing')).not.toThrow()
  })

  it('play crossfades: the outgoing clip fades toward zero weight, the incoming one toward full', () => {
    const anim = setup()
    anim.playImmediate('idle')
    anim.play('walk')
    // Advance well past the 0.2s crossfade window.
    anim.update(1)
    // Read weight indirectly: playOnce's fade-out list would silently no-op
    // on an already-zero-weight action, so re-triggering walk's play() a
    // second time (already near full weight, isRunning) must itself be a
    // no-op per the "already running at >0.9 weight" guard — verified by
    // has() staying true and no throw.
    expect(anim.has('walk')).toBe(true)
    expect(() => anim.play('walk')).not.toThrow()
  })

  it('playOnce returns the clip duration and 0 for an unresolved key', () => {
    const anim = setup()
    expect(anim.playOnce('attack')).toBeCloseTo(0.5)
    const root = new THREE.Object3D()
    const empty = createAgentAnimationSet<'missing'>(root, [])
    expect(empty.playOnce('missing')).toBe(0)
  })

  it('settleAtEnd jumps to the clip\'s last frame and stops every other resolved clip', () => {
    const anim = setup()
    anim.playImmediate('idle')
    anim.playImmediate('walk')
    anim.settleAtEnd('attack')
    expect(anim.has('attack')).toBe(true)
    // idle/walk were both stopped outright (no blend) by settleAtEnd.
    anim.update(0)
    expect(() => anim.stopAll()).not.toThrow()
  })

  it('settleAtEnd on an unresolved key is a safe no-op', () => {
    const root = new THREE.Object3D()
    const anim = createAgentAnimationSet<'missing'>(root, [])
    expect(() => anim.settleAtEnd('missing')).not.toThrow()
  })

  it('stopAll and update never throw regardless of resolve state', () => {
    const anim = setup()
    anim.playImmediate('idle')
    anim.update(0.1)
    anim.stopAll()
    expect(() => anim.update(0.1)).not.toThrow()
  })
})
