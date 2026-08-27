# World-003 — GLTF Loading Contention Discovery

**Date:** 2026-08-27  
**Related plan:** `docs/plans/world-003-faster-application-startup.md`  
**Related:** `docs/plans/implementation-notes/world-003-faster-application-startup-implementation-notes.md`

## Discovery

The large background initialization cost initially appeared to be caused by fauna creation and home settlement initialization.

Additional instrumentation narrowed the cost to:

```text
createFauna
└── loadFaunaTemplates
    └── loadGltfAsset
        └── loadCached
            └── GLTFLoader.loadAsync()
```

The important finding is that the cost does **not** appear to be caused by the specific bear model.

## Evidence: first bear model

```text
[BootMark][loadFaunaTemplates] loadGltfAsset:/models/fauna/bear.glb: 24436 ms
```

Further instrumentation showed:

```text
[BootMark][loadFaunaTemplates] loadGltfAsset:/models/fauna/bear.glb: ~24.4 s
```

The file itself is small:

```text
bear.glb: 704 KB
```

`gltf-transform inspect` reported:

```text
generator: obj2gltf
extensionsUsed: none

vertices: 1,334
indices: u16
mesh size: 46.68 KB

texture:
  2048 × 2048
  PNG
  671.79 KB

animations: none
```

There is nothing in the asset size or geometry that obviously explains a ~24–31 second load.

## Evidence: second bear model

A completely different bear model was substituted:

```text
/models/fauna/bear-2.glb
```

The result was:

```text
[BootMark][loadFaunaTemplates] loadGltfAsset:/models/fauna/bear-2.glb: 25772 ms
[BootMark][loadFaunaTemplates] prepareProp:/models/fauna/bear-2.glb: 0 ms
```

Therefore:

> Replacing the bear model does not remove the ~25 second delay.

This strongly reduces the likelihood that the original `bear.glb` itself is corrupt or unusually expensive.

## `loadGltfAsset()` analysis

The function itself performs almost no work:

```ts
export async function loadGltfAsset(url: string): Promise<GltfAsset> {
  const asset = await loadCached(url)
  return {
    root: asset.root,
    animations: asset.animations,
    clone: () => cloneSkinned(asset.root) as Group,
  }
}
```

The actual asynchronous operation is inside:

```ts
pending = loader.loadAsync(url).then((gltf) => {
  ...
})
```

The loader is configured as:

```ts
const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
```

The bear asset does not use Meshopt, so Meshopt decoding is not currently considered the primary explanation for the bear delay.

## Network observation

Browser DevTools showed that the GLB itself transfers quickly.

After another asset such as:

```text
wood_pile.glb
```

many:

```text
blob:http://localhost:5577/...
```

resources appear.

Individual blob operations are fast, but there are long pauses between them.

This suggests that the ~25 second measurement is not simply HTTP transfer time.

The delay is occurring during the browser-side GLTF loading / decoding / asset processing pipeline, or because that pipeline is competing with other work on the main thread.

## Concurrent initialization

At the same time, `loadFaunaTemplates()` loads all fauna concurrently:

```ts
Promise.all(
  Object.entries(FAUNA_URLS).map(...)
)
```

The world startup also starts other asset-heavy background work concurrently:

```text
fauna
preloadHeldToolModels
preloadItemGlbModels
homeReady
```

The measurements show that these operations frequently finish at approximately the same time:

```text
buildFauna                    ~25.9 s
preloadHeldToolModels        ~26.1 s
preloadItemGlbModels         ~26.1 s
fauna+preloads               ~26.1 s
```

This is suspicious because the operations are independent at the application level but ultimately rely on browser/main-thread asset processing.

## Settlement measurements

The settlement markers also showed apparently large times:

```text
buildSettlementProps: 28776 ms
buildSettlementProps: 29222 ms
buildSettlementProps: 29620 ms
```

while the complete home initialization was only:

```text
background:homeReady: 2723 ms
```

This demonstrates that individual elapsed-time markers can overlap when multiple asynchronous tasks are running concurrently.

Therefore the large `buildSettlementProps` measurements should **not** be interpreted as 29 seconds of exclusive settlement CPU time.

The same principle applies to the fauna measurements.

## Current hypothesis

The current leading hypothesis is:

> Multiple GLTF/asset loading operations are competing for browser/main-thread resources, causing long elapsed times for individual `loadAsync()` promises even though the assets themselves are small and transfer quickly.

The exact source of the contention is not yet proven.

Possible mechanisms include:

- image decoding,
- GLTF parsing,
- browser Blob/Image processing,
- GPU texture preparation,
- synchronous work performed by Three.js loaders,
- multiple simultaneous asset loads,
- main-thread contention with settlement/world initialization.

These are hypotheses, not confirmed causes.

## Important conclusion

The investigation has ruled out:

- large `bear.glb` file size,
- excessive bear geometry,
- `prepareProp()`,
- the original bear model being uniquely responsible.

The remaining ~25 second delay is associated with:

```text
GLTFLoader.loadAsync()
```

under the current highly concurrent startup workload.

## Next diagnostic experiment

The next test is an A/B comparison.

### A — current implementation

Fauna remains loaded concurrently:

```text
Promise.all(...)
```

Measure:

```text
loadFaunaTemplates
individual animal loads
background preload operations
homeReady
```

### B — sequential fauna loading

Temporarily load fauna one animal at a time:

```text
bear
→ deer
→ wolf
→ ...
```

No loader, cache, asset or world-system changes should be made for this experiment.

The purpose is to determine whether reducing GLTF concurrency changes the observed timings.

### Interpretation

If sequential loading significantly reduces individual `loadGltfAsset()` times or allows other background tasks to complete much earlier, this will provide strong evidence for **asset-loading contention**.

If the timings remain approximately the same, investigation should move deeper into the `GLTFLoader` / browser decoding path.

## Status

**Diagnosis:** narrowed to GLTF asset loading / runtime contention.

**Confirmed:** the bear model itself is not the primary explanation.

**Not yet confirmed:** the exact operation responsible for the ~25 second delay.

**Next step:** controlled parallel-vs-sequential GLTF loading experiment.

No optimization should be committed until this experiment identifies the actual bottleneck.
