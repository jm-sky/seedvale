# Ekran Mieszkańcy: paginacja / infinite / virtual scroll

**Status:** `todo`
**Created:** 2026-08-08
**Źródło:** propozycja użytkownika, przy okazji porządków w mobilnym UI po naprawie [issue 004](./2026-08-08--004--mobile-modals-untappable-pointer-events.md)

## Kontekst

`src/ui/createVillagersScreen.ts` renderuje **całą** listę NPC naraz (`render()` buduje jeden `<div>` per villager, wszystkie w `.seedvale-villagers__list`, scrollowane wewnątrz `.seedvale-villagers__panel`). Przy małej liczbie mieszkańców (dziś: pojedyncza osada, kilku NPC) nieodczuwalne — ale [multi-settlements](../plans/2026-08-07--025--multi-settlements.md) już generuje wiele wiosek, więc lista może realnie urosnąć do dziesiątek wpisów, każdy z HP barem + tagami cech.

## Propozycja (nierozstrzygnięta, do wyboru przy implementacji)

- Prosta paginacja (N na stronę + prev/next) — najmniej kodu, spójne z resztą UI (przyciski jak filtry w quest logu)
- Infinite scroll (dociąganie kolejnych N przy zbliżeniu do dołu listy)
- Virtual scroll (renderuj tylko widoczne wiersze) — najbardziej wydajne, ale najwięcej kodu na coś, co dziś jest prostym `innerHTML`-owym rendererem

## Poza zakresem teraz

Nie blokuje niczego — lista jest dziś mała. Warto zrobić, zanim liczba mieszkańców realnie urośnie (kolejne osady + NPC per osada).
