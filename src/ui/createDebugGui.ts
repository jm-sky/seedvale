import GUI, { type Controller } from 'lil-gui'
import type { WorldConfig } from '../config/worldConfig'
import type { DayNightState } from '../world/dayNight'
import { triangleCount } from '../config/worldConfig'

export type DebugGuiHandlers = {
  onTerrainChange: () => void
  onSkyChange: () => void
  onDayNightChange?: () => void
}

/** On-screen panel; mutates `config` / `dayNight` in place, then calls handlers. */
export function createDebugGui(
  config: WorldConfig,
  dayNight: DayNightState,
  handlers: DebugGuiHandlers,
): { dispose: () => void; toggle: () => void; setBusy: (busy: boolean) => void } {
  const gui = new GUI({ title: 'Seedvale' })

  const info = {
    get triangles() {
      return triangleCount(config.terrain.resolution).toLocaleString()
    },
  }

  /** Every controller that triggers a terrain regen — disabled while one is in flight. */
  const terrainControllers: Controller[] = []
  const status = {
    busy: false,
    get state() {
      return status.busy ? 'Regenerating…' : 'Idle'
    },
  }

  const world = gui.addFolder('World')
  world.add(status, 'state').name('Terrain status').listen().disable()
  terrainControllers.push(
    world
      .add(config, 'seed', 0, 9999, 1)
      .name('Seed')
      .onFinishChange(handlers.onTerrainChange),
  )

  const clock = gui.addFolder('Day / night')
  clock
    .add(dayNight, 'enabled')
    .name('Enabled')
    .onChange(() => handlers.onDayNightChange?.())
  clock
    .add(dayNight, 'timeMultiplier', 0, 20, 0.1)
    .name('Time multiplier')
    .onChange(() => handlers.onDayNightChange?.())
  clock
    .add(dayNight, 'dayLengthSec', 60, 1200, 10)
    .name('Day length (s)')
    .onChange(() => handlers.onDayNightChange?.())
  clock
    .add(dayNight, 'timeOfDay', 0, 1, 0.001)
    .name('Time of day')
    .listen()
    .onChange(() => handlers.onDayNightChange?.())

  const terrain = gui.addFolder('Terrain mesh')
  terrainControllers.push(
    terrain
      .add(config.terrain, 'resolution', {
        'Low (33)': 33,
        'Medium (49)': 49,
        'High (65)': 65,
        'Higher (97)': 97,
        'Ultra (129)': 129,
        'Insane (193)': 193,
      })
      .name('Resolution')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'flatShading')
      .name('Flat shading (low-poly)')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrain.add(info, 'triangles').name('Triangles / chunk').listen().disable()
  terrainControllers.push(
    terrain
      .add(config.terrain, 'chunkSize', 32, 128, 8)
      .name('Chunk size')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'loadRadius', 1, 6, 1)
      .name('Load radius')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'unloadRadius', 2, 8, 1)
      .name('Unload radius')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'heightScale', 4, 40, 0.5)
      .name('Height scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'waterLevel', 0, 4, 0.05)
      .name('Water level')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'noiseScale', 24, 200, 1)
      .name('Noise scale')
      .onFinishChange(handlers.onTerrainChange),
  )

  const fbm = terrain.addFolder('FBM')
  terrainControllers.push(
    fbm.add(config.terrain.fbm, 'octaves', 1, 8, 1).onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    fbm
      .add(config.terrain.fbm, 'persistence', 0.2, 0.9, 0.01)
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    fbm
      .add(config.terrain.fbm, 'lacunarity', 1.2, 3, 0.05)
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    fbm
      .add(config.terrain.fbm, 'exponentiation', 0.5, 5, 0.05)
      .name('Exponentiation')
      .onFinishChange(handlers.onTerrainChange),
  )

  const region = terrain.addFolder('Regions')
  terrainControllers.push(
    region
      .add(config.terrain.region, 'oceanThreshold', 0, 1, 0.01)
      .name('Ocean threshold')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'coastThreshold', 0, 1, 0.01)
      .name('Coast threshold')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'oceanDetailWeight', 0, 1, 0.01)
      .name('Ocean detail weight')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'continentScale', 400, 6000, 50)
      .name('Continent scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'mountainScale', 400, 6000, 50)
      .name('Mountain scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'mountainThreshold', 0, 1, 0.01)
      .name('Mountain threshold')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'mountainThresholdWidth', 0.01, 0.5, 0.01)
      .name('Mountain blend width')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'worleyCellSize', 40, 800, 10)
      .name('Ridge cell size')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'ridgeSharpness', 0.5, 6, 0.1)
      .name('Ridge sharpness')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'mountainGain', 0, 2, 0.05)
      .name('Mountain gain')
      .onFinishChange(handlers.onTerrainChange),
  )

  const grass = gui.addFolder('Grass')
  terrainControllers.push(
    grass
      .add(config.terrain.grass, 'enabled')
      .name('Enabled')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    grass
      .add(config.terrain.grass, 'radius', 1, 12, 1)
      .name('Render radius (chunks)')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    grass
      .add(config.terrain.grass, 'density', 120000, 400000, 1000)
      .name('Density (candidates/chunk)')
      .onFinishChange(handlers.onTerrainChange),
  )

  const sky = gui.addFolder('Sky (manual)')
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

  terrainControllers.push(
    gui.add({ rebuild: handlers.onTerrainChange }, 'rebuild').name('Rebuild world'),
  )

  function setBusy(busy: boolean): void {
    status.busy = busy
    for (const c of terrainControllers) c.disable(busy)
  }

  return {
    dispose: () => gui.destroy(),
    toggle: () => gui.show(gui._hidden),
    setBusy,
  }
}
