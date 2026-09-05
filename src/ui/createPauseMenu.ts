import type { ActionResult } from '../app/actions/actionContracts'
import type { CreateSaveResult, SaveManagementResult, SaveSlotInfo, WriteSaveResult } from '../persistence/saveDb'
import type { SeedChoice, SeedRecord } from '../world/seedLibrary'
import { getMountedVueUi } from '../ui-vue/mount'

export type PauseMenuHandlers = {
  onPause: () => void
  onResume: () => void
  onToggleGui?: () => void
  onNameChange?: (name: string) => void
  onNameCommit?: (name: string) => void
  onSave?: () => Promise<WriteSaveResult>
  onSaveAs?: (name: string) => Promise<CreateSaveResult>
  onLoadSave?: (id: string) => void
  onListSaves?: () => Promise<SaveSlotInfo[]>
  /** Every stored row, healthy or not (plan persistence-004 §5) — the Load
   *  list's data source, distinct from `onListSaves` (which only ever
   *  populates a name-collision check for Save As / New Game). */
  onListSaveManagement?: () => Promise<SaveManagementResult>
  onDeleteSave?: (id: string) => Promise<void>
  /** Seed Library listing (plan world-015 §3/§8) — used only to populate the
   *  New Game seed picker; never triggers worldgen/location scan itself. */
  onListSeeds?: () => Promise<SeedRecord[]>
  onRefresh?: () => void
  onBuildSimpleFire?: () => ActionResult
  onBuildFirePit?: () => ActionResult
  onBuildWoodPile?: () => ActionResult
  onBuildGrate?: () => ActionResult
  onLightBranch?: () => ActionResult
  onLightWoodenTorch?: () => ActionResult
  /** `seedChoice` resolves through `world/seedLibrary.ts`'s
   *  `resolveNewGameSeed()` (plan world-015 §3) — reusing an existing seed
   *  must never fall back to a fresh `randomSeed()`. */
  onNewGame?: (name: string, seedChoice: SeedChoice) => void
  onQuestLog?: () => void
  onVillagers?: () => void
  onInventory?: () => void
  onWorldMap?: () => void
}
export type PauseMenu = { isPaused: () => boolean; togglePause: () => void; setSeed: (seed: number) => void; dispose: () => void }

export function createPauseMenu(
  _parent: HTMLElement,
  seed: number,
  playerName: string,
  handlers: PauseMenuHandlers,
  /** @deprecated Escape priority is now handled by Vue's shared overlay stack. */
  _isSuppressed?: () => boolean,
): PauseMenu {
  let disposed = false
  const getUi = () => getMountedVueUi()
  getUi()?.configurePauseMenu(seed, playerName, handlers)
  return {
    isPaused: () => !disposed && (getUi()?.isPauseMenuOpen() ?? false),
    togglePause: () => { if (!disposed) getUi()?.togglePause() },
    setSeed: (nextSeed) => { if (!disposed) getUi()?.setPauseSeed(nextSeed) },
    dispose: () => { if (!disposed) { disposed = true; getUi()?.closePauseMenu() } },
  }
}
