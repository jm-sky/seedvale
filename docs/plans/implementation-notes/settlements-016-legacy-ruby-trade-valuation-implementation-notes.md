# Implementation Notes: Legacy ruby trade valuation

**Plan:** `settlements-016-legacy-ruby-trade-valuation.md`  
**Reviewed against:** `main`, 2026-09-15

## Recon conclusion

Bug jest lokalny w `src/items/tradeCatalog.ts`. `tradeValue(kind)` kolejno czyta `MERCHANT_PRICES`, potem `RESOURCE_TRADE_VALUE`, a dopiero potem fallback oparty o `ITEM_DEFS[kind].weight * 4`. `ruby_small/medium/large` mają jawne wartości 30/70/150; legacy `ruby` nie ma wpisu, mimo że nadal jest używany w authored treasure loot.

## Implementation decision

Dodać dokładnie jeden jawny wpis do `RESOURCE_TRADE_VALUE` dla `ruby`. Nie dotykać:

- `MERCHANT_PRICES`,
- `BASE_SELL_FACTOR` / social pricing,
- `sellPrice(...)` rounding,
- treasure reward composition,
- item migration/kind removal.

Domyślna wartość: `70`, czyli parity z `ruby_medium`. Jeżeli przy implementacji istniejący balance test/constant jednoznacznie wskazuje inną zamierzoną wartość authored legacy ruby, użyć tego istniejącego źródła zamiast tworzyć nowe tuning constant.

## Files / symbols

- `src/items/tradeCatalog.ts`
  - `RESOURCE_TRADE_VALUE`
  - `tradeValue(...)`
  - `sellPrice(...)`
  - `NEUTRAL_SELL_PRICE_CONTEXT`
- `src/items/items.ts` — tylko potwierdzenie legacy `ruby` weight/definition.
- `src/world/locations/treasureMapBearCave.ts` / `worldBundle.ts` — tylko potwierdzenie, że authored loot nadal daje `ruby: 1`.

## Tests

Dodać/regresyjnie przypiąć:

- `tradeValue('ruby') === 70` (lub istniejąca jawnie uzasadniona wartość),
- neutralny `sellPrice('ruby')` wynika z normalnego sell factor contract i nie wynosi 1,
- `ruby_small/medium/large` pozostają 30/70/150,
- fallback dla innych nieznanych resource kinds nie zmienia się.

To powinien być mały, bezpośredni patch bez refaktoru pricing API.

Browser verification wykonuje User.
