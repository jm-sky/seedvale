# Plan: Legacy ruby trade valuation

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** bug
**Priority:** medium · **Effort:** XS
**Depends on:** ~~settlements-006~~
**Domain:** `settlements`
**Subdomains:** `economy`
**Tags:** `trade` `ruby` `pricing`
**Roadmap:** -
**Model:** `Sonnet`, `Composer`

## Cel

Naprawić błędną wycenę legacy itemu `ruby`, który obecnie może zostać sprzedany praktycznie za wartość fallbackową mimo że jest authored treasure reward.

## Recon

- `src/items/tradeCatalog.ts` jest aktualnym źródłem wartości handlowych.
- `tradeValue(kind)` sprawdza `MERCHANT_PRICES`, potem `RESOURCE_TRADE_VALUE`, a następnie fallback `ITEM_DEFS[kind].weight * 4` z minimum 1.
- `ruby_small`, `ruby_medium`, `ruby_large` mają jawne wartości odpowiednio 30/70/150.
- Legacy `ruby` nadal istnieje i jest używany m.in. przez authored treasure/bear-cave loot, ale nie ma jawnego wpisu w `RESOURCE_TRADE_VALUE`, więc wpada w fallback.

## Zakres

1. Dodać jawny nominal trade value dla `ruby` w istniejącym `RESOURCE_TRADE_VALUE`.
2. Ustalić wartość względem istniejących tierów; domyślnie traktować legacy authored `ruby` jako odpowiednik `ruby_medium`, chyba że istniejący treasure balance w kodzie wskazuje inny zamiar.
3. Nie zmieniać merchant sell factorów, social pricing ani condition pricing.
4. Nie usuwać/migrować legacy `ruby` kind w ramach tego bugfixu.
5. Dodać test dla `tradeValue('ruby')` i wynikowego `sellPrice('ruby', neutralContext)`.

## Relevant files

- `src/items/tradeCatalog.ts`
- `src/items/items.ts`
- `src/world/locations/treasureMapBearCave.ts`
- related trade catalog tests

## Verification

- `ruby` ma jawny nominal większy od fallback 1,
- merchant buyback wynika z normalnego `sellPrice` contract,
- wartości `ruby_small/medium/large` pozostają bez zmian.

Manual browser verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
