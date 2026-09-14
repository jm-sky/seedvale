import type { QuestListEntry } from '../../quests/QuestManager'
import type { QuestState } from '../../quests/quests'

export type QuestLogFilter = 'current' | 'offers' | 'history'

export type QuestLogBuckets = {
  current: readonly QuestListEntry[]
  offers: readonly QuestListEntry[]
  history: readonly QuestListEntry[]
  counts: Readonly<Record<QuestLogFilter, number>>
}

const CURRENT_RANK: Record<'ready_to_report' | 'active', number> = {
  ready_to_report: 0,
  active: 1,
}

const HISTORY_RANK: Record<'complete' | 'failed' | 'invalidated' | 'abandoned', number> = {
  complete: 0,
  failed: 1,
  invalidated: 2,
  abandoned: 3,
}

/** Presentation category for the Quest Log. `not_offered` is hidden. */
export function questLogBucket(state: QuestState): QuestLogFilter | null {
  if (state === 'ready_to_report' || state === 'active') return 'current'
  if (state === 'offered') return 'offers'
  if (state === 'complete' || state === 'failed' || state === 'invalidated' || state === 'abandoned') return 'history'
  return null
}

function byId(a: QuestListEntry, b: QuestListEntry): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Projects `QuestManager.list()` entries into Quest Log buckets.
 * Hides `not_offered` without changing list visibility semantics.
 */
export function projectQuestLog(entries: readonly QuestListEntry[]): QuestLogBuckets {
  const current: QuestListEntry[] = []
  const offers: QuestListEntry[] = []
  const history: QuestListEntry[] = []
  for (const entry of entries) {
    const bucket = questLogBucket(entry.state)
    if (bucket === 'current') current.push(entry)
    else if (bucket === 'offers') offers.push(entry)
    else if (bucket === 'history') history.push(entry)
  }
  current.sort((a, b) => {
    const rank = CURRENT_RANK[a.state as 'ready_to_report' | 'active'] - CURRENT_RANK[b.state as 'ready_to_report' | 'active']
    return rank !== 0 ? rank : byId(a, b)
  })
  offers.sort(byId)
  history.sort((a, b) => {
    const rank = HISTORY_RANK[a.state as keyof typeof HISTORY_RANK] - HISTORY_RANK[b.state as keyof typeof HISTORY_RANK]
    return rank !== 0 ? rank : byId(a, b)
  })
  return {
    current,
    offers,
    history,
    counts: { current: current.length, offers: offers.length, history: history.length },
  }
}
