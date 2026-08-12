import { Audio, AudioListener, AudioLoader, Vector3, type Camera } from 'three'

export type AudioLoopHandle = {
  /** Ramps toward this gain (0-1) on each update() call instead of snapping —
   *  the caller drives crossfades by changing the target over time. */
  setTargetGain: (gain: number) => void
  dispose: () => void
}

/** World XZ (optional Y) for distance-attenuated one-shots. */
export type WorldSoundPosition = { x: number; y?: number; z: number }

/** Fire-and-forget clip at a world position — volume falls off with distance. */
export type PlayAt = (url: string, position: WorldSoundPosition, volume?: number) => void

export type WorldAudio = {
  listener: AudioListener
  /** Loads a clip, loops it starting at zero gain, and returns a handle to fade
   *  it in/out via setTargetGain() + update(). */
  createLoop: (url: string) => AudioLoopHandle
  /** Fire-and-forget clip at a fixed volume (UI / inventory / quest thank-you). */
  playOnce: (url: string, volume?: number) => void
  /** Fire-and-forget clip with distance gain from listener → `position`. */
  playAt: PlayAt
  /** Advances all active loop gains toward their targets — call once per frame. */
  update: (dt: number) => void
  dispose: () => void
}

/** Full category gain within this distance (world units).
 *  Kept near interact range so ~3 m already softens instead of “inside the source”. */
export const DISTANCE_REF = 1.5
/** Silent at and beyond this distance. */
export const DISTANCE_MAX = 28
/** Skip playback when effective gain is below this. */
export const DISTANCE_GAIN_EPS = 0.02

/** Gain change per second when a loop's target moves — fast enough to feel
 *  responsive, slow enough to avoid audible clicks/pops on crossfade. */
const GAIN_LERP_SPEED = 1.5

const audioLoader = new AudioLoader()
const bufferCache = new Map<string, Promise<AudioBuffer>>()

function loadBuffer(url: string): Promise<AudioBuffer> {
  let cached = bufferCache.get(url)
  if (!cached) {
    cached = audioLoader.loadAsync(url)
    bufferCache.set(url, cached)
  }
  return cached
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Linear distance → gain multiplier (1 inside ref, 0 at/after max). Pure — unit-tested. */
export function distanceGain(
  distance: number,
  refDistance = DISTANCE_REF,
  maxDistance = DISTANCE_MAX,
): number {
  if (distance <= refDistance) return 1
  if (distance >= maxDistance) return 0
  return 1 - (distance - refDistance) / (maxDistance - refDistance)
}

/** Camera-attached AudioListener plus a small mixer for looped, gain-lerped
 *  layers (ambient beds) and one-shot clips (reaction sounds) — shared
 *  foundation for both, so neither has to build its own AudioContext plumbing. */
export function createWorldAudio(camera: Camera): WorldAudio {
  const listener = new AudioListener()
  camera.add(listener)
  const listenerPos = new Vector3()

  // Browsers start the AudioContext suspended until a user gesture; the game's
  // own pointer-lock click is the first guaranteed one, so piggyback on it
  // instead of adding a dedicated "click to enable audio" prompt.
  const resumeContext = () => {
    if (listener.context.state === 'suspended') void listener.context.resume()
  }
  window.addEventListener('pointerdown', resumeContext)
  window.addEventListener('keydown', resumeContext)

  const activeLoops = new Set<{ sound: Audio; target: number }>()

  function createLoop(url: string): AudioLoopHandle {
    const sound = new Audio(listener)
    const entry = { sound, target: 0 }
    activeLoops.add(entry)

    loadBuffer(url)
      .then((buffer) => {
        if (!activeLoops.has(entry)) return // disposed before load finished
        sound.setBuffer(buffer)
        sound.setLoop(true)
        sound.setVolume(0)
        sound.play()
      })
      .catch((error: unknown) => {
        console.warn(`[audio] failed to load loop "${url}"`, error)
      })

    return {
      setTargetGain(gain: number) {
        entry.target = clamp01(gain)
      },
      dispose() {
        activeLoops.delete(entry)
        sound.stop()
        sound.disconnect()
      },
    }
  }

  function playOnce(url: string, volume = 1): void {
    const sound = new Audio(listener)
    loadBuffer(url)
      .then((buffer) => {
        sound.setBuffer(buffer)
        sound.setLoop(false)
        sound.setVolume(clamp01(volume))
        sound.onEnded = () => sound.disconnect()
        sound.play()
      })
      .catch((error: unknown) => {
        console.warn(`[audio] failed to load clip "${url}"`, error)
      })
  }

  function playAt(url: string, position: WorldSoundPosition, volume = 1): void {
    listener.getWorldPosition(listenerPos)
    const y = position.y ?? listenerPos.y
    const distance = Math.hypot(
      position.x - listenerPos.x,
      y - listenerPos.y,
      position.z - listenerPos.z,
    )
    const gain = clamp01(volume) * distanceGain(distance)
    if (gain < DISTANCE_GAIN_EPS) return
    playOnce(url, gain)
  }

  function update(dt: number): void {
    const step = GAIN_LERP_SPEED * dt
    for (const entry of activeLoops) {
      const current = entry.sound.getVolume()
      const diff = entry.target - current
      if (Math.abs(diff) < 0.001) continue
      entry.sound.setVolume(current + Math.sign(diff) * Math.min(Math.abs(diff), step))
    }
  }

  function dispose(): void {
    window.removeEventListener('pointerdown', resumeContext)
    window.removeEventListener('keydown', resumeContext)
    for (const entry of activeLoops) {
      entry.sound.stop()
      entry.sound.disconnect()
    }
    activeLoops.clear()
    camera.remove(listener)
  }

  return { listener, createLoop, playOnce, playAt, update, dispose }
}
