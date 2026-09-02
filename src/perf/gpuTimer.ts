import type { WebGLRenderer } from 'three'

/** Dev/benchmark-only WebGL2 GPU timestamp-query instrumentation, added for
 *  the isolation probes' CPU/GPU render-cost separation. Uses only the
 *  public `EXT_disjoint_timer_query_webgl2` extension via
 *  `renderer.getContext()` — no Three.js internals/node_modules patching,
 *  same rule as `programCensus.ts`. A no-op (`available: false`) wherever
 *  the extension isn't exposed (older GPU/driver, some sandboxed/virtualized
 *  contexts, a WebGL1 fallback) — callers must show that as an explicit
 *  limitation, never estimate/fake a number in its place. */
export type GpuTimer = {
  readonly available: boolean
  /** Opens a `TIME_ELAPSED_EXT` query spanning until the matching
   *  `endFrame()`. At most one query open at a time (WebGL2 disallows
   *  nesting the same query target) — call once per frame, around the exact
   *  span you want GPU-side elapsed time for. */
  beginFrame: () => void
  endFrame: () => void
  /** Drains any completed queries into the sample buffer. Cheap
   *  (`getQueryParameter` on whatever is pending) — call once per frame
   *  regardless of whether a sampling window is currently open, so results
   *  from earlier frames aren't left stuck in the pending queue. */
  poll: () => void
  /** Clears collected samples (does not touch in-flight queries) — call
   *  before a new probe's sampling window starts. */
  reset: () => void
  samples: () => readonly number[]
  dispose: () => void
}

/** Caps in-flight (begun, not yet read back) queries. GPU timer results are
 *  asynchronous by design (that's the whole point — avoid stalling the
 *  pipeline waiting on them), so a few frames' worth of pending queries is
 *  normal; this is only a backstop against unbounded growth if readback
 *  stalls for some reason. Hitting it just skips starting a new query that
 *  frame — never an invented sample. */
const MAX_PENDING = 8

const NOOP_TIMER: GpuTimer = {
  available: false,
  beginFrame: () => {},
  endFrame: () => {},
  poll: () => {},
  reset: () => {},
  samples: () => [],
  dispose: () => {},
}

type DisjointTimerExt = { TIME_ELAPSED_EXT: number, GPU_DISJOINT_EXT: number }

export function createGpuTimer(renderer: WebGLRenderer, enabled: boolean): GpuTimer {
  if (!enabled) return NOOP_TIMER

  const gl = renderer.getContext() as WebGL2RenderingContext
  // `WebGLRenderer.getContext()` is typed as `WebGLRenderingContext |
  // WebGL2RenderingContext` (Seedvale always requests WebGL2 per G1 in
  // GRAPHICS.md, but this stays a runtime check rather than an assumption).
  if (typeof gl.createQuery !== 'function' || typeof gl.getExtension !== 'function') return NOOP_TIMER
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as DisjointTimerExt | null
  if (!ext) return NOOP_TIMER
  // Extracted so nested closures below don't need TS to re-narrow `ext` past
  // the null check (it won't, for hoisted function declarations).
  const TIME_ELAPSED_EXT = ext.TIME_ELAPSED_EXT
  const GPU_DISJOINT_EXT = ext.GPU_DISJOINT_EXT

  let pending: WebGLQuery[] = []
  let samples: number[] = []
  let open: WebGLQuery | null = null

  function drain(): void {
    // A disjoint event (GPU reset/throttle/driver hiccup) invalidates every
    // result since the last check — discard the whole pending batch rather
    // than report numbers that may not correspond to what was measured.
    if (gl.getParameter(GPU_DISJOINT_EXT)) {
      for (const q of pending) gl.deleteQuery(q)
      pending = []
      return
    }
    while (pending.length > 0) {
      const q = pending[0]!
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number
      samples.push(ns / 1e6)
      gl.deleteQuery(q)
      pending.shift()
    }
  }

  return {
    available: true,
    beginFrame() {
      if (open) return // defensive: one begin/end pair per frame, should not double-open
      if (pending.length >= MAX_PENDING) return // pipeline backed up — skip rather than grow unbounded
      const q = gl.createQuery()
      if (!q) return
      gl.beginQuery(TIME_ELAPSED_EXT, q)
      open = q
    },
    endFrame() {
      if (!open) return
      gl.endQuery(TIME_ELAPSED_EXT)
      pending.push(open)
      open = null
    },
    poll() {
      drain()
    },
    reset() {
      samples = []
    },
    samples: () => samples,
    dispose() {
      if (open) {
        gl.endQuery(TIME_ELAPSED_EXT)
        gl.deleteQuery(open)
        open = null
      }
      for (const q of pending) gl.deleteQuery(q)
      pending = []
      samples = []
    },
  }
}

let active: GpuTimer = NOOP_TIMER

export function setActiveGpuTimer(timer: GpuTimer | null): void {
  active = timer ?? NOOP_TIMER
}

export function getGpuTimer(): GpuTimer {
  return active
}
