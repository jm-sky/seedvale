import type { WorldConfig } from '../config/worldConfig'

/** Same shape as `StoredConfig` in `config/persistConfig.ts` — kept independent
 *  here so this module doesn't reach into config internals. */
export type SaveConfig = {
  seed: number
  terrain: WorldConfig['terrain']
  sky: WorldConfig['sky']
  player: WorldConfig['player']
}

export type SaveData = {
  version: 1
  config: SaveConfig
  /** No `y` — always recomputed from terrain via `PlayerController.setPosition`. */
  player: { x: number; z: number; yaw: number; pitch: number }
  savedAt: number
}

export function isSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.version !== 1) return false
  if (!v.config || typeof v.config !== 'object') return false
  const config = v.config as Record<string, unknown>
  if (typeof config.seed !== 'number') return false
  if (!config.terrain || typeof config.terrain !== 'object') return false
  if (!config.sky || typeof config.sky !== 'object') return false
  if (!config.player || typeof config.player !== 'object') return false
  if (!v.player || typeof v.player !== 'object') return false
  const player = v.player as Record<string, unknown>
  if (typeof player.x !== 'number' || typeof player.z !== 'number') return false
  if (typeof player.yaw !== 'number' || typeof player.pitch !== 'number') return false
  return typeof v.savedAt === 'number'
}
