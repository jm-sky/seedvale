/** Authoritative ownership for a persistent livestock individual (plan fauna-020).
 *  One discriminated value — no parallel `playerOwned` + `ownerHouseId` flags. */
export type AnimalOwner =
  | { kind: 'household', houseId: string }
  | { kind: 'player' }
  | null

export function ownerFromHouseId(ownerHouseId?: string): AnimalOwner {
  return ownerHouseId ? { kind: 'household', houseId: ownerHouseId } : null
}

export function deriveOwnerHouseId(owner: AnimalOwner): string | undefined {
  return owner?.kind === 'household' ? owner.houseId : undefined
}

export function isPlayerOwned(owner: AnimalOwner): boolean {
  return owner?.kind === 'player'
}

export function isHouseholdOwned(owner: AnimalOwner): boolean {
  return owner?.kind === 'household'
}

export function ownersEqual(a: AnimalOwner, b: AnimalOwner): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (a.kind !== b.kind) return false
  if (a.kind === 'player') return true
  return b.kind === 'household' && a.houseId === b.houseId
}

/** Backward-compatible read for saves that only persisted `ownerHouseId`. */
export function parseAnimalOwnerFromRecord(record: {
  owner?: AnimalOwner
  ownerHouseId?: string
}): AnimalOwner {
  if (record.owner !== undefined) return record.owner
  return ownerFromHouseId(record.ownerHouseId)
}
