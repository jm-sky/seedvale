import type { HouseAssemblyCensus } from '../settlement/houseBuilder'

/** Scene-side visual configuration (plan tools-003) — Vue holds this as
 *  reactive state and pushes it through `HouseBrowserScene.setConfig()`. */
export interface HouseBrowserConfig {
  showGrid: boolean
  showGround: boolean
  showShadows: boolean
  showColliders: boolean
  colliderPadding: number
  cameraAutoFit: boolean
}

export const DEFAULT_HOUSE_BROWSER_CONFIG: HouseBrowserConfig = {
  showGrid: true,
  showGround: true,
  showShadows: true,
  showColliders: false,
  colliderPadding: 0,
  cameraAutoFit: true,
}

export type CameraView = 'front' | 'back' | 'left' | 'right' | 'top'

/** Read-only info about the currently attached `HouseAssembly`, reported to
 *  Vue after a successful `setHouse()` so House Info never duplicates
 *  `HouseAssembly`/`HouseDefinition` data of its own. */
export interface HouseBrowserAssemblyInfo {
  definitionId: string
  census: HouseAssemblyCensus
  colliderCount: number
}

export interface HouseBrowserScene {
  setHouse(id: string): Promise<void>
  setConfig(config: HouseBrowserConfig): void
  resetCamera(): void
  setCameraView(view: CameraView): void
  dispose(): void
}
