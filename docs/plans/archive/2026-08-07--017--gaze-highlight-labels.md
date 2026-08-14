# Plan: Hover/gaze highlight na etykietach (NPC + zwierzęta)

**Status:** `done`
**Created:** 2026-08-07
**Scope:** [npc-labels.md](./2026-08-07--012--npc-labels.md), [npc-interactions.md](./2026-08-07--011--npc-interactions.md)

## Implementacja (2026-08-07, po quests-v2)

Zaimplementowane bezpośrednio na bazie generalizacji z [quests-v2-world-interactions.md](./2026-08-07--018--quests-v2-world-interactions.md) — `pickInGaze<T>` (`src/interaction/findInteractionTarget.ts`) już istniał, nie trzeba go było wydzielać od nowa.

- `setHighlighted(active: boolean)` dodane do `NpcAgent` (`src/ai/NpcAgent.ts`) i `AnimalAgent` (`src/fauna/AnimalAgent.ts`) — idempotentne (`if (this.highlighted === active) return`), `labelEl.classList.toggle('npc-label--highlighted', active)`.
- `.npc-label--highlighted` w `index.html` — **`box-shadow`, nie `border`** (świadoma zmiana względem szkicu w tym planie), żeby glow nigdy nie przesuwał layoutu/pozycji etykiety: dwuwarstwowy `box-shadow` (cienki jasny obrys 1px + rozmyta poświata), kolor ciepły bursztynowy (`rgba(255, 196, 92, ...)`), odróżnia się od niebieskiego akcentu reszty UI.
- `GAZE_RANGE = INTERACT_RANGE * 2` (5m) w `src/app/createApp.ts` — większy niż `INTERACT_RANGE`, tak jak zakładał ten plan.
- `tick()` w `createApp.ts`: `buildInteractables()` liczony raz na klatkę (reużyty przez picker interakcji **i** gaze-highlight — nie duplikujemy skanu); z tej samej listy filtrowane `kind==='npc'|'animal'` do osobnego `pickInGaze(..., GAZE_RANGE, ...)`; `setHighlight(next)` — helper trzymający `highlightedTarget`, toggle'uje tylko przy zmianie celu. Highlight czyszczony (`setHighlight(null)`) przy pauzie/otwartym dialogu/quest logu i na starcie `rebuildWorld()` (stare agenty i tak zaraz disposed).
- **Bez rozszerzenia na drzewa/studnię/spawnery/itemy** — mimo że `Interactable` (quests-v2) już je obejmuje, ten plan świadomie został przy pierwotnym zakresie (NPC + zwierzęta) — reszta nie ma stałych etykiet CSS2D poza spawnerami fauny, a dodawanie im etykiet tylko pod glow byłoby osobną decyzją projektową, nie tym planem.

## Done when

- [x] Etykieta NPC dostaje glow, gdy gracz patrzy w jego stronę w zasięgu `GAZE_RANGE`
- [x] To samo działa dla zwierząt (bez promptu/E — tylko wizualnie)
- [x] Highlight znika przy pauzie / otwartym dialogu/quest logu / gdy cel wypada z zasięgu lub kąta patrzenia
- [x] Przy kilku celach blisko siebie wygrywa jeden (ten sam `pickInGaze` co interakcja — najwyższy dot wygrywa) — bez migania
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` czyste
- [ ] Reszta: **verification needed** w przeglądarce

## Cel

Gdy gracz kieruje wzrok/kamerę w stronę NPC lub zwierzęcia, jego etykieta (`.npc-label`) powinna dostać wizualne wyróżnienie (border/glow) — feedback „na to właśnie patrzę / to jest interaktywne”, zanim jeszcze dojdzie do faktycznej interakcji (prompt „[E]” u NPC). To samo mechanicznie ma się dać rozszerzyć na przyszłe interakcje (drzewa, woda), gdy się pojawią.

## Stan obecny (dla kontekstu)

- **Etykiety:** [NpcAgent.ts](../../src/ai/NpcAgent.ts) i [AnimalAgent.ts](../../src/fauna/AnimalAgent.ts) tworzą każdy `labelEl: HTMLDivElement` z `className = 'npc-label'` (współdzielona klasa CSS, zdefiniowana inline w `index.html`), owinięty w `CSS2DObject`. Oba mają `readonly mesh: THREE.Object3D`.
- **Detekcja „na co gracz patrzy” już istnieje**, ale tylko dla NPC i tylko w kontekście interakcji: `findInteractionTarget()` w [createApp.ts](../../src/app/createApp.ts) (dystans ≤ `INTERACT_RANGE` 2.5m **i** `dot(playerForward, toNpc) > INTERACT_MIN_DOT`, wygrywa najwyższy dot). Wynik steruje promptem „[E] Rozmawiaj z {Imię}” w `npcDialog`.
- **Zwierzęta nie mają żadnej interakcji** — `AnimalAgent` to inny system (chase/flee), explicit poza zakresem w [npc-interactions.md](./2026-08-07--011--npc-interactions.md). Nie są dziś w ogóle brane pod uwagę w `findInteractionTarget`.
- Lista zwierząt: `fauna.getAgents(): AnimalAgent[]` z [createFauna.ts](../../src/fauna/createFauna.ts).
- Highlight ma być **czysto wizualny** dla zwierząt (bez promptu/E — to nie zmienia się w tym planie), a dla NPC — dodatkowa warstwa feedbacku *przed* pojawieniem się promptu interakcji.

## Zakres v1

1. **CSS** — nowa modifier-klasa w `index.html` (obok `.npc-label`), np. `.npc-label--highlighted`: border + glow (`box-shadow`), spójne z resztą stylu etykiet (ciemne tło, jasny tekst). Kolor do ustalenia przy implementacji (np. ciepły akcent, żeby odróżnić od reszty UI).
2. **`setHighlighted(active: boolean)`** — nowa publiczna metoda na `NpcAgent` i `AnimalAgent`, toggle'uje `labelEl.classList.toggle('npc-label--highlighted', active)`. Idempotentna (bez zbędnych DOM-writes, jeśli stan się nie zmienił).
3. **Generalizacja detekcji celu** — wydzielić z `findInteractionTarget` reużywalny helper (dystans + dot, „najwyższy dot wygrywa”) operujący na dowolnej liście obiektów z `mesh.position`, tak żeby jedna funkcja obsługiwała i NPC, i zwierzęta (i w przyszłości drzewa/wodę) bez duplikacji logiki.
4. **Gaze target per klatka** — w `tick()` w `createApp.ts`: policz najlepszy cel wśród **NPC + zwierzęta razem** (gracz patrzy na jedną rzecz naraz, niezależnie od typu). Śledź poprzedni highlighted target (`let currentHighlight`), przy zmianie: `setHighlighted(false)` na starym, `setHighlighted(true)` na nowym — unikamy przelatywania po wszystkich agentach co klatkę bez potrzeby.
5. **Zasięg highlightu** — osobna stała (np. `GAZE_RANGE`), **większa niż** `INTERACT_RANGE` (2.5m), żeby glow był widoczny jako zapowiedź zanim pojawi się prompt „[E]” u NPC (warstwowy feedback: glow z daleka → prompt z bliska). Dokładna wartość do dostrojenia w praniu (np. 2× `INTERACT_RANGE`).
6. **Pauza / dialog** — tak jak prompt interakcji: gdy `menuPaused` albo `npcDialog.isOpen()`, highlight powinien się czyścić (żeby nie zostawał „zamrożony” glow na tle).

## Poza zakresem v1

- Interakcje z drzewami/wodą — nie istnieją jeszcze jako obiekty w scenie z etykietą/promptem. Ten plan przygotowuje mechanizm (generalny helper), ale samo dodanie tych interakcji to osobny, przyszły plan.
- Zmiana zachowania zwierząt (chase/flee) albo dodanie im promptu/E — highlight zostaje czysto kosmetyczny na etykiecie.
- Highlight na graczu/kamerze (np. crosshair) — tylko etykiety celu.

## Szkic zmian (pliki)

```
index.html                # + .npc-label--highlighted (border/glow)
src/ai/NpcAgent.ts         # + setHighlighted(active: boolean)
src/fauna/AnimalAgent.ts   # + setHighlighted(active: boolean)
src/app/createApp.ts       # generalny helper (dystans+dot) reużyty przez findInteractionTarget
                            # i nowy gaze-target scan po NPC+zwierzętach; wire w tick()
```

## Otwarte pytania (rozstrzygnięte przy implementacji)

- Wygląd: sam glow (`box-shadow`, dwuwarstwowy), bez `border` — patrz "Implementacja" wyżej.
- `GAZE_RANGE = INTERACT_RANGE * 2` (5m) — nieprzetestowane w przeglądarce, może wymagać dostrojenia.

## Następne (poza tym planem)

- Interakcje z drzewami (ścinanie?) i wodą (nabieranie?) — użyją tego samego generalnego helpera do gaze-detekcji, gdy powstaną jako osobny plan.
