/**
 * Sequences async `HouseAssembly` loads so an older `setHouse()` request can
 * never attach after a newer one — `next()` mints a token per selection,
 * `resolve()` disposes whatever `load()` produced if a newer token has since
 * been minted (plan tools-003 §4). Split out of `houseBrowserScene.ts` so it
 * stays unit-testable without a WebGL context.
 */
export function createHouseLoadGuard() {
  let generation = 0
  return {
    next(): number {
      return ++generation
    },
    async resolve<T extends { dispose: () => void }>(
      token: number,
      load: () => Promise<T>,
    ): Promise<T | null> {
      const result = await load()
      if (token !== generation) {
        result.dispose()
        return null
      }
      return result
    },
  }
}
