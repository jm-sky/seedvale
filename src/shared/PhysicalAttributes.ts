/**
 * @domain shared
 * @system physical-attributes
 * @role Shared SPEA (Strength/Perception/Endurance/Agility) physical-attribute
 *  primitive used by the player and NPCs (plan npc-019), later fauna. Stable
 *  individual base attributes only — profile data, not a mutable resource
 *  pool like `HealthState`/`StaminaState`. Must not know about combat, work,
 *  movement, species, UI, age, sex, injuries, illness or temporary
 *  conditions; those live in per-consumer profile/effective resolvers (see
 *  `settlement/npcPhysicalProfile.ts`'s `resolveHumanStrengthProfile`/
 *  `resolveHumanAgilityProfile`/`resolveHumanEnduranceProfile` and
 *  `combat/meleeStrength.ts`/`combat/meleeAgility.ts`, plus
 *  `player/physicalWorkStrength.ts`, `player/humanCarryCapacity.ts` and
 *  `shared/enduranceStamina.ts`.
 * @owns PhysicalAttributes
 */

/** `0..1` SPEA scale (`docs/world/species-physical-reference.md`) — `0.5`
 *  means a typical healthy adult within the relevant species/reference
 *  profile. Not an absolute cross-species capability; never compare raw
 *  values across species. */
export type PhysicalAttributes = {
  readonly strength: number
  readonly perception: number
  readonly endurance: number
  readonly agility: number
}
