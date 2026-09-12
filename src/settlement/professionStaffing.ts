import type { Role } from '../ai/characters'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource } from '../terrain/naturalResources'
import type { FamilyDef, FamilyMember, VillageSize } from './families'
import type { FoodSourceType } from './villagePlan'
import { RESOURCE_ROLE, SIGNIFICANT_RICHNESS } from '../terrain/naturalResources'
import { createSeededRandom } from '../world/parseSeed'

/** Isolated from family/age/name/`characterForSeed` streams. */
const STAFFING_SALT = 0x53544646

export type StaffingPriority = 'strong' | 'normal' | 'weak' | 'excluded'

/**
 * Generation-time inputs for initial profession composition.
 * Adult capacity, locked slots and coverage are derived from `families`.
 * Extend this type in place for later livestock/herb signals rather than
 * adding a second resolver.
 *
 * @domain settlements-npcs
 */
export type ProfessionStaffingContext = {
  size: VillageSize
  terrain: SettlementTerrain
  foodSourceType: FoodSourceType
  dominantResource: NaturalResource | null
  isHome: boolean
  seed: number
}

type StaffingSignals = {
  size: VillageSize
  terrain: SettlementTerrain
  foodSourceType: FoodSourceType
  dominantResource: NaturalResource | null
  mappedResourceRole: Role | undefined
  adultCapacity: number
  isHome: boolean
}

type RoleStaffingPolicy = {
  basePriority: (signals: StaffingSignals) => StaffingPriority
  afterDuplicate: (
    copies: number,
    base: StaffingPriority,
    signals: StaffingSignals,
  ) => StaffingPriority
}

const PRIORITY_RANK: Record<StaffingPriority, number> = {
  excluded: 0,
  weak: 1,
  normal: 2,
  strong: 3,
}

const PRIORITY_BY_RANK = ['excluded', 'weak', 'normal', 'strong'] as const satisfies readonly StaffingPriority[]

/** Single weight scale — `strong > normal > weak > excluded`. */
const PRIORITY_WEIGHT: Record<StaffingPriority, number> = {
  excluded: 0,
  weak: 1,
  normal: 4,
  strong: 8,
}

function shiftPriority(
  priority: StaffingPriority,
  delta: number,
  floor: StaffingPriority = 'excluded',
  cap: StaffingPriority = 'strong',
): StaffingPriority {
  const next = PRIORITY_RANK[priority] + delta
  const clamped = Math.min(PRIORITY_RANK[cap], Math.max(PRIORITY_RANK[floor], next))
  return PRIORITY_BY_RANK[clamped]!
}

function demoteEachCopy(base: StaffingPriority, copies: number, floor: StaffingPriority): StaffingPriority {
  if (copies <= 0) return base
  return shiftPriority(base, -copies, floor)
}

/**
 * Closed per-role policy. Adding a `Role` (shepherd, herbalist, …) must
 * extend this record — TypeScript will fail the build until a policy exists.
 */
const ROLE_STAFFING_POLICY: Record<Role, RoleStaffingPolicy> = {
  farmer: {
    basePriority: (s) => {
      if (s.foodSourceType === 'field' || s.foodSourceType === 'garden' || s.mappedResourceRole === 'farmer') {
        return 'strong'
      }
      if (s.foodSourceType === 'foraging') return 'normal'
      return 'normal'
    },
    afterDuplicate: (copies, base) => demoteEachCopy(base, copies, 'weak'),
  },
  woodcutter: {
    basePriority: (s) => {
      if (s.terrain === 'forest' || s.foodSourceType === 'foraging') return 'strong'
      if (s.terrain === 'desert' || s.terrain === 'ocean') return 'weak'
      return 'normal'
    },
    afterDuplicate: (copies, base) => demoteEachCopy(base, copies, 'weak'),
  },
  fisher: {
    basePriority: (s) => {
      if (s.foodSourceType === 'fishing' || s.mappedResourceRole === 'fisher') return 'strong'
      return 'weak'
    },
    afterDuplicate: (copies, base, s) => duplicateEnvironmentRole(copies, base, environmentSignal(s, 'fisher')),
  },
  miner: {
    basePriority: (s) => {
      if (s.mappedResourceRole === 'miner') return 'strong'
      if (s.terrain === 'mountain') return 'normal'
      return 'weak'
    },
    afterDuplicate: (copies, base, s) => duplicateEnvironmentRole(copies, base, environmentSignal(s, 'miner')),
  },
  hunter: {
    basePriority: (s) => {
      if (s.terrain === 'forest' && s.foodSourceType === 'foraging') return 'strong'
      if (s.foodSourceType === 'foraging' || s.terrain === 'forest') return 'normal'
      return 'weak'
    },
    afterDuplicate: (copies, base, s) => duplicateEnvironmentRole(copies, base, environmentSignal(s, 'hunter')),
  },
  guard: {
    basePriority: (s) => {
      if (s.adultCapacity >= 6) return 'strong'
      if (s.adultCapacity >= 3) return 'normal'
      return 'weak'
    },
    afterDuplicate: (copies, base, s) => {
      if (copies <= 0) return base
      if (s.adultCapacity < 6) return 'excluded'
      return demoteEachCopy(base, copies, 'weak')
    },
  },
  blacksmith: {
    basePriority: (s) => {
      if (s.adultCapacity <= 3) return 'excluded'
      let priority: StaffingPriority = 'weak'
      if (s.adultCapacity >= 8) priority = 'strong'
      else if (s.adultCapacity >= 6) priority = 'normal'
      if (s.mappedResourceRole === 'miner') priority = shiftPriority(priority, 1)
      return priority
    },
    afterDuplicate: (copies, base, s) => {
      if (copies <= 0) return base
      if (s.adultCapacity < 10) return 'excluded'
      return 'weak'
    },
  },
  trader: {
    basePriority: (s) => {
      if (s.size === 'SM' || s.adultCapacity < 6) return 'excluded'
      if (s.adultCapacity >= 8) return 'normal'
      return 'weak'
    },
    afterDuplicate: (copies, base) => (copies >= 1 ? 'excluded' : base),
  },
  shepherd: {
    basePriority: (s) => {
      if (s.adultCapacity <= 3) return 'excluded'
      let priority: StaffingPriority = 'weak'
      if (s.adultCapacity >= 6 || s.size === 'MD') priority = 'normal'
      if (s.adultCapacity >= 8 || s.size === 'LG' || s.size === 'XL') priority = 'strong'
      if (s.terrain === 'forest' || s.foodSourceType === 'field' || s.foodSourceType === 'garden') {
        priority = shiftPriority(priority, 1)
      }
      if (s.terrain === 'desert' || s.terrain === 'ocean') {
        priority = shiftPriority(priority, -1)
      }
      return priority
    },
    afterDuplicate: (copies, base) => (copies >= 1 ? 'excluded' : base),
  },
  textile_worker: {
    basePriority: (s) => {
      // Wool processing is only useful where a shepherd-capable village can
      // actually produce wool. No livestock signal yet — reuse the same
      // size/terrain/food cues, with a slightly higher adult-capacity bar.
      if (s.adultCapacity <= 3) return 'excluded'
      let priority: StaffingPriority = 'weak'
      if (s.adultCapacity >= 8 || s.size === 'LG' || s.size === 'XL') priority = 'normal'
      if (s.terrain === 'forest' || s.foodSourceType === 'field' || s.foodSourceType === 'garden') {
        priority = shiftPriority(priority, 1)
      }
      if (s.terrain === 'desert' || s.terrain === 'ocean') {
        priority = shiftPriority(priority, -1)
      }
      return priority
    },
    afterDuplicate: (copies, base) => (copies >= 1 ? 'excluded' : base),
  },
  herbalist: {
    basePriority: (s) => {
      if (s.adultCapacity <= 3) return 'excluded'
      let priority: StaffingPriority = 'weak'
      if (s.adultCapacity >= 8 || s.size === 'LG' || s.size === 'XL') priority = 'normal'
      if (s.terrain === 'forest' || s.foodSourceType === 'foraging') {
        priority = shiftPriority(priority, 1)
      }
      if (
        s.dominantResource?.type === 'herbs'
        && s.dominantResource.richness >= SIGNIFICANT_RICHNESS
      ) {
        priority = shiftPriority(priority, 1)
      }
      if (s.terrain === 'desert' || s.terrain === 'ocean') {
        priority = shiftPriority(priority, -1)
      }
      return priority
    },
    afterDuplicate: (copies, base) => (copies >= 1 ? 'excluded' : base),
  },
}

function environmentSignal(signals: StaffingSignals, role: Role): boolean {
  if (role === 'fisher') {
    return signals.foodSourceType === 'fishing' || signals.mappedResourceRole === 'fisher'
  }
  if (role === 'miner') return signals.mappedResourceRole === 'miner'
  if (role === 'hunter') {
    return signals.foodSourceType === 'foraging' || signals.terrain === 'forest'
  }
  return false
}

/** One level down unless the matching environment/resource signal is strong. */
function duplicateEnvironmentRole(
  copies: number,
  base: StaffingPriority,
  strongSignal: boolean,
): StaffingPriority {
  if (copies <= 0) return base
  if (strongSignal) return demoteEachCopy(base, copies, 'weak')
  return demoteEachCopy(base, copies, 'excluded')
}

const STAFFING_ROLES = Object.keys(ROLE_STAFFING_POLICY) as Role[]

function emptyCoverage(): Record<Role, number> {
  const coverage = {} as Record<Role, number>
  for (const role of STAFFING_ROLES) coverage[role] = 0
  return coverage
}

function mappedResourceRole(resource: NaturalResource | null): Role | undefined {
  if (!resource || resource.richness < SIGNIFICANT_RICHNESS) return undefined
  return RESOURCE_ROLE[resource.type]
}

function foodBaselineRole(signals: StaffingSignals): Role | null {
  if (signals.size === 'OUTPOST') return null
  switch (signals.foodSourceType) {
    case 'field':
    case 'foraging':
    case 'garden':
      return 'farmer'
    case 'fishing':
      return 'fisher'
  }
}

function isReservedFamily(family: FamilyDef): boolean {
  return family.id.startsWith('family-reserved')
}

/** The settlement-wide adulthood convention (plan npc-031 §"Eligibility
 *  before scoring" — "use the same adulthood convention already used by
 *  settlement generation/staffing; do not invent a second age threshold").
 *  Any other domain gating adult-only behaviour on real age should call this
 *  rather than re-hardcoding `18`. */
export function isAdultAge(age: number): boolean {
  return age >= 18
}

/** Active workforce. Children never count toward coverage. */
export function isProfessionAdult(member: FamilyMember): boolean {
  return isAdultAge(member.age)
}

/** Household index of the settlement's shepherd adult, or `null`. At most one. */
export function shepherdHouseholdIndex(families: readonly FamilyDef[]): number | null {
  for (let i = 0; i < families.length; i++) {
    if (families[i]!.members.some((member) => isProfessionAdult(member) && member.character.role === 'shepherd')) {
      return i
    }
  }
  return null
}

function isStaffableAdult(member: FamilyMember, family: FamilyDef): boolean {
  if (!isProfessionAdult(member)) return false
  if (member.relation === 'child') return false
  if (isReservedFamily(family)) return false
  return true
}

/**
 * Active adult role counts. Child roles are ignored even when they match a
 * specialist profession.
 *
 * @domain settlements-npcs
 */
export function adultProfessionCoverage(families: readonly FamilyDef[]): Record<Role, number> {
  const coverage = emptyCoverage()
  for (const family of families) {
    for (const member of family.members) {
      if (!isProfessionAdult(member)) continue
      coverage[member.character.role]++
    }
  }
  return coverage
}

type AdultSlot = {
  familyIndex: number
  memberIndex: number
}

function slotKey(slot: AdultSlot): string {
  return `${slot.familyIndex}:${slot.memberIndex}`
}

function collectAdultSlots(families: readonly FamilyDef[]): {
  coverage: Record<Role, number>
  adultCapacity: number
  procedural: AdultSlot[]
} {
  const coverage = emptyCoverage()
  const procedural: AdultSlot[] = []
  let adultCapacity = 0
  for (let familyIndex = 0; familyIndex < families.length; familyIndex++) {
    const family = families[familyIndex]!
    for (let memberIndex = 0; memberIndex < family.members.length; memberIndex++) {
      const member = family.members[memberIndex]!
      if (!isProfessionAdult(member)) continue
      adultCapacity++
      coverage[member.character.role]++
      if (isStaffableAdult(member, family)) {
        procedural.push({ familyIndex, memberIndex })
      }
    }
  }
  return { coverage, adultCapacity, procedural }
}

function claimTarget(
  target: Role | null,
  remaining: AdultSlot[],
  assigned: Map<string, Role>,
  coverage: Record<Role, number>,
): void {
  if (!target) return
  if (coverage[target] > 0) return
  const slot = remaining.shift()
  if (!slot) return
  assigned.set(slotKey(slot), target)
  coverage[target]++
}

function pickWeightedRole(random: () => number, weights: ReadonlyMap<Role, number>): Role {
  const entries: [Role, number][] = []
  for (const role of STAFFING_ROLES) {
    const weight = weights.get(role) ?? 0
    if (weight > 0) entries.push([role, weight])
  }
  if (entries.length === 0) return 'farmer'
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [role, weight] of entries) {
    roll -= weight
    if (roll < 0) return role
  }
  return entries[entries.length - 1]![0]
}

function remainderWeights(
  coverage: Record<Role, number>,
  signals: StaffingSignals,
): Map<Role, number> {
  const weights = new Map<Role, number>()
  for (const role of STAFFING_ROLES) {
    const policy = ROLE_STAFFING_POLICY[role]
    const base = policy.basePriority(signals)
    const priority = policy.afterDuplicate(coverage[role], base, signals)
    const weight = PRIORITY_WEIGHT[priority]
    if (weight > 0) weights.set(role, weight)
  }
  return weights
}

function withAssignedRole(member: FamilyMember, role: Role): FamilyMember {
  if (member.character.role === role) return member
  return { ...member, character: { ...member.character, role } }
}

/**
 * Assigns generation-time adult professions from settlement identity.
 *
 * Only procedural adult `CharacterDef.role` values change. Family structure,
 * reserved home NPCs, children, names, ages, traits and personality are
 * preserved. OUTPOST rosters pass through unchanged.
 *
 * @domain settlements-npcs
 */
export function resolveInitialProfessionStaffing(
  families: readonly FamilyDef[],
  context: ProfessionStaffingContext,
): FamilyDef[] {
  if (context.size === 'OUTPOST') return families as FamilyDef[]

  const { coverage, adultCapacity, procedural } = collectAdultSlots(families)
  const signals: StaffingSignals = {
    size: context.size,
    terrain: context.terrain,
    foodSourceType: context.foodSourceType,
    dominantResource: context.dominantResource,
    mappedResourceRole: mappedResourceRole(context.dominantResource),
    adultCapacity,
    isHome: context.isHome,
  }

  const assigned = new Map<string, Role>()
  const remaining = [...procedural]
  claimTarget(foodBaselineRole(signals), remaining, assigned, coverage)
  claimTarget(signals.mappedResourceRole ?? null, remaining, assigned, coverage)

  const random = createSeededRandom(context.seed ^ STAFFING_SALT)
  for (const slot of remaining) {
    const role = pickWeightedRole(random, remainderWeights(coverage, signals))
    assigned.set(slotKey(slot), role)
    coverage[role]++
  }

  if (assigned.size === 0) return families as FamilyDef[]

  return families.map((family, familyIndex) => {
    let changed = false
    const members = family.members.map((member, memberIndex) => {
      const role = assigned.get(slotKey({ familyIndex, memberIndex }))
      if (!role) return member
      const next = withAssignedRole(member, role)
      if (next !== member) changed = true
      return next
    })
    return changed ? { ...family, members } : family
  })
}
