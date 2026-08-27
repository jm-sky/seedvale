# Plan: UI/UX Interaction and Action System Polish

**Created:** 2026-08-24
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** none
**Domain:** ui-input

## Goal

Ujednolicić interakcje i akcje gracza oraz poprawić czytelność najczęściej używanych ekranów UI. Plan obejmuje istniejącą warstwę Vue/facades i ma rozszerzać obecne mechanizmy zamiast tworzyć równoległy system UI.

## Context

Istniejący audyt UI/UX (Review 007 / plan 105) potwierdził m.in. problemy z Quick Actions, feedbackiem błędów, duplikacją akcji oraz mobilnym layoutem. Obecny `MerchantScreen` jest już ekranem Vue i ma układ stock | player bag z filtrami.

Merchant UX został wydzielony do osobnego planu `ui-input-003-merchant-trade-ui-ux-redesign.md`, który zawiera szczegółowy projekt C1 desktop, M1 mobile landscape oraz A2 selection. Ten plan pozostaje odpowiedzialny za ogólny audyt i integrację UI, ale nie definiuje ponownie szczegółowego Merchant UX.

Current-state entry points: `src/ui/`, `src/ui-vue/`, `src/app/actions/`, `src/app/inventoryWiring.ts` oraz istniejące mechanizmy interaction/construction/merchant.

## Scope

### 1. UI/UX audit

Przejrzeć przed zmianami:

- komponenty Vue i ich facades,
- hooks/store oraz stan UI,
- player actions / Quick Actions,
- interaction actions i komunikaty,
- construction UI,
- inventory/equipment,
- merchant/trader integration,
- toast, modal/overlay i stacking/z-index,
- istniejące duplikacje między HUD, pause i Quick Actions.

Celem audytu jest wskazanie istniejących mechanizmów do reuse oraz usunięcie/ograniczenie równoległych reprezentacji tego samego stanu.

### 2. Interaction panel

Zastąpić proste komunikaty interakcji rozwojowym, małym panelem kontekstowym:

- nazwa/typ obiektu,
- krótki opis,
- lista dostępnych akcji,
- spójny sposób zamknięcia/wyjścia,
- reuse dla różnych typów interakcji.

Nie tworzyć osobnego panelu dla każdego rodzaju obiektu.

### 3. Construction panel

Ujednolicić konstrukcję z interaction panel:

- nazwa i opis,
- wymagane surowce,
- aktualna dostępność surowców,
- akcje budowy/kontynuacji/anulowania zgodnie z istniejącym flow,
- czytelny feedback brakujących zasobów przez istniejący toast/feedback system.

Construction semantics pozostają po stronie istniejących systemów budowy/katalogu; UI nie powinno przejmować logiki symulacji.

### 4. Toast / feedback layer

Zapewnić, że toast jest zawsze wizualnie nad innymi warstwami UI, z jasno określoną relacją do modalów, interaction paneli i HUD.

Przejrzeć istniejące komunikaty inline/status-in-button i tam, gdzie komunikat jest chwilowym feedbackiem, przenieść go do istniejącego toast mechanism zamiast tworzyć lokalny stan komunikatu.

### 5. Quick Actions scalability

Obecny model płaskiej listy akcji nie powinien być dalej rozszerzany bez uporządkowania UX.

Przeanalizować i wdrożyć odpowiedni wzorzec, np.:

- grupy akcji,
- collapsed groups,
- drill-down / action tree,
- priorytetowanie najczęstszych akcji.

Wspólny katalog/źródło akcji powinno nadal definiować availability, label, cost i wykonanie, tak aby Quick Actions i inne wejścia nie duplikowały logiki.

Scroll powinien być wygodny na mobile.

### 6. Equipment shortcuts

Dodać szybki dostęp do:

- `primary weapon`,
- `primary ranged weapon`.

Wykorzystać istniejący `Inventory` / equipment / weapon state. Nie tworzyć osobnego stanu wyposażenia tylko dla UI.

### 7. Merchant integration

Merchant UX jest osobnym zakresem projektowym w `ui-input-003-merchant-trade-ui-ux-redesign.md`.

W ramach tego planu należy jedynie:

- zweryfikować istniejące entry points i facades Merchant UI,
- zapewnić reuse istniejących item/inventory/merchant data sources,
- podłączyć finalny Merchant UX do istniejących mechanizmów trade,
- zachować istniejący model danych i merchant logic,
- usunąć potwierdzone po audycie duplikacje/martwe ścieżki związane z integracją.

Nie wykonywać osobnego redesignu MerchantScreen w tym planie.

## Explicitly out of scope

- szczegółowy redesign MerchantScreen — `ui-input-003`,
- zmiana mechaniki ekonomii,
- nowe typy itemów lub broni,
- nowe systemy interakcji w symulacji,
- przebudowa wszystkich ekranów Vue na nowy framework/design system,
- pełna lokalizacja gry,
- zastępowanie istniejących facades/store nową architekturą bez potrzeby,
- gameplay logic ukryta w komponentach UI.

## Implementation approach

1. Zmapować obecne entry points i zależności UI oraz znaleźć istniejące źródła prawdy dla interakcji, akcji, inventory i merchant.
2. Ustalić wspólny kontrakt/pattern dla małego context/interaction panelu.
3. Naprawić stacking toastów i zunifikować transient feedback.
4. Uporządkować Quick Actions wokół istniejącego katalogu akcji i wybranego wzorca grupowania/drill-down.
5. Podłączyć construction do tego samego wzorca panelu.
6. Dodać weapon shortcuts przez istniejący equipment state.
7. Zintegrować MerchantScreen z rozwiązaniem określonym w `ui-input-003`, bez ponownego projektowania trade UX.
8. Usunąć tylko potwierdzone po audycie duplikacje/martwe ścieżki związane z zakresem planu.

## Verification

### Technical

- `npx tsc --noEmit`
- `pnpm run lint:fix`
- `pnpm run build`
- `pnpm run test`

### Browser / gameplay

Sprawdzić co najmniej:

- toast nad HUD, modalem, interaction/construction panelem i innymi overlayami,
- interakcję z kilkoma różnymi typami obiektów i dostępne akcje,
- construction z pełnymi i brakującymi surowcami,
- Quick Actions na desktopie i małym landscape/mobile viewport,
- brak duplikacji/konfliktów między Quick Actions i Pause → Actions,
- primary melee/ranged weapon shortcuts,
- MerchantScreen korzystający z istniejącego trade modelu i finalnego UX z `ui-input-003`,
- Escape/back/close behaviour i focus/overlay stacking.

## Recent playtest UI/UX findings

Uwagi z aktualnego playtestu wymagające uwzględnienia w ramach tego planu:

### Prepare Terrain controls

- `Przygotuj teren` nie ma na mobile widocznych przycisków `+` / `-` oraz `,` / `.` odpowiadających obecnym akcjom/sterowaniu.
- Dodać jawne przyciski UI również na desktopie, aby podstawowe akcje nie wymagały znajomości skrótów klawiaturowych.
- Przyciski powinny korzystać z istniejącego mechanizmu akcji/sterowania, bez tworzenia równoległej logiki tylko dla UI.

### Quick Actions — mobile scrolling

- Przy większej liczbie Quick Actions poziomy scroll jest niewygodny na telefonie.
- Poprawić obsługę poziomego przewijania gestem oraz czytelność/affordance przewijanej listy.
- Rozwiązanie powinno współgrać z docelowym porządkowaniem Quick Actions opisanym w sekcji `Quick Actions scalability`.

### Quick Actions / Merchant stacking

- Na ekranie Handlu Quick Actions mają obecnie zbyt wysoki `z-index` i mogą przykrywać elementy Merchant UI.
- Uporządkować stacking context tak, aby MerchantScreen i jego aktywne elementy były interaktywne, a Quick Actions nie zasłaniały ich bez uzasadnienia.
- Uwzględnić ten przypadek w ogólnej zasadzie hierarchii overlayów, zamiast dodawać lokalny hack dla MerchantScreen.

**Zrób git commit i push do main, rebase jeżeli trzeba**
