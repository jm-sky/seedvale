import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SkinnedMesh,
  type WebGLRenderer,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  buildProgramPrewarmStaging,
  disposeProgramPrewarmStaging,
  prewarmRenderPrograms,
} from './programPrewarm'

describe('buildProgramPrewarmStaging', () => {
  it('keeps one clone per shared material, not one per live mesh', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    const scene = new Scene()
    scene.add(new Mesh(geometry, material))
    scene.add(new Mesh(geometry, material))

    const staging = buildProgramPrewarmStaging(scene)
    expect(staging.rootCount).toBe(1)
    expect(staging.materialCount).toBe(1)
    const clone = staging.group.children[0] as Mesh
    expect(clone.geometry).toBe(geometry)
    expect(clone.material).toBe(material)
  })

  it('treats InstancedMesh and Mesh of the same material as two families', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    const scene = new Scene()
    scene.add(new Mesh(geometry, material))
    scene.add(new InstancedMesh(geometry, material, 4))

    const staging = buildProgramPrewarmStaging(scene)
    expect(staging.rootCount).toBe(2)
    expect(staging.materialCount).toBe(1)
    const kinds = staging.group.children.map((child) => (child as InstancedMesh).isInstancedMesh === true)
    expect(kinds.filter(Boolean)).toHaveLength(1)
    expect(kinds.filter((isInstanced) => !isInstanced)).toHaveLength(1)
  })

  it('treats SkinnedMesh and Mesh of the same material as two families', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    const scene = new Scene()
    scene.add(new Mesh(geometry, material))
    scene.add(new SkinnedMesh(geometry, material))

    const staging = buildProgramPrewarmStaging(scene)
    expect(staging.rootCount).toBe(2)
  })

  it('does not dispose shared geometry or materials when staging is dropped', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    const mesh = new Mesh(geometry, material)
    const staging = buildProgramPrewarmStaging(mesh)
    const geomSpy = vi.spyOn(geometry, 'dispose')
    const matSpy = vi.spyOn(material, 'dispose')

    disposeProgramPrewarmStaging(staging)

    expect(staging.group.children).toHaveLength(0)
    expect(geomSpy).not.toHaveBeenCalled()
    expect(matSpy).not.toHaveBeenCalled()
  })

  it('skips lights and empty groups', () => {
    const scene = new Scene()
    scene.add(new Group())
    const staging = buildProgramPrewarmStaging(scene)
    expect(staging.rootCount).toBe(0)
    expect(staging.materialCount).toBe(0)
  })
})

describe('prewarmRenderPrograms', () => {
  it('binds a dummy render target during compileAsync and restores the previous one', async () => {
    const previous = { id: 'previous' }
    let bound: unknown = previous
    let compileSawTarget: unknown
    const scene = new Scene()
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    scene.add(new Mesh(geometry, material))
    const camera = new PerspectiveCamera()

    const renderer = {
      info: { programs: [{}, {}] },
      getRenderTarget: () => bound,
      setRenderTarget: (target: unknown) => { bound = target },
      compileAsync: vi.fn(async () => {
        compileSawTarget = bound
      }),
      getContext: () => ({ getError: () => 0, NO_ERROR: 0 }),
      extensions: { has: () => true },
    } as unknown as WebGLRenderer

    const result = await prewarmRenderPrograms(renderer, scene, camera)

    expect(result.ok).toBe(true)
    expect(result.stagingRoots).toBe(1)
    expect(result.programCountBefore).toBe(2)
    expect(result.khrParallelShaderCompile).toBe(true)
    expect(result.glError).toBe(0)
    expect(compileSawTarget).not.toBe(previous)
    expect(compileSawTarget).toBeTruthy()
    expect(bound).toBe(previous)
    expect(renderer.compileAsync).toHaveBeenCalledOnce()
  })

  it('restores the render target when compileAsync fails', async () => {
    const previous = { id: 'previous' }
    let bound: unknown = previous
    const scene = new Scene()
    scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()))
    const renderer = {
      info: { programs: [] },
      getRenderTarget: () => bound,
      setRenderTarget: (target: unknown) => { bound = target },
      compileAsync: vi.fn(async () => {
        throw new Error('compile failed')
      }),
      getContext: () => ({ getError: () => 0, NO_ERROR: 0 }),
      extensions: { has: () => false },
    } as unknown as WebGLRenderer

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await prewarmRenderPrograms(renderer, scene, new PerspectiveCamera())
    warn.mockRestore()

    expect(result.ok).toBe(false)
    expect(result.error).toBe('compile failed')
    expect(bound).toBe(previous)
  })
})
