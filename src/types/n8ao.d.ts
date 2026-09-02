declare module 'n8ao' {
  import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
  import type { Camera, Color, Scene, WebGLRenderTarget } from 'three'

  export type N8AOQualityMode =
    | 'Performance'
    | 'Low'
    | 'Medium'
    | 'High'
    | 'Ultra'
    | 'Neural-Low'
    | 'Neural-Medium'
    | 'Neural-High'

  export type N8AODisplayMode = 'Combined' | 'AO' | 'No AO' | 'Split' | 'Split AO'

  export type N8AOConfiguration = {
    aoSamples: number
    aoRadius: number
    aoTones: number
    denoiseSamples: number
    denoiseRadius: number
    distanceFalloff: number
    intensity: number
    denoiseIterations: number
    color: Color
    gammaCorrection: boolean
    screenSpaceRadius: boolean
    halfRes: boolean
    depthAwareUpsampling: boolean
    colorMultiply: boolean
    transparencyAware: boolean
    stencil: boolean
    accumulate: boolean
    neuralDenoise: boolean
  }

  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: N8AOConfiguration
    beautyRenderTarget: WebGLRenderTarget
    /** Instance property (`this.autoDetectTransparency = true` in the
     *  constructor), not part of `configuration` — controls whether
     *  `render()`'s per-frame `detectTransparency()` is allowed to flip
     *  `configuration.transparencyAware` on. */
    autoDetectTransparency: boolean
    setQualityMode(mode: N8AOQualityMode): void
    setDisplayMode(mode: N8AODisplayMode): void
    enableDebugMode(): void
    disableDebugMode(): void
    lastTime: number
  }

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: N8AOConfiguration
    setQualityMode(mode: N8AOQualityMode): void
    setDisplayMode(mode: N8AODisplayMode): void
  }
}
