import type { ItemKind } from '../items/items'
import { isProcessComplete, type ItemStackOutput, type TimedProcess } from '../items/timedProcess'

/** Plan 159 §8 — physical drying rack: a deterministic settlement landmark
 *  (same "persistent world record + presentation object" idea as the well/
 *  campfire, not a player-placed prop) holding at most one background
 *  `TimedProcess` at a time. No drying manager — the rack itself is the
 *  authoritative owner, resolved lazily whenever it's next interacted with. */
export type DryingRackRecord = {
  id: string
  x: number
  z: number
  yaw: number
  process: TimedProcess | null
}

/** Raw meat kinds (existing + species meat, plan 134) the rack accepts —
 *  every one already cooks down to `roasted_meat` at a campfire; drying is
 *  the same "one shared recipe table" idea applied to preservation instead. */
const DRYING_MEAT_INPUTS: readonly ItemKind[] = [
  'raw_meat', 'deer_meat', 'wolf_meat', 'boar_meat', 'rabbit_meat', 'beef',
]

const MEAT_DRYING_DURATION_DAYS = 1.5
const FISH_DRYING_DURATION_DAYS = 1

export type DryingRecipe = { inputKind: ItemKind, output: ItemStackOutput, durationDays: number }

/** First raw meat kind (in `DRYING_MEAT_INPUTS` order) present in `has`, or
 *  `fish` if held, or null. Pure — the caller supplies availability instead
 *  of this function reaching into `Inventory` itself. */
export function pickDryingRecipe(has: (kind: ItemKind) => boolean): DryingRecipe | null {
  for (const inputKind of DRYING_MEAT_INPUTS) {
    if (has(inputKind)) return { inputKind, output: { kind: 'dried_meat', count: 1 }, durationDays: MEAT_DRYING_DURATION_DAYS }
  }
  if (has('fish')) return { inputKind: 'fish', output: { kind: 'dried_fish', count: 1 }, durationDays: FISH_DRYING_DURATION_DAYS }
  return null
}

export function startDryingProcess(id: string, recipe: DryingRecipe, nowDays: number): TimedProcess {
  return {
    id,
    kind: 'drying',
    startedAtDays: nowDays,
    durationDays: recipe.durationDays,
    input: [{ kind: recipe.inputKind, count: 1 }],
    output: [recipe.output],
  }
}

export function isDryingComplete(process: TimedProcess, nowDays: number): boolean {
  return isProcessComplete(process, nowDays)
}
