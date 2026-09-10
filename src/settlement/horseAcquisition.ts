import type { AnimalAgent } from '../fauna/AnimalAgent'

/** Declarative premium price for the merchant's live horse — not an `ItemKind`
 *  (plan quests-progression-012). Peaks above ordinary merchant stock (~160). */
export const MERCHANT_HORSE_PRICE = 250

/** Derived lifecycle for one persistent horse acquisition target (plan
 *  quests-progression-012). No separate persisted enum — ownership, death and
 *  quest progress are the authorities. */
export type HorseAcquisitionState = 'available' | 'reserved' | 'transferred' | 'unavailable'

/** Stable id for the settlement merchant wagon horse — implementation detail
 *  for `spawnLivestock()`, not for authored quest logic to reconstruct. */
export function merchantHorseAnimalId(settlementId: string): string {
  return `merchant-horse-${settlementId}`
}

/** @domain quests-progression
 *  @domain fauna
 *  Resolves the merchant horse acquisition target for `settlementId`. */
export function resolveMerchantHorseAnimal(
  resolveAnimal: (animalId: string) => AnimalAgent | null,
  settlementId: string,
): AnimalAgent | null {
  return resolveAnimal(merchantHorseAnimalId(settlementId))
}

/** @domain quests-progression
 *  Single derived view over live animal state + quest reservation. */
export function getHorseAcquisitionState(input: {
  animal: AnimalAgent | null
  isReservedByQuest: boolean
}): HorseAcquisitionState {
  const { animal, isReservedByQuest } = input
  if (!animal || animal.isDead()) return 'unavailable'
  if (animal.isPlayerOwned()) return 'transferred'
  if (isReservedByQuest) return 'reserved'
  return 'available'
}

const HORSE_OFFER_STATUS_HINT: Record<Exclude<HorseAcquisitionState, 'available'>, string> = {
  reserved: 'Zarezerwowany jako nagroda za zlecenie.',
  transferred: 'Już należy do ciebie.',
  unavailable: 'Ten koń nie jest już dostępny.',
}

/** Merchant-screen hint for a non-purchasable horse offer row. */
export function horseOfferStatusHint(state: HorseAcquisitionState): string | null {
  if (state === 'available') return null
  return HORSE_OFFER_STATUS_HINT[state]
}
