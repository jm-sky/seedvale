import { BoxGeometry, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { disposeObject3D } from './loadGltf'

describe('disposeObject3D', () => {
  it('disposes geometry/material that are not flagged sharedGpu', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    const mesh = new Mesh(geometry, material)
    const geomSpy = vi.spyOn(geometry, 'dispose')
    const matSpy = vi.spyOn(material, 'dispose')

    disposeObject3D(mesh)

    expect(geomSpy).toHaveBeenCalledOnce()
    expect(matSpy).toHaveBeenCalledOnce()
  })

  it('skips geometry/material flagged sharedGpu (GLTF loader cache)', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    geometry.userData.sharedGpu = true
    const material = new MeshStandardMaterial()
    material.userData.sharedGpu = true
    const mesh = new Mesh(geometry, material)
    const geomSpy = vi.spyOn(geometry, 'dispose')
    const matSpy = vi.spyOn(material, 'dispose')

    disposeObject3D(mesh)

    expect(geomSpy).not.toHaveBeenCalled()
    expect(matSpy).not.toHaveBeenCalled()
  })

  it('frees an InstancedMesh instanceMatrix buffer even though its geometry/material are shared', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    geometry.userData.sharedGpu = true
    const material = new MeshStandardMaterial()
    material.userData.sharedGpu = true
    const instanced = new InstancedMesh(geometry, material, 4)
    const instSpy = vi.spyOn(instanced, 'dispose')

    disposeObject3D(instanced)

    expect(instSpy).toHaveBeenCalledOnce()
  })

  it('does not choke on a plain (non-mesh) Object3D', () => {
    const group = new Object3D()
    expect(() => disposeObject3D(group)).not.toThrow()
  })
})
