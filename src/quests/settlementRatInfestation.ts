/**
 * @domain quests-progression
 * @system settlement-rat-infestation
 * @role Pure world-condition helpers for the storage rat infestation quest
 *  (plan quests-progression-006 §5).
 */

export type SettlementRatInfestationSnapshot = {
  infestationActive: boolean
  aliveRatCount: number
}

/** Quest completion requires both conditions (plan quests-progression-006 §5). */
export function isSettlementRatInfestationResolved(snapshot: SettlementRatInfestationSnapshot): boolean {
  return !snapshot.infestationActive && snapshot.aliveRatCount <= 1
}

/** Authored NPC reminder variants keyed by live world state (plan
 *  quests-progression-006 §9). */
export function settlementRatInfestationReminderLine(snapshot: SettlementRatInfestationSnapshot): string {
  if (snapshot.infestationActive && snapshot.aliveRatCount > 1) {
    return 'Szczury wciąż roi się wokół magazynu. Znajdź, skąd się dostają, i doprowadź ich do jednego albo mniej.'
  }
  if (snapshot.infestationActive && snapshot.aliveRatCount <= 1) {
    return 'Szczurów jest już niewiele, ale coś jeszcze jest nie w porządku z magazynem.'
  }
  if (!snapshot.infestationActive && snapshot.aliveRatCount > 1) {
    return 'Magazyn już zabezpieczyłeś, ale w osadzie wciąż jest za dużo szczurów.'
  }
  return 'Wygląda na to, że plaga wygasła. Możesz mi to potwierdzić.'
}
