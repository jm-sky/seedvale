# Plan: Environmental Placement Consequences

**Created:** 2026-09-03
**Status:** `planned` 📋
**Type:** fix
**Priority:** medium · **Effort:** M
**Depends on:** ~~008~~
**Domain:** `world`
**Subdomains:** `simulation` `weather`
**Tags:** `placement` `environment` `wetness`

## Cel

Zmienić runtime placement obiektów tak, aby niekorzystne warunki środowiskowe, w szczególności mokry teren, nie blokowały bez potrzeby poprawnej akcji gracza.

## Zakres

- znaleźć istniejący environmental/terrain validation używany podczas stawiania obiektów,
- usunąć twardą odmowę placementu wyłącznie z powodu mokrego terenu, jeżeli obiekt jest fizycznie możliwy do ustawienia,
- zachować informacje o warunkach środowiskowych jako dane wejściowe do działania obiektu,
- tam, gdzie istnieje odpowiedni mechanizm, przekazać warunek jako modifier/consequence zamiast reject,
- komunikat UI powinien informować o potencjalnej konsekwencji, a nie o niemożności wykonania akcji.

Przykłady konsekwencji pozostają zależne od istniejących systemów: ogień może być mniej trwały, a obiekt obozowy może mieć gorsze warunki działania.

## Ograniczenia

- Nie usuwać rzeczywistych ograniczeń geometrycznych/kolizyjnych.
- Nie tworzyć osobnego systemu weather effects dla każdego typu obiektu.
- Nie wprowadzać od razu rozbudowanej symulacji stabilności lub wilgotności.
- Preferować istniejące environmental state/modifier mechanisms.

## Poza zakresem

- poprawki proceduralnego placementu świata,
- klasyfikacja źródeł wody,
- firewood/bonfire,
- nowe mechaniki pogody.

## Verification

- można postawić obiekt na mokrym terenie,
- odrzucone pozostają tylko rzeczywiście niedozwolone placementy,
- brak błędnego zużycia materiałów przy odrzuceniu,
- istniejące preview i final placement pozostają zgodne,
- warunek mokrego terenu nie powoduje regresji zwykłego placementu,
- jeżeli istnieje już odpowiedni modifier, jego konsekwencja jest obserwowalna.

Przy implementacji dodać JSDoc do ważnych publicznych funkcji/klas architektonicznych, gdy pomaga to w preflight discovery; dla nowych mechanizmów preferować `@domain`.

**Zrób git commit i push do main, rebase jeżeli trzeba**
