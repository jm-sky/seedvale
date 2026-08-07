import { createSeededRandom } from '../world/parseSeed'

/** Dominant terrain feature near a settlement site — drives which word list
 *  its name is drawn from. See `settlement/settlementTerrain.ts` for how a
 *  site gets classified into one of these. */
export type SettlementTerrain = 'ocean' | 'mountain' | 'swamp' | 'desert' | 'forest'

type WordSet = {
  adjectives: readonly string[]
  nouns: readonly string[]
  /** Single, already-composed place names (no adjective+noun assembly) —
   *  avoids the grammatical-agreement problems a programmatic stem+suffix
   *  approach would hit in Polish. */
  soloNames: readonly string[]
}

const WORDS: Record<SettlementTerrain, WordSet> = {
  forest: {
    adjectives: ['Lipowa', 'Zielona', 'Sośnicka', 'Brzozowa', 'Cicha', 'Stara', 'Dębowa'],
    nouns: ['Dolina', 'Grąd', 'Osada', 'Polana', 'Chatki', 'Puszcza'],
    soloNames: ['Lipowo', 'Zalesie', 'Brzezinka', 'Dąbrówka', 'Leśnica'],
  },
  ocean: {
    adjectives: ['Nadmorska', 'Słona', 'Rybacka', 'Piaszczysta', 'Mglista'],
    nouns: ['Brzeg', 'Zatoka', 'Przystań', 'Wybrzeże', 'Ostrów', 'Mierzeja'],
    soloNames: ['Wybrzeże', 'Rybaki', 'Zatoczka', 'Solanka', 'Mielizna'],
  },
  mountain: {
    adjectives: ['Skalista', 'Wysoka', 'Kamienna', 'Górska', 'Strzelista'],
    nouns: ['Wzgórze', 'Przełęcz', 'Turnia', 'Podgórze', 'Grań'],
    soloNames: ['Podgórze', 'Skalnik', 'Turniów', 'Granica', 'Zbocze'],
  },
  swamp: {
    adjectives: ['Mokra', 'Bagienna', 'Trzcinowa', 'Głęboka', 'Wilgotna'],
    nouns: ['Ług', 'Rozlewisko', 'Moczary', 'Trzęsawa', 'Bagno'],
    soloNames: ['Mokradła', 'Bagnówka', 'Trzęsawisko', 'Ługowo', 'Rozlewiska'],
  },
  desert: {
    adjectives: ['Sucha', 'Piaskowa', 'Wypalona', 'Jałowa', 'Spękana'],
    nouns: ['Wydma', 'Pustkowie', 'Ostoja', 'Karawana', 'Ostęp'],
    soloNames: ['Wydmowo', 'Piaskowiec', 'Pustkowie', 'Susznica', 'Karawana'],
  },
}

/** Deterministic name for a settlement — same `(seed, terrain)` always
 *  produces the same name, so it doesn't need its own save-data slot (the
 *  same guarantee `settlementGenerator.ts` already relies on for site/npcCount). */
export function generateSettlementName(seed: number, terrain: SettlementTerrain): string {
  const random = createSeededRandom(seed ^ 0x5e77e17)
  const words = WORDS[terrain]
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)]!

  const patternRoll = random()
  if (patternRoll < 0.35) return `${pick(words.adjectives)} ${pick(words.nouns)}`
  if (patternRoll < 0.7) return `${pick(words.nouns)} ${pick(words.adjectives)}`
  return pick(words.soloNames)
}
