import type { ResourceType } from '../terrain/naturalResources'
import { SIGNIFICANT_RICHNESS } from '../terrain/naturalResources'
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

/** Word fragments a significant dominant resource (plan 032 §9) can mix into
 *  the terrain-based name — e.g. a mountain village that also sits on an
 *  iron deposit can become "Żelazna Turnia" instead of just any mountain
 *  name. Not every `ResourceType` gets an entry: clay/salt/resin/herbs from
 *  `naturalResources.ts` that lack one simply never influence the name (falls
 *  back to terrain-only, same as no resource at all). No `soloNames` here —
 *  those stay purely terrain-flavored; only the adjective+noun patterns
 *  (70% of rolls) pick up resource flavor. */
const RESOURCE_WORDS: Partial<Record<ResourceType, { adjectives: readonly string[], nouns: readonly string[] }>> = {
  iron: { adjectives: ['Żelazna', 'Rudna'], nouns: ['Kuźnia', 'Ruda'] },
  gold: { adjectives: ['Złota', 'Bogata'], nouns: ['Żyła', 'Skarbnica'] },
  fish: { adjectives: ['Rybna'], nouns: ['Rybaki', 'Tonie'] },
  fertile_soil: { adjectives: ['Żyzna', 'Urodzajna'], nouns: ['Niwa', 'Rola'] },
  salt: { adjectives: ['Słona'], nouns: ['Solanka', 'Warzelnia'] },
  resin: { adjectives: ['Żywiczna'], nouns: ['Smolarnia'] },
}

/** Chance a significant resource actually shows up in the name at all —
 *  "Zasób nie powinien zawsze występować w nazwie — tylko gdy jest
 *  wystarczająco znaczący" (§9); significance itself is already gated by
 *  `SIGNIFICANT_RICHNESS`, this is the additional "not every single time" roll. */
const RESOURCE_NAME_CHANCE = 0.5

/** Deterministic name for a settlement — same `(seed, terrain, dominantResource)`
 *  always produces the same name, so it doesn't need its own save-data slot
 *  (the same guarantee `settlementGenerator.ts` already relies on for
 *  site/families). `dominantResource` is optional and terrain-only naming
 *  (no resource, or a resource type with no `RESOURCE_WORDS` entry, or a
 *  resource below `SIGNIFICANT_RICHNESS`) behaves exactly as before. */
export function generateSettlementName(
  seed: number,
  terrain: SettlementTerrain,
  dominantResource?: { type: ResourceType, richness: number } | null,
): string {
  const random = createSeededRandom(seed ^ 0x5e77e17)
  const terrainWords = WORDS[terrain]
  const resourceWords =
    dominantResource && dominantResource.richness >= SIGNIFICANT_RICHNESS
      ? RESOURCE_WORDS[dominantResource.type]
      : undefined
  const useResourceFlavor = resourceWords !== undefined && random() < RESOURCE_NAME_CHANCE
  const words = useResourceFlavor
    ? {
        adjectives: [...terrainWords.adjectives, ...resourceWords.adjectives],
        nouns: [...terrainWords.nouns, ...resourceWords.nouns],
      }
    : terrainWords
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)]!

  const patternRoll = random()
  if (patternRoll < 0.35) return `${pick(words.adjectives)} ${pick(words.nouns)}`
  if (patternRoll < 0.7) return `${pick(words.nouns)} ${pick(words.adjectives)}`
  return pick(terrainWords.soloNames)
}
