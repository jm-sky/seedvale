# Etykiety drobnych przedmiotów widoczne za daleko i w ciemności

**Status:** `verification needed` — zaimplementowane 2026-08-10: etykiety zbieralnych przedmiotów (`createItemSpawners.ts`) mają teraz własne, ciaśniejsze progi zanikania (8/14 zamiast 20/32 dla NPC) i dodatkowo mnożone są przez `dayFactor`, więc gasną w ciemności niezależnie od dystansu. Wymaga weryfikacji w przeglądarce (podejdź do kamienia/muszli/gałęzi w dzień z daleka i sprawdź, że etykieta pojawia się dopiero z bliska; sprawdź to samo w nocy).
**Created:** 2026-08-10
**Źródło:** zgłoszenie użytkownika

## Objaw / prośba

Etykiety drobnych zbieralnych przedmiotów (muszla/kamień/gałąź/grzyb/kwiat/szyszka — odnawialna pula w `src/items/createItemSpawners.ts`) powinny być widoczne tylko z bliska, a z daleka lub w ciemności — praktycznie niewidoczne.

## Diagnoza

`createItemSpawners.ts`'s `update()` (linia ok. 149-161) używa tej samej funkcji i tych samych progów co etykiety NPC:

```ts
el.style.opacity = p.collected
  ? '0'
  : String(labelOpacityForDistance(object.position.distanceTo(observerPos)))
```

`src/ui/labelDistance.ts`'s `labelOpacityForDistance()` miał zaszyte na sztywno `LABEL_FADE_NEAR = 20`/`LABEL_FADE_FAR = 32` — sensowne dla czytania imienia NPC z dystansu, zdecydowanie za daleko dla malutkiego kamyka/gałęzi na ziemi. Brak też jakiejkolwiek zależności od pory dnia — etykieta świeci równie mocno w środku nocy.

## Naprawa

1. `labelOpacityForDistance()` przyjmuje teraz opcjonalne `near`/`far` (domyślnie te same wartości co wcześniej — zero wpływu na etykiety NPC/drogowskazy, które wciąż wywołują ją bez argumentów).
2. `createItemSpawners.ts` dostaje własne, ciaśniejsze stałe (`ITEM_LABEL_FADE_NEAR = 8`, `ITEM_LABEL_FADE_FAR = 14`) i przekazuje je jawnie.
3. `update()` dostaje nowy parametr `dayFactor: number` (ta sama wartość co już liczona w `app/createApp.ts` dla `settlementsManager`/`fauna`), mnożony przez wynik `labelOpacityForDistance()` — pełna ciemność (`dayFactor === 0`) daje opacity 0 niezależnie od dystansu. Sam pickup (prompt „[E] Podnieś: X”, oparty o `pickInGaze`/zasięg interakcji) nie zależy od etykiety, więc ukrycie tekstu w ciemności nie utrudnia faktycznego zbierania — tylko czytelność nazwy z daleka.

## Poza zakresem teraz

Przedmioty world-gen (`terrain/chunkItems.ts`) i upuszczone przez gracza (`items/createDroppedItems.ts`) nie mają w ogóle etykiet tekstowych (`CSS2DObject`) — tylko odnawialna pula (`createItemSpawners.ts`) je ma, więc to jedyne miejsce do naprawy.
