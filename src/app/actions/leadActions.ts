import { ANIMAL_LABELS, type AnimalAgent } from '../../fauna/AnimalAgent'
import { CART_HITCH_RANGE, cartAcceptsAnimal } from '../../world/cart'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/**
 * @domain fauna
 * @role Temporary player→animal lead attach/detach and cart hitch, keyed by
 *  stable `animalId`. Does not own Follow/Stay or AnimalOwner.
 */
export type LeadActions = {
  isLeading: () => boolean
  ledAnimalId: () => string | null
  tryLead: (animal: AnimalAgent) => boolean
  detach: () => void
  hitchLedToCart: (cartId: string) => boolean
  unhitchCart: (cartId: string) => boolean
  /** Validates the live animal, syncs HUD, and applies the lead flag. */
  update: () => void
}

export function createLeadActions(
  ctx: PlayerActionContext,
  resolveAnimal: (animalId: string) => AnimalAgent | null,
  isPlayerMountedOn: (animalId: string) => boolean,
): LeadActions {
  const { player, toast, bundle, hud } = ctx
  let ledId: string | null = null

  function clearHud(): void {
    hud.setLeading(false, '', null)
  }

  function syncHud(animal: AnimalAgent): void {
    const cart = bundle.carts.pulledBy(animal.animalId)
    const label = cart
      ? `${ANIMAL_LABELS[animal.def.kind]} · wózek`
      : ANIMAL_LABELS[animal.def.kind]
    hud.setLeading(true, label, () => detach())
  }

  function detach(): void {
    if (!ledId) {
      clearHud()
      return
    }
    const animal = resolveAnimal(ledId)
    animal?.setLeadAttached(false)
    ledId = null
    clearHud()
  }

  function tryLead(animal: AnimalAgent): boolean {
    if (isActionBlocked(ctx) || player.isDowned() || player.isMounted()) return false
    if (!animal.isLeadable() || animal.isMounted() || isPlayerMountedOn(animal.animalId)) return false
    if (ledId && ledId !== animal.animalId) {
      resolveAnimal(ledId)?.setLeadAttached(false)
    }
    ledId = animal.animalId
    animal.setLeadAttached(true)
    syncHud(animal)
    toast.show(`Prowadzisz: ${ANIMAL_LABELS[animal.def.kind]}`)
    return true
  }

  function hitchLedToCart(cartId: string): boolean {
    if (!ledId) return false
    const animal = resolveAnimal(ledId)
    const cart = bundle.carts.get(cartId)
    if (!animal || !cart || animal.isDead() || animal.isMounted()) return false
    if (!cartAcceptsAnimal(animal.def)) return false
    const dist = Math.hypot(animal.mesh.position.x - cart.x, animal.mesh.position.z - cart.z)
    if (dist > CART_HITCH_RANGE) {
      toast.show('Zwierzę jest za daleko od wózka.', 'error')
      return false
    }
    if (!bundle.carts.attach(cartId, animal.animalId, animal.def)) return false
    syncHud(animal)
    toast.show('Przywiązano do wózka.')
    return true
  }

  function unhitchCart(cartId: string): boolean {
    const cart = bundle.carts.get(cartId)
    if (!cart) return false
    if (!bundle.carts.detach(cartId)) return false
    if (ledId) {
      const animal = resolveAnimal(ledId)
      if (animal) syncHud(animal)
    }
    toast.show('Odpięto wózek.')
    return true
  }

  function update(): void {
    if (!ledId) {
      clearHud()
      return
    }
    const animal = resolveAnimal(ledId)
    if (
      player.isMounted()
      || !animal
      || animal.isDead()
      || animal.isMounted()
      || isPlayerMountedOn(animal.animalId)
      || !animal.isLeadable()
    ) {
      detach()
      return
    }
    animal.setLeadAttached(true)
    syncHud(animal)
  }

  return {
    isLeading: () => ledId !== null,
    ledAnimalId: () => ledId,
    tryLead,
    detach,
    hitchLedToCart,
    unhitchCart,
    update,
  }
}
