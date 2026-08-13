import type { ItemKind } from './items'

export type GuardSwordAsk = {
  alreadyGifted: boolean
  /** Marek's well quest (or any later guard quest) turned in. */
  guardQuestComplete: boolean
  relation: number
  alreadyHasSword: boolean
}

export type GuardSwordAskResult = {
  line: string
  grant: boolean
}

const RELATION_THRESHOLD = 1

/**
 * Strażnik (home-settlement guard) may gift a sword once — as a quest reward
 * or when asked in dialogue after earning trust (plan 090).
 */
export function askGuardForSword(ask: GuardSwordAsk): GuardSwordAskResult {
  if (ask.alreadyGifted) {
    return { line: 'Dałem Ci już miecz. Pilnuj go.', grant: false }
  }
  if (ask.alreadyHasSword) {
    return { line: 'Widzę, że już masz broń. Dobrze — pilnuj jej.', grant: false }
  }
  if (ask.guardQuestComplete || ask.relation >= RELATION_THRESHOLD) {
    return {
      line: 'Weź. Przyda Ci się w drodze — okolica nie zawsze jest spokojna.',
      grant: true,
    }
  }
  return {
    line: 'Najpierw pokaż, że można na Ciebie liczyć. Pomóż przy studni, to pogadamy o broni.',
    grant: false,
  }
}

export function shouldGrantQuestSword(
  kind: ItemKind,
  alreadyGifted: boolean,
  alreadyHasSword: boolean,
): boolean {
  if (kind !== 'long_sword') return true
  if (alreadyGifted || alreadyHasSword) return false
  return true
}
