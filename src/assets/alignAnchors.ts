import { Matrix4, Quaternion, Euler as THREE_Euler, Vector3 } from 'three'

export type AnchorAlignMode = 'position' | 'frame'

const _pLocal = new Vector3()
const _qLocal = new Quaternion()
const _sLocal = new Vector3()
const _scaled = new Vector3()
const _rotated = new Vector3()

/**
 * Solve target root transform so reference and target anchor frames align.
 * Scale is never modified.
 */
export function solveAnchorAlignment(input: {
  referenceAnchorWorld: Matrix4
  targetAnchorLocal: Matrix4
  targetRoot: { position: Vector3, quaternion: Quaternion, scale: Vector3 }
  mode: AnchorAlignMode
}): { position: Vector3, quaternion: Quaternion } {
  const { referenceAnchorWorld, targetAnchorLocal, targetRoot, mode } = input

  referenceAnchorWorld.decompose(_pLocal, _qLocal, _sLocal)
  const pRef = _pLocal.clone()
  const qRef = _qLocal.clone()

  targetAnchorLocal.decompose(_pLocal, _qLocal, _sLocal)
  const pAnchorLocal = _pLocal.clone()
  const qAnchorLocal = _qLocal.clone()

  const qRoot = mode === 'frame'
    ? qRef.clone().multiply(qAnchorLocal.clone().invert())
    : targetRoot.quaternion.clone()

  _scaled.set(
    pAnchorLocal.x * targetRoot.scale.x,
    pAnchorLocal.y * targetRoot.scale.y,
    pAnchorLocal.z * targetRoot.scale.z,
  )
  _rotated.copy(_scaled).applyQuaternion(qRoot)
  const pRoot = pRef.clone().sub(_rotated)

  return { position: pRoot, quaternion: qRoot }
}

export function matrixToEulerDeg(matrix: Matrix4): [number, number, number] {
  const pos = new Vector3()
  const quat = new Quaternion()
  const scale = new Vector3()
  matrix.decompose(pos, quat, scale)
  const euler = new THREE_Euler().setFromQuaternion(quat, 'XYZ')
  return [
    radToDeg(euler.x),
    radToDeg(euler.y),
    radToDeg(euler.z),
  ]
}

export function matrixToPosition(matrix: Matrix4): [number, number, number] {
  const pos = new Vector3()
  matrix.decompose(pos, new Quaternion(), new Vector3())
  return [pos.x, pos.y, pos.z]
}

function radToDeg(r: number): number {
  return r * (180 / Math.PI)
}

export function rotationDeltaDeg(a: Matrix4, b: Matrix4): number | null {
  const qa = new Quaternion()
  const qb = new Quaternion()
  a.decompose(new Vector3(), qa, new Vector3())
  b.decompose(new Vector3(), qb, new Vector3())
  const dot = Math.abs(qa.dot(qb))
  const angle = 2 * Math.acos(Math.min(1, dot))
  return radToDeg(angle)
}

export function positionDelta(a: Matrix4, b: Matrix4): [number, number, number] {
  const pa = new Vector3()
  const pb = new Vector3()
  a.decompose(pa, new Quaternion(), new Vector3())
  b.decompose(pb, new Quaternion(), new Vector3())
  return [pb.x - pa.x, pb.y - pa.y, pb.z - pa.z]
}

export function positionDistance(a: Matrix4, b: Matrix4): number {
  const [dx, dy, dz] = positionDelta(a, b)
  return Math.hypot(dx, dy, dz)
}
