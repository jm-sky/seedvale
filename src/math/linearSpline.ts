export type LerpFn<T> = (t: number, a: T, b: T) => T

/** Piecewise linear interpolation of control points (t ascending). */
export class LinearSpline<T> {
  private readonly points: Array<[number, T]> = []
  private readonly lerp: LerpFn<T>

  constructor(lerp: LerpFn<T>) {
    this.lerp = lerp
  }

  addPoint(t: number, value: T): void {
    this.points.push([t, value])
  }

  get(t: number): T {
    const pts = this.points
    if (pts.length === 0) {
      throw new Error('LinearSpline has no points')
    }
    if (pts.length === 1) {
      return pts[0]![1]
    }

    let p1 = 0
    for (let i = 0; i < pts.length; i++) {
      if (pts[i]![0] >= t) break
      p1 = i
    }
    const p2 = Math.min(pts.length - 1, p1 + 1)
    if (p1 === p2) return pts[p1]![1]

    const t0 = pts[p1]![0]
    const t1 = pts[p2]![0]
    const u = (t - t0) / (t1 - t0)
    return this.lerp(u, pts[p1]![1], pts[p2]![1])
  }
}
