# Plan: Water Types and Drinking

**Created:** 2026-09-03
**Status:** `planned` 📋
**Type:** fix
**Priority:** medium · **Effort:** S
**Depends on:** ~~122~~
**Domain:** `world`
**Subdomains:** `resources` `simulation`
**Tags:** `water` `drinking` `river` `ocean`

## Cel

Dopasować możliwość picia i konsekwencje picia do rodzaju źródła wody.

## Zakres

- górskie strumienie traktować jako czyste, zdatne do picia źródło wody,
- nie pokazywać dla czystego strumienia ostrzeżenia o możliwej chorobie,
- wodę morską oznaczyć jako słoną/niezdatną do picia i nie pozwalać na jej normalne spożycie,
- wykorzystać istniejące rozróżnienie źródeł/dystrybucji wody zamiast tworzyć player-only water system,
- zachować istniejące zachowanie picia z innych źródeł, o ile ich klasyfikacja nie wymaga korekty.

## Ograniczenia

- Nie zmieniać proceduralnej ciągłości rzek; należy do world-terrain-006.
- Nie tworzyć pełnego systemu jakości wody, chorób ani oczyszczania.
- Nie zakładać, że każda woda słodka jest automatycznie bezpieczna, jeśli istnieją już inne jawnie zdefiniowane źródła o innym statusie.

## Poza zakresem

- studnie,
- dystrybucja wody,
- survival disease system,
- nowe źródła wody.

## Verification

- picie z górskiego strumienia nie ostrzega o chorobie,
- picie ze strumienia poprawnie zaspokaja pragnienie,
- wody morskiej nie można normalnie wypić,
- istniejące źródła wody zachowują dotychczasowe poprawne zachowanie,
- brak regresji interakcji fishing/water.

Przy implementacji dodać JSDoc do ważnych publicznych funkcji/klas architektonicznych, gdy pomaga to w preflight discovery; dla nowych mechanizmów preferować `@domain`.

**Zrób git commit i push do main, rebase jeżeli trzeba**
