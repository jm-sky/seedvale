# Plan: Bandages and herbal medicine

**Created:** 2026-08-29  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** settlements-npcs-006  
**Domain:** settlements-npcs  
**Tags:** `items-player` `npc`
**Roadmap:** `textiles-and-herbal-medicine`

## Cel

Dodać podstawowy łańcuch medyczny:

~~~~
flax
 ↓
linen material
 ↓
bandage
 +
medicinal herbs
 ↓
dressing
~~~~

oraz drugi produkt zielarski:

~~~~
herbs
 ↓
poisonous herbs
~~~~

## Zakres

Dodać itemy:
- bandage,
- medicinal herbs,
- poisonous herbs,
- dressing.

Dressing jest osobnym produktem, a nie stanem bandage.

## Tekstylia

Plan zależy od settlements-npcs-006, ponieważ bandaż wykorzystuje **linen material**.

Etap rozszerza Textile Worker o:

~~~~
flax → linen material
~~~~

Bez yarn.

## Herbalist

Dodać szeroką profesję **Herbalist**.

Odpowiada za:
- pozyskiwanie/przetwarzanie ziół,
- produkcję medicinal herbs,
- produkcję poisonous herbs,
- przygotowanie dressing.

Nie tworzyć osobnych profesji dla zbierania, suszenia ani przygotowania leków.

## Bandage

Minimalna receptura:

~~~~
linen material
 ↓
bandage
~~~~

Bandaż jest prostym produktem tekstylnym i korzysta z istniejącego production/work pipeline.

## Zioła lecznicze

medicinal herbs są normalnym produktem ekonomicznym.

Powinny być możliwe do:
- pozyskania,
- przechowywania,
- transportu,
- wykorzystania w produkcji dressing.

Nie projektować jeszcze szczegółowej listy gatunków roślin.

## Zioła trujące

poisonous herbs są osobnym produktem.

W tym planie wystarczy:
- pozyskanie przez Herbalist,
- storage,
- transport,
- ekonomiczna dostępność.

**Nie definiować jeszcze konkretnego zastosowania gameplayowego**, jeśli nie jest potrzebne.

## Dressing

Receptura:

~~~~
1+ bandage
   +
1+ medicinal herbs
   ↓
1 dressing
~~~~

Dokładne ilości dopasować do istniejącego modelu recipe quantities i ekonomii.

Dressing jest produktem końcowym etapu.

Docelowo może być używany przez istniejący system leczenia NPC. Nie implementować ponownie całego healing behaviour.

## Produkcja i storage

Wszystkie produkty korzystają z istniejących:
- ItemKind/catalog,
- recipe definitions,
- NPC work,
- carried inventory,
- Household storage,
- settlement economy,
- resource delivery.

Nie tworzyć HerbalismSystem, BandageSystem, DressingSystem ani osobnego magazynu medycznego.

## Testy

- wszystkie cztery produkty istnieją w catalog,
- poprawnie działają w inventory/storage,
- brak linen material blokuje bandage,
- poprawna ilość linen material jest pobierana,
- powstają bandages,
- Herbalist może pozyskać medicinal herbs,
- Herbalist może pozyskać poisonous herbs,
- oba produkty trafiają do storage,
- brak bandage blokuje dressing,
- brak medicinal herbs blokuje dressing,
- poprawne inputy tworzą dressing,
- inputy są pobierane atomowo,
- Textile Worker obsługuje linen material,
- Herbalist wykonuje produkcję,
- produkcja działa off-screen/time-skip.

## Browser verification

Zweryfikować pełny flow:

~~~~
flax
 ↓
linen material
 ↓
bandage
 ↓
+
medicinal herbs
 ↓
dressing
~~~~

oraz:

~~~~
herbs
 ↓
poisonous herbs
~~~~

Sprawdzić Household/storage i dostępność produktów w istniejącej ekonomii.

## Poza zakresem

- glina,
- ceramika,
- cegły,
- przędza,
- szczegółowa produkcja yarn,
- jakość materiału,
- osobne profesje spinner/weaver,
- gatunki ziół,
- konkretne zastosowania poisonous herbs,
- zaawansowana alchemia,
- nowe systemy leczenia NPC.

**Zrób git commit i push do main, rebase jeżeli trzeba**
