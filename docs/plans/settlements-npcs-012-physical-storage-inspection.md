# Plan: Physical Storage Inspection

**Created:** 2026-08-31
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** ~~settlements-npcs-009~~ ~~settlements-npcs-010~~
**Domain:** `settlements-npcs`

## Cel

Umożliwić graczowi zbadanie konkretnego fizycznego miejsca składowania i zobaczenie jego aktualnej zawartości.

Pierwszym przypadkiem jest sterta drewna w osadzie.

Badanie pojedynczej sterty jest osobną interakcją od badania magazynu całej wioski/domu.

## Zakres

### 1. Physical storage inspection

Dodać reprezentację interakcji dla fizycznego storage destination.

Dla sterty drewna:

- `[E] Zbadaj stertę drewna`;
- odczyt aktualnej ilości drewna z authoritative `SettlementEconomy`;
- wynik np. `Sterta drewna — Drewno: 17`.

Nie tworzyć osobnego stanu/inventory dla sterty.

### 2. Rozdzielenie dwóch poziomów informacji

Zachować istniejące:

- `householdStorage` → stan całego magazynu domu;
- `settlementStorage` → stan całego magazynu osady.

Dodać osobno:

- physical storage → konkretny fizyczny obiekt/destination.

Przykład:

    [sterta drewna]
        ↓ E
    „Drewno: 17”

    [magazyn osady]
        ↓ E
    „Jedzenie: 23
     Drewno: 17
     Żelazo: 4
     ...”

### 3. Reuse existing storage ownership

Nie tworzyć nowego `WoodPileInventory`.

Źródłem prawdy pozostaje istniejący:

    SettlementEconomy.query('wood')

Wizualizacja z `storageVisuals.ts` oraz inspection korzystają z tego samego stanu.

### 4. Interaction targeting

Rozszerzyć istniejący mechanizm `buildInteractables()` / `Interactable`.

Sterta powinna być targetowalna jako jeden fizyczny storage destination.

Dodatkowe pile meshes generowane przez `createWoodPileVisual()` nie powinny tworzyć osobnych storage/interactable objects.

Cała wizualna reprezentacja jednej sterty nadal oznacza jedno miejsce składowania.

### 5. Interaction resolution

Rozszerzyć istniejący `resolveInteraction()` albo wydzielić mały, wspólny resolver inspection, jeżeli będzie to naturalne po analizie konkretnego kodu.

Nie tworzyć drugiego systemu dialogów/interakcji.

Inspection powinno korzystać z istniejącego `InteractionOutcome`.

### 6. Prompt

Dodać czytelny prompt dla fizycznego storage, np.:

    [E] Zbadaj stertę drewna

Nie zmieniać semantyki istniejącego:

    [E] Zbadaj magazyn

### 7. Testy

Dodać testy dla czystej logiki, jeśli powstanie nowy resolver/formatter:

- ilość 0;
- mała ilość;
- duża ilość;
- aktualny stan po zmianie `SettlementEconomy`;
- inspection nie zmienia stanu.

Jeżeli istniejący mechanizm interakcji nie ma sensownego test seam, nie dodawać sztucznych testów UI.

### 8. Verification

Automatycznie:

- typecheck;
- testy;
- build.

Manual/browser:

- podejść do sterty;
- zobaczyć prompt;
- zbadać stertę;
- potwierdzić poprawną ilość;
- zmienić ilość drewna przez działającą symulację;
- ponownie zbadać stertę i potwierdzić aktualną wartość;
- zbadać magazyn osady i potwierdzić, że nadal jest to osobna, zagregowana interakcja;
- potwierdzić, że dodatkowe pile meshes nie tworzą dodatkowych interakcji.

## Poza zakresem

- osobne inventory dla sterty;
- możliwość wyjmowania/wkładania drewna;
- rozdzielanie jednej sterty na wiele niezależnych zapasów;
- zmiana `SettlementEconomy`;
- nowy system storage;
- nowy system interakcji;
- osobne interakcje dla overflow piles.

## Zasada architektoniczna

Physical storage inspection jest tylko widokiem authoritative storage state.

    SettlementEconomy
          ↓
       quantity
       ↙      ↘
 visual pile   inspection

Ani wizualizacja, ani inspection nie posiadają własnego stanu.

**Zrób git commit i push do main, rebase jeżeli trzeba**
