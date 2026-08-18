import { type Object3D, type Scene } from 'three'
import type { AnimalAgent, AnimalKind } from '../fauna/AnimalAgent'
import type { TrapItemInstance } from '../items/itemInstances'
import type { HeightSampler } from '../player/PlayerController'
import { placeOnGround } from '../settlement/props'
import {
  accumulateTrapWeatherWear,
  isTrapCooldownActive,
  isTrappableSpecies,
  type PlacedTrapRecord,
  rollTrapDetection,
  spendTrapDurability,
  startTrapCooldown,
  TRAP_CHECK_INTERVAL_SEC,
  TRAP_DEFS,
  type TrapCooldowns,
  trapDetectionChance,
  trapDetectionRoll,
  type TrapKind,
} from './animalTraps'
import { createTrapProp, disposeTrapProp, setTrapPropState } from './trapProp'

export type PlacedTrapEntry = PlacedTrapRecord & { mesh: Object3D }

export type TrapCaptureEvent = {
  trapId: string
  trapKind: TrapKind
  animalId: string
  animalKind: AnimalKind
  x: number
  z: number
  /** True when this catch used up the trap's last durability. */
  broken: boolean
}

export type PlacedTrapsHooks = {
  /** Single owner of "a capture happened" side effects — Traps XP, toast.
   *  Called exactly once per catch (implementation notes §18). */
  onCapture?: (event: TrapCaptureEvent) => void
}

export type PlacedTraps = {
  list: () => readonly PlacedTrapEntry[]
  nodes: () => readonly PlacedTrapRecord[]
  place: (
    source: TrapItemInstance,
    x: number,
    z: number,
    yaw: number,
  ) => PlacedTrapRecord
  /** Arms a `placed` trap, snapshotting the player's Traps value. Returns
   *  false if it isn't armable (already armed, or broken). */
  activate: (id: string, skillValue: number, nowDays: number) => boolean
  /** Disarms an `active` trap. Never costs durability (plan 141 §3). */
  deactivate: (id: string) => boolean
  /** Picks a non-armed trap up. Returns the record it removed (the caller
   *  decides whether an item goes back into the inventory — a `broken` trap
   *  is only cleared away). */
  collect: (id: string) => PlacedTrapRecord | null
  /** Throttled proximity + weather pass. `animals` is the fauna list the
   *  caller already iterates, not a fresh world query. */
  update: (dt: number, nowDays: number, animals: readonly AnimalAgent[]) => void
  dispose: () => void
}

/**
 * Player-placed animal traps (plan 141) — the same "player chose the spot, so
 * the whole record round-trips through the save" shape as `PlacedTents` /
 * `PlacedFires`, not a new manager. A trap is a plain world object: it holds
 * no reference to `PlayerController`/`PlayerSkills`, only the skill value
 * snapshotted when it was armed, so it keeps working when the player leaves.
 *
 * A catch only kills — it leaves an ordinary corpse for the player to
 * harvest/bury through the existing corpse interactions, same as a melee
 * kill. No meat/hide is auto-yielded and the corpse is not pre-marked
 * meat-harvested.
 */
export function createPlacedTraps(
  scene: Scene,
  sampleHeight: HeightSampler,
  /** World seed — only used to re-derive weather deterministically. */
  seed: number,
  hooks: PlacedTrapsHooks,
  initial: readonly PlacedTrapRecord[] = [],
): PlacedTraps {
  const traps: PlacedTrapEntry[] = []
  /** `trapId → animalId → in-game day the evasion cooldown expires`. Runtime
   *  only: wild fauna (and its `animalId`s) isn't persisted either, so there
   *  is nothing meaningful to restore (plan 141 §10). */
  const cooldowns = new Map<string, TrapCooldowns>()
  /** Per `(trap, animal)` encounter counter feeding `trapDetectionRoll`, so a
   *  repeat visit after the cooldown draws a fresh dice. */
  const attempts = new Map<string, number>()
  let sinceCheck = 0

  const spawn = (record: PlacedTrapRecord): void => {
    const mesh = createTrapProp(record.kind)
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    setTrapPropState(mesh, record.kind, record.state)
    scene.add(mesh)
    traps.push({ ...record, mesh })
  }

  for (const trap of initial) spawn(trap)

  const find = (id: string): PlacedTrapEntry | undefined => traps.find((entry) => entry.id === id)

  const toRecord = (entry: PlacedTrapEntry): PlacedTrapRecord => ({
    id: entry.id,
    kind: entry.kind,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    state: entry.state,
    durability: entry.durability,
    skillAtActivation: entry.skillAtActivation,
    weatherCheckedAtDay: entry.weatherCheckedAtDay,
  })

  /** Charges every weather cycle that finished since the last look. Only
   *  armed traps weather: a disarmed one is folded away, which is exactly the
   *  incentive plan 141 §7 asks for. */
  const applyWeather = (entry: PlacedTrapEntry, nowDays: number): void => {
    const def = TRAP_DEFS[entry.kind]
    const { wear, checkedAtDay } = accumulateTrapWeatherWear(seed, entry.weatherCheckedAtDay, nowDays, def)
    entry.weatherCheckedAtDay = checkedAtDay
    if (wear <= 0) return
    const spent = spendTrapDurability(entry.durability, wear)
    entry.durability = spent.durability
    if (spent.state === 'broken') {
      entry.state = 'broken'
      setTrapPropState(entry.mesh, entry.kind, entry.state)
    }
  }

  const capture = (entry: PlacedTrapEntry, animal: AnimalAgent): void => {
    // Death runs through the existing `AnimalAgent` lifecycle (collapse →
    // `onDeath` → spawn-point accounting + quests), never a manual removal.
    // Capture leaves an ordinary corpse — no meat/hide is auto-yielded and
    // it is *not* marked meat-harvested, so the player still has to walk up
    // and knife-harvest it (or shovel-bury it) exactly like any other kill.
    animal.takeDamage(animal.health.maxHp)

    const spent = spendTrapDurability(entry.durability, 1)
    entry.durability = spent.durability
    // A spent trap is always deactivated by a catch — `placed` (re-armable)
    // if durability remains, `broken` if it doesn't. It never stays `active`
    // after firing.
    entry.state = spent.state
    setTrapPropState(entry.mesh, entry.kind, entry.state)
    cooldowns.delete(entry.id)
    hooks.onCapture?.({
      trapId: entry.id,
      trapKind: entry.kind,
      animalId: animal.animalId,
      animalKind: animal.def.kind,
      x: entry.x,
      z: entry.z,
      broken: entry.state === 'broken',
    })
  }

  const resolveEncounter = (entry: PlacedTrapEntry, animal: AnimalAgent, nowDays: number): void => {
    const key = `${entry.id}|${animal.animalId}`
    const attempt = (attempts.get(key) ?? 0) + 1
    attempts.set(key, attempt)
    const chance = trapDetectionChance({
      baseChance: TRAP_DEFS[entry.kind].baseDetectionChance,
      skillValue: entry.skillAtActivation,
    })
    const detected = rollTrapDetection(chance, trapDetectionRoll(entry.id, animal.animalId, attempt))
    if (detected) {
      let byAnimal = cooldowns.get(entry.id)
      if (!byAnimal) {
        byAnimal = new Map()
        cooldowns.set(entry.id, byAnimal)
      }
      startTrapCooldown(byAnimal, animal.animalId, nowDays)
      return
    }
    capture(entry, animal)
  }

  return {
    list: () => traps,
    nodes: () => traps.map(toRecord),
    place(source, x, z, yaw) {
      const trapKind = source.kind === 'trap_good' ? 'good' : 'simple'
      const record: PlacedTrapRecord = {
        id: source.id,
        kind: trapKind,
        x,
        z,
        yaw,
        state: source.durability > 0 ? 'placed' : 'broken',
        durability: source.durability,
        skillAtActivation: 0,
        weatherCheckedAtDay: 0,
      }
      spawn(record)
      return record
    },
    activate(id, skillValue, nowDays) {
      const entry = find(id)
      if (!entry || entry.state !== 'placed') return false
      entry.state = 'active'
      entry.skillAtActivation = skillValue
      // Weather only counts while armed, so the clock restarts here.
      entry.weatherCheckedAtDay = nowDays
      setTrapPropState(entry.mesh, entry.kind, entry.state)
      return true
    },
    deactivate(id) {
      const entry = find(id)
      if (!entry || entry.state !== 'active') return false
      entry.state = 'placed'
      setTrapPropState(entry.mesh, entry.kind, entry.state)
      cooldowns.delete(entry.id)
      return true
    },
    collect(id) {
      const index = traps.findIndex((entry) => entry.id === id)
      if (index === -1) return null
      const [entry] = traps.splice(index, 1)
      if (!entry) return null
      const record = toRecord(entry)
      disposeTrapProp(entry.mesh)
      cooldowns.delete(entry.id)
      return record
    },
    update(dt, nowDays, animals) {
      sinceCheck += dt
      if (sinceCheck < TRAP_CHECK_INTERVAL_SEC) return
      sinceCheck = 0
      for (const entry of traps) {
        if (entry.state !== 'active') continue
        applyWeather(entry, nowDays)
        if (entry.state !== 'active') continue
        const radius = TRAP_DEFS[entry.kind].triggerRadius
        const radiusSq = radius * radius
        const byAnimal = cooldowns.get(entry.id)
        for (const animal of animals) {
          if (animal.isDead() || !isTrappableSpecies(animal.def.kind)) continue
          const dx = animal.mesh.position.x - entry.x
          const dz = animal.mesh.position.z - entry.z
          if (dx * dx + dz * dz > radiusSq) continue
          if (byAnimal && isTrapCooldownActive(byAnimal, animal.animalId, nowDays)) continue
          resolveEncounter(entry, animal, nowDays)
          // One trap catches one animal per pass; a capture also ends this
          // trap's armed state.
          if (entry.state !== 'active') break
        }
      }
    },
    dispose() {
      for (const trap of traps) disposeTrapProp(trap.mesh)
      traps.length = 0
      cooldowns.clear()
      attempts.clear()
    },
  }
}
