import {
  AmbientLight,
  AxesHelper,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Scene,
  Vector3,
} from 'three'
import type { BackgroundPreset, LightingPreset, RenderMode } from '../state'
import {
  TORCH_LIGHT_BRANCH,
  TORCH_LIGHT_DECAY,
  TORCH_TIP_OFFSET_BRANCH,
} from '../../../player/torchLightPresets'
import { createLights } from '../../../world/createLights'
import { createSky } from '../../../world/createSky'
import { skyParamsFromTime } from '../../../world/dayNight'

export type PreviewLighting = {
  group: Group
  torchLight: PointLight | null
  apply: (opts: {
    mode: RenderMode
    preset: LightingPreset
    timeOfDay: number
    torchFuelRatio: number
    torchAnchorWorld?: Matrix4 | null
  }) => void
  dispose: () => void
}

const BG_COLORS: Record<BackgroundPreset, number> = {
  dark: 0x14181c,
  mid: 0x4a5560,
  light: 0xb8c4d0,
  checker: 0x2a3038,
}

export function createViewerScene(): {
  scene: Scene
  world: Group
  ground: Mesh
  grid: GridHelper
  axes: AxesHelper
  lighting: PreviewLighting
} {
  const scene = new Scene()
  const world = new Group()
  scene.add(world)

  const groundMat = new MeshStandardMaterial({ color: 0x3a4a38, roughness: 0.95 })
  const ground = new Mesh(new PlaneGeometry(40, 40), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  world.add(ground)

  const grid = new GridHelper(20, 20, 0x556677, 0x334455)
  world.add(grid)

  const axes = new AxesHelper(2)
  world.add(axes)

  const lighting = createPreviewLighting(scene, world)

  return { scene, world, ground, grid, axes, lighting }
}

function createPreviewLighting(scene: Scene, world: Group): PreviewLighting {
  const group = new Group()
  world.add(group)

  const alignAmbient = new AmbientLight(0xffffff, 0.55)
  const alignDir = new DirectionalLight(0xffffff, 0.85)
  alignDir.position.set(4, 8, 6)

  const gameLights = createLights()
  const sky = createSky(skyParamsFromTime(0.5))
  gameLights.addTo(scene)
  sky.addTo(scene)

  const torchLight = new PointLight(
    TORCH_LIGHT_BRANCH.color,
    TORCH_LIGHT_BRANCH.intensity,
    TORCH_LIGHT_BRANCH.distance,
    TORCH_LIGHT_DECAY,
  )
  torchLight.castShadow = true
  torchLight.visible = false
  group.add(torchLight)

  group.add(alignAmbient, alignDir)

  const _offset = new Vector3()

  const setVisible = (mode: RenderMode, preset: LightingPreset) => {
    const diagnostic = mode === 'diagnostic'
    alignAmbient.visible = diagnostic && preset === 'alignment'
    alignDir.visible = diagnostic && preset === 'alignment'
    gameLights.ambient.visible = !diagnostic || preset !== 'alignment'
    gameLights.hemi.visible = !diagnostic || preset !== 'alignment'
    gameLights.sun.visible = !diagnostic || preset !== 'alignment'
    sky.mesh.visible = !diagnostic
    torchLight.visible = preset === 'torch'
  }

  return {
    group,
    torchLight,
    apply(opts) {
      setVisible(opts.mode, opts.preset)
      const tod = opts.preset === 'night' ? 0.05 : opts.preset === 'daylight' ? 0.5 : opts.timeOfDay
      const skyParams = skyParamsFromTime(tod)
      gameLights.ambient.intensity = skyParams.ambientIntensity
      gameLights.hemi.intensity = skyParams.hemiIntensity
      gameLights.sun.intensity = skyParams.sunIntensity
      sky.setParams(skyParams, gameLights.sun)
      gameLights.follow(0, 0)

      if (opts.preset === 'torch') {
        torchLight.intensity = TORCH_LIGHT_BRANCH.intensity * opts.torchFuelRatio
        if (opts.torchAnchorWorld) {
          _offset.set(
            TORCH_TIP_OFFSET_BRANCH[0],
            TORCH_TIP_OFFSET_BRANCH[1],
            TORCH_TIP_OFFSET_BRANCH[2],
          )
          _offset.applyMatrix4(opts.torchAnchorWorld)
          torchLight.position.copy(_offset)
        } else {
          torchLight.position.set(0, 1.5, 0)
        }
      }
    },
    dispose() {
      group.removeFromParent()
      sky.dispose()
    },
  }
}

export function applySceneBackground(scene: Scene, preset: BackgroundPreset): void {
  scene.background = new Color(BG_COLORS[preset])
}
