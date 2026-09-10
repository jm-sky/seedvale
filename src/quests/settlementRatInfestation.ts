/**
 * @domain quests-progression
 * @system settlement-rat-infestation
 * @role Pure world-condition helpers for the settlement rat infestation quest
 *  (plan quests-progression-006 §5, quests-progression-013 §11).
 */

export type SettlementRatInfestationSnapshot = {
  storageDamaged: boolean
  nestDestroyed: boolean
  aliveRatCount: number
}

/** Quest completion requires repaired storage, a destroyed nest, and at most
 *  one living rat (plan quests-progression-013 §11). */
export function isSettlementRatInfestationResolved(snapshot: SettlementRatInfestationSnapshot): boolean {
  return !snapshot.storageDamaged && snapshot.nestDestroyed && snapshot.aliveRatCount <= 1
}

/** Authored NPC reminder variants keyed by live world state — remaining work
 *  is derived from the three facts, not from quest-side progress flags. */
export function settlementRatInfestationReminderLine(snapshot: SettlementRatInfestationSnapshot): string {
  if (isSettlementRatInfestationResolved(snapshot)) {
    return 'Wygląda na to, że plaga wygasła. Możesz mi to potwierdzić.'
  }
  const storage = snapshot.storageDamaged
  const nest = !snapshot.nestDestroyed
  const rats = snapshot.aliveRatCount > 1
  if (storage && nest && rats) {
    return 'Szczury wciąż roi się wokół magazynu. Napraw dziury, zniszcz gniazdo za domem i doprowadź ich do jednego albo mniej.'
  }
  if (storage && nest && !rats) {
    return 'Szczurów jest już niewiele, ale magazyn wciąż ma dziury, a gniazdo za domem nadal jest aktywne.'
  }
  if (storage && !nest && rats) {
    return 'Gniazdo zniszczyłeś, ale magazyn wciąż ma dziury i w osadzie jest za dużo szczurów.'
  }
  if (storage && !nest && !rats) {
    return 'Szczurów jest już niewiele i gniazdo zniszczyłeś, ale magazyn wciąż trzeba zabezpieczyć.'
  }
  if (!storage && nest && rats) {
    return 'Magazyn już zabezpieczyłeś, ale gniazdo za domem nadal jest aktywne i szczurów wciąż za dużo.'
  }
  if (!storage && nest && !rats) {
    return 'Magazyn już zabezpieczyłeś i szczurów jest niewiele, ale gniazdo za domem nadal jest aktywne.'
  }
  return 'Magazyn i gniazdo już ogarnąłeś, ale w osadzie wciąż jest za dużo szczurów.'
}
