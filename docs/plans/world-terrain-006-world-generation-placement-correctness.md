# Plan: World Generation & Placement Correctness

**Created:** 2026-09-03
**Status:** `planned` 📋
**Type:** fix
**Priority:** medium · **Effort:** M
**Depends on:** ~~191~~
**Domain:** `world-terrain`
**Subdomains:** `terrain` `vegetation` `roads` `landmarks`
**Tags:** `water` `placement` `mountains`

## Cel

Usunąć widoczne błędy proceduralnego generowania i placementu świata, w których obiekty nie respektują podstawowych ograniczeń terenu, wody i istniejącej infrastruktury.

## Zakres

### Hydrologia i teren
- zapewnić, że rzeka nie kończy się przypadkowo na suchym terenie; jej endpoint musi prowadzić do poprawnego odbiornika zgodnego z istniejącym modelem hydrologii,
- zachować ciągłość rzek w miejscach generowania i streamingu,
- nie dopuszczać do placementu zwykłej trawy ani drzew na powierzchni/korycie rzeki.

### Placement obiektów
- kamienne kręgi i inne terrain-bound props nie mogą pozostawać zawieszone nad terenem,
- placement powinien poprawnie obsługiwać strome zbocza i różnice wysokości,
- cmentarze nie mogą nachodzić na drogi; uwzględnić bezpieczny margines,
- groby na cmentarzu powinny mieć większe i naturalniej zróżnicowane odstępy.

### Góry
- zwiększyć sensowną wizualną ciągłość roślinności na większych wysokościach,
- wykorzystać istniejący system vegetation/biome/environment constraints zamiast osobnego systemu górskiej flory,
- nie przywracać zwykłej nizinnej trawy tam, gdzie obecny model wysokości/biomu ją wyklucza.

## Ograniczenia

- Reuse istniejących terrain, water, road, landmark i vegetation queries.
- Nie tworzyć równoległego systemu kolizji tylko dla proceduralnego placementu.
- Nie przebudowywać hydrologii bardziej niż jest to potrzebne do poprawnych endpointów.
- Zachować deterministyczność generowania.

## Poza zakresem

- system picia wody,
- runtime player placement,
- fire/wood,
- cloud rendering,
- nowe duże biome'y lub kompletna przebudowa generatora świata.

## Verification

- rzeki nie kończą się na suchym polu,
- flora nie pojawia się w rzekach,
- kamienne kręgi i inne wskazane props poprawnie przylegają do terenu,
- cmentarz pozostaje poza drogą z widocznym marginesem,
- groby nie są nienaturalnie stłoczone,
- góry mają sensowną ciągłość roślinności,
- istniejące generowanie i streaming chunków nie mają regresji.

Przy implementacji dodać JSDoc do ważnych publicznych funkcji/klas architektonicznych, gdy pomaga to w preflight discovery; dla nowych mechanizmów preferować `@domain`.

**Zrób git commit i push do main, rebase jeżeli trzeba**
