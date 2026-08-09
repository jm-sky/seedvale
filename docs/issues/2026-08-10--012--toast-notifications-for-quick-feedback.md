# Krótkie akcje (zapalenie ogniska, znaleziona gałąź) niepotrzebnie blokują grę dialogiem

**Status:** `verification needed` — zaimplementowane 2026-08-10: nowy `src/ui/createToast.ts` (stos nieblokujących, znikających powiadomień w rogu ekranu). Zapalenie/dołożenie ogniska oraz błędy („potrzebujesz krzesiwa/gałęzi”) używają teraz toastu zamiast `npcDialog.open()`. Znalezienie bonusowej gałęzi pod drzewem pokazuje dodatkowy krótki toast `+1 Gałąź` obok istniejącej (niezmienionej) linii dialogu drzewa. Wymaga weryfikacji w przeglądarce.
**Created:** 2026-08-10
**Źródło:** zgłoszenie użytkownika

## Objaw / prośba

Część interakcji używa pełnego dialogu NPC-podobnego (`createNpcDialog.ts`, otwierany przez `npcDialog.open(speaker, line)`), który zatrzymuje sterowanie graczem i wymaga zamknięcia, tylko po to, żeby wyświetlić jednozdaniowy status. Przykład: zapalenie ogniska pokazuje „Ognisko zapłonęło.” w pełnym dialogu — gra nie musi się do tego zatrzymywać. Drugi problem: bonusowa gałąź znaleziona pod drzewem (`TREE_BRANCH_CHANCE`, `app/createApp.ts`) jest dopisywana jako dodatkowe zdanie do (i tak już długiej) linii dialogu drzewa — łatwo to przeoczyć, skoro trzeba przeczytać cały tekst.

## Naprawa

1. Nowy komponent `src/ui/createToast.ts` — stos nieblokujących powiadomień w rogu ekranu (wzorem `.seedvale-quick-actions__status`'owego timeout-patternu już używanego w tym kodzie, ale jako osobny, reużywalny system zamiast statusu przypiętego do jednego przycisku). `show(text, variant?)` dodaje toast, który sam znika po ok. 2.5s; wiele toastów stackuje się pionowo. Nie blokuje inputu — brak Escape/`isOpen()`, nie wchodzi do łańcucha gate'owania modali w `app/createApp.ts`.
2. `app/createApp.ts`'s obsługa `campfire` (rozpalenie/dołożenie/brak krzesiwa/brak gałęzi) używa teraz `toast.show(...)` zamiast `npcDialog.open('Ognisko', ...)` dla wszystkich czterech wyników — żaden z nich nie wymaga potwierdzenia/wyboru gracza, więc pełny dialog był tu zbędny. Ta sama zmiana objęła przy okazji komunikat „Ekwipunek jest za ciężki” (przekroczenie limitu wagi przy podnoszeniu) — identyczna kategoria (krótki status, zero potwierdzenia).
3. Bonusowa gałąź spod drzewa: linia dialogu drzewa (`resolveInteraction`) zostaje **bez zmian** (dalej pełny dialog z flavor line'em drzewa), ale dodatkowo pokazuje `toast.show('+1 Gałąź', 'pickup')` — krótki, natychmiast widoczny sygnał, niezależny od tego, czy gracz przeczyta cały tekst dialogu.

## Poza zakresem teraz

- Konwersja pozostałych `npcDialog.open()` (rozmowy z NPC, questy, studnia, drzewo, zwierzęta, spawnery) na toasty — te *są* właściwym miejscem na dłuższy tekst/wybór (`offer`/accept-decline), więc zostają pełnym dialogiem.
- Toast dla zwykłego podniesienia przedmiotu (`[E] Podnieś: X`) — HUD już aktualizuje wagę natychmiast, dodatkowy toast na każdy pickup byłby szumem; prośba dotyczyła konkretnie bonusowej gałęzi ukrytej w dłuższym tekście.
- Kolorowa kropka jako alternatywa dla toastu — wybrano toast z tekstem (`+1 Gałąź`), bo niesie więcej informacji przy podobnym koszcie wizualnym.
