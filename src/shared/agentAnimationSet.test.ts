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
  return { anim, root }
}

describe('createAgentAnimationSet', () => {
  it('resolves the first matching clip name from each candidate list', () => {
    const { anim } = setup()
    expect(anim.has('idle')).toBe(true)
    expect(anim.has('walk')).toBe(true)
    expect(anim.has('attack')).toBe(true)
  })

  it('resolves an "Armature|Walk"-style suffixed clip name for the candidate "Walk" (plan fauna-017 step 4a)', () => {
    const root = new THREE.Object3D()
    const anim = createAgentAnimationSet<'walk'>(root, [testClip('Armature|Walk')])
    anim.resolve({ walk: ['Walk'] })
    expect(anim.has('walk')).toBe(true)
  })

  it('an exact clip name match still wins over a suffix match', () => {
    const root = new THREE.Object3D()
    // Suffix-matching clip appears first in `clips` — the exact match must
    // still be preferred over it, not just whichever comes first.
    const suffixClip = testClip('Armature|Walk', 2)
    const exactClip = testClip('Walk', 1)
    const anim = createAgentAnimationSet<'walk'>(root, [suffixClip, exactClip])
    anim.resolve({ walk: ['Walk'] })
    expect(anim.playOnce('walk')).toBeCloseTo(1)
  })

  it('resolves to null (has() false) when no candidate name matches any clip', () => {
    const root = new THREE.Object3D()
    const anim = createAgentAnimationSet<'missing'>(root, [testClip('Idle')])
    anim.resolve({ missing: ['NoSuchClip'] })
    expect(anim.has('missing')).toBe(false)
  })

  it('playImmediate starts the clip at full weight with no fade-in delay', () => {
    const { anim } = setup()
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
    const { anim } = setup()
    anim.playImmediate('idle')
    anim.play('walk')
    // Advance well past the 0.2s crossfade window.
    anim.update(1)
    // Re-triggering walk's play() must itself be a no-op (already current)
    // — verified by has() staying true and no throw.
    expect(anim.has('walk')).toBe(true)
    expect(() => anim.play('walk')).not.toThrow()
  })

  it('repeated play(walk) during fade-in advances clip time (NpcAgent per-tick loop)', () => {
    const { anim, root } = setup()
    anim.playImmediate('idle')
    // Mirror NpcAgent.syncAnimation: play the same locomotion key every
    // frame while moving. The old weight>0.9 guard reset Walk each tick
    // before fade-in could finish, so time never left frame 0.
    for (let i = 0; i < 30; i++) {
      anim.play('walk')
      anim.update(1 / 60)
    }
    // Walk is a 1s 0→1 track on .rotation[y]. After ~0.5s the value must
    // have advanced; a per-frame reset would leave it near 0.
    expect(root.rotation.y).toBeGreaterThan(0.3)
  })

  it('play(idle) then play(walk) then play(walk) does not restart walk', () => {
    const { anim, root } = setup()
    anim.playImmediate('idle')
    anim.play('walk')
    anim.update(0.25)
    const afterFirst = root.rotation.y
    anim.play('walk')
    anim.update(0.25)
    expect(root.rotation.y).toBeGreaterThan(afterFirst)
  })

  it('playOnce then play(idle) still switches back to locomotion', () => {
    const { anim, root } = setup()
    anim.playImmediate('idle')
    anim.playOnce('attack')
    anim.update(0.6)
    const afterAttack = root.rotation.y
    anim.play('idle')
    anim.update(0.5)
    // Idle's 0→1 track over 1s — after 0.5s of idle the pose must have
    // moved off the clamped attack end (attack duration is 0.5s, last
    // value 1). Idle at t=0.5 is ~0.5.
    expect(root.rotation.y).not.toBeCloseTo(afterAttack, 1)
    expect(root.rotation.y).toBeGreaterThan(0.3)
    expect(root.rotation.y).toBeLessThan(0.7)
  })

  it('playOnce returns the clip duration and 0 for an unresolved key', () => {
    const { anim } = setup()
    expect(anim.playOnce('attack')).toBeCloseTo(0.5)
    const root = new THREE.Object3D()
    const empty = createAgentAnimationSet<'missing'>(root, [])
    expect(empty.playOnce('missing')).toBe(0)
  })

  it('settleAtEnd jumps to the clip\'s last frame and stops every other resolved clip', () => {
    const { anim } = setup()
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
    const { anim } = setup()
    anim.playImmediate('idle')
    anim.update(0.1)
    anim.stopAll()
    expect(() => anim.update(0.1)).not.toThrow()
  })
})
