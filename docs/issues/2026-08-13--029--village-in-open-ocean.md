# Wioska na otwartym oceanie / zalewanej ławicy

**Status:** `verification needed`
**Created:** 2026-08-13
**Źródło:** zgłoszenie użytkownika — osada na kawałku lądu zalewanym przez morze.

## Przyczyna

Siatka osad (`SETTLEMENT_GRID_STEP` 280) nie pomija komórek na oceanie. `findSettlementSite` szuka tylko w ±24 od środka komórki, a gdy nic nie przejdzie, brał mokry fallback (`nearestSafe` albo środek komórki). Margines suchego terenu (0,8) był niemal równy amplitudzie swellu oceanu + fade brzegu.

## Fix (świadomie wąski)

1. Brak suchego placu → `null` (wioska nie powstaje; drogi nie idą do pustej komórki).
2. Home (0,0) szuka szerzej (±72, ±120), a na końcu i tak zajmuje środek — gracz musi gdzieś spawnować.
3. `SETTLEMENT_WATER_MARGIN` 0,8 → 1,15 (powyżej fal).
4. Clearing nie spłaszcza terenu poniżej tego marginesu.

Wybrzeże / `waterfront` / pomost zostają, gdy jest prawdziwy suchy ląd.

## Weryfikacja w przeglądarce

- Seed z oceanem: płynąc przez morze nie pojawiają się wioski na falach.
- Wioska rybacka przy brzegu nadal może istnieć.
- Nowy świat: spawn home nie stoi w wodzie (albo jest na lądzie w pobliżu, albo — skrajnie — na podniesionym padzie).
