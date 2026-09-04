/**
 * Pure dog guard-target/bark-stimulus resolution (plan fauna-011 §7/§8/§9/
 * §10/§13) — mirrors `predatorHumanDecision.ts`/`npcAnimalThreat.ts` in
 * shape and testability. `AnimalAgent.ts` maps its own live wolves/NPCs into
 * the narrow candidate shapes below and calls straight through; no
 * `AnimalAgent`/Three.js import here, so the actual priority/radius rules
 * are unit-testable without constructing a live agent.
 */

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

export type DogBarkStimulus = 'guard' | 'wolf-howl' | 'stranger'

/** A recent vocalization (any animal), as seen by a household dog —
 *  spatially bounded and short-lived by construction (see
 *  `AnimalAgent.recentVocalizeAlert`'s doc); `AnimalAgent.ts` only ever
 *  passes wolves here, so a dog's own bark can never feed back into this
 *  check (plan fauna-011 §7's dog-to-dog cascade guard). */
export type RecentVocalizeCandidate = { x: number, z: number }

export type StrangerNpcCandidate = { x: number, z: number, homeId?: string }

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
    if (Math.hypot(npc.x - home.x, npc.z - home.z) <= strangerRadius) return 'stranger'
  }
  return null
}
