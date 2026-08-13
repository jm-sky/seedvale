/** Resolves on the next animation frame. Unlike an already-resolved
 *  `Promise` (e.g. a GLTF-cache hit resolving through the microtask queue),
 *  this actually hands control back to the browser between chunks of a long
 *  synchronous build — the microtask queue fully drains before the next
 *  paint, so a chain of cache-hit `await`s blocks rendering for the whole
 *  chain (issue 027). */
function yieldToFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** How many props get placed before a yield gate hands a frame back to the
 *  browser — small enough that a single chunk stays well under a frame
 *  budget even for the priciest per-prop cost (GLB clone + material tint),
 *  large enough that a large settlement's build doesn't stretch across an
 *  excessive number of frames (~40-60 props / 4 ≈ 10-15 yields). */
const PROPS_PER_YIELD = 4

/** Creates a per-build counter: call the returned function after each prop
 *  is placed during `buildSettlementProps` (or `plantEntrancePalisade`); it
 *  yields a frame every `PROPS_PER_YIELD` calls. A fresh gate per build call
 *  keeps counts independent across concurrently-streaming settlements. */
export function createPropYieldGate(): () => Promise<void> {
  let count = 0
  return async () => {
    count++
    if (count % PROPS_PER_YIELD === 0) await yieldToFrame()
  }
}
