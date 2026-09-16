/** Empty-state copy for the ordinary-NPC BUY column.
 *  Real empty stock (`npcStock.length === 0`) is not the same as a filter
 *  that happens to hide every remaining row.
 *
 * @domain settlements-npcs
 */
export function npcGoodsBuyEmptyCopy(npcStockLength: number, filteredRowCount: number): string | null {
  if (npcStockLength === 0) return 'Nie mam teraz nic na sprzedaż.'
  if (filteredRowCount === 0) return 'Brak towarów w tej kategorii.'
  return null
}
