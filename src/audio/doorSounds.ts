/** House threshold one-shots (S09 open/close + S14 latch/creak). */

import type { PlayAt, WorldSoundPosition } from './createWorldAudio'

export const DOOR_OPEN_SOUND_URL = '/sounds/door-open-01.ogg'
export const DOOR_CLOSE_SOUND_URL = '/sounds/door-close-01.ogg'
export const DOOR_LATCH_SOUND_URL = '/sounds/door-latch-01.ogg'
export const DOOR_CREAK_SOUND_URLS = ['/sounds/door-creak-01.ogg', '/sounds/door-creak-02.ogg'] as const

const DOOR_VOLUME = 0.45
const LATCH_VOLUME = 0.32
const CREAK_VOLUME = 0.28

/** Extra metres allowed before an exit fires — avoids chatter on the rim. */
export const HOUSE_DOOR_EXIT_SLOP = 0.45

export type HouseDoorTarget = {
  id: string
  x: number
  z: number
  radius: number
}

function hypot2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz)
}

/** Nearest house whose circle contains (x, z). `inflate` grows the radius (exit hysteresis). */
export function houseContaining(
  x: number,
  z: number,
  houses: readonly HouseDoorTarget[],
  inflate = 0,
): HouseDoorTarget | null {
  let best: HouseDoorTarget | null = null
  let bestDist = Infinity
  for (const house of houses) {
    const dist = hypot2(x, z, house.x, house.z)
    if (dist > house.radius + inflate) continue
    if (dist < bestDist) {
      best = house
      bestDist = dist
    }
  }
  return best
}

export function playDoorOpen(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(DOOR_LATCH_SOUND_URL, position, LATCH_VOLUME)
  playAt(DOOR_OPEN_SOUND_URL, position, DOOR_VOLUME)
}

export function playDoorClose(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(DOOR_CLOSE_SOUND_URL, position, DOOR_VOLUME)
  const creak = DOOR_CREAK_SOUND_URLS[Math.floor(Math.random() * DOOR_CREAK_SOUND_URLS.length)]
  if (creak) playAt(creak, position, CREAK_VOLUME)
}

export function createHouseDoorTracker(): {
  update: (x: number, z: number, houses: readonly HouseDoorTarget[], playAt: PlayAt) => void
  reset: () => void
} {
  let insideId: string | null = null

  return {
    update(x, z, houses, playAt) {
      const current = insideId
        ? houseContaining(x, z, houses, HOUSE_DOOR_EXIT_SLOP)
        : houseContaining(x, z, houses, 0)
      const nextId = current?.id ?? null
      if (nextId === insideId) return
      if (current && !insideId) {
        playDoorOpen(playAt, { x: current.x, z: current.z })
      } else if (!current && insideId) {
        const previous = houses.find((h) => h.id === insideId)
        if (previous) playDoorClose(playAt, { x: previous.x, z: previous.z })
      } else if (current && insideId && current.id !== insideId) {
        const previous = houses.find((h) => h.id === insideId)
        if (previous) playDoorClose(playAt, { x: previous.x, z: previous.z })
        playDoorOpen(playAt, { x: current.x, z: current.z })
      }
      insideId = nextId
    },
    reset() {
      insideId = null
    },
  }
}
