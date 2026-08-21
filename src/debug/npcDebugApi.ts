import type { NpcInspectionSnapshot, NpcWhy } from '../ai/NpcAgent'
import type { WorldBundle } from '../app/worldBundle'
import type { NpcTraceEvent } from './npcTrace'
import { isDebugMode } from './debugMode'
import {
  findNpcById,
  freezeNpc,
  type NpcQueryFilter,
  type NpcQueryResult,
  queryNpcs,
  reevaluateNpc,
  setFrenzyWolf,
  unfreezeNpc,
} from './npcInspector'

/**
 * Browser console / automation surface (plan 170 §4) — `window.seedvale.debug`.
 * Only installed while `?debug` is enabled; returns plain JSON-serializable
 * data so it works equally from a browser devtools console and a scripted
 * agent driving the page. No dependency on Vue component state.
 */

export type NpcDebugHandle = {
  state: () => NpcInspectionSnapshot | null
  history: () => readonly NpcTraceEvent[] | null
  why: () => NpcWhy | null
  freeze: () => boolean
  unfreeze: () => boolean
  reevaluate: () => boolean
}

export type SeedvaleDebugApi = {
  npc: (id: string) => NpcDebugHandle | null
  npcs: (filter?: NpcQueryFilter) => NpcQueryResult[]
  /** `setFrenzyWolf()` (plan 179 §3) — see `npcInspector.ts`'s doc. */
  setFrenzyWolf: () => boolean
}

declare global {
  interface Window {
    seedvale?: { debug: SeedvaleDebugApi }
  }
}

/** Installs `window.seedvale.debug` when `?debug` is enabled; a no-op
 *  outside debug mode, so the mutation surface does not exist in production
 *  builds. `bundle` is the stable `WorldBundle` container (its fields are
 *  reassigned in place on `rebuildWorld()`, the reference itself never
 *  changes), and `getTimeOfDay` is a live accessor — so every call here
 *  reflects the current world without re-installing after a rebuild. */
export function installNpcDebugApi(bundle: WorldBundle, getTimeOfDay: () => number): void {
  if (!isDebugMode()) return
  const api: SeedvaleDebugApi = {
    npc: (id) => {
      if (!findNpcById(bundle, id)) return null
      return {
        state: () => findNpcById(bundle, id)?.npc.createInspectionSnapshot(getTimeOfDay()) ?? null,
        history: () => findNpcById(bundle, id)?.npc.history() ?? null,
        why: () => findNpcById(bundle, id)?.npc.why(getTimeOfDay()) ?? null,
        freeze: () => freezeNpc(bundle, id),
        unfreeze: () => unfreezeNpc(bundle, id),
        reevaluate: () => reevaluateNpc(bundle, id),
      }
    },
    npcs: (filter) => queryNpcs(bundle, getTimeOfDay(), filter),
    setFrenzyWolf: () => setFrenzyWolf(bundle),
  }
  window.seedvale = { ...window.seedvale, debug: api }
}
