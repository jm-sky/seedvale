import { reactive } from 'vue'
import type { NpcAgent } from '../ai/NpcAgent'
import type { QuestDialogOverride, QuestManager } from '../quests/QuestManager'
import type { Settlement } from '../settlement/createSettlement'

/**
 * Small reactive store (plan 046 — "reactive()/ref() singletons... easy to
 * swap for Pinia later if complexity grows", not needed at this scale yet).
 * Only imported from inside the already-dynamically-imported Vue chunk
 * (`mount.ts`) — never import this module from a synchronously-loaded
 * vanilla module (`src/ui/`, `src/app/createApp.ts`), or Vue's runtime
 * stops being code-split and starts blocking first paint again.
 */

type NpcDialogueMenuState = {
  open: boolean
  npc: NpcAgent | null
  settlement: Settlement | null
  timeOfDay: number
  /** Computed once, when the menu opens (see `openNpcDialogueMenu`) — never
   *  recomputed while open. `QuestManager.onInteract` has real side effects
   *  (advances/consumes quest state), so re-querying it on every render or
   *  topic click would silently mutate quest progress the player never
   *  chose to engage with. */
  helpResult: QuestDialogOverride | null
}

export const ui = reactive({
  npcDialogueMenu: {
    open: false,
    npc: null,
    settlement: null,
    timeOfDay: 0,
    helpResult: null,
  } as NpcDialogueMenuState,
})

export function openNpcDialogueMenu(
  npc: NpcAgent,
  settlement: Settlement,
  questManager: QuestManager,
  timeOfDay: number,
): void {
  const state = ui.npcDialogueMenu
  const override = questManager.onInteract(npc.name)
  state.npc = npc
  state.settlement = settlement
  state.timeOfDay = timeOfDay
  state.helpResult = override ?? { line: npc.getDialogueLine() }
  state.open = true
}

function resetNpcDialogueMenu(): void {
  const state = ui.npcDialogueMenu
  state.open = false
  state.npc = null
  state.settlement = null
  state.helpResult = null
}

/** Any way of leaving the menu without explicitly accepting a pending offer
 *  (Escape, backdrop click, an explicit "Odmów" button) counts as declining
 *  it — same semantics as the old single-panel `NpcDialog.close()`. No-op
 *  (including no `onDecline` call) if there's no offer to decline. */
export function closeNpcDialogueMenu(): void {
  const state = ui.npcDialogueMenu
  if (!state.open) return
  state.helpResult?.offer?.onDecline()
  resetNpcDialogueMenu()
}

/** No-op outside of an actual pending offer. */
export function acceptNpcDialogueOffer(): void {
  const state = ui.npcDialogueMenu
  if (!state.open || !state.helpResult?.offer) return
  state.helpResult.offer.onAccept()
  resetNpcDialogueMenu()
}

export function isNpcDialogueMenuOpen(): boolean {
  return ui.npcDialogueMenu.open
}
