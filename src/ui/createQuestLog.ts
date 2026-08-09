import type { QuestListEntry } from '../quests/QuestManager'
import { getMountedVueUi } from '../ui-vue/mount'

export type QuestLogHandlers = { onClose?: () => void }
export type QuestLog = {
  isOpen: () => boolean
  open: () => void
  close: () => void
  toggle: () => void
  refresh: (entries: readonly QuestListEntry[], exp: number, relation: (name: string) => number) => void
  dispose: () => void
}

/** Compatibility facade for the Vue quest log. */
export function createQuestLog(_parent: HTMLElement, handlers: QuestLogHandlers = {}): QuestLog {
  let disposed = false
  const getUi = () => getMountedVueUi()
  const close = () => { if (!disposed) { getUi()?.closeQuestLog(); handlers.onClose?.() } }
  return {
    isOpen: () => !disposed && (getUi()?.isQuestLogOpen() ?? false),
    open: () => { if (!disposed) getUi()?.openQuestLog([], 0, () => 0) },
    close,
    toggle: () => { if (!disposed) { if (getUi()?.isQuestLogOpen()) close(); else getUi()?.openQuestLog([], 0, () => 0) } },
    refresh: (entries, exp, relation) => { if (!disposed) { const ui = getUi(); if (ui?.isQuestLogOpen()) ui.refreshQuestLog(entries, exp, relation); else ui?.openQuestLog(entries, exp, relation) } },
    dispose: () => { if (!disposed) { disposed = true; getUi()?.closeQuestLog() } },
  }
}
