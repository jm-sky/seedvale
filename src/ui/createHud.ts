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
    dispose: () => { disposed = true },
  }
}
