import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { solveAnchorAlignment } from './alignAnchors'

function makeAnchorLocal(x: number, y: number, z: number, yawDeg = 0): Matrix4 {
  const m = new Matrix4()
  const q = new Quaternion().setFromEuler(new Euler(0, yawDeg * Math.PI / 180, 0))
  m.compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1))
  return m
}

describe('solveAnchorAlignment', () => {
  it('frame mode aligns both anchor frames', () => {
    const refWorld = makeAnchorLocal(2, 1, 0, 45)
    const targetLocal = makeAnchorLocal(0.3, 0, 0, 30)
    const targetRoot = {
      position: new Vector3(0, 0, 0),
      quaternion: new Quaternion(),
      scale: new Vector3(1, 1, 1),
    }

    const solved = solveAnchorAlignment({
      referenceAnchorWorld: refWorld,
      targetAnchorLocal: targetLocal,
      targetRoot,
      mode: 'frame',
    })

    const rootM = new Matrix4().compose(
      solved.position,
      solved.quaternion,
      targetRoot.scale,
    )
    const targetWorld = targetLocal.clone().premultiply(rootM)

    const refPos = new Vector3()
    const tgtPos = new Vector3()
    refWorld.decompose(refPos, new Quaternion(), new Vector3())
    targetWorld.decompose(tgtPos, new Quaternion(), new Vector3())
    expect(tgtPos.distanceTo(refPos)).toBeLessThan(0.001)
  })

  it('position mode preserves target rotation', () => {
    const refWorld = makeAnchorLocal(1, 0, 0)
    const targetLocal = makeAnchorLocal(0.2, 0, 0)
    const originalQ = new Quaternion().setFromEuler(new Euler(0, 0.5, 0))
    const targetRoot = {
      position: new Vector3(0, 0, 0),
      quaternion: originalQ.clone(),
      scale: new Vector3(1, 1, 1),
    }

    const solved = solveAnchorAlignment({
      referenceAnchorWorld: refWorld,
      targetAnchorLocal: targetLocal,
      targetRoot,
      mode: 'position',
    })

    expect(solved.quaternion.angleTo(originalQ)).toBeLessThan(1e-6)
  })
})
