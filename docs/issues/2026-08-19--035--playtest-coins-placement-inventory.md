# 035 — Playtest: monety, miecz, droga, pułapka w ekwipunku

**Status:** `done` — zaimplementowane 2026-08-19; playtest OK.
**Created:** 2026-08-19
**Źródło:** playtest planu [129](../plans/2026-08-16--129--coins-and-land-sales.md) i powiązany UX (strażnik, namiot/pułapka)

## Objaw / prośba

Cztery luki z jednej sesji:

1. Działka na sprzedaż jest, ale w świecie nie widać pieniędzy. Kupiec płaci muszlami. `coin` miał `spawn: 'none'`; z questów zostaje 10+15 monet (plan 160 zabrał coin-rewardy z wilka/jamy), a działki kosztują 500–3200.
2. Dialog strażnika: „Poproś o miecz” zostaje po darze.
3. Nie da się rozstawić namiotu ani pułapki na drodze.
4. Rozkładanie pułapki jest tylko w Quick Actions, nie w ekwipunku.

## Naprawa

- Kupiec buy/sell w `coin` (`buyWithCoins` / `sellForCoins`). Muszle zostają barterem (`canSell('shell')` i `canSell('coin')` dalej `false`).
- Rzadki pickup `coin` w `terrain/chunkItems.ts` — trzecia pula, id `cx:cz:c${i}`, `KEEP_CHANCE` 0.06. Bez village-renewable spawnera.
- `canAskSword` w dialogu NPC z `!worldFlags.guardSwordGifted`. Ukrywać tylko po darze strażnika.
- `evaluateGroundPlacement` bez `onRoad`. Woda / stok / obiekt / zajęte bez zmian. Jaskinie nadal nie na drodze.
- Przycisk **Zastaw** w ekwipunku (lista + szczegóły) → close → `placeTrapAtAim`. Quick Actions zostaje.

Poza zakresem: namiot z ekwipunku, skarbiec monet, zmiana cen działek, village-renewable `coin`.

## Weryfikacja

Techniczna: `tsc` / `lint:fix` / `test` / `build` — zielona 2026-08-19 (1142 testy).
Ręczna: playtest 2026-08-19 — Kupiec w monetach, spawn, dar miecza, droga, Zastaw z ekwipunku.
