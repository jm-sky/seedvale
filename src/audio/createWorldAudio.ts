import { Audio, AudioListener, AudioLoader, type Camera, Vector3 } from 'three'
import { type AudioVolumes, loadAudioVolumes } from './audioSettings'

export type { AudioVolumes } from './audioSettings'

/** Mixer bus: environment loops vs one-shot SFX. Optional override on play APIs. */
export type AudioBusId = 'ambient' | 'sfx'

export type AudioLoopHandle = {
  /** Ramps toward this gain (0-1) on each update() call instead of snapping —
   *  the caller drives crossfades by changing the target over time. */
  setTargetGain: (gain: number) => void
  dispose: () => void
}

/** World XZ (optional Y) for distance-attenuated one-shots. */
export type WorldSoundPosition = { x: number; y?: number; z: number }

/** Fire-and-forget clip at a world position — volume falls off with distance.
 *  `maxDistance` overrides the default falloff range (`DISTANCE_MAX`) for a
 *  clip that should carry farther than a standard one-shot (plan fauna-009
 *  §1 wolf howl) — `undefined` keeps the default. */
export type PlayAt = (
  url: string,
  position: WorldSoundPosition,
  volume?: number,
  bus?: AudioBusId,
  maxDistance?: number,
) => void

/** A one-shot clip's stop handle — no-op once the clip has already ended. */
export type ActiveSound = { stop: () => void }

/** Same as `PlayAt`, but returns a handle to cut the clip short — for a
 *  one-shot whose real-world action can be interrupted before it finishes
 *  (e.g. a bow-draw clip when the shot is cancelled). */
export type PlayAtCancelable = (
  url: string,
  position: WorldSoundPosition,
  volume?: number,
  bus?: AudioBusId,
  maxDistance?: number,
) => ActiveSound

export type WorldAudio = {
  listener: AudioListener
  /** Loads a clip, loops it starting at zero gain, and returns a handle to fade
   *  it in/out via setTargetGain() + update(). Defaults to the ambient bus. */
  createLoop: (url: string, bus?: AudioBusId) => AudioLoopHandle
  /** Fire-and-forget clip at a fixed volume (UI / inventory / quest thank-you).
   *  Defaults to the sfx bus. */
  playOnce: (url: string, volume?: number, bus?: AudioBusId) => void
  /** Fire-and-forget clip with distance gain from listener → `position`. */
  playAt: PlayAt
  /** Same as `playAt`, but returns a handle to stop the clip early. */
  playAtCancelable: PlayAtCancelable
  /** Player mix (master / ambient / sfx). Live — buses ramp even while paused. */
  setVolumes: (volumes: AudioVolumes) => void
  getVolumes: () => AudioVolumes
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
/** Same time-constant as Three.js `AudioListener.setMasterVolume`. */
const BUS_RAMP = 0.01

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

  const ambientBus = listener.context.createGain()
  const sfxBus = listener.context.createGain()
  ambientBus.connect(listener.getInput())
  sfxBus.connect(listener.getInput())

  const volumes: AudioVolumes = loadAudioVolumes()

  function busNode(bus: AudioBusId): GainNode {
    return bus === 'ambient' ? ambientBus : sfxBus
  }

  function attachToBus(sound: Audio, bus: AudioBusId): void {
    sound.gain.disconnect()
    sound.gain.connect(busNode(bus))
  }

  function setVolumes(next: AudioVolumes): void {
    volumes.master = clamp01(next.master)
    volumes.ambient = clamp01(next.ambient)
    volumes.sfx = clamp01(next.sfx)
    listener.setMasterVolume(volumes.master)
    const t = listener.context.currentTime
    ambientBus.gain.setTargetAtTime(volumes.ambient, t, BUS_RAMP)
    sfxBus.gain.setTargetAtTime(volumes.sfx, t, BUS_RAMP)
  }

  function getVolumes(): AudioVolumes {
    return { master: volumes.master, ambient: volumes.ambient, sfx: volumes.sfx }
  }

  setVolumes(volumes)

  // Browsers start the AudioContext suspended until a user gesture; the game's
  // own pointer-lock click is the first guaranteed one, so piggyback on it
  // instead of adding a dedicated "click to enable audio" prompt.
  const resumeContext = () => {
    if (listener.context.state === 'suspended') void listener.context.resume()
  }
  window.addEventListener('pointerdown', resumeContext)
  window.addEventListener('keydown', resumeContext)

  const activeLoops = new Set<{ sound: Audio; target: number }>()

  function createLoop(url: string, bus: AudioBusId = 'ambient'): AudioLoopHandle {
    const sound = new Audio(listener)
    attachToBus(sound, bus)
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

  const NO_OP_SOUND: ActiveSound = { stop: () => {} }

  function playOnceCancelable(url: string, volume = 1, bus: AudioBusId = 'sfx'): ActiveSound {
    const sound = new Audio(listener)
    attachToBus(sound, bus)
    let stopped = false
    loadBuffer(url)
      .then((buffer) => {
        if (stopped) return
        sound.setBuffer(buffer)
        sound.setLoop(false)
        sound.setVolume(clamp01(volume))
        sound.onEnded = () => sound.disconnect()
        sound.play()
      })
      .catch((error: unknown) => {
        console.warn(`[audio] failed to load clip "${url}"`, error)
      })
    return {
      stop() {
        if (stopped) return
        stopped = true
        if (sound.isPlaying) sound.stop()
        sound.disconnect()
      },
    }
  }

  function playOnce(url: string, volume = 1, bus: AudioBusId = 'sfx'): void {
    playOnceCancelable(url, volume, bus)
  }

  function playAt(
    url: string,
    position: WorldSoundPosition,
    volume = 1,
    bus: AudioBusId = 'sfx',
    maxDistance?: number,
  ): void {
    playAtCancelable(url, position, volume, bus, maxDistance)
  }

  function playAtCancelable(
    url: string,
    position: WorldSoundPosition,
    volume = 1,
    bus: AudioBusId = 'sfx',
    maxDistance = DISTANCE_MAX,
  ): ActiveSound {
    listener.getWorldPosition(listenerPos)
    const y = position.y ?? listenerPos.y
    const distance = Math.hypot(
      position.x - listenerPos.x,
      y - listenerPos.y,
      position.z - listenerPos.z,
    )
    const gain = clamp01(volume) * distanceGain(distance, DISTANCE_REF, maxDistance)
    if (gain < DISTANCE_GAIN_EPS) return NO_OP_SOUND
    return playOnceCancelable(url, gain, bus)
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
    ambientBus.disconnect()
    sfxBus.disconnect()
    camera.remove(listener)
  }

  return { listener, createLoop, playOnce, playAt, playAtCancelable, setVolumes, getVolumes, update, dispose }
}
