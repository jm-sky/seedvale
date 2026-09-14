import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { createThicket } from './decorProps'

function stubTree(): Group {
  const group = new Group()
  group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()))
  return group
}

describe('createThicket', () => {
  it('places four cloned templates when GLB templates are provided', () => {
    const templates = [stubTree(), stubTree(), stubTree(), stubTree()]
    expect(createThicket(1, 0.4, templates).children).toHaveLength(4)
  })

  it('falls back to four procedural trees without templates', () => {
    expect(createThicket(1, 0.2).children).toHaveLength(4)
    expect(createThicket(1, 0.2, []).children).toHaveLength(4)
  })
})
