import { markRaw, type Raw, reactive } from 'vue'
import type { NpcAgent } from '../ai/NpcAgent'
import type { ItemKind } from '../items/items'
import type { QuestDialogOverride, QuestManager } from '../quests/QuestManager'
import type { Settlement } from '../settlement/createSettlement'
import type { FoodSourceType } from '../settlement/settlementGenerator'

/** `npc: Raw<NpcAgent>` — it holds THREE.js mesh/Object3D refs that shouldn't
 *  be deep-proxied (perf, and Vue's `UnwrapRef` otherwise mistypes it when
 *  nested inside an array); `refreshVillagers` applies the matching
 *  `markRaw()` at runtime. */
export type VillagerEntry = {
  npc: Raw<NpcAgent>
  settlementName: string
  foodSourceType: FoodSourceType
}

type VillagerRefreshEntry = {
  npc: NpcAgent
  settlementName: string
  foodSourceType: FoodSourceType
}

export const VILLAGERS_PAGE_SIZE = 10

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
  villagers: {
    open: false,
    entries: [] as VillagerEntry[],
    page: 0,
  },
  inventory: {
    open: false,
    counts: {},
    totalWeight: 0,
    maxWeight: 0,
    onDrop: null,
  } as InventoryState,
  /** Escape-priority stack (plan 046 "Faza 2" idea, built now since Faza 1
   *  already needs it) — only the top id's registered `close()` fires on
   *  Escape (`App.vue`'s single global listener, see `closeTopOverlay`).
   *  `NpcDialogueMenu`/`InventoryScreen` aren't on this stack (still their
   *  own listeners) — Vue mounts children before parents, so their
   *  listeners register before `App.vue`'s and naturally still win the same
   *  way the old vanilla registration-order trick did. */
  openStack: [] as string[],
})

const overlayCloseHandlers = new Map<string, () => void>()

/** Called once per screen component (`useOverlayScreen` composable) — not
 *  per open/close. */
export function registerOverlay(id: string, close: () => void): void {
  overlayCloseHandlers.set(id, close)
}

export function syncOverlayStack(id: string, open: boolean): void {
  const idx = ui.openStack.indexOf(id)
  if (open && idx === -1) ui.openStack.push(id)
  else if (!open && idx !== -1) ui.openStack.splice(idx, 1)
}

export function closeTopOverlay(): void {
  const top = ui.openStack.at(-1)
  if (top) overlayCloseHandlers.get(top)?.()
}

export function openVillagers(): void {
  ui.villagers.open = true
  ui.villagers.page = 0
}

export function closeVillagers(): void {
  ui.villagers.open = false
}

export function toggleVillagers(): void {
  if (ui.villagers.open) closeVillagers()
  else openVillagers()
}

/** `markRaw` on `npc` — it holds THREE.js mesh/Object3D references that
 *  shouldn't be deep-proxied (perf, and Vue's `UnwrapRef` mistypes deeply
 *  nested class instances inside arrays otherwise). */
export function refreshVillagers(entries: readonly VillagerRefreshEntry[]): void {
  ui.villagers.entries = entries.map((e) => ({ ...e, npc: markRaw(e.npc) }))
}

export function isVillagersOpen(): boolean {
  return ui.villagers.open
}

export function setVillagersPage(page: number): void {
  ui.villagers.page = page
}

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
