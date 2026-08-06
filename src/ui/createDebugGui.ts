import GUI from 'lil-gui'
import type { WorldConfig } from '../config/worldConfig'
import { triangleCount } from '../config/worldConfig'

export type DebugGuiHandlers = {
  onTerrainChange: () => void
  onSkyChange: () => void
}

/** On-screen panel; mutates `config` in place, then calls handlers. */
export function createDebugGui(
  config: WorldConfig,
  handlers: DebugGuiHandlers,
): { dispose: () => void } {
  const gui = new GUI({ title: 'Seedvale' })

  const info = {
    get triangles() {
      return triangleCount(config.terrain.resolution).toLocaleString()
    },
  }

  const world = gui.addFolder('World')
  world.add(config, 'seed', 0, 9999, 1).name('Seed').onFinishChange(handlers.onTerrainChange)

  const terrain = gui.addFolder('Terrain mesh')
  terrain
    .add(config.terrain, 'resolution', {
      'Low (65)': 65,
      'Default (129)': 129,
      'High (193)': 193,
      'Ultra (257)': 257,
    })
    .name('Resolution')
    .onFinishChange(handlers.onTerrainChange)
  terrain.add(info, 'triangles').name('Triangles').listen().disable()
  terrain
    .add(config.terrain, 'size', 64, 256, 8)
    .name('Map size')
    .onFinishChange(handlers.onTerrainChange)
  terrain
    .add(config.terrain, 'heightScale', 4, 40, 0.5)
    .name('Height scale')
    .onFinishChange(handlers.onTerrainChange)
  terrain
    .add(config.terrain, 'waterLevel', 0, 4, 0.05)
    .name('Water level')
    .onFinishChange(handlers.onTerrainChange)
  terrain
    .add(config.terrain, 'noiseScale', 24, 200, 1)
    .name('Noise scale')
    .onFinishChange(handlers.onTerrainChange)

  const fbm = terrain.addFolder('FBM')
  fbm
    .add(config.terrain.fbm, 'octaves', 1, 8, 1)
    .onFinishChange(handlers.onTerrainChange)
  fbm
    .add(config.terrain.fbm, 'persistence', 0.2, 0.9, 0.01)
    .onFinishChange(handlers.onTerrainChange)
  fbm
    .add(config.terrain.fbm, 'lacunarity', 1.2, 3, 0.05)
    .onFinishChange(handlers.onTerrainChange)
  fbm
    .add(config.terrain.fbm, 'exponentiation', 0.5, 5, 0.05)
    .name('Exponentiation')
    .onFinishChange(handlers.onTerrainChange)

  const sky = gui.addFolder('Sky')
  sky
    .add(config.sky, 'inclination', 0, 1, 0.01)
    .onChange(handlers.onSkyChange)
  sky
    .add(config.sky, 'azimuth', 0, 1, 0.01)
    .onChange(handlers.onSkyChange)
  sky
    .add(config.sky, 'turbidity', 0.1, 20, 0.1)
    .onChange(handlers.onSkyChange)
  sky
    .add(config.sky, 'rayleigh', 0.1, 4, 0.05)
    .onChange(handlers.onSkyChange)

  gui.add({ rebuild: handlers.onTerrainChange }, 'rebuild').name('Rebuild terrain')

  return {
    dispose: () => gui.destroy(),
  }
}
