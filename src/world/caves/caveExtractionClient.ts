/** Plan world-terrain-008 B4.2 — cave presentation extraction client.
 *  Max one extraction in flight, nearest-first queue, duplicate coalescing,
 *  stale/deactivated/disposed results discarded. Does not own scene objects.
 *
 * @domain world-terrain
 */

import type {
  CaveExtractionRequest,
  CaveExtractionResult,
  CaveWorkerRequest,
  CaveWorkerResponse,
} from './caveExtractionProtocol'

export type CaveExtractionJobRunner = {
  run: (request: CaveExtractionRequest) => Promise<CaveExtractionResult>
  dispose: () => void
}

export type CaveExtractionClient = {
  request: (request: CaveExtractionRequest) => void
  reprioritise: (caveId: string, distance: number) => void
  cancel: (caveId: string) => void
  dispose: () => void
  readonly queuedCount: number
  readonly inFlightCount: number
}

function jobKey(caveId: string, requestId: number): string {
  return `${caveId}:${requestId}`
}

/**
 * Production runner: one dedicated worker, not the terrain pool. The client
 * already serialises to max-one in flight, so the runner holds a single
 * pending promise.
 *
 * @domain world-terrain
 */
export function createCaveExtractionWorkerRunner(): CaveExtractionJobRunner {
  const worker = new Worker(new URL('./caveExtraction.worker.ts', import.meta.url), {
    type: 'module',
  })
  let pending: {
    resolve: (result: CaveExtractionResult) => void
    reject: (err: Error) => void
  } | null = null

  worker.onmessage = (event: MessageEvent<CaveWorkerResponse>) => {
    const msg = event.data
    const waiter = pending
    pending = null
    if (!waiter) return
    if (msg.ok) {
      waiter.resolve({
        caveId: msg.caveId,
        requestId: msg.requestId,
        positions: msg.positions,
        indices: msg.indices,
        metrics: msg.metrics,
      })
      return
    }
    waiter.reject(new Error(msg.error || 'cave extraction worker error'))
  }
  worker.onerror = (event) => {
    const waiter = pending
    pending = null
    waiter?.reject(new Error(event.message || 'cave extraction worker error'))
  }

  return {
    run(request) {
      return new Promise<CaveExtractionResult>((resolve, reject) => {
        pending = { resolve, reject }
        const message: CaveWorkerRequest = {
          id: request.requestId,
          caveId: request.caveId,
          requestId: request.requestId,
          topology: request.topology,
          params: request.params,
          detailEnabled: request.detailEnabled,
          meshBounds: request.meshBounds,
        }
        worker.postMessage(message)
      })
    },
    dispose() {
      worker.terminate()
      const waiter = pending
      pending = null
      waiter?.reject(new Error('cave extraction disposed'))
    },
  }
}

export function createCaveExtractionClient(options: {
  runner: CaveExtractionJobRunner
  onStarted?: (caveId: string, requestId: number) => void
  onComplete: (result: CaveExtractionResult) => void
  onError?: (caveId: string, requestId: number, error: Error) => void
}): CaveExtractionClient {
  const queue: CaveExtractionRequest[] = []
  const discarded = new Set<string>()
  let inFlight: CaveExtractionRequest | null = null
  let disposed = false

  function queueIndex(caveId: string): number {
    return queue.findIndex((job) => job.caveId === caveId)
  }

  function pump(): void {
    if (disposed || inFlight || queue.length === 0) return
    queue.sort((a, b) => a.distance - b.distance)
    const next = queue.shift()!
    inFlight = next
    options.onStarted?.(next.caveId, next.requestId)
    options.runner.run(next).then(
      (result) => {
        const stale = discarded.has(jobKey(result.caveId, result.requestId))
        if (inFlight && inFlight.caveId === result.caveId && inFlight.requestId === result.requestId) {
          inFlight = null
        }
        discarded.delete(jobKey(result.caveId, result.requestId))
        if (!disposed && !stale) options.onComplete(result)
        pump()
      },
      (err: unknown) => {
        const request = inFlight
        inFlight = null
        const error = err instanceof Error ? err : new Error(String(err))
        if (request && !disposed && !discarded.has(jobKey(request.caveId, request.requestId))) {
          options.onError?.(request.caveId, request.requestId, error)
        }
        if (request) discarded.delete(jobKey(request.caveId, request.requestId))
        pump()
      },
    )
  }

  return {
    request(request) {
      if (disposed) return
      if (inFlight && inFlight.caveId === request.caveId && inFlight.requestId === request.requestId) return
      const existing = queueIndex(request.caveId)
      if (existing !== -1) {
        const current = queue[existing]!
        if (current.requestId === request.requestId) {
          current.distance = request.distance
          current.topology = request.topology
          current.params = request.params
          current.detailEnabled = request.detailEnabled
          current.meshBounds = request.meshBounds
          return
        }
        queue.splice(existing, 1)
      }
      queue.push(request)
      pump()
    },
    reprioritise(caveId, distance) {
      const existing = queueIndex(caveId)
      if (existing === -1) return
      queue[existing]!.distance = distance
    },
    cancel(caveId) {
      const existing = queueIndex(caveId)
      if (existing !== -1) queue.splice(existing, 1)
      if (inFlight && inFlight.caveId === caveId) {
        discarded.add(jobKey(inFlight.caveId, inFlight.requestId))
      }
    },
    dispose() {
      disposed = true
      queue.length = 0
      if (inFlight) discarded.add(jobKey(inFlight.caveId, inFlight.requestId))
      inFlight = null
      options.runner.dispose()
    },
    get queuedCount() {
      return queue.length
    },
    get inFlightCount() {
      return inFlight ? 1 : 0
    },
  }
}
