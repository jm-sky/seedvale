import { describe, expect, it } from 'vitest'
import { isSaveDataV11, loadSaveData, type SaveConfig, type SaveData, type SaveDataV10 } from './saveData'

const config = {
  seed: 1,
  terrain: { chunkSize: 64 },
  sky: { inclination: 0.5 },
  player: { name: 'Ja' },
} as SaveConfig

const v10: SaveDataV10 = {
  version: 10,
  config,
  player: { x: 3, z: 4, yaw: 0.1, pitch: 0.2 },
  savedAt: 100,
  quests: { progress: [], exp: 0, relations: {} },
  inventory: {},
  collectedItemIds: [],
  droppedItems: [],
  placedFires: [],
  timeOfDay: 0.32,
  elapsedDays: 2,
  heldTool: null,
  treeOverrides: {},
  playerTorch: null,
  placedTents: [],
  worldFlags: {},
}

describe('loadSaveData v11 map discovery', () => {
  it('migrates a v10 save to empty discovery', () => {
    const loaded = loadSaveData(v10)
    expect(loaded).not.toBeNull()
    expect(loaded?.version).toBe(11)
    expect(loaded?.map.discoveredCells).toEqual([])
    expect(loaded?.player.x).toBe(3)
    expect(loaded?.elapsedDays).toBe(2)
  })

  it('keeps discovered cells from a v11 save', () => {
    const v11: SaveData = {
      ...v10,
      version: 11,
      map: { discoveredCells: ['0,0', '1,0'] },
    }
    const loaded = loadSaveData(v11)
    expect(isSaveDataV11(loaded)).toBe(true)
    expect(loaded?.map.discoveredCells).toEqual(['0,0', '1,0'])
  })

  it('rejects a v11 save with a non-array discovery field', () => {
    expect(loadSaveData({ ...v10, version: 11, map: { discoveredCells: 1 } })).toBeNull()
  })

  it('migrates a v1 save through to empty discovery', () => {
    const loaded = loadSaveData({
      version: 1,
      config,
      player: { x: 0, z: 0, yaw: 0, pitch: 0 },
      savedAt: 1,
    })
    expect(loaded?.version).toBe(11)
    expect(loaded?.map.discoveredCells).toEqual([])
  })
})
