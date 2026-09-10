/**
 * Pure dog guard-target/bark-stimulus resolution (plan fauna-011 §7/§8/§9/
 * §10/§13) — mirrors `predatorHumanDecision.ts`/`npcAnimalThreat.ts` in
 * shape and testability. `AnimalAgent.ts` maps its own live wolves/NPCs into
 * the narrow candidate shapes below and calls straight through; no
 * `AnimalAgent`/Three.js import here, so the actual priority/radius rules
 * are unit-testable without constructing a live agent.
 *
 * Production radii/cooldown live here (plan fauna-017 step 9 / review P8)
 * so the adapter in `AnimalAgent` cannot drift from the tested owner.
 */

/** Max distance (m) from a dog's own `home` it will chase a nearby rat (plan
 *  fauna-016 §9) — tighter than any guard-target radius, since this is idle
 *  yard behaviour, not household defense. */
export const DOG_PEST_RADIUS = 10
/** Max distance (m) from a dog's own home a wolf attacking *this dog's own
 *  household* is still worth chasing (plan fauna-011 §10/§13: own-household
 *  defense gets the most latitude, but a dog must still "pozostać lokalnym
 *  obrońcą", never a settlement-wide police). Bigger than
 *  `DOG_GUARD_ASSIST_RADIUS` below on purpose. */
export const DOG_GUARD_OWN_RADIUS = 40
/** Max distance (m) from a dog's own home a wolf attacking a *different*
 *  household's NPC is still worth assisting (plan fauna-011 §10) — tighter
 *  than `DOG_GUARD_OWN_RADIUS` so helping a stranger never pulls a dog far
 *  from its own home/family. */
export const DOG_GUARD_ASSIST_RADIUS = 20
/** Radius (m) from a dog's own home within which a recent wolf howl
 *  (`recentVocalizeAlert`) is "relevant" enough to trigger an alert bark
 *  (plan fauna-011 §7/§8) — deliberately generous next to the guard radii
 *  above, since this only ever produces a bark, never a chase ("odległy wilk
 *  może wywołać jedynie alert"). */
export const DOG_BARK_HOWL_RADIUS = 45
/** Radius (m) from a dog's own home within which an unfamiliar (different-
 *  household) settlement NPC triggers an observational bark (plan
 *  fauna-011 §7) — tight, since this is "a stranger right by the house", not
 *  general awareness of the whole settlement. */
export const DOG_BARK_STRANGER_RADIUS = 10
/** Shared cooldown between every dog bark trigger (plan fauna-011 §7) — the
 *  actual anti-spam gate; keeps a settlement's dogs from cascading into a
 *  continuous chorus over one lingering stimulus. */
export const DOG_BARK_COOLDOWN_SEC = 10

/** One live wolf, as seen by a household dog — `npcTarget` is that wolf's
 *  own authoritative committed attack target (never inferred from
 *  proximity), `null` while it isn't attacking anyone. */
export type DogGuardWolfCandidate = {
  id: string
  x: number
  z: number
  dead: boolean
  npcTarget: { npcId: string, homeId?: string } | null
}

export type DogGuardTargetResolved = {
  wolfId: string
  protectedNpcId: string
  ownHousehold: boolean
}

/**
 * Full priority order in one pass (plan fauna-011 §10):
 * 1. wolf attacking own household member (`ownRadius` from the dog's home)
 * 2. wolf attacking a nearby settlement inhabitant (`assistRadius`, tighter)
 * 3. (no candidate) — a distant/unrelated wolf never wins here regardless of
 *    proximity: it only surfaces as `resolveDogBarkStimulus`'s alert tier.
 *
 * Recomputed fresh every call from live state — never a sticky commitment —
 * so disengagement (§13: dead wolf, retargeted wolf, wolf that walked
 * outside its tier's radius) falls out for free: the caller simply stops
 * getting a target back, no decay timer needed.
 */
export function resolveDogGuardTarget(
  home: { x: number, z: number },
  ownerHouseId: string | null | undefined,
  nearbyWolves: readonly DogGuardWolfCandidate[],
  ownRadius: number,
  assistRadius: number,
): DogGuardTargetResolved | null {
  let own: DogGuardTargetResolved | null = null
  let nearby: DogGuardTargetResolved | null = null
  for (const wolf of nearbyWolves) {
    if (wolf.dead) continue
    const target = wolf.npcTarget
    if (!target) continue
    const distFromHome = Math.hypot(wolf.x - home.x, wolf.z - home.z)
    const isOwnHousehold = target.homeId != null && ownerHouseId != null && target.homeId === ownerHouseId
    if (isOwnHousehold) {
      if (distFromHome > ownRadius) continue
      if (!own) own = { wolfId: wolf.id, protectedNpcId: target.npcId, ownHousehold: true }
    } else {
      if (distFromHome > assistRadius) continue
      if (!nearby) nearby = { wolfId: wolf.id, protectedNpcId: target.npcId, ownHousehold: false }
    }
  }
  return own ?? nearby
}

/** One live rat, as seen by a household dog's idle pest-chase check (plan
 *  fauna-016 §9). */
export type DogPestCandidate = { id: string, x: number, z: number, dead: boolean }

/** Nearest live rat within `radius` of the dog's own `home` — deliberately
 *  separate from `resolveDogGuardTarget`'s wolf-defense contract above: a rat
 *  is nuisance vermin, never a household threat, so this is a plain nearest-
 *  candidate search with no priority tiers of its own. The caller
 *  (`AnimalAgent.pursuePest`) only consults this once guard/needs/lure has
 *  already claimed nothing this tick, keeping it below real household
 *  defense (implementation notes fauna-016 §9). Home-bounded so a dog never
 *  leaves its own yard hunting rats. */
export function resolveDogPestTarget(
  home: { x: number, z: number },
  nearbyRats: readonly DogPestCandidate[],
  radius: number,
): DogPestCandidate | null {
  let best: DogPestCandidate | null = null
  let bestD = radius
  for (const rat of nearbyRats) {
    if (rat.dead) continue
    const d = Math.hypot(rat.x - home.x, rat.z - home.z)
    if (d < bestD) {
      bestD = d
      best = rat
    }
  }
  return best
}

export type DogBarkStimulus = 'guard' | 'wolf-howl' | 'stranger'

/** A recent vocalization (any animal), as seen by a household dog —
 *  spatially bounded and short-lived by construction (see
 *  `AnimalAgent.recentVocalizeAlert`'s doc); `AnimalAgent.ts` only ever
 *  passes wolves here, so a dog's own bark can never feed back into this
 *  check (plan fauna-011 §7's dog-to-dog cascade guard). */
export type RecentVocalizeCandidate = { x: number, z: number }

export type StrangerNpcCandidate = {
  x: number
  z: number
  homeId?: string
  /** Stable human id when known (plan fauna-013) — for affinity interpretation. */
  humanId?: string
  /** When true, stranger bark relevance is suppressed (trusted outsider). */
  trusted?: boolean
}

/**
 * Three stimulus tiers, highest first (plan fauna-011 §7/§8): an active
 * guard target beats a recent nearby wolf howl, which beats a nearby
 * stranger. The caller (`AnimalAgent.updateDogVocalization`) gates the
 * actual bark behind its own cooldown — this function only answers "what
 * would justify one right now", not "should one fire this tick".
 */
export function resolveDogBarkStimulus(
  home: { x: number, z: number },
  ownerHouseId: string | null | undefined,
  guardActive: boolean,
  recentWolfHowls: readonly RecentVocalizeCandidate[],
  howlRadius: number,
  nearbyNpcs: readonly StrangerNpcCandidate[],
  strangerRadius: number,
): DogBarkStimulus | null {
  if (guardActive) return 'guard'
  for (const howl of recentWolfHowls) {
    if (Math.hypot(howl.x - home.x, howl.z - home.z) <= howlRadius) return 'wolf-howl'
  }
  for (const npc of nearbyNpcs) {
    if (npc.homeId != null && npc.homeId === ownerHouseId) continue
    if (npc.trusted) continue
    if (Math.hypot(npc.x - home.x, npc.z - home.z) <= strangerRadius) return 'stranger'
  }
  return null
}
