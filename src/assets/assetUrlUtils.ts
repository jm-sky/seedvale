/**
 * Standalone URL helpers with no imports of their own. Kept separate from
 * `assetIndex.ts` (which pulls in the full asset dependency graph, including
 * `houseBuilder`/`props`/NPC/animal modules) so `houseDefinitionExampleConfig.ts`
 * can use `parkedIdFromUrl` without creating a module import cycle back to
 * itself (`assetIndex` → `NpcAgent` → `props` → `houseBuilder` →
 * `houseDefinitionExampleConfig`), which previously caused a
 * "Cannot access 'HOUSE_MODULE_M' before initialization" TDZ crash.
 */
export function parkedIdFromUrl(url: string): string {
  const path = url.replace(/^\/models\//, '').replace(/\.glb$/i, '')
  return `parked:${path}`
}
