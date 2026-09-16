import type { AnimalAgent } from '../fauna/AnimalAgent'
import {
  HORSE_TRAINING_TIER_LABEL,
  horseTrainingPrice,
  horseTrainingTier,
} from '../fauna/horseTraining'
import { vendorHorseAnimalId } from './villagePaddock'

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

export { vendorHorseAnimalId }

export function isVendorHorseAnimalId(animalId: string, settlementId: string): boolean {
  return animalId.startsWith(`vendor-horse-${settlementId}-`)
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

/**
 * A vendor paddock horse is sale-eligible only from its origin slot, while
 * live, not player-owned, and not quest-reserved. Quest wagon horses use a
 * different id namespace and never appear here.
 *
 * @domain settlements
 */
export function isVendorHorseSaleEligible(input: {
  animal: AnimalAgent | null
  settlementId: string
  isReservedByQuest: boolean
}): boolean {
  const { animal, settlementId, isReservedByQuest } = input
  if (!animal || animal.isDead() || animal.isPlayerOwned() || isReservedByQuest) return false
  if (animal.def.kind !== 'horse') return false
  if (animal.paddockStay()?.settlementId !== settlementId) return false
  return isVendorHorseAnimalId(animal.animalId, settlementId)
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

export function vendorHorseOfferLabel(animal: AnimalAgent): string {
  const tier = horseTrainingTier(animal.trainingState()?.progress ?? 0)
  const name = animal.getName()
  const base = HORSE_TRAINING_TIER_LABEL[tier]
  return name ? `${base} · ${name}` : base
}

export function vendorHorseOfferPrice(animal: AnimalAgent): number {
  return horseTrainingPrice(animal.trainingState()?.progress ?? 0)
}

/**
 * Live paddock horses for one settlement, in slot order. Dead / sold /
 * quest-reserved animals are omitted so the UI cannot show an unresolvable row.
 *
 * @domain settlements
 */
export function listVendorHorseAnimals(
  animals: readonly AnimalAgent[],
  settlementId: string,
  isReservedByQuest: (animalId: string) => boolean,
): AnimalAgent[] {
  const eligible = animals.filter((animal) => isVendorHorseSaleEligible({
    animal,
    settlementId,
    isReservedByQuest: isReservedByQuest(animal.animalId),
  }))
  return eligible.sort((a, b) => a.animalId.localeCompare(b.animalId))
}
