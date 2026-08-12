import type { WorldConfig } from './worldConfig'

/** Legacy monolithic key — still read once to migrate into domain keys. */
const LEGACY_STORAGE_KEY = 'seedvale:worldConfig:v1'

const GRAPHICS_KEY = 'seedvale:graphics:v1'
const PLAYER_KEY = 'seedvale:player:v1'
const WORLD_KEY = 'seedvale:world:v1'

export type StoredGraphics = {
  postProcessing: WorldConfig['postProcessing']
}

export type StoredPlayer = {
  player: WorldConfig['player']
}

export type StoredWorld = {
  seed: number
  terrain: WorldConfig['terrain']
  sky: WorldConfig['sky']
  settlements: WorldConfig['settlements']
}

/** Merged view used by `createWorldConfig` — same fields as the old blob. */
export type StoredConfig = Partial<StoredGraphics> &
  Partial<StoredPlayer> &
  Partial<StoredWorld>

type LegacyStoredConfig = {
  seed?: number
  terrain?: WorldConfig['terrain']
  sky?: WorldConfig['sky']
  postProcessing?: WorldConfig['postProcessing']
  player?: WorldConfig['player']
  settlements?: WorldConfig['settlements']
}

function readJson(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writeJson(key: string, payload: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // Quota / private mode — ignore.
  }
}

function readGraphics(): Partial<StoredGraphics> | null {
  const parsed = readJson(GRAPHICS_KEY)
  if (!parsed) return null
  return parsed as Partial<StoredGraphics>
}

function readPlayer(): Partial<StoredPlayer> | null {
  const parsed = readJson(PLAYER_KEY)
  if (!parsed) return null
  return parsed as Partial<StoredPlayer>
}

function readWorld(): Partial<StoredWorld> | null {
  const parsed = readJson(WORLD_KEY)
  if (!parsed) return null
  return parsed as Partial<StoredWorld>
}

function readLegacy(): LegacyStoredConfig | null {
  const parsed = readJson(LEGACY_STORAGE_KEY)
  if (!parsed) return null
  return parsed as LegacyStoredConfig
}

function hasAnyDomain(): boolean {
  return readGraphics() != null || readPlayer() != null || readWorld() != null
}

/** Split a legacy monolithic blob into domain keys (idempotent write). */
function migrateLegacyToDomains(legacy: LegacyStoredConfig): void {
  if (legacy.postProcessing && typeof legacy.postProcessing === 'object') {
    writeJson(GRAPHICS_KEY, { postProcessing: legacy.postProcessing } satisfies StoredGraphics)
  }
  if (legacy.player && typeof legacy.player === 'object') {
    writeJson(PLAYER_KEY, { player: legacy.player } satisfies StoredPlayer)
  }
  if (
    typeof legacy.seed === 'number' ||
    legacy.terrain ||
    legacy.sky ||
    legacy.settlements
  ) {
    const world: Partial<StoredWorld> = {}
    if (typeof legacy.seed === 'number') world.seed = legacy.seed
    if (legacy.terrain) world.terrain = legacy.terrain
    if (legacy.sky) world.sky = legacy.sky
    if (legacy.settlements) world.settlements = legacy.settlements
    writeJson(WORLD_KEY, world)
  }
}

/**
 * Load config domains from localStorage. If only the legacy monolithic key
 * exists, split it into domain keys once (legacy key is left as a read
 * fallback and is not deleted).
 */
export function loadDomainConfigs(): StoredConfig | null {
  if (!hasAnyDomain()) {
    const legacy = readLegacy()
    if (legacy) migrateLegacyToDomains(legacy)
  }

  const graphics = readGraphics()
  const player = readPlayer()
  const world = readWorld()
  const legacy = !graphics && !player && !world ? readLegacy() : null

  if (!graphics && !player && !world && !legacy) return null

  return {
    postProcessing: graphics?.postProcessing ?? legacy?.postProcessing,
    player: player?.player ?? legacy?.player,
    seed: world?.seed ?? legacy?.seed,
    terrain: world?.terrain ?? legacy?.terrain,
    sky: world?.sky ?? legacy?.sky,
    settlements: world?.settlements ?? legacy?.settlements,
  }
}

/** @deprecated Prefer `loadDomainConfigs` — kept as a thin alias for callers. */
export function loadStoredConfig(): StoredConfig | null {
  return loadDomainConfigs()
}

export function saveGraphics(config: WorldConfig): void {
  const payload: StoredGraphics = {
    postProcessing: { ...config.postProcessing },
  }
  writeJson(GRAPHICS_KEY, payload)
}

export function savePlayer(config: WorldConfig): void {
  const payload: StoredPlayer = {
    player: { ...config.player },
  }
  writeJson(PLAYER_KEY, payload)
}

export function saveWorld(config: WorldConfig): void {
  const payload: StoredWorld = {
    seed: config.seed,
    terrain: structuredClone(config.terrain),
    sky: { ...config.sky },
    settlements: { ...config.settlements },
  }
  writeJson(WORLD_KEY, payload)
}

export function saveAllDomains(config: WorldConfig): void {
  saveGraphics(config)
  savePlayer(config)
  saveWorld(config)
}

/** @deprecated Prefer domain savers — writes all domains (same as `saveAllDomains`). */
export function saveWorldConfig(config: WorldConfig): void {
  saveAllDomains(config)
}
