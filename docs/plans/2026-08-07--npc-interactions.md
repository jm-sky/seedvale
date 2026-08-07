# Plan: Interakcje gracz ↔ NPC

**Status:** `done`
**Created:** 2026-08-07
**Scope:** [ROADMAP.md](../ROADMAP.md) v0.4+ (questy), [game-ui-screens.md](./2026-08-07--game-ui-screens.md) (NPC dialog)

## Cel

Gracz obecnie tylko obserwuje NPC (etykieta imię + potrzeba nad głową, [npc-labels.md](./2026-08-07--npc-labels.md)). Chcemy pierwszy krok w stronę realnej interakcji: podejście + dialog. To baza pod przyszłe questy (v0.4+) i handel, nie finalny system dialogowy.

## Stan obecny (dla kontekstu)

- `NpcAgent` ([src/ai/NpcAgent.ts](../../src/ai/NpcAgent.ts)): FSM (`choose/chop/deposit/drink/eat/goX/wander`), needs z [Needs.ts](../../src/ai/Needs.ts) (`thirst/woodDuty/hunger` → `water/wood/food/idle`), CSS2D label `Imię · need`.
- Brak jakiejkolwiek reakcji NPC na obecność/input gracza. Brak raycastera w projekcie (`createApp.ts` ma tylko pointer-lock exit na Esc).
- Input: [Keyboard.ts](../../src/input/Keyboard.ts) — mapa `KeyCode → akcja` (`forward/backward/left/right/sprint`), łatwo rozszerzalna o np. `KeyE → interact`.
- UI overlay wzorzec: [createPauseMenu.ts](../../src/ui/createPauseMenu.ts) — DOM element w `parent`, `root.hidden` toggle, własny CSS (nie lil-gui). Ten sam wzorzec nadaje się pod dialog box.
- Brak bazy postaci (imiona są z hardcoded puli `NPC_NAMES`, bez cech charakteru) — wspomniana jako „potem” w [npc-labels.md](./2026-08-07--npc-labels.md).

## Zakres v1 (ten plan)

1. **Detekcja celu** — co klatkę policz dla każdego NPC w promieniu `INTERACT_RANGE` (np. 2.5m) `dot(playerForward, normalize(toNpc))`; kandydat wchodzi do gry tylko jeśli dot > próg (np. 0.5, ~±60°). Spośród kandydatów wygrywa najwyższy dot (czyli „na kogo gracz patrzy”, nie tylko najbliższy) — potrzebne przy gęstej zabudowie, gdzie kilku NPC może być w zasięgu jednocześnie.
2. **Prompt** — gdy jest cel: mały DOM overlay „[E] Rozmawiaj z {Imię}” (styl zbliżony do `npc-label`, ale osobny element — nie CSS2D, żeby nie migotać przy obrocie kamery). Znika, gdy cel wypadnie z zasięgu/kąta albo gracz jest w pauzie.
3. **Klawisz interakcji** — `KeyE` w [Keyboard.ts](../../src/input/Keyboard.ts) (nowa akcja `interact`, edge-triggered — reaguje na keydown, nie trzymanie).
4. **Dialog box** — prosty modal (wzorzec `createPauseMenu`): imię NPC + jedna losowa linijka tekstu zależna od `activeNeed`/`phase` **i** `personality`. Zamyka się na Esc / klik poza / ponowne E. **Zatrzymuje tick świata** (jak Esc-menu — NPC/dzień-noc/fauna też stają) — decyzja: prościej na start, rozluźnimy (żywy świat w tle) później jeśli zajdzie potrzeba.
5. **Lekki personality tag** — mała pula archetypów (np. `wesoły/zrzędliwy/spokojny/ciekawski`), przypisana każdemu NPC przy tworzeniu (podobnie jak `NPC_NAMES` — deterministycznie z indeksu, nie losowo przy każdym uruchomieniu, żeby postać była spójna między sesjami). Używana tylko do wyboru wariantu linijki dialogowej — bez wpływu na FSM/needs.
6. **Dialogue data + losowość** — tabela `need/phase × personality → string[]`, przy otwarciu dialogu losowy pick z puli dla danej kombinacji (fallback na wariant „neutralny”, jeśli dana kombinacja nie ma dedykowanych linii, żeby macierz nie musiała być pełna od razu).
7. **NpcAgent: eksponować stan do UI** — `personality` jako public/getter (jak `name`), `getDialogueLine(): string` który woła helper z (6) korzystając z aktualnego `activeNeed`/`phase`.

## Poza zakresem v1

- Drzewo dialogowe / wybory gracza (tylko jednostronna kwestia NPC na start).
- Quest hooks, handel, dawanie przedmiotów.
- Pełna baza postaci (backstory, relacje, unikalne imiona-cechy per postać) — lekki `personality` tag z punktu 5 to celowo tylko tyle, ile trzeba pod wariację dialogu; pełniejsza baza zostaje osobnym planem (wspomnianym w [npc-labels.md](./2026-08-07--npc-labels.md)).
- Interakcje z fauną (`AnimalAgent`) — inny system (chase/flee), nie dialog.
- Voice/audio.

## Decyzje (2026-08-07)

- **Pauza świata podczas dialogu:** tak, na start (zgodnie z rekomendacją) — jeśli po testach poczuje się zbyt sztywno, rozluźnimy w kolejnej iteracji.
- **Wybór NPC przy kilku w zasięgu:** dystans **i** kierunek patrzenia (dot product) — sam dystans zawodzi przy gęstej zabudowie wioski, gdzie kilka NPC może stać blisko siebie.
- **Treść kwestii:** od razu prosta losowość + personality (patrz punkty 5–6 wyżej), nie statyczny placeholder.
- **Plik UI:** nowy `src/ui/createNpcDialog.ts`, osobny od `createPauseMenu.ts`.

## Szkic zmian (pliki)

```
src/ai/dialogue.ts            # nowy: linie dialogowe (need/phase × personality), losowy pick + fallback
src/ai/NpcAgent.ts             # + personality (przypisany przy tworzeniu, jak name), + getDialogueLine()
src/input/Keyboard.ts         # + interact (KeyE), edge-triggered
src/ui/createNpcDialog.ts     # nowy: prompt overlay + dialog modal (wzorzec createPauseMenu)
src/app/createApp.ts          # orchestration: target selection (dystans+dot) per frame, wire interact
                               # key → dialog, pauza ticku świata podczas dialogu (spójnie z Esc-menu)
```

## Done when

- [x] Gracz patrzący na NPC w zasięgu widzi prompt „[E] Rozmawiaj z {Imię}”
- [x] E otwiera dialog z imieniem + losową kwestią zależną od need/phase i personality NPC
- [x] Esc / klik poza / ponowne E zamyka dialog, gracz odzyskuje kontrolę, tick świata wraca
- [x] Działa przy kilku NPC blisko siebie — wygrywa ten, na którego gracz patrzy, nie miga między nimi
- [x] Ta sama kombinacja need/personality daje różne linijki przy kolejnych otwarciach (widoczna losowość)
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` czyste
- [x] Reszta punktów: **verification needed** w przeglądarce (patrz sekcja „Do przetestowania” niżej)

## Do przetestowania (http://localhost:5577/)

1. Podejdź do dowolnego NPC w osadzie i popatrz na niego (kamera/ruch myszą) — powinien pojawić się dymek „[E] Rozmawiaj z {Imię}” na dole ekranu.
2. Odejdź lub odwróć się — prompt powinien zniknąć.
3. Wciśnij **E** gdy prompt widoczny — otwiera się okno dialogowe z imieniem i losową kwestią NPC (zależną od tego, co aktualnie robi: idzie po wodę/drewno/jedzenie, czy jest przy tym zajęty).
4. Podczas otwartego dialogu: NPC-e i cykl dnia/nocy powinny się **zatrzymać** (sprawdź np. czy inny NPC w tle przestaje chodzić).
5. Zamknij dialog: **Esc**, klik poza panelem, albo ponowne **E** — każde powinno działać, świat wraca do życia.
6. Sprawdź że **Esc przy otwartym dialogu NIE otwiera** menu pauzy — tylko zamyka dialog. Osobno: Esc bez otwartego dialogu nadal otwiera pauzę jak wcześniej.
7. Podejdź do miejsca gdzie 2+ NPC stoją blisko siebie (np. przy studni) — prompt powinien wskazywać tego, na którego faktycznie patrzysz, bez migania między nimi przy drobnych ruchach myszką.
8. Otwórz dialog z tym samym NPC kilka razy pod rząd (ten sam need) — linijka powinna się czasem zmieniać (losowość), nie być zawsze identyczna.
9. Sanity check regresji: ruch WASD, sprint (Shift), zoom kółkiem, pauza Esc + resume — dalej działają jak wcześniej.

## Następne (poza tym planem)

- Pełna baza postaci (backstory, relacje) → osobny plan, wspomniany w [npc-labels.md](./2026-08-07--npc-labels.md)
- v0.4 questy — nadbudowa nad tym dialogiem (opcje wyboru, quest state)
