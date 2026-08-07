import type { WorldConfig } from './worldConfig'

const STORAGE_KEY = 'seedvale:worldConfig:v1'

type StoredConfig = {
  seed: number
  terrain: WorldConfig['terrain']
  sky: WorldConfig['sky']
  postProcessing: WorldConfig['postProcessing']
  player: WorldConfig['player']
}

export function loadStoredConfig(): Partial<StoredConfig> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Partial<StoredConfig>
  } catch {
    return null
  }
}

export function saveWorldConfig(config: WorldConfig): void {
  const payload: StoredConfig = {
    seed: config.seed,
    terrain: structuredClone(config.terrain),
    sky: { ...config.sky },
    postProcessing: { ...config.postProcessing },
    player: { ...config.player },
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota / private mode — ignore.
  }
}
