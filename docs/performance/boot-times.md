# Boot times

**Date:** 2026-08-26 21:51  
**Url:** `http://localhost:5577/?bootMark=1`  

> Used performance utility from `src/shared/bootMark.ts`    
> eg. in `src/app/createApp.ts`
>
> ```typescript
> bootMark('createRenderStack')
> const { ... } = createRenderStack(container, config)
> bootMarkEnd('createRenderStack')
> ```

- `createApp`
  - `createRenderStack` - 19 ms
  - `createWorldBundle` - 6474 ms
  - `rebuildWorld -> buildWorldSystems`
    - `buildChunkManager` - 131 ms
    - `waitForChunks` - 1725 ms
    - `buildSettlementsManager` - 1510 ms
    - `buildFauna` - 1026 ms
