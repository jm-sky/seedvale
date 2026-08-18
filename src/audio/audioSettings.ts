/** Device audio-mix preference — not world/save state. */

export const AUDIO_STORAGE_KEY = 'seedvale:audio:v1'

export const AUDIO_VOLUME_KEYS = ['master', 'ambient', 'sfx'] as const
export type AudioVolumeKey = (typeof AUDIO_VOLUME_KEYS)[number]

export type AudioVolumes = Record<AudioVolumeKey, number>

export const DEFAULT_AUDIO_VOLUMES: AudioVolumes = {
  master: 1,
  ambient: 1,
  sfx: 1,
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}

/** Clamp 0..1; missing / non-numeric fields fall back to 1 (current mix). */
export function normalizeAudioVolumes(raw: unknown): AudioVolumes {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    master: typeof obj.master === 'number' ? clamp01(obj.master) : 1,
    ambient: typeof obj.ambient === 'number' ? clamp01(obj.ambient) : 1,
    sfx: typeof obj.sfx === 'number' ? clamp01(obj.sfx) : 1,
  }
}

export function loadAudioVolumes(): AudioVolumes {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AUDIO_VOLUMES }
    return normalizeAudioVolumes(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_AUDIO_VOLUMES }
  }
}

export function saveAudioVolumes(volumes: AudioVolumes): void {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(normalizeAudioVolumes(volumes)))
  } catch {
    // Quota / private mode — ignore.
  }
}
