# Plan: Lodging Navigation Recovery and Cancellation

**Created:** 2026-08-31  
**Status:** `verification needed` 🔍  
**Priority:** 🔴 high · **Effort:** S  
**Depends on:** `none`  
**Domain:** `ui-input`  
**Tags:** `lodging` `navigation` `cancel` `collision`

## Cel

Usunąć możliwość zablokowania gracza podczas automatycznego dojścia do miejsca noclegu w mieście.

Obecnie `restActions.ts` steruje automatycznym ruchem przez istniejący `KeyState`/`LookState`, ale dojście do `LodgingOption.approachPoint` zakłada możliwość przejścia po prostej. Collidery budynku mogą zatrzymać gracza przed ścianą, podczas gdy akcja nadal wymusza ruch i kierunek.

Plan ma zapewnić:

- natychmiastowe anulowanie przez `Esc`,
- widoczny przycisk **„Anuluj”** podczas automatycznego dojścia,
- automatyczne wykrywanie utknięcia,
- bezpieczny recovery z pominięciem problemu colliderów,
- brak globalnego wyłączania collision systemu,
- pełny powrót do normalnego sterowania po anulowaniu/recovery.

## Zakres

### 1. Anulowanie automatycznego dojścia

Rozszerzyć istniejący mechanizm `RestActions.abortRest()` tak, aby aktywne `lodgingWalkTarget` było normalnie anulowalne.

Anulowanie musi:

- wyczyścić `lodgingWalkTarget`,
- wyłączyć wymuszony `forward`,
- przywrócić normalne sterowanie i obrót,
- nie rozpoczynać snu,
- nie modyfikować potrzeb ani czasu,
- nie pozostawiać żadnego aktywnego lodging state.

Nie tworzyć drugiego mechanizmu anulowania tylko dla lodging.

### 2. Keyboard `Esc`

Dodać obsługę klawisza `Escape` w istniejącym keyboard/input flow.

Podczas aktywnego dojścia do noclegu:

```text
Escape
  ↓
abortRest()
  ↓
lodging walk stopped
  ↓
normal player control
```

Jeżeli istniejący `Esc` flow obsługuje już pause/menu, lodging cancellation musi zostać sprawdzone **przed otwarciem pause menu**.

Po anulowaniu `Esc` nie może jednocześnie otworzyć menu pauzy.

Wykorzystać istniejący input state/event mechanism zamiast dodawać globalny listener wyłącznie dla lodging, jeżeli obecna architektura na to pozwala.

### 3. Przycisk „Anuluj”

Podczas automatycznego dojścia do noclegu HUD powinien pokazywać:

**Anuluj [Esc]**

Kliknięcie ma wywoływać dokładnie ten sam `abortRest()` co keyboard.

Nie tworzyć osobnego UI state dla cancellation.

Button powinien znikać natychmiast po:

- anulowaniu,
- dotarciu do celu,
- recovery,
- utracie ważności miejsca,
- innych zakończeniach lodging walk.

### 4. Detection of stuck movement

`tickLodging()` powinien monitorować **postęp względem aktualnego celu**, zamiast używać prostego timeoutu od momentu rozpoczęcia ruchu.

Przechowywać minimalny runtime state, np.:

```text
lastDistance
lastProgressAt
```

Postęp następuje, gdy odległość do `approachPoint` zmniejszy się o sensowny epsilon.

Timer braku postępu jest resetowany po wykryciu postępu.

Timeout powinien być wystarczająco długi dla normalnego ruchu — orientacyjnie **10–15 sekund bez istotnego postępu**, a nie 3 sekundy.

Dokładną wartość dobrać po sprawdzeniu aktualnej prędkości gracza i cadence `tickLodging()`.

Timeout ma wykrywać:

```text
normal movement → progress → continue

collision / impossible route
→ no meaningful progress
→ recovery
```

Nie przerywać automatycznie normalnie wolnego dojścia tylko dlatego, że trwa długo.

### 5. Lodging collision recovery

Nie próbować w tym planie naprawiać źródłowej geometrii colliderów domów.

Nie wyłączać globalnie collision dla gracza.

Nie dodawać ogólnego `noclip` ani specjalnego trybu collision używanego przez cały gameplay.

Po wykryciu rzeczywistego utknięcia użyć **lodging-only recovery**.

Preferowany mechanizm:

```text
lodging walk
    ↓
no progress for timeout
    ↓
controlled recovery to LodgingOption.approachPoint
    ↓
continue normal lodging completion
```

Jeżeli aktualne `PlayerController.setPosition()` może bezpiecznie wykonać takie kontrolowane przesunięcie, wykorzystać istniejący mechanizm zamiast ingerować w collider system.

Recovery powinno być ograniczone do autorytatywnego punktu interakcji wybranego przez `LodgingOption`; nie teleportować gracza do arbitralnych pozycji ani do środka modelu domu.

Jeżeli recon implementacji wykaże, że `approachPoint` może znajdować się w kolizji lub `setPosition()` ma dodatkowe ograniczenia, agent powinien wybrać najmniejszy istniejący mechanizm pozwalający przeprowadzić gracza przez konkretną blokadę lodging — bez globalnego bypassu collision.

### 6. Completion po recovery

Recovery nie jest anulowaniem.

Po poprawnym umieszczeniu gracza przy `approachPoint` powinien zostać wykonany istniejący flow:

```text
revalidate lodging availability
→ set facing
→ resolve lodging quality
→ lieDown()
→ start 8h sleep
```

Nie tworzyć drugiego sposobu rozpoczynania snu.

Jeżeli miejsce przestało być dostępne podczas walk/recovery, użyć istniejącego komunikatu i zakończyć akcję bez snu.

### 7. State cleanup

Sprawdzić wszystkie zakończenia lodging walk:

- normal arrival,
- manual cancellation,
- `Esc`,
- timeout/recovery,
- unavailable target,
- damage interruption,
- rozpoczęcie innej blokującej akcji.

Żadne z nich nie może pozostawić:

- `lodgingWalkTarget`,
- wymuszonego `keyboard.state.forward`,
- wymuszonego yaw,
- nieaktualnego cancellation UI,
- pending lodging quality dla niezrealizowanego snu.

## Relevant systems

Podczas implementacji zweryfikować aktualny kod przede wszystkim w:

- `src/app/actions/restActions.ts`
  - `createRestActions()`
  - `tickLodging()`
  - `abortRest()`
  - `cancelLodgingWalk()`
  - `isLodgingActive()`
  - `canCancelRest()`
- `src/app/gameLoop.ts`
  - wywołanie `tickLodging()`
  - istniejący HUD rest/time-skip cancellation
  - kolejność obsługi `Esc` i pause
- istniejący keyboard/input state
- `PlayerController` / `setPosition()` / movement update
- istniejący collision implementation
- istniejący Vue HUD/action UI
- `src/settlement/lodging.ts`
  - `LodgingOption`
  - `approachPoint`
- `src/settlement/lodgingResolver.ts`
  - sposób wyznaczania `approachPoint`

Plan 168 i 169 są kontekstem istniejącego lodging/house implementation. Nie należy ich implementować ponownie ani tworzyć alternatywnego systemu nawigacji.

## Non-goals

- naprawa źródłowej geometrii colliderów wszystkich domów,
- generalny pathfinding,
- globalny noclip,
- globalne wyłączanie collision,
- nowy movement/navigation system,
- automatyczne przechodzenie przez drzwi jako osobny system,
- zmiana `LodgingOption` tylko po to, aby obejść ten bug,
- refaktoryzacja `PlayerController`,
- zmiana działania normalnego ruchu gracza.

## Acceptance criteria

- [x] Podczas dojścia do noclegu widoczny jest przycisk **„Anuluj [Esc]”**.
- [x] `Esc` anuluje lodging walk bez otwierania pause menu.
- [x] Kliknięcie przycisku i `Esc` korzystają z tego samego `abortRest()`.
- [x] Po anulowaniu gracz natychmiast odzyskuje normalny movement i look control.
- [x] `forward` nie pozostaje wymuszony po żadnym zakończeniu lodging walk.
- [x] Utknięcie przy ścianie jest wykrywane przez brak postępu, a nie przez krótki fixed timeout.
- [x] Timeout braku postępu wynosi około 10–15 s i jest resetowany przez rzeczywisty progress.
- [x] Utknięty gracz może kontynuować lodging dzięki kontrolowanemu recovery.
- [x] Recovery nie wyłącza globalnie colliderów i nie wprowadza globalnego noclip.
- [x] Po recovery normalny lodging flow kończy się snem.
- [x] Niedostępne miejsce po recovery nie rozpoczyna snu.
- [x] Istniejące camp/tent/wait cancellation zachowują dotychczasowe zachowanie.
- [x] Nie powstaje drugi system ruchu ani drugi system cancellation.
- [x] Dodano/zmieniono focused tests dla state cleanup i stuck detection tam, gdzie obecna architektura testów na to pozwala.
- [x] `tsc`, testy i build przechodzą.
- [ ] Browser verification obejmuje: normalny lodging, `Esc`, button cancellation, utknięcie na colliderze domu, recovery i zapis gry po zakończeniu/anulowaniu.

## Implementation instruction

Przy implementacji dodać JSDoc dla nowych lub istotnie zmienionych publicznych/architektonicznych funkcji i klas, jeśli są potrzebne do discovery przez preflight. Warto użyć `@domain ui-input`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
