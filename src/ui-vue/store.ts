import { reactive } from 'vue'
import type { NpcAgent } from '../ai/NpcAgent'
import type { QuestDialogOverride, QuestManager } from '../quests/QuestManager'
import type { Settlement } from '../settlement/createSettlement'
import type { ItemKind } from '../items/items'

type NpcDialogueMenuState = {
  open: boolean
  npc: NpcAgent | null
  settlement: Settlement | null
  timeOfDay: number
  helpResult: QuestDialogOverride | null
}

type InventoryState = {
  open: boolean
  counts: Partial<Record<ItemKind, number>>
  totalWeight: number
  maxWeight: number
  onDrop: ((kind: ItemKind) => void) | null
}

export const ui = reactive({
  npcDialogueMenu: {
    open: false,
    npc: null,
    settlement: null,
    timeOfDay: 0,
    helpResult: null,
  } as NpcDialogueMenuState,
  inventory: {
    open: false,
    counts: {},
    totalWeight: 0,
    maxWeight: 0,
    onDrop: null,
  } as InventoryState,
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

export function closeNpcDialogueMenu(): void {
  const state = ui.npcDialogueMenu
  if (!state.open) return
  state.helpResult?.offer?.onDecline()
  state.open = false
  state.npc = null
  state.settlement = null
  state.helpResult = null
}

export function acceptNpcDialogueOffer(): void {
  const state = ui.npcDialogueMenu
  if (!state.open || !state.helpResult?.offer) return
  state.helpResult.offer.onAccept()
  state.open = false
  state.npc = null
  state.settlement = null
  state.helpResult = null
}

export function isNpcDialogueMenuOpen(): boolean {
  return ui.npcDialogueMenu.open
}

export function openInventory(
  counts: Partial<Record<ItemKind, number>>,
  totalWeight: number,
  maxWeight: number,
  onDrop: (kind: ItemKind) => void,
): void {
  ui.inventory.counts = { ...counts }
  ui.inventory.totalWeight = totalWeight
  ui.inventory.maxWeight = maxWeight
  ui.inventory.onDrop = onDrop
  ui.inventory.open = true
}

export function refreshInventory(
  counts: Partial<Record<ItemKind, number>>,
  totalWeight: number,
  maxWeight: number,
): void {
  ui.inventory.counts = { ...counts }
  ui.inventory.totalWeight = totalWeight
  ui.inventory.maxWeight = maxWeight
}

export function closeInventory(): void {
  ui.inventory.open = false
  ui.inventory.onDrop = null
}

export function isInventoryOpen(): boolean {
  return ui.inventory.open
}
