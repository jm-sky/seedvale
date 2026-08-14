import type { CharacterStats } from '../ui-vue/store'
import { getMountedVueUi } from '../ui-vue/mount'

export type Hud = {
  setFps: (fps: number) => void
  setTime: (timeOfDay: number) => void
  setExp: (exp: number) => void
  /** Total carried weight vs. `Inventory.maxWeight` — replaces the old
   *  per-item text counters (plan `2026-08-08--043` §10); the full breakdown
   *  now lives in the inventory screen (`[I]`). */
  setInventoryWeight: (current: number, max: number) => void
  /** Label for the held tool slot — empty string hides it. */
  setHeldTool: (label: string) => void
  /** Ratios (0-1) for the four player-needs bars (plan 106). */
  setPlayerNeeds: (needs: { stamina: number, vigor: number, hunger: number, thirst: number }) => void
  /** Raw current/max for the Character screen (plan 105) — the HUD bars above
   *  only need ratios, but the Character screen also shows absolute values. */
  setCharacterStats: (stats: CharacterStats) => void
  dispose: () => void
}

/** Compatibility facade. HUD chrome is rendered by Vue (`HudScreen.vue`). */
export function createHud(_parent: HTMLElement): Hud {
  let disposed = false
  const getUi = () => getMountedVueUi()
  return {
    setFps: (fps) => { if (!disposed) getUi()?.setHudFps(fps) },
    setTime: (timeOfDay) => { if (!disposed) getUi()?.setHudTime(timeOfDay) },
    setExp: (exp) => { if (!disposed) getUi()?.setHudExp(exp) },
    setInventoryWeight: (current, max) => { if (!disposed) getUi()?.setHudInventoryWeight(current, max) },
    setHeldTool: (label) => { if (!disposed) getUi()?.setHudHeldTool(label) },
    setPlayerNeeds: (needs) => { if (!disposed) getUi()?.setHudPlayerNeeds(needs) },
    setCharacterStats: (stats) => { if (!disposed) getUi()?.setCharacterStats(stats) },
    dispose: () => { disposed = true },
  }
}
