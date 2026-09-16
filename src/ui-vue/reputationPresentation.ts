export type ReputationTone =
  | 'strong-negative'
  | 'negative'
  | 'neutral'
  | 'positive'
  | 'strong-positive'

export type ReputationGrammar = 'neuter' | 'feminine'

export type ReputationPresentation = {
  level: ReputationTone
  label: string
  toneClass: string
}

const LABELS: Record<ReputationGrammar, Record<ReputationTone, string>> = {
  feminine: {
    'strong-negative': 'Bardzo niska',
    negative: 'Niska',
    neutral: 'Neutralna',
    positive: 'Wysoka',
    'strong-positive': 'Bardzo wysoka',
  },
  neuter: {
    'strong-negative': 'Bardzo niskie',
    negative: 'Niskie',
    neutral: 'Neutralne',
    positive: 'Wysokie',
    'strong-positive': 'Bardzo wysokie',
  },
}

const TONE_CLASS: Record<ReputationTone, string> = {
  'strong-negative': 'text-red-400',
  negative: 'text-red-300',
  neutral: 'text-white/50',
  positive: 'text-emerald-300',
  'strong-positive': 'text-emerald-400',
}

/** Classifies one `-100..100` reputation value into a qualitative level.
 *  Inclusive boundaries: `-100..-50`, `-49..-10`, `-9..9`, `10..49`, `50..100`.
 *
 * @domain ui-input
 */
export function classifyReputationLevel(value: number): ReputationTone {
  if (value <= -50) return 'strong-negative'
  if (value <= -10) return 'negative'
  if (value <= 9) return 'neutral'
  if (value <= 49) return 'positive'
  return 'strong-positive'
}

/** Character Screen presentation for one reputation dimension. Derived only
 *  from the numeric value and a static grammatical variant — not persisted.
 *
 * @domain ui-input
 */
export function reputationPresentation(
  value: number,
  grammar: ReputationGrammar,
): ReputationPresentation {
  const level = classifyReputationLevel(value)
  return {
    level,
    label: LABELS[grammar][level],
    toneClass: TONE_CLASS[level],
  }
}
