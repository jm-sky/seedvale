// @vitest-environment jsdom
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActiveSound, PlayAtCancelable } from '../audio/createWorldAudio'
import type { Place } from '../settlement/places'
import type { SettlementLandmarks } from '../settlement/props'
import {
  configureNpcPlayerReactionAudio,
  NpcAgent,
} from './NpcAgent'

function makeLandmarks(): SettlementLandmarks {
  const garden = new THREE.Vector3(3, 0, 3)
  return {
    well: new THREE.Vector3(1, 0, 1),
    stockpile: new THREE.Vector3(2, 0, 2),
    garden,
    gardens: [garden],
    cultivationAnchors: [],
    haySpots: [],
    market: new THREE.Vector3(4, 0, 4),
    markets: [],
    blacksmithWorkplaces: [],
    homes: [],
    houses: [],
    trees: [],
    dockRoute: [],
    landPlots: [],
    householdStorages: [],
    householdWoodStorages: [],
    settlementStorage: new THREE.Vector3(5, 0, 5),
    noticeBoard: new THREE.Vector3(7, 0, 7),
  }
}

function homePlace(): Place {
  return {
    id: 's1:home:0',
    type: 'home',
    position: new THREE.Vector3(0, 0, 0),
  }
}

async function createTestNpc(playAtCancelable: PlayAtCancelable): Promise<NpcAgent> {
  return NpcAgent.create({
    sampleHeight: () => 0,
    waterLevel: -1,
    collidersNear: () => [],
    landmarks: makeLandmarks(),
    home: homePlace(),
    workplace: null,
    socialPlace: null,
    treeIndex: 0,
    needOffset: 0,
    member: {
      name: 'Jan',
      lastName: 'Test',
      relation: 'single',
      scale: 1,
      age: 40,
      character: {
        name: 'Jan',
        gender: 'male',
        role: 'guard',
        personality: {
          openness: 0.5,
          conscientiousness: 0.5,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.5,
        },
        traits: [],
      },
    },
    familyMembers: [],
    // Force capsule fallback — no real GLB in unit tests.
    modelUrl: '/__missing_npc_model__.glb',
    playAtCancelable,
  })
}

afterEach(() => {
  configureNpcPlayerReactionAudio(null)
})

describe('NpcAgent player reaction voice', () => {
  it('stores a cancelable reaction handle that stopPlayerReactionVoice can cut', async () => {
    const stop = vi.fn()
    const playAtCancelable = vi.fn((): ActiveSound => ({ stop }))
    const npc = await createTestNpc(playAtCancelable)

    ;(npc as unknown as { playReactionSound: (tier: string) => void }).playReactionSound('normal')
    expect(playAtCancelable).toHaveBeenCalledTimes(1)
    expect(stop).not.toHaveBeenCalled()

    npc.stopPlayerReactionVoice()
    expect(stop).toHaveBeenCalledTimes(1)

    // Idempotent — second stop must not throw or re-stop.
    npc.stopPlayerReactionVoice()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('replaces a previous reaction by stopping it before the next play', async () => {
    const stopA = vi.fn()
    const stopB = vi.fn()
    let n = 0
    const playAtCancelable = vi.fn((): ActiveSound => ({ stop: n++ === 0 ? stopA : stopB }))
    const npc = await createTestNpc(playAtCancelable)
    const play = (npc as unknown as { playReactionSound: (tier: string) => void }).playReactionSound.bind(npc)

    play('normal')
    play('warm')

    expect(playAtCancelable).toHaveBeenCalledTimes(2)
    expect(stopA).toHaveBeenCalledTimes(1)
    expect(stopB).not.toHaveBeenCalled()
  })

  it('uses module-level configureNpcPlayerReactionAudio when deps omit cancelable', async () => {
    const stop = vi.fn()
    const playAtCancelable = vi.fn((): ActiveSound => ({ stop }))
    configureNpcPlayerReactionAudio(playAtCancelable)

    const npc = await NpcAgent.create({
      sampleHeight: () => 0,
      waterLevel: -1,
      collidersNear: () => [],
      landmarks: makeLandmarks(),
      home: homePlace(),
      workplace: null,
      socialPlace: null,
      treeIndex: 1,
      needOffset: 0,
      member: {
        name: 'Ola',
        lastName: 'Test',
        relation: 'single',
        scale: 1,
        age: 35,
        character: {
          name: 'Ola',
          gender: 'female',
          role: 'trader',
          personality: {
            openness: 0.5,
            conscientiousness: 0.5,
            extraversion: 0.5,
            agreeableness: 0.5,
            neuroticism: 0.5,
          },
          traits: [],
        },
      },
      familyMembers: [],
      modelUrl: '/__missing_npc_model__.glb',
    })

    ;(npc as unknown as { playReactionSound: (tier: string) => void }).playReactionSound('normal')
    expect(playAtCancelable).toHaveBeenCalledTimes(1)
    npc.stopPlayerReactionVoice()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
