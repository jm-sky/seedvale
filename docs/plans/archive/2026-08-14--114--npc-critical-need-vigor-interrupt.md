# Plan 114: NPC — krytyczna potrzeba / kolaps wigoru przerywa akcję w locie

**Status:** `done` ✅
**Created:** 2026-08-14
**Priority:** 🟡 medium
**Effort:** `S`
**Depends on:** ~~060~~ (`effectiveScheduleFor`, `choose()` arbitration, schedule-driven akcje)

## Kontekst / luka

Plan 060 (`docs/plans/archive/2026-08-11--060--npc-schedule-actions-and-trait-overlays.md`) zdomknął `eat`/`home`/`wake`/`work`/`sleep` jako realne intencje FSM i dodał deterministyczne nakładki traits na harmonogram. Świadomie odłożył jedną rzecz — cytując plan wprost:

> Nie dodawaj przerywania trwającej akcji przez zwykłą zmianę godziny. Przerwania dla krytycznych potrzeb są osobnym przyszłym projektem.

`docs/STATE.md` (przed tym planem) i `docs/state/settlements.md` wciąż opisywały to jako otwartą, celową lukę.

Zadanie tej sesji sprawdzało, czy istniejący system needs/FSM/schedule/vigor/traits realizuje już taki przepływ:

```
NPC ma zaplanowaną pracę → robi się bardzo spragniony → potrzeba wody
ma wyższy priorytet → NPC przerywa pracę → idzie po wodę → wraca do
normalnego funkcjonowania
```

Bezpośrednie sprawdzenie kodu potwierdziło, że **nie** — i dlaczego: `pickNeed()` oraz sprawdzenie kolapsu wigoru (`shouldCollapseSleep`) są liczone wyłącznie wewnątrz gałęzi `case 'choose':` przełącznika FSM w `NpcAgent.update()` (`src/ai/NpcAgent.ts`, ok. linii 894-916). Gdy `phase` staje się `goTo` lub `execute` (czyli `pendingAction` jest w locie), nic nie sprawdza ponownie needs/wigoru aż akcja zakończy się naturalnie, zawiedzie, albo watchdog utknięcia ją porzuci. NPC idący do pracy (lub już pracujący) doprowadzi całą akcję pracy do końca, nawet jeśli pragnienie w międzyczasie przejdzie z „lekko spragniony" na „krytycznie spragniony".

To największa, najbardziej konkretna luka między obecną implementacją a oczekiwanym zachowaniem. Wpływ vigor/stamina na wykonywanie pracy oraz efekty traits na istniejące decyzje są już zaimplementowane adekwatnie (patrz „Sprawdzone, bez luki" niżej) — ten plan celowo obejmuje tylko lukę przerywania, zgodnie z instrukcją zadania, by wybrać mały, spójny zakres zamiast szerokiego przepisania.

**Dlaczego w tym kształcie:** repo ma już dokładnie jeden precedens anulowania akcji w locie — `abandonStuckAction()` watchdoga utknięcia ruchu (`NpcAgent.ts:1754-1784`). Ten plan reużywa tę samą sekwencję czyszczenia dla innego wyzwalacza (pilność, nie utknięcie) zamiast wymyślać drugi mechanizm przerywania, i reużywa istniejącego modelu priorytetów `pickNeed` (woda > drewno > jedzenie, `PickNeedOptions`) zamiast budować drugi system priorytetów.

## Sprawdzone, bez luki (nietknięte w tym planie)

- **Vigor/stamina → wykonywanie pracy**: już podłączone. Ciężka praca (`isHeavyWorkKind`) drenuje `VigorState` przez `applyWorkVigor` co klatkę podczas `execute`; wyczerpanie staminy (`isExhausted`) wymusza fazę `exhausted` **co klatkę niezależnie od aktualnej fazy** i wznawia tę samą akcję po odzyskaniu progu (`STAMINA_EXHAUSTED_RESUME_RATIO = 0.35`). Kolaps wigoru (`isCollapsed`, ≤5) już wygrywa z needs i harmonogramem wewnątrz `choose()` (sprawdzany jako pierwszy). Bez zmian — nowy check w tym planie reużywa `shouldCollapseSleep` bez modyfikacji.
- **Traits → istniejące decyzje**: `fast_worker` (mnożnik szybkości wykonania + wydłużenie bloku pracy w harmonogramie), `night_owl` (jednolite przesunięcie harmonogramu +2h + złagodzenie progu spowolnienia przy niskim HP), `sociable` (zwiększony promień/czas reakcji na gracza) — wszystkie zaimplementowane i rozłączne, zgodnie z planem 060. Nakładka `sociable` na poziomie harmonogramu (home→social) jest udokumentowanym, celowym no-opem (`hasSocialPlace: false` na sztywno, brak producenta social place) — poza zakresem budowa social landmarku teraz.
- **Łańcuch schedule → needs → FSM → action**: nienaruszony i poprawnie uporządkowany (`choose` → `pickNeed` → harmonogram → generyczne `goTo`/`execute`). Jedyne brakujące ogniwo to brak ponownego wejścia w ten łańcuch, gdy akcja jest już w locie — dokładnie to dodaje ten plan.

## Projekt

### 1. `src/ai/Needs.ts` — opcja `critical` na istniejącym `pickNeed`, nie równoległa funkcja

Dodano trzy nowe stałe progowe (wyraźnie surowsze niż istniejące — „naprawdę pilne", nie „warte zrobienia teraz"):

```ts
const CRITICAL_WATER_THRESHOLD = 0.75
const CRITICAL_WOOD_THRESHOLD = 0.85
const CRITICAL_FOOD_THRESHOLD = 0.7
```

Rozszerzono `PickNeedOptions` o `critical?: boolean`. Gdy `true`, każdy próg przełącza się na swoją stałą `CRITICAL_*`; `woodShortage`/`foodShortage` są ignorowane w tym trybie (pilność zostaje stałą, przewidywalną granicą, niezależną od stanu ekonomii osady); `skipWood` nadal honorowany (kupiec nigdy nie zostaje przerwany przez drewno).

Dlaczego rozszerzenie, nie duplikacja: `PickNeedOptions` już koduje „surowsze/luźniejsze progi przez flagę" (`woodShortage`/`foodShortage` robią to samo w drugą stronę). Osobna funkcja musiałaby duplikować kolejność water→wood→food i okablowanie `skipWood`/`pickActionKind`.

### 2. `src/ai/NpcAgent.ts` — throttled check przerywania + reużyte czyszczenie

- Nowa stała `CRITICAL_INTERRUPT_CHECK_INTERVAL_SEC = 1` — throttle w tym samym rzędzie wielkości co `STUCK_CHECK_INTERVAL_SEC` watchdoga.
- Nowe pole `private criticalInterruptCooldown = 0`.
- Nowe wywołanie w `update()`, zaraz po istniejącym tickowaniu watchdoga (kolejność ważna: jeśli watchdog porzuci akcję w tej samej klatce, `phase` jest już `'choose'` zanim ten check się wykona, więc oba mechanizmy nigdy nie odpalają się w tej samej klatce naraz):

```ts
if ((this.phase === 'goTo' || this.phase === 'execute') && this.pendingAction) {
  this.tickCriticalInterrupt(dt)
}
```

- Dwie nowe metody prywatne: `tickCriticalInterrupt(dt)` — najpierw kolaps wigoru (przerywa niezależnie od `activeNeed`, tak jak w `choose()`), potem — tylko gdy `activeNeed === 'idle'` (akcja jest harmonogramowa, nie need-driven, unikamy przerzucania między dwiema potrzebami) — `pickNeed(this.needs, { ...this.needPickOptions(), critical: true })`; i `interruptCurrentAction()` — ten sam ciąg czyszczenia co `abandonStuckAction()` (`failActionLifecycle`, `leaveActiveQueue()`, `pendingAction = null`, `pathWaypoints = []`, `pathIndex = 0`, `wait = 0`, `repathActive = false`, `phase = 'choose'`), bez bookkeepingu specyficznego dla utknięcia (abandoned-destination retry-avoidance, eskalacja teleportu), który tu nie ma zastosowania.

Nie ustawia `activeNeed` bezpośrednio — `choose()` pozostaje jedynym miejscem decydującym „co teraz", zgodnie z architekturą planu 020/060.

**Dlaczego nie ma thrashingu/pętli:** próg krytyczny jest zawsze surowszy niż normalny, więc następny `choose()` (ta sama klatka — `phase` jest `'choose'` zanim `switch` się wykona) wywoła `pickNeed()` ze zwykłymi opcjami i dostanie tę samą potrzebę, kierując do `beginNeed()`. Po zaspokojeniu, `activeNeed` naturalnie wraca do `'idle'` na kolejnym `choose()` i harmonogram wznawia się sam — bez jawnego stanu „wznów przerwaną pracę".

### 3. Testy — `src/ai/Needs.test.ts`

Nowy blok `describe('pickNeed critical mode', ...)`: różnica progów normalny-vs-critical na tym samym wejściu, każda potrzeba odpala się po przekroczeniu swojego progu krytycznego, zachowana kolejność water>wood>food przy remisie wyniku, `skipWood` nadal honorowany, `woodShortage`/`foodShortage` ignorowane w trybie critical.

Zachowanie na poziomie `NpcAgent` (call site throttle, same metody `tickCriticalInterrupt`/`interruptCurrentAction`) nie ma automatycznego testu — w repo nie istnieje `NpcAgent.test.ts` i nie jest teraz budowany (wymagałby mockowania `HeightSampler`/`ColliderSource`/`SettlementLandmarks` itd.). To ten sam wzorzec co `npcMovementWatchdog.ts`: czysta logika decyzyjna jest testowana jednostkowo, jej konsument w `NpcAgent` — nie.

### 4. Dokumentacja

- `docs/STATE.md` — zaktualizowany opis luki NPC daily routine.
- `docs/state/settlements.md` — nowy wiersz standing decision S9 + rozszerzony punkt „Harmonogram".
- `docs/plans/README.md` — nowy wiersz w sekcji Planned.

## Ryzyka / mitigacje

- **Thrashing między potrzebami** — zmitygowane przez `activeNeed === 'idle'` (nie przerywamy już trwającej akcji need-driven) i niezmiennik critical⇒normal.
- **Przerywanie NPC w kolejce (np. przy studni)** — reużyte `leaveActiveQueue()`, tak jak w porzuceniu przez watchdog.
- **Koszt klatki** — throttled (~1 s), brak scoringu needs co klatkę.
- **Regresja watchdoga/snu/pracy/dialogu** — brak zmian w `getCurrentActivity()`, `resolveTimeSkip()`, `wanderNear`/`startAction`/`beginGoSleep`/`beginCollapseSleep`, watchdogu ruchu.

## Weryfikacja

Techniczna (wykonana w tej sesji):

```
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Wszystkie zielone; 700/700 testów przechodzi (w tym 5 nowych przypadków `pickNeed critical mode`).

Ręczna/w przeglądarce: nieprzeprowadzona w żadnej sesji (agent jej nie wykonuje — patrz zasada w `CLAUDE.md`). Status ustawiony na `done` na wyraźną decyzję użytkownika (2026-08-14), mimo że scenariusz opisany wyżej (przyspieszyć czas, obserwować NPC w trakcie `goTo`/`execute`-work, którego pragnienie przekracza próg krytyczny — potwierdzić porzucenie pracy, dojście do wody, wypicie, i powrót do normalnego harmonogramu) nie został formalnie zweryfikowany w przeglądarce.
