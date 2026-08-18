import { Group, PerspectiveCamera, PointLight, Scene } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import {
  countVisibleRealPointLights,
  createPointLightBudget,
  POINT_LIGHT_CULL_USERDATA,
  POINT_LIGHT_PAD_NAME,
  POINT_LIGHT_PAD_USERDATA,
  POINT_LIGHT_PROTECT_RADIUS,
  type PointLightBudget,
} from './pointLightBudget'

function realPointLight(intensity = 1): PointLight {
  return new PointLight(0xffaa00, intensity, 8, 2)
}

const budgets: PointLightBudget[] = []

function makeBudget(scene: Scene, budget: number | null): PointLightBudget {
  const pad = createPointLightBudget(scene, budget)
  budgets.push(pad)
  return pad
}

afterEach(() => {
  while (budgets.length > 0) budgets.pop()?.dispose()
})

describe('createPointLightBudget — registry (no scene traversal, no prototype patch)', () => {
  it('does not discover a light added to the scene unless explicitly registered', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 4)
    scene.add(realPointLight())
    // No registerSubtree/register call for this light — the registry must
    // stay unaware of it, unlike the old Object3D.prototype-patch pad.
    expect(budget.sync()).toMatchObject({ realCount: 0, registrySize: 0 })
  })

  it('registerSubtree walks only the given root, not the whole scene', () => {
    const scene = new Scene()
    const decoy = new Group()
    for (let i = 0; i < 20; i++) decoy.add(new Group())
    decoy.add(realPointLight())
    scene.add(decoy)

    const settlementGroup = new Group()
    const houseLamp = realPointLight()
    settlementGroup.add(houseLamp)
    scene.add(settlementGroup)

    const budget = makeBudget(scene, 4)
    budget.registerSubtree(settlementGroup)
    const snap = budget.sync()
    expect(snap.registrySize).toBe(1)
    expect(snap.realCount).toBe(1)
  })

  it('unregisterSubtree removes exactly the lights under that root', () => {
    const scene = new Scene()
    const a = new Group()
    const aLight = realPointLight()
    a.add(aLight)
    const b = new Group()
    const bLight = realPointLight()
    b.add(bLight)
    scene.add(a)
    scene.add(b)

    const budget = makeBudget(scene, null)
    budget.registerSubtree(a)
    budget.registerSubtree(b)
    expect(budget.sync().registrySize).toBe(2)
    budget.unregisterSubtree(a)
    expect(budget.sync()).toMatchObject({ registrySize: 1, realCount: 1 })
  })

  it('register/unregister track a single light (PlayerTorch pattern)', () => {
    const scene = new Scene()
    const light = realPointLight()
    scene.add(light)
    const budget = makeBudget(scene, null)
    budget.register(light)
    expect(budget.sync()).toMatchObject({ registrySize: 1, realCount: 1 })
    budget.unregister(light)
    expect(budget.sync()).toMatchObject({ registrySize: 0, realCount: 0 })
  })

  it('does not count a registered light hidden by an invisible ancestor (matches Three projectObject)', () => {
    const scene = new Scene()
    const hidden = new Group()
    hidden.visible = false
    const light = realPointLight()
    hidden.add(light)
    scene.add(hidden)
    const budget = makeBudget(scene, null)
    budget.registerSubtree(hidden)
    expect(budget.sync()).toMatchObject({ realCount: 0, registrySize: 1 })
    expect(countVisibleRealPointLights(scene)).toBe(0)
  })
})

describe('createPointLightBudget — no-budget mode (diagnostics only)', () => {
  it('reports realCount without padding or culling when budget is null', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, null)
    const group = new Group()
    for (let i = 0; i < 5; i++) group.add(realPointLight())
    scene.add(group)
    budget.registerSubtree(group)
    const snap = budget.sync()
    expect(snap).toMatchObject({ budget: null, realCount: 5, padVisible: 0, totalVisible: 5, overflow: false, culled: 0 })
    expect(scene.getObjectByName(POINT_LIGHT_PAD_NAME)).toBeUndefined()
  })
})

describe('createPointLightBudget — padded mode', () => {
  it('pads an empty registry to the budget with intensity-0 dummy lights', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 4)
    const snap = budget.sync()
    expect(snap).toMatchObject({ budget: 4, realCount: 0, padVisible: 4, totalVisible: 4, overflow: false, culled: 0 })
    const dummies = scene.children[0] as Group
    expect(dummies.name).toBe(POINT_LIGHT_PAD_NAME)
    expect(dummies.children).toHaveLength(4)
    for (const child of dummies.children) {
      const light = child as PointLight
      expect(light.isPointLight).toBe(true)
      expect(light.intensity).toBe(0)
      expect(light.castShadow).toBe(false)
      expect(light.visible).toBe(true)
      expect(light.userData[POINT_LIGHT_PAD_USERDATA]).toBe(true)
    }
  })

  it('hides dummies one-for-one as registered real lights appear, keeping total = budget', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 4)
    const group = new Group()
    const a = realPointLight()
    group.add(a)
    scene.add(group)
    budget.registerSubtree(group)
    expect(budget.sync()).toMatchObject({ realCount: 1, padVisible: 3, totalVisible: 4, overflow: false, culled: 0 })
    const b = realPointLight()
    group.add(b)
    budget.register(b)
    expect(budget.sync()).toMatchObject({ realCount: 2, padVisible: 2, totalVisible: 4, overflow: false, culled: 0 })
  })

  it('reports overflow when real lights exceed the budget and culls extras', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 2)
    const group = new Group()
    for (let i = 0; i < 3; i++) group.add(realPointLight())
    scene.add(group)
    budget.registerSubtree(group)
    const snap = budget.sync()
    expect(snap).toMatchObject({
      realCount: 3,
      padVisible: 0,
      totalVisible: 2,
      overflow: true,
      overflowMax: 3,
      culled: 1,
      protectedFromCull: 0,
      budgetTooLowForScene: false,
    })
    expect(countVisibleRealPointLights(scene)).toBe(2)
  })

  it('culls dimmer lights before brighter ones when overflowing', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 1)
    const group = new Group()
    const dim = realPointLight(0)
    const bright = realPointLight(4)
    group.add(dim, bright)
    scene.add(group)
    budget.registerSubtree(group)
    const snap = budget.sync()
    expect(snap).toMatchObject({ realCount: 2, culled: 1, totalVisible: 1, overflow: true })
    expect(dim.visible).toBe(false)
    expect(dim.userData[POINT_LIGHT_CULL_USERDATA]).toBe(true)
    expect(bright.visible).toBe(true)
  })

  it('culls further lights before nearer ones when intensity is equal (camera supplied)', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 1)
    const group = new Group()
    const far = realPointLight(1)
    far.position.set(0, 0, 1000)
    const near = realPointLight(1)
    near.position.set(0, 0, 900)
    group.add(far, near)
    scene.add(group)
    budget.registerSubtree(group)
    const camera = new PerspectiveCamera()
    camera.position.set(0, 0, 0)
    const snap = budget.sync(camera)
    expect(snap).toMatchObject({ realCount: 2, culled: 1, totalVisible: 1 })
    expect(far.visible).toBe(false)
    expect(near.visible).toBe(true)
  })

  it('protects lights within POINT_LIGHT_PROTECT_RADIUS of the camera from overflow-cull', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 1)
    const group = new Group()
    const nearCamera = realPointLight(0.1) // dim, but right next to the camera
    nearCamera.position.set(0, 0, 1)
    const farFromCamera = realPointLight(4) // bright, but far away
    farFromCamera.position.set(0, 0, 1000)
    group.add(nearCamera, farFromCamera)
    scene.add(group)
    budget.registerSubtree(group)
    const camera = new PerspectiveCamera()
    camera.position.set(0, 0, 0)
    expect(POINT_LIGHT_PROTECT_RADIUS).toBeGreaterThan(1)
    const snap = budget.sync(camera)
    // Without protection, `nearCamera` (dimmer) would be culled first. With
    // protection it must survive even though it's the dimmer light.
    expect(nearCamera.visible).toBe(true)
    expect(farFromCamera.visible).toBe(false)
    expect(snap.protectedFromCull).toBe(1)
    expect(snap.culled).toBe(1)
    expect(snap.budgetTooLowForScene).toBe(false)
  })

  it('does not cull into the protected radius even if that leaves the budget exceeded', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 1)
    const group = new Group()
    const a = realPointLight(1)
    a.position.set(0, 0, 1)
    const b = realPointLight(1)
    b.position.set(0, 0, 2)
    group.add(a, b)
    scene.add(group)
    budget.registerSubtree(group)
    const camera = new PerspectiveCamera()
    camera.position.set(0, 0, 0)
    const snap = budget.sync(camera)
    // Both lights are within the protection radius — nothing eligible to cull.
    expect(a.visible).toBe(true)
    expect(b.visible).toBe(true)
    expect(snap.culled).toBe(0)
    expect(snap.protectedFromCull).toBe(2)
    expect(snap.budgetTooLowForScene).toBe(true)
    expect(snap.totalVisible).toBe(2)
  })

  it('restores a previously-culled light once real count drops back under budget', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 1)
    const group = new Group()
    const a = realPointLight()
    const b = realPointLight()
    group.add(a, b)
    scene.add(group)
    budget.registerSubtree(group)
    budget.sync()
    expect([a.visible, b.visible].filter(Boolean)).toHaveLength(1)
    b.removeFromParent()
    budget.unregister(b)
    const snap = budget.sync()
    expect(a.visible).toBe(true)
    expect(snap).toMatchObject({ realCount: 1, culled: 0 })
  })

  it('does not restore a culled light after lifecycle has turned it off', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 1)
    const group = new Group()
    const a = realPointLight(1)
    const b = realPointLight(1)
    group.add(a, b)
    scene.add(group)
    budget.registerSubtree(group)
    budget.sync()
    const culled = a.visible ? b : a
    const kept = a.visible ? a : b
    expect(culled.visible).toBe(false)
    expect(culled.userData[POINT_LIGHT_CULL_USERDATA]).toBe(true)

    // Mimic setNightIntensity(0) / setLit(false) while the budget still has
    // this light hidden: owner sets intensity 0 and visible false.
    culled.intensity = 0
    culled.visible = false

    const snap = budget.sync()
    expect(culled.visible).toBe(false)
    expect(culled.userData[POINT_LIGHT_CULL_USERDATA]).toBeUndefined()
    expect(kept.visible).toBe(true)
    expect(snap).toMatchObject({ realCount: 1, culled: 0, totalVisible: 1, padVisible: 0 })
    expect(countVisibleRealPointLights(scene)).toBe(1)
  })

  it('still restores a culled dim light that the owner never turned off', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 1)
    const group = new Group()
    const dim = realPointLight(0)
    const bright = realPointLight(4)
    group.add(dim, bright)
    scene.add(group)
    budget.registerSubtree(group)
    budget.sync()
    expect(dim.visible).toBe(false)
    expect(dim.userData[POINT_LIGHT_CULL_USERDATA]).toBe(true)
    bright.removeFromParent()
    budget.unregister(bright)
    const snap = budget.sync()
    expect(dim.visible).toBe(true)
    expect(snap).toMatchObject({ realCount: 1, culled: 0 })
  })

  it('unregisterSubtree drops a culled light from bookkeeping instead of leaking it', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 1)
    const group = new Group()
    const a = realPointLight()
    const b = realPointLight()
    group.add(a, b)
    scene.add(group)
    budget.registerSubtree(group)
    budget.sync()
    group.removeFromParent()
    budget.unregisterSubtree(group)
    const snap = budget.sync()
    expect(snap).toMatchObject({ realCount: 0, registrySize: 0, culled: 0 })
  })

  it('dispose removes the pad group and restores every culled light', () => {
    const scene = new Scene()
    const budget = makeBudget(scene, 1)
    const group = new Group()
    const a = realPointLight()
    const b = realPointLight()
    group.add(a, b)
    scene.add(group)
    budget.registerSubtree(group)
    budget.sync()
    expect(scene.getObjectByName(POINT_LIGHT_PAD_NAME)).toBeTruthy()
    budget.dispose()
    budgets.length = 0
    expect(scene.getObjectByName(POINT_LIGHT_PAD_NAME)).toBeUndefined()
    expect(a.visible).toBe(true)
    expect(b.visible).toBe(true)
  })
})
