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
  - `createRenderStack` - 6964 ms
  - `createWorldBundle` - 6991 ms
  - `buildWorldSystems`
    - `buildChunkManager` - 6991 ms
    - `waitForChunks` - 7588 ms
    - `buildSettlementsManager` - 9402 ms
    - `buildFauna` - 10996 ms
