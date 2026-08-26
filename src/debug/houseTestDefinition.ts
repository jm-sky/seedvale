import { HOME_HOUSE_DEFINITIONS, type HouseDefinition } from '../assets/houseDefinitionExample'
import { urlParamValue } from './debugMode'

/**
 * `?houseTest=ID` definition lookup — split out of `debugMode.ts` because it
 * pulls in `assets/houseDefinitionExample.ts` (a heavy data module), and
 * `debugMode.ts` itself is imported by low-level runtime code
 * (`settlement/livestock.ts`, `settlement/props.ts`, `ai/NpcAgent.ts`, …).
 * Only `createHouseTestScene.ts` imports this module, so it can't create the
 * circular-import cycle a `debugMode.ts`-level import did.
 */

export type HouseDefinitionLookup =
  | { ok: true, definition: HouseDefinition }
  | { ok: false, error: string }

/** Resolves `?houseTest=ID` (or bare `?houseTest` for the first available
 *  definition) against the same `HOME_HOUSE_DEFINITIONS` the settlement
 *  runtime picks houses from — no separate registry. Unknown IDs come back
 *  as a readable error listing the available definitions instead of
 *  throwing, so the caller can end the debug scene cleanly. */
export function houseDefinitionFromUrl(): HouseDefinitionLookup {
  const available = HOME_HOUSE_DEFINITIONS
  const id = urlParamValue('houseTest')

  if (id === null) {
    const first = available[0]
    if (!first) return { ok: false, error: 'No house definitions available.' }
    return { ok: true, definition: first }
  }

  const match = available.find((def) => def.id === id)
  if (match) return { ok: true, definition: match }

  const list = available.map((def) => def.id).join('\n')
  return { ok: false, error: `Unknown house definition: ${id}\n\nAvailable:\n${list}` }
}
