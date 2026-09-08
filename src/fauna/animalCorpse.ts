import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { AnimalKind } from './animalDefs'
import { tintPropMaterials } from '../settlement/props'
import { drainStamina, type StaminaState } from '../shared/StaminaState'
import { createBloodSplat, disposeBloodSplat } from './bloodSplat'
import { animateCorpseRotFx, createCorpseRotFx, disposeCorpseRotFx } from './corpseDecayFx'
import {
  createHarvestedRemainsAsync,
  createNaturalRemainsAsync,
  disposeHarvestedRemains,
} from './harvestedRemains'

/**
 * @domain fauna
 * @role Corpse/remains/decay/rot-FX/rabies-exposure/food-claim state
 *  machine for one dead `AnimalAgent` (plan fauna-017 step 5, review E3) —
 *  plain state plus free functions over an explicit `CorpseHost`, mirroring
 *  how `AnimalLife.ts` owns `AnimalLifeState` without owning the animal.
 *  Not a second entity: `health.dead` stays authoritative on `AnimalAgent`,
 *  and every public method there (`bury`, `harvestMeat`, `corpsePhase`,
 *  `claimAsFood`, …) stays a thin delegate into this module, so no cross-
 *  agent call shape changes.
 */

/** Natural (unharvested, unburied) corpse decay phase (plan 188) — both
 *  thresholds sit inside `CORPSE_LINGER_SECONDS`, so the existing 60 s total
 *  unharvested lifetime (`corpseLingerSeconds(false)`/`readyToRemove()`) is
 *  unchanged; this only subdivides it into a visibly distinct progression. */
export type CorpsePhase = 'fresh' | 'rotting' | 'bones'

/** Seconds a corpse stays in the scene (frozen pose) before it's disposed. */
const CORPSE_LINGER_SECONDS = 60
/** Seconds harvested remains stay after a knife harvest (plan 137) — own
 *  lifetime, not whatever was left of the unharvested 60 s linger. */
export const HARVESTED_REMAINS_LINGER_SECONDS = 90

export function corpseLingerSeconds(meatHarvested: boolean): number {
  return meatHarvested ? HARVESTED_REMAINS_LINGER_SECONDS : CORPSE_LINGER_SECONDS
}

/** Seconds after death before a natural corpse starts visibly rotting. */
const CORPSE_ROT_ONSET_SECONDS = 20
/** Seconds after death a natural corpse decomposes into a bones pile. */
const CORPSE_BONES_ONSET_SECONDS = 40
/** Distance (world units) within which a rotting corpse gets its lightweight
 *  particle/fog FX — beyond this, only lifecycle timers/state keep advancing
 *  (plan 188 §6: simulation truth vs. presentation). */
const CORPSE_FX_DISTANCE = 22
/** Radius (world units) within which a rotting corpse saps nearby live
 *  fauna's stamina — the v1 "negative proximity effect" hook (plan 188 §4),
 *  reusing the existing `AnimalLifeState.stamina` needs integration point
 *  instead of a new disease/status-effect system. */
const CORPSE_ROT_INFLUENCE_RADIUS = 5
const CORPSE_ROT_STAMINA_DRAIN_PER_SEC = 0.03
/** Radius (world units) within which a live animal's contact with a
 *  rabies-infected, `rotting` corpse can transmit rabies (plan fauna-001 —
 *  the feature's explicit "wejście w promień 0.5 m" figure). */
export const RABIES_CORPSE_CONTACT_RADIUS = 0.5
/** Chance a single corpse-contact exposure actually transmits rabies (plan
 *  fauna-001 — the feature's explicit 50% figure). */
export const RABIES_CORPSE_INFECTION_CHANCE = 0.5
/** Sickly tint applied to a rotting corpse's materials — same technique as
 *  `markDangerous()`'s `tintPropMaterials` call, just a different hex. */
const CORPSE_ROT_TINT_HEX = 0x3a4224

/** Pure phase-from-elapsed-time lookup — unit-testable without instantiating
 *  `AnimalAgent`/Three.js (plan 188). Only meaningful for a dead, unharvested,
 *  unburied corpse; callers gate those cases separately. */
export function corpsePhaseFromElapsed(elapsedSeconds: number): CorpsePhase {
  if (elapsedSeconds >= CORPSE_BONES_ONSET_SECONDS) return 'bones'
  if (elapsedSeconds >= CORPSE_ROT_ONSET_SECONDS) return 'rotting'
  return 'fresh'
}

/** Whether a rotting corpse's lightweight FX should be presented — distance
 *  gate only, never a reason to pause the lifecycle itself (plan 188 §6/§9).
 *  Pure/exported so the presentation rule is unit-testable without Three.js. */
export function rotFxRelevant(phase: CorpsePhase, distanceToObserver: number): boolean {
  return phase === 'rotting' && distanceToObserver <= CORPSE_FX_DISTANCE
}

/** Whether a corpse can still yield a knife-harvest — meat is only good
 *  while `fresh`; once natural decay has moved it into `rotting`/`bones` (or
 *  it's been buried, or already harvested), it's a lost source (plan 188
 *  follow-up: "meat only from fresh corpses"). Pure/exported so
 *  `AnimalAgent.canHarvestMeat()`'s rule is unit-testable without Three.js,
 *  same technique as `corpsePhaseFromElapsed`. */
export function canHarvestMeatFrom(opts: {
  dead: boolean
  meatHarvested: boolean
  buried: boolean
  corpsePhase: CorpsePhase
}): boolean {
  return opts.dead && !opts.meatHarvested && !opts.buried && opts.corpsePhase === 'fresh'
}

/** Single infection roll shared by bite and corpse-contact transmission
 *  (plan fauna-001) — one call per discrete event (a landed bite, or a
 *  corpse's first-contact exposure), never per-tick, so the outcome is
 *  independent of frame rate/tick frequency. Pure/exported so it's
 *  unit-testable without instantiating `AnimalAgent`. */
export function rollsRabiesInfection(chance: number, roll: number): boolean {
  return roll < chance
}

/** Whether a live animal at `distance` from a corpse counts as rabies
 *  contact (plan fauna-001) — only a `rotting`, rabies-infected corpse is
 *  contagious; `fresh`/`bones` corpses and healthy corpses never are. Pure
 *  so it's unit-testable without instantiating `AnimalAgent`/Three.js, same
 *  technique as `corpsePhaseFromElapsed`. */
export function isRabiesCorpseContact(opts: {
  corpsePhase: CorpsePhase
  corpseInfected: boolean
  distance: number
}): boolean {
  return opts.corpseInfected && opts.corpsePhase === 'rotting' && opts.distance < RABIES_CORPSE_CONTACT_RADIUS
}

/** Plain corpse/remains/decay/claim state for one `AnimalAgent` — created
 *  once at construction (mirrors `createAnimalLifeState()`), mutated in
 *  place by every function below. `snapshot()`/`hydrate()` stay on
 *  `AnimalAgent` and read/write `timeSinceDeath`/`meatHarvested` directly. */
export type AnimalCorpseState = {
  timeSinceDeath: number
  /** Current natural-decay phase — stays `'fresh'` for the lifetime of a
   *  harvested or buried corpse, since `advanceAnimalCorpse` short-circuits
   *  for those. */
  phase: CorpsePhase
  /** Set by `buryCorpse()` — stops natural decay progression/FX immediately
   *  so a buried corpse never later produces a natural bones pile. */
  buried: boolean
  /** Set once the player knife-harvests `raw_meat` from this corpse (plan
   *  106) — independent of `consumedPhase` (predator eating and player
   *  harvesting are different consumers), guards against harvesting twice. */
  meatHarvested: boolean
  /** Pauses corpse linger while the player is mid-harvest (Esc-cancellable
   *  busy channel) so the body can't despawn underneath the overlay. */
  held: boolean
  /** Set on a dead prey's corpse by the predator currently eating it —
   *  guards against two predators completing an eat action on the same
   *  corpse (plan 094). Untyped (`unknown`) rather than `AnimalAgent` so
   *  this module never imports that class as a value — same structural-
   *  candidate technique `pickRabidTarget`/`resolveDogGuardTarget` use. */
  claimedBy: unknown | null
  /** The `CorpsePhase` a predator was in when it last finished eating this
   *  corpse, `null` until then (plan 094/fauna-005) — per-phase rather than
   *  a single flag so a corpse eaten `fresh` can still be scavenged again
   *  once it later decays into `rotting`/`bones`: only the *current* phase
   *  being equal to this value means "already eaten, no food left here". */
  consumedPhase: CorpsePhase | null
  /** `animalId`s of live animals this corpse has already rolled a rabies
   *  contact-exposure check against (plan fauna-001) — a one-shot guard so
   *  an animal lingering next to an infected `rotting` corpse doesn't get
   *  re-rolled every tick. Only ever populated/read while the source
   *  animal is `rabid`. */
  exposedAnimalIds: Set<string>
  bloodSplat: THREE.Object3D | null
  bloodSplatToken: number
  harvestedRemains: THREE.Object3D | null
  harvestedRemainsToken: number
  /** Natural (unharvested) decay endpoint — a bones pile with no hide/meat,
   *  distinct from `harvestedRemains` (plan 188). Mutually exclusive with it:
   *  `advanceAnimalCorpse` never runs once `meatHarvested` is set. */
  naturalRemains: THREE.Object3D | null
  naturalRemainsToken: number
  /** Lightweight rotting-corpse particle/fog group, present only while the
   *  corpse is in the `rotting` phase *and* within `CORPSE_FX_DISTANCE` of
   *  the observer (plan 188 §6/§9). */
  rotFx: THREE.Object3D | null
}

export function createAnimalCorpseState(): AnimalCorpseState {
  return {
    timeSinceDeath: 0,
    phase: 'fresh',
    buried: false,
    meatHarvested: false,
    held: false,
    claimedBy: null,
    consumedPhase: null,
    exposedAnimalIds: new Set(),
    bloodSplat: null,
    bloodSplatToken: 0,
    harvestedRemains: null,
    harvestedRemainsToken: 0,
    naturalRemains: null,
    naturalRemainsToken: 0,
    rotFx: null,
  }
}

/** Structural view of the live `AnimalAgent` a corpse function needs — never
 *  a value import of `AnimalAgent` itself (would recreate the cycle E2
 *  already broke). An `AnimalAgent` instance satisfies this structurally. */
export type CorpseHost = {
  readonly animalId: string
  readonly mesh: THREE.Object3D
  readonly isCapsule: boolean
  readonly def: { readonly kind: AnimalKind, readonly modelHeight: number }
  readonly sampleHeight: HeightSampler
}

/** Structural view of a nearby live animal for rot-influence/rabies-exposure
 *  scans — same technique as `CorpseHost`, built entirely on `AnimalAgent`'s
 *  existing public API (`isDead`/`isRabid`/`infectWithRabies`) so no field
 *  needs widening past `private` for this. Production passes the real
 *  `AnimalAgent[]` with no allocation; tests can pass plain objects. */
export type CorpseNeighbour = {
  readonly animalId: string
  readonly mesh: { readonly position: { readonly x: number, readonly z: number } }
  isDead: () => boolean
  readonly life: { readonly stamina: StaminaState }
  isRabid: () => boolean
  infectWithRabies: () => void
}

/** Player shovel-bury — mark corpse for disposal on the next fauna/
 *  settlement tick. Also stops natural decay immediately (plan 188) — a
 *  buried corpse must never later produce a natural bones pile. */
export function buryCorpse(state: AnimalCorpseState): void {
  state.buried = true
  disposeAnimalCorpseRotFx(state)
  state.timeSinceDeath = HARVESTED_REMAINS_LINGER_SECONDS
}

/** True once a dead agent's corpse has lingered long enough to be disposed. */
export function corpseReadyToRemove(state: AnimalCorpseState, dead: boolean): boolean {
  const linger = corpseLingerSeconds(state.meatHarvested)
  return dead && !state.held && state.timeSinceDeath >= linger
}

/** Hide the living GLB/capsule without hiding the CSS2D label or the
 *  remains we'll parent onto the same root. Capsule geometry lives on
 *  `host.mesh` itself, so `mesh.visible = false` would also hide children. */
export function hideLivingVisual(host: CorpseHost): void {
  if (host.isCapsule) {
    const mat = (host.mesh as THREE.Mesh).material
    if (Array.isArray(mat)) {
      for (const m of mat) m.visible = false
    } else {
      mat.visible = false
    }
    return
  }
  host.mesh.traverse((child) => {
    if (child === host.mesh) return
    if ((child as { isCSS2DObject?: boolean }).isCSS2DObject) return
    let walk: THREE.Object3D | null = child
    while (walk && walk !== host.mesh) {
      if (walk.name === 'harvested-remains' || walk.name === 'natural-remains') return
      walk = walk.parent
    }
    if ((child as THREE.Mesh).isMesh) child.visible = false
  })
}

/** GLB remains as a mesh child — token so dispose mid-load does not parent
 *  a stale clone. Fallback pile is still a Group named `harvested-remains`.
 *  Exported: `harvestCorpseMeat()` calls it, and `AnimalAgent.hydrate()`
 *  calls it directly for a save that was already harvested at capture time. */
export async function spawnHarvestedRemains(state: AnimalCorpseState, host: CorpseHost): Promise<void> {
  const token = ++state.harvestedRemainsToken
  const remains = await createHarvestedRemainsAsync(host.def.kind, host.def.modelHeight)
  if (token !== state.harvestedRemainsToken || !host.mesh.parent) {
    disposeHarvestedRemains(remains)
    return
  }
  state.harvestedRemains = remains
  host.mesh.add(remains)
}

/** Player knife-harvest: marks this corpse's meat as taken and swaps the
 *  living mesh for harvested remains (plan 137/138). State/TTL is
 *  synchronous; the GLB pile attaches asynchronously like the blood splat.
 *  Caller (`AnimalAgent.harvestMeat()`) still owns `canHarvestMeat()`'s
 *  final-invariant re-check, `mesh.rotation.z`/`snapY()` (movement) and
 *  hiding the label (presentation) — this only owns the corpse-state side. */
export function harvestCorpseMeat(state: AnimalCorpseState, host: CorpseHost): void {
  state.meatHarvested = true
  state.timeSinceDeath = 0
  // Leave the natural decay path (plan 188) — any rotting FX/bones already
  // produced no longer apply once the player claims the harvested-remains path.
  disposeAnimalCorpseRotFx(state)
  if (state.naturalRemains) {
    state.naturalRemainsToken++
    disposeHarvestedRemains(state.naturalRemains)
    state.naturalRemains = null
  }
  state.phase = 'fresh'
  hideLivingVisual(host)
  void spawnHarvestedRemains(state, host)
}

/** Ground splat as a scene sibling — must not parent to the tipped mesh. */
export async function spawnDeathSplat(state: AnimalCorpseState, host: CorpseHost): Promise<void> {
  const token = ++state.bloodSplatToken
  const splat = await createBloodSplat(host.def.modelHeight)
  if (!splat) return
  if (token !== state.bloodSplatToken || !host.mesh.parent) {
    disposeBloodSplat(splat)
    return
  }
  const y = host.sampleHeight(host.mesh.position.x, host.mesh.position.z)
  splat.position.set(host.mesh.position.x, y + 0.02, host.mesh.position.z)
  splat.rotation.y = Math.random() * Math.PI * 2
  host.mesh.parent.add(splat)
  state.bloodSplat = splat
}

/** GLB/procedural bones pile as a mesh child — mirrors
 *  `spawnHarvestedRemains()`'s token-guarded async attach, sharing the same
 *  cached templates/dispose helper (plan 188). */
async function spawnNaturalRemains(state: AnimalCorpseState, host: CorpseHost): Promise<void> {
  const token = ++state.naturalRemainsToken
  const remains = await createNaturalRemainsAsync(host.def.kind, host.def.modelHeight)
  if (token !== state.naturalRemainsToken || !host.mesh.parent) {
    disposeHarvestedRemains(remains)
    return
  }
  state.naturalRemains = remains
  host.mesh.add(remains)
}

function onCorpsePhaseChanged(state: AnimalCorpseState, host: CorpseHost, phase: CorpsePhase): void {
  if (phase === 'rotting') {
    tintPropMaterials(host.mesh, CORPSE_ROT_TINT_HEX)
  } else if (phase === 'bones') {
    disposeAnimalCorpseRotFx(state)
    hideLivingVisual(host)
    void spawnNaturalRemains(state, host)
  }
}

/** V1 "negative proximity effect" hook (plan 188 §4) — a small, temporary,
 *  bounded stamina drain on nearby *live* fauna, reusing the existing
 *  needs seam instead of a disease/status-effect system. `nearby` is the
 *  same local/bounded list already threaded through `update()`, never a
 *  world/settlement scan. */
function applyRotInfluence(host: CorpseHost, dt: number, nearby: readonly CorpseNeighbour[]): void {
  for (const other of nearby) {
    if (other.animalId === host.animalId || other.isDead()) continue
    const dx = other.mesh.position.x - host.mesh.position.x
    const dz = other.mesh.position.z - host.mesh.position.z
    if (Math.hypot(dx, dz) < CORPSE_ROT_INFLUENCE_RADIUS) {
      drainStamina(other.life.stamina, CORPSE_ROT_STAMINA_DRAIN_PER_SEC * dt)
    }
  }
}

/** Rabies corpse-contact transmission (plan fauna-001) — this corpse is
 *  infected and currently `rotting`; any nearby live, not-yet-infected
 *  animal gets a single, guarded contact-exposure roll (never repeated
 *  for the same pair, see `exposedAnimalIds`). Reuses the same local/
 *  bounded `nearby` list `applyRotInfluence` already iterates — no separate
 *  corpse/disease scan. Only called while the source animal is `rabid` (the
 *  caller's own gate), so `corpseInfected` is always `true` here. */
function applyRabiesCorpseExposure(state: AnimalCorpseState, host: CorpseHost, nearby: readonly CorpseNeighbour[]): void {
  for (const other of nearby) {
    if (other.animalId === host.animalId || other.isDead() || other.isRabid()) continue
    if (state.exposedAnimalIds.has(other.animalId)) continue
    const distance = Math.hypot(
      other.mesh.position.x - host.mesh.position.x,
      other.mesh.position.z - host.mesh.position.z,
    )
    if (!isRabiesCorpseContact({ corpsePhase: state.phase, corpseInfected: true, distance })) continue
    state.exposedAnimalIds.add(other.animalId)
    if (rollsRabiesInfection(RABIES_CORPSE_INFECTION_CHANCE, Math.random())) other.infectWithRabies()
  }
}

/** Presentation only — creates/animates/disposes the rotting-corpse
 *  particle+fog group based on phase and observer distance (plan 188 §6/§9),
 *  never affecting the lifecycle timers themselves. */
function updateRotFx(state: AnimalCorpseState, host: CorpseHost, dt: number, phase: CorpsePhase, observerPos: THREE.Vector3): void {
  const relevant = rotFxRelevant(phase, host.mesh.position.distanceTo(observerPos))
  if (relevant) {
    if (!state.rotFx) {
      state.rotFx = createCorpseRotFx(host.def.modelHeight)
      state.rotFx.position.copy(host.mesh.position)
      host.mesh.parent?.add(state.rotFx)
    }
    animateCorpseRotFx(state.rotFx, dt)
  } else if (state.rotFx) {
    disposeAnimalCorpseRotFx(state)
  }
}

export function disposeAnimalCorpseRotFx(state: AnimalCorpseState): void {
  if (!state.rotFx) return
  disposeCorpseRotFx(state.rotFx)
  state.rotFx = null
}

/** Advances the natural (unharvested, unburied) corpse decay lifecycle —
 *  simulation truth (phase/timers/proximity effect) always runs; only the
 *  FX presentation is distance-gated (plan 188 §6/§10). No-op once the
 *  corpse has left this path via `harvestCorpseMeat()`/`buryCorpse()`. */
export function advanceAnimalCorpse(
  state: AnimalCorpseState,
  host: CorpseHost,
  dt: number,
  rabid: boolean,
  nearby: readonly CorpseNeighbour[],
  observerPos: THREE.Vector3,
): void {
  if (state.meatHarvested || state.buried) return
  const phase = corpsePhaseFromElapsed(state.timeSinceDeath)
  if (phase !== state.phase) {
    state.phase = phase
    onCorpsePhaseChanged(state, host, phase)
  }
  if (phase === 'rotting') {
    applyRotInfluence(host, dt, nearby)
    if (rabid) applyRabiesCorpseExposure(state, host, nearby)
  }
  updateRotFx(state, host, dt, phase, observerPos)
}

/** True if this corpse's current phase is unclaimed or already claimed by
 *  `by` — guards against two predators both completing an eat action on
 *  one carcass. Once this phase's food is gone (`consumedPhase`), a later
 *  decay into a new phase (plan fauna-005) makes it claimable again. */
export function claimCorpseAsFood(state: AnimalCorpseState, by: unknown): boolean {
  if (state.consumedPhase === state.phase) return false
  if (state.claimedBy != null && state.claimedBy !== by) return false
  state.claimedBy = by
  return true
}

export function releaseCorpseClaim(state: AnimalCorpseState, by: unknown): void {
  if (state.claimedBy === by) state.claimedBy = null
}

/** Marks `phase` as eaten-out on this corpse (plan fauna-005) — the eater
 *  passes the live phase it just finished eating at, not necessarily
 *  `state.phase` at some other time, so a corpse that decays mid-eat can't
 *  have the wrong phase marked consumed. */
export function markCorpseFoodConsumed(state: AnimalCorpseState, phase: CorpsePhase): void {
  state.consumedPhase = phase
  state.claimedBy = null
}

/** Invalidates every in-flight async token and disposes every corpse-owned
 *  Three.js object — called from `AnimalAgent.dispose()`. Idempotent-safe:
 *  incrementing an already-bumped token or disposing an already-null object
 *  is always a no-op. */
export function disposeAnimalCorpse(state: AnimalCorpseState): void {
  state.bloodSplatToken++
  state.harvestedRemainsToken++
  state.naturalRemainsToken++
  disposeBloodSplat(state.bloodSplat)
  state.bloodSplat = null
  disposeHarvestedRemains(state.harvestedRemains)
  state.harvestedRemains = null
  disposeHarvestedRemains(state.naturalRemains)
  state.naturalRemains = null
  disposeAnimalCorpseRotFx(state)
}
