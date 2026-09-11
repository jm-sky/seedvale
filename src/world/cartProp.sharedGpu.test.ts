/** Procedural cart template must survive presentation dispose via sharedGpu. */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { disposeObject3D, markSharedGpu } from '../assets/loadGltf'

describe('cart procedural template sharedGpu', () => {
  it('disposeObject3D on a clone does not dispose markSharedGpu geometry/material', () => {
    const template = new THREE.Group()
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial()
    template.add(new THREE.Mesh(geometry, material))
    markSharedGpu(template)

    const instance = template.clone(true)
    disposeObject3D(instance)

    expect(geometry.userData.sharedGpu).toBe(true)
    expect(material.userData.sharedGpu).toBe(true)
    expect(geometry.attributes.position).toBeDefined()
  })
})
