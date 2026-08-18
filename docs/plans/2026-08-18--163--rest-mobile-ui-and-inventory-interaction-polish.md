---
domain: ui-input
tags: [items-player]
---

# Plan: Rest, Mobile UI and Inventory Interaction Polish

**Created:** 2026-08-18
**Status:** `planned` 📋
**Priority:** 🟡 medium · **Effort:** S
**Depends on:** none

## Cel

Poprawić cztery istniejące mechanizmy interakcji:

1. odpoczynek w mieście / obozowanie,
2. Merchant Screen na mobile,
3. wybór kolejnego targetu na mobile,
4. kategorie przedmiotów w Inventory.

Zmiany powinny rozszerzać istniejące mechanizmy zamiast tworzyć równoległe systemy.

## 1. Odpoczynek — Rest / Camping

- Przeanalizować istniejący flow odpoczynku i obsługę `Escape`.
- Przy postępie odpoczynku **>85%** wyświetlać w UI przycisk `Esc`.
- Przycisk ma działać jako jawny odpowiednik klawisza `Escape`.
- Przycisk powinien być dostępny **niezależnie od platformy**, również na desktopie.
- Przed osiągnięciem progu 85% ręczne przerwanie pozostaje niedostępne.
- Przy osiągnięciu około **100%** odpoczynek kończy się automatycznie i następuje wybudzenie.
- Nie duplikować logiki zakończenia odpoczynku — UI i fizyczny `Escape` powinny wywoływać ten sam mechanizm.

## 2. Merchant Screen — mobile

- Sprawdzić aktualny layout i breakpointy Merchant Screen.
- Poprawić responsywność tak, aby lista przedmiotów była widoczna na telefonie.
- Zapewnić możliwość wybrania przedmiotu i wykonania zakupu.
- Zachować istniejący flow handlu na desktopie.
- Nie tworzyć osobnej implementacji merchant UI dla mobile, jeśli można poprawić istniejący layout.

## 3. Target cycling — mobile

- Dodać ekranowy przycisk odpowiadający akcji `Tab`.
- Przycisk powinien być dostępny na mobile podczas sytuacji, w których `Tab` służy do cycle target.
- Zachować istniejącą obsługę klawisza `Tab` na desktopie.
- Obie ścieżki powinny korzystać z tego samego mechanizmu cyklicznego wyboru: NPC, animal, object.
- Nie implementować osobnego systemu targetowania dla mobile.

## 4. Inventory — kategorie itemów

- Dodać kategorię **Broń / Weapon**.
- Nie traktować `Tools` jako kategorii obejmującej broń.
- Zmienić model kategorii itemu, jeżeli obecnie zakłada pojedynczą kategorię.
- Item powinien móc należeć do **wielu kategorii**.
- Przykład: siekiera → `Tool` + `Weapon`; typowe narzędzie → `Tool`; miecz → `Weapon`.
- Filtry Inventory powinny sprawdzać przynależność itemu do kategorii, a nie pojedynczą wartość enum.
- Zachować istniejące kategorie i ich działanie.

## Zakres

**W zakresie:** istniejący Rest/Camping flow, Merchant Screen, target cycling oraz Inventory filtering/model kategorii.

**Poza zakresem:** przebudowa systemu inventory lub handlu, nowy system targetowania, nowe mechaniki odpoczynku oraz dodawanie nowych typów broni poza koniecznymi przykładami/testami.

## Weryfikacja

- Rest: próg >85%, ekranowy `Esc`, fizyczny `Escape`, automatyczne zakończenie przy ~100%.
- Merchant: widoczność przedmiotów i możliwość zakupu na mobile.
- Target: ekranowy przycisk cycle na mobile oraz `Tab` na desktopie.
- Inventory: filtr `Weapon`, item z wieloma kategoriami (`axe = Tool + Weapon`) oraz istniejące filtry.
- Uruchomić istniejące testy/build i wykonać odpowiednią weryfikację browserową dla zmian UI.

> Zrób git commit i push do main, rebase jeżeli trzeba
