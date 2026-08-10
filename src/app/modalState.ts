import type { VueUi } from '../ui-vue/mount'
import type { InventoryScreen } from '../ui/createInventoryScreen'
import type { NpcDialog } from '../ui/createNpcDialog'
import type { PauseMenu } from '../ui/createPauseMenu'
import type { QuestLog } from '../ui/createQuestLog'
import type { QuickActions } from '../ui/createQuickActions'
import type { TimeSkip } from '../world/timeSkip'

/** Which full-screen modal (if any) currently owns input — at most one at a
 *  time, in the same priority order the old `if`/`else if` cascade in
 *  `createApp.ts`'s `tick()` checked them (pause menu first, world
 *  interaction last as the `null` fallthrough). */
export type ActiveModal =
  | 'menu'
  | 'npcDialogueMenu'
  | 'npcDialog'
  | 'questLog'
  | 'villagers'
  | 'inventory'
  | 'quickActions'
  | 'timeSkip'
  | 'worldConfig'
  | 'notes'
  | null

export function activeModal(
  pauseMenu: PauseMenu,
  npcDialog: NpcDialog,
  questLog: QuestLog,
  vueUi: VueUi,
  inventoryScreen: InventoryScreen,
  quickActions: QuickActions,
  timeSkip: TimeSkip,
): ActiveModal {
  if (pauseMenu.isPaused()) return 'menu'
  if (vueUi.isNpcDialogueMenuOpen()) return 'npcDialogueMenu'
  if (npcDialog.isOpen()) return 'npcDialog'
  if (questLog.isOpen()) return 'questLog'
  if (vueUi.isVillagersOpen()) return 'villagers'
  if (inventoryScreen.isOpen()) return 'inventory'
  if (quickActions.isOpen()) return 'quickActions'
  if (timeSkip.isActive()) return 'timeSkip'
  if (vueUi.isWorldConfigScreenOpen()) return 'worldConfig'
  if (vueUi.isNotesOpen()) return 'notes'
  return null
}
