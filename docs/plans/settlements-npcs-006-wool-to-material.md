# Plan: Wool to material

**Created:** 2026-08-29  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~fauna-004~~  
**Domain:** settlements-npcs  
**Tags:** `items-player` `fauna`
**Roadmap:** `textiles-and-herbal-medicine`

## Cel

Rozszerzyć etap 1 o pierwszy produkt przetwarzający wełnę: **materiał wełniany**.

Celowo pomijamy przędzę.

~~~~
sheep
 ↓
wool
 ↓
Textile Worker
 ↓
wool material
~~~~

## Zakres

- wool z etapu 1 jest wejściem produkcji,
- nowy item materiału wełnianego,
- jedna szeroka profesja **Textile Worker / Tkacz**,
- stanowisko/narzędzie produkcyjne tylko jeśli wymaga tego istniejący production/work system,
- receptura wool → wool material,
- produkcja przez istniejący NPC work/production pipeline,
- output trafia do istniejącego Household/storage/economy flow.

## Jednostki

Nie implementować fizycznego przeliczenia przez przędzę.

Punkt odniesienia pozostaje:

~~~~
1 kg wool
→ ~200 yarn units
→ ~3 m² wool cloth
~~~~

Nie wprowadzać yarn jako itemu.

## Profesja

Dodać szeroką rolę **textile_worker**.

Jedna profesja ma obsługiwać produkcję tekstyliów.

Nie tworzyć osobnych profesji spinner, weaver ani cloth maker.

## Produkcja

Korzystać z istniejącego mechanizmu recept/production jobs.

Nie tworzyć WoolProcessingSystem.

Minimalny flow:

~~~~
Household has wool
 ↓
Textile Worker chooses available production
 ↓
takes required wool
 ↓
performs existing work action
 ↓
creates wool material
 ↓
stores/delivers output
~~~~

Produkcja nie może tworzyć materiału bez pobrania wymaganej ilości wejścia.

## Wymagania techniczne

Przed implementacją zweryfikować aktualny:
- item catalog,
- recipe/production definitions,
- profession dispatch,
- workplace/tool requirements,
- carried inventory,
- Household storage,
- settlement economy.

Rozszerzać istniejące mechanizmy.

## Testy

- wool jest poprawnym inputem,
- brak wool blokuje produkcję,
- poprawna ilość wool jest pobierana,
- produkcja tworzy właściwą ilość wool material,
- output trafia do istniejącego storage flow,
- Textile Worker jest poprawnie wybierany do pracy,
- produkcja działa podczas time skip/off-screen simulation.

## Browser verification

- settlement posiada wool,
- Textile Worker wybiera pracę,
- NPC pobiera wool,
- wykonuje produkcję,
- wool material pojawia się w Household/storage,
- brak surowca zatrzymuje produkcję.

## Poza zakresem

- yarn,
- spinning,
- flax,
- linen material,
- bandage,
- herbs,
- dressing,
- clay,
- cloth quality.

**Zrób git commit i push do main, rebase jeżeli trzeba**
