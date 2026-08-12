import type { LightActionResult } from '../app/userActions'
import { getMountedVueUi } from '../ui-vue/mount'

export type PauseMenuHandlers = {
  onPause: () => void
  onResume: () => void
  onToggleGui?: () => void
  onNameChange?: (name: string) => void
  onNameCommit?: (name: string) => void
  onSave?: () => void
  onRefresh?: () => void
  onBuildSimpleFire?: () => boolean
  onBuildFirePit?: () => boolean
  onLightBranch?: () => LightActionResult
  onLightWoodenTorch?: () => LightActionResult
  onNewGame?: () => void
  onQuestLog?: () => void
  onVillagers?: () => void
  onInventory?: () => void
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
